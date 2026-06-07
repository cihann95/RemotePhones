"""JobQueue — persistent SQLite priority queue for scheduled tasks."""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time
from typing import Any

from scheduler.priority import JobStatus, Priority

logger = logging.getLogger(__name__)


class JobQueue:
    """Thread-safe, priority-ordered persistent SQLite job queue.

    Parameters
    ----------
    db_path:
        Path to the SQLite database file. Defaults to "job_queue.db".
    max_retries:
        Maximum number of automatic retries for a failed job.
    retry_delay_s:
        Seconds to wait before re-enqueuing a failed job.
    """

    def __init__(self, db_path: str = "job_queue.db", max_retries: int = 3, retry_delay_s: float = 5.0) -> None:
        self.db_path = db_path
        self.max_retries = max_retries
        self.retry_delay_s = retry_delay_s
        self._lock = threading.Lock()
        self._dequeued_event = threading.Event()
        # Cache a single connection for the lifetime of the queue.
        # check_same_thread=False is safe because all writes are serialised
        # through self._lock.
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        """Return the cached connection (kept for backward compat)."""
        return self._conn

    def _init_db(self) -> None:
        with self._lock:
            conn = self._conn
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    priority INTEGER,
                    status TEXT,
                    payload TEXT,
                    retries INTEGER,
                    created_at REAL,
                    finished_at REAL,
                    result TEXT,
                    error TEXT
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority, created_at)")
            conn.commit()

    def _row_to_dict(self, row: sqlite3.Row) -> dict:
        return {
            "job_id": row["job_id"],
            "priority": row["priority"],
            "status": row["status"],
            "payload": json.loads(row["payload"]) if row["payload"] else {},
            "retries": row["retries"],
            "created_at": row["created_at"],
            "finished_at": row["finished_at"],
            "result": json.loads(row["result"]) if row["result"] else None,
            "error": row["error"],
        }

    def enqueue(
        self, job_id: str, priority: int | str = Priority.NORMAL, payload: dict | None = None
    ) -> dict:
        priority = Priority.parse(priority)
        payload_str = json.dumps(payload or {})

        with self._lock:
            conn = self._conn
            cursor = conn.execute(
                "SELECT * FROM jobs WHERE job_id = ?", (job_id,)
            )
            row = cursor.fetchone()
            if row and row["status"] in {JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RUNNING}:
                logger.warning("Job %s already %s — skipping enqueue", job_id, row["status"])
                return self._row_to_dict(row)

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
            conn.execute(
                """
                INSERT OR REPLACE INTO jobs 
                (job_id, priority, status, payload, retries, created_at, finished_at, result, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id, priority, JobStatus.QUEUED, payload_str, 0,
                    record["created_at"], None, None, None
                )
            )
            conn.commit()
        logger.info("Enqueued job %s (priority=%d)", job_id, priority)
        self._dequeued_event.set()
        return record

    def dequeue(self) -> dict | None:
        """Remove and return the highest-priority pending job, or None."""
        with self._lock:
            conn = self._conn
            cursor = conn.execute(
                """
                SELECT * FROM jobs 
                WHERE status = ? 
                ORDER BY priority ASC, created_at ASC 
                LIMIT 1
                """,
                (JobStatus.QUEUED,)
            )
            row = cursor.fetchone()
            if row:
                job_id = row["job_id"]
                conn.execute(
                    "UPDATE jobs SET status = ? WHERE job_id = ?",
                    (JobStatus.RUNNING, job_id)
                )
                conn.commit()
                logger.debug("Dequeued job %s", job_id)
                return self._row_to_dict(row)
            return None

    def complete(self, job_id: str, result: Any = None) -> None:
        result_str = json.dumps(result.as_dict() if hasattr(result, "as_dict") else result) if result is not None else None
        with self._lock:
            conn = self._conn
            conn.execute(
                """
                UPDATE jobs 
                SET status = ?, result = ?, finished_at = ? 
                WHERE job_id = ?
                """,
                (JobStatus.COMPLETED, result_str, time.time(), job_id)
            )
            conn.commit()
            logger.info("Job %s completed", job_id)

    def fail(self, job_id: str, error: str | None = None) -> bool:
        with self._lock:
            conn = self._conn
            cursor = conn.execute(
                "SELECT retries, priority FROM jobs WHERE job_id = ?", (job_id,)
            )
            row = cursor.fetchone()
            if not row:
                return False
            
            retries = row["retries"] + 1
            priority = row["priority"]
            
            if retries < self.max_retries:
                delay = self.retry_delay_s * retries
                logger.warning(
                    "Job %s failed (attempt %d/%d), retrying in %.1fs: %s",
                    job_id, retries, self.max_retries, delay, error,
                )
                conn.execute(
                    """
                    UPDATE jobs 
                    SET status = ?, retries = ?, error = ? 
                    WHERE job_id = ?
                    """,
                    (JobStatus.RETRY, retries, error, job_id)
                )
            else:
                conn.execute(
                    """
                    UPDATE jobs 
                    SET status = ?, retries = ?, error = ?, finished_at = ? 
                    WHERE job_id = ?
                    """,
                    (JobStatus.FAILED, retries, error, time.time(), job_id)
                )
                logger.error(
                    "Job %s failed permanently after %d attempt(s): %s",
                    job_id, retries, error,
                )
                conn.commit()
                return False
            conn.commit()

        if retries < self.max_retries:
            time.sleep(self.retry_delay_s * retries)
            with self._lock:
                conn = self._conn
                cursor = conn.execute(
                    "SELECT status FROM jobs WHERE job_id = ?", (job_id,)
                )
                row = cursor.fetchone()
                if row and row["status"] == JobStatus.RETRY:
                    conn.execute(
                        "UPDATE jobs SET status = ? WHERE job_id = ?",
                        (JobStatus.QUEUED, job_id)
                    )
                    conn.commit()
            return True
        return False

    def permanent_fail(self, job_id: str, error: str | None = None) -> None:
        """Fail a job permanently without retries."""
        with self._lock:
            conn = self._conn
            conn.execute(
                """
                UPDATE jobs
                SET status = ?, error = ?, finished_at = ?
                WHERE job_id = ?
                """,
                (JobStatus.FAILED, error, time.time(), job_id)
            )
            conn.commit()
            logger.error("Job %s failed permanently: %s", job_id, error)

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            conn = self._conn
            cursor = conn.execute(
                "SELECT status FROM jobs WHERE job_id = ?", (job_id,)
            )
            row = cursor.fetchone()
            if row and row["status"] in {JobStatus.PENDING, JobStatus.QUEUED, JobStatus.RETRY}:
                conn.execute(
                    "UPDATE jobs SET status = ? WHERE job_id = ?",
                    (JobStatus.CANCELLED, job_id)
                )
                conn.commit()
                logger.info("Job %s cancelled", job_id)
                return True
            return False

    def get_status(self, job_id: str) -> dict | None:
        with self._lock:
            conn = self._conn
            cursor = conn.execute(
                "SELECT * FROM jobs WHERE job_id = ?", (job_id,)
            )
            row = cursor.fetchone()
            if row:
                return self._row_to_dict(row)
            return None

    def qsize(self) -> int:
        with self._lock:
            conn = self._conn
            cursor = conn.execute(
                "SELECT COUNT(*) FROM jobs WHERE status = ?", (JobStatus.QUEUED,)
            )
            return cursor.fetchone()[0]

    def clear(self) -> None:
        with self._lock:
            conn = self._conn
            conn.execute("DELETE FROM jobs")
            conn.commit()

    def get_all_jobs(self) -> list[dict]:
        """Return all jobs, ordered by created_at descending."""
        with self._lock:
            conn = self._conn
            cursor = conn.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC"
            )
            return [self._row_to_dict(row) for row in cursor.fetchall()]

    def get_queue_size(self) -> int:
        return self.qsize()

    def get_job_history(self, limit: int = 100) -> list[dict]:
        """Return last *limit* completed/failed/cancelled jobs, most recent first."""
        with self._lock:
            conn = self._conn
            cursor = conn.execute(
                """
                SELECT * FROM jobs
                WHERE status IN (?, ?, ?)
                ORDER BY finished_at DESC
                LIMIT ?
                """,
                (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED, limit),
            )
            return [self._row_to_dict(row) for row in cursor.fetchall()]
