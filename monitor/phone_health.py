"""PhoneHealthChecker — SIM and signal strength health checks.

Follows the MobileOperations pattern: ``_result(ok, **kwargs)`` helper,
``_safe_shell()`` wrapper, and plain-dict return values.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional, Tuple

from core.adb import ADBClient
from core.utils import _safe_shell

logger = logging.getLogger(__name__)

# Call state names from dumpsys telephony.registry
_CALL_STATE_NAMES: Dict[int, str] = {
    0: "idle",
    1: "ringing",
    2: "offhook",
    3: "waiting",
}


class PhoneHealthChecker:
    """SIM ve sinyal gücü sağlık kontrolleri.

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

    def _safe_shell(
        self,
        cmd: str,
        timeout: int = 30,
        device_id: Optional[str] = None,
    ) -> Tuple[str, bool]:
        result = _safe_shell(self.adb, "run_command", ["shell", cmd], device_id=device_id, timeout=timeout)
        return result["data"], result["ok"]

    # sim status --------------------------------------------------------------
    def check_sim(
        self, device_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """SIM kartı durumunu sorgula.

        Returns
        -------
        dict
            ``{"ok": bool, "sim_state": str}``
            Common ``sim_state`` values: ``READY``, ``ABSENT``,
            ``PIN_REQUIRED``, ``PUK_REQUIRED``, ``NETWORK_LOCKED``,
            ``NOT_READY``, ``UNKNOWN``.
        """
        out, ok = self._safe_shell(
            "getprop gsm.sim.state", timeout=10, device_id=device_id
        )
        if not ok:
            return self._result(
                False, sim_state="UNKNOWN", error="Failed to query SIM state"
            )
        sim_state = out.strip()
        if not sim_state:
            return self._result(
                False,
                sim_state="UNKNOWN",
                error="Empty SIM state response",
            )
        return self._result(True, sim_state=sim_state)

    # signal strength ---------------------------------------------------------
    def check_signal(
        self, device_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Sinyal gücünü sorgula.

        Extracts ``mDbm`` value from ``dumpsys telephony.registry``.

        Returns
        -------
        dict
            ``{"ok": bool, "signal_dbm": int | None}``
        """
        out, ok = self._safe_shell(
            "dumpsys telephony.registry | grep mSignalStrength",
            timeout=10,
            device_id=device_id,
        )
        if not ok:
            return self._result(
                False,
                signal_dbm=None,
                error="Failed to query signal strength",
            )

        match = re.search(r"mDbm=(-?\d+)", out)
        if match:
            return self._result(True, signal_dbm=int(match.group(1)))
        return self._result(
            False,
            signal_dbm=None,
            error="Could not parse signal strength from output",
        )

    # full health -------------------------------------------------------------
    def full_health(
        self, device_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Kapsamlı telefon sağlık raporu.

        Birleştirir:
          - SIM durumu (``check_sim``)
          - Sinyal gücü (``check_signal``)
          - Arama durumu

        Returns
        -------
        dict
            ``{"ok": bool, "sim": dict, "signal": dict,
              "call_state": int, "call_state_name": str}``
        """
        sim_result = self.check_sim(device_id=device_id)
        signal_result = self.check_signal(device_id=device_id)

        # Call state
        out, ok = self._safe_shell(
            "dumpsys telephony.registry | grep mCallState",
            timeout=10,
            device_id=device_id,
        )
        call_state = -1
        call_state_name = "unknown"
        if ok:
            match = re.search(r"mCallState=(\d+)", out)
            if match:
                call_state = int(match.group(1))
                call_state_name = _CALL_STATE_NAMES.get(
                    call_state, "unknown"
                )

        combined_ok = bool(sim_result.get("ok")) or bool(
            signal_result.get("ok")
        )

        return self._result(
            combined_ok,
            sim=sim_result,
            signal=signal_result,
            call_state=call_state,
            call_state_name=call_state_name,
        )
