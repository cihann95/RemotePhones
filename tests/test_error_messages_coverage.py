"""Tests for shared/error_messages.json — validates schema, regex compilation,
and minimum pattern count (45+ Turkish error patterns)."""

from __future__ import annotations

import json
import os
import re

import pytest

_JSON_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "shared",
    "error_messages.json",
)

_REQUIRED_FIELDS = ["id", "patterns", "title", "hint", "fix_steps", "severity"]
_VALID_SEVERITIES = {"error", "warning"}


@pytest.fixture(scope="session")
def catalog():
    with open(_JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_count_at_least_45(catalog):
    """Ensure the catalog has at least 45 patterns."""
    assert len(catalog) >= 45, f"Expected ≥45 entries, got {len(catalog)}"


def test_all_preserved_ids_exist(catalog):
    """Ensure all 22 original entries are still present."""
    original_ids = {
        "device_not_found",
        "adb_not_found",
        "device_offline",
        "task_failed",
        "device_id_invalid",
        "invalid_phone_number",
        "csv_file_not_found",
        "connection_timeout",
        "permission_denied",
        "device_unauthorized",
        "no_valid_numbers_in_csv",
        "call_failed",
        "config_not_found",
        "json_parse_error",
        "steps_file_not_array",
        "file_permission_error",
        "network_error",
        "license_expired",
        "memory_low",
        "disk_full",
        "adb_server_crash",
        "unknown_error",
    }
    ids = {e["id"] for e in catalog}
    missing = original_ids - ids
    assert not missing, f"Original entries missing: {missing}"
    assert "unknown_error" in ids, "Fallback unknown_error entry must exist"


def test_all_entries_have_required_fields(catalog):
    """Every entry must have all required fields."""
    for entry in catalog:
        for field in _REQUIRED_FIELDS:
            assert field in entry, (
                f"Entry '{entry.get('id', '?')}' missing required field: {field}"
            )


def test_all_titles_are_turkish_not_english(catalog):
    """Titles must be Turkish — reject common English words."""
    english_words = {"error", "failed", "not found", "invalid", "missing", "unknown",
                     "timeout", "denied", "crash", "failure", "time out"}
    for entry in catalog:
        title_lower = entry["title"].lower()
        for word in english_words:
            if word in title_lower:
                # Only flag if the Turkish equivalent also exists — e.g. "hata" for "error"
                # If it's purely English, fail.
                # Pragmatic check: if the title is entirely English ASCII with no Turkish chars
                has_turkish = any(ord(c) > 127 for c in entry["title"])
                assert has_turkish, (
                    f"Entry '{entry['id']}' title is English: '{entry['title']}'"
                )


def test_all_patterns_compile(catalog):
    """Every non-empty pattern string must compile as a valid regex."""
    for entry in catalog:
        for pattern in entry.get("patterns", []):
            try:
                re.compile(pattern)
            except re.error as exc:
                pytest.fail(
                    f"Entry '{entry['id']}' has invalid regex pattern "
                    f"'{pattern}': {exc}"
                )


def test_all_severities_are_valid(catalog):
    """severity must be 'error' or 'warning'."""
    for entry in catalog:
        sev = entry.get("severity", "")
        assert sev in _VALID_SEVERITIES, (
            f"Entry '{entry['id']}' has invalid severity: '{sev}'"
        )


def test_no_duplicate_ids(catalog):
    """All entry IDs must be unique."""
    ids = [e["id"] for e in catalog]
    duplicates = {eid for eid in ids if ids.count(eid) > 1}
    assert not duplicates, f"Duplicate IDs found: {duplicates}"


def test_unknown_error_has_empty_patterns(catalog):
    """The fallback 'unknown_error' entry must have an empty patterns list."""
    unknown = next((e for e in catalog if e["id"] == "unknown_error"), None)
    assert unknown is not None, "unknown_error entry missing"
    assert unknown.get("patterns") == [], (
        "unknown_error should have empty patterns list"
    )


def test_humanize_error_matches_known_patterns():
    """Test that humanize_error returns Turkish results for known errors."""
    # Use subprocess to avoid import path issues
    import subprocess
    import sys

    test_cases = [
        ("adb server not responding", "ADB"),
        ("device R58M20NBZK unauthorized", "yetkilendirilmemiş"),
        ("no devices found", "Cihaz bulunamadı"),
        ("connection timeout", "zaman aşımı"),
        ("permission denied", "reddedildi"),
        ("out of memory", "bellek"),
        ("phone_farm_cli not found", "CLI"),
        ("dns error", "DNS"),
        ("connection refused", "reddedildi"),
        ("certificate verify failed", "SSL"),
        ("invalid license key", "lisans"),
        ("overheat detected", "ısın"),
        ("aşırı ısınma", "ısın"),
        ("call rejected", "reddedildi"),
        ("no sim card", "SIM"),
        ("airplane mode", "Uçak"),
    ]

    for error_text, expected_word in test_cases:
        code = (
            "import sys; sys.path.insert(0, '.'); "
            "from utils.error_handler import humanize_error; "
            f"r = humanize_error('{error_text}'); "
            "print(r['title']); print(r['matched'])"
        )
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        )
        title = result.stdout.strip().split("\n")[0]
        matched = result.stdout.strip().split("\n")[1] if "\n" in result.stdout.strip() else ""
        assert matched == "True", (
            f"'{error_text}' did not match (matched={matched}, title='{title}'). "
            f"Stderr: {result.stderr}"
        )
        assert expected_word.lower() in title.lower(), (
            f"'{error_text}' matched '{title}' but expected word '{expected_word}' not in title"
        )
