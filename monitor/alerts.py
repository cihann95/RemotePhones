"""Alert system with threshold-based detection."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import requests

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
        _memory_low_raw = mon_cfg.get("memory_low_free_mb", None)
        self.memory_low_free_mb: int = int(_memory_low_raw) if _memory_low_raw is not None else 200

        # Webhook configuration
        self.webhook_url: str | None = os.environ.get("ALERT_WEBHOOK_URL")

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
        device_id = getattr(result, "device_id", "unknown")

        if not bool(getattr(result, "online", False)):
            alerts.append(
                {
                    "device_id": device_id,
                    "severity": "critical",
                    "metric": "reachability",
                    "message": "Device is offline or ADB is not responding",
                    "value": False,
                    "threshold": True,
                    "ts": ts,
                }
            )

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

    def send_webhook(self, alert: dict[str, Any]) -> bool:
        """Send alert to webhook URL with retry logic.

        Args:
            alert: Alert dictionary to send

        Returns:
            bool: True if delivery successful, False otherwise
        """
        if not self.webhook_url:
            logger.debug("No webhook URL configured, skipping webhook delivery")
            return False

        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                response = requests.post(
                    self.webhook_url,
                    json=alert,
                    timeout=10,
                )
                response.raise_for_status()
                logger.info(
                    "Webhook delivery successful for alert %s on device %s",
                    alert.get("metric"),
                    alert.get("device_id"),
                )
                return True
            except requests.exceptions.RequestException as e:
                logger.warning(
                    "Webhook delivery attempt %d failed: %s",
                    attempt + 1,
                    e,
                )
                if attempt < max_attempts - 1:  # Don't sleep on last attempt
                    time.sleep(2**attempt)  # Exponential backoff: 1s, 2s, 4s
                else:
                    logger.error(
                        "Webhook delivery failed after %d attempts for alert %s on device %s",
                        max_attempts,
                        alert.get("metric"),
                        alert.get("device_id"),
                    )
        return False
