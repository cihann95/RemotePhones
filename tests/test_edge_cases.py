"""Tests for edge case handling in core.adb, scheduler.runner, and core.phone."""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch, call
import subprocess

from core.adb import (
    ADBClient, ADBError, DeviceDisconnectedError, DeviceOfflineError,
    DeviceUnauthorizedError, LowStorageError, ADBTimeoutError,
    ADBServerDownError, ADBInstallError, ADBPullError, ADBPushError
)
from scheduler.runner import TaskRunner
from scheduler.job_queue import JobStatus
from scheduler.priority import Priority
from core.phone import PhoneOperations


class TestADBEdgeCases:
    def setup_method(self):
        self.adb = ADBClient(max_retries=1, retry_delay=0)

    @patch("subprocess.run")
    def test_install_failure_raises_adb_install_error(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="Failure [INSTALL_FAILED_ALREADY_EXISTS]"
        )
        with pytest.raises(ADBInstallError) as exc_info:
            self.adb.install("/path/to/app.apk", device_id="dev-1")
        assert "INSTALL_FAILED_ALREADY_EXISTS" in str(exc_info.value)

    @patch("subprocess.run")
    def test_pull_failure_raises_adb_pull_error(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="remote object '/sdcard/missing.txt' does not exist"
        )
        with pytest.raises(ADBPullError) as exc_info:
            self.adb.pull("/sdcard/missing.txt", "local.txt", device_id="dev-1")
        assert "does not exist" in str(exc_info.value)

    @patch("subprocess.run")
    def test_push_failure_raises_adb_push_error(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="failed to copy 'local.txt' to '/sdcard/': Permission denied"
        )
        with pytest.raises(ADBPushError) as exc_info:
            self.adb.push("local.txt", "/sdcard/", device_id="dev-1")
        assert "Permission denied" in str(exc_info.value)


class TestRunnerEdgeCases:
    @pytest.fixture(autouse=True)
    def _setup(self, isolated_job_queue):
        self.queue = isolated_job_queue
        self.registry = MagicMock()
        self.device_manager = MagicMock()
        self.runner = TaskRunner(
            queue=self.queue,
            registry=self.registry,
            device_manager=self.device_manager
        )

    def test_execute_handles_keyboard_interrupt_gracefully(self):
        self.queue.enqueue("job-ki", priority=Priority.NORMAL, payload={"task": "mock_task", "device_id": "dev-1"})
        
        def mock_handler(**kwargs):
            raise KeyboardInterrupt("Simulated interrupt")
        
        self.registry.get.return_value = mock_handler
        
        with pytest.raises(KeyboardInterrupt):
            self.runner.run_once()
            
        self.device_manager.release_device.assert_called_with("dev-1")

    def test_execute_handles_system_exit_gracefully(self):
        self.queue.enqueue("job-se", priority=Priority.NORMAL, payload={"task": "mock_task", "device_id": "dev-1"})
        
        def mock_handler(**kwargs):
            raise SystemExit("Simulated exit")
        
        self.registry.get.return_value = mock_handler
        
        with pytest.raises(SystemExit):
            self.runner.run_once()
            
        self.device_manager.release_device.assert_called_with("dev-1")

    def test_execute_handles_missing_task_in_payload(self):
        self.queue.enqueue("job-mt", priority=Priority.NORMAL, payload={"device_id": "dev-1"})
        
        self.runner.run_once()
        
        status = self.queue.get_status("job-mt")
        assert status["status"] == JobStatus.FAILED
        assert "No handler for" in status["error"]


class TestPhoneEdgeCases:
    def setup_method(self):
        self.adb = MagicMock()
        self.phone = PhoneOperations(self.adb)

    def test_read_csv_string_empty_data(self):
        result = PhoneOperations.read_csv_string("")
        assert result["numbers"] == []
        assert "CSV data is empty" in result["warnings"]

    def test_read_csv_string_missing_number_column(self):
        csv_data = "name,age\nAli,30"
        result = PhoneOperations.read_csv_string(csv_data)
        assert result["numbers"] == []
        assert "CSV missing required 'number' column" in result["warnings"]

    def test_read_csv_numbers_missing_number_column(self, tmp_path):
        csv_path = tmp_path / "bad.csv"
        csv_path.write_text("name,age\nAli,30")
        result = PhoneOperations.read_csv_numbers(str(csv_path))
        assert result["numbers"] == []
        assert "CSV missing required 'number' column" in result["warnings"]

    def test_safe_shell_catches_device_disconnected(self):
        self.adb.shell_output.side_effect = DeviceDisconnectedError("Device disconnected")
        out, ok = self.phone._safe_shell("dumpsys telephony.registry", device_id="dev-1")
        assert out == ""
        assert ok is False

    def test_safe_shell_catches_adb_timeout(self):
        self.adb.shell_output.side_effect = ADBTimeoutError("Timeout")
        out, ok = self.phone._safe_shell("dumpsys telephony.registry", device_id="dev-1")
        assert out == ""
        assert ok is False
