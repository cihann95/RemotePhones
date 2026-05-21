"""Device health checks and status polling for the monitor layer."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class HealthStatus:
    device_id: str
    reachable: bool = False
    battery_pct: int = -1
    temperature_c: float | None = None
    uptime_s: int = 0
    memory_pct: float | None = None
    issues: list[str] = None

    def __post_init__(self) -> None:
        if self.issues is None:
            self.issues = []

    @property
    def healthy(self) -> bool:
        return self.reachable and len(self.issues) == 0

    def add_issue(self, msg: str) -> None:
        self.issues.append(msg)

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "reachable": self.reachable,
            "battery_pct": self.battery_pct,
            "temperature_c": self.temperature_c,
            "uptime_s": self.uptime_s,
            "memory_pct": self.memory_pct,
            "issues": self.issues,
            "healthy": self.healthy,
        }


class HealthChecker:
    """Run health checks against a device via :class:`core.adb.ADBClient`."""

    BATTERY_LOW = 15
    MEMORY_HIGH_PCT = 90.0
    TEMP_HIGH_C = 50.0

    def __init__(self, adb: Any) -> None:
        self.adb = adb

    def check(self, device_id: str | None = None) -> HealthStatus:
        status = HealthStatus(device_id=device_id or "unknown")
        try:
            status.reachable = True
            self._check_battery(status, device_id)
            self._check_temperature(status, device_id)
            self._check_memory(status, device_id)
            self._check_uptime(status, device_id)
        except Exception as exc:
            logger.error("Health check failed for %s: %s", device_id, exc, exc_info=True)
            status.reachable = False
            status.add_issue(f"check_exception: {exc}")
        return status

    def _check_battery(self, status: HealthStatus,
                       device_id: str | None) -> None:
        raw = self.adb.shell_output(
            "dumpsys battery 2>/dev/null | grep level", device_id=device_id
        )
        for line in raw.splitlines():
            if "level" in line:
                try:
                    status.battery_pct = int(line.split(":")[-1].strip())
                except (ValueError, IndexError):
                    pass
                break
        if status.battery_pct < self.BATTERY_LOW:
            status.add_issue(f"battery_low ({status.battery_pct}% < {self.BATTERY_LOW}%)")

    def _check_temperature(self, status: HealthStatus,
                           device_id: str | None) -> None:
        raw = self.adb.shell_output(
            "dumpsys battery 2>/dev/null | grep temperature", device_id=device_id
        )
        for line in raw.splitlines():
            if "temperature" in line:
                try:
                    raw_val = line.split(":")[-1].strip()
                    temp_c = int(raw_val) / 10.0
                    status.temperature_c = temp_c
                    if temp_c > self.TEMP_HIGH_C:
                        status.add_issue(f"temperature_high ({temp_c}°C)")
                except (ValueError, IndexError):
                    pass
                break

    def _check_memory(self, status: HealthStatus,
                      device_id: str | None) -> None:
        raw = self.adb.shell_output(
            "cat /proc/meminfo 2>/dev/null | grep -E '^MemTotal|^MemAvailable'",
            device_id=device_id,
        )
        lines = {
            parts[0].rstrip(":"): int(parts[1])
            for line in raw.splitlines()
            for parts in [line.split()]
            if len(parts) >= 2 and parts[0] in {"MemTotal:", "MemAvailable:"}
        }
        if "MemTotal" in lines and "MemAvailable" in lines:
            total = lines["MemTotal"]
            avail = lines["MemAvailable"]
            pct = ((total - avail) / total) * 100
            status.memory_pct = round(pct, 1)
            if status.memory_pct > self.MEMORY_HIGH_PCT:
                status.add_issue(f"memory_high ({status.memory_pct}%)")

    def _check_uptime(self, status: HealthStatus,
                      device_id: str | None) -> None:
        raw = self.adb.shell_output("uptime 2>/dev/null | awk '{print $3}'",
                                    device_id=device_id)
        for line in raw.splitlines():
            try:
                raw_val = line.split(":")[0].strip().rstrip(",")
                status.uptime_s = int(float(raw_val) * 3600)
            except (ValueError, IndexError):
                pass
            break
