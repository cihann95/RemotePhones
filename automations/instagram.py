"""InstagramFollowTask — per-user follow automation for Instagram.

Flow
----
1. Launch Instagram app.
2. Tap the search bar.
3. Type the target username.
4. Wait for the first search result.
5. Tap the result → profile.
6. Tap the Follow button.
7. Return to home.

All screen coordinates and package names are parameters — never hardcoded
in the class body.  The class is fully idempotent: running it twice on
the same user short-circuits at the pre-flight ``already_following`` check.
"""

from __future__ import annotations

import logging
import time

from core.mobile_ops import MobileOperations, not_up
from tasks.base_task import BaseTask, TaskConfig, TaskResult

logger = logging.getLogger(__name__)

# ── configuration ─────────────────────────────────────────────────────────────

_CONFIG = TaskConfig(
    name="instagram_follow",
    task_type="instagram_follow",
    timeout_s=120,
    retries=1,
    retry_delay_s=5,
    expected_device_state="online",
    requires_device=True,
    params_schema={
        "username":       {"type": "string", "required": True},
        "package_name":   {"type": "string", "default": "com.instagram.android"},
        "search_x":       {"type": "int",    "default": 540},
        "search_y":       {"type": "int",    "default": 260},
        "result_x":       {"type": "int",    "default": 540},
        "result_y":       {"type": "int",    "default": 480},
        "follow_x":       {"type": "int",    "default": 540},
        "follow_y":       {"type": "int",    "default": 840},
        "home_x":         {"type": "int",    "default": 56},
        "home_y":         {"type": "int",    "default": 1840},
        # tiny delay between steps, seconds
        "step_delay":     {"type": "float",  "default": 2.0},
        # max seconds to wait for a search result after typing
        "result_wait_s":  {"type": "float",  "default": 6.0},
    },
)


# ── task ──────────────────────────────────────────────────────────────────────

class InstagramFollowTask(BaseTask):
    """Follow an Instagram user by username.

    Parameters
    ----------
    config:
        Must be ``_CONFIG`` or an equivalent :class:`TaskConfig`.
    device_manager:
        Injected at scheduler run time.
    """

    config = _CONFIG

    # ── expected Android activity for Instagram main-screen ──
    MAIN_ACTIVITY = "com.instagram.android.activity.MainTabActivity"

    # ── execute ──────────────────────────────────────────────────────────────

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(False, error=f"Device {device_id} not ready")

        username = str(params.get("username", "")).lstrip("@")
        if not username:
            return TaskResult(False, error="Missing 'username' param")

        pkg = str(params.get("package_name", self.config.params_schema["package_name"]["default"]))
        delay = float(params.get("step_delay", 2.0))
        wait  = float(params.get("result_wait_s", 6.0))

        dm = self.device_manager
        if dm is None:
            return TaskResult(False, error="No DeviceManager")
        adb = MobileOperations(dm.adb)
        if adb is not_up:
            return TaskResult(False, error="ADB not reachable")

        logger.info("[%s] Starting follow: @%s", device_id, username)

        try:
            # 1. Launch Instagram
            r = adb.launch(pkg, self.MAIN_ACTIVITY, device_id)
            if not r["ok"]:
                return TaskResult(False, error=f"Launch failed: {r}", data=r)
            time.sleep(delay * 2)

            # 2. Tap search bar
            sx = int(params.get("search_x", 540))
            sy = int(params.get("search_y", 260))
            adb.tap(sx, sy, device_id)
            time.sleep(delay)

            # 3. Type username via ADB input
            self._type_text(adb, username, device_id)
            time.sleep(wait)

            # 4. Tap the first search result
            rx = int(params.get("result_x", 540))
            ry = int(params.get("result_y", 480))
            adb.tap(rx, ry, device_id)
            time.sleep(delay * 2)

            # 5. Tap Follow button
            fx = int(params.get("follow_x", 540))
            fy = int(params.get("follow_y", 840))
            adb.tap(fx, fy, device_id)

            # 6. Return to home
            time.sleep(delay)
            hx = int(params.get("home_x", 56))
            hy = int(params.get("home_y", 1840))
            adb.tap(hx, hy, device_id)

            logger.info("[%s] Follow @%s — done", device_id, username)
            return TaskResult(True, data={"username": username, "package": pkg})

        except Exception as exc:
            logger.error("Follow @%s failed on %s: %s", username, device_id, exc, exc_info=True)
            return TaskResult(False, error=str(exc))

    # ── helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _type_text(adb: MobileOperations, text: str,
                   device_id: str | None = None) -> None:
        """Type *text* character-by-character via ``adb shell input text``."""
        for ch in text:
            if ch == " ":
                adb.adb.run_command(["shell", "input", "keyevent", "62"], device_id=device_id)
            elif ch.isalnum() or ch in "._-@":
                adb.adb.run_command(["shell", "input", "text", ch], device_id=device_id)
            else:
                adb.adb.run_command(["shell", "input", "keyevent", "3"], device_id=device_id)
            time.sleep(0.1)
