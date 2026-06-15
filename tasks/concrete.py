"""Concrete task definitions used by the scheduler.

Register via :class:`tasks.registry.TaskRegistry`::

    from tasks.concrete import ALL
    registry.register_all(ALL)
"""

from __future__ import annotations

import logging
import time

from core.mobile_ops import not_up, MobileOperations
from tasks.base_task import BaseTask, TaskConfig, TaskResult
from automations.instagram import InstagramFollowTask
from automations.instagram_flow import InstagramFollowSequenceTask
from tasks.phone_call import (
    PhoneCallTask,
    PhoneAnswerTask,
    PhoneRejectTask,
    PhoneHangUpTask,
    PhoneCallMonitorTask,
)

logger = logging.getLogger(__name__)


# ── configuration fragments ──────────────────────────────────────────────────
_APP_INSTALL = TaskConfig(
    name="app_install",
    task_type="app_install",
    timeout_s=120,
    retries=1,
    retry_delay_s=10,
    expected_device_state="online",
    params_schema={"apk_path": {"type": "string", "required": True}},
)

_APP_LAUNCH = TaskConfig(
    name="app_launch",
    task_type="app_launch",
    timeout_s=30,
    retries=2,
    retry_delay_s=3,
    expected_device_state="online",
    params_schema={
        "package_name": {"type": "string", "required": True},
        "activity":     {"type": "string", "default": ""},
    },
)

_SCREENSHOT = TaskConfig(
    name="screenshot",
    task_type="screenshot",
    timeout_s=30,
    retries=1,
    retry_delay_s=5,
    expected_device_state="online",
    params_schema={"remote": {"type": "string", "default": "/sdcard/screen.png"}},
)

_SWIPE_SEQUENCE = TaskConfig(
    name="swipe_sequence",
    task_type="swipe_sequence",
    timeout_s=120,
    retries=1,
    expected_device_state="online",
    params_schema={
        "count":  {"type": "int", "default": 5},
        "delay_s": {"type": "float", "default": 1.0},
    },
)


# ── concrete tasks ───────────────────────────────────────────────────────────
class AppInstallTask(BaseTask):
    config = _APP_INSTALL

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(False,
                              error=f"Device {device_id} not {self.config.expected_device_state}")

        apk_path = params.get("apk_path", "")
        if not isinstance(apk_path, str) or not apk_path.endswith(".apk"):
            return TaskResult(False, error="Missing or invalid 'apk_path'")

        adb = self._adb(device_id)
        if adb is not not_up:
            r = adb.install_apk(str(apk_path), device_id)
            return TaskResult(r["ok"], data=r)

        return TaskResult(False, error=f"Device {device_id} not reachable")

    def _adb(self, device_id: str) -> MobileOperations | object:
        dm = self.device_manager
        if dm is None:
            return not_up
        adb_client = dm.adb
        return MobileOperations(adb_client) if adb_client else not_up


class AppLaunchTask(BaseTask):
    config = _APP_LAUNCH

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(False,
                              error=f"Device {device_id} not {self.config.expected_device_state}")

        package_name = str(params.get("package_name", ""))
        activity = str(params.get("activity", ""))
        if not package_name:
            return TaskResult(False, error="Missing 'package_name'")

        if not self.validate(params):
            return TaskResult(False, error="Invalid params")

        adb = self._adb(device_id)
        if adb is not not_up:
            r = adb.launch(package_name, activity if activity else None, device_id)
            return TaskResult(r["ok"], data=r)

        return TaskResult(False, error=f"Device {device_id} not reachable")

    def validate(self, params: dict[str, object]) -> bool:
        return isinstance(params.get("package_name"), str) and bool(str(params["package_name"]))

    def _adb(self, device_id: str) -> MobileOperations | object:
        dm = self.device_manager
        if dm is None:
            return not_up
        return MobileOperations(dm.adb) if dm.adb else not_up


class ScreenshotTask(BaseTask):
    config = _SCREENSHOT

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(False, error=f"Device {device_id} not ready")

        remote = str(params.get("remote", "/sdcard/screen.png"))
        dm = self.device_manager
        if dm:
            adb = MobileOperations(dm.adb)
            r = adb.screenshot(remote, device_id)
            return TaskResult(r["ok"], data=r)
        return TaskResult(False, error="No DeviceManager")

    def _adb(self, device_id: str) -> MobileOperations | object:
        dm = self.device_manager
        if dm is None:
            return not_up
        return MobileOperations(dm.adb) if dm.adb else not_up


class SwipeSequenceTask(BaseTask):
    config = _SWIPE_SEQUENCE

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(False, error=f"Device {device_id} not ready")

        count = int(params.get("count", 5))
        delay = float(params.get("delay_s", 1.0))

        dm = self.device_manager
        if dm:
            adb = MobileOperations(dm.adb)
            for i in range(count):
                r = adb.swipe_up(device_id)
                if not r["ok"]:
                    return TaskResult(False, error=f"Swipe {i} failed", data={"swipe": i, "total": count})
                time.sleep(delay)
            return TaskResult(True, data={"swipes": count})

        return TaskResult(False, error="No DeviceManager")

    def _adb(self, device_id: str) -> MobileOperations | object:
        dm = self.device_manager
        if dm is None:
            return not_up
        return MobileOperations(dm.adb) if dm.adb else not_up


# ── registry shortcut ────────────────────────────────────────────────────────
ALL = [
    AppInstallTask,
    AppLaunchTask,
    ScreenshotTask,
    SwipeSequenceTask,
    PhoneCallTask,
    PhoneAnswerTask,
    PhoneRejectTask,
    PhoneHangUpTask,
    PhoneCallMonitorTask,
    InstagramFollowTask,
    InstagramFollowSequenceTask,
]


def register_all(registry: object) -> None:
    for cls in ALL:
        registry.register(cls)
