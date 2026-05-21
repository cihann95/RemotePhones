"""BaseTask — abstract base class for all task definitions.

Every concrete task **must** subclass :class:`BaseTask` and implement
:meth:`execute`.  The class enforces idempotency contracts, timeout
declarations, and retry semantics.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class TaskResult:
    """Outcome returned by :meth:`BaseTask.execute`."""
    ok: bool
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"ok": self.ok, "data": self.data}
        if self.error:
            d["error"] = self.error
        return d


@dataclass
class TaskConfig:
    """Declarative task configuration."""
    name: str
    task_type: str
    timeout_s: int = 60
    retries: int = 0
    retry_delay_s: float = 5.0
    expected_device_state: str = "online"
    requires_device: bool = True
    params_schema: dict[str, Any] = field(default_factory=dict)


class BaseTask(ABC):
    """Abstract base every task in ``tasks/`` must extend.

    Parameters
    ----------
    config:
        Declarative task configuration.
    device_manager:
        Injected device manager (provided by the scheduler at run time).
    """

    def __init__(self, config: TaskConfig | None = None, device_manager: Any = None) -> None:
        # Allow subclasses to declare config as a class attribute so that
        # zero-arg instantiation (e.g. ``handler()`` in the runner) works
        # without requiring callers to pass config explicitly.
        if config is None:
            config = self.config  # type: ignore[attr-defined]
        self.config = config
        self.device_manager = device_manager

    # ------------------------------------------------------------------
    @abstractmethod
    def execute(self, device_id: str, params: dict[str, Any]) -> TaskResult:
        """Run the task against *device_id* with *params*.

        Parameters
        ----------
        device_id:
            ADB serial ID of the target device.
        params:
            Task-specific parameters.

        Returns
        -------
        TaskResult
        """

    def validate(self, params: dict[str, Any]) -> bool:
        """Subclasses may override to validate *params* at call time."""
        return True

    def pre_check(self, device_id: str) -> bool:
        """Return ``True`` if device is ready; ``False`` otherwise."""
        if not self.config.requires_device:
            return True
        dm = self.device_manager
        if dm is None:
            logger.error("Task %s has no DeviceManager injected", self.config.name)
            return False
        record = dm.get(device_id)
        return bool(record and record.get("status") == self.config.expected_device_state)

    def __repr__(self) -> str:
        return (
            f"<{self.__class__.__name__} name={self.config.name!r} "
            f"timeout={self.config.timeout_s}s retries={self.config.retries}>"
        )
