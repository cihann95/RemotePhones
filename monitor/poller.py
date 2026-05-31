"""Periodic device health polling."""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

from utils.logger import get_logger
from monitor.health import DeviceHealthChecker
from monitor.alerts import AlertManager

logger = get_logger(__name__)


class DevicePoller:
    """Tüm aktif cihazları periyodik olarak health-check eder."""

    def __init__(
        self,
        health_checker: DeviceHealthChecker,
        alert_manager: AlertManager,
        interval_sec: int = 30,
    ) -> None:
        self.checker = health_checker
        self.alerts = alert_manager
        self.interval_sec = int(interval_sec)
        self._running = False
        self._thread: threading.Thread | None = None
        self._snapshot: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def start(self) -> None:
        """Non-blocking: arka planda polling başlat."""
        if self._running:
            logger.warning("DevicePoller already running")
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._loop,
            daemon=True,
            name="DevicePoller",
        )
        self._thread.start()
        logger.info("DevicePoller started (interval=%ds)", self.interval_sec)

    def stop(self) -> None:
        """Polling döngüsünü durdur (join bekler)."""
        self._running = False
        if self._thread is not None:
            self._thread.join(timeout=5.0)
            self._thread = None

    def get_last_report(self) -> dict[str, dict]:
        """device_id -> health dict (son snapshot)."""
        with self._lock:
            return dict(self._snapshot)

    def _loop(self) -> None:
        while self._running:
            self.poll()
            # Interruptible sleep so stop() returns promptly.
            end = time.time() + self.interval_sec
            while self._running and time.time() < end:
                time.sleep(min(0.2, max(0.0, end - time.time())))

    def poll(self) -> dict[str, dict[str, Any]]:
        device_ids = list(getattr(self.checker.dm, "all_devices", {}).keys())
        if not device_ids:
            device_ids = list(getattr(self.checker.dm, "online_devices", {}).keys())

        snapshot: dict[str, dict[str, Any]] = {}
        for device_id in device_ids:
            try:
                health = self.checker.check(device_id)
                if isinstance(health, dict):
                    health_dict = health
                else:
                    health_dict = health.to_dict()
                snapshot[device_id] = health_dict
                for alert in self.alerts.evaluate(health):
                    logger.warning(
                        "ALERT %s %s: %s",
                        alert["severity"].upper(),
                        device_id,
                        alert["message"],
                    )
            except Exception as exc:  # pragma: no cover
                logger.error("Poll error %s: %s", device_id, exc)
                snapshot[device_id] = {
                    "device_id": device_id,
                    "online": False,
                    "adb_responsive": False,
                }
        with self._lock:
            self._snapshot = snapshot
        return snapshot
