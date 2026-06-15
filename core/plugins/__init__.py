"""
DEPRECATED
===========
The core.plugins package is not currently wired into the application. The
PluginManager is never instantiated by PhoneFarmManager or any other component.
This package is preserved for future use but its contents are not loaded
by the running system.
"""

from core.plugins.base_plugin import BasePlugin, ManagerProtocol, RegistryProtocol, JobQueueProtocol, TaskRunnerProtocol, StatusBoardProtocol
from core.plugins.manager import PluginManager

__all__ = ["BasePlugin", "PluginManager", "ManagerProtocol", "RegistryProtocol", "JobQueueProtocol", "TaskRunnerProtocol", "StatusBoardProtocol"]
