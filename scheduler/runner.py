"""TaskRunner — executes queued jobs by dispatching to registered task handlers."""

from __future__ import annotations

import logging
import threading
import time

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
    ) -> None:
        self.queue: JobQueue = queue or JobQueue()
        self.registry: TaskRegistry = registry or TaskRegistry()
        self.poll_interval = poll_interval
        self._running = False
        self._thread: threading.Thread | None = None

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

    def _execute(self, record: dict) -> None:
        job_id = record["job_id"]
        payload = record.get("payload", {})

        try:
            handler = self.registry.get(job_id)
            if handler is None:
                raise RuntimeError(f"No handler for {job_id}")

            # registry.get() may return a class (production tasks registered
            # via register_all()) or a plain callable instance (tests that
            # monkey-patch registry._tasks directly).
            #  • class  → instantiate with no-args (config is a class attr)
            #  • instance → use as-is
            if isinstance(handler, type):
                handler = handler()   # type: ignore[call-arg]

            # Prefer the BaseTask.execute() protocol; fall back to __call__ for
            # plain callable instances that tests register directly.
            callable_fn = getattr(handler, "execute", handler)

            logger.info("Executing job %s …", job_id)
            # payload follows the run_on_device() envelope:
            # {"task": name, "device_id": "...", "params": {...}}
            device_id = payload.get("device_id", "")
            task_params  = payload.get("params", {})
            import inspect
            sig = inspect.signature(callable_fn)
            if "device_id" in sig.parameters:
                result = callable_fn(device_id=device_id, params=task_params)
            else:
                # plain callable (tests): pass the whole payload dict
                result = callable_fn(payload)

            if isinstance(result, dict) and "error" in result:
                raise RuntimeError(result["error"])
            self.queue.complete(job_id, result)
            logger.info("Job %s done", job_id)
        except Exception as exc:
            logger.error("Job %s raised: %s", job_id, exc, exc_info=True)
            retried = self.queue.fail(job_id, str(exc))
            if not retried:
                logger.error("Job %s exhausted retries", job_id)

    def run_once(self) -> dict | None:
        """Pull and execute one job synchronously (useful for tests)."""
        record = self.queue.dequeue()
        if record is None:
            return None
        self._execute(record)
        return self.queue.get_status(record["job_id"])
