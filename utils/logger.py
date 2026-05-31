"""Utility logger — stdlib-style logger factory."""

from __future__ import annotations

import logging
import sys
from typing import Any

_loguru_initialized = False


def get_logger(name: str, level: int | str = logging.INFO) -> Any:
    """Return a configured :class:`logging.Logger` instance.

    Uses :class:`loguru` if it is importable; otherwise falls back to the
    standard library ``logging`` module so the codebase never hard-depends
    on ``loguru`` at import time.

    Parameters
    ----------
    name:
        Dotted logger name (typically ``__name__``).
    level:
        Minimum log level to emit.

    Returns
    -------
    logging.Logger
    """
    global _loguru_initialized

    try:
        from loguru import logger as _lu

        if not _loguru_initialized:
            _lu.remove()
            _lu.add(
                sys.stderr,
                level=level,
                format=(
                    "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
                    "<level>{level:<7}</level> | "
                    "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> — "
                    "<level>{message}</level>"
                ),
            )
            _loguru_initialized = True
        return _lu
    except ImportError:
        pass

    std_logger = logging.getLogger(name)
    std_logger.setLevel(level)
    if not std_logger.handlers:
        _h = logging.StreamHandler(sys.stderr)
        _h.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-7s | %(name)s:%(funcName)s:%(lineno)d — %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        std_logger.addHandler(_h)
        std_logger.propagate = False
    return std_logger
