"""Tests for scheduler.job_queue — retry, priority, cancel, qsize, persistence."""

from __future__ import annotations

import time
import threading
import pytest

from scheduler.job_queue import JobQueue
from scheduler.priority import Priority, JobStatus


# ── helpers ──────────────────────────────────────────────────────────────────

@pytest.fixture
def make_queue(tmp_path):
    def _make_queue(max_retries: int = 2, retry_delay_s: float = 0.05):
        return JobQueue(db_path=str(tmp_path / "test_job_queue.db"), max_retries=max_retries, retry_delay_s=retry_delay_s)
    return _make_queue


def enqueue(queue: JobQueue, job_id: str, priority: int = Priority.NORMAL) -> dict:
    return queue.enqueue(job_id, priority=priority)


# ── basic lifecycle ──────────────────────────────────────────────────────────

class TestEnqueue:
    def test_returns_record(self, make_queue):
        q = make_queue()
        rec = enqueue(q, "job-1")
        assert rec["job_id"] == "job-1"
        assert rec["status"] == JobStatus.QUEUED

    def test_duplicate_id_not_enqueued_twice(self, make_queue):
        q = make_queue()
        enqueue(q, "dup")
        rec = enqueue(q, "dup")
        assert rec["status"] == JobStatus.QUEUED  # already QUEUED, skip


class TestDequeue:
    def test_returns_none_when_empty(self, make_queue):
        assert make_queue().dequeue() is None

    def test_returns_highest_priority_first(self, make_queue):
        q = make_queue()
        enqueue(q, "low",    priority=Priority.LOW)
        enqueue(q, "normal", priority=Priority.NORMAL)
        enqueue(q, "high",   priority=Priority.HIGH)
        enqueue(q, "urgent", priority=Priority.URGENT)
        assert q.dequeue()["job_id"] == "urgent"
        assert q.dequeue()["job_id"] == "high"
        assert q.dequeue()["job_id"] == "normal"
        assert q.dequeue()["job_id"] == "low"

    def test_fifo_among_same_priority(self, make_queue):
        q = make_queue()
        enqueue(q, "a"); enqueue(q, "b"); enqueue(q, "c")
        assert q.dequeue()["job_id"] == "a"
        assert q.dequeue()["job_id"] == "b"

    def test_already_running_not_returned(self, make_queue):
        q = make_queue()
        enqueue(q, "busy")
        # Simulate running by updating the database directly
        with q._lock:
            q._get_conn().execute(
                "UPDATE jobs SET status = ? WHERE job_id = ?",
                (JobStatus.RUNNING, "busy"),
            )
            q._get_conn().commit()
        assert q.dequeue() is None  # nothing else queued


class TestComplete:
    def test_sets_completed(self, make_queue):
        q = make_queue(); enqueue(q, "j"); q.dequeue()
        q.complete("j", result={"data": 42})
        assert q.get_status("j")["status"] == JobStatus.COMPLETED
        assert q.get_status("j")["result"]["data"] == 42

    def test_finish_timestamp(self, make_queue):
        q = make_queue(); enqueue(q, "j"); q.dequeue()
        q.complete("j")
        assert "finished_at" in q.get_status("j")


class TestFailAndRetry:
    def test_fail_sets_failed_when_retries_exhausted(self, make_queue):
        q = make_queue(max_retries=1, retry_delay_s=0)
        enqueue(q, "j"); q.dequeue()
        ok = q.fail("j", "boom")
        assert ok is False
        assert q.get_status("j")["status"] == JobStatus.FAILED
        assert q.get_status("j")["error"] == "boom"

    def test_fail_retries_within_limit(self, make_queue):
        q = make_queue(max_retries=2, retry_delay_s=0)
        enqueue(q, "j"); q.dequeue()
        ok = q.fail("j", "err1")
        assert ok is True  # re-enqueued
        assert q.get_status("j")["retries"] == 1

    def test_fail_persists_error(self, make_queue):
        q = make_queue(max_retries=1, retry_delay_s=0)
        enqueue(q, "j"); q.dequeue()
        q.fail("j", "kaboom")
        assert q.get_status("j")["error"] == "kaboom"

    def test_third_fail_exhausted(self, make_queue):
        q = make_queue(max_retries=2, retry_delay_s=0)
        enqueue(q, "j-1", priority=Priority.NORMAL)
        rec = q.dequeue()
        assert rec is not None

        ok = q.fail("j-1", "err-1")
        assert ok is True
        assert q.get_status("j-1")["retries"] == 1
        rec2 = q.dequeue()
        assert rec2 is not None

        ok2 = q.fail("j-1", "err-2")
        assert ok2 is False
        status = q.get_status("j-1")
        assert status is not None
        assert status["status"] == JobStatus.FAILED
        assert status["retries"] == 2
        assert status["error"] == "err-2"
        assert q.dequeue() is None


