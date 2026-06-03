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

from core.adb import ADBClient

logger = logging.getLogger(__name__)

# Call states from dumpsys telephony.registry
_CALL_STATE_NAMES = {
    0: "idle",
    1: "ringing",
    2: "offhook",
    3: "waiting",
}

_NUMBER_PATTERN = re.compile(r"^\+?\d{7,15}$")


class PhoneOperations:
    """ADB helpers for phone call control.

    Parameters
    ----------
    adb:
        :class:`ADBClient` instance.
    """

    def __init__(self, adb: ADBClient) -> None:
        self.adb = adb
        self.log = logger
        self._call_lock = threading.Lock()

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
        except Exception as exc:
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
        valid, err = self._validate_number(number)
        if not valid:
            return self._result(False, error=err)

        with self._call_lock:
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
                return self._result(
                    True,
                    number=number,
                    state=state,
                    state_name=_CALL_STATE_NAMES.get(state, "unknown"),
                )
            except Exception as exc:
                self.log.error("call(%s) failed: %s", number, exc)
                return self._result(False, error=str(exc))
            finally:
                # Cleanup: if call is still active, hang up without re-acquiring lock
                try:
                    out, ok = self._safe_shell(
                        "dumpsys telephony.registry | grep mCallState",
                        timeout=5,
                        device_id=device_id,
                    )
                    if ok and self._parse_call_state(out) == 2:
                        self.log.warning(
                            "Call still active after call() — auto-hanging up"
                        )
                        self.adb.shell_output(
                            "input keyevent 6",
                            device_id=device_id,
                            timeout=10,
                        )
                except Exception:
                    pass  # best-effort cleanup

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
            reader = csv.DictReader(io.StringIO(content))
            for idx, row in enumerate(reader, start=2):  # header is line 1
                num = (row.get("number") or "").strip()
                name = (row.get("name") or "").strip()

                # Skip empty or comment lines
                if not num or num.startswith("#"):
                    continue

                if _NUMBER_PATTERN.match(num):
                    numbers.append({"number": num, "name": name})
                else:
                    warnings.append(f"Line {idx}: Invalid number format: {num}")
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

        try:
            reader = csv.DictReader(io.StringIO(csv_data))
            for idx, row in enumerate(reader, start=2):  # header is line 1
                num = (row.get("number") or "").strip()
                name = (row.get("name") or "").strip()

                # Skip empty or comment lines
                if not num or num.startswith("#"):
                    continue

                if _NUMBER_PATTERN.match(num):
                    numbers.append({"number": num, "name": name})
                else:
                    warnings.append(f"Line {idx}: Invalid number format: {num}")
        except Exception as exc:
            warnings.append(f"CSV read error: {exc}")

        return {"numbers": numbers, "warnings": warnings}
