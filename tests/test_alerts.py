"""Tests for the alert system."""

import os
from unittest.mock import patch, MagicMock

import pytest
import requests

from monitor.alerts import AlertManager


def test_alert_manager_initialization():
    """Test AlertManager initialization with default values."""
    config = {}
    manager = AlertManager(config)
    assert manager.battery_low_pct == 15
    assert manager.temperature_high_c == 50
    assert manager.cpu_high_pct == 95.0
    assert manager.memory_low_free_mb == 200
    assert manager.webhook_url is None


def test_alert_manager_initialization_with_config():
    """Test AlertManager initialization with custom config."""
    config = {
        "monitor": {
            "battery_low_pct": 10,
            "temperature_high_c": 45,
            "cpu_high_pct": 80.0,
            "memory_low_free_mb": 100,
        }
    }
    manager = AlertManager(config)
    assert manager.battery_low_pct == 10
    assert manager.temperature_high_c == 45
    assert manager.cpu_high_pct == 80.0
    assert manager.memory_low_free_mb == 100


def test_send_webhook_no_url():
    """Test send_webhook when no URL is configured."""
    manager = AlertManager()
    alert = {"device_id": "test", "metric": "battery", "value": 10}
    # Should return False and not raise
    assert manager.send_webhook(alert) is False


@patch("monitor.alerts.requests.post")
def test_send_webhook_success(mock_post):
    """Test successful webhook delivery."""
    # Setup mock response
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_post.return_value = mock_response

    # Set webhook URL via environment variable
    with patch.dict(os.environ, {"ALERT_WEBHOOK_URL": "http://example.com/webhook"}):
        manager = AlertManager()
        alert = {
            "device_id": "test_device",
            "severity": "critical",
            "metric": "battery",
            "message": "Battery low",
            "value": 10,
            "threshold": 15,
            "ts": 1234567890.0,
        }
        result = manager.send_webhook(alert)
        assert result is True
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert args[0] == "http://example.com/webhook"
        assert kwargs["json"] == alert
        assert kwargs["timeout"] == 10


@patch("monitor.alerts.requests.post")
def test_send_webhook_retry_and_fail(mock_post):
    """Test webhook delivery fails after retries."""
    # Setup mock to raise exception every time
    mock_post.side_effect = requests.exceptions.ConnectionError("Connection error")

    with patch.dict(os.environ, {"ALERT_WEBHOOK_URL": "http://example.com/webhook"}):
        manager = AlertManager()
        alert = {"device_id": "test", "metric": "battery", "value": 10}
        result = manager.send_webhook(alert)
        assert result is False
        # Should have tried 3 times
        assert mock_post.call_count == 3


@patch("monitor.alerts.requests.post")
def test_send_webhook_succeeds_on_retry(mock_post):
    """Test webhook delivery succeeds after a retry."""
    # First call fails, second succeeds
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_post.side_effect = [requests.exceptions.ConnectionError("First failure"), mock_response]

    with patch.dict(os.environ, {"ALERT_WEBHOOK_URL": "http://example.com/webhook"}):
        manager = AlertManager()
        alert = {"device_id": "test", "metric": "battery", "value": 10}
        result = manager.send_webhook(alert)
        assert result is True
        assert mock_post.call_count == 2