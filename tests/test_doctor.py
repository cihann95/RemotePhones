"""Tests for the doctor subcommand — pre-flight diagnostic checks."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from unittest.mock import MagicMock, mock_open, patch

import pytest

# The check functions are importable without triggering heavy CLI imports
# because they only use stdlib modules.


def _import_check_functions():
    """Import doctor check functions. The heavy imports in phone_farm_cli
    happen at module level after the check functions are defined, so we
    need to ensure the module loads successfully first."""
    import phone_farm_cli
    return phone_farm_cli


# ── Check function return format ──────────────────────────────────────────────


class TestCheckReturnFormat:
    """Every check function must return a dict with status, message, fix_steps."""

    def _validate_result(self, result: dict):
        assert "status" in result, "Missing 'status' key"
        assert "message" in result, "Missing 'message' key"
        assert "fix_steps" in result, "Missing 'fix_steps' key"
        assert result["status"] in ("ok", "warning", "error"), f"Invalid status: {result['status']}"
        assert isinstance(result["message"], str), "message must be str"
        assert isinstance(result["fix_steps"], list), "fix_steps must be list"

    def test_python_version_check_format(self):
        mod = _import_check_functions()
        result = mod._check_python_version()
        self._validate_result(result)

    def test_adb_on_path_check_format(self):
        mod = _import_check_functions()
        result = mod._check_adb_on_path()
        self._validate_result(result)

    def test_env_file_check_format(self):
        mod = _import_check_functions()
        result = mod._check_env_file()
        self._validate_result(result)

    def test_required_packages_check_format(self):
        mod = _import_check_functions()
        result = mod._check_required_packages()
        self._validate_result(result)

    def test_data_directory_check_format(self):
        mod = _import_check_functions()
        result = mod._check_data_directory()
        self._validate_result(result)

    def test_port_available_check_format(self):
        mod = _import_check_functions()
        result = mod._check_port_available()
        self._validate_result(result)

    def test_sqlite_writable_check_format(self):
        mod = _import_check_functions()
        result = mod._check_sqlite_writable()
        self._validate_result(result)

    def test_error_messages_json_check_format(self):
        mod = _import_check_functions()
        result = mod._check_error_messages_json()
        self._validate_result(result)

    def test_network_check_format(self):
        mod = _import_check_functions()
        result = mod._check_network()
        self._validate_result(result)

    def test_adb_server_check_format(self):
        mod = _import_check_functions()
        result = mod._check_adb_server()
        self._validate_result(result)


# ── Individual check logic ────────────────────────────────────────────────────


class TestPythonVersionCheck:
    def test_current_python_is_ok(self):
        mod = _import_check_functions()
        result = mod._check_python_version()
        major, minor = sys.version_info[:2]
        if major > 3 or (major == 3 and minor >= 10):
            assert result["status"] == "ok"
        else:
            assert result["status"] == "error"


class TestAdbOnPathCheck:
    def test_adb_found(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.shutil.which", return_value="/usr/bin/adb"):
            result = mod._check_adb_on_path()
        assert result["status"] == "ok"
        assert "ADB bulundu" in result["message"]

    def test_adb_not_found(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.shutil.which", return_value=None):
            result = mod._check_adb_on_path()
        assert result["status"] == "error"
        assert len(result["fix_steps"]) > 0


class TestEnvFileCheck:
    def test_env_exists(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.os.path.exists", return_value=True):
            result = mod._check_env_file()
        assert result["status"] == "ok"

    def test_env_missing_but_example_exists(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.os.path.exists") as mock_exists, \
             patch("phone_farm_cli.shutil.copy2") as mock_copy:
            mock_exists.side_effect = lambda p: "example" in p
            result = mod._check_env_file()
        assert result["status"] == "warning"
        assert "oluşturuldu" in result["message"]

    def test_env_and_example_both_missing(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.os.path.exists", return_value=False):
            result = mod._check_env_file()
        assert result["status"] == "error"


class TestRequiredPackagesCheck:
    def test_all_packages_available(self):
        mod = _import_check_functions()
        result = mod._check_required_packages()
        assert result["status"] == "ok"

    def test_missing_packages_detected(self):
        mod = _import_check_functions()
        original_import_module = mod.importlib.import_module

        def fake_import_module(name, *args, **kwargs):
            if name == "ppadb":
                raise ImportError("No module named 'ppadb'")
            return original_import_module(name, *args, **kwargs)

        with patch.object(mod.importlib, "import_module", side_effect=fake_import_module):
            result = mod._check_required_packages()
        assert result["status"] == "error"
        assert "ppadb" in result["message"]


class TestDataDirectoryCheck:
    def test_writable_directory(self):
        mod = _import_check_functions()
        result = mod._check_data_directory()
        assert result["status"] == "ok"

    def test_unwritable_directory(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.os.makedirs", side_effect=OSError("Permission denied")):
            result = mod._check_data_directory()
        assert result["status"] == "error"


class TestPortCheck:
    def test_port_available(self):
        mod = _import_check_functions()
        mock_socket = MagicMock()
        mock_socket.__enter__ = MagicMock(return_value=mock_socket)
        mock_socket.__exit__ = MagicMock(return_value=False)
        with patch("phone_farm_cli.socket.socket", return_value=mock_socket):
            result = mod._check_port_available()
        assert result["status"] == "ok"

    def test_port_occupied(self):
        mod = _import_check_functions()
        mock_socket = MagicMock()
        mock_socket.__enter__ = MagicMock(return_value=mock_socket)
        mock_socket.__exit__ = MagicMock(return_value=False)
        mock_socket.bind.side_effect = OSError("Address already in use")
        with patch("phone_farm_cli.socket.socket", return_value=mock_socket):
            result = mod._check_port_available()
        assert result["status"] == "warning"


class TestSqliteWritableCheck:
    def test_writable(self):
        mod = _import_check_functions()
        result = mod._check_sqlite_writable()
        assert result["status"] == "ok"

    def test_connection_failure(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.os.makedirs"), \
             patch("phone_farm_cli.sqlite3.connect", side_effect=Exception("disk I/O error")):
            result = mod._check_sqlite_writable()
        assert result["status"] == "error"


class TestErrorMessagesJsonCheck:
    def test_valid_json(self):
        mod = _import_check_functions()
        result = mod._check_error_messages_json()
        assert result["status"] == "ok"
        assert "desen" in result["message"]

    def test_missing_file(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.os.path.exists", return_value=False):
            result = mod._check_error_messages_json()
        assert result["status"] == "error"

    def test_invalid_json(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.os.path.exists", return_value=True), \
             patch("builtins.open", mock_open(read_data="not json")):
            result = mod._check_error_messages_json()
        assert result["status"] == "error"


class TestNetworkCheck:
    def test_network_ok(self):
        mod = _import_check_functions()
        with patch("phone_farm_cli.socket.getaddrinfo", return_value=[("foo",)]):
            result = mod._check_network()
        assert result["status"] == "ok"

    def test_dns_failure(self):
        mod = _import_check_functions()
        import socket
        with patch("phone_farm_cli.socket.getaddrinfo", side_effect=socket.gaierror("Name resolution failed")):
            result = mod._check_network()
        assert result["status"] == "warning"


# ── ALL_CHECKS list ───────────────────────────────────────────────────────────


class TestAllChecksList:
    def test_at_least_8_checks(self):
        mod = _import_check_functions()
        assert len(mod._ALL_CHECKS) >= 8, f"Only {len(mod._ALL_CHECKS)} checks, need 8+"

    def test_each_entry_has_name_and_callable(self):
        mod = _import_check_functions()
        for name, fn in mod._ALL_CHECKS:
            assert isinstance(name, str), f"Check name must be str, got {type(name)}"
            assert callable(fn), f"Check {name} must be callable"


# ── cmd_doctor integration via subprocess ─────────────────────────────────────


class TestCmdDoctorSubprocess:
    def test_doctor_runs_and_prints_header(self):
        result = subprocess.run(
            [sys.executable, "phone_farm_cli.py", "doctor"],
            capture_output=True, text=True, timeout=30,
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        )
        assert "Uçuş Öncesi Kontrol" in result.stdout
        assert "Toplam:" in result.stdout

    def test_doctor_exits_nonzero_when_checks_fail(self):
        """If any check returns 'error' status, exit code must be 1."""
        result = subprocess.run(
            [sys.executable, "phone_farm_cli.py", "doctor"],
            capture_output=True, text=True, timeout=30,
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        )
        has_error = "✗" in result.stdout
        if has_error:
            assert result.returncode == 1, f"Expected exit 1 when errors present, got {result.returncode}"
        else:
            assert result.returncode == 0, f"Expected exit 0 when no errors, got {result.returncode}"

    def test_doctor_lists_all_check_names(self):
        result = subprocess.run(
            [sys.executable, "phone_farm_cli.py", "doctor"],
            capture_output=True, text=True, timeout=30,
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        )
        expected_names = ["Python", "ADB", ".env", "paketler", "dizin", "Port", "SQLite", "mesajları", "Ağ"]
        for name in expected_names:
            assert name in result.stdout, f"Check name '{name}' not found in output"
