"""Tests for phone_farm_cli — parse_args, _parse_kv, _make_manager."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from phone_farm_cli import _make_manager, _parse_kv, parse_args


# ── parse_args() ───────────────────────────────────────────────────────────────


class TestParseArgs:
    def test_discover_command(self):
        args = parse_args(["discover"])
        assert args.command == "discover"

    def test_health_command(self):
        args = parse_args(["health", "emulator-5554"])
        assert args.command == "health"
        assert args.device_id == "emulator-5554"

    def test_run_command_minimal(self):
        args = parse_args(["run", "emulator-5554", "check_battery"])
        assert args.command == "run"
        assert args.device_id == "emulator-5554"
        assert args.task_name == "check_battery"
        assert args.params == []

    def test_run_command_with_params(self):
        args = parse_args(
            ["run", "emulator-5554", "open_app", "package=com.test", "timeout=30"]
        )
        assert args.command == "run"
        assert args.device_id == "emulator-5554"
        assert args.task_name == "open_app"
        assert args.params == ["package=com.test", "timeout=30"]

    def test_submit_command(self):
        args = parse_args(["submit", "emulator-5554", "steps.json"])
        assert args.command == "submit"
        assert args.device_id == "emulator-5554"
        assert args.steps_file == "steps.json"

    def test_status_no_args(self):
        args = parse_args(["status"])
        assert args.command == "status"
        assert args.job_id is None
        assert args.summary is False

    def test_status_with_job_id(self):
        args = parse_args(["status", "job-123"])
        assert args.command == "status"
        assert args.job_id == "job-123"
        assert args.summary is False

    def test_status_with_summary(self):
        args = parse_args(["status", "--summary"])
        assert args.command == "status"
        assert args.job_id is None
        assert args.summary is True

    def test_config_flag(self):
        args = parse_args(["--config", "my_config.yaml", "discover"])
        assert args.config == "my_config.yaml"
        assert args.command == "discover"

    def test_no_args_gives_none_command(self):
        args = parse_args([])
        assert args.command is None

    def test_help_exits_with_zero(self):
        with pytest.raises(SystemExit) as exc_info:
            parse_args(["--help"])
        assert exc_info.value.code == 0


# ── _parse_kv() ────────────────────────────────────────────────────────────────


class TestParseKv:
    def test_empty_list(self):
        assert _parse_kv([]) == {}

    def test_single_pair(self):
        assert _parse_kv(["key=val"]) == {"key": "val"}

    def test_multiple_pairs(self):
        result = _parse_kv(["a=1", "b=hello", "c=true"])
        assert result == {"a": "1", "b": "hello", "c": "true"}

    def test_no_value_flag(self):
        result = _parse_kv(["verbose"])
        assert result == {"verbose": True}

    def test_mixed_flags_and_pairs(self):
        result = _parse_kv(["dry_run", "timeout=30", "force"])
        assert result == {"dry_run": True, "timeout": "30", "force": True}

    def test_key_with_surrounding_spaces(self):
        result = _parse_kv(["  key  =  val  "])
        assert result == {"key": "val"}

    def test_value_containing_equals(self):
        result = _parse_kv(["url=http://example.com/path?q=1"])
        assert result == {"url": "http://example.com/path?q=1"}


# ── _make_manager() ────────────────────────────────────────────────────────────


class TestMakeManager:
    @patch("phone_farm_cli.ADBClient")
    @patch("phone_farm_cli.PhoneFarmManager")
    def test_default_adb_path(self, MockManager, MockADB):
        config = {}
        result = _make_manager(config)

        MockADB.assert_called_once_with(adb_path="adb")
        MockManager.assert_called_once_with(MockADB.return_value, auto_discover=True)
        assert result == MockManager.return_value

    @patch("phone_farm_cli.ADBClient")
    @patch("phone_farm_cli.PhoneFarmManager")
    def test_custom_adb_path(self, MockManager, MockADB):
        config = {"adb": {"adb_path": "/custom/adb"}}
        result = _make_manager(config)

        MockADB.assert_called_once_with(adb_path="/custom/adb")
        MockManager.assert_called_once_with(MockADB.return_value, auto_discover=True)
        assert result == MockManager.return_value

    @patch("phone_farm_cli.ADBClient")
    @patch("phone_farm_cli.PhoneFarmManager")
    def test_auto_discover_always_enabled(self, MockManager, MockADB):
        config = {}
        _make_manager(config)

        _call_kwargs = MockManager.call_args.kwargs
        assert _call_kwargs.get("auto_discover") is True

    @patch("phone_farm_cli.ADBClient")
    @patch("phone_farm_cli.PhoneFarmManager")
    def test_missing_adb_key_falls_back_to_default(self, MockManager, MockADB):
        config = {"adb": {}}
        _make_manager(config)

        MockADB.assert_called_once_with(adb_path="adb")
        MockManager.assert_called_once_with(MockADB.return_value, auto_discover=True)
