"""AsyncJobQueue — async-friendly priority queue for scheduled tasks."""
from __future__ import annotations

import asyncio
import heapq
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from scheduler.priority import JobStatus, Priority

logger = logging.getLogger(__name__)


@dataclass(order=True)
class _JobEntry:
    priority: int = field(compare=True)
    enqueued_at: float = field(default_factory=time.time, compare=True)
    job_id: str = field(compare=False, default="")


class AsyncJobQueue:
    """Async-friendly, priority-ordered in-memory job queue.

    Parameters
    ----------
    max_retries:
        Maximum number of automatic retries for a failed job.
    retry_delay_s:
        Seconds to wait before re-enqueuing a failed job.
    """

    def __init__(self, max_retries: int = 3, retry_delay_s: float = 5.0) -> None:
        self._heap: list[_JobEntry] = []
        self._store: dict[str, dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self.max_retries = max_retries
        self.retry_delay_s = retry_delay_s
        self._dequeued_event = asyncio.Event()

async def enqueue(
         self, task_name: str, priority: int | str = Priority.NORMAL, payload: dict | None = None
     ) -> dict:
         job_id = task_name
         priority = Priority.parse(priority)
         async with self._lock:
             if job_id in self._store and self._store[job_id]["status"] in {
                 JobStatus.PENDING,
                 JobStatus.QUEUED,
                 JobStatus.RUNNING,
             }
        async with self._lock:
            heapq.heappush(self._heap, entry)
            self._store[job_id] = record
        logger.info("Enqueued job %s (priority=%d)", job_id, priority)
        self._dequeued_event.set()
        return record

    async def dequeue(self) -> Optional[dict]:
        """Remove and return the highest-priority pending job, or None."""
        await self._dequeued_event.wait()
        async with self._lock:
            while self._heap:
                entry = heapq.heappop(self._heap)
                job_id = entry.job_id
                record = self._store.get(job_id)
                if record and record["status"] == JobStatus.QUEUED:
                    record["status"] = JobStatus.RUNNING
                    logger.debug("Dequeued job %s", job_id)
                    # Clear event if queue might be empty now
                    if not self._heap:
                        self._dequeued_event.clear()
                    return record
            # If we get here, queue is empty
            self._dequeued_event.clear()
            return None

    async def complete(self, job_id: str, result: Any = None) -> None:
        async with self._lock:
            record = self._store.get(job_id)
            if record:
                record["status"] = JobStatus.COMPLETED
                record["result"] = result
                record["finished_at"] = time.time()
                logger.info("Job %s completed", job_id)

    async def fail(self, job_id: str, error: str | None = None) -> bool:
        async with self._lock:
            record = self._store.get(job_id)
            if not record:
                return False
            record["retries"] += 1
            if record["retries"] < self.max_retries:
                delay = self.retry_delay_s * record["retries"]
                logger.warning(
                    "Job %s failed (attempt %d/%d), retrying in %.1fs: %s",
                    job_id, record["retries"], self.max_retries, delay, error,
                )
                record["status"] = JobStatus.RETRY
                record["error"] = error
                # Non-blocking sleep
                await asyncio.sleep(delay)
                record["status"] = JobStatus.QUEUED
                entry = _JobEntry(
                    priority=record["priority"],
                    job_id=job_id,
                )
                heapq.heappush(self._heap, entry)
                self._dequeued_event.set()
                return True
            else:
                record["status"] = JobStatus.FAILED
                record["error"] = error
                record["finished_at"] = time.time()
                logger.error(
                    "Job %s failed permanently after %d attempt(s): %s",
                    job_id, record["retries"], error,
                )
                return False

    async def cancel(self, job_id: str) -> bool:
        async with self._lock:
            record = self._store.get(job_id)
            if record and record["status"] in {
                JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RETRY,
            }:
                record["status"] = JobStatus.CANCELLED
                logger.info("Job %s cancelled", job_id)
                return True
            return False

    def get_status(self, job_id: str) -> Optional[dict]:
        return self._store.get(job_id)

    def qsize(self) -> int:
        return len(self._heap)

    def clear(self) -> None:
        self._heap.clear()
        self._store.clear()
        self._dequeued_event.clear()