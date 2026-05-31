"""Job priority levels used throughout the scheduler."""

from __future__ import annotations


class Priority:
    URGENT = 0   # dequeued first (heapq = min-heap)
    HIGH = 1
    NORMAL = 2
    LOW = 3      # dequeued last

    # Tier aliases for backward compatibility
    TIER_FAST = URGENT
    TIER_MAIN = NORMAL
    TIER_BULK = LOW

    # Mapping from tier names to priority values
    TIER_MAP = {
        "fast": URGENT,
        "high": HIGH,
        "main": NORMAL,
        "normal": NORMAL,
        "bulk": LOW,
        "low": LOW,
        "urgent": URGENT,
    }
    assert set(TIER_MAP.values()) == {0, 1, 2, 3}, "TIER_MAP must map to exactly {URGENT, HIGH, NORMAL, LOW}"

    _ORDER = {"urgent": URGENT, "high": HIGH, "normal": NORMAL, "low": LOW}

    @classmethod
    def parse(cls, value: str | int) -> int:
        if isinstance(value, int):
            return value
        return cls._ORDER.get(str(value).lower(), cls.NORMAL)

    @classmethod
    def tier_name(cls, value: int | str) -> str:
        """Convert priority value to tier name.
        
        For known integer values (0-3), returns the canonical name.
        For known string tiers, returns the string if it's in TIER_MAP.
        For unknown values, returns "unknown-{value}".
        """
        if isinstance(value, int):
            # Map integer values to canonical names
            if value == cls.URGENT:
                return "urgent"
            elif value == cls.HIGH:
                return "high"
            elif value == cls.NORMAL:
                return "normal"
            elif value == cls.LOW:
                return "low"
            else:
                return f"unknown-{value}"
        else:
            # String input
            value_lower = str(value).lower()
            if value_lower in cls.TIER_MAP:
                return value_lower
            return f"unknown-{value}"


class JobStatus:
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRY = "retry"
