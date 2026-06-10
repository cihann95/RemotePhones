"""Pytest configuration — ensure the project root is on sys.path so that
`core/`, `scheduler/`, `tasks/`, `automations/`, `monitor/` are importable
without installing the package."""

import sys
import os

import pytest

from scheduler.job_queue import JobQueue

root = os.path.dirname(os.path.abspath(__file__))
if root not in sys.path:
    sys.path.insert(0, root)


@pytest.fixture
def isolated_job_queue():
    """Return a JobQueue backed by an in-memory SQLite database so that tests
    do not pollute each other through the shared ``job_queue.db`` file."""
    return JobQueue(db_path=":memory:")
