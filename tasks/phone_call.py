from __future__ import annotations

import re
import time
import logging

from core.adb import ADBClient
from core.phone import PhoneOperations
from tasks.base_task import BaseTask, TaskConfig, TaskResult

logger = logging.getLogger(__name__)

# ── phone call task configurations ──────────────────────────────────────────────────────
_PHONE_CALL = TaskConfig(
    name="phone_call",
    task_type="phone_call",
    timeout_s=60,
    retries=1,
    retry_delay_s=5,
    expected_device_state="online",
    params_schema={"number": {"type": "string", "required": True}},
)

_PHONE_ANSWER = TaskConfig(
    name="phone_answer",
    task_type="phone_answer",
    timeout_s=30,
    retries=1,
    retry_delay_s=5,
    expected_device_state="online",
    params_schema={},
)

_PHONE_REJECT = TaskConfig(
    name="phone_reject",
    task_type="phone_reject",
    timeout_s=30,
    retries=1,
    retry_delay_s=5,
    expected_device_state="online",
    params_schema={},
)

_PHONE_HANGUP = TaskConfig(
    name="phone_hangup",
    task_type="phone_hangup",
    timeout_s=30,
    retries=1,
    retry_delay_s=5,
    expected_device_state="online",
    params_schema={},
)

_PHONE_CALL_MONITOR = TaskConfig(
    name="phone_call_monitor",
    task_type="phone_call_monitor",
    timeout_s=120,
    retries=0,
    retry_delay_s=0,
    expected_device_state="online",
    params_schema={
        "duration_s": {"type": "number", "default": 30},
        "poll_interval_s": {"type": "number", "default": 1.0},
    },
)


# ── concrete phone call tasks ───────────────────────────────────────────────────────────
class PhoneCallTask(BaseTask):
    config = _PHONE_CALL

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(
                False,
                error=f"Device {device_id} not {self.config.expected_device_state}",
            )

        number = params.get("number")
        if number is None:
            return TaskResult(False, error="Missing required parameter: number")

        if not isinstance(number, str) or not re.match(r"^\+?\d{7,15}$", number):
            return TaskResult(
                False,
                error=f"Invalid number format: {number!r}. Expected +XXXXXXXXXXX (7-15 digits, optional leading +)",
            )

        try:
            # Get ADB client from device manager
            if self.device_manager is None:
                return TaskResult(False, error="DeviceManager not available")
            adb_client = self.device_manager.adb
            if adb_client is None:
                return TaskResult(False, error="ADB client not available")
            phone_ops = PhoneOperations(adb_client)
            result = phone_ops.call(number, device_id)
            if not result["ok"]:
                return TaskResult(False, error=result.get("error", "Call failed"))

            # Wait for call to connect and verify state
            time.sleep(5)
            state_result = phone_ops.get_call_state(device_id)
            if not state_result["ok"]:
                return TaskResult(False, error=state_result.get("error", "Failed to get call state"))

            return TaskResult(
                True,
                data={
                    "number": number,
                    "state": state_result["state"],
                    "state_name": state_result["state_name"],
                },
            )
        except Exception as exc:
            logger.error("PhoneCallTask.execute failed: %s", exc)
            return TaskResult(False, error=str(exc))


class PhoneAnswerTask(BaseTask):
    config = _PHONE_ANSWER

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(
                False,
                error=f"Device {device_id} not {self.config.expected_device_state}",
            )

        try:
            # Get ADB client from device manager
            if self.device_manager is None:
                return TaskResult(False, error="DeviceManager not available")
            adb_client = self.device_manager.adb
            if adb_client is None:
                return TaskResult(False, error="ADB client not available")
            phone_ops = PhoneOperations(adb_client)
            result = phone_ops.answer(device_id)
            if not result["ok"]:
                return TaskResult(False, error=result.get("error", "Answer failed"))

            # Wait for call to be answered
            time.sleep(3)
            state_result = phone_ops.get_call_state(device_id)
            if not state_result["ok"]:
                return TaskResult(False, error=state_result.get("error", "Failed to get call state"))

            # Verify we are in offhook state (state == 2)
            if state_result["state"] != 2:
                return TaskResult(
                    False,
                    error=f"Expected call state offhook (2), got {state_result['state']}",
                )

            return TaskResult(
                True,
                data={
                    "state": state_result["state"],
                    "state_name": state_result["state_name"],
                },
            )
        except Exception as exc:
            logger.error("PhoneAnswerTask.execute failed: %s", exc)
            return TaskResult(False, error=str(exc))


