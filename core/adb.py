"""ADBClient — raw ADB shell command wrapper."""

import subprocess
import logging

logger = logging.getLogger(__name__)


class ADBClient:
    """Thin wrapper around the ``adb`` binary used by the rest of the codebase."""

    def __init__(self, adb_path: str = "adb", default_device: str | None = None):
        self.adb_path = adb_path
        self.default_device = default_device

    def _device_prefix(self, device_id: str | None = None) -> list[str]:
        if device_id or self.default_device:
            return [self.adb_path, "-s", device_id or self.default_device]
        return [self.adb_path]

    def _run(self, args: list[str], timeout: int = 30) -> str:
        cmd = self._device_prefix() + args
        logger.debug("RUN: %s", " ".join(cmd))
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
        except subprocess.TimeoutExpired:
            logger.error("ADB command timed out: %s", " ".join(cmd))
            raise
        except FileNotFoundError:
            logger.error("adb binary not found: %s", self.adb_path)
            raise

    def shell(self, device_id: str | None = None, timeout: int = 30) -> str:
        """Return open adb shell invocation for interactive use."""
        prefix = self._device_prefix(device_id)
        return subprocess.list2cmdline(prefix + ["shell"])

    def devices(self) -> list[str]:
        output = self._run(["devices"])
        ids: list[str] = []
        for line in output.splitlines():
            line = line.strip()
            if line and not line.startswith("List of devices"):
                parts = line.split()
                if len(parts) >= 2 and parts[1] == "device":
                    ids.append(parts[0])
        return ids

    def tap(self, x: int, y: int, device_id: str | None = None) -> None:
        self._run(["shell", "input", "tap", str(x), str(y)])

    def swipe(self, x1: int, y1: int, x2: int, y2: int,
              duration_ms: int = 300, device_id: str | None = None) -> None:
        self._run([
            "shell", "input", "swipe",
            str(x1), str(y1), str(x2), str(y2), str(duration_ms),
        ])

    def screencap(self, path: str = "/sdcard/screen.png",
                  device_id: str | None = None) -> None:
        self._run(["shell", "screencap", "-p", path])

    def pull(self, remote: str, local: str, device_id: str | None = None) -> None:
        self._run(["pull", remote, local])

    def push(self, local: str, remote: str, device_id: str | None = None) -> None:
        self._run(["push", local, remote])

    def install(self, apk_path: str, device_id: str | None = None) -> None:
        self._run(["install", "-r", apk_path])

    def uninstall(self, package: str, device_id: str | None = None) -> None:
        self._run(["uninstall", package])

    def launch(self, package: str, activity: str,
               device_id: str | None = None) -> None:
        self._run([
            "shell", "am", "start", "-n",
            f"{package}/{activity}",
        ])

    def shell_output(self, command: str,
                     device_id: str | None = None,
                     timeout: int = 30) -> str:
        return self._run(["shell", command], timeout=timeout)
