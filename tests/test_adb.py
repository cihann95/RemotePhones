"""Tests for core.adb — ADBClient, _resolve_adb_path, error classification, retry logic."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from core.adb import (
    ADBClient,
    ADBError,
    ADBInstallError,
    ADBPullError,
    ADBPushError,
    ADBServerDownError,
    ADBTimeoutError,
    DeviceDisconnectedError,
    DeviceOfflineError,
    DeviceUnauthorizedError,
    LowStorageError,
    _resolve_adb_path,
)


# ── _resolve_adb_path ─────────────────────────────────────────────────────────


class TestResolveAdbPath:
    """Tests for the _resolve_adb_path helper."""

    @patch("core.adb.os.path.isfile", return_value=True)
    def test_env_override_used_when_file_exists(self, mock_isfile):
        with patch.dict(os.environ, {"PHONE_FARM_ADB_PATH": "/custom/adb"}):
            assert _resolve_adb_path() == "/custom/adb"

    @patch("core.adb.Path.is_file", return_value=False)
    @patch("core.adb.os.path.isfile", return_value=False)
    def test_env_override_ignored_when_file_missing(self, mock_isfile, mock_path_is_file):
        with patch.dict(os.environ, {"PHONE_FARM_ADB_PATH": "/nonexistent/adb"}, clear=False):
            # Falls through to bare "adb"
            result = _resolve_adb_path()
            assert result == "adb"

    @patch("core.adb.Path.is_file", return_value=False)
    @patch("core.adb.os.path.isfile", return_value=False)
    def test_falls_back_to_bare_adb(self, mock_isfile, mock_path_is_file):
        with patch.dict(os.environ, {}, clear=True):
            result = _resolve_adb_path()
            assert result == "adb"

    @patch("core.adb.os.path.isfile", return_value=True)
    def test_pyinstaller_bundle_path(self, mock_isfile):
        fake_meipass = "/tmp/_MEI123"
        with patch.dict(os.environ, {}, clear=True):
            with patch("core.adb.sys") as mock_sys:
                mock_sys._MEIPASS = fake_meipass
                result = _resolve_adb_path()
                assert str(result).endswith(os.path.join("tools", "adb", "adb.exe"))


# ── __init__ ───────────────────────────────────────────────────────────────────


class TestInit:
    """Tests for ADBClient.__init__."""

    @patch("core.adb._resolve_adb_path", return_value="adb")
    def test_default_adb_path(self, mock_resolve):
        client = ADBClient()
        assert client.adb_path == "adb"
        assert client.default_device is None
        assert client.max_retries == 3
        assert client.retry_delay == 1.0

    @patch("core.adb.os.path.isfile", return_value=True)
    def test_custom_adb_path_when_file_exists(self, mock_isfile):
        client = ADBClient(adb_path="/usr/local/bin/adb")
        assert client.adb_path == "/usr/local/bin/adb"

    @patch("core.adb.os.path.isfile", return_value=False)
    @patch("core.adb._resolve_adb_path", return_value="adb")
    def test_custom_adb_path_ignored_when_file_missing(self, mock_resolve, mock_isfile):
        client = ADBClient(adb_path="/nonexistent/adb")
        assert client.adb_path == "adb"

    @patch("core.adb._resolve_adb_path", return_value="adb")
    def test_custom_device_and_retries(self, mock_resolve):
        client = ADBClient(default_device="emulator-5554", max_retries=5, retry_delay=0.5)
        assert client.default_device == "emulator-5554"
        assert client.max_retries == 5
        assert client.retry_delay == 0.5


# ── _device_prefix ─────────────────────────────────────────────────────────────


class TestDevicePrefix:
    @patch("core.adb._resolve_adb_path", return_value="adb")
    def test_explicit_device_id(self, mock_resolve):
        client = ADBClient()
        assert client._device_prefix("device-1") == ["adb", "-s", "device-1"]

    @patch("core.adb._resolve_adb_path", return_value="adb")
    def test_default_device(self, mock_resolve):
        client = ADBClient(default_device="default-dev")
        assert client._device_prefix() == ["adb", "-s", "default-dev"]

    @patch("core.adb._resolve_adb_path", return_value="adb")
    def test_no_device(self, mock_resolve):
        client = ADBClient()
        assert client._device_prefix() == ["adb"]

    @patch("core.adb._resolve_adb_path", return_value="adb")
    def test_explicit_overrides_default(self, mock_resolve):
        client = ADBClient(default_device="default-dev")
        assert client._device_prefix("other-dev") == ["adb", "-s", "other-dev"]


# ── devices() ──────────────────────────────────────────────────────────────────


class TestDevices:
    """Tests for ADBClient.devices() parsing."""

    @patch("core.adb._resolve_adb_path", return_value="adb")
    def _make_client(self, mock_resolve):
        return ADBClient()

    def test_empty_devices(self):
        client = self._make_client()
        mock_result = MagicMock()
        mock_result.stdout = "List of devices attached\n"
        mock_result.returncode = 0
        mock_result.stderr = ""
        with patch("core.adb.subprocess.run", return_value=mock_result):
            assert client.devices() == []

    def test_single_device(self):
        client = self._make_client()
        mock_result = MagicMock()
        mock_result.stdout = "List of devices attached\nemulator-5554\tdevice\n"
        mock_result.returncode = 0
        mock_result.stderr = ""
        with patch("core.adb.subprocess.run", return_value=mock_result):
            assert client.devices() == ["emulator-5554"]

    def test_multiple_devices(self):
        client = self._make_client()
        mock_result = MagicMock()
        mock_result.stdout = (
            "List of devices attached\n"
            "emulator-5554\tdevice\n"
            "ABCD1234\tdevice\n"
            "device-3\tdevice\n"
        )
        mock_result.returncode = 0
        mock_result.stderr = ""
        with patch("core.adb.subprocess.run", return_value=mock_result):
            assert client.devices() == ["emulator-5554", "ABCD1234", "device-3"]

    def test_offline_and_unauthorized_excluded(self):
        client = self._make_client()
        mock_result = MagicMock()
        mock_result.stdout = (
            "List of devices attached\n"
            "emulator-5554\tdevice\n"
            "offline-dev\toffline\n"
            "unauth-dev\tunauthorized\n"
        )
        mock_result.returncode = 0
        mock_result.stderr = ""
        with patch("core.adb.subprocess.run", return_value=mock_result):
            assert client.devices() == ["emulator-5554"]


# ── shell() ────────────────────────────────────────────────────────────────────


class TestShell:
    @patch("core.adb._resolve_adb_path", return_value="adb")
    def test_shell_returns_cmdline(self, mock_resolve):
        client = ADBClient()
        result = client.shell(device_id="dev-1")
        assert "adb" in result
        assert "-s" in result
        assert "dev-1" in result
        assert "shell" in result

    @patch("core.adb._resolve_adb_path", return_value="adb")
    def test_shell_no_device(self, mock_resolve):
        client = ADBClient()
        result = client.shell()
        assert "adb" in result
        assert "-s" not in result


# ── tap / swipe / screencap ────────────────────────────────────────────────────


class TestDeviceActions:
    def setup_method(self):
        self._patcher = patch.object(ADBClient, "_run")
        self.mock_run = self._patcher.start()
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            self.client = ADBClient()

    def teardown_method(self):
        self._patcher.stop()

    def test_tap(self):
        self.client.tap(100, 200, device_id="dev-1")
        self.mock_run.assert_called_once_with(
            ["shell", "input", "tap", "100", "200"], device_id="dev-1"
        )

    def test_swipe(self):
        self.client.swipe(0, 0, 500, 1000, duration_ms=200, device_id="dev-1")
        self.mock_run.assert_called_once_with(
            ["shell", "input", "swipe", "0", "0", "500", "1000", "200"],
            device_id="dev-1",
        )

    def test_screencap(self):
        self.client.screencap("/sdcard/screen.png", device_id="dev-1")
        self.mock_run.assert_called_once_with(
            ["shell", "screencap", "-p", "/sdcard/screen.png"], device_id="dev-1"
        )

    def test_pull(self):
        self.client.pull("/sdcard/file.txt", "/tmp/file.txt", device_id="dev-1")
        self.mock_run.assert_called_once_with(
            ["pull", "/sdcard/file.txt", "/tmp/file.txt"], device_id="dev-1"
        )

    def test_push(self):
        self.client.push("/tmp/file.txt", "/sdcard/file.txt", device_id="dev-1")
        self.mock_run.assert_called_once_with(
            ["push", "/tmp/file.txt", "/sdcard/file.txt"], device_id="dev-1"
        )

    def test_install(self):
        self.client.install("/path/to/app.apk", device_id="dev-1")
        self.mock_run.assert_called_once_with(
            ["install", "-r", "/path/to/app.apk"], device_id="dev-1"
        )

    def test_uninstall(self):
        self.client.uninstall("com.example.app", device_id="dev-1")
        self.mock_run.assert_called_once_with(
            ["uninstall", "com.example.app"], device_id="dev-1"
        )

    def test_launch(self):
        self.client.launch("com.example.app", ".MainActivity", device_id="dev-1")
        self.mock_run.assert_called_once_with(
            ["shell", "am", "start", "-n", "com.example.app/.MainActivity"],
            device_id="dev-1",
        )


# ── shell_output() ─────────────────────────────────────────────────────────────


class TestShellOutput:
    def setup_method(self):
        self._patcher = patch.object(ADBClient, "_run")
        self.mock_run = self._patcher.start()
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            self.client = ADBClient()

    def teardown_method(self):
        self._patcher.stop()

    def test_shell_output_success(self):
        self.mock_run.return_value = "hello world"
        result = self.client.shell_output("echo hello world", device_id="dev-1")
        assert result == "hello world"
        self.mock_run.assert_called_once_with(
            ["shell", "echo hello world"], device_id="dev-1", timeout=30
        )

    def test_shell_output_custom_timeout(self):
        self.mock_run.return_value = "ok"
        self.client.shell_output("ls", device_id="dev-1", timeout=60)
        self.mock_run.assert_called_once_with(
            ["shell", "ls"], device_id="dev-1", timeout=60
        )

    def test_shell_output_error_propagates(self):
        self.mock_run.side_effect = DeviceDisconnectedError("gone")
        with pytest.raises(DeviceDisconnectedError, match="gone"):
            self.client.shell_output("ls", device_id="dev-1")


# ── run_command() ──────────────────────────────────────────────────────────────


class TestRunCommand:
    def setup_method(self):
        self._patcher = patch.object(ADBClient, "_run")
        self.mock_run = self._patcher.start()
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            self.client = ADBClient()

    def teardown_method(self):
        self._patcher.stop()

    def test_run_command_delegates(self):
        self.mock_run.return_value = "output"
        result = self.client.run_command(["shell", "pm", "list", "packages"], device_id="dev-1")
        assert result == "output"
        self.mock_run.assert_called_once_with(
            ["shell", "pm", "list", "packages"], device_id="dev-1", timeout=30
        )

    def test_run_command_custom_timeout(self):
        self.mock_run.return_value = "ok"
        self.client.run_command(["devices"], timeout=10)
        self.mock_run.assert_called_once_with(["devices"], device_id=None, timeout=10)


# ── _run() error classification ────────────────────────────────────────────────


class TestRunErrorClassification:
    """Tests for _run() classifying stderr into specific error types."""

    def _make_client(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            return ADBClient(max_retries=1)

    def _mock_subprocess_error(self, stderr_text, returncode=1):
        mock_result = MagicMock()
        mock_result.stdout = ""
        mock_result.stderr = stderr_text
        mock_result.returncode = returncode
        return mock_result

    def test_device_offline_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("error: device offline")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(DeviceOfflineError):
                client._run(["shell", "echo", "hi"])

    def test_device_unauthorized_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("error: unauthorized")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(DeviceUnauthorizedError):
                client._run(["shell", "echo", "hi"])

    def test_device_disconnected_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("error: device not found")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(DeviceDisconnectedError):
                client._run(["shell", "echo", "hi"])

    def test_no_devices_found_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("error: no devices/emulators found")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(DeviceDisconnectedError):
                client._run(["shell", "echo", "hi"])

    def test_low_storage_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("error: no space left on device")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(LowStorageError):
                client._run(["shell", "echo", "hi"])

    def test_insufficient_storage_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("Error: insufficient storage")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(LowStorageError):
                client._run(["shell", "echo", "hi"])

    def test_adb_install_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(ADBInstallError):
                client._run(["install", "-r", "app.apk"])

    def test_adb_pull_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("adb: error: remote object '/sdcard/file' does not exist")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(ADBPullError):
                client._run(["pull", "/sdcard/file", "/tmp/file"])

    def test_adb_push_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("adb: error: failed to copy file: permission denied")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(ADBPushError):
                client._run(["push", "/tmp/file", "/sdcard/file"])

    def test_pull_permission_denied_error(self):
        client = self._make_client()
        mock_result = self._mock_subprocess_error("adb: error: permission denied")
        with patch("core.adb.subprocess.run", return_value=mock_result):
            with pytest.raises(ADBPullError):
                client._run(["pull", "/sdcard/file", "/tmp/file"])


# ── _run() retry logic ────────────────────────────────────────────────────────


class TestRunRetryLogic:
    """Tests for _run() retry behaviour on transient failures."""

    def test_retry_on_timeout_then_success(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient(max_retries=3, retry_delay=0.01)

        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise subprocess.TimeoutExpired(cmd="adb", timeout=30)
            mock_result = MagicMock()
            mock_result.stdout = "success"
            mock_result.stderr = ""
            mock_result.returncode = 0
            return mock_result

        with patch("core.adb.subprocess.run", side_effect=side_effect):
            with patch("core.adb.time.sleep"):
                result = client._run(["devices"])
        assert result == "success"
        assert call_count == 3

    def test_retry_exhausted_raises_timeout(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient(max_retries=2, retry_delay=0.01)

        with patch("core.adb.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="adb", timeout=30)):
            with patch("core.adb.time.sleep"):
                with pytest.raises(ADBTimeoutError):
                    client._run(["devices"])

    def test_retry_on_file_not_found_then_success(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient(max_retries=3, retry_delay=0.01)

        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise FileNotFoundError("adb not found")
            mock_result = MagicMock()
            mock_result.stdout = "ok"
            mock_result.stderr = ""
            mock_result.returncode = 0
            return mock_result

        with patch("core.adb.subprocess.run", side_effect=side_effect):
            with patch.object(client, "_try_restart_adb", return_value=True):
                with patch("core.adb.time.sleep"):
                    result = client._run(["devices"])
        assert result == "ok"

    def test_no_retry_on_classified_error(self):
        """Classified errors (DeviceOfflineError etc.) should NOT be retried."""
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient(max_retries=3, retry_delay=0.01)

        mock_result = MagicMock()
        mock_result.stdout = ""
        mock_result.stderr = "error: device offline"
        mock_result.returncode = 1

        with patch("core.adb.subprocess.run", return_value=mock_result) as mock_run:
            with pytest.raises(DeviceOfflineError):
                client._run(["shell", "echo", "hi"])
            # Should only be called once — no retry for classified errors
            assert mock_run.call_count == 1

    def test_adb_server_restart_on_out_of_date(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient(max_retries=3, retry_delay=0.01)

        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                mock_result = MagicMock()
                mock_result.stdout = ""
                mock_result.stderr = "adb server is out of date"
                mock_result.returncode = 1
                return mock_result
            mock_result = MagicMock()
            mock_result.stdout = "ok"
            mock_result.stderr = ""
            mock_result.returncode = 0
            return mock_result

        with patch("core.adb.subprocess.run", side_effect=side_effect):
            with patch.object(client, "_try_restart_adb", return_value=True):
                with patch("core.adb.time.sleep"):
                    result = client._run(["devices"])
        assert result == "ok"

    def test_adb_server_restart_fails_raises(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient(max_retries=1, retry_delay=0.01)

        mock_result = MagicMock()
        mock_result.stdout = ""
        mock_result.stderr = "adb server is out of date"
        mock_result.returncode = 1

        with patch("core.adb.subprocess.run", return_value=mock_result):
            with patch.object(client, "_try_restart_adb", return_value=False):
                with pytest.raises(ADBServerDownError):
                    client._run(["devices"])


# ── _run() success path ────────────────────────────────────────────────────────


class TestRunSuccess:
    def test_successful_run_returns_stdout(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient(max_retries=1)

        mock_result = MagicMock()
        mock_result.stdout = "device output"
        mock_result.stderr = ""
        mock_result.returncode = 0

        with patch("core.adb.subprocess.run", return_value=mock_result):
            result = client._run(["shell", "echo", "hi"])
        assert result == "device output"

    def test_successful_run_with_device_id(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient(max_retries=1)

        mock_result = MagicMock()
        mock_result.stdout = "ok"
        mock_result.stderr = ""
        mock_result.returncode = 0

        with patch("core.adb.subprocess.run", return_value=mock_result) as mock_run:
            client._run(["shell", "echo", "hi"], device_id="dev-1")
        cmd = mock_run.call_args[0][0]
        assert "-s" in cmd
        assert "dev-1" in cmd


# ── _try_restart_adb ──────────────────────────────────────────────────────────


class TestTryRestartAdb:
    def test_restart_success(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient()

        mock_kill = MagicMock()
        mock_kill.returncode = 0
        mock_kill.stderr = ""

        mock_start = MagicMock()
        mock_start.returncode = 0
        mock_start.stderr = ""

        with patch("core.adb.subprocess.run", side_effect=[mock_kill, mock_start]):
            assert client._try_restart_adb() is True

    def test_restart_failure(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient()

        mock_kill = MagicMock()
        mock_kill.returncode = 0
        mock_kill.stderr = ""

        mock_start = MagicMock()
        mock_start.returncode = 1
        mock_start.stderr = "failed"

        with patch("core.adb.subprocess.run", side_effect=[mock_kill, mock_start]):
            assert client._try_restart_adb() is False

    def test_restart_exception(self):
        with patch("core.adb._resolve_adb_path", return_value="adb"):
            client = ADBClient()

        with patch("core.adb.subprocess.run", side_effect=Exception("boom")):
            assert client._try_restart_adb() is False


# ── error hierarchy ────────────────────────────────────────────────────────────


class TestErrorHierarchy:
    def test_all_errors_inherit_from_adb_error(self):
        for exc_cls in [
            DeviceDisconnectedError,
            DeviceOfflineError,
            DeviceUnauthorizedError,
            LowStorageError,
            ADBTimeoutError,
            ADBServerDownError,
            ADBInstallError,
            ADBPullError,
            ADBPushError,
        ]:
            assert issubclass(exc_cls, ADBError)

    def test_adb_error_inherits_from_exception(self):
        assert issubclass(ADBError, Exception)
