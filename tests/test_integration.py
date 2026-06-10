"""
Integration smoke-test — end-to-end runner with mocks.

No physical device required.  All external calls are mocked.

Handlers registered in the registry are plain callables (not BaseTask instances)
because the runner dispatches via ``result = handler(payload)``.  This keeps the
test independent of any infrastructure concerns.
"""

from __future__ import annotations

import time

import pytest

from core.adb import ADBClient
from core.device_manager import DeviceManager
from scheduler.job_queue import JobQueue, JobStatus
from scheduler.priority import Priority
from scheduler.runner import TaskRunner
from scheduler.manager import PhoneFarmManager
from tasks.registry import TaskRegistry


# ── mock helpers ──────────────────────────────────────────────────────────────


def make_mock_adb():
    pytest.importorskip("unittest.mock")
    from unittest.mock import MagicMock
    m = MagicMock(spec=ADBClient)
    m.devices.return_value = ["mock-device-1"]
    m.shell_output.return_value = "Pixel 6\n13\nGoogle"
    m.shell_output.return_value = "ok"
    return m


def register(registry: TaskRegistry, name: str, fn: object) -> None:
    registry._tasks[name] = fn


# ── shared fixtures / helpers ────────────────────────────────────────────────


class _OkHandler:
    """Always-OK callable matching the runner's ``handler(payload)`` contract."""
    name = "ok_task"

    def __call__(self, payload: dict) -> dict:
        return {"ok": True, "data": {"device_id": payload.get("device_id")}}


class _FlakyHandler:
    """Succeeds only on the 3rd call."""
    name = "flaky"
    count = 0

    def __call__(self, payload: dict) -> dict:
        _FlakyHandler.count += 1
        if _FlakyHandler.count < 2:
            return {"error": "transient"}
        return {"ok": True, "data": {"attempts": _FlakyHandler.count}}


class _BrokenHandler:
    """Always fails beyond recovery."""
    name = "broken"
    count = 0

    def __call__(self, payload: dict) -> dict:
        _BrokenHandler.count += 1
        return {"error": "always fails"}


# ── test cases ────────────────────────────────────────────────────────────────


class TestIntegrationSmoke:

    def make_mgr(self, queue: JobQueue | None = None) -> PhoneFarmManager:
        adb = make_mock_adb()
        mgr = PhoneFarmManager(adb, auto_discover=True)
        if queue is not None:
            mgr.queue = queue
            mgr.runner.queue = queue
        mgr.start()
        return mgr

    # ── local runner helpers ──────────────────────────────────────────────────

    def _make_runner(self, registry: TaskRegistry,
                     max_retries: int = 0,
                     queue: JobQueue | None = None) -> TaskRunner:
        adb = make_mock_adb()
        dm = DeviceManager(adb)
        dm.connect("mock-device-1")
        if queue is None:
            q = JobQueue(db_path=":memory:", max_retries=max_retries, retry_delay_s=0.02)
        else:
            q = queue
        return TaskRunner(queue=q, registry=registry)

    # ── synchronous run_once ─────────────────────────────────────────────────

    def test_runner_drains_ok_task(self, isolated_job_queue):
        registry = TaskRegistry()
        register(registry, "ok_task", _OkHandler())
        runner = self._make_runner(registry, queue=isolated_job_queue)

        runner.queue.enqueue(
            "ok_task", priority=Priority.URGENT,
            payload={"task": "ok_task", "device_id": "mock-device-1", "params": {}},
        )
        result = runner.run_once()          # blocks until processed

        assert result is not None
        st = runner.queue.get_status("ok_task")
        assert st is not None
        assert st["status"] == JobStatus.COMPLETED

    # ── background thread runner ───────────────────────────────────────────────

    def test_bg_runner_drains_queue(self, isolated_job_queue):
        """Background runner empties the queue within the timeout."""
        mgr = self.make_mgr(queue=isolated_job_queue)
        from tasks.concrete import register_all
        register_all(mgr.registry)
        register(mgr.registry, "ok_task", _OkHandler())

        mgr.queue.enqueue(
            "ok_task", priority=Priority.NORMAL,
            payload={"task": "ok_task", "device_id": "mock-device-1", "params": {}},
        )

        deadline = time.time() + 5
        while time.time() < deadline:
            st = mgr.queue.get_status("ok_task")
            if st and st["status"] == JobStatus.COMPLETED:
                break
            time.sleep(0.05)

        mgr.stop(timeout=2)
        st = mgr.queue.get_status("ok_task")
        assert st is not None, "Job should have been completed by background runner"
        assert st["status"] == JobStatus.COMPLETED

    # ── retry → success ───────────────────────────────────────────────────────

    def test_retry_before_complete(self):
        """Job fails, is retried, then succeeds."""
        adb = make_mock_adb()
        dm = DeviceManager(adb)
        dm.connect("mock-device-1")
        registry = TaskRegistry()
        flaky = _FlakyHandler()
        register(registry, "flaky", flaky)
        q = JobQueue(db_path=":memory:", max_retries=2, retry_delay_s=0.05)
        runner = TaskRunner(queue=q, registry=registry)
        runner.start(daemon=True)

        q.enqueue("flaky", priority=Priority.NORMAL,
                  payload={"task": "flaky", "device_id": "mock-device-1", "params": {}})

        deadline = time.time() + 5
        while time.time() < deadline:
            st = q.get_status("flaky")
            if st and st["status"] == JobStatus.COMPLETED:
                break
            time.sleep(0.1)

        runner.stop(timeout=2)
        st = q.get_status("flaky")
        assert st is not None, "Record should exist after Final outcome"
        assert st["status"] == JobStatus.COMPLETED, (
            f"Expected COMPLETED, got {st['status']!r}"
        )
        assert _FlakyHandler.count == 2

    # ── fail-all-retries → FAILED ─────────────────────────────────────────────

    def test_fail_all_retries_marks_failed(self):
        """Runner exhausts all retries, job ends FAILED."""
        adb = make_mock_adb()
        dm = DeviceManager(adb)
        dm.connect("mock-device-1")
        registry = TaskRegistry()
        broken = _BrokenHandler()
        register(registry, "broken", broken)
        q = JobQueue(db_path=":memory:", max_retries=1, retry_delay_s=0.02)
        runner = TaskRunner(queue=q, registry=registry)
        runner.start(daemon=True)

        q.enqueue("broken", priority=Priority.NORMAL,
                  payload={"task": "broken", "device_id": "mock-device-1", "params": {}})

        # Wait for retry delay + 2 execution cycles
        time.sleep(2.5)
        runner.stop(timeout=2)

        st = q.get_status("broken")
        assert st is not None, "Record should exist after FAILED"
        assert st["status"] == JobStatus.FAILED, (
            f"Expected FAILED, got {st['status']!r}"
        )
        assert st["retries"] >= 1

    # ── manager status_summary ─────────────────────────────────────────────────

    def test_manager_status_summary_keys(self):
        mgr = self.make_mgr()
        try:
            s = mgr.status_summary()
            assert "devices" in s
            assert "total" in s["devices"]
            assert "online" in s["devices"]
            assert "queue" in s
            assert "tasks" in s["queue"]
            assert "runner_running" in s
            assert s["runner_running"] is True
        finally:
            mgr.stop(timeout=2)