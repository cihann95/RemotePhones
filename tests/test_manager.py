"""Unit tests for PhoneFarmManager.

All external dependencies (ADBClient, DeviceManager, JobQueue, TaskRunner)
are mocked at the class level so no real ADB or device connection is needed.
"""

from __future__ import annotations

import threading
from unittest.mock import MagicMock, patch

import pytest

from scheduler.manager import PhoneFarmManager
from scheduler.priority import Priority


# ── class-level mocks ──────────────────────────────────────────────────────────

# We patch where the symbols are *used* (scheduler.manager), not where they are
# defined, so that PhoneFarmManager.__init__ picks up the mocks.

MOCK_ADB = MagicMock(name="ADBClient")
MOCK_DM = MagicMock(name="DeviceManager")
MOCK_QUEUE = MagicMock(name="JobQueue")
MOCK_RUNNER = MagicMock(name="TaskRunner")
MOCK_REGISTRY = MagicMock(name="TaskRegistry")


@pytest.fixture(autouse=True)
def _patch_deps():
    """Patch all four core dependencies for every test in this module."""
    with patch("scheduler.manager.ADBClient", MOCK_ADB), \
         patch("scheduler.manager.DeviceManager", MOCK_DM), \
         patch("scheduler.manager.JobQueue", MOCK_QUEUE), \
         patch("scheduler.manager.TaskRunner", MOCK_RUNNER), \
         patch("scheduler.manager.TaskRegistry", MOCK_REGISTRY), \
         patch("scheduler.manager.register_all"):
        # Reset call records between tests
        for m in (MOCK_ADB, MOCK_DM, MOCK_QUEUE, MOCK_RUNNER, MOCK_REGISTRY):
            m.reset_mock()
        # Give each mock fresh instance returns so .dm, .queue, .runner, .registry
        # are distinct MagicMock objects per test
        MOCK_DM.return_value = MagicMock(name="dm_instance")
        MOCK_QUEUE.return_value = MagicMock(name="queue_instance")
        MOCK_RUNNER.return_value = MagicMock(name="runner_instance")
        MOCK_REGISTRY.return_value = MagicMock(name="registry_instance")
        yield


def _make_manager(**kwargs):
    """Create a PhoneFarmManager with a fresh mock ADBClient."""
    adb = MagicMock(name="adb_client")
    return PhoneFarmManager(adb, **kwargs)


# ── test cases ─────────────────────────────────────────────────────────────────


class TestInit:
    """PhoneFarmManager.__init__"""

    def test_default_auto_discover_true(self):
        mgr = _make_manager()
        assert mgr._auto_discover is True

    def test_auto_discover_false(self):
        mgr = _make_manager(auto_discover=False)
        assert mgr._auto_discover is False

    def test_components_initialized(self):
        mgr = _make_manager()
        # __init__ should have called the constructors for DM, Queue, Registry, Runner
        MOCK_DM.assert_called_once()
        MOCK_QUEUE.assert_called_once()
        MOCK_REGISTRY.assert_called_once()
        MOCK_RUNNER.assert_called_once()
        # ADB client stored as attribute
        assert mgr.adb is not None

    def test_lock_created(self):
        mgr = _make_manager()
        assert isinstance(mgr._lock, type(threading.Lock()))


class TestStartStop:
    """PhoneFarmManager start()/stop() lifecycle."""

    def test_start_registers_tasks_and_starts_runner(self):
        mgr = _make_manager(auto_discover=False)
        mgr.start()
        # _register_tasks calls register_all (patched)
        # runner.start() should have been called
        mgr.runner.start.assert_called_once()

    def test_start_auto_discover_calls_discover_register_connect(self):
        mgr = _make_manager(auto_discover=True)
        mgr.dm.discover.return_value = ["dev-1", "dev-2"]
        mgr.start()
        mgr.dm.discover.assert_called_once()
        assert mgr.dm.register.call_count == 2
        assert mgr.dm.connect.call_count == 2

    def test_start_no_discover_when_disabled(self):
        mgr = _make_manager(auto_discover=False)
        mgr.start()
        mgr.dm.discover.assert_not_called()

    def test_stop_calls_runner_stop(self):
        mgr = _make_manager()
        mgr.stop(timeout=3.0)
        mgr.runner.stop.assert_called_once_with(3.0)


