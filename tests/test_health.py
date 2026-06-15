"""Tests for monitor/health.py — DeviceHealthChecker and HealthCheckResult."""

import time
from unittest.mock import MagicMock, patch

import pytest

from monitor.health import DeviceHealthChecker, HealthCheckResult


# ---------------------------------------------------------------------------
# HealthCheckResult dataclass tests
# ---------------------------------------------------------------------------


class TestHealthCheckResult:
    """Tests for the HealthCheckResult dataclass."""

    def test_default_values(self):
        """HealthCheckResult defaults: offline, no metrics, no issues."""
        result = HealthCheckResult(device_id="abc123")
        assert result.device_id == "abc123"
        assert result.online is False
        assert result.battery_level is None
        assert result.cpu_usage is None
        assert result.memory_free_mb is None
        assert result.adb_responsive is False
        assert result.issues == []

    def test_ok_property_offline(self):
        """ok() returns False when device is offline."""
        result = HealthCheckResult(device_id="dev1", online=False)
        assert result.ok is False

    def test_ok_property_online(self):
        """ok() returns True when device is online."""
        result = HealthCheckResult(device_id="dev1", online=True)
        assert result.ok is True

    def test_healthy_property_matches_ok(self):
        """healthy() is an alias for ok()."""
        result_offline = HealthCheckResult(device_id="dev1", online=False)
        result_online = HealthCheckResult(device_id="dev1", online=True)
        assert result_offline.healthy == result_offline.ok
        assert result_online.healthy == result_online.ok

    def test_add_issue(self):
        """add_issue() appends to the issues list."""
        result = HealthCheckResult(device_id="dev1")
        result.add_issue("battery low")
        result.add_issue("cpu hot")
        assert result.issues == ["battery low", "cpu hot"]

    def test_to_dict_output(self):
        """to_dict() returns expected keys and values."""
        now = time.time()
        result = HealthCheckResult(
            device_id="dev1",
            online=True,
            battery_level=85,
            cpu_usage=0.42,
            memory_free_mb=512,
            adb_responsive=True,
            last_checked=now,
            issues=["battery low"],
        )
        d = result.to_dict()
        assert d == {
            "device_id": "dev1",
            "online": True,
            "battery": 85,
            "cpu_usage": 0.42,
            "memory_free_mb": 512,
            "adb_responsive": True,
            "last_checked": now,
            "issues": ["battery low"],
        }

    def test_from_dict_roundtrip(self):
        """from_dict() reconstructs a HealthCheckResult from a dict."""
        now = time.time()
        data = {
            "device_id": "dev2",
            "online": True,
            "battery": 50,
            "cpu_usage": 0.73,
            "memory_free_mb": 256,
            "adb_responsive": True,
            "last_checked": now,
            "issues": ["slow"],
        }
        result = HealthCheckResult.from_dict(data)
        assert result.device_id == "dev2"
        assert result.online is True
        assert result.battery_level == 50
        assert result.cpu_usage == 0.73
        assert result.memory_free_mb == 256
        assert result.adb_responsive is True
        assert result.last_checked == now
        assert result.issues == ["slow"]

    def test_from_dict_defaults(self):
        """from_dict() uses defaults for missing keys."""
        result = HealthCheckResult.from_dict({"device_id": "x"})
        assert result.device_id == "x"
        assert result.online is False
        assert result.battery_level is None
        assert result.cpu_usage is None
        assert result.memory_free_mb is None
        assert result.adb_responsive is False
        assert result.issues == []


# ---------------------------------------------------------------------------
# DeviceHealthChecker — check() with online/offline device
# ---------------------------------------------------------------------------


def _make_dm(device_status="online", battery_raw="", cpu_raw="", mem_raw=""):
    """Build a mock DeviceManager with a mock ADBClient.

    Args:
        device_status: Value returned by dm.get()["status"].
        battery_raw: Raw string returned by ADB for battery query.
        cpu_raw: Raw string returned by ADB for CPU query.
        mem_raw: Raw string returned by ADB for memory query.
    """
    dm = MagicMock()
    dm.get.return_value = {"status": device_status}
    adb = MagicMock()
    adb.run_command.side_effect = lambda args, device_id=None, timeout=10: {
        tuple(["shell", "dumpsys battery 2>/dev/null | grep level"]): battery_raw,
        tuple([
            "shell",
            "top -n 1 -b 2>/dev/null | head -20 "
            "|| vmstat 1 1 2>/dev/null",
        ]): cpu_raw,
        tuple([
            "shell",
            "cat /proc/meminfo 2>/dev/null "
            "| grep -E '^MemAvailable|^MemFree'",
        ]): mem_raw,
    }.get(tuple(args), "")
    dm.adb = adb
    return dm