class TestCancel:
    def test_cancel_pending(self, make_queue):
        q = make_queue()
        enqueue(q, "j")
        assert q.cancel("j") is True
        assert q.get_status("j")["status"] == JobStatus.CANCELLED

    def test_cancel_completed_is_noop(self, make_queue):
        q = make_queue(); enqueue(q, "j"); q.dequeue()
        q.complete("j")
        assert q.cancel("j") is False

    def test_cancel_unknown_returns_false(self, make_queue):
        assert make_queue().cancel("ghost") is False


class TestQsize:
    def test_zero_initially(self, make_queue):
        assert make_queue().qsize() == 0

    def test_after_enqueue(self, make_queue):
        q = make_queue()
        enqueue(q, "a"); enqueue(q, "b")
        assert q.qsize() == 2

    def test_after_dequeue(self, make_queue):
        q = make_queue(); enqueue(q, "a")
        q.dequeue()
        assert q.qsize() == 0


class TestThreadSafety:
    def test_concurrent_enqueue_dequeue(self, make_queue):
        q = make_queue()
        results: list[str] = []
        lock = threading.Lock()
        stop_event = threading.Event()

        def producer():
            for i in range(50):
                q.enqueue(f"p{i}")
            stop_event.set()

        def consumer():
            while not stop_event.is_set() or q.qsize() > 0:
                rec = q.dequeue()
                if rec:
                    with lock:
                        results.append(rec["job_id"])

        threads = [threading.Thread(target=producer), threading.Thread(target=consumer)]
        for t in threads: t.start()
        for t in threads: t.join(timeout=5)
        assert len(results) == 50


class TestClear:
    def test_clear_empties(self, make_queue):
        q = make_queue(); enqueue(q, "a"); enqueue(q, "b")
        q.clear()
        assert q.qsize() == 0
        assert q.get_status("a") is None


class TestPersistence:
    def test_jobs_persist_across_instances(self, tmp_path):
        db_path = str(tmp_path / "persist_test.db")
        
        q1 = JobQueue(db_path=db_path)
        q1.enqueue("persist-job", priority=Priority.HIGH, payload={"key": "value"})
        q1.dequeue()
        q1.complete("persist-job", result={"done": True})
        
        q2 = JobQueue(db_path=db_path)
        status = q2.get_status("persist-job")
        assert status is not None
        assert status["job_id"] == "persist-job"
        assert status["status"] == JobStatus.COMPLETED
        assert status["result"]["done"] is True
        assert status["payload"]["key"] == "value"

    def test_get_all_jobs(self, make_queue):
        q = make_queue()
        q.enqueue("job-1", payload={"a": 1})
        time.sleep(0.01)
        q.enqueue("job-2", payload={"b": 2})
        all_jobs = q.get_all_jobs()
        assert len(all_jobs) == 2
        assert all_jobs[0]["job_id"] == "job-2"
        assert all_jobs[1]["job_id"] == "job-1"


# ── :memory: mode ─────────────────────────────────────────────────────────

class TestMemoryDb:
    def test_memory_db_works(self):
        q = JobQueue(db_path=":memory:")
        q.enqueue("j1")
        jobs = q.get_all_jobs()
        assert len(jobs) == 1
        assert jobs[0]["job_id"] == "j1"


# ── WAL mode ──────────────────────────────────────────────────────────────

class TestWalMode:
    def test_wal_mode_enabled(self, make_queue):
        q = make_queue()
        cursor = q._conn.execute("PRAGMA journal_mode")
        mode = cursor.fetchone()[0]
        assert mode == "wal"


# ── get_queue_size alias ──────────────────────────────────────────────────

class TestGetQueueSize:
    def test_get_queue_size(self, make_queue):
        q = make_queue()
        q.enqueue("a")
        q.enqueue("b")
        assert q.get_queue_size() == 2
        q.dequeue()
        assert q.get_queue_size() == 1


# ── get_job_history ───────────────────────────────────────────────────────

class TestGetJobHistory:
    def test_returns_completed_jobs(self, make_queue):
        q = make_queue()
        q.enqueue("done-1")
        q.dequeue()
        q.complete("done-1", result={"ok": True})
        q.enqueue("done-2")
        q.dequeue()
        q.complete("done-2")
        history = q.get_job_history()
        assert len(history) == 2

    def test_respects_limit(self, make_queue):
        q = make_queue()
        for i in range(5):
            q.enqueue(f"j{i}")
            q.dequeue()
            q.complete(f"j{i}")
        history = q.get_job_history(limit=2)
        assert len(history) == 2

    def test_ordered_by_finished_at_desc(self, make_queue):
        q = make_queue()
        q.enqueue("first")
        q.dequeue()
        q.complete("first")
        time.sleep(0.01)
        q.enqueue("second")
        q.dequeue()
        q.complete("second")
        history = q.get_job_history()
        assert history[0]["job_id"] == "second"
        assert history[1]["job_id"] == "first"

    def test_includes_failed_and_cancelled(self, make_queue):
        q = make_queue(max_retries=1, retry_delay_s=0)
        q.enqueue("f")
        q.dequeue()
        q.fail("f", "err")  # max_retries=1, so it's FAILED
        q.enqueue("c")
        q.cancel("c")
        history = q.get_job_history()
        ids = {h["job_id"] for h in history}
        assert "f" in ids
        assert "c" in ids