class TestEnqueueTask:
    """PhoneFarmManager.enqueue_task()"""

    def test_enqueue_creates_job_in_queue(self):
        mgr = _make_manager()
        mgr.queue.enqueue.return_value = {"job_id": "call-abc12345", "status": "queued"}
        result = mgr.enqueue_task("call", "device-1", {"number": "+1234"}, Priority.HIGH)
        mgr.queue.enqueue.assert_called_once()
        call_args = mgr.queue.enqueue.call_args
        # job_id should start with the task name
        assert call_args[0][0].startswith("call-")
        assert call_args[1]["priority"] == Priority.HIGH
        payload = call_args[1]["payload"]
        assert payload["task"] == "call"
        assert payload["device_id"] == "device-1"
        assert payload["params"] == {"number": "+1234"}

    def test_enqueue_default_priority(self):
        mgr = _make_manager()
        mgr.queue.enqueue.return_value = {"job_id": "ok-abc", "status": "queued"}
        mgr.enqueue_task("ok_task", "dev-1")
        call_args = mgr.queue.enqueue.call_args
        assert call_args[1]["priority"] == Priority.NORMAL


class TestRunOnDevice:
    """PhoneFarmManager.run_on_device()"""

    def test_run_on_device_enqueues_steps(self):
        mgr = _make_manager()
        mgr.queue.enqueue.return_value = {"job_id": "x", "status": "queued"}
        steps = [
            {"task": "call", "params": {"number": "+1"}},
            {"task": "hangup"},
        ]
        results = mgr.run_on_device("dev-1", steps)
        assert len(results) == 2
        assert mgr.queue.enqueue.call_count == 2

    def test_run_on_device_empty_steps(self):
        mgr = _make_manager()
        results = mgr.run_on_device("dev-1", [])
        assert results == []
        mgr.queue.enqueue.assert_not_called()


class TestStatusSummary:
    """PhoneFarmManager.status_summary()"""

    def test_status_summary_returns_expected_keys(self):
        mgr = _make_manager()
        mgr.dm.all_devices = {"dev-1": {"status": "online"}, "dev-2": {"status": "offline"}}
        mgr.dm.online_devices = ["dev-1"]
        mgr.queue.qsize.return_value = 3
        mgr.registry.names = ["call", "hangup"]
        mgr.runner._running = True

        summary = mgr.status_summary()
        assert summary["devices"]["total"] == 2
        assert summary["devices"]["online"] == 1
        assert summary["queue"]["pending"] == 3
        assert summary["queue"]["tasks"] == ["call", "hangup"]
        assert summary["runner_running"] is True


class TestContextManager:
    """PhoneFarmManager __enter__/__exit__ protocol."""

    def test_context_manager_calls_start_and_stop(self):
        mgr = _make_manager(auto_discover=False)
        with mgr:
            mgr.runner.start.assert_called_once()
        mgr.runner.stop.assert_called_once()

    def test_context_manager_yields_self(self):
        mgr = _make_manager(auto_discover=False)
        with mgr as ctx:
            assert ctx is mgr


class TestManagerProtocol:
    """PhoneFarmManager ManagerProtocol methods."""

    def test_get_devices_returns_online_ids(self):
        mgr = _make_manager()
        mgr.dm.all_devices = {
            "dev-1": {"status": "online"},
            "dev-2": {"status": "offline"},
            "dev-3": {"status": "online"},
        }
        devices = mgr.get_devices()
        assert sorted(devices) == ["dev-1", "dev-3"]

    def test_run_task_returns_true_on_success(self):
        mgr = _make_manager()
        mgr.queue.enqueue.return_value = {"job_id": "call-abc", "status": "queued"}
        result = mgr.run_task("call", "dev-1")
        assert result is True

    def test_run_task_returns_false_when_no_job_id(self):
        mgr = _make_manager()
        mgr.queue.enqueue.return_value = {"status": "error"}
        result = mgr.run_task("call", "dev-1")
        assert result is False
