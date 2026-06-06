"""PhoneOperations — ADB-based phone call control.

Provides methods to make outgoing calls, answer/reject incoming calls,
hang up active calls, monitor call state, and read CSV number lists.
Follows the MobileOperations pattern for consistency.
"""

from __future__ import annotations

import csv
import io
import logging
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from core.adb import ADBClient, ADBTimeoutError, DeviceDisconnectedError, DeviceOfflineError, DeviceUnauthorizedError, LowStorageError, ADBInstallError, ADBPullError, ADBPushError

logger = logging.getLogger(__name__)

# Call states from dumpsys telephony.registry
_CALL_STATE_NAMES = {
    0: "idle",
    1: "ringing",
    2: "offhook",
    3: "waiting",
}

_NUMBER_PATTERN = re.compile(r"^\+?\d{7,15}$")
_BULK_GROUP_SIZE = 50
_BULK_GROUP_DELAY_S = 10.0


class PhoneOperations:
    """ADB helpers for phone call control.

    Parameters
    ----------
    adb:
        :class:`ADBClient` instance.
    """

    _MIN_CALL_INTERVAL_S: float = 2.0

    def __init__(self, adb: ADBClient) -> None:
        self.adb = adb
        self.log = logger
        self._call_lock = threading.Lock()
        self._last_call_ts: float = 0.0

    def _check_device_state(self, device_id: Optional[str] = None) -> Tuple[bool, str]:
        """Check if device is online, authorized, and has sufficient storage."""
        try:
            state_out = self.adb.shell_output("get-state", device_id=device_id, timeout=10).strip()
            if "offline" in state_out.lower():
                return False, "Device is offline"
            if "unauthorized" in state_out.lower():
                return False, "Device is unauthorized"
            
            storage_out = self.adb.shell_output("df /data", device_id=device_id, timeout=10)
            lines = storage_out.strip().split('\n')
            if len(lines) >= 2:
                parts = lines[1].split()
                if len(parts) >= 4:
                    available_kb = int(parts[3])
                    if available_kb < 50 * 1024:  # Less than 50MB
                        return False, "Device has low storage"
            return True, ""
        except DeviceOfflineError:
            return False, "Device is offline"
        except DeviceUnauthorizedError:
            return False, "Device is unauthorized"
        except LowStorageError:
            return False, "Device has low storage"
        except DeviceDisconnectedError:
            return False, "Device is disconnected"
        except Exception as exc:
            self.log.warning("Failed to check device state: %s", exc)
            return False, str(exc)

    # helpers ------------------------------------------------------------------
    @staticmethod
    def _result(ok: bool, **kwargs: Any) -> Dict[str, Any]:
        return {"ok": ok, **kwargs}

    def _safe_shell(
        self,
        cmd: str,
        timeout: int = 30,
        device_id: Optional[str] = None,
    ) -> Tuple[str, bool]:
        try:
            out = self.adb.shell_output(cmd, device_id=device_id, timeout=timeout)
            return out, True
        except (DeviceDisconnectedError, DeviceOfflineError, DeviceUnauthorizedError, 
                LowStorageError, ADBTimeoutError, ADBInstallError, ADBPullError, ADBPushError, Exception) as exc:
            self.log.warning("shell(%s) failed: %s", cmd, exc)
            return "", False

    def _validate_number(self, number: str) -> Tuple[bool, str]:
        """Validate phone number format. Returns (is_valid, error_message)."""
        if not number or not isinstance(number, str):
            return False, "Number must be a non-empty string"
        if not _NUMBER_PATTERN.match(number):
            return (
                False,
                f"Invalid number format: {number!r}. "
                "Expected +XXXXXXXXXXX (7-15 digits, optional leading +)",
            )
        return True, ""

    @staticmethod
    def _parse_call_state(output: str) -> int:
        """Extract mCallState integer from dumpsys telephony.registry output."""
        match = re.search(r"mCallState=(\d+)", output)
        if match:
            return int(match.group(1))
        return -1  # unknown

    # phone operations --------------------------------------------------------
    def call(
        self, number: str, device_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Initiate an outgoing phone call.

        Parameters
        ----------
        number:
            Phone number in international format (e.g. ``+905XXXXXXXXX``).
        device_id:
            ADB serial ID.  Falls back to default device.
        """
        # Enforce minimum interval between consecutive calls (SIM card protection)
        now = time.time()
        elapsed = now - self._last_call_ts
        if elapsed < self._MIN_CALL_INTERVAL_S:
            time.sleep(self._MIN_CALL_INTERVAL_S - elapsed)

        valid, err = self._validate_number(number)
        if not valid:
            return self._result(False, error=err)

        with self._call_lock:
            _succeeded = False
            try:
                self.adb.shell_output(
                    f"am start -a android.intent.action.CALL -d tel:{number}",
                    device_id=device_id,
                    timeout=30,
                )
                time.sleep(3)  # brief wait for call to connect

                out, ok = self._safe_shell(
                    "dumpsys telephony.registry | grep mCallState",
                    timeout=10,
                    device_id=device_id,
                )
                state = self._parse_call_state(out) if ok else -1
                _succeeded = True
                self._last_call_ts = time.time()
                return self._result(
                    True,
                    state=state,
                    state_name=_CALL_STATE_NAMES.get(state, "unknown"),
                )
            except Exception as exc:
                self.log.error("call(***) failed: %s", exc)
                return self._result(False, error=str(exc))
            finally:
                if not _succeeded:
                    try:
                        out, ok = self._safe_shell(
                            "dumpsys telephony.registry | grep mCallState",
                            timeout=5,
                            device_id=device_id,
                        )
                        if ok and self._parse_call_state(out) == 2:
                            self.log.warning(
                                "Call still active after failed call() — auto-hanging up"
                            )
                            self.adb.shell_output(
                                "input keyevent 6",
                                device_id=device_id,
                                timeout=10,
                            )
                    except Exception:
                        pass

    def answer(
        self, device_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Answer an incoming call.

        Tries ``input keyevent 5`` twice as some devices require it.
        """
        with self._call_lock:
            try:
                # First attempt
                self.adb.shell_output(
                    "input keyevent 5", device_id=device_id, timeout=10
                )
                time.sleep(1)

                # Check state
                out, ok = self._safe_shell(
                    "dumpsys telephony.registry | grep mCallState",
                    timeout=5,
                    device_id=device_id,
                )
                state = self._parse_call_state(out) if ok else -1

                # Second attempt if still ringing
                if state == 1:
                    self.log.info(
                        "Still ringing after first answer attempt, trying again"
                    )
                    self.adb.shell_output(
                        "input keyevent 5", device_id=device_id, timeout=10
                    )
                    time.sleep(1)

                    out, ok = self._safe_shell(
                        "dumpsys telephony.registry | grep mCallState",
                        timeout=5,
                        device_id=device_id,
                    )
                    state = self._parse_call_state(out) if ok else -1

                return self._result(
                    True,
                    state=state,
                    state_name=_CALL_STATE_NAMES.get(state, "unknown"),
                )
            except Exception as exc:
                self.log.error("answer() failed: %s", exc)
                return self._result(False, error=str(exc))

    def hang_up(
        self, device_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """End the active phone call via ``input keyevent 6``."""
        with self._call_lock:
            try:
                self.adb.shell_output(
                    "input keyevent 6", device_id=device_id, timeout=10
                )
                time.sleep(1)

                out, ok = self._safe_shell(
                    "dumpsys telephony.registry | grep mCallState",
                    timeout=5,
                    device_id=device_id,
                )
                state = self._parse_call_state(out) if ok else -1
                return self._result(
                    True,
                    state=state,
                    state_name=_CALL_STATE_NAMES.get(state, "unknown"),
                )
            except Exception as exc:
                self.log.error("hang_up() failed: %s", exc)
                return self._result(False, error=str(exc))

    def reject(
        self, device_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Reject an incoming call via ``input keyevent 79``."""
        with self._call_lock:
            try:
                self.adb.shell_output(
                    "input keyevent 79", device_id=device_id, timeout=10
                )
                time.sleep(1)

                out, ok = self._safe_shell(
                    "dumpsys telephony.registry | grep mCallState",
                    timeout=5,
                    device_id=device_id,
                )
                state = self._parse_call_state(out) if ok else -1
                return self._result(
                    True,
                    state=state,
                    state_name=_CALL_STATE_NAMES.get(state, "unknown"),
                )
            except Exception as exc:
                self.log.error("reject() failed: %s", exc)
                return self._result(False, error=str(exc))

    def get_call_state(
        self, device_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Query current call state via ``dumpsys telephony.registry``."""
        try:
            out, ok = self._safe_shell(
                "dumpsys telephony.registry | grep mCallState",
                timeout=10,
                device_id=device_id,
            )
            if not ok:
                return self._result(False, error="Failed to query call state")
            state = self._parse_call_state(out)
            return self._result(
                True,
                state=state,
                state_name=_CALL_STATE_NAMES.get(state, "unknown"),
            )
        except Exception as exc:
            self.log.error("get_call_state() failed: %s", exc)
            return self._result(False, error=str(exc))

    def wait_for_state(
        self,
        target_state: int,
        timeout_s: int = 30,
        device_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Wait until call state matches *target_state* or timeout.

        Uses 1-second polling intervals to avoid slow ``dumpsys`` overhead.
        """
        start = time.monotonic()
        last_state = -1
        while time.monotonic() - start < timeout_s:
            out, ok = self._safe_shell(
                "dumpsys telephony.registry | grep mCallState",
                timeout=5,
                device_id=device_id,
            )
            if ok:
                state = self._parse_call_state(out)
                last_state = state
                if state == target_state:
                    return self._result(
                        True,
                        state=state,
                        state_name=_CALL_STATE_NAMES.get(state, "unknown"),
                        elapsed_s=round(time.monotonic() - start, 2),
                    )
            time.sleep(1)

        return self._result(
            False,
            error=f"Timeout after {timeout_s}s waiting for state {target_state}",
            last_state=last_state,
            last_state_name=_CALL_STATE_NAMES.get(last_state, "unknown"),
        )

    # CSV utility --------------------------------------------------------------
    @staticmethod
    def read_csv_numbers(csv_path: str) -> Dict[str, Any]:
        """Read phone numbers from a CSV file.

        Expected CSV format::

            number,name
            +905XXXXXXXXX,Ali
            +905YYYYYYYY,Veli

        Returns
        -------
        dict
            ``{"numbers": [...], "warnings": [...]}``
        """
        numbers: List[Dict[str, str]] = []
        warnings: List[str] = []

        try:
            with open(csv_path, "r", encoding="utf-8") as fh:
                content = fh.read()
            if not content.strip():
                warnings.append("CSV file is empty")
                return {"numbers": numbers, "warnings": warnings}
            
            reader = csv.DictReader(io.StringIO(content))
            if "number" not in (reader.fieldnames or []):
                warnings.append("CSV missing required 'number' column")
                return {"numbers": numbers, "warnings": warnings}
                
            for idx, row in enumerate(reader, start=2):  # header is line 1
                num = (row.get("number") or "").strip()
                name = (row.get("name") or "").strip()

                # Skip empty or comment lines
                if not num or num.startswith("#"):
                    continue

                if _NUMBER_PATTERN.match(num):
                    numbers.append({"number": num, "name": name})
                else:
                    warnings.append(f"Line {idx}: Invalid number format")
        except FileNotFoundError:
            warnings.append(f"CSV file not found: {csv_path}")
        except Exception as exc:
            warnings.append(f"CSV read error: {exc}")

        return {"numbers": numbers, "warnings": warnings}

    @staticmethod
    def read_csv_string(csv_data: str) -> Dict[str, Any]:
        """Read phone numbers from a CSV string.

        Expected CSV format::

            number,name
            +905XXXXXXXXX,Ali
            +905YYYYYYYY,Veli

        Parameters
        ----------
        csv_data:
            CSV content as a string.

        Returns
        -------
        dict
            ``{"numbers": [...], "warnings": [...]}``
        """
        numbers: List[Dict[str, str]] = []
        warnings: List[str] = []

        if not csv_data or not csv_data.strip():
            warnings.append("CSV data is empty")
            return {"numbers": numbers, "warnings": warnings}

        try:
            reader = csv.DictReader(io.StringIO(csv_data))
            if "number" not in (reader.fieldnames or []):
                warnings.append("CSV missing required 'number' column")
                return {"numbers": numbers, "warnings": warnings}
                
            for idx, row in enumerate(reader, start=2):  # header is line 1
                num = (row.get("number") or "").strip()
                name = (row.get("name") or "").strip()

                # Skip empty or comment lines
                if not num or num.startswith("#"):
                    continue

                if _NUMBER_PATTERN.match(num):
                    numbers.append({"number": num, "name": name})
                else:
                    warnings.append(f"Line {idx}: Invalid number format")
        except Exception as exc:
            warnings.append(f"CSV read error: {exc}")

        return {"numbers": numbers, "warnings": warnings}

    def bulk_call_from_csv(
        self,
        csv_path: str,
        device_id: Optional[str] = None,
        group_size: int = _BULK_GROUP_SIZE,
        group_delay_s: float = _BULK_GROUP_DELAY_S,
    ) -> Dict[str, Any]:
        """Process a CSV of numbers in batches to avoid SIM/network overload.

        For 1000+ numbers, splits into groups (default 50 per group) with a
        delay between groups.  Returns per-group results and overall summary.
        """
        csv_result = self.read_csv_numbers(csv_path)
        warnings = csv_result.get("warnings", [])
        numbers = csv_result.get("numbers", [])

        if not numbers:
            return {
                "ok": False,
                "error": "No valid numbers found in CSV",
                "warnings": warnings,
                "results": [],
            }

        total = len(numbers)
        groups = [numbers[i:i + group_size] for i in range(0, total, group_size)]
        total_groups = len(groups)

        self.log.info(
            "Bulk call: %d numbers split into %d groups (size=%d, delay=%.1fs)",
            total, total_groups, group_size, group_delay_s,
        )

        if total > group_size:
            warnings.append(
                f"Processing {total} numbers in {total_groups} groups "
                f"of up to {group_size} with {group_delay_s}s delay between groups"
            )

        group_results: List[Dict[str, Any]] = []
        success_count = 0
        fail_count = 0

        for group_idx, group in enumerate(groups):
            if group_idx > 0:
                self.log.info(
                    "Waiting %.1fs before group %d/%d ...",
                    group_delay_s, group_idx + 1, total_groups,
                )
                time.sleep(group_delay_s)

            group_success = 0
            group_fail = 0
            for entry in group:
                num = entry["number"]
                result = self.call(number=num, device_id=device_id)
                if result.get("ok"):
                    group_success += 1
                else:
                    group_fail += 1
                time.sleep(self._MIN_CALL_INTERVAL_S)

            success_count += group_success
            fail_count += group_fail
            group_results.append({
                "group": group_idx + 1,
                "total_groups": total_groups,
                "count": len(group),
                "success": group_success,
                "failed": group_fail,
            })

        return {
            "ok": True,
            "total_numbers": total,
            "total_groups": total_groups,
            "success": success_count,
            "failed": fail_count,
            "group_results": group_results,
            "warnings": warnings,
        }
