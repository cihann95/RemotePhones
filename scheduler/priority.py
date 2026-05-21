"""Job priority levels used throughout the scheduler."""

from __future__ import annotations


class Priority:
    URGENT = 0   # dequeued first (heapq = min-heap)
    HIGH = 1
    NORMAL = 2
    LOW = 3      # dequeued last

    _ORDER = {"urgent": URGENT, "high": HIGH, "normal": NORMAL, "low": LOW}

    @classmethod
    def parse(cls, value: str | int) -> int:
        if isinstance(value, int):
            return value
        return cls._ORDER.get(str(value).lower(), cls.NORMAL)


class JobStatus:
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRY = "retry"
