"""TaskRegistry — maps task names to :class:`BaseTask` sub-classes."""

from __future__ import annotations

import logging
from typing import Any

from core.plugins.base_plugin import RegistryProtocol
from tasks.base_task import BaseTask

logger = logging.getLogger(__name__)


class TaskRegistry(RegistryProtocol):
    """Central registry for :class:`BaseTask` subclasses.

    Usage::

        registry = TaskRegistry()
        registry.register(MyTask)
        handler = registry.get("my_task")
    """

    def __init__(self) -> None:
        self._tasks: dict[str, type[BaseTask]] = {}

    # ------------------------------------------------------------------
    def register(self, task_cls: type[BaseTask]) -> type[BaseTask]:
        """Register *task_cls* by its ``config.name`` attribute.

        Returns the class so it can be used as a decorator.
        """
        name: str = task_cls.config.name  # type: ignore[misc]
        if name in self._tasks:
            logger.warning("Task %r already registered — overwriting", name)
        self._tasks[name] = task_cls
        logger.debug("Registered task: %s", name)
        return task_cls

    def get(self, name: str) -> Any:
        """Return an *uninstantiated* task class for *name*, or ``None``."""
        return self._tasks.get(name)

    # RegistryProtocol implementation
    def get_task(self, task_id: str) -> object:
        """Return registered task class for task_id (Protocol method)."""
        return self.get(task_id)

    def list_tasks(self) -> list[str]:
        """List all registered task names (Protocol method)."""
        return self.names

    def create(
        self,
        name: str,
        device_manager: Any = None,
        **kwargs: Any,
    ) -> BaseTask | None:
        """Instantiate a registered task with extra keyword arguments."""
        task_cls = self.get(name)
        if task_cls is None:
            logger.error("Task %r not found in registry", name)
            return None
        instance = task_cls(device_manager=device_manager, **kwargs)
        assert isinstance(instance, BaseTask)
        return instance

    @property
    def names(self) -> list[str]:
        return list(self._tasks.keys())

    @property
    def all(self) -> dict[str, type[BaseTask]]:
        return dict(self._tasks)
