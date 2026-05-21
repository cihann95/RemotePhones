"""Tests for scheduler.job_queue — retry, priority, cancel, qsize."""

from __future__ import annotations

import time
import threading
import pytest

from scheduler.job_queue import JobQueue
from scheduler.priority import Priority, JobStatus


# ── helpers ──────────────────────────────────────────────────────────────────


def make_queue(max_retries: int = 2, retry_delay_s: float = 0.05):
    return JobQueue(max_retries=max_retries, retry_delay_s=retry_delay_s)


def enqueue(queue: JobQueue, job_id: str, priority: int = Priority.NORMAL) -> dict:
    return queue.enqueue(job_id, priority=priority)


# ── basic lifecycle ──────────────────────────────────────────────────────────


class TestEnqueue:
    def test_returns_record(self):
        q = make_queue()
        rec = enqueue(q, "job-1")
        assert rec["job_id"] == "job-1"
        assert rec["status"] == JobStatus.QUEUED

    def test_duplicate_id_not_enqueued_twice(self):
        q = make_queue()
        enqueue(q, "dup")
        rec = enqueue(q, "dup")
        assert rec["status"] == JobStatus.QUEUED  # already QUEUED, skip


class TestDequeue:
    def test_returns_none_when_empty(self):
        assert make_queue().dequeue() is None

    def test_returns_highest_priority_first(self):
        q = make_queue()
        enqueue(q, "low",    priority=Priority.LOW)
        enqueue(q, "normal", priority=Priority.NORMAL)
        enqueue(q, "high",   priority=Priority.HIGH)
        enqueue(q, "urgent", priority=Priority.URGENT)
        # heapq (min-heap): lower value => dequeued first
        assert q.dequeue()["job_id"] == "urgent"
        assert q.dequeue()["job_id"] == "high"
        assert q.dequeue()["job_id"] == "normal"
        assert q.dequeue()["job_id"] == "low"

    def test_fifo_among_same_priority(self):
        q = make_queue()
        enqueue(q, "a"); enqueue(q, "b"); enqueue(q, "c")
        assert q.dequeue()["job_id"] == "a"
        assert q.dequeue()["job_id"] == "b"

    def test_already_running_not_returned(self):
        q = make_queue()
        rec = enqueue(q, "busy")
        rec["status"] = JobStatus.RUNNING  # simulate
        assert q.dequeue() is None  # nothing else queued


class TestComplete:
    def test_sets_completed(self):
        q = make_queue(); enqueue(q, "j"); q.dequeue()
        q.complete("j", result={"data": 42})
        assert q.get_status("j")["status"] == JobStatus.COMPLETED
        assert q.get_status("j")["result"]["data"] == 42

    def test_finish_timestamp(self):
        q = make_queue(); enqueue(q, "j"); q.dequeue()
        q.complete("j")
        assert "finished_at" in q.get_status("j")


class TestFailAndRetry:
    def test_fail_sets_failed_when_retries_exhausted(self):
        q = make_queue(max_retries=1, retry_delay_s=0)
        enqueue(q, "j"); q.dequeue()
        ok = q.fail("j", "boom")
        assert ok is False
        assert q.get_status("j")["status"] == JobStatus.FAILED
        assert q.get_status("j")["error"] == "boom"

    def test_fail_retries_within_limit(self):
        q = make_queue(max_retries=2, retry_delay_s=0)
        enqueue(q, "j"); q.dequeue()
        ok = q.fail("j", "err1")
        assert ok is True  # re-enqueued
        assert q.get_status("j")["retries"] == 1

    def test_fail_persists_error(self):
        q = make_queue(max_retries=1, retry_delay_s=0)
        enqueue(q, "j"); q.dequeue()
        q.fail("j", "kaboom")
        assert q.get_status("j")["error"] == "kaboom"

    def test_third_fail_exhausted(self):
        """One job: first fail retries it, second fail exhausts retries -> FAILED."""
        q = make_queue(max_retries=2, retry_delay_s=0)
        enqueue(q, "j-1", priority=Priority.NORMAL)
        rec = q.dequeue()
        assert rec is not None

        # ── attempt 1 / 2 → re-enqueued ─────────────────────────────────────
        ok = q.fail("j-1", "err-1")
        assert ok is True
        # With a zero-second delay the status is already QUEUED by the
        # time fail() returns; retries==1 is the observable proof.
        assert q.get_status("j-1")["retries"] == 1
        rec2 = q.dequeue()
        assert rec2 is not None

        # ── attempt 2 / 2 → exhausted → FAILED ──────────────────────────────
        ok2 = q.fail("j-1", "err-2")
        assert ok2 is False
        status = q.get_status("j-1")
        assert status is not None, "record should survive in store after FAILED"
        assert status["status"] == JobStatus.FAILED
        assert status["retries"] == 2
        assert status["error"] == "err-2"

        # ── queue is empty ──────────────────────────────────────────────────
        assert q.dequeue() is None


class TestCancel:
    def test_cancel_pending(self):
        q = make_queue()
        enqueue(q, "j")
        assert q.cancel("j") is True
        assert q.get_status("j")["status"] == JobStatus.CANCELLED

    def test_cancel_completed_is_noop(self):
        q = make_queue(); enqueue(q, "j"); q.dequeue()
        q.complete("j")
        assert q.cancel("j") is False

    def test_cancel_unknown_returns_false(self):
        assert make_queue().cancel("ghost") is False


class TestQsize:
    def test_zero_initially(self):
        assert make_queue().qsize() == 0

    def test_after_enqueue(self):
        q = make_queue()
        enqueue(q, "a"); enqueue(q, "b")
        assert q.qsize() == 2

    def test_after_dequeue(self):
        q = make_queue(); enqueue(q, "a")
        q.dequeue()
        assert q.qsize() == 0


class TestThreadSafety:
    def test_concurrent_enqueue_dequeue(self):
        q = make_queue()
        results: list[str | None] = []
        lock = threading.Lock()

        def producer():
            for i in range(50):
                q.enqueue(f"p{i}")

        def consumer():
            for _ in range(50):
                rec = q.dequeue()
                if rec:
                    with lock:
                        results.append(rec["job_id"])

        threads = [threading.Thread(target=producer), threading.Thread(target=consumer)]
        for t in threads: t.start()
        for t in threads: t.join(timeout=5)
        assert len(results) == 50


class TestClear:
    def test_clear_empties(self):
        q = make_queue(); enqueue(q, "a"); enqueue(q, "b")
        q.clear()
        assert q.qsize() == 0
        assert q.get_status("a") is None