class TestDeviceHealthCheckerCheck:
    """Tests for DeviceHealthChecker.check()."""

    def test_check_offline_device(self):
        """check() returns offline result when device is not online."""
        dm = MagicMock()
        dm.get.return_value = {"status": "offline"}
        checker = DeviceHealthChecker(dm)
        result = checker.check("dev1")
        assert result.online is False
        assert result.adb_responsive is False
        assert result.battery_level is None
        assert result.cpu_usage is None
        assert result.memory_free_mb is None

    def test_check_device_not_found(self):
        """check() returns offline result when device is None."""
        dm = MagicMock()
        dm.get.return_value = None
        checker = DeviceHealthChecker(dm)
        result = checker.check("missing_dev")
        assert result.online is False
        assert result.device_id == "missing_dev"

    def test_check_online_device_full_data(self):
        """check() populates all fields for an online device."""
        dm = _make_dm(
            device_status="online",
            battery_raw="  level: 72\n",
            cpu_raw="Cpu(s):  5.0%us,  3.0%sy,  0.0%ni, 90.0%id,  2.0%wa\n",
            mem_raw="MemAvailable:    524288 kB\nMemFree:      131072 kB\n",
        )
        checker = DeviceHealthChecker(dm)
        result = checker.check("dev1")
        assert result.online is True
        assert result.adb_responsive is True
        assert result.battery_level == 72
        assert result.cpu_usage == pytest.approx(0.10)  # 1 - 90/100
        assert result.memory_free_mb == 512  # 524288 kB // 1024

    def test_check_battery_parsing(self):
        """check() parses battery level from dumpsys output."""
        dm = _make_dm(
            device_status="online",
            battery_raw="  level: 55\n",
            cpu_raw="",
            mem_raw="",
        )
        checker = DeviceHealthChecker(dm)
        result = checker.check("dev1")
        assert result.battery_level == 55

    def test_check_battery_invalid_level_ignored(self):
        """check() ignores battery levels outside 0-100."""
        dm = _make_dm(
            device_status="online",
            battery_raw="  level: 150\n",
            cpu_raw="",
            mem_raw="",
        )
        checker = DeviceHealthChecker(dm)
        result = checker.check("dev1")
        assert result.battery_level is None

    def test_check_battery_exception_does_not_crash(self):
        """check() handles ADB exception during battery check gracefully."""
        dm = MagicMock()
        dm.get.return_value = {"status": "online"}
        adb = MagicMock()
        adb.run_command.side_effect = Exception("ADB timeout")
        dm.adb = adb
        checker = DeviceHealthChecker(dm)
        result = checker.check("dev1")
        # Device is still online; battery just failed
        assert result.online is True
        assert result.battery_level is None

    def test_check_memory_parsing(self):
        """check() parses MemAvailable from /proc/meminfo output."""
        dm = _make_dm(
            device_status="online",
            battery_raw="",
            cpu_raw="",
            mem_raw="MemAvailable:    262144 kB\n",
        )
        checker = DeviceHealthChecker(dm)
        result = checker.check("dev1")
        assert result.memory_free_mb == 256  # 262144 // 1024

    def test_check_memory_falls_back_to_memfree(self):
        """check() falls back to MemFree when MemAvailable is absent."""
        dm = _make_dm(
            device_status="online",
            battery_raw="",
            cpu_raw="",
            mem_raw="MemFree:      131072 kB\n",
        )
        checker = DeviceHealthChecker(dm)
        result = checker.check("dev1")
        assert result.memory_free_mb == 128  # 131072 // 1024


# ---------------------------------------------------------------------------
# _parse_cpu static method tests
# ---------------------------------------------------------------------------


