"""PluginManager — discovers, loads, and manages Phone Farm plugins."""
from __future__ import annotations

import importlib
import logging
import os
import pkgutil
from typing import Dict, List, Optional, Type

from core.plugins.base_plugin import BasePlugin

logger = logging.getLogger(__name__)


class PluginManager:
    """Manages the discovery, loading, and lifecycle of Phone Farm plugins.

    Plugins are discovered in the `phone_farm_plugins` package or in directories
    specified in the `PHONE_FARM_PLUGIN_PATH` environment variable.

    Example plugin structure:
        phone_farm_plugins/
            __init__.py
            my_plugin/
                __init__.py
                plugin.py  # Contains MyPlugin class inheriting from BasePlugin
    """

    def __init__(self) -> None:
        self._plugins: Dict[str, BasePlugin] = {}
        self._plugin_classes: Dict[str, Type[BasePlugin]] = {}

    def discover_plugins(self, search_paths: Optional[List[str]] = None) -> List[str]:
        """Discover available plugins in the given paths.

        Parameters
        ----------
        search_paths : list of str, optional
            Additional paths to search for plugins. If None, searches
            in the standard locations.

        Returns
        -------
        list of str
            Names of discovered plugins.
        """
        if search_paths is None:
            search_paths = []

        # Add standard plugin locations
        standard_paths = [
            os.path.join(os.path.dirname(__file__), "..", "..", "plugins"),
        ]
        
        # Add environment variable path if set
        plugin_path = os.environ.get("PHONE_FARM_PLUGIN_PATH")
        if plugin_path:
            standard_paths.append(plugin_path)

        all_paths = standard_paths + search_paths
        discovered = []

        for path in all_paths:
            if not os.path.isdir(path):
                continue
                
            # Look for plugin packages
            for _, name, is_pkg in pkgutil.iter_modules([path]):
                if is_pkg:
                    try:
                        # Try to import the plugin module
                        plugin_module = importlib.import_module(f"{name}.plugin")
                        # Look for plugin class
                        for item_name in dir(plugin_module):
                            item = getattr(plugin_module, item_name)
                            if (isinstance(item, type) and 
                                issubclass(item, BasePlugin) and 
                                item is not BasePlugin):
                                self._plugin_classes[name] = item
                                discovered.append(name)
                                logger.info("Discovered plugin: %s", name)
                                break
                    except Exception as exc:
                        logger.debug("Failed to load plugin %s: %s", name, exc)

        return discovered

    def load_plugin(self, plugin_name: str, *args, **kwargs) -> BasePlugin:
        """Load and initialize a plugin.

        Parameters
        ----------
        plugin_name : str
            Name of the plugin to load
        *args, **kwargs
            Arguments to pass to the plugin constructor

        Returns
        -------
        BasePlugin
            The loaded and initialized plugin instance

        Raises
        ------
        ValueError
            If the plugin is not found
        """
        if plugin_name not in self._plugin_classes:
            raise ValueError(f"Plugin {plugin_name} not found. "
                           f"Available plugins: {list(self._plugin_classes.keys())}")

        if plugin_name in self._plugins:
            logger.warning("Plugin %s already loaded, returning existing instance", plugin_name)
            return self._plugins[plugin_name]

        # Instantiate the plugin
        plugin_class = self._plugin_classes[plugin_name]
        plugin_instance = plugin_class(*args, **kwargs)
        
        # Store and initialize
        self._plugins[plugin_name] = plugin_instance
        logger.info("Loaded plugin: %s", plugin_name)
        
        return plugin_instance

    def initialize_plugin(self, plugin_name: str, 
                         adb_client, 
                         device_manager, 
                         phone_farm_manager, 
                         task_registry) -> None:
        """Initialize a loaded plugin with system dependencies.

        Parameters
        ----------
        plugin_name : str
            Name of the plugin to initialize
        adb_client : ADBClient
            ADB client for device communication
        device_manager : DeviceManager
            Device manager for tracking device states
        phone_farm_manager : PhoneFarmManager
            Main orchestrator for task scheduling
        task_registry : TaskRegistry
            Registry for registering new task types
        """
        if plugin_name not in self._plugins:
            raise ValueError(f"Plugin {plugin_name} not loaded")

        plugin = self._plugins[plugin_name]
        if plugin.is_initialized:
            logger.warning("Plugin %s already initialized", plugin_name)
            return

        plugin.initialize(adb_client, device_manager, phone_farm_manager, task_registry)
        logger.info("Initialized plugin: %s", plugin_name)

    def get_plugin(self, plugin_name: str) -> Optional[BasePlugin]:
        """Get a loaded plugin instance.

        Parameters
        ----------
        plugin_name : str
            Name of the plugin to retrieve

        Returns
        -------
        BasePlugin or None
            The plugin instance if loaded, None otherwise
        """
        return self._plugins.get(plugin_name)

    def list_loaded_plugins(self) -> List[str]:
        """Get list of currently loaded plugin names."""
        return list(self._plugins.keys())

    def list_available_plugins(self) -> List[str]:
        """Get list of discovered but not necessarily loaded plugin names."""
        return list(self._plugin_classes.keys())

    def unload_plugin(self, plugin_name: str) -> bool:
        """Unload a plugin and clean up its resources.

        Parameters
        ----------
        plugin_name : str
            Name of the plugin to unload

        Returns
        -------
        bool
            True if plugin was unloaded, False if not found
        """
        if plugin_name not in self._plugins:
            return False

        plugin = self._plugins[plugin_name]
        if plugin.is_initialized:
            plugin.cleanup()
        
        del self._plugins[plugin_name]
        logger.info("Unloaded plugin: %s", plugin_name)
        return True

    def unload_all_plugins(self) -> None:
        """Unload all loaded plugins."""
        for plugin_name in list(self._plugins.keys()):
            self.unload_plugin(plugin_name)