"""Device health checks for the monitor layer.

Return a typed :class:`HealthCheckResult` from :class:`DeviceHealthChecker`
and keep ``alerts.py`` free to check fields without fragile ``dict`` keys.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class HealthCheckResult:
    """Typed result returned by :meth:`DeviceHealthChecker.check`."""

    device_id: str
    online: bool = False
    battery_level: int | None = None
    cpu_usage: float | None = None  # 0.0-1.0
    memory_free_mb: int | None = None
    adb_responsive: bool = False
    last_checked: float = field(default_factory=time.time)

    @property
    def ok(self) -> bool:
        return bool(self.online)

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "online": self.online,
            "battery": self.battery_level,
            "cpu_usage": self.cpu_usage,
            "memory_free_mb": self.memory_free_mb,
            "adb_responsive": self.adb_responsive,
            "last_checked": self.last_checked,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "HealthCheckResult":
        return cls(
            device_id=str(data.get("device_id", "unknown")),
            online=bool(data.get("online", False)),
            battery_level=data.get("battery"),
            cpu_usage=data.get("cpu_usage"),
            memory_free_mb=data.get("memory_free_mb"),
            adb_responsive=bool(data.get("adb_responsive", False)),
            last_checked=float(data.get("last_checked", time.time())),
        )


class DeviceHealthChecker:
    """Bir cihazın sağlık durumunu DeviceManager üzerinden sorgular."""

    def __init__(self, device_manager: Any, config: dict | None = None) -> None:
        self.dm = device_manager
        self.config = config or {}
        mon_cfg = self.config.get("monitor", {})

        # Thresholds — config'den al, yoksa varsayılan
        self.battery_low_pct: int = mon_cfg.get("battery_low_pct", 15)
        self.temperature_high_c: int = mon_cfg.get("temperature_high_c", 50)
        self.memory_high_pct: int = mon_cfg.get("memory_high_pct", 90)
        self._timeout_s: int = mon_cfg.get("health_check_timeout_s", 10)

    def check(self, device_id: str) -> dict:
        """
        Döner: {
          device_id: str,
          online: bool,
          battery: int | None,      # 0-100
          cpu_usage: float | None,  # 0.0-1.0
          memory_free_mb: int | None,
          adb_responsive: bool,
          last_checked: float        # unix timestamp
        }

        Dönüş tipi ``dict`` olur; bu tip aynı zamanda :class:`HealthCheckResult`
        ile uyumludur. Eğer gerekirse::

            result = DeviceHealthChecker(...).check(id)
            typed = HealthCheckResult.from_dict(result)

        Exception yakalanır ve ``online: False`` döndürülür — asla yukarı fırlatılmaz.
        """
        raw_result = HealthCheckResult(device_id=device_id)
        try:
            device = self.dm.get(device_id)
            if device is None or device.get("status") != "online":
                return raw_result.to_dict()

            raw_result.online = True
            raw_result.adb_responsive = True

            # Battery
            try:
                raw = self.dm.adb.run_command(
                    ["shell", "dumpsys battery 2>/dev/null | grep level"],
                    device_id=device_id,
                    timeout=self._timeout_s,
                )
                for line in raw.splitlines():
                    if "level" in line:
                        parts = line.split(":")
                        if len(parts) >= 2:
                            pct = int(parts[-1].strip())
                            if 0 <= pct <= 100:
                                raw_result.battery_level = pct
                        break
            except Exception as exc:
                logger.debug("Battery check failed for %s: %s", device_id, exc)

            # CPU usage
            try:
                raw = self.dm.adb.run_command(
                    [
                        "shell",
                        "top -n 1 -b 2>/dev/null | head -20 "
                        "|| vmstat 1 1 2>/dev/null",
                    ],
                    device_id=device_id,
                    timeout=self._timeout_s,
                )
                cpu = self._parse_cpu(raw)
                if cpu is not None and 0.0 <= cpu <= 1.0:
                    raw_result.cpu_usage = cpu
            except Exception as exc:
                logger.debug("CPU check failed for %s: %s", device_id, exc)

            # Memory free (MB) — MemAvailable > MemFree > None
            try:
                raw = self.dm.adb.run_command(
                    [
                        "shell",
                        "cat /proc/meminfo 2>/dev/null "
                        "| grep -E '^MemAvailable|^MemFree'",
                    ],
                    device_id=device_id,
                    timeout=self._timeout_s,
                )
                mem_free_kb = self._parse_mem_free_kb(raw)
                if mem_free_kb is not None:
                    raw_result.memory_free_mb = mem_free_kb // 1024
            except Exception as exc:
                logger.debug("Memory check failed for %s: %s", device_id, exc)

        except Exception as exc:
            logger.error(
                "Health check failed for %s: %s", device_id, exc, exc_info=True
            )
            raw_result.online = False

        return raw_result.to_dict()

    @staticmethod
    def _parse_cpu(raw: str) -> float | None:
        """Basit CPU kullanım parse (top/vmstat çıktısı)."""
        for line in raw.splitlines():
            if not line.strip():
                continue
            if "cpu" in line.lower() and "id" in line.lower():
                parts = line.split()
                for part in parts:
                    if part.startswith("id="):
                        try:
                            idle = float(part.split("=")[1])
                            return max(0.0, min(1.0, 1.0 - idle / 100.0))
                        except (ValueError, IndexError):
                            pass
            if line.strip().startswith("Cpu"):
                try:
                    rest = line.split(":")[1]
                    for token in rest.replace(",", " ").split():
                        if token.endswith("%id"):
                            idle = float(token[:-3])
                            return max(0.0, min(1.0, 1.0 - idle / 100.0))
                except (ValueError, IndexError):
                    pass
        return None

    @staticmethod
    def _parse_mem_free_kb(raw: str) -> int | None:
        """MemAvailable veya MemFree değerini KB olarak döndür."""
        for line in raw.splitlines():
            if line.startswith("MemAvailable:"):
                try:
                    return int(line.split()[1])  # kB
                except (ValueError, IndexError):
                    pass
        for line in raw.splitlines():
            if line.startswith("MemFree:"):
                try:
                    return int(line.split()[1])
                except (ValueError, IndexError):
                    pass
        return None
