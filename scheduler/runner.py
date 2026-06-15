"""TaskRunner — executes queued jobs by dispatching to registered task handlers."""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

from core.adb import ADBTimeoutError, DeviceDisconnectedError
from scheduler.job_queue import JobQueue, JobStatus
from tasks.registry import TaskRegistry

logger = logging.getLogger(__name__)


class TaskRunner:
    """Worker that pulls jobs from a :class:`JobQueue` and dispatches them.

    Parameters
    ----------
    queue:
        Priority queue to pull jobs from.
    registry:
        Task registry used to look up callables by job ID.
    poll_interval:
        Seconds to wait when the queue is empty before re-polling.
    """

    def __init__(
        self,
        queue: JobQueue | None = None,
        registry: TaskRegistry | None = None,
        poll_interval: float = 1.0,
        device_manager: Any = None,
    ) -> None:
        self.queue: JobQueue = queue or JobQueue()
        self.registry: TaskRegistry = registry or TaskRegistry()
        self.poll_interval = poll_interval
        self.device_manager = device_manager
        self._running = False
        self._thread: threading.Thread | None = None
        self._running_devices: set[str] = set()
        self._device_lock = threading.Lock()

    # ------------------------------------------------------------------
    def start(self, daemon: bool = True) -> None:
        if self._running:
            logger.warning("TaskRunner already running")
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._loop, daemon=daemon, name="TaskRunner"
        )
        self._thread.start()
        logger.info("TaskRunner started (poll_interval=%.1fs)", self.poll_interval)

    def stop(self, timeout: float = 5.0) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=timeout)
            self._thread = None
        logger.info("TaskRunner stopped")

    # ------------------------------------------------------------------
    def _loop(self) -> None:
        while self._running:
            record = self.queue.dequeue()
            if record is None:
                time.sleep(self.poll_interval)
                continue
            self._execute(record)

    def _is_device_running(self, device_id: str) -> bool:
        """Check if a device is already executing a job (E4: concurrent job guard)."""
        with self._device_lock:
            return device_id in self._running_devices

    def _acquire_device_tracking(self, device_id: str) -> bool:
        """Atomically check and mark a device as running. Returns False if already busy."""
        with self._device_lock:
            if device_id in self._running_devices:
                return False
            self._running_devices.add(device_id)
            return True

    def _release_device_tracking(self, device_id: str) -> None:
        """Remove a device from the running set after job completion."""
        with self._device_lock:
            self._running_devices.discard(device_id)

    def _execute(self, record: dict) -> None:
        job_id = record["job_id"]
        payload = record.get("payload", {})
        device_id = payload.get("device_id", "")

        if device_id:
            if self._is_device_running(device_id):
                logger.warning(
                    "E4: Device %s already has a running job — rejecting job %s. "
                    "Wait for the current job to finish before submitting another.",
                    device_id, job_id,
                )
                self.queue.fail(
                    job_id,
                    f"Device {device_id} is already running a job. "
                    "Please wait for the current job to complete.",
                )
                return
            if not self._acquire_device_tracking(device_id):
                logger.warning("Device %s concurrent access detected, re-queuing job %s", device_id, job_id)
                self.queue.fail(job_id, f"Device {device_id} is busy, re-queuing")
                return

        if device_id and self.device_manager:
            if not self.device_manager.acquire_device(device_id):
                logger.warning("Device %s is busy (device manager), re-queuing job %s", device_id, job_id)
                self._release_device_tracking(device_id)
                self.queue.fail(job_id, f"Device {device_id} is busy (device manager), re-queuing")
                return

        try:
            task_name = payload.get("task")
            if task_name is None:
                logger.error("Job %s has no task in payload", job_id)
                self.queue.permanent_fail(job_id, "No handler for None")
                return
            handler = self.registry.get(task_name)
            if handler is None:
                raise RuntimeError(f"No handler for {task_name}")

            if isinstance(handler, type):
                handler = handler(device_manager=self.device_manager)

            callable_fn = getattr(handler, "execute", handler)

            logger.info("Executing job %s on device %s …", job_id, device_id)
            task_params = payload.get("params", {})
            import inspect
            sig = inspect.signature(callable_fn)
            has_kwargs = any(
                p.kind == inspect.Parameter.VAR_KEYWORD
                for p in sig.parameters.values()
            )
            if "device_id" in sig.parameters or has_kwargs:
                result = callable_fn(device_id=device_id, params=task_params)
            else:
                result = callable_fn(payload)

            if hasattr(result, 'ok') and not result.ok:
                raise RuntimeError(getattr(result, 'error', 'Task failed'))
            elif isinstance(result, dict) and "error" in result:
                raise RuntimeError(result["error"])
            self.queue.complete(job_id, result)
            logger.info("Job %s done", job_id)
        except DeviceDisconnectedError as exc:
            logger.error("Job %s failed: device %s disconnected", job_id, device_id)
            if self.device_manager:
                self.device_manager.disconnect(device_id)
            retried = self.queue.fail(job_id, str(exc))
            if not retried:
                logger.error("Job %s exhausted retries after disconnect", job_id)
        except ADBTimeoutError as exc:
            logger.error("Job %s failed: timeout on device %s", job_id, device_id)
            retried = self.queue.fail(job_id, str(exc))
            if not retried:
                logger.error("Job %s exhausted retries after timeout", job_id)
        except (KeyboardInterrupt, SystemExit) as exc:
            logger.warning("Job %s interrupted by %s, releasing device %s", job_id, type(exc).__name__, device_id)
            raise
        except Exception as exc:
            logger.error("Job %s raised: %s", job_id, exc, exc_info=True)
            retried = self.queue.fail(job_id, str(exc))
            if not retried:
                logger.error("Job %s exhausted retries", job_id)
        finally:
            if device_id:
                self._release_device_tracking(device_id)
            if device_id and self.device_manager:
                self.device_manager.release_device(device_id)

    def run_once(self) -> dict | None:
        """Pull and execute one job synchronously (useful for tests)."""
        record = self.queue.dequeue()
        if record is None:
            return None
        self._execute(record)
        return self.queue.get_status(record["job_id"])
