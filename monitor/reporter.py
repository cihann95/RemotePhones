"""Summary reporter for device health polls."""

from __future__ import annotations

import logging
from typing import Any

from utils.logger import get_logger

logger = get_logger(__name__)


class HealthReporter:
    """Özet rapor üretimi: özet tablo, uyarı listesi, cihaz özetleri.

    ``build_report`` ``poller.get_last_report()`` çıktısı ile aynı şekle sahip
    olmalıdır::

        {
            "<device_id>": {
                "device_id": str,
                "online": bool,
                "battery": int | None,
                "cpu_usage": float | None,
                "memory_free_mb": int | None,
                "adb_responsive": bool,
                "last_checked": float,
            },
            ...
        }
    """

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.config = config or {}

    def build_report(self, devices: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
        """Build a summary report from the provided devices mapping."""
        if devices is None:
            devices = {}

        statuses = list(devices.values())
        online_count = sum(1 for status in statuses if bool(status.get("online", False)))
        offline_count = max(0, len(statuses) - online_count)

        low_battery: list[str] = []
        unreachable: list[str] = []

        device_summaries = []
        for status in statuses:
            device_id = status.get("device_id", "unknown")
            device_summaries.append(
                {
                    "device_id": device_id,
                    "online": bool(status.get("online", False)),
                    "last_checked": status.get("last_checked"),
                    "battery": status.get("battery"),
                    "cpu_usage": status.get("cpu_usage"),
                    "memory_free_mb": status.get("memory_free_mb"),
                }
            )
            battery = status.get("battery")
            if isinstance(battery, int) and battery <= 15:
                low_battery.append(device_id)
            if not bool(status.get("online", False)):
                unreachable.append(device_id)

        return {
            "total_devices": len(statuses),
            "online": online_count,
            "offline": offline_count,
            "low_battery": low_battery,
            "unreachable": unreachable,
            "critical_alerts": len(low_battery) + len(unreachable),
            "devices": device_summaries,
        }
