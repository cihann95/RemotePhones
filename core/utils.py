"""Shared utility functions for ADB shell operations.

Provides :func:`safe_shell`, a common wrapper that calls an ADB method,
catches exceptions, and returns a structured result dict.  This replaces
the duplicated ``_safe_shell`` methods that previously lived in
``core.phone``, ``core.mobile_ops``, and ``monitor.phone_health``.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def safe_shell(
    adb_client: Any,
    method_name: str,
    *args: Any,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Call a method on *adb_client*, catching common ADB exceptions.

    Parameters
    ----------
    adb_client:
        An :class:`ADBClient` instance (or any object with shell methods).
    method_name:
        Name of the method to call on *adb_client*
        (e.g. ``"shell_output"`` or ``"run_command"``).
    *args:
        Positional arguments forwarded to the method.
    **kwargs:
        Keyword arguments forwarded to the method.

    Returns
    -------
    dict
        ``{"ok": bool, "data": str, "error": str | None}``

        - On success: ``{"ok": True, "data": <method result>, "error": None}``
        - On failure: ``{"ok": False, "data": "", "error": "<exception message>"}``
    """
    try:
        result = getattr(adb_client, method_name)(*args, **kwargs)
        return {"ok": True, "data": result, "error": None}
    except Exception as exc:
        logger.warning("safe_shell(%s) failed: %s", method_name, exc)
        return {"ok": False, "data": "", "error": str(exc)}