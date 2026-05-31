"""AsyncPhoneFarmManager — high-level async orchestrator.

Combines AsyncDeviceManager, AsyncTaskRunner, AsyncJobQueue and TaskRegistry into
a single object so the rest of the system (CLI, API, tests) never
has to wire things manually.

Usage::

    from core.async.adb import AsyncADBClient
    from core.async.device_manager import AsyncDeviceManager
    from scheduler.async_manager import AsyncPhoneFarmManager

    mgr = AsyncPhoneFarmManager(AsyncADBClient())
    await mgr.start()
    await mgr.run_on_device("device-id", [{"task": "app_launch", "params": {...}}, ...])
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

import importlib
AsyncADBClient = importlib.import_module('core.async.adb').AsyncADBClient
AsyncDeviceManager = importlib.import_module('core.async.device_manager').AsyncDeviceManager
from scheduler.async_job_queue import AsyncJobQueue
from scheduler.async_runner import AsyncTaskRunner
from scheduler.priority import Priority
from tasks.concrete import register_all
from tasks.registry import TaskRegistry

logger = logging.getLogger(__name__)


class AsyncPhoneFarmManager:
    """Top-level async entry-point for the automation layer.

    Parameters
    ----------
    adb_client:
        Pre-configured AsyncADB client.
    auto_discover:
        If ``True``, :meth:`start` will call :meth:`AsyncDeviceManager.discover`
        and register every device it finds.
    """

    def __init__(
        self,
        adb_client: AsyncADBClient,
        auto_discover: bool = True,
    ) -> None:
        self.adb: AsyncADBClient = adb_client
        self.dm: AsyncDeviceManager = AsyncDeviceManager(adb_client)
        self.queue: AsyncJobQueue = AsyncJobQueue()
        self.registry: TaskRegistry = TaskRegistry()
        self.runner: AsyncTaskRunner = AsyncTaskRunner(queue=self.queue, registry=self.registry)
        self._auto_discover = auto_discover
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    async def start(self) -> None:
        """Discover devices, register concrete tasks, and start the runner."""
        self._register_tasks()
        if self._auto_discover:
            ids = await self.dm.discover()
            for did in ids:
                self.dm.register(did)
                await self.dm.connect(did)
        await self.runner.start()
        logger.info("AsyncPhoneFarmManager started (%d devices)", len(self.dm.online_devices))

    async def stop(self, timeout: float = 5.0) -> None:
        await self.runner.stop(timeout)
        logger.info("AsyncPhoneFarmManager stopped")

    # ------------------------------------------------------------------
    def _register_tasks(self) -> None:
        register_all(self.registry)

    # ------------------------------------------------------------------
    async def enqueue_task(
        self,
        task_name: str,
        device_id: str,
        params: dict | None = None,
        priority: int | str = Priority.NORMAL,
    ) -> dict:
        """Enqueue *task_name* for *device_id* on the priority queue."""
        payload = {"task": task_name, "device_id": device_id,
                   "params": params or {}}
        return await self.queue.enqueue(task_name, priority=priority, payload=payload)

    # ------------------------------------------------------------------
    async def run_on_device(
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
            record = await self.enqueue_task(task_name, device_id, params, priority)
            if sequential:
                await self.queue.dequeue()  # Process immediately for sequential
            results.append(record)
        return results

    # ------------------------------------------------------------------
    async def status_summary(self) -> dict:
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
    async def __aenter__(self) -> "AsyncPhoneFarmManager":
        await self.start()
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.stop()