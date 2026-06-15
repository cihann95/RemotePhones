"""Tests for utils.env_setup — auto-create .env from .env.example."""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

import pytest

from utils.env_setup import ensure_env_file


class TestEnsureEnvFile:
    """Tests for the ensure_env_file() function."""

    def test_env_already_exists(self, tmp_path: Path):
        """When .env already exists, ensure_env_file does nothing."""
        (tmp_path / ".env.example").write_text("KEY=value\n")
        (tmp_path / ".env").write_text("EXISTING=1\n")

        result = ensure_env_file(project_root=tmp_path)

        assert result["ok"] is True
        assert result["created"] is False
        # The existing .env must be untouched
        assert (tmp_path / ".env").read_text() == "EXISTING=1\n"

    def test_env_missing_example_exists(self, tmp_path: Path):
        """When .env is missing but .env.example exists, it creates .env."""
        example_text = "API_SECRET_KEY=test\nDATA_DIR=./data\n"
        (tmp_path / ".env.example").write_text(example_text)

        result = ensure_env_file(project_root=tmp_path)

        assert result["ok"] is True
        assert result["created"] is True
        assert ".env.example'dan oluşturuldu" in result["message"]
        assert (tmp_path / ".env").exists()
        assert (tmp_path / ".env").read_text() == example_text

    def test_both_missing(self, tmp_path: Path):
        """When neither .env nor .env.example exists, it's a no-op with a clear message."""
        result = ensure_env_file(project_root=tmp_path)

        assert result["ok"] is True
        assert result["created"] is False
        assert ".env.example bulunamadı" in result["message"]
        assert not (tmp_path / ".env").exists()

    def test_copy_error_returns_not_ok(self, tmp_path: Path):
        """When copying fails (e.g. permission error), ok is False."""
        (tmp_path / ".env.example").write_text("KEY=value\n")

        with patch("utils.env_setup.shutil.copy2", side_effect=OSError("denied")):
            result = ensure_env_file(project_root=tmp_path)

        assert result["ok"] is False
        assert result["created"] is False
        assert "oluşturulamadı" in result["message"]

    def test_find_project_root_returns_valid_path(self):
        """find_project_root should resolve to the repo root (has phone_farm_cli.py)."""
        from utils.env_setup import find_project_root

        root = find_project_root()
        assert (root / "phone_farm_cli.py").exists()
