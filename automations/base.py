"""Base automation building blocks for per-device workflows."""

from __future__ import annotations

import logging
from typing import Any

from core.adb import ADBClient

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
                 duration_ms: int = 400,
                 screen_width: int = 1080,
                 screen_height: int = 1920) -> None:
        """Generic scroll-up gesture.

        Uses proportional coordinates (75% down to 25% up) for device-agnostic automation.
        """
        mid_x = int(screen_width * 0.5)
        start_y = int(screen_height * 0.75)
        end_y = int(screen_height * 0.25)
        self.adb.swipe(mid_x, start_y, mid_x, end_y,
                       duration_ms=duration_ms, device_id=device_id)

    def swipe_down(self, device_id: str | None = None,
                   duration_ms: int = 400,
                   screen_width: int = 1080,
                   screen_height: int = 1920) -> None:
        """Generic scroll-down gesture.

        Uses proportional coordinates (25% top to 75% bottom) for device-agnostic automation.
        """
        mid_x = int(screen_width * 0.5)
        start_y = int(screen_height * 0.25)
        end_y = int(screen_height * 0.75)
        self.adb.swipe(mid_x, start_y, mid_x, end_y,
                       duration_ms=duration_ms, device_id=device_id)

    def screenshot(self, remote: str = "/sdcard/screen.png",
                   device_id: str | None = None) -> None:
        self.adb.screencap(path=remote, device_id=device_id)

    def tap_center(self, device_id: str | None = None,
                   screen_width: int = 1080,
                   screen_height: int = 1920) -> None:
        """Tap center of screen using proportional coordinates."""
        mid_x = int(screen_width * 0.5)
        mid_y = int(screen_height * 0.5)
        self.adb.tap(mid_x, mid_y, device_id=device_id)


class AutomationFlow(AutomationBase):
    """Composable sequence of automation actions.

    Subclasses add :meth:`step_*` methods and override :meth:`run`.
    """

    def run(self, device_id: str, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError("Subclasses must implement run()")