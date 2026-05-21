"""Tests for scheduler.priority — Priority constants, parse(), tier_name(), TIER_MAP."""

from __future__ import annotations

import pytest

from scheduler.priority import Priority, JobStatus


# ── priority constants (heap min-order) ───────────────────────────────────────


class TestPriorityOrdering:
    def test_urgent_is_lowest(self):
        assert Priority.URGENT == 0

    def test_values_ascend_by_severity(self):
        assert Priority.HIGH   > Priority.URGENT
        assert Priority.NORMAL > Priority.HIGH
        assert Priority.LOW    > Priority.NORMAL

    def test_dequeue_order(self):
        # heapq min-heap: URGENT popped first, LOW last
        q = [Priority.LOW, Priority.NORMAL, Priority.HIGH, Priority.URGENT]
        import heapq; heapq.heapify(q)
        assert heapq.heappop(q) == Priority.URGENT
        assert heapq.heappop(q) == Priority.HIGH
        assert heapq.heappop(q) == Priority.NORMAL
        assert heapq.heappop(q) == Priority.LOW


# ── Tier aliases / TIER_MAP ───────────────────────────────────────────────────


class TestTierAliases:
    def test_tier_fast_is_urgent(self):
        assert Priority.TIER_FAST == Priority.URGENT == 0

    def test_tier_main_is_normal(self):
        assert Priority.TIER_MAIN == Priority.NORMAL == 2

    def test_tier_bulk_is_low(self):
        assert Priority.TIER_BULK == Priority.LOW == 3

    def test_tier_map_has_expected_keys(self):
        for key in ("fast", "high", "main", "normal", "bulk", "low"):
            assert key in Priority.TIER_MAP

    def test_tier_map_values_match_constants(self):
        assert Priority.TIER_MAP["fast"]   == Priority.URGENT
        assert Priority.TIER_MAP["high"]   == Priority.HIGH
        assert Priority.TIER_MAP["main"]   == Priority.NORMAL
        assert Priority.TIER_MAP["normal"] == Priority.NORMAL
        assert Priority.TIER_MAP["bulk"]   == Priority.LOW
        assert Priority.TIER_MAP["low"]    == Priority.LOW

    def test_no_duplicate_values_in_tier_map(self):
        # Six keys map to four distinct values (0-3); aliases share values
        # (normal==main==2, low==bulk==3) which is intentional.
        distinct = set(Priority.TIER_MAP.values())
        assert distinct <= {0, 1, 2, 3}, "TIER_MAP values outside [0,3] range"
        assert len(distinct) == 4, "TIER_MAP should have exactly 4 unique values"


class TestTierName:
    def test_urgent_integer(self):
        assert Priority.tier_name(0) == "urgent"

    def test_high_integer(self):
        assert Priority.tier_name(1) == "high"

    def test_normal_integer(self):
        assert Priority.tier_name(2) == "normal"

    def test_low_integer(self):
        assert Priority.tier_name(3) == "low"

    def test_tier_fast_alias_resolves_to_urgent(self):
        # TIER_FAST is the URGENT value — canonical name is "urgent"
        assert Priority.tier_name(Priority.TIER_FAST) == "urgent"

    def test_tier_main_alias_resolves_to_normal(self):
        assert Priority.tier_name(Priority.TIER_MAIN) == "normal"

    def test_tier_bulk_alias_resolves_to_low(self):
        assert Priority.tier_name(Priority.TIER_BULK) == "low"

    def test_string_passthrough(self):
        assert Priority.tier_name("fast")  == "fast"
        assert Priority.tier_name("urgent") == "urgent"
        assert Priority.tier_name("normal") == "normal"

    def test_unknown_int(self):
        result = Priority.tier_name(99)
        assert "unknown" in result
        assert "99" in result


# ── JobStatus ─────────────────────────────────────────────────────────────────


class TestJobStatus:
    def test_values(self):
        assert JobStatus.PENDING    == "pending"
        assert JobStatus.QUEUED    == "queued"
        assert JobStatus.RUNNING   == "running"
        assert JobStatus.COMPLETED == "completed"
        assert JobStatus.FAILED    == "failed"
        assert JobStatus.CANCELLED == "cancelled"
        assert JobStatus.RETRY     == "retry"
