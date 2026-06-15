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
import importlib
import json
import os
import re
import secrets
import shutil
import socket
import sqlite3
import subprocess
import sys

from utils.error_handler import humanize_error

DEVICE_ID_RE = re.compile(r'^[a-zA-Z0-9_\-]+$')
PHONE_RE = re.compile(r'^\+?[0-9]{7,15}$')


def _print_human_error(err_str: str) -> None:
    info = humanize_error(err_str)
    print(f"\nHata: {info['title']}", file=sys.stderr)
    print(f"Nasıl düzeltilir: {info['hint']}", file=sys.stderr)
    if info["fix_steps"]:
        print("Adımlar:", file=sys.stderr)
        for i, step in enumerate(info["fix_steps"], 1):
            print(f"  {i}. {step}", file=sys.stderr)
    print(f"\nTeknik detay: {info['raw']}", file=sys.stderr)


def validate_device_id(device_id: str) -> None:
    if not device_id or not DEVICE_ID_RE.match(device_id):
        _print_human_error("Invalid device ID format. Make sure the device ID contains only letters, numbers, hyphens, and underscores.")
        sys.exit(1)


def validate_phone_number(number: str) -> None:
    if not number or not PHONE_RE.match(number):
        _print_human_error("Invalid phone number format. Expected: +905XXXXXXXXX or 05XXXXXXXXX (10-15 digits). Check your phone number and try again.")
        sys.exit(1)


def sanitize_file_path(file_path: str) -> str:
    if not file_path or not isinstance(file_path, str):
        _print_human_error("File path must be a non-empty string. Check your input and try again.")
        sys.exit(1)

    if '\x00' in file_path or any(ord(c) < 32 for c in file_path):
        _print_human_error("File path contains forbidden characters. Make sure the path is valid.")
        sys.exit(1)

    resolved = os.path.realpath(file_path)

    # Check traversal BEFORE resolution — catches both / and \ on all platforms
    parts = file_path.replace('\\', '/').split('/')
    if '..' in parts:
        _print_human_error("File path contains directory traversal. Try this: use an absolute path without '..' components.")
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
        _print_human_error("Steps file must contain a JSON array. Check your file format and try again.")
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
        if not record:
            _print_human_error("Job not found. Check your job ID and try again.")
            sys.exit(1)
        print(json.dumps(record, indent=2))


def _report_call_error(error: str) -> None:
    """Print a user-friendly error message based on the call error string."""
    _print_human_error(error)


def cmd_call(args: argparse.Namespace, config: dict) -> None:
    """Make a phone call — single number or bulk from CSV."""
    from core.phone import PhoneOperations

    validate_device_id(args.device_id)
    phone = PhoneOperations(ADBClient())

    if args.csv_file:
        csv_path = sanitize_file_path(args.csv_file)
        if not os.path.exists(csv_path):
            _print_human_error(f"CSV file not found: {args.csv_file}. Check your file path and try again.")
            sys.exit(1)
        csv_result = phone.read_csv_numbers(csv_path)
        if csv_result.get("warnings"):
            for w in csv_result["warnings"]:
                print(f"WARNING: {w}", file=sys.stderr)
        numbers = csv_result.get("numbers", [])
        if not numbers:
            _print_human_error("No valid numbers in CSV. Make sure the CSV file contains a 'number' column with valid phone numbers.")
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
        _print_human_error("Either --number or --csv-file is required. How to fix: specify one of these options.")
        sys.exit(1)


# ── API key rotation ──────────────────────────────────────────────────────────

ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")


