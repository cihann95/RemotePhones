#!/usr/bin/env python3
"""phone_farm_cli.py — command-line entry point for the Phone Farm automation layer.

Usage::

    python phone_farm_cli.py discover
    python phone_farm_cli.py run <device_id> <task_name> [--param key=val ...]
    python phone_farm_cli.py health <device_id>
    python phone_farm_cli.py status <job_id>
"""

from __future__ import annotations

import argparse
import json
import sys
import time

from config.loader import load_config
from core.adb import ADBClient
from core.device_manager import DeviceManager
from scheduler.job_queue import JobQueue
from scheduler.manager import PhoneFarmManager
from scheduler.priority import Priority
from scheduler.runner import TaskRunner
from tasks.base_task import TaskResult
from tasks.registry import TaskRegistry
from utils.logger import get_logger

logger = get_logger(__name__)


def _make_manager(config: dict) -> PhoneFarmManager:
    adb_cfg = config.get("adb", {})
    adb = ADBClient(adb_path=adb_cfg.get("adb_path", "adb"))
    return PhoneFarmManager(adb, auto_discover=True)


def cmd_discover(args: argparse.Namespace, config: dict) -> None:
    mgr = _make_manager(config)
    ids = mgr.dm.discover()
    print(json.dumps({"devices": ids}, indent=2))
    for did in ids:
        record = mgr.dm.connect(did)
        print(json.dumps(record, indent=2))


def cmd_health(args: argparse.Namespace, config: dict) -> None:
    from monitor.health import HealthChecker
    adb = ADBClient()
    checker = HealthChecker(adb)
    status = checker.check(args.device_id)
    print(json.dumps(status.to_dict(), indent=2))


def _parse_kv(pairs: list[str]) -> dict:
    params: dict = {}
    for p in pairs:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.strip()] = v.strip()
        else:
            params[p.strip()] = True
    return params


def cmd_run(args: argparse.Namespace, config: dict) -> None:
    mgr = _make_manager(config)
    mgr.start()
    params = _parse_kv(args.params)
    record = mgr.enqueue_task(
        args.task_name,
        args.device_id,
        params=params,
        priority=Priority.NORMAL,
    )
    print(f"Enqueued job {record['job_id']} — status={record['status']}")
    mgr.stop()


def cmd_submit(args: argparse.Namespace, config: dict) -> None:
    """Submit a JSON steps file for a device."""
    with open(args.steps_file, "r", encoding="utf-8") as fh:
        steps = json.load(fh)
    if not isinstance(steps, list):
        print("Error: steps file must contain a JSON array", file=sys.stderr)
        sys.exit(1)
    mgr = _make_manager(config)
    mgr.start()
    results = mgr.run_on_device(args.device_id, steps)
    print(json.dumps(results, indent=2))
    mgr.stop()


def cmd_submit_file(args: argparse.Namespace, config: dict) -> None:
    """Submit steps from a JSON file for a device."""
    with open(args.steps_file, "r", encoding="utf-8") as fh:
        steps = json.load(fh)
    if not isinstance(steps, list):
        print("Error: steps file must contain a JSON array", file=sys.stderr)
        sys.exit(1)
    mgr = _make_manager(config)
    mgr.start()
    results = mgr.run_on_device(args.device_id, steps)
    print(json.dumps(results, indent=2))
    mgr.stop()


def cmd_status(args: argparse.Namespace, config: dict) -> None:
    mgr = _make_manager(config)
    if args.summary:
        print(json.dumps(mgr.status_summary(), indent=2))
    else:
        record = mgr.queue.get_status(args.job_id)
        print(json.dumps(record or {"error": "not found"}, indent=2))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="phone_farm_cli",
        description="Phone Farm — Python automation layer CLI",
    )
    p.add_argument(
        "--config",
        default=None,
        help="Path to YAML config file (default: config/phone_farm.yaml)",
    )

    sub = p.add_subparsers(dest="command")

    # discover
    sp = sub.add_parser("discover", help="List connected ADB devices")

    # health
    sp = sub.add_parser("health", help="Run health check on a device")
    sp.add_argument("device_id", help="ADB serial ID")

    # run
    sp = sub.add_parser("run", help="Enqueue a single task for a device")
    sp.add_argument("device_id", help="ADB serial ID")
    sp.add_argument("task_name", help="Registered task name")
    sp.add_argument(
        "params", nargs="*", default=[],
        help="Task params as key=value pairs",
    )

    # submit
    sp = sub.add_parser("submit", help="Submit a JSON steps file for a device")
    sp.add_argument("device_id", help="ADB serial ID")
    sp.add_argument("steps_file", help="Path to JSON steps array")

    # status
    sp = sub.add_parser("status", help="Show job or manager status")
    sp.add_argument("job_id", nargs="?", help="Job ID (omit for manager summary)")
    sp.add_argument("--summary", action="store_true", help="Show manager summary")

    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    config = load_config(args.config)
    cmd = args.command

    if cmd == "discover":
        cmd_discover(args, config)
    elif cmd == "health":
        cmd_health(args, config)
    elif cmd == "run":
        cmd_run(args, config)
    elif cmd == "submit":
        cmd_submit(args, config)
    elif cmd == "status":
        cmd_status(args, config)
    else:
        parse_args(["--help"])


if __name__ == "__main__":
    main()
