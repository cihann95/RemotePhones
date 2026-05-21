"""Device status polling — periodic health checks for all tracked devices."""

from __future__ import annotations

import logging
import threading
import time

from monitor.health import HealthChecker, HealthStatus

logger = logging.getLogger(__name__)


class StatusPoller:
    """Periodically poll device health for all registered devices.

    Parameters
    ----------
    health_checker:
        :class:`HealthChecker` instance.
    device_ids:
        List of ADB device IDs to monitor.
    interval_s:
        Seconds between polling cycles.
    """

    def __init__(
        self,
        health_checker: HealthChecker,
        device_ids: list[str],
        interval_s: int = 60,
    ) -> None:
        self.checker = health_checker
        self.device_ids = device_ids
        self.interval_s = interval_s
        self._running = False
        self._thread: threading.Thread | None = None
        self._snapshot: dict[str, HealthStatus] = {}

    # ------------------------------------------------------------------
    @property
    def last_snapshot(self) -> dict[str, HealthStatus]:
        return dict(self._snapshot)

    def start(self, daemon: bool = True) -> None:
        if self._running:
            logger.warning("StatusPoller already running")
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._loop, daemon=daemon, name="StatusPoller"
        )
        self._thread.start()
        logger.info("StatusPoller started (interval=%ds, devices=%d)",
                    self.interval_s, len(self.device_ids))

    def stop(self, timeout: float = 5.0) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=timeout)
            self._thread = None
        logger.info("StatusPoller stopped")

    # ------------------------------------------------------------------
    def _loop(self) -> None:
        while self._running:
            self.poll()
            time.sleep(self.interval_s)

    def poll(self) -> dict[str, HealthStatus]:
        snapshot: dict[str, HealthStatus] = {}
        for did in self.device_ids:
            try:
                status = self.checker.check(did)
                if not status.healthy:
                    logger.warning(
                        "Device %s unhealthy: %s", did, "; ".join(status.issues)
                    )
            except Exception as exc:
                logger.error("Error polling %s: %s", did, exc, exc_info=True)
                status = HealthStatus(device_id=did, reachable=False)
                status.add_issue(str(exc))
            snapshot[did] = status
        self._snapshot = snapshot
        logger.debug("Polled %d device(s)", len(snapshot))
        return snapshot