def _read_env_key(env_path: str = ENV_FILE) -> str:
    """Read the current API_SECRET_KEY from .env. Returns "" if not set.

    Does NOT trust os.environ here — rotation must reflect what's on disk so
    that the user can re-run the command and the new key always lands in the
    right file regardless of shell exports.
    """
    if not os.path.exists(env_path):
        return ""
    try:
        with open(env_path, "r", encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("API_SECRET_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError as exc:
        print(f"Error: cannot read {env_path}: {exc}", file=sys.stderr)
    return ""


def _write_env_key(new_key: str, env_path: str = ENV_FILE) -> None:
    """Overwrite API_SECRET_KEY= in .env, preserving all other lines.

    If the file does not exist it is created. If the line is missing it is
    appended. Trailing newline is always emitted.
    """
    lines: list[str] = []
    replaced = False
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()

    for i, raw in enumerate(lines):
        if raw.lstrip().startswith("API_SECRET_KEY="):
            lines[i] = f"API_SECRET_KEY={new_key}\n"
            replaced = True
            break

    if not replaced:
        # Ensure single blank-line separator if file has content
        if lines and not lines[-1].endswith("\n"):
            lines[-1] = lines[-1] + "\n"
        if lines and lines[-1].strip() != "":
            lines.append("\n")
        lines.append(f"API_SECRET_KEY={new_key}\n")

    with open(env_path, "w", encoding="utf-8") as fh:
        fh.writelines(lines)


def _rotate_api_key(env_path: str = ENV_FILE) -> tuple[str, str]:
    """Generate a fresh 32-char hex key, persist it to .env, return (old, new).

    The caller is responsible for printing these to the user.
    """
    old_key = _read_env_key(env_path)
    new_key = secrets.token_hex(16)  # 32 hex chars
    _write_env_key(new_key, env_path)
    return old_key, new_key


def cmd_rotate(args: argparse.Namespace, config: dict) -> None:
    """Rotate the API_SECRET_KEY in .env and print old/new to stdout."""
    old_key, new_key = _rotate_api_key()
    print("API key rotated.")
    print(f"  OLD key: {old_key if old_key else '(none — first rotation)'}")
    print(f"  NEW key: {new_key}")
    print("Update your clients to use the new key. The old key is now invalid.")


# ── doctor command ─────────────────────────────────────────────────────────────

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

_STATUS_ICONS = {"ok": "✓", "warning": "⚠", "error": "✗"}


def _check_python_version() -> dict:
    major, minor = sys.version_info[:2]
    if major > 3 or (major == 3 and minor >= 10):
        return {"status": "ok", "message": f"Python {major}.{minor} — sürüm uyumlu", "fix_steps": []}
    return {
        "status": "error",
        "message": f"Python {major}.{minor} — sürüm 3.10 veya üzeri gerekli",
        "fix_steps": [
            "https://www.python.org/downloads/ adresinden Python 3.10+ yükleyin",
            "Kurulum sırasında 'Add Python to PATH' seçeneğini işaretleyin",
        ],
    }


def _check_adb_on_path() -> dict:
    adb_path = shutil.which("adb")
    if adb_path:
        return {"status": "ok", "message": f"ADB bulundu: {adb_path}", "fix_steps": []}
    return {
        "status": "error",
        "message": "ADB bulunamadı — PATH'e eklenmemiş",
        "fix_steps": [
            "https://developer.android.com/tools/releases/platform-tools adresinden platform-tools indirin",
            "İndirilen klasörü sistem PATH'ine ekleyin",
            "Terminali yeniden başlatın ve 'adb version' ile doğrulayın",
        ],
    }


def _check_adb_server() -> dict:
    adb_path = shutil.which("adb")
    if not adb_path:
        return {"status": "warning", "message": "ADB bulunamadığı için sunucu kontrolü atlandı", "fix_steps": []}
    try:
        result = subprocess.run(
            [adb_path, "devices"], capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return {"status": "ok", "message": "ADB sunucusu çalışıyor", "fix_steps": []}
        return {
            "status": "warning",
            "message": "ADB sunucusu başlatılamadı",
            "fix_steps": [
                "'adb kill-server' komutunu çalıştırın",
                "'adb start-server' ile yeniden başlatın",
            ],
        }
    except FileNotFoundError:
        return {"status": "warning", "message": "ADB çalıştırılamadı", "fix_steps": ["ADB yükleyin ve PATH'e ekleyin"]}
    except subprocess.TimeoutExpired:
        return {"status": "warning", "message": "ADB sunucu yanıt vermiyor (zaman aşımı)", "fix_steps": ["'adb kill-server' ardından 'adb start-server' deneyin"]}
    except Exception:
        return {"status": "warning", "message": "ADB sunucu kontrolü başarısız", "fix_steps": ["ADB'yi yeniden başlatın"]}


def _check_env_file() -> dict:
    env_path = os.path.join(PROJECT_ROOT, ".env")
    example_path = os.path.join(PROJECT_ROOT, ".env.example")
    if os.path.exists(env_path):
        return {"status": "ok", "message": ".env dosyası mevcut", "fix_steps": []}
    if os.path.exists(example_path):
        try:
            shutil.copy2(example_path, env_path)
            return {"status": "warning", "message": ".env dosyası yoktu — .env.example'dan oluşturuldu", "fix_steps": [".env dosyasını düzenleyerek API_SECRET_KEY alanını doldurun"]}
        except OSError as exc:
            return {"status": "error", "message": f".env oluşturulamadı: {exc}", "fix_steps": ["'.env.example' dosyasını manuel olarak '.env' olarak kopyalayın"]}
    return {
        "status": "error",
        "message": ".env dosyası bulunamadı ve .env.example da mevcut değil",
        "fix_steps": [
            "Proje dizininde '.env' dosyası oluşturun",
            ".env.example dosyasından kopyalayın veya yeni bir tane oluşturun",
        ],
    }


def _check_required_packages() -> dict:
    required = [
        "fastapi",
        "pydantic",
        "ppadb",
        "uvicorn",
        "yaml",
        "loguru",
        "requests",
        "dotenv",
        "psutil",
    ]
    missing = []
    for pkg in required:
        try:
            importlib.import_module(pkg)
        except ImportError:
            missing.append(pkg)
    if not missing:
        return {"status": "ok", "message": f"Gerekli {len(required)} paketin hepsi yüklü", "fix_steps": []}
    return {
        "status": "error",
        "message": f"Eksik paketler: {', '.join(missing)}",
        "fix_steps": [
            "pip install -r requirements.txt komutunu çalıştırın",
            "Sanal ortam (venv) kullandığınızdan emin olun",
        ],
    }


def _check_data_directory() -> dict:
    data_dir = os.path.join(PROJECT_ROOT, "data")
    try:
        os.makedirs(data_dir, exist_ok=True)
        test_file = os.path.join(data_dir, ".doctor_write_test")
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
        return {"status": "ok", "message": f"Veri dizini yazılabilir: {data_dir}", "fix_steps": []}
    except OSError as exc:
        return {
            "status": "error",
            "message": f"Veri dizini yazılabilir değil: {exc}",
            "fix_steps": [
                f"'{data_dir}' klasörünün yazma izinlerini kontrol edin",
                "Klasörü manuel olarak oluşturmayı deneyin",
            ],
        }


def _check_port_available() -> dict:
    port = 8000
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", port))
        return {"status": "ok", "message": f"Port {port} (monitor) müsait", "fix_steps": []}
    except OSError:
        return {
            "status": "warning",
            "message": f"Port {port} kullanımda — monitor sunucusu başlatılamayabilir",
            "fix_steps": [
                f"Port {port}'u kullanan uygulamayı kapatın",
                "Monitor sunucusu zaten çalışıyor olabilir — durumunu kontrol edin",
            ],
        }


def _check_sqlite_writable() -> dict:
    db_path = os.path.join(PROJECT_ROOT, "data", "job_queue.db")
    data_dir = os.path.dirname(db_path)
    try:
        os.makedirs(data_dir, exist_ok=True)
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE IF NOT EXISTS _doctor_check (id INTEGER)")
        conn.execute("DROP TABLE IF EXISTS _doctor_check")
        conn.close()
        return {"status": "ok", "message": f"SQLite veritabanı yazılabilir: {db_path}", "fix_steps": []}
    except Exception as exc:
        return {
            "status": "error",
            "message": f"SQLite veritabanı yazılabilir değil: {exc}",
            "fix_steps": [
                f"'{data_dir}' klasörünün yazma izinlerini kontrol edin",
                "Disk alanının dolu olmadığından emin olun",
            ],
        }


def _check_error_messages_json() -> dict:
    json_path = os.path.join(PROJECT_ROOT, "shared", "error_messages.json")
    if not os.path.exists(json_path):
        return {
            "status": "error",
            "message": "shared/error_messages.json bulunamadı",
            "fix_steps": ["shared/error_messages.json dosyasının proje dizininde olduğundan emin olun"],
        }
    try:
        with open(json_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, list):
            return {"status": "error", "message": "error_messages.json geçerli bir JSON dizisi değil", "fix_steps": ["Dosya formatını kontrol edin"]}
        return {"status": "ok", "message": f"Hata mesajları kataloğu yüklendi ({len(data)} desen)", "fix_steps": []}
    except json.JSONDecodeError as exc:
        return {
            "status": "error",
            "message": f"error_messages.json JSON ayrıştırma hatası: {exc}",
            "fix_steps": ["Dosyanın geçerli JSON formatında olduğunu kontrol edin"],
        }


def _check_network() -> dict:
    try:
        socket.setdefaulttimeout(5)
        socket.getaddrinfo("google.com", 80)
        return {"status": "ok", "message": "Ağ bağlantısı çalışıyor (DNS çözümleme başarılı)", "fix_steps": []}
    except socket.gaierror:
        return {
            "status": "warning",
            "message": "DNS çözümleme başarısız — internet bağlantısı yok",
            "fix_steps": [
                "İnternet bağlantınızı kontrol edin",
                "VPN kullanıyorsanız bağlantısını doğrulayın",
                "DNS ayarlarınızı kontrol edin",
            ],
        }
    except Exception:
        return {"status": "warning", "message": "Ağ bağlantısı kontrol edilemedi", "fix_steps": ["İnternet bağlantınızı kontrol edin"]}


_ALL_CHECKS = [
    ("Python sürümü", _check_python_version),
    ("ADB (PATH)", _check_adb_on_path),
    ("ADB sunucusu", _check_adb_server),
    (".env dosyası", _check_env_file),
    ("Python paketleri", _check_required_packages),
    ("Veri dizini", _check_data_directory),
    ("Port 8000", _check_port_available),
    ("SQLite veritabanı", _check_sqlite_writable),
    ("Hata mesajları", _check_error_messages_json),
    ("Ağ bağlantısı", _check_network),
]


def cmd_doctor(args: argparse.Namespace, config: dict) -> None:
    print("\n" + "=" * 60)
    print("  Phone Farm — Uçuş Öncesi Kontrol")
    print("=" * 60 + "\n")

    results: list[dict] = []
    for name, check_fn in _ALL_CHECKS:
        try:
            result = check_fn()
        except Exception as exc:
            result = {"status": "error", "message": f"Kontrol çalıştırılamadı: {exc}", "fix_steps": []}
        result["name"] = name
        results.append(result)

        icon = _STATUS_ICONS.get(result["status"], "?")
        print(f"  {icon} {name}: {result['message']}")
        if result["status"] != "ok" and result.get("fix_steps"):
            for i, step in enumerate(result["fix_steps"], 1):
                print(f"      {i}. {step}")

    passed = sum(1 for r in results if r["status"] == "ok")
    warned = sum(1 for r in results if r["status"] == "warning")
    failed = sum(1 for r in results if r["status"] == "error")
    total = len(results)

    print("\n" + "-" * 60)
    print(f"  Toplam: {total} | Başarılı: {passed} | Uyarı: {warned} | Hata: {failed}")
    print("-" * 60)

    if failed > 0:
        print("\n  Sonuç: BAZI KONTROLLER BAŞARISIZ — lütfen yukarıdaki adımları izleyin.\n")
        sys.exit(1)
    elif warned > 0:
        print("\n  Sonuç: UYARILAR MEVCUT — sistem çalışabilir ama kontrol edilmesi önerilir.\n")
        sys.exit(0)
    else:
        print("\n  Sonuç: TÜM KONTROLLER BAŞARILI — sistem kullanıma hazır.\n")
        sys.exit(0)


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

    # rotate
    sub.add_parser("rotate", help="Rotate the API_SECRET_KEY in .env")
    sub.add_parser("rotate-key", help="Alias for `rotate` — rotate the API_SECRET_KEY in .env")

    # doctor
    sub.add_parser("doctor", help="Run pre-flight diagnostic checks")

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
    elif cmd == "rotate":
        cmd_rotate(args, config)
    elif cmd == "rotate-key":  # alias for `rotate` per plan K5
        cmd_rotate(args, config)
    elif cmd == "doctor":
        cmd_doctor(args, config)
    else:
        parse_args(["--help"])


if __name__ == "__main__":
    main()
