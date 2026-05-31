"""BasePlugin — abstract base class for all plugins."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Protocol, runtime_checkable

from core.adb import ADBClient
from core.device_manager import DeviceManager
from utils.logger import get_logger


@runtime_checkable
class ManagerProtocol(Protocol):
    """Interface that Kilo/Laguna's PhoneFarmManager must implement."""

    def get_devices(self) -> list: ...
    def run_task(self, task_id: str, device_id: str) -> bool: ...


@runtime_checkable
class RegistryProtocol(Protocol):
    """Interface that Kilo/Laguna's TaskRegistry must implement."""

    def get_task(self, task_id: str) -> object: ...
    def list_tasks(self) -> list[str]: ...


@runtime_checkable
class JobQueueProtocol(Protocol):
    def enqueue(self, task_name: str, priority: int | str, payload: dict) -> dict: ...
    def dequeue(self) -> dict | None: ...
    def qsize(self) -> int: ...


@runtime_checkable
class TaskRunnerProtocol(Protocol):
    def start(self) -> None: ...
    def stop(self, timeout: float = 5.0) -> None: ...


class BasePlugin(ABC):
    """Abstract base class for all Phone Farm plugins.

    Plugins extend the functionality of the Phone Farm system by providing
    additional tasks, device operations, or system integrations.

    Attributes
    ----------
    name : str
        Unique identifier for the plugin
    version : str
        Plugin version in semantic versioning format
    description : str
        Human-readable description of what the plugin does
    """

    def __init__(self) -> None:
        self.log = get_logger(__name__)
        self._initialized = False
        self._adb_client: Optional[ADBClient] = None
        self._device_manager: Optional[DeviceManager] = None
        self._phone_farm_manager: Optional[ManagerProtocol] = None
        self._task_registry: Optional[RegistryProtocol] = None

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique plugin identifier."""
        pass

    @property
    @abstractmethod
    def version(self) -> str:
        """Plugin version (semantic versioning)."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable plugin description."""
        pass

    def initialize(
        self,
        adb_client: ADBClient,
        device_manager: DeviceManager,
        phone_farm_manager: ManagerProtocol,
        task_registry: RegistryProtocol,
    ) -> None:
        """Initialize the plugin with system dependencies.

        Called by the PluginManager when the plugin is loaded.

        Parameters
        ----------
        adb_client : ADBClient
            ADB client for device communication
        device_manager : DeviceManager
            Device manager for tracking device states
        phone_farm_manager : ManagerProtocol
            Main orchestrator for task scheduling
        task_registry : RegistryProtocol
            Registry for registering new task types
        """
        self._adb_client = adb_client
        self._device_manager = device_manager
        self._phone_farm_manager = phone_farm_manager
        self._task_registry = task_registry
        self._initialized = True
        self._setup()

    @abstractmethod
    def _setup(self) -> None:
        """Set up the plugin after initialization.
        
        Override this method to register tasks, set up hooks, or perform
        any initialization that requires the system dependencies.
        """
        pass

    def cleanup(self) -> None:
        """Clean up plugin resources.
        
        Called by the PluginManager when the plugin is unloaded.
        Override this method to release resources or unregister tasks.
        """
        self._adb_client = None
        self._device_manager = None
        self._phone_farm_manager = None
        self._task_registry = None
        self._initialized = False

    @property
    def is_initialized(self) -> bool:
        """Check if the plugin is initialized."""
        return self._initialized

    # Convenience properties for accessing system components
    @property
    def adb(self) -> ADBClient:
        """ADB client (requires initialization)."""
        if not self._initialized:
            raise RuntimeError(f"Plugin {self.name} not initialized")
        return self._adb_client  # type: ignore[return-value]

    @property
    def device_manager(self) -> DeviceManager:
        """Device manager (requires initialization)."""
        if not self._initialized:
            raise RuntimeError(f"Plugin {self.name} not initialized")
        return self._device_manager  # type: ignore[return-value]

    @property
    def phone_farm_manager(self) -> ManagerProtocol:
        """Phone farm manager (requires initialization)."""
        if not self._initialized:
            raise RuntimeError(f"Plugin {self.name} not initialized")
        return self._phone_farm_manager  # type: ignore[return-value]

    @property
    def task_registry(self) -> RegistryProtocol:
        """Task registry (requires initialization)."""
        if not self._initialized:
            raise RuntimeError(f"Plugin {self.name} not initialized")
        return self._task_registry  # type: ignore[return-value]
