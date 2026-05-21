"""
Integration test — `PhoneFarmManager.run_on_device()` end-to-end with mocks.

Covers the concrete task paths: enqueue → runner dispatches → task executes
→ job reaches COMPLETED.  No physical device is required.
"""

from __future__ import annotations

import time

import pytest

from core.adb import ADBClient
from core.device_manager import DeviceManager
from scheduler.manager import PhoneFarmManager
from scheduler.priority import Priority


# ── mock helpers ──────────────────────────────────────────────────────────────


def make_mock_adb():
    from unittest.mock import MagicMock
    m = MagicMock(spec=ADBClient)
    m.devices.return_value = ["mock-device-1"]
    m.shell_output.return_value = "ok"
    return m


# ── helpers ───────────────────────────────────────────────────────────────────


class _WaitHelper:

    @staticmethod
    def wait_status(queue, job_id: str, expected: str, timeout: float = 10.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            st = queue.get_status(job_id)
            if st and st.get("status") == expected:
                return st
            time.sleep(0.1)
        return None


# ── test cases ────────────────────────────────────────────────────────────────


class TestRunOnDevice:

    def make_mgr(self):
        adb = make_mock_adb()
        mgr = PhoneFarmManager(adb, auto_discover=True)
        mgr.start()
        return mgr

    wh = _WaitHelper  # shortcut

    # ── app_launch step ───────────────────────────────────────────────────────

    def test_run_on_device_app_launch(self):
        """run_on_device enqueues an app_launch step; runner processes it."""
        mgr = self.make_mgr()
        try:
            steps = [
                {
                    "task": "app_launch",
                    "params": {"package_name": "com.example.app"},
                    "priority": Priority.NORMAL,
                }
            ]
            mgr.run_on_device("mock-device-1", steps, sequential=False)
            st = self.wh.wait_status(mgr.queue, "app_launch", "completed")
            assert st is not None, "app_launch should be completed"
            assert st["status"] == "completed"
        finally:
            mgr.stop(timeout=2)

    # ── screenshot step ───────────────────────────────────────────────────────

    def test_run_on_device_screenshot(self):
        """run_on_device enqueues a screenshot step; runner processes it."""
        mgr = self.make_mgr()
        try:
            steps = [
                {
                    "task": "screenshot",
                    "params": {"remote": "/sdcard/test_screen.png"},
                    "priority": Priority.NORMAL,
                }
            ]
            mgr.run_on_device("mock-device-1", steps, sequential=False)
            st = self.wh.wait_status(mgr.queue, "screenshot", "completed")
            assert st is not None, "screenshot should be completed"
            assert st["status"] == "completed"
        finally:
            mgr.stop(timeout=2)

    # ── multiple steps ────────────────────────────────────────────────────────

    def test_run_on_device_multiple_steps(self):
        """Multiple steps enqueued at once; runner processes each one."""
        mgr = self.make_mgr()
        try:
            steps = [
                {"task": "app_launch",  "params": {"package_name": "com.a"}},
                {"task": "screenshot",  "params": {"remote": "/sdcard/a.png"}},
                {"task": "screenshot",  "params": {"remote": "/sdcard/b.png"}},
            ]
            results = mgr.run_on_device("mock-device-1", steps, sequential=False)
            assert len(results) == 3
            for rec in results:
                jid = rec["job_id"]
                st = self.wh.wait_status(mgr.queue, jid, "completed", timeout=15)
                assert st is not None, f"Job {jid} should be completed"
                assert st["status"] == "completed"
        finally:
            mgr.stop(timeout=2)

    # ── swipe_sequence step ───────────────────────────────────────────────────

    def test_run_on_device_swipe_sequence(self):
        """run_on_device processes a swipe_sequence step with multiple swipes."""
        mgr = self.make_mgr()
        try:
            steps = [
                {
                    "task": "swipe_sequence",
                    "params": {"count": 2, "delay_s": 0.01},
                    "priority": Priority.LOW,
                }
            ]
            mgr.run_on_device("mock-device-1", steps, sequential=False)
            st = self.wh.wait_status(mgr.queue, "swipe_sequence", "completed", timeout=15)
            assert st is not None, "swipe_sequence should complete"
            assert st["status"] == "completed"
        finally:
            mgr.stop(timeout=2)

    # ── app_install step ───────────────────────────────────────────────────────

    def test_run_on_device_app_install(self):
        """run_on_device processes an app_install step (APK path mocked)."""
        mgr = self.make_mgr()
        try:
            steps = [
                {
                    "task": "app_install",
                    "params": {"apk_path": "/tmp/fake_app.apk"},
                    "priority": Priority.NORMAL,
                }
            ]
            results = mgr.run_on_device("mock-device-1", steps, sequential=False)
            assert len(results) == 1
            st = self.wh.wait_status(mgr.queue, "app_install", "completed", timeout=15)
            assert st is not None, "app_install should be completed"
        finally:
            mgr.stop(timeout=2)

    # ── run_on_device with unknown task ────────────────────────────────────────

    def test_run_on_device_unknown_task_fails(self):
        """run_on_device enqueues an unknown task; runner marks it FAILED."""
        mgr = self.make_mgr()
        try:
            # Use max_retries=0 so the job fails fast (no retry delays).
            mgr.queue.max_retries = 0
            steps = [{"task": "no_such_task", "params": {}}]
            results = mgr.run_on_device("mock-device-1", steps, sequential=False)
            assert len(results) == 1
            st = self.wh.wait_status(mgr.queue, "no_such_task", "failed", timeout=10)
            assert st is not None, "Job should have been processed (and failed)"
            assert st["status"] == "failed"
        finally:
            mgr.stop(timeout=2)