class TestParseCpu:
    """Tests for DeviceHealthChecker._parse_cpu()."""

    def test_parse_cpu_top_output(self):
        """Parse CPU idle from top-style output (%id suffix)."""
        raw = "Cpu(s):  5.0%us,  3.0%sy,  0.0%ni, 90.0%id,  2.0%wa\n"
        result = DeviceHealthChecker._parse_cpu(raw)
        assert result == pytest.approx(0.10)  # 1 - 90/100

    def test_parse_cpu_vmstat_output(self):
        """Parse CPU idle from vmstat-style output (id= suffix)."""
        # _parse_cpu requires a line containing both "cpu" and "id" with an id= token
        raw = "cpu  5  3  id=92.0  0  0\n"
        result = DeviceHealthChecker._parse_cpu(raw)
        assert result == pytest.approx(0.08)  # 1 - 92/100

    def test_parse_cpu_empty_input(self):
        """_parse_cpu returns None for empty input."""
        assert DeviceHealthChecker._parse_cpu("") is None

    def test_parse_cpu_no_match(self):
        """_parse_cpu returns None when no CPU line matches."""
        raw = "some random output\nnothing useful here\n"
        assert DeviceHealthChecker._parse_cpu(raw) is None

    def test_parse_cpu_clamps_to_range(self):
        """_parse_cpu clamps result to 0.0-1.0 range."""
        # 0% idle → usage = 1.0
        raw = "Cpu(s):  100%us,  0.0%sy,  0.0%ni, 0.0%id\n"
        assert DeviceHealthChecker._parse_cpu(raw) == 1.0
        # 100% idle → usage = 0.0
        raw = "Cpu(s):  0.0%us,  0.0%sy,  0.0%ni, 100.0%id\n"
        assert DeviceHealthChecker._parse_cpu(raw) == 0.0


# ---------------------------------------------------------------------------
# _parse_mem_free_kb static method tests
# ---------------------------------------------------------------------------


class TestParseMemFreeKb:
    """Tests for DeviceHealthChecker._parse_mem_free_kb()."""

    def test_parse_mem_available(self):
        """Parse MemAvailable line."""
        raw = "MemAvailable:    524288 kB\n"
        assert DeviceHealthChecker._parse_mem_free_kb(raw) == 524288

    def test_parse_mem_free_fallback(self):
        """Fall back to MemFree when MemAvailable is absent."""
        raw = "MemFree:      131072 kB\n"
        assert DeviceHealthChecker._parse_mem_free_kb(raw) == 131072

    def test_parse_mem_available_preferred_over_free(self):
        """MemAvailable takes priority over MemFree."""
        raw = "MemAvailable:    524288 kB\nMemFree:      131072 kB\n"
        assert DeviceHealthChecker._parse_mem_free_kb(raw) == 524288

    def test_parse_mem_empty_input(self):
        """_parse_mem_free_kb returns None for empty input."""
        assert DeviceHealthChecker._parse_mem_free_kb("") is None

    def test_parse_mem_no_match(self):
        """_parse_mem_free_kb returns None when no matching lines."""
        raw = "SwapTotal:       2097148 kB\nSwapFree:        2097148 kB\n"
        assert DeviceHealthChecker._parse_mem_free_kb(raw) is None


# ---------------------------------------------------------------------------
# DeviceHealthChecker config tests
# ---------------------------------------------------------------------------


class TestDeviceHealthCheckerConfig:
    """Tests for DeviceHealthChecker configuration."""

    def test_default_thresholds(self):
        """Default thresholds are applied when config is empty."""
        checker = DeviceHealthChecker(MagicMock())
        assert checker.battery_low_pct == 15
        assert checker.temperature_high_c == 50
        assert checker.memory_high_pct == 90
        assert checker._timeout_s == 10

    def test_custom_thresholds(self):
        """Custom thresholds from config override defaults."""
        config = {
            "monitor": {
                "battery_low_pct": 10,
                "temperature_high_c": 45,
                "memory_high_pct": 85,
                "health_check_timeout_s": 5,
            }
        }
        checker = DeviceHealthChecker(MagicMock(), config=config)
        assert checker.battery_low_pct == 10
        assert checker.temperature_high_c == 45
        assert checker.memory_high_pct == 85
        assert checker._timeout_s == 5