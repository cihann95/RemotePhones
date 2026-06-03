"""Worker that reads agent logs and writes entries to the status board."""

from __future__ import annotations

import json
import os
import time
from typing import Dict

from core.chronos.status_board import StatusBoard


class LogWatcher:
    """Watch a log file and return new lines since last check."""

    def __init__(self, log_path: str, state_file: str) -> None:
        self.log_path = log_path
        self.state_file = state_file
        self.offset = self._load_offset()

    def _load_offset(self) -> int:
        """Load the last offset from state file."""
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, "r") as f:
                    state = json.load(f)
                    return state.get(self.log_path, 0)
            except (json.JSONDecodeError, IOError):
                return 0
        return 0

    def _save_offset(self, offset: int) -> None:
        """Save the current offset to state file."""
        state = {}
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, "r") as f:
                    state = json.load(f)
            except (json.JSONDecodeError, IOError):
                pass
        state[self.log_path] = offset
        with open(self.state_file, "w") as f:
            json.dump(state, f)

    def new_lines(self) -> list[str]:
        """Return new lines since last check and update offset."""
        if not os.path.exists(self.log_path):
            return []
        with open(self.log_path, "r", encoding="utf-8") as f:
            f.seek(self.offset)
            new_data = f.read()
            new_offset = f.tell()
        lines = new_data.splitlines()
        self._save_offset(new_offset)
        return lines


def run_worker(
    status_board: StatusBoard,
    log_files: Dict[str, str],
    state_dir: str = ".",
    poll_interval: int = 5,
) -> None:
    """Run the worker loop.

    Args:
        status_board: The status board to write entries to.
        log_files: Mapping of agent name to log file path.
        state_dir: Directory to store offset state.
        poll_interval: Seconds to wait between polls.
    """
    # Ensure state directory exists
    os.makedirs(state_dir, exist_ok=True)
    state_file = os.path.join(state_dir, ".log_watcher_state.json")

    watchers = {
        agent: LogWatcher(path, state_file) for agent, path in log_files.items()
    }

    while True:
        for agent, watcher in watchers.items():
            lines = watcher.new_lines()
            if lines:
                # Join lines with newline and write as a single entry
                message = "\n".join(lines)
                status_board.write_entry(agent, message)
        time.sleep(poll_interval)


if __name__ == "__main__":
    # Default log files (relative to current working directory)
    log_files = {
        "Laguna": "LAGUNA_LOG.md",
        "Nemotron": "NEMOTRON_LOG.md",
        "Step": "STEP_LOG.md",
    }
    board = StatusBoard()
    # Run worker in the current directory (project root)
    run_worker(board, log_files, state_dir="core/chronos")