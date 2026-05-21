"""Pytest configuration — ensure the project root is on sys.path so that
`core/`, `scheduler/`, `tasks/`, `automations/`, `monitor/` are importable
without installing the package."""

import sys
import os

root = os.path.dirname(os.path.abspath(__file__))
if root not in sys.path:
    sys.path.insert(0, root)
