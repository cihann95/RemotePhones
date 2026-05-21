"""JobQueue — in-memory priority queue for scheduled tasks."""

from __future__ import annotations

import heapq
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from scheduler.priority import JobStatus, Priority

logger = logging.getLogger(__name__)


@dataclass(order=True)
class _JobEntry:
    priority: int = field(compare=True)
    enqueued_at: float = field(default_factory=time.time, compare=True)
    job_id: str = field(compare=False, default="")

    def to_dict(self) -> dict[str, Any]:
        return {"job_id": self.job_id, "priority": self.priority}


class JobQueue:
    """Thread-safe, priority-ordered in-memory job queue.

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
        self._lock = threading.Lock()
        self.max_retries = max_retries
        self.retry_delay_s = retry_delay_s
        self._dequeued_event = threading.Event()

    # ------------------------------------------------------------------
    def enqueue(
        self, job_id: str, priority: int = Priority.NORMAL, payload: dict | None = None
    ) -> dict:
        priority = Priority.parse(priority)
        if job_id in self._store and self._store[job_id]["status"] in {
            JobStatus.PENDING,
            JobStatus.QUEUED,
            JobStatus.RUNNING,
        }:
            logger.warning("Job %s already %s — skipping enqueue",
                           job_id, self._store[job_id]["status"])
            return self._store[job_id]

        entry = _JobEntry(priority=priority, job_id=job_id)
        record = {
            "job_id": job_id,
            "priority": priority,
            "status": JobStatus.QUEUED,
            "payload": payload or {},
            "retries": 0,
            "created_at": time.time(),
            "result": None,
            "error": None,
        }
        with self._lock:
            heapq.heappush(self._heap, entry)
            self._store[job_id] = record
        logger.info("Enqueued job %s (priority=%d)", job_id, priority)
        self._dequeued_event.set()
        return record

    def dequeue(self) -> dict | None:
        """Remove and return the highest-priority pending job, or None."""
        with self._lock:
            while self._heap:
                entry = heapq.heappop(self._heap)
                job_id = entry.job_id
                record = self._store.get(job_id)
                if record and record["status"] == JobStatus.QUEUED:
                    record["status"] = JobStatus.RUNNING
                    logger.debug("Dequeued job %s", job_id)
                    return record
            return None

    def complete(self, job_id: str, result: Any = None) -> None:
        with self._lock:
            record = self._store.get(job_id)
            if record:
                record["status"] = JobStatus.COMPLETED
                record["result"] = result
                record["finished_at"] = time.time()
                logger.info("Job %s completed", job_id)

    def fail(self, job_id: str, error: str | None = None) -> bool:
        with self._lock:
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
                time.sleep(delay)
                record["status"] = JobStatus.QUEUED
                entry = _JobEntry(
                    priority=record["priority"],
                    job_id=job_id,
                )
                heapq.heappush(self._heap, entry)
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

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            record = self._store.get(job_id)
            if record and record["status"] in {
                JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RETRY,
            }:
                record["status"] = JobStatus.CANCELLED
                logger.info("Job %s cancelled", job_id)
                return True
            return False

    def get_status(self, job_id: str) -> dict | None:
        return self._store.get(job_id)

    def qsize(self) -> int:
        with self._lock:
            return len(self._heap)

    def clear(self) -> None:
        with self._lock:
            self._heap.clear()
            self._store.clear()
