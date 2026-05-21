"""DeviceManager — main device lifecycle class."""

from __future__ import annotations

import logging
from typing import Dict

from core.adb import ADBClient
from utils.logger import get_logger

logger = get_logger(__name__)


class DeviceManager:
    """Manages the full lifecycle of one or more connected Android devices.

    Parameters
    ----------
    adb_client:
        Pre-configured :class:`ADBClient` instance.
    """

    def __init__(self, adb_client: ADBClient) -> None:
        self.adb: ADBClient = adb_client
        self._connected: Dict[str, dict] = {}

    def discover(self) -> list[str]:
        """Return a list of connected device IDs.

        Returns
        -------
        list[str]
            Serial IDs of all devices in the ``device`` state.
        """
        ids = self.adb.devices()
        logger.info("Discovered %d device(s): %s", len(ids), ids)
        return ids

    def register(self, device_id: str, metadata: dict | None = None) -> dict:
        """Register a device so it can be tracked by the manager.

        Parameters
        ----------
        device_id:
            ADB serial ID.
        metadata:
            Arbitrary key-value pairs (model, android_version, …).

        Returns
        -------
        dict
            The device record stored in ``_connected``.
        """
        record: dict = {"id": device_id, "status": "registered"}
        if metadata:
            record.update(metadata)
        self._connected[device_id] = record
        logger.info("Registered device: %s", device_id)
        return record

    def connect(self, device_id: str) -> dict:
        """Verify a device is reachable and mark it as online.

        Parameters
        ----------
        device_id:
            ADB serial ID.

        Returns
        -------
        dict
            Updated device record.
        """
        properties_raw = self.adb.shell_output(
            "getprop ro.product.model 2>/dev/null; "
            "getprop ro.build.version.release 2>/dev/null; "
            "getprop ro.product.manufacturer 2>/dev/null"
        )
        lines = [l.strip() for l in properties_raw.splitlines() if l.strip()]
        model = lines[0] if len(lines) > 0 else "unknown"
        android_ver = lines[1] if len(lines) > 1 else "unknown"
        manufacturer = lines[2] if len(lines) > 2 else "unknown"

        record = self._connected.get(
            device_id, {"id": device_id}
        )
        record.update(
            status="online",
            model=model,
            android_version=android_ver,
            manufacturer=manufacturer,
        )
        self._connected[device_id] = record
        logger.info(
            "Device %s online — %s %s (Android %s)",
            device_id, manufacturer, model, android_ver,
        )
        return record

    def disconnect(self, device_id: str) -> None:
        """Mark a device as disconnected and remove it from active tracking."""
        if device_id in self._connected:
            self._connected[device_id]["status"] = "disconnected"
            logger.info("Device disconnected: %s", device_id)

    def remove(self, device_id: str) -> None:
        """Remove a device from the manager entirely."""
        self._connected.pop(device_id, None)
        logger.info("Device removed: %s", device_id)

    def get(self, device_id: str) -> dict | None:
        """Return the device record for *device_id*, or ``None``."""
        return self._connected.get(device_id)

    @property
    def all_devices(self) -> Dict[str, dict]:
        return dict(self._connected)

    @property
    def online_devices(self) -> Dict[str, dict]:
        return {
            k: v for k, v in self._connected.items()
            if v.get("status") == "online"
        }
