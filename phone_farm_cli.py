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
import os
import re
import sys

DEVICE_ID_RE = re.compile(r'^[a-zA-Z0-9_\-]+$')
PHONE_RE = re.compile(r'^\+?[0-9]{10,15}$')


def validate_device_id(device_id: str) -> None:
    if not device_id or not DEVICE_ID_RE.match(device_id):
        print(
            "Invalid device ID format. Must contain only letters, numbers, hyphens, underscores.",
            file=sys.stderr,
        )
        sys.exit(1)


def validate_phone_number(number: str) -> None:
    if not number or not PHONE_RE.match(number):
        print(
            "Invalid phone number format. Expected: +905XXXXXXXXX or 05XXXXXXXXX (10-15 digits)",
            file=sys.stderr,
        )
        sys.exit(1)


def sanitize_file_path(file_path: str) -> str:
    resolved = os.path.realpath(file_path)
    if '..' in file_path or file_path.startswith('/'):
        normalized = os.path.normpath(file_path)
        if '..' in normalized.split(os.sep):
            print("File path contains directory traversal components.", file=sys.stderr)
            sys.exit(1)
    return resolved

from config.loader import load_config
from core.adb import ADBClient
from core.device_manager import DeviceManager
from scheduler.manager import PhoneFarmManager
from scheduler.priority import Priority
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
    from monitor.health import DeviceHealthChecker
    validate_device_id(args.device_id)
    adb = ADBClient()
    checker = DeviceHealthChecker(device_manager=DeviceManager(adb), config={})
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
    validate_device_id(args.device_id)
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
    validate_device_id(args.device_id)
    steps_file = sanitize_file_path(args.steps_file)
    with open(steps_file, "r", encoding="utf-8") as fh:
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


def _report_call_error(error: str) -> None:
    """Print a user-friendly error message based on the call error string."""
    err_lower = error.lower()
    if "format" in err_lower:
        print(
            "Invalid phone number format. Expected: +905XXXXXXXXX or 05XXXXXXXXX",
            file=sys.stderr,
        )
    elif "timeout" in err_lower:
        print("Call timed out. Check SIM card and signal.", file=sys.stderr)
    else:
        print("No device found. Connect via USB and enable USB debugging.", file=sys.stderr)


def cmd_call(args: argparse.Namespace, config: dict) -> None:
    """Make a phone call — single number or bulk from CSV."""
    from core.phone import PhoneOperations

    validate_device_id(args.device_id)
    phone = PhoneOperations(ADBClient())

    if args.csv_file:
        csv_path = sanitize_file_path(args.csv_file)
        if not os.path.exists(csv_path):
            print(
                f"CSV file not found: {args.csv_file}. Check file path and try again.",
                file=sys.stderr,
            )
            sys.exit(1)
        csv_result = phone.read_csv_numbers(csv_path)
        if csv_result.get("warnings"):
            for w in csv_result["warnings"]:
                print(f"WARNING: {w}", file=sys.stderr)
        numbers = csv_result.get("numbers", [])
        if not numbers:
            print(json.dumps({"ok": False, "error": "No valid numbers in CSV"}, indent=2))
            sys.exit(1)
        results = []
        for item in numbers:
            r = phone.call(item["number"], device_id=args.device_id)
            if not r.get("ok"):
                _report_call_error(r.get("error", ""))
                sys.exit(1)
            r["name"] = item.get("name", "")
            results.append(r)
        print(json.dumps(results, indent=2))
    elif args.number:
        validate_phone_number(args.number)
        result = phone.call(args.number, device_id=args.device_id)
        if not result.get("ok"):
            _report_call_error(result.get("error", ""))
            sys.exit(1)
        print(json.dumps(result, indent=2))
    else:
        print("Error: Either --number or --csv-file is required", file=sys.stderr)
        sys.exit(1)


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
    p.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug output",
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

    # call
    call_p = sub.add_parser("call", help="Make a phone call")
    call_p.add_argument("device_id", help="ADB serial ID")
    call_p.add_argument("--number", help="Phone number (e.g. +905XXXXXXXXX)")
    call_p.add_argument("--csv-file", help="CSV file with number,name columns")

    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    if args.verbose:
        import logging
        logging.getLogger().setLevel(logging.DEBUG)

    if args.command is None:
        print("Phone Farm CLI - Mobile Device Automation")
        print("\nUsage: python phone_farm_cli.py <command> [options]")
        print("\nCommands:")
        print("  discover              Discover connected ADB devices")
        print("  health <device_id>    Run health check on a device")
        print("  run <device_id> <task> [--param key=value]  Execute a task")
        print("  submit <device_id> <task_file>  Submit a task file")
        print("  status <job_id>       Check job status")
        print("  call <device_id> --number <phone>  Make a phone call")
        print("\nExamples:")
        print("  python phone_farm_cli.py discover")
        print("  python phone_farm_cli.py health ABCD1234")
        print("  python phone_farm_cli.py call ABCD1234 --number +905XXXXXXXXX")
        print("\nFor help: python phone_farm_cli.py --help")
        sys.exit(0)

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
    elif cmd == "call":
        cmd_call(args, config)
    else:
        parse_args(["--help"])


if __name__ == "__main__":
    main()
