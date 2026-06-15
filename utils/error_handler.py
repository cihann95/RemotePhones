"""Centralized error humanization — loads shared/error_messages.json and
matches raw error strings against known patterns to return structured,
user-friendly error information.

Usage::

    from utils.error_handler import humanize_error

    info = humanize_error("device offline")
    # -> {"id": "device_offline", "hint": "...", "fix_steps": [...],
    #     "severity": "error", "matched": True, "title": "...", "raw": "device offline"}
"""

from __future__ import annotations

import json
import os
import re
import sys
from functools import lru_cache
from typing import Any


_ERROR_MESSAGES_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "shared",
    "error_messages.json",
)

# Module-level cache so we load the JSON at most once per process.
_catalog: list[dict[str, Any]] | None = None


def load_error_catalog() -> list[dict[str, Any]]:
    """Load the centralized error message map from shared/error_messages.json.

    The catalog is cached in-process after the first successful load.
    Returns an empty list if the file cannot be read or parsed.
    """
    global _catalog
    if _catalog is not None:
        return _catalog

    try:
        with open(_ERROR_MESSAGES_PATH, "r", encoding="utf-8") as fh:
            _catalog = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(
            f"WARNING: Could not load error messages from {_ERROR_MESSAGES_PATH}: {exc}",
            file=sys.stderr,
        )
        _catalog = []

    return _catalog


def humanize_error(error_message: str) -> dict[str, Any]:
    """Match a raw error string against the error catalog and return
    structured, user-friendly information.

    Args:
        error_message: The raw error string (e.g. an ADB stderr line).

    Returns:
        A dict with keys:
            id         – catalog entry id (e.g. "device_offline")
            title      – human-readable title (Turkish)
            hint       – short fix suggestion
            fix_steps  – list of step-by-step instructions
            severity   – "error" for known matches, "warning" for fallback
            matched    – True if a pattern matched, False for the fallback
            raw        – the original *error_message* string
    """
    err_lower = error_message.lower()
    catalog = load_error_catalog()

    for entry in catalog:
        for pattern in entry.get("patterns", []):
            try:
                if re.search(pattern, err_lower):
                    return {
                        "id": entry["id"],
                        "title": entry["title"],
                        "hint": entry["hint"],
                        "fix_steps": entry.get("fix_steps", []),
                        "severity": "error",
                        "matched": True,
                        "raw": error_message,
                    }
            except re.error:
                # If the pattern is not a valid regex, fall back to
                # plain substring match.
                if pattern in err_lower:
                    return {
                        "id": entry["id"],
                        "title": entry["title"],
                        "hint": entry["hint"],
                        "fix_steps": entry.get("fix_steps", []),
                        "severity": "error",
                        "matched": True,
                        "raw": error_message,
                    }

    # No pattern matched — return the unknown_error fallback entry.
    fallback = next((e for e in catalog if e["id"] == "unknown_error"), None)
    if fallback:
        return {
            "id": fallback["id"],
            "title": fallback["title"],
            "hint": fallback["hint"],
            "fix_steps": fallback.get("fix_steps", []),
            "severity": "warning",
            "matched": False,
            "raw": error_message,
        }

    # Ultimate fallback if even the catalog is empty.
    return {
        "id": "unknown_error",
        "title": "Bilinmeyen hata",
        "hint": error_message,
        "fix_steps": [],
        "severity": "warning",
        "matched": False,
        "raw": error_message,
    }