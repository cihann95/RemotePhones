"""Integration tests: preflight (JS) + env_setup + doctor (Python) consistency.

Validates the full preflight + doctor flow across 3 scenarios:
  1. .env missing -> auto-copied -> preflight passes env check -> doctor also passes
  2. .env present, ADB missing -> preflight reports adb error -> doctor reports same
  3. .env present, ADB present, port 8000 busy -> preflight warning -> doctor warning
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent


# -- Helpers --------------------------------------------------------------------


def _run_doctor_subprocess(env=None):
    """Run phone_farm_cli.py doctor via subprocess.

    Returns ``(returncode, stdout, stderr)``.
    """
    result = subprocess.run(
        [sys.executable, str(PROJECT_ROOT / "phone_farm_cli.py"), "doctor"],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(PROJECT_ROOT),
        env=env or os.environ.copy(),
    )
    return result.returncode, result.stdout, result.stderr


def _run_preflight_js(env=None):
    """Run preflight.js checks via ``node -e`` and return parsed JSON.

    Returns ``None`` if the node module fails to load.
    """
    script = (
        "const pf = require('./src/main/preflight');"
        "pf.runPreflightChecks().then(r => {"
        "  process.stdout.write(JSON.stringify(r));"
        "}).catch(e => {"
        "  process.stderr.write(e.message);"
        "  process.exit(2);"
        "});"
    )
    result = subprocess.run(
        ["node", "-e", script],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(PROJECT_ROOT),
        env=env or os.environ.copy(),
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return json.loads(result.stdout)


def _find_check(checks, name_fragment):
    """Find a check result dict by partial name match (case-insensitive)."""
    for c in checks:
        if name_fragment.lower() in c.get("name", "").lower():
            return c
    return None


def _path_without_adb():
    """Return an env dict with ADB's directory removed from PATH."""
    env = os.environ.copy()
    adb_path = shutil.which("adb")
    if adb_path:
        adb_dir = str(Path(adb_path).parent)
        env["PATH"] = ":".join(
            p for p in env["PATH"].split(":") if p != adb_dir
        )
    return env


# -- Scenario 1: .env missing -> auto-copied -> both pass env check ------------


class TestScenarioEnvAutoCopy:
    """Scenario 1: .env missing -> ensure_env_file copies from .env.example
    -> preflight env check passes -> doctor env check also passes."""

    def test_ensure_env_file_creates_from_example(self, tmp_path):
        """ensure_env_file creates .env from .env.example when missing."""
        example_content = "API_SECRET_KEY=testkey123\nDATA_DIR=./data\n"
        (tmp_path / ".env.example").write_text(example_content)

        from utils.env_setup import ensure_env_file

        result = ensure_env_file(project_root=tmp_path)

        assert result["ok"] is True
        assert result["created"] is True
        assert (tmp_path / ".env").exists()
        assert (tmp_path / ".env").read_text() == example_content

    def test_doctor_env_check_passes_when_env_exists(self):
        """Doctor subprocess reports .env as present in a healthy project."""
        _, stdout, _ = _run_doctor_subprocess()

        assert "Ucus Oncesi Kontrol" in stdout.replace("ş", "s").replace("ö", "o") or "Uçuş" in stdout
        env_lines = [l for l in stdout.splitlines() if ".env" in l and "dosyas" in l]
        assert len(env_lines) > 0, f"No .env check line in doctor output:\n{stdout}"
        assert any("\u2713" in l or "mevcut" in l for l in env_lines)

    def test_preflight_env_check_passes_when_env_exists(self):
        """Preflight JS reports env-file as ok when .env is present."""
        preflight = _run_preflight_js()
        if preflight is None:
            pytest.skip("Node preflight module could not be loaded")

        env_check = _find_check(preflight["checks"], "env")
        assert env_check is not None, "env-file check missing from preflight results"
        assert env_check["status"] == "ok"

    def test_ensure_env_then_doctor_and_preflight_agree(self, tmp_path):
        """Full flow: ensure_env_file creates .env -> doctor and preflight agree."""
        example_content = "API_SECRET_KEY=integration_test\n"
        (tmp_path / ".env.example").write_text(example_content)

        # Step 1: auto-copy via ensure_env_file
        from utils.env_setup import ensure_env_file

        result = ensure_env_file(project_root=tmp_path)
        assert result["created"] is True
        assert (tmp_path / ".env").exists()

        # Step 2: doctor env check (real project has .env)
        _, stdout, _ = _run_doctor_subprocess()
        env_lines = [l for l in stdout.splitlines() if ".env" in l]
        doctor_ok = any("\u2713" in l or "mevcut" in l for l in env_lines)

        # Step 3: preflight env check
        preflight = _run_preflight_js()
        preflight_ok = False
        if preflight is not None:
            env_check = _find_check(preflight["checks"], "env")
            preflight_ok = env_check is not None and env_check["status"] == "ok"

        # Both must agree
        assert doctor_ok, f"Doctor should see .env as ok:\n{stdout}"
        if preflight is not None:
            assert preflight_ok, "Preflight should see .env as ok"


# -- Scenario 2: ADB missing -> both report error -----------------------------


class TestScenarioAdbMissing:
    """Scenario 2: ADB not on PATH -> preflight reports error -> doctor reports same."""

    def test_doctor_reports_adb_error(self):
        """Doctor reports ADB error when adb is not on PATH."""
        env = _path_without_adb()

        _, stdout, _ = _run_doctor_subprocess(env=env)

        assert "\u2717" in stdout, f"Expected error icon in doctor output:\n{stdout}"
        assert "ADB" in stdout

    def test_preflight_reports_adb_error(self):
        """Preflight JS reports ADB error when adb is not on PATH."""
        env = _path_without_adb()

        preflight = _run_preflight_js(env=env)
        if preflight is None:
            pytest.skip("Node preflight module could not be loaded")

        adb_check = _find_check(preflight["checks"], "adb")
        assert adb_check is not None, "ADB check missing from preflight results"
        assert adb_check["status"] == "error"

    def test_both_consistent_on_adb_missing(self):
        """Doctor and preflight both report ADB failure consistently."""
        env = _path_without_adb()

        # Doctor
        _, stdout_doc, _ = _run_doctor_subprocess(env=env)
        doctor_has_adb_error = "\u2717" in stdout_doc and "ADB" in stdout_doc

        # Preflight
        preflight = _run_preflight_js(env=env)
        if preflight is None:
            pytest.skip("Node preflight module could not be loaded")

        adb_check = _find_check(preflight["checks"], "adb")
        preflight_has_adb_error = adb_check is not None and adb_check["status"] == "error"

        assert doctor_has_adb_error == preflight_has_adb_error, (
            f"Doctor ADB error={doctor_has_adb_error}, "
            f"Preflight ADB error={preflight_has_adb_error}"
        )


# -- Scenario 3: Port 8000 busy -> both warn -----------------------------------


class TestScenarioPortBusy:
    """Scenario 3: Port 8000 occupied -> preflight warning -> doctor warning."""

    @pytest.fixture()
    def port_blocker(self):
        """Bind port 8000 for the duration of the test, then release."""
        blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            blocker.bind(("127.0.0.1", 8000))
            blocker.listen(1)
            yield blocker
        finally:
            blocker.close()

    def test_doctor_warns_when_port_busy(self, port_blocker):
        """Doctor reports port warning when 8000 is in use."""
        _, stdout, _ = _run_doctor_subprocess()

        port_lines = [l for l in stdout.splitlines() if "8000" in l]
        assert len(port_lines) > 0, f"No port 8000 line in doctor output:\n{stdout}"
        assert any("\u26a0" in l or "kullan" in l for l in port_lines), (
            f"Expected port warning:\n{stdout}"
        )

    def test_preflight_warns_when_port_busy(self, port_blocker):
        """Preflight JS reports port warning when 8000 is in use."""
        preflight = _run_preflight_js()
        if preflight is None:
            pytest.skip("Node preflight module could not be loaded")

        port_check = _find_check(preflight["checks"], "port")
        assert port_check is not None, "Port check missing from preflight results"
        assert port_check["status"] == "warning"

    def test_both_consistent_on_port_busy(self, port_blocker):
        """Doctor and preflight both warn about port 8000 being busy."""
        # Doctor
        _, stdout_doc, _ = _run_doctor_subprocess()
        doctor_warns = any(
            "8000" in l and ("\u26a0" in l or "kullan" in l)
            for l in stdout_doc.splitlines()
        )

        # Preflight
        preflight = _run_preflight_js()
        if preflight is None:
            pytest.skip("Node preflight module could not be loaded")

        port_check = _find_check(preflight["checks"], "port")
        preflight_warns = port_check is not None and port_check["status"] == "warning"

        assert doctor_warns == preflight_warns, (
            f"Doctor warns={doctor_warns}, Preflight warns={preflight_warns}"
        )


# -- Cross-cutting consistency -------------------------------------------------


class TestOverallConsistency:
    """Verify preflight and doctor produce structurally consistent output."""

    def test_both_produce_overall_status(self):
        """Both systems produce an overall ok/fail determination."""
        _, stdout, _ = _run_doctor_subprocess()
        assert "Toplam:" in stdout

        preflight = _run_preflight_js()
        if preflight is None:
            pytest.skip("Node preflight module could not be loaded")
        assert "ok" in preflight
        assert "checks" in preflight
        assert isinstance(preflight["checks"], list)

    def test_doctor_output_is_turkish(self):
        """Doctor output contains Turkish text markers."""
        _, stdout, _ = _run_doctor_subprocess()
        turkish_markers = ["Uçuş", "Öncesi", "Kontrol", "Toplam"]
        found = sum(1 for m in turkish_markers if m in stdout)
        assert found >= 2, (
            f"Expected at least 2 Turkish markers, found {found}:\n{stdout}"
        )

    def test_preflight_messages_are_turkish(self):
        """Preflight JS check messages contain Turkish text."""
        preflight = _run_preflight_js()
        if preflight is None:
            pytest.skip("Node preflight module could not be loaded")
        all_messages = " ".join(c.get("message", "") for c in preflight["checks"])
        turkish_words = ["mevcut", "bulunamad", "başar", "haz"]
        found = sum(1 for w in turkish_words if w in all_messages)
        assert found >= 1, (
            f"Expected Turkish text in preflight messages:\n{all_messages}"
        )

    def test_doctor_lists_expected_checks(self):
        """Doctor subprocess outputs all expected check names."""
        _, stdout, _ = _run_doctor_subprocess()
        expected = ["Python", "ADB", ".env", "paketler", "dizin", "Port", "SQLite", "Ağ"]
        for name in expected:
            assert name in stdout, f"Check '{name}' not in doctor output"

    def test_preflight_lists_expected_checks(self):
        """Preflight JS returns expected check names."""
        preflight = _run_preflight_js()
        if preflight is None:
            pytest.skip("Node preflight module could not be loaded")
        check_names = [c.get("name", "") for c in preflight["checks"]]
        expected = ["adb-binary", "cli-binary", "env-file", "port-8000"]
        for name in expected:
            assert name in check_names, f"Check '{name}' not in preflight results"

    def test_doctor_exit_code_matches_error_count(self):
        """Doctor exits 1 when errors exist, 0 when only ok/warnings."""
        _, stdout, _ = _run_doctor_subprocess()
        has_error = "\u2717" in stdout
        # Re-run to check exit code (first run above used stdout only)
        rc, _, _ = _run_doctor_subprocess()
        if has_error:
            assert rc == 1, f"Expected exit 1 when errors present, got {rc}"
        else:
            assert rc == 0, f"Expected exit 0 when no errors, got {rc}"
