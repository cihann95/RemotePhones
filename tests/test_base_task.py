"""Tests for tasks.base_task — pre_check, validate, execute contract, TaskResult."""

from __future__ import annotations

import pytest

from tasks.base_task import BaseTask, TaskConfig, TaskResult


# ── TaskResult ───────────────────────────────────────────────────────────────


class TestTaskResult:
    def test_ok_default(self):
        r = TaskResult(ok=True)
        assert r.ok is True
        assert r.data == {}
        assert r.error is None

    def test_fail_with_error(self):
        r = TaskResult(ok=False, error="bad thing")
        assert r.ok is False
        assert r.error == "bad thing"

    def test_as_dict_ok(self):
        r = TaskResult(ok=True, data={"k": 1})
        d = r.as_dict()
        assert d == {"ok": True, "data": {"k": 1}}
        assert "error" not in d

    def test_as_dict_fail(self):
        r = TaskResult(ok=False, data={"k": 1}, error="bad thing")
        d = r.as_dict()
        assert d["ok"] is False
        assert d["error"] == "bad thing"


# ── TaskConfig ───────────────────────────────────────────────────────────────


class TestTaskConfig:
    def test_defaults(self):
        cfg = TaskConfig(name="test", task_type="test")
        assert cfg.timeout_s == 60
        assert cfg.retries == 0
        assert cfg.expected_device_state == "online"
        assert cfg.requires_device is True

    def test_custom(self):
        cfg = TaskConfig(
            name="x", task_type="x",
            timeout_s=300, retries=5,
            expected_device_state="idle",
            requires_device=False,
        )
        assert cfg.timeout_s == 300
        assert cfg.requires_device is False
        assert cfg.expected_device_state == "idle"


# ── BaseTask interface ───────────────────────────────────────────────────────


class _ConcreteTask(BaseTask):
    """Minimal concrete subclass for tests."""
    config = TaskConfig(name="concrete", task_type="concrete")

    def execute(self, device_id: str, params: dict[str, object]) -> TaskResult:
        return TaskResult(True, data={"ran_on": device_id})


class TestBaseTask:
    def test_repr(self):
        cfg = TaskConfig(name="my_task", task_type="t", timeout_s=42, retries=2)
        t = _ConcreteTask(cfg)
        r = repr(t)
        assert "_ConcreteTask" in r
        assert "my_task" in r
        assert "42s" in r
        assert "retries=2" in r

    def test_pre_check_no_device_manager(self):
        t = _ConcreteTask(TaskConfig(name="x", task_type="x"))
        assert t.pre_check("any") is False

    def test_pre_check_device_offline(self):
        dm = type("DM", (), {"get": staticmethod(lambda _: None)})()
        t = _ConcreteTask(TaskConfig(name="x", task_type="x"), device_manager=dm)
        assert t.pre_check("device-1") is False

    def test_pre_check_device_online(self):
        dm = type("DM", (), {"get": staticmethod(lambda _: {"status": "online"})})()
        t = _ConcreteTask(
            TaskConfig(name="x", task_type="x", expected_device_state="online"),
            device_manager=dm,
        )
        assert t.pre_check("device-1") is True

    def test_pre_check_wrong_state(self):
        dm = type("DM", (), {"get": staticmethod(lambda _: {"status": "idle"})})()
        t = _ConcreteTask(
            TaskConfig(name="x", task_type="x", expected_device_state="online"),
            device_manager=dm,
        )
        assert t.pre_check("device-1") is False

    def test_pre_check_no_device_required(self):
        dm = type("DM", (), {"get": staticmethod(lambda _: None)})()
        t = _ConcreteTask(
            TaskConfig(name="x", task_type="x", requires_device=False),
            device_manager=dm,
        )
        assert t.pre_check("any") is True

    def test_execute_contract(self):
        dm = type("DM", (), {"get": staticmethod(lambda _: {"status": "online"})})()
        t = _ConcreteTask(
            TaskConfig(name="concrete", task_type="concrete", expected_device_state="online"),
            device_manager=dm,
        )
        r = t.execute("dev-1", {})
        assert r.ok is True
        assert isinstance(r, TaskResult)


# ── validate ─────────────────────────────────────────────────────────────────


class _ValidatingTask(BaseTask):
    config = TaskConfig(name="valid", task_type="valid")

    def execute(self, device_id: str, params: dict) -> TaskResult:  # pragma: no cover
        return TaskResult(True)

    def validate(self, params: dict) -> bool:
        return isinstance(params.get("package_name"), str) and bool(params["package_name"])


class TestValidate:
    def test_default_validates_true(self):
        t = _ConcreteTask(TaskConfig(name="c", task_type="c"))
        assert t.validate({}) is True

    def test_custom_valid(self):
        t = _ValidatingTask(TaskConfig(name="v", task_type="v"))
        assert t.validate({"package_name": "com.example"}) is True

    def test_custom_invalid_missing(self):
        t = _ValidatingTask(TaskConfig(name="v", task_type="v"))
        assert t.validate({}) is False

    def test_custom_invalid_empty_string(self):
        t = _ValidatingTask(TaskConfig(name="v", task_type="v"))
        assert t.validate({"package_name": ""}) is False
