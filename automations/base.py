"""Base automation building blocks for per-device workflows."""

from __future__ import annotations

import logging
from typing import Any

from core.adb import ADBClient
from core.device_manager import DeviceManager

logger = logging.getLogger(__name__)


class AutomationBase:
    """Shared helpers used by all concrete automation sequences.

    Parameters
    ----------
    adb:
        :class:`ADBClient` instance for raw shell/touch commands.
    """

    def __init__(self, adb: ADBClient) -> None:
        self.adb = adb
        self.log = logger

    # ------------------------------------------------------------------
    def swipe_up(self, device_id: str | None = None,
                 duration_ms: int = 400) -> None:
        """Generic scroll-up gesture."""
        self.adb.swipe(500, 1800, 500, 500, duration_ms=duration_ms,
                       device_id=device_id)

    def swipe_down(self, device_id: str | None = None,
                   duration_ms: int = 400) -> None:
        """Generic scroll-down gesture."""
        self.adb.swipe(500, 500, 500, 1800, duration_ms=duration_ms,
                       device_id=device_id)

    def screenshot(self, remote: str = "/sdcard/screen.png",
                   device_id: str | None = None) -> None:
        self.adb.screencap(path=remote, device_id=device_id)

    def tap_center(self, device_id: str | None = None) -> None:
        self.adb.tap(500, 1000, device_id=device_id)


class AutomationFlow(AutomationBase):
    """Composable sequence of automation actions.

    Subclasses add :meth:`step_*` methods and override :meth:`run`.
    """

    def run(self, device_id: str, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError("Subclasses must implement run()")
