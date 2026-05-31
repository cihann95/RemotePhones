"""AsyncADBClient — asynchronous ADB shell command wrapper."""
from __future__ import annotations

import asyncio
import logging
import subprocess
from typing import List, Optional, cast

logger = logging.getLogger(__name__)


class AsyncADBClient:
    """Asynchronous wrapper around the ``adb`` binary used by the rest of the codebase."""

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

    async def _run(self, args: List[str], timeout: int = 30, device_id: Optional[str] = None) -> str:
        """Run ADB command asynchronously with retry logic."""
        cmd = self._device_prefix(device_id) + args
        logger.debug("RUN: %s", " ".join(cmd))
        
        last_exc = None
        for attempt in range(1, self.max_retries + 1):
            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), 
                    timeout=timeout
                )
                
                output = stdout.decode().strip()
                error_output = stderr.decode().strip()
                
                logger.debug("STDOUT: %s", output)
                logger.debug("STDERR: %s", error_output)
                
                if process.returncode != 0:
                    raise subprocess.CalledProcessError(cast(int, process.returncode), cmd, output, error_output)
                    
                return output
                
            except (asyncio.TimeoutError, FileNotFoundError, subprocess.CalledProcessError) as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    delay = self.retry_delay * (2 ** (attempt - 1))
                    logger.warning("ADB attempt %d/%d failed (%s), retrying in %.1fs",
                                   attempt, self.max_retries, type(exc).__name__, delay)
                    await asyncio.sleep(delay)
                else:
                    logger.error("ADB command failed after %d attempts: %s",
                                 self.max_retries, " ".join(cmd))
        raise last_exc  # type: ignore[misc]

    async def shell(self, device_id: Optional[str] = None, timeout: int = 30) -> str:
        """Return open adb shell invocation for interactive use."""
        prefix = self._device_prefix(device_id)
        # For shell, we just return the command string as it's meant for interactive use
        return subprocess.list2cmdline(prefix + ["shell"])

    async def devices(self) -> List[str]:
        """Return a list of connected device IDs asynchronously."""
        output = await self._run(["devices"])
        ids: List[str] = []
        for line in output.splitlines():
            line = line.strip()
            if line and not line.startswith("List of devices"):
                parts = line.split()
                if len(parts) >= 2 and parts[1] == "device":
                    ids.append(parts[0])
        return ids

    async def tap(self, x: int, y: int, device_id: Optional[str] = None) -> None:
        """Tap at coordinates asynchronously."""
        await self._run(["shell", "input", "tap", str(x), str(y)], device_id=device_id)

    async def swipe(self, x1: int, y1: int, x2: int, y2: int,
                   duration_ms: int = 300, device_id: Optional[str] = None) -> None:
        """Swipe from (x1,y1) to (x2,y2) asynchronously."""
        await self._run([
            "shell", "input", "swipe",
            str(x1), str(y1), str(x2), str(y2), str(duration_ms),
        ], device_id=device_id)

    async def screencap(self, path: str = "/sdcard/screen.png",
                       device_id: Optional[str] = None) -> None:
        """Capture screenshot asynchronously."""
        await self._run(["shell", "screencap", "-p", path], device_id=device_id)

    async def pull(self, remote: str, local: str, device_id: Optional[str] = None) -> None:
        """Pull file from device asynchronously."""
        await self._run(["pull", remote, local], device_id=device_id)

    async def push(self, local: str, remote: str, device_id: Optional[str] = None) -> None:
        """Push file to device asynchronously."""
        await self._run(["push", local, remote], device_id=device_id)

    async def install(self, apk_path: str, device_id: Optional[str] = None) -> None:
        """Install APK asynchronously."""
        await self._run(["install", "-r", apk_path], device_id=device_id)

    async def uninstall(self, package: str, device_id: Optional[str] = None) -> None:
        """Uninstall package asynchronously."""
        await self._run(["uninstall", package], device_id=device_id)

    async def launch(self, package: str, activity: str,
                     device_id: Optional[str] = None) -> None:
        """Launch app activity asynchronously."""
        await self._run([
            "shell", "am", "start", "-n",
            f"{package}/{activity}",
        ], device_id=device_id)

    async def shell_output(self, command: str,
                          device_id: Optional[str] = None,
                          timeout: int = 30) -> str:
        """Execute shell command and return output asynchronously."""
        return await self._run(["shell", command], timeout=timeout, device_id=device_id)

    async def run_command(self, args: List[str], device_id: Optional[str] = None,
                         timeout: int = 30) -> str:
        """Run an arbitrary ADB command asynchronously and return stdout.

        Parameters
        ----------
        args:
            ADB subcommand and arguments.
        device_id:
            ADB serial ID.  Falls back to ``default_device``.
        timeout:
            Seconds before the subprocess is killed.

        Returns
        -------
        str
            Captured stdout.
        """
        return await self._run(args, timeout=timeout, device_id=device_id)