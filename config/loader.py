"""Configuration loader — read typed config from YAML / env files."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

logger = None  # will be set by utils.logger if available


def _get_logger():
    global logger
    if logger is None:
        try:
            from utils.logger import get_logger as _gl
            logger = _gl(__name__)
        except Exception:
            import logging
            logger = logging.getLogger(__name__)
    return logger


def load_config(path: str | None = None) -> dict[str, Any]:
    """Load and return the application config as a typed dict.

    The loader supports three sources, merged in priority order
    (highest priority first):

    1. **CLI / caller-provided** ``path`` argument.
    2. Environment variable ``PHONE_FARM_CONFIG`` pointing to a YAML file.
    3. Default ``config/phone_farm.yaml`` in the project root.

    Parameters
    ----------
    path:
        Explicit path to a YAML configuration file.  When ``None`` the
        loader checks the environment variable and then the default.

    Returns
    -------
    dict
        Merged configuration dictionary.  Returns ``{}`` when no config
        file is found.
    """
    get_logger = _get_logger()

    candidates: list[Path] = []
    if path:
        candidates.append(Path(path))

    env_path = os.environ.get("PHONE_FARM_CONFIG")
    if env_path:
        candidates.append(Path(env_path))

    candidates.append(Path(__file__).parent.parent / "config" / "phone_farm.yaml")

    for candidate in candidates:
        if candidate.is_file():
            get_logger().debug("Loading config from %s", candidate)
            with open(candidate, "r", encoding="utf-8") as fh:
                data: dict[str, Any] = yaml.safe_load(fh) or {}
            get_logger().info("Config loaded: %d top-level keys", len(data))
            return data

    get_logger().warning("No config file found; returning empty dict")
    return {}
