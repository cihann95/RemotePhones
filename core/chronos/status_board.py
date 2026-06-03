"""Status board implementation for logging agent activities."""

from __future__ import annotations

import os
from typing import List

from core.plugins.base_plugin import StatusBoardProtocol


class StatusBoard:
    """Simple status board that writes entries to a markdown file."""

    def __init__(self, file_path: str = "docs/architecture/STATUS_BOARD.md") -> None:
        self.file_path = file_path
        # Ensure the file exists
        if not os.path.exists(self.file_path):
            with open(self.file_path, "w", encoding="utf-8") as f:
                f.write("# Status Board\n\n")

    def write_entry(self, agent: str, message: str) -> None:
        """Write a single entry to the status board."""
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        entry = f"## [{timestamp}] — {agent}\n{message}\n\n"
        with open(self.file_path, "a", encoding="utf-8") as f:
            f.write(entry)

    def read_entries(self) -> List[str]:
        """Read all entries from the status board."""
        if not os.path.exists(self.file_path):
            return []
        with open(self.file_path, "r", encoding="utf-8") as f:
            content = f.read()
        # Simple split by double newline, but we keep the header
        # For simplicity, return lines
        return content.splitlines()

    def clear(self) -> None:
        """Clear the status board."""
        with open(self.file_path, "w", encoding="utf-8") as f:
            f.write("# Status Board\n\n")

