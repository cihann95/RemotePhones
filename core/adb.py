"""ADBClient — raw ADB shell command wrapper."""

import os
import subprocess
import sys
import logging
import time
from pathlib import Path
from typing import List, Optional


logger = logging.getLogger(__name__)


def _resolve_adb_path() -> str:
    """Find the ADB binary, preferring the bundled copy over PATH lookup.

    Search order:
    1. ``PHONE_FARM_ADB_PATH`` environment variable (user override)
    2. ``sys._MEIPASS/tools/adb/adb.exe`` (PyInstaller frozen bundle)
    3. ``<project_root>/tools/adb/adb.exe`` (source-tree / npm extraResources)
    4. Bare ``"adb"`` — falls back to system PATH lookup
    """
    # 1. Explicit env override
    env_path = os.environ.get("PHONE_FARM_ADB_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path

    # 2. PyInstaller frozen bundle
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        bundled = Path(meipass) / "tools" / "adb" / "adb.exe"
        if bundled.is_file():
            return str(bundled)

    # 3. Source-tree / extraResources layout
    #    core/adb.py → parent is project root → tools/adb/adb.exe
    project_root = Path(__file__).resolve().parent.parent
    bundled = project_root / "tools" / "adb" / "adb.exe"
    if bundled.is_file():
        return str(bundled)

    # 4. Bare name — let subprocess find it on PATH
    return "adb"


class ADBError(Exception):
    """Base exception for ADB errors."""
    pass


class DeviceDisconnectedError(ADBError):
    """Raised when the device is disconnected during an operation."""
    pass


class DeviceOfflineError(ADBError):
    """Raised when the device is offline."""
    pass


class DeviceUnauthorizedError(ADBError):
    """Raised when the device is unauthorized."""
    pass


class LowStorageError(ADBError):
    """Raised when the device has insufficient storage."""
    pass


class ADBTimeoutError(ADBError):
    """Raised when an ADB command times out."""
    pass


class ADBServerDownError(ADBError):
    """Raised when the ADB server is down and cannot be restarted."""
    pass


class ADBInstallError(ADBError):
    """Raised when an APK installation fails."""
    pass


class ADBPullError(ADBError):
    """Raised when pulling a file from the device fails."""
    pass


class ADBPushError(ADBError):
    """Raised when pushing a file to the device fails."""
    pass


class ADBClient:
    """Thin wrapper around the ``adb`` binary used by the rest of the codebase."""

    def __init__(self, adb_path: Optional[str] = None, default_device: Optional[str] = None,
                 max_retries: int = 3, retry_delay: float = 1.0):
        self.adb_path = adb_path if adb_path and os.path.isfile(adb_path) else _resolve_adb_path()
        self.default_device = default_device
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    def _device_prefix(self, device_id: Optional[str] = None) -> List[str]:
        if device_id is not None:
            return [self.adb_path, "-s", device_id]
        if self.default_device is not None:
            return [self.adb_path, "-s", self.default_device]
        return [self.adb_path]

    def _try_restart_adb(self) -> bool:
        """Attempt to restart the ADB server. Returns True on success."""
        try:
            logger.info("Attempting ADB server restart via '%s kill-server && %s start-server'",
                        self.adb_path, self.adb_path)
            subprocess.run(
                [self.adb_path, "kill-server"],
                capture_output=True, text=True, timeout=10,
            )
            result = subprocess.run(
                [self.adb_path, "start-server"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                logger.info("ADB server restarted successfully")
                return True
            else:
                logger.warning("ADB start-server returned code %d: %s",
                               result.returncode, result.stderr.strip())
                return False
        except Exception as exc:
            logger.warning("ADB server restart failed: %s", exc)
            return False

    def _run(self, args: List[str], device_id: Optional[str] = None,
             timeout: int = 30) -> str:
        cmd = self._device_prefix(device_id) + args
        logger.debug("RUN: %s", " ".join(cmd))
        last_exc = None
        adb_restarted = False
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
                
                if result.returncode != 0:
                    stderr_lower = result.stderr.lower()
                    if "device offline" in stderr_lower:
                        raise DeviceOfflineError(f"Device {device_id or 'default'} is offline")
                    if "unauthorized" in stderr_lower:
                        raise DeviceUnauthorizedError(f"Device {device_id or 'default'} is unauthorized")
                    if "no space left on device" in stderr_lower or "insufficient storage" in stderr_lower:
                        raise LowStorageError(f"Device {device_id or 'default'} has low storage")
                    if "device not found" in stderr_lower or "no devices/emulators found" in stderr_lower:
                        raise DeviceDisconnectedError(f"Device {device_id or 'default'} disconnected or not found")
                    if "adb server is out of date" in stderr_lower or "cannot connect to daemon" in stderr_lower:
                        if not adb_restarted:
                            logger.warning("ADB server issue detected — attempting restart")
                            adb_restarted = True
                            if self._try_restart_adb():
                                continue
                        raise ADBServerDownError("ADB server is down and restart failed")
                    if "failure [" in stderr_lower:
                        raise ADBInstallError(f"ADB install failed: {result.stderr.strip()}")
                    if "remote object" in stderr_lower and "does not exist" in stderr_lower:
                        raise ADBPullError(f"ADB pull failed: {result.stderr.strip()}")
                    if "failed to copy" in stderr_lower or "permission denied" in stderr_lower:
                        if "push" in " ".join(args).lower():
                            raise ADBPushError(f"ADB push failed: {result.stderr.strip()}")
                        raise ADBPullError(f"ADB pull failed: {result.stderr.strip()}")
                    
                return result.stdout
            except (DeviceDisconnectedError, DeviceOfflineError, DeviceUnauthorizedError, 
                    LowStorageError, ADBServerDownError, ADBInstallError, ADBPullError, ADBPushError) as exc:
                raise exc
            except FileNotFoundError as exc:
                last_exc = exc
                if not adb_restarted:
                    logger.warning("ADB binary not found — attempting server restart")
                    adb_restarted = True
                    if self._try_restart_adb():
                        logger.info("Retrying command after ADB server restart")
                        continue  # retry immediately without sleeping
                if attempt < self.max_retries:
                    delay = self.retry_delay * (2 ** (attempt - 1))
                    logger.warning("ADB attempt %d/%d failed (%s), retrying in %.1fs",
                                   attempt, self.max_retries, type(exc).__name__, delay)
                    time.sleep(delay)
                else:
                    logger.error("ADB command failed after %d attempts: %s",
                                 self.max_retries, " ".join(cmd))
            except subprocess.TimeoutExpired as exc:
                last_exc = ADBTimeoutError(f"ADB command timed out after {timeout}s: {' '.join(cmd)}")
                if attempt < self.max_retries:
                    delay = self.retry_delay * (2 ** (attempt - 1))
                    logger.warning("ADB attempt %d/%d failed (%s), retrying in %.1fs",
                                   attempt, self.max_retries, type(last_exc).__name__, delay)
                    time.sleep(delay)
                else:
                    logger.error("ADB command failed after %d attempts: %s",
                                 self.max_retries, " ".join(cmd))
            except Exception as exc:
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
