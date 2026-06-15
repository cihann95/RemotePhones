"""Unit tests for monitor/api.py FastAPI endpoints.

Covers: /health, /health/devices, /health/devices/{id}, /status, /queue,
/queue/{id}, API key authentication, and rate limiting.
"""

from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Ensure project root is importable
# ---------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from fastapi.testclient import TestClient

# Import the app — must happen before any attach_manager calls
from monitor import api as api_module
from monitor.api import app, attach_manager, _rate_buckets


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

VALID_KEY = "test-secret-key-1234"


@pytest.fixture(autouse=True)
def _set_api_key(monkeypatch):
    """Set a known API key for every test."""
    monkeypatch.setenv("API_SECRET_KEY", VALID_KEY)


@pytest.fixture(autouse=True)
def _reset_rate_buckets():
    """Clear rate-limit buckets before each test."""
    _rate_buckets.clear()
    # Also reset the request counter so cleanup logic doesn't interfere
    api_module._rate_req_counter = 0


@pytest.fixture()
def client():
    """Return a TestClient wired to the FastAPI app."""
    return TestClient(app)


@pytest.fixture()
def mock_manager():
    """Create a mock PhoneFarmManager and attach it to the API."""
    mgr = MagicMock()
    mgr.dm = MagicMock()
    mgr.dm.all_devices = {"device-1": {"status": "online"}, "device-2": {"status": "offline"}}
    mgr.dm.online_devices = {"device-1": {"status": "online"}}
    mgr.queue = MagicMock()
    mgr.queue.qsize.return_value = 2
    mgr.queue.get_all_jobs.return_value = [
        {"job_id": "j1", "status": "pending"},
        {"job_id": "j2", "status": "done"},
    ]
    mgr.queue.get_status.return_value = {"job_id": "j1", "status": "pending"}
    mgr.queue.cancel.return_value = True
    mgr.status_summary.return_value = {
        "devices": {"total": 2, "online": 1},
        "queue": {"pending": 2, "tasks": ["call", "answer"]},
        "runner_running": True,
    }
    mgr.config = {}
    attach_manager(mgr)
    yield mgr
    # Detach after test
    api_module._manager = None
    api_module._health_checker = None


def _auth_headers(key: str = VALID_KEY) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


# ---------------------------------------------------------------------------
# Test: /health (no auth required)
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    """GET /health returns service status without authentication."""

    def test_health_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "phone-farm"
        assert "python" in data


# ---------------------------------------------------------------------------
# Test: /health/devices (auth required)
# ---------------------------------------------------------------------------

class TestHealthDevicesEndpoint:

    def test_health_devices_returns_device_list(self, client, mock_manager):
        resp = client.get("/health/devices", headers=_auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert "devices" in data
        # DeviceHealthChecker.check is called per device in all_devices
        assert isinstance(data["devices"], list)

    def test_health_devices_missing_auth_returns_401(self, client, mock_manager):
        resp = client.get("/health/devices")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Test: /health/devices/{device_id} (auth required)
# ---------------------------------------------------------------------------

class TestHealthDeviceByIdEndpoint:

    def test_health_device_by_id_returns_device(self, client, mock_manager):
        resp = client.get("/health/devices/device-1", headers=_auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert "device_id" in data

    def test_health_device_invalid_id_returns_400(self, client, mock_manager):
        resp = client.get("/health/devices/bad!id@", headers=_auth_headers())
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Test: /status (auth required)
# ---------------------------------------------------------------------------

class TestStatusEndpoint:

    def test_status_returns_manager_status(self, client, mock_manager):
        resp = client.get("/status", headers=_auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert "devices" in data
        assert data["devices"]["total"] == 2
        assert data["devices"]["online"] == 1

    def test_status_missing_auth_returns_401(self, client, mock_manager):
        resp = client.get("/status")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Test: /queue (auth required)
# ---------------------------------------------------------------------------

class TestQueueEndpoint:

    def test_queue_returns_job_list(self, client, mock_manager):
        resp = client.get("/queue", headers=_auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert "jobs" in data
        assert "qsize" in data
        assert data["qsize"] == 2


# ---------------------------------------------------------------------------
# Test: /queue/{job_id} (auth required)
# ---------------------------------------------------------------------------

class TestQueueJobByIdEndpoint:

    def test_queue_job_by_id_returns_job(self, client, mock_manager):
        resp = client.get("/queue/j1", headers=_auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert data["job_id"] == "j1"

    def test_queue_job_not_found_returns_404(self, client, mock_manager):
        mock_manager.queue.get_status.return_value = None
        resp = client.get("/queue/nonexistent", headers=_auth_headers())
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Test: API key authentication
# ---------------------------------------------------------------------------

class TestApiKeyAuth:

    def test_missing_auth_header_returns_401(self, client, mock_manager):
        resp = client.get("/status")
        assert resp.status_code == 401
        assert "Missing Authorization header" in resp.json()["detail"]

    def test_invalid_key_returns_401(self, client, mock_manager):
        resp = client.get("/status", headers=_auth_headers("wrong-key"))
        assert resp.status_code == 401
        assert "Invalid API key" in resp.json()["detail"]

    def test_valid_key_passes(self, client, mock_manager):
        resp = client.get("/status", headers=_auth_headers())
        assert resp.status_code == 200

    def test_no_api_secret_key_env_returns_401(self, client, mock_manager, monkeypatch):
        monkeypatch.delenv("API_SECRET_KEY", raising=False)
        # Also patch the helper so it returns empty string
        monkeypatch.setattr(api_module, "_get_api_key", lambda: "")
        resp = client.get("/status", headers=_auth_headers())
        assert resp.status_code == 401
        assert "API_SECRET_KEY not set" in resp.json()["detail"]

    def test_bad_auth_format_returns_401(self, client, mock_manager):
        resp = client.get("/status", headers={"Authorization": "Token something"})
        assert resp.status_code == 401
        assert "Invalid Authorization header format" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Test: Rate limiting
# ---------------------------------------------------------------------------

class TestRateLimiting:

    def test_rate_limit_blocks_excess_requests(self, client, mock_manager, monkeypatch):
        """The 101st request within the rate window should get 429."""
        # Set a very low rate limit for testing
        monkeypatch.setattr(api_module, "_RATE_LIMIT_PER_MINUTE", 5)
        # /health is exempt from rate limiting, so use /status
        headers = _auth_headers()
        # Send 5 allowed requests
        for _ in range(5):
            resp = client.get("/status", headers=headers)
            assert resp.status_code == 200
        # 6th request should be rate-limited
        resp = client.get("/status", headers=headers)
        assert resp.status_code == 429
        assert "retry_after" in resp.json()

    def test_health_endpoint_exempt_from_rate_limit(self, client, mock_manager, monkeypatch):
        """Even with a tiny rate limit, /health should always respond."""
        monkeypatch.setattr(api_module, "_RATE_LIMIT_PER_MINUTE", 2)
        for _ in range(10):
            resp = client.get("/health")
            assert resp.status_code == 200
