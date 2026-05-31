"""Example plugin demonstrating the plugin architecture."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from core.plugins.base_plugin import BasePlugin


@dataclass
class TaskResult:
    """Lightweight task result — mirrors tasks.base_task.TaskResult."""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@dataclass
class TaskConfig:
    """Lightweight task config — mirrors tasks.base_task.TaskConfig."""
    name: str = ""
    task_type: str = ""
    timeout_s: int = 30
    retries: int = 0
    expected_device_state: str = "online"
    params_schema: Dict[str, Any] = field(default_factory=dict)


class ExampleTask:
    """Standalone example task — no cross-zone dependencies."""

    config = TaskConfig(
        name="example_task",
        task_type="example_task",
        timeout_s=30,
        retries=0,
        expected_device_state="online",
        params_schema={
            "message": {"type": "string", "default": "Hello from example plugin!"}
        },
    )

    def __init__(self) -> None:
        from utils.logger import get_logger
        self.log = get_logger(__name__)

    def pre_check(self, device_id: str) -> bool:
        """Check if device is in expected state."""
        return True  # simplified for example

    def execute(self, device_id: str, params: Dict[str, object]) -> TaskResult:
        """Execute the example task."""
        if not self.pre_check(device_id):
            return TaskResult(
                False,
                error=f"Device {device_id} not {self.config.expected_device_state}",
            )

        message = str(params.get("message", ""))
        self.log.info("Executing example task on %s: %s", device_id, message)

        return TaskResult(True, data={"message": message, "device_id": device_id})


class ExamplePlugin(BasePlugin):
    """Example plugin that adds a simple task."""

    @property
    def name(self) -> str:
        return "example_plugin"

    @property
    def version(self) -> str:
        return "1.0.0"

    @property
    def description(self) -> str:
        return "Example plugin that demonstrates the plugin architecture"

    def _setup(self) -> None:
        """Set up the plugin by registering example tasks."""
        self.log.info("Registered example task from %s", self.name)

    def cleanup(self) -> None:
        """Clean up plugin resources."""
        self.log.info("Cleaning up %s", self.name)
        super().cleanup()
