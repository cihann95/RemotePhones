"""Unit tests for DeviceManager — fully mocked ADBClient, no real ADB needed."""

import threading
from unittest.mock import MagicMock, patch

import pytest

from core.device_manager import DeviceManager


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_adb():
    """Return a MagicMock standing in for ADBClient."""
    adb = MagicMock()
    adb.devices.return_value = ["emulator-5554", "device-001"]
    adb.shell_output.return_value = (
        "Pixel 6\n14\nGoogle\n"
    )
    return adb


@pytest.fixture
def dm(mock_adb):
    """Return a DeviceManager wired to a mocked ADBClient."""
    return DeviceManager(adb_client=mock_adb)


# ---------------------------------------------------------------------------
# __init__
# ---------------------------------------------------------------------------

class TestInit:
    def test_init_stores_adb_client(self, mock_adb):
        dm = DeviceManager(adb_client=mock_adb)
        assert dm.adb is mock_adb

    def test_init_empty_connected(self, mock_adb):
        dm = DeviceManager(adb_client=mock_adb)
        assert dm._connected == {}

    def test_init_creates_lock(self, mock_adb):
        dm = DeviceManager(adb_client=mock_adb)
        assert isinstance(dm._lock, type(threading.Lock()))


# ---------------------------------------------------------------------------
# discover()
# ---------------------------------------------------------------------------

class TestDiscover:
    def test_discover_returns_device_ids(self, dm, mock_adb):
        mock_adb.devices.return_value = ["abc123", "def456"]
        result = dm.discover()
        assert result == ["abc123", "def456"]
        mock_adb.devices.assert_called_once()

    def test_discover_empty(self, dm, mock_adb):
        mock_adb.devices.return_value = []
        assert dm.discover() == []


# ---------------------------------------------------------------------------
# register()
# ---------------------------------------------------------------------------

class TestRegister:
    def test_register_creates_record(self, dm):
        record = dm.register("dev1")
        assert record == {"id": "dev1", "status": "registered"}

    def test_register_with_metadata(self, dm):
        record = dm.register("dev1", metadata={"model": "Pixel 6"})
        assert record["model"] == "Pixel 6"
        assert record["status"] == "registered"

    def test_register_stores_in_connected(self, dm):
        dm.register("dev1")
        assert "dev1" in dm._connected


# ---------------------------------------------------------------------------
# connect() — property parsing
# ---------------------------------------------------------------------------

class TestConnect:
    def test_connect_parses_properties(self, dm, mock_adb):
        mock_adb.shell_output.return_value = "Pixel 6\n14\nGoogle\n"
        record = dm.connect("dev1")
        assert record["model"] == "Pixel 6"
        assert record["android_version"] == "14"
        assert record["manufacturer"] == "Google"
        assert record["status"] == "online"

    def test_connect_partial_properties(self, dm, mock_adb):
        mock_adb.shell_output.return_value = "Pixel 6\n"
        record = dm.connect("dev1")
        assert record["model"] == "Pixel 6"
        assert record["android_version"] == "unknown"
        assert record["manufacturer"] == "unknown"

    def test_connect_empty_properties(self, dm, mock_adb):
        mock_adb.shell_output.return_value = ""
        record = dm.connect("dev1")
        assert record["model"] == "unknown"
        assert record["android_version"] == "unknown"
        assert record["manufacturer"] == "unknown"

    def test_connect_updates_existing_record(self, dm, mock_adb):
        dm.register("dev1", metadata={"custom": "value"})
        mock_adb.shell_output.return_value = "Galaxy S24\n14\nSamsung\n"
        record = dm.connect("dev1")
        assert record["custom"] == "value"
        assert record["status"] == "online"


# ---------------------------------------------------------------------------
# disconnect()
# ---------------------------------------------------------------------------

class TestDisconnect:
    def test_disconnect_marks_disconnected(self, dm):
        dm.register("dev1")
        dm.disconnect("dev1")
        assert dm._connected["dev1"]["status"] == "disconnected"

    def test_disconnect_nonexistent_no_error(self, dm):
        dm.disconnect("ghost")  # should not raise


# ---------------------------------------------------------------------------
# remove()
# ---------------------------------------------------------------------------

class TestRemove:
    def test_remove_deletes_device(self, dm):
        dm.register("dev1")
        dm.remove("dev1")
        assert "dev1" not in dm._connected

    def test_remove_nonexistent_no_error(self, dm):
        dm.remove("ghost")  # should not raise


# ---------------------------------------------------------------------------
# acquire_device() / release_device() — locking
# ---------------------------------------------------------------------------

class TestAcquireRelease:
    def test_acquire_returns_true_first_time(self, dm):
        dm.register("dev1")
        assert dm.acquire_device("dev1") is True

    def test_acquire_returns_false_when_locked(self, dm):
        dm.register("dev1")
        dm.acquire_device("dev1")
        assert dm.acquire_device("dev1") is False

    def test_release_allows_reacquire(self, dm):
        dm.register("dev1")
        dm.acquire_device("dev1")
        dm.release_device("dev1")
        assert dm.acquire_device("dev1") is True

    def test_acquire_creates_lock_for_unknown_device(self, dm):
        # acquire_device creates a lock even if device not in _connected
        assert dm.acquire_device("newdev") is True

    def test_release_nonexistent_no_error(self, dm):
        dm.release_device("ghost")  # should not raise

    def test_thread_safety(self, dm):
        """Two threads racing acquire_device — only one wins."""
        dm.register("dev1")
        results = []

        def try_acquire():
            results.append(dm.acquire_device("dev1"))

        t1 = threading.Thread(target=try_acquire)
        t2 = threading.Thread(target=try_acquire)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Exactly one thread should have acquired the lock
        assert results.count(True) == 1
        assert results.count(False) == 1


# ---------------------------------------------------------------------------
# all_devices / online_devices properties
# ---------------------------------------------------------------------------

class TestProperties:
    def test_all_devices_returns_shallow_copy(self, dm):
        dm.register("dev1")
        all_dev = dm.all_devices
        # all_devices returns a shallow copy — top-level dict is independent
        all_dev["new_key"] = "new_val"
        assert "new_key" not in dm._connected

    def test_all_devices_empty(self, dm):
        assert dm.all_devices == {}

    def test_online_devices_filters(self, dm, mock_adb):
        dm.register("dev1")
        mock_adb.shell_output.return_value = "Pixel 6\n14\nGoogle\n"
        dm.connect("dev1")
        dm.register("dev2")  # dev2 stays "registered", not online

        online = dm.online_devices
        assert "dev1" in online
        assert "dev2" not in online

    def test_online_devices_empty_when_none_online(self, dm):
        dm.register("dev1")
        dm.register("dev2")
        assert dm.online_devices == {}