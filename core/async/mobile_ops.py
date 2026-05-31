"""AsyncMobileOperations — asynchronous USB helpers built on AsyncADBClient."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional, Tuple

from .adb import AsyncADBClient

logger = logging.getLogger(__name__)

not_up = object()          # sentinel — device not connected
disconnect = object()      # sentinel — device dropped during operation


class AsyncMobileOperations:
    """Thin, idempotent ADB helpers asynchronously.

    Parameters
    ----------
    adb:
        :class:`AsyncADBClient` instance.
    """

    def __init__(self, adb: AsyncADBClient) -> None:
        self.adb = adb
        self.log = logger

    # helpers ------------------------------------------------------------------
    @staticmethod
    def _result(ok: bool, **kwargs: Any) -> Dict[str, Any]:
        return {"ok": ok, **kwargs}

    async def _safe_shell(self, cmd: str, timeout: int = 30,
                          device_id: Optional[str] = None) -> Tuple[str, bool]:
        """Execute shell command safely with exception handling."""
        try:
            out = await self.adb.shell_output(cmd, device_id=device_id, timeout=timeout)
            return out, True
        except Exception as exc:
            self.log.warning("shell(%s) failed: %s", cmd, exc)
            return "", False

    async def alive(self, device_id: Optional[str] = None) -> bool:
        """Return ``True`` if ``adb get-state`` reports 'device'."""
        out, ok = await self._safe_shell("get-state 2>/dev/null", device_id=device_id)
        return ok and out.strip() == "device"

    # screen & touch -----------------------------------------------------------
    async def screenshot(self, remote: str = "/sdcard/screen.png",
                         device_id: Optional[str] = None) -> Dict[str, Any]:
        """Take screenshot asynchronously."""
        await self.adb.screencap(remote, device_id=device_id)
        return self._result(True, remote=remote)

    async def tap(self, x: int, y: int, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Tap at coordinates asynchronously."""
        await self.adb.tap(x, y, device_id=device_id)
        return self._result(True, x=x, y=y)

    async def swipe(
        self,
        x1: int, y1: int,
        x2: int, y2: int,
        duration_ms: int = 400,
        device_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Swipe from (x1,y1) to (x2,y2) asynchronously."""
        await self.adb.swipe(x1, y1, x2, y2, duration_ms=duration_ms, device_id=device_id)
        return self._result(True, x1=x1, y1=y1, x2=x2, y2=y2)

    async def swipe_up(self, device_id: Optional[str] = None,
                       duration_ms: int = 400,
                       screen_height: int = 1600) -> Dict[str, Any]:
        """Swipe up asynchronously.  Pass ``screen_height`` for non-default resolutions."""
        mid_x = 500
        start_y = int(screen_height * 0.75)
        end_y = int(screen_height * 0.25)
        return await self.swipe(mid_x, start_y, mid_x, end_y,
                                duration_ms=duration_ms, device_id=device_id)

    async def swipe_down(self, device_id: Optional[str] = None,
                         duration_ms: int = 400,
                         screen_height: int = 1600) -> Dict[str, Any]:
        """Swipe down asynchronously.  Pass ``screen_height`` for non-default resolutions."""
        mid_x = 500
        start_y = int(screen_height * 0.25)
        end_y = int(screen_height * 0.75)
        return await self.swipe(mid_x, start_y, mid_x, end_y,
                                duration_ms=duration_ms, device_id=device_id)

    # apps ---------------------------------------------------------------------
    async def install_apk(self, apk_path: str,
                          device_id: Optional[str] = None) -> Dict[str, Any]:
        """Install APK asynchronously."""
        try:
            await self.adb.install(apk_path, device_id=device_id)
            return self._result(True, apk=apk_path)
        except Exception as exc:
            return self._result(False, error=str(exc))

    async def uninstall_pkg(self, package: str,
                            device_id: Optional[str] = None) -> Dict[str, Any]:
        """Uninstall package asynchronously."""
        try:
            await self.adb.uninstall(package, device_id=device_id)
            return self._result(True, package=package)
        except Exception as exc:
            # exit code != 0 when the package was not installed — not an error
            self.log.debug("uninstall %s: %s", package, exc)
            return self._result(True, package=package)

    async def launch(self, package: str, activity: str,
                     device_id: Optional[str] = None) -> Dict[str, Any]:
        """Launch app activity asynchronously."""
        try:
            await self.adb.launch(package, activity, device_id=device_id)
            return self._result(True, package=package, activity=activity)
        except Exception as exc:
            return self._result(False, error=str(exc))

    # ui automation ------------------------------------------------------------
    async def dump_ui(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Dump UI hierarchy asynchronously."""
        out, ok = await self._safe_shell(
            "uiautomator dump /sdcard/dump.xml 2>/dev/null; "
            "cat /sdcard/dump.xml 2>/dev/null",
            device_id=device_id,
        )
        return self._result(ok, xml=out.strip())

    async def get_text(self, device_id: Optional[str] = None) -> str:
        """Get current focused text asynchronously."""
        out, _ = await self._safe_shell("dumpsys window | grep mCurrentFocus",
                                       device_id=device_id)
        return out.strip()

    async def current_focus(self, device_id: Optional[str] = None) -> str:
        """Get current focus asynchronously."""
        out, _ = await self._safe_shell(
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
        "volume_down": "25",
        "power":      "26",
        "menu":       "82",
        "search":     "84",
    }

    async def press_key(self, key_name: str,
                        device_id: Optional[str] = None) -> Dict[str, Any]:
        """Send a hardware key event (home / back / recent / volume_up / …) asynchronously.

        Parameters
        ----------
        key_name:
            One of the keys in :attr:`_KEYEVENT`.
        device_id:
            ADB serial ID.
        """
        code = self._KEYEVENT.get(key_name.lower(), key_name)
        await self.adb.run_command(["shell", "input", "keyevent", code], device_id=device_id)
        return self._result(True, key=key_name, code=code)

    async def press_home(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Press home key asynchronously."""
        return await self.press_key("home", device_id=device_id)

    async def press_back(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Press back key asynchronously."""
        return await self.press_key("back", device_id=device_id)

    async def press_recent(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Press recent key asynchronously."""
        return await self.press_key("recent", device_id=device_id)

    async def volume_up(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Volume up asynchronously."""
        return await self.press_key("volume_up", device_id=device_id)

    async def volume_down(self, device_id: Optional[str] = None) -> Dict[str, Any]:
        """Volume down asynchronously."""
        return await self.press_key("volume_down", device_id=device_id)

    # ── browser / URL ────────────────────────────────────────────────────────

    async def open_url(self, url: str, browser_package: Optional[str] = None,
                       device_id: Optional[str] = None) -> Dict[str, Any]:
        """Open URL in browser asynchronously.

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
        await self.adb.run_command([
            "shell", "am", "start", "-a", "android.intent.action.VIEW",
            "-d", safe, pkg,
        ], device_id=device_id)
        return self._result(True, url=url, package=pkg)

    # ── scroll / fling ────────────────────────────────────────────────────────

    async def scroll_swipe(self, direction: str = "down",
                           steps: int = 3,
                           duration_ms: int = 300,
                           device_id: Optional[str] = None) -> Dict[str, Any]:
        """Fling-style scroll in *direction* ('up', 'down', 'left', 'right') asynchronously.

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
            await self.adb.swipe(x1, y1, x2, y2, duration_ms=duration_ms,
                               device_id=device_id)
            await asyncio.sleep(0.3)  # Non-blocking sleep
        return self._result(True, direction=direction, steps=steps)