"""AsyncDeviceManager — asynchronous device lifecycle manager."""
from __future__ import annotations

import asyncio
import logging
from typing import Dict, List, Optional

from core.async.adb import AsyncADBClient
from utils.logger import get_logger

logger = get_logger(__name__)


class AsyncDeviceManager:
    """Manages the full lifecycle of one or more connected Android devices asynchronously.

    Parameters
    ----------
    adb_client:
        Pre-configured :class:`AsyncADBClient` instance.
    """

    def __init__(self, adb_client: "AsyncADBClient") -> None:
        self.adb: "AsyncADBClient" = adb_client
        self._connected: Dict[str, dict] = {}

    async def discover(self) -> List[str]:
        """Return a list of connected device IDs asynchronously.

        Returns
        -------
        List[str]
            Serial IDs of all devices in the ``device`` state.
        """
        ids = await self.adb.devices()
        logger.info("Discovered %d device(s): %s", len(ids), ids)
        return ids

    def register(self, device_id: str, metadata: Optional[Dict] = None) -> Dict:
        """Register a device so it can be tracked by the manager.

        Parameters
        ----------
        device_id:
            ADB serial ID.
        metadata:
            Arbitrary key-value pairs (model, android_version, …).

        Returns
        -------
        Dict
            The device record stored in ``_connected``.
        """
        record: Dict = {"id": device_id, "status": "registered"}
        if metadata:
            record.update(metadata)
        self._connected[device_id] = record
        logger.info("Registered device: %s", device_id)
        return record

    async def connect(self, device_id: str) -> Dict:
        """Verify a device is reachable and mark it is online asynchronously.

        Parameters
        ----------
        device_id:
            ADB serial ID.

        Returns
        -------
        Dict
            Updated device record.
        """
        properties_raw = await self.adb.shell_output(
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

    def get(self, device_id: str) -> Optional[Dict]:
        """Return the device record for *device_id*, or ``None``."""
        return self._connected.get(device_id)

    @property
    def all_devices(self) -> Dict[str, Dict]:
        return dict(self._connected)

    @property
    def online_devices(self) -> Dict[str, Dict]:
        return {
            k: v for k, v in self._connected.items()
            if v.get("status") == "online"
        }