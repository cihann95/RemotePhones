"""Alert system with threshold-based detection."""

from __future__ import annotations

import logging
import time
from typing import Any

from utils.logger import get_logger

logger = get_logger(__name__)


class AlertManager:
    """Threshold-based alert system for device health monitoring.

    Reads thresholds from MonitorConfig:
    - battery_low_pct
    - temperature_high_c
    - memory_low_free_mb
    - cpu_high_pct

    Uses :class:`monitor.health.HealthCheckResult` snapshots to evaluate
    whether any device currently exceeds configured thresholds.
    """

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.config = config or {}
        mon_cfg: dict[str, Any] = self.config.get("monitor", {})

        self.battery_low_pct: int = int(mon_cfg.get("battery_low_pct", 15))
        self.temperature_high_c: int = int(mon_cfg.get("temperature_high_c", 50))
        self.cpu_high_pct: float = float(mon_cfg.get("cpu_high_pct", 95.0))
        self.memory_low_free_mb: int | None = mon_cfg.get("memory_low_free_mb", None)
        if self.memory_low_free_mb is not None:
            self.memory_low_free_mb = int(self.memory_low_free_mb)
        else:
            # Default: flag memory below 200 MB (conservative for phones)
            self.memory_low_free_mb = 200

    def evaluate(self, result: Any) -> list[dict[str, Any]]:
        """Evaluate a :class:`monitor.health.HealthCheckResult` against the
        configured thresholds and return alert dicts.

        Each alert dict::

            {
                "device_id": str,
                "severity": "warning" | "critical",
                "metric": str,
                "message": str,
                "value": Any,
                "threshold": Any,
                "ts": float,     # epoch seconds
            }
        """
        alerts: list[dict[str, Any]] = []
        ts = time.time()

        if not bool(getattr(result, "online", False)):
            alerts.append(
                {
                    "device_id": getattr(result, "device_id", "unknown"),
                    "severity": "critical",
                    "metric": "reachability",
                    "message": "Device is offline or ADB is not responding",
                    "value": False,
                    "threshold": True,
                    "ts": ts,
                }
            )
            return alerts

        device_id = getattr(result, "device_id", "unknown")

        battery_level: int | None = getattr(result, "battery_level", None)
        if battery_level is not None:
            if battery_level <= self.battery_low_pct:
                alerts.append(
                    {
                        "device_id": device_id,
                        "severity": "critical",
                        "metric": "battery",
                        "message": (
                            f"battery_low ({battery_level}% <= {self.battery_low_pct}%)"
                        ),
                        "value": battery_level,
                        "threshold": self.battery_low_pct,
                        "ts": ts,
                    }
                )

        cpu_usage: float | None = getattr(result, "cpu_usage", None)
        if cpu_usage is not None:
            cpu_pct = float(cpu_usage) * 100.0
            if cpu_pct >= self.cpu_high_pct:
                alerts.append(
                    {
                        "device_id": device_id,
                        "severity": "warning",
                        "metric": "cpu",
                        "message": f"cpu_high ({cpu_pct:.1f}% >= {self.cpu_high_pct:.1f}%)",
                        "value": cpu_pct,
                        "threshold": self.cpu_high_pct,
                        "ts": ts,
                    }
                )

        memory_free_mb: int | None = getattr(result, "memory_free_mb", None)
        if memory_free_mb is not None:
            if memory_free_mb <= self.memory_low_free_mb:
                alerts.append(
                    {
                        "device_id": device_id,
                        "severity": "critical",
                        "metric": "memory_free",
                        "message": (
                            f"memory_low_free "
                            f"({memory_free_mb}MB free <= {self.memory_low_free_mb}MB)"
                        ),
                        "value": memory_free_mb,
                        "threshold": self.memory_low_free_mb,
                        "ts": ts,
                    }
                )

        return alerts
