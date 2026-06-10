"""Configuration loader — read typed config from YAML / env files."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

try:
    from pydantic import BaseModel, Field, field_validator
    _HAS_PYDANTIC = True
except ImportError:
    _HAS_PYDANTIC = False

_logger = None  # lazy-init to avoid circular imports


def _get_logger() -> Any:
    global _logger
    if _logger is None:
        try:
            from utils.logger import get_logger as _gl
            _logger = _gl(__name__)
        except Exception:
            import logging
            _logger = logging.getLogger(__name__)
    return _logger


if _HAS_PYDANTIC:
    class ADBConfig(BaseModel):
        adb_path: str = "adb"
        default_device: str | None = None

    class SchedulerConfig(BaseModel):
        poll_interval_s: float = Field(default=1.0, gt=0)
        max_retries: int = Field(default=3, ge=0)
        retry_delay_base_s: float = Field(default=5.0, gt=0)

    class MonitorConfig(BaseModel):
        health_check_interval_s: float = Field(default=60.0, gt=0)
        battery_low_pct: int = Field(default=15, ge=0, le=100)
        temperature_high_c: int = Field(default=50, ge=0)
        memory_high_pct: int = Field(default=90, ge=0, le=100)

    class PhoneFarmConfig(BaseModel):
        adb: ADBConfig = Field(default_factory=ADBConfig)
        scheduler: SchedulerConfig = Field(default_factory=SchedulerConfig)
        monitor: MonitorConfig = Field(default_factory=MonitorConfig)
        devices: list[dict[str, Any]] = Field(default_factory=list)

        @field_validator("devices", mode="before")
        @classmethod
        def _ensure_list(cls, v: Any) -> list[Any]:
            if v is None:
                return []
            return v


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

    Raises
    ------
    ValueError
        When a config file is found but pydantic validation fails.
    """
    log = _get_logger()

    candidates: list[Path] = []
    if path:
        candidates.append(Path(path))

    env_path = os.environ.get("PHONE_FARM_CONFIG")
    if env_path:
        candidates.append(Path(env_path))

    data_dir = os.environ.get("DATA_DIR")
    if data_dir:
        candidates.append(Path(data_dir) / "phone_farm.yaml")

    candidates.append(Path(__file__).parent.parent / "config" / "phone_farm.yaml")

    for candidate in candidates:
        if candidate.is_file():
            log.debug("Loading config from %s", candidate)
            with open(candidate, "r", encoding="utf-8") as fh:
                data: dict[str, Any] = yaml.safe_load(fh) or {}
            DEPRECATED_KEYS = {"phone": "The 'phone' config section is deprecated. Phone call timeouts are hardcoded in core/phone.py."}
            for key, msg in DEPRECATED_KEYS.items():
                if key in data:
                    import warnings
                    warnings.warn(f"Deprecated config key '{key}': {msg}", DeprecationWarning, stacklevel=2)
            if _HAS_PYDANTIC:
                try:
                    validated = PhoneFarmConfig.model_validate(data)
                    data = validated.model_dump()
                except Exception as exc:
                    raise ValueError(
                        f"Config validation failed for {candidate}: {exc}"
                    ) from exc
            log.info("Config loaded: %d top-level keys", len(data))
            return data

    log.warning("No config file found; returning empty dict")
    return {}
