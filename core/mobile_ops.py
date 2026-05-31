"""MobileOperations — high-level USB helpers built on ADBClient.

Subclasses add guarded, idempotent operations such as install, swipe,
tap, ui-automator dumps, and bulk loops.  ``disconnect`` and ``not_up``
act as sentinel values so callers can skip gracefully when a device
drops mid-flight without raising exceptions everywhere.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional, Tuple

from core.adb import ADBClient

logger = logging.getLogger(__name__)

not_up = object()          # sentinel — device not connected
disconnect = object()      # sentinel — device dropped during operation


class MobileOperations:
    """Thin, idempotent ADB helpers.

    Parameters
    ----------
    adb:
        :class:`ADBClient` instance.
    """

    def __init__(self, adb: ADBClient) -> None:
        self.adb = adb
        self.log = logger

    # helpers ------------------------------------------------------------------
    @staticmethod
    def _result(ok: bool, **kwargs: Any) -> Dict[str, Any]:
        return {"ok": ok, **kwargs}

    def _safe_shell(self, cmd: str, timeout: int = 30,
                    device_id: Optional[str] = None) -> Tuple[str, bool]:
        try:
            out = self.adb.shell_output(cmd, device_id=device_id, timeout=timeout)
            return out, True
        except Exception as exc:
            self.log.warning("shell(%s) failed: %s", cmd, exc)
            return "", False

    def alive(self, device_id: Optional[str] = None) -> bool:
        """Return ``True`` if ``adb get-state`` reports 'device'."""
        out, ok = self._safe_shell("get-state 2>/dev/null", device_id=device_id)
        return ok and out.strip() == "device"

    # screen & touch -----------------------------------------------------------
    def screenshot(self, remote: str = "/sdcard/screen.png",
                   device_id: Optional[str] = None) -> Dict[str, Any]:
        """Capture a screenshot on the device."""
        self.adb.screencap(remote, device_id=device_id)
        return self._result(True, remote=remote)

    def tap(self, x: int, y: int, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Tap at screen coordinates (x, y)."""
        self.adb.tap(x, y, device_id=device_id)
        return self._result(True, x=x, y=y)

    def swipe(
        self,
        x1: int, y1: int,
        x2: int, y2: int,
        duration_ms: int = 400,
        device_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Swipe from (x1, y1) to (x2, y2) over *duration_ms* milliseconds."""
        self.adb.swipe(x1, y1, x2, y2, duration_ms=duration_ms,
                       device_id=device_id)
        return self._result(True, x1=x1, y1=y1, x2=x2, y2=y2)

    def swipe_up(self, device_id: Optional[str] = None,
                 duration_ms: int = 400,
                 screen_height: int = 1600) -> Dict[str, Any]:
        """Swipe up on screen.  Pass ``screen_height`` for non-default resolutions."""
        mid_x = 500
        start_y = int(screen_height * 0.75)
        end_y = int(screen_height * 0.25)
        return self.swipe(mid_x, start_y, mid_x, end_y,
                          duration_ms=duration_ms, device_id=device_id)

    def swipe_down(self, device_id: Optional[str] = None,
                   duration_ms: int = 400,
                   screen_height: int = 1600) -> Dict[str, Any]:
        """Swipe down on screen.  Pass ``screen_height`` for non-default resolutions."""
        mid_x = 500
        start_y = int(screen_height * 0.25)
        end_y = int(screen_height * 0.75)
        return self.swipe(mid_x, start_y, mid_x, end_y,
                          duration_ms=duration_ms, device_id=device_id)

    # apps ---------------------------------------------------------------------
    def install_apk(self, apk_path: str,
                    device_id: Optional[str] = None) -> Dict[str, Any]:
        """Install an APK on the device (replace if installed)."""
        try:
            self.adb.install(apk_path, device_id=device_id)
            return self._result(True, apk=apk_path)
        except Exception as exc:
            return self._result(False, error=str(exc))

    def uninstall_pkg(self, package: str,
                      device_id: Optional[str] = None) -> Dict[str, Any]:
        """Uninstall a package from the device."""
        try:
            self.adb.uninstall(package, device_id=device_id)
            return self._result(True, package=package)
        except Exception as exc:
            # exit code != 0 when the package was not installed — not an error
            self.log.debug("uninstall %s: %s", package, exc)
            return self._result(True, package=package)

    def launch(self, package: str, activity: str,
               device_id: Optional[str] = None) -> Dict[str, Any]:
        """Launch an app activity on the device."""
        try:
            self.adb.launch(package, activity, device_id=device_id)
            return self._result(True, package=package, activity=activity)
        except Exception as exc:
            return self._result(False, error=str(exc))

    # ui automation ------------------------------------------------------------
    def dump_ui(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Dump the current UI hierarchy as XML."""
        out, ok = self._safe_shell(
            "uiautomator dump /sdcard/dump.xml 2>/dev/null; "
            "cat /sdcard/dump.xml 2>/dev/null",
            device_id=device_id,
        )
        return self._result(ok, xml=out.strip())

    def get_text(self, device_id: Optional[str] = None) -> str:
        """Return the current focused window text."""
        out, _ = self._safe_shell("dumpsys window | grep mCurrentFocus",
                                   device_id=device_id)
        return out.strip()

    def current_focus(self, device_id: Optional[str] = None) -> str:
        """Return the current window focus info."""
        out, _ = self._safe_shell(
            "dumpsys window | grep mCurrentFocus", device_id=device_id
        )
        return out.strip()

    # ── media & navigation ────────────────────────────────────────────────────

    #: keyevent codes from ``adb shell input keyevent --help``
    _KEYEVENT = {
        "home":       "3",
        "back":       "4",
        "recent":     "187",
        "volume_up":  "24",
        "volume_down":"25",
        "power":      "26",
        "menu":       "82",
        "search":     "84",
    }

    def press_key(self, key_name: str,
                  device_id: Optional[str] = None) -> Dict[str, Any]:
        """Send a hardware key event (home / back / recent / volume_up / …).

        Parameters
        ----------
        key_name:
            One of the keys in :attr:`_KEYEVENT`.
        device_id:
            ADB serial ID.
        """
        code = self._KEYEVENT.get(key_name.lower(), key_name)
        self.adb.run_command(["shell", "input", "keyevent", code],
                             device_id=device_id)
        return self._result(True, key=key_name, code=code)

    def press_home(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Press the home button."""
        return self.press_key("home", device_id=device_id)

    def press_back(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Press the back button."""
        return self.press_key("back", device_id=device_id)

    def press_recent(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Press the recent apps button."""
        return self.press_key("recent", device_id=device_id)

    def volume_up(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Press volume up."""
        return self.press_key("volume_up", device_id=device_id)

    def volume_down(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Press volume down."""
        return self.press_key("volume_down", device_id=device_id)

    # ── browser / URL ────────────────────────────────────────────────────────

    def open_url(self, url: str, browser_package: Optional[str] = None,
                 device_id: Optional[str] = None) -> Dict[str, Any]:
        """Open *url* in the given browser (or Chrome if none given).

        Parameters
        ----------
        url:
            HTTPS/HTTP URL (no spaces / control chars).
        browser_package:
            e.g. ``"com.android.chrome"``.  Defaults to Chrome.
        device_id:
            ADB serial ID.
        """
        pkg = browser_package or "com.android.chrome"
        safe = url.replace("&", "\\&").replace("|", "\\|")
        self.adb.run_command([
            "shell", "am", "start", "-a", "android.intent.action.VIEW",
            "-d", safe, pkg,
        ], device_id=device_id)
        return self._result(True, url=url, package=pkg)

    # ── scroll / fling ────────────────────────────────────────────────────────

    def scroll_swipe(self, direction: str = "down",
                     steps: int = 3,
                     duration_ms: int = 300,
                     device_id: Optional[str] = None) -> Dict[str, Any]:
        """Fling-style scroll in *direction* ('up', 'down', 'left', 'right').

        Uses ``input fling`` for a natural fling gesture (Android 10+).

        Parameters
        ----------
        direction:
            ``"up"``, ``"down"``, ``"left"``, ``"right"``.
        steps:
            Number of fling swipes to repeat.
        duration_ms:
            Duration of each fling in milliseconds.
        device_id:
            ADB serial ID.
        """
        direction = direction.lower()
        x1 = y1 = x2 = y2 = None
        if direction == "down":
            x1, y1, x2, y2 = 500, 600, 500, 1800
        elif direction == "up":
            x1, y1, x2, y2 = 500, 1800, 500, 600
        elif direction == "right":
            x1, y1, x2, y2 = 200, 1000, 800, 1000
        elif direction == "left":
            x1, y1, x2, y2 = 800, 1000, 200, 1000
        else:
            return self._result(False,
                                error=f"Invalid direction: {direction!r}")

        for _ in range(steps):
            self.adb.swipe(x1, y1, x2, y2, duration_ms=duration_ms,
                          device_id=device_id)
            time.sleep(0.3)
        return self._result(True, direction=direction, steps=steps)