class PhoneRejectTask(BaseTask):
    config = _PHONE_REJECT

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(
                False,
                error=f"Device {device_id} not {self.config.expected_device_state}",
            )

        try:
            # Get ADB client from device manager
            if self.device_manager is None:
                return TaskResult(False, error="DeviceManager not available")
            adb_client = self.device_manager.adb
            if adb_client is None:
                return TaskResult(False, error="ADB client not available")
            phone_ops = PhoneOperations(adb_client)
            result = phone_ops.reject(device_id)
            if not result["ok"]:
                return TaskResult(False, error=result.get("error", "Reject failed"))

            # Wait for call to be rejected
            time.sleep(2)
            state_result = phone_ops.get_call_state(device_id)
            if not state_result["ok"]:
                return TaskResult(False, error=state_result.get("error", "Failed to get call state"))

            # Verify we are in idle state (state == 0)
            if state_result["state"] != 0:
                return TaskResult(
                    False,
                    error=f"Expected call state idle (0), got {state_result['state']}",
                )

            return TaskResult(
                True,
                data={
                    "state": state_result["state"],
                    "state_name": state_result["state_name"],
                },
            )
        except Exception as exc:
            logger.error("PhoneRejectTask.execute failed: %s", exc)
            return TaskResult(False, error=str(exc))


class PhoneHangUpTask(BaseTask):
    config = _PHONE_HANGUP

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(
                False,
                error=f"Device {device_id} not {self.config.expected_device_state}",
            )

        try:
            # Get ADB client from device manager
            if self.device_manager is None:
                return TaskResult(False, error="DeviceManager not available")
            adb_client = self.device_manager.adb
            if adb_client is None:
                return TaskResult(False, error="ADB client not available")
            phone_ops = PhoneOperations(adb_client)
            result = phone_ops.hang_up(device_id)
            if not result["ok"]:
                return TaskResult(False, error=result.get("error", "Hang up failed"))

            # Wait for call to end
            time.sleep(2)
            state_result = phone_ops.get_call_state(device_id)
            if not state_result["ok"]:
                return TaskResult(False, error=state_result.get("error", "Failed to get call state"))

            # Verify we are in idle state (state == 0)
            if state_result["state"] != 0:
                return TaskResult(
                    False,
                    error=f"Expected call state idle (0), got {state_result['state']}",
                )

            return TaskResult(
                True,
                data={
                    "state": state_result["state"],
                    "state_name": state_result["state_name"],
                },
            )
        except Exception as exc:
            logger.error("PhoneHangUpTask.execute failed: %s", exc)
            return TaskResult(False, error=str(exc))


class PhoneCallMonitorTask(BaseTask):
    config = _PHONE_CALL_MONITOR

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        if not self.pre_check(device_id):
            return TaskResult(
                False,
                error=f"Device {device_id} not {self.config.expected_device_state}",
            )

        duration_s = float(params.get("duration_s", 30))
        poll_interval_s = float(params.get("poll_interval_s", 1.0))

        try:
            # Get ADB client from device manager
            if self.device_manager is None:
                return TaskResult(False, error="DeviceManager not available")
            adb_client = self.device_manager.adb
            if adb_client is None:
                return TaskResult(False, error="ADB client not available")
            phone_ops = PhoneOperations(adb_client)
            call_states = []
            start_time = time.time()

            while time.time() - start_time < duration_s:
                state_result = phone_ops.get_call_state(device_id)
                if not state_result["ok"]:
                    logger.warning(
                        "Failed to get call state during monitoring: %s",
                        state_result.get("error", "unknown"),
                    )
                    # Continue monitoring even if one poll fails
                    state_result = {"state": -1, "state_name": "error"}

                call_states.append(
                    {
                        "state": state_result["state"],
                        "state_name": state_result["state_name"],
                        "timestamp": time.time(),
                    }
                )

                time.sleep(poll_interval_s)

            final_state = call_states[-1] if call_states else {"state": -1, "state_name": "unknown"}

            return TaskResult(
                True,
                data={
                    "states": call_states,
                    "final_state": final_state["state"],
                    "final_state_name": final_state["state_name"],
                },
            )
        except Exception as exc:
            logger.error("PhoneCallMonitorTask.execute failed: %s", exc)
            return TaskResult(False, error=str(exc))