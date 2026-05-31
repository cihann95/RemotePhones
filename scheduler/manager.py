"""PhoneFarmManager — high-level orchestrator.

Combines DeviceManager, TaskRunner, JobQueue and TaskRegistry into
a single object so the rest of the system (CLI, API, tests) never
has to wire things manually.

Usage::

    from core.adb import ADBClient
    from core.device_manager import DeviceManager
    from scheduler.manager import PhoneFarmManager

    mgr = PhoneFarmManager(ADBClient())
    mgr.start()
    mgr.run_on_device("device-id", [{"task": "app_launch", "params": {...}}, ...])
"""

from __future__ import annotations

import logging
import threading
import time
from typing import TYPE_CHECKING

from core.plugins.base_plugin import ManagerProtocol

from core.adb import ADBClient
from core.device_manager import DeviceManager
from scheduler.job_queue import JobQueue
from scheduler.priority import Priority
from scheduler.runner import TaskRunner
from tasks.concrete import register_all
from tasks.registry import TaskRegistry

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class PhoneFarmManager(ManagerProtocol):
    """Top-level entry-point for the automation layer.

    Parameters
    ----------
    adb_client:
        Pre-configured ADB client.
    auto_discover:
        If ``True``, :meth:`start` will call :meth:`DeviceManager.discover`
        and register every device it finds.
    """

    def __init__(
        self,
        adb_client: ADBClient,
        auto_discover: bool = True,
    ) -> None:
        self.adb: ADBClient = adb_client
        self.dm: DeviceManager = DeviceManager(adb_client)
        self.queue: JobQueue = JobQueue()
        self.registry: TaskRegistry = TaskRegistry()
        self.runner: TaskRunner = TaskRunner(queue=self.queue, registry=self.registry)
        self._auto_discover = auto_discover
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # ManagerProtocol implementation
    def get_devices(self) -> list:
        """Return list of connected device IDs."""
        return [did for did, info in self.dm.all_devices.items() if info.get("status") == "online"]

    def run_task(self, task_id: str, device_id: str) -> bool:
        """Enqueue task and run immediately. Returns True if task started."""
        result = self.enqueue_task(task_id, device_id)
        return bool(result.get("job_id"))

    # ------------------------------------------------------------------
    def start(self) -> None:
        """Discover devices, register concrete tasks, and start the runner."""
        self._register_tasks()
        if self._auto_discover:
            ids = self.dm.discover()
            for did in ids:
                self.dm.register(did)
                self.dm.connect(did)
        self.runner.start()
        logger.info("PhoneFarmManager started (%d devices)", len(self.dm.online_devices))

    def stop(self, timeout: float = 5.0) -> None:
        self.runner.stop(timeout)
        logger.info("PhoneFarmManager stopped")

    # ------------------------------------------------------------------
    def _register_tasks(self) -> None:
        register_all(self.registry)

    # ------------------------------------------------------------------
    def enqueue_task(
        self,
        task_name: str,
        device_id: str,
        params: dict | None = None,
        priority: int | str = Priority.NORMAL,
    ) -> dict:
        """Enqueue *task_name* for *device_id* on the priority queue."""
        payload = {"task": task_name, "device_id": device_id,
                   "params": params or {}}
        return self.queue.enqueue(task_name, priority=priority, payload=payload)

    # ------------------------------------------------------------------
    def run_on_device(
        self,
        device_id: str,
        steps: list[dict],
        sequential: bool = True,
    ) -> list[dict]:
        """Enqueue a list of task steps for *device_id*.

        Parameters
        ----------
        device_id:
            Target device ADB serial.
        steps:
            Each dict must have ``"task"`` (registered task name) and
            optional ``"params"`` and ``"priority"``.
        sequential:
            When ``True`` (default) steps are enqueued sequentially and
            the runner processes them one at a time.  When ``False``
            all steps go on the queue at once.

        Returns
        -------
        list[dict]
            Short descriptions of enqueued jobs.
        """
        results: list[dict] = []
        for step in steps:
            task_name = step["task"]
            params = step.get("params") or {}
            priority = step.get("priority", Priority.NORMAL)
            record = self.enqueue_task(task_name, device_id, params, priority)
            if sequential:
                self.queue.dequeue()
            results.append(record)
        return results

    # ------------------------------------------------------------------
    def status_summary(self) -> dict:
        return {
            "devices": {
                "total": len(self.dm.all_devices),
                "online": len(self.dm.online_devices),
            },
            "queue": {
                "pending": self.queue.qsize(),
                "tasks": self.registry.names,
            },
            "runner_running": self.runner._running,
        }

    # context-manager support ------------------------------------------------
    def __enter__(self) -> PhoneFarmManager:
        self.start()
        return self

    def __exit__(self, *args: object) -> None:
        self.stop()
