"""ADBClient — raw ADB shell command wrapper."""

import subprocess
import logging
import time
from typing import List, Optional


logger = logging.getLogger(__name__)


class ADBClient:
    """Thin wrapper around the ``adb`` binary used by the rest of the codebase."""

    def __init__(self, adb_path: str = "adb", default_device: Optional[str] = None,
                 max_retries: int = 3, retry_delay: float = 1.0):
        self.adb_path = adb_path
        self.default_device = default_device
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    def _device_prefix(self, device_id: Optional[str] = None) -> List[str]:
        if device_id is not None:
            return [self.adb_path, "-s", device_id]
        if self.default_device is not None:
            return [self.adb_path, "-s", self.default_device]
        return [self.adb_path]

    def _run(self, args: List[str], device_id: Optional[str] = None,
             timeout: int = 30) -> str:
        cmd = self._device_prefix(device_id) + args
        logger.debug("RUN: %s", " ".join(cmd))
        last_exc = None
        for attempt in range(1, self.max_retries + 1):
            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                )
                logger.debug("STDOUT: %s", result.stdout.strip())
                logger.debug("STDERR: %s", result.stderr.strip())
                return result.stdout
            except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    delay = self.retry_delay * (2 ** (attempt - 1))
                    logger.warning("ADB attempt %d/%d failed (%s), retrying in %.1fs",
                                   attempt, self.max_retries, type(exc).__name__, delay)
                    time.sleep(delay)
                else:
                    logger.error("ADB command failed after %d attempts: %s",
                                 self.max_retries, " ".join(cmd))
        raise last_exc  # type: ignore[misc]

    def shell(self, device_id: Optional[str] = None, timeout: int = 30) -> str:
        """Return open adb shell invocation for interactive use."""
        prefix = self._device_prefix(device_id)
        return subprocess.list2cmdline(prefix + ["shell"])

    def devices(self) -> List[str]:
        """Return a list of connected device IDs.

        Returns
        -------
        List[str]
            Serial IDs of all devices in the ``device`` state.
        """
        output = self._run(["devices"])
        ids: List[str] = []
        for line in output.splitlines():
            line = line.strip()
            if line and not line.startswith("List of devices"):
                parts = line.split()
                if len(parts) >= 2 and parts[1] == "device":
                    ids.append(parts[0])
        return ids

    def tap(self, x: int, y: int, device_id: Optional[str] = None) -> None:
        """Tap at screen coordinates (x, y)."""
        self._run(["shell", "input", "tap", str(x), str(y)], device_id=device_id)

    def swipe(self, x1: int, y1: int, x2: int, y2: int,
              duration_ms: int = 300, device_id: Optional[str] = None) -> None:
        """Swipe from (x1, y1) to (x2, y2) over *duration_ms* milliseconds."""
        self._run([
            "shell", "input", "swipe",
            str(x1), str(y1), str(x2), str(y2), str(duration_ms),
        ], device_id=device_id)

    def screencap(self, path: str = "/sdcard/screen.png",
                  device_id: Optional[str] = None) -> None:
        """Capture a screenshot and save it to *path* on the device."""
        self._run(["shell", "screencap", "-p", path], device_id=device_id)

    def pull(self, remote: str, local: str, device_id: Optional[str] = None) -> None:
        """Pull a file from the device (*remote*) to the host (*local*)."""
        self._run(["pull", remote, local], device_id=device_id)

    def push(self, local: str, remote: str, device_id: Optional[str] = None) -> None:
        """Push a file from the host (*local*) to the device (*remote*)."""
        self._run(["push", local, remote], device_id=device_id)

    def install(self, apk_path: str, device_id: Optional[str] = None) -> None:
        """Install an APK on the device (replace if already installed)."""
        self._run(["install", "-r", apk_path], device_id=device_id)

    def uninstall(self, package: str, device_id: Optional[str] = None) -> None:
        """Uninstall a package from the device."""
        self._run(["uninstall", package], device_id=device_id)

    def launch(self, package: str, activity: str,
               device_id: Optional[str] = None) -> None:
        """Launch an app activity on the device."""
        self._run([
            "shell", "am", "start", "-n",
            f"{package}/{activity}",
        ], device_id=device_id)

    def shell_output(self, command: str,
                     device_id: Optional[str] = None,
                     timeout: int = 30) -> str:
        """Execute a shell command on the device and return stdout."""
        return self._run(["shell", command], device_id=device_id, timeout=timeout)

    def run_command(self, args: List[str], device_id: Optional[str] = None,
                    timeout: int = 30) -> str:
        """Run an arbitrary ADB command and return stdout.

        Parameters
        ----------
        args:
            ADB subcommand and arguments (e.g. ``["shell", "input", "keyevent", "3"]``).
        device_id:
            ADB serial ID.  Falls back to ``default_device``.
        timeout:
            Seconds before the subprocess is killed.

        Returns
        -------
        str
            Captured stdout.
        """
        return self._run(args, device_id=device_id, timeout=timeout)
