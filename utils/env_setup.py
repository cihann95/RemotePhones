"""env_setup.py — auto-create .env from .env.example on startup.

Usage:
    from utils.env_setup import ensure_env_file
    result = ensure_env_file()
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path


def find_project_root() -> Path:
    """Walk up from this file's directory to find the project root
    (identified by the presence of ``phone_farm_cli.py``)."""
    current = Path(__file__).resolve().parent.parent  # utils/ -> project root
    if (current / "phone_farm_cli.py").exists():
        return current
    # Fallback: keep walking up
    for parent in [current] + list(current.parents):
        if (parent / "phone_farm_cli.py").exists():
            return parent
    return current


def ensure_env_file(project_root: str | Path | None = None) -> dict:
    """Ensure ``.env`` exists by copying from ``.env.example`` if needed.

    Parameters
    ----------
    project_root : str or Path, optional
        Path to the project root.  Auto-detected when *None*.

    Returns
    -------
    dict
        ``{"ok": bool, "created": bool, "message": str}``
    """
    root = Path(project_root) if project_root else find_project_root()
    env_path = root / ".env"
    example_path = root / ".env.example"

    # Already exists — nothing to do.
    if env_path.exists():
        return {
            "ok": True,
            "created": False,
            "message": ".env dosyası zaten mevcut, atlanıyor.",
        }

    # No template available — warn but don't fail.
    if not example_path.exists():
        return {
            "ok": True,
            "created": False,
            "message": ".env.example bulunamadı — .env oluşturulamadı.",
        }

    # Copy template to .env
    try:
        shutil.copy2(str(example_path), str(env_path))
        print(".env dosyası .env.example'dan oluşturuldu")
        return {
            "ok": True,
            "created": True,
            "message": ".env dosyası .env.example'dan oluşturuldu",
        }
    except OSError as exc:
        return {
            "ok": False,
            "created": False,
            "message": f".env oluşturulamadı: {exc}",
        }


if __name__ == "__main__":
    result = ensure_env_file()
    print(result["message"])
