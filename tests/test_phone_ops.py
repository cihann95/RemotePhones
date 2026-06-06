"""Tests for core.phone.PhoneOperations — call rate limiting."""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch
import pytest

from core.phone import PhoneOperations
from core.adb import ADBClient


class TestMinCallInterval:
    def setup_method(self):
        self.adb = MagicMock(spec=ADBClient)
        self.phone = PhoneOperations(self.adb)
        self.phone._last_call_ts = 0.0

    def test_min_call_interval_class_attribute_exists(self):
        assert hasattr(PhoneOperations, "_MIN_CALL_INTERVAL_S")
        assert PhoneOperations._MIN_CALL_INTERVAL_S == 2.0

    def test_initial_last_call_ts_zero(self):
        phone = PhoneOperations(self.adb)
        assert phone._last_call_ts == 0.0

    def test_first_call_no_rate_limit_delay(self):
        sleep_calls = []
        time_values = iter([100.0, 100.0])

        def fake_time():
            return next(time_values)

        def fake_sleep(d):
            sleep_calls.append(d)

        with patch("core.phone.time") as mock_time:
            mock_time.time = fake_time
            mock_time.sleep = fake_sleep
            self.phone._last_call_ts = 0.0
            self.phone._MIN_CALL_INTERVAL_S = 2.0
            self.adb.shell_output.return_value = ""

            self.phone.call("+905300000001")

            assert len(sleep_calls) == 1
            assert sleep_calls[0] == 3

    def test_second_call_sleeps_remaining_interval(self):
        sleep_calls = []
        time_values = iter([100.0, 100.0])

        def fake_time():
            return next(time_values)

        def fake_sleep(d):
            sleep_calls.append(d)

        with patch("core.phone.time") as mock_time:
            mock_time.time = fake_time
            mock_time.sleep = fake_sleep
            self.phone._last_call_ts = 99.0
            self.phone._MIN_CALL_INTERVAL_S = 2.0
            self.adb.shell_output.return_value = ""

            self.phone.call("+905300000001")

            assert sleep_calls[0] == 1.0
            assert sleep_calls[1] == 3

    def test_second_call_no_rate_limit_if_enough_time_passed(self):
        sleep_calls = []
        time_values = iter([102.0, 102.0])

        def fake_time():
            return next(time_values)

        def fake_sleep(d):
            sleep_calls.append(d)

        with patch("core.phone.time") as mock_time:
            mock_time.time = fake_time
            mock_time.sleep = fake_sleep
            self.phone._last_call_ts = 99.0
            self.phone._MIN_CALL_INTERVAL_S = 2.0
            self.adb.shell_output.return_value = ""

            self.phone.call("+905300000001")

            assert len(sleep_calls) == 1
            assert sleep_calls[0] == 3

    def test_last_call_ts_updated_on_success(self):
        def fake_time():
            return 100.0

        def fake_sleep(d):
            pass

        with patch("core.phone.time") as mock_time:
            mock_time.time = fake_time
            mock_time.sleep = fake_sleep
            self.phone._last_call_ts = 0.0
            self.phone._MIN_CALL_INTERVAL_S = 2.0
            self.adb.shell_output.return_value = ""

            self.phone.call("+905300000001")

            assert self.phone._last_call_ts == 100.0

    def test_last_call_ts_not_updated_on_failure(self):
        def fake_time():
            return 100.0

        def fake_sleep(d):
            pass

        with patch("core.phone.time") as mock_time:
            mock_time.time = fake_time
            mock_time.sleep = fake_sleep
            self.phone._last_call_ts = 0.0
            self.phone._MIN_CALL_INTERVAL_S = 2.0
            self.adb.shell_output.side_effect = RuntimeError("ADB down")

            self.phone.call("+905300000001")

            assert self.phone._last_call_ts == 0.0

    def test_invalid_number_skips_rate_limit_update(self):
        sleep_calls = []
        time_values = iter([100.0])

        def fake_time():
            return next(time_values)

        def fake_sleep(d):
            sleep_calls.append(d)

        with patch("core.phone.time") as mock_time:
            mock_time.time = fake_time
            mock_time.sleep = fake_sleep
            self.phone._last_call_ts = 0.0
            self.phone._MIN_CALL_INTERVAL_S = 2.0

            self.phone.call("invalid")

            assert self.phone._last_call_ts == 0.0
