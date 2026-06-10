"""
FastAPI health + status endpoint for the Phone Farm monitor layer.

Serves plain JSON (no Pydantic BaseModel subclasses, no Pydantic v1/v2 voodoo).
Requires FastAPI ≥ 0.103 (compatible with pydantic ≥ 2.5).

Dependency:
    fastapi>=0.103.0   (pin: fastapi==0.115.6  — pydantic 2.13 compatible)

If FastAPI is not installed or the version is incompatible, importing this
module still works — every route raises HTTP 503 when the manager is absent.
"""

from __future__ import annotations

import hmac
import logging
import os
import re
import secrets
import sys
import time
from typing import Any

from dotenv import load_dotenv

load_dotenv()

DEVICE_ID_RE = re.compile(r'^[a-zA-Z0-9_\-]+$')
PHONE_RE = re.compile(r'^\+?[0-9]{7,15}$')
MAX_CSV_BODY = 512 * 1024  # 512 KB


def validate_device_id(device_id: str) -> None:
    if not isinstance(device_id, str) or not DEVICE_ID_RE.match(device_id):
        raise HTTPException(400, detail="Invalid device ID format")


def validate_phone_number(number: str) -> None:
    if not isinstance(number, str) or not PHONE_RE.match(number):
        raise HTTPException(400, detail="Invalid phone number format")

try:
    from fastapi import FastAPI, HTTPException, Header, Depends, Body
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
except ImportError:  # pragma: no cover
    FastAPI = None  # type: ignore[assignment,misc]
    HTTPException = None  # type: ignore[assignment]
    CORSMiddleware = None  # type: ignore[assignment,misc]
    JSONResponse = None  # type: ignore[assignment,misc]

from monitor.health import DeviceHealthChecker
from monitor.phone_health import PhoneHealthChecker
from core.phone import PhoneOperations
from scheduler.manager import PhoneFarmManager

logger = logging.getLogger(__name__)

def _get_api_key() -> str:
    return os.getenv("API_SECRET_KEY", "")


def _parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://127.0.0.1:8000,http://localhost:8000")
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    # Reject wildcard for security
    if "*" in origins:
        logger.warning("Wildcard '*' CORS origin ignored — using defaults")
        return ["http://127.0.0.1:8000", "http://localhost:8000"]
    return origins


if FastAPI is None:
    logger.warning(
        "FastAPI is not installed — monitor/api.py routes will raise ImportError "
        "at call time.  Install fastapi>=0.103.0 to enable the HTTP API."
    )
    app = None  # type: ignore[assignment]
else:
    def verify_api_key(authorization: str = Header(None)) -> str:
        expected_token = _get_api_key()
        if not expected_token:
            raise HTTPException(status_code=401, detail="API_SECRET_KEY not set")
        if authorization is None:
            raise HTTPException(status_code=401, detail="Missing Authorization header")
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid Authorization header format")
        token = authorization[7:]
        if not hmac.compare_digest(token.encode(), expected_token.encode()):
            raise HTTPException(status_code=401, detail="Invalid API key")
        return token

    app = FastAPI(title="Phone Farm Monitor", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_parse_cors_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

# ── rate limiting ─────────────────────────────────────────────────────────────

_RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "100"))
_RATE_WINDOW_S = 60.0
_RATE_BUCKET_CLEANUP_EVERY = 100
_rate_buckets: dict[str, list[float]] = {}
_rate_req_counter: int = 0

# ── shared state ──────────────────────────────────────────────────────────────

_manager: PhoneFarmManager | None = None
_health_checker: DeviceHealthChecker | None = None


def attach_manager(mgr: PhoneFarmManager) -> None:
    global _manager, _health_checker
    _manager = mgr
    _health_checker = DeviceHealthChecker(device_manager=mgr.dm, config=getattr(mgr, 'config', {}))
    logger.info("PhoneFarmManager attached to API")


# ── helpers ───────────────────────────────────────────────────────────────────

def _require_manager() -> PhoneFarmManager:
    if FastAPI is None:
        raise RuntimeError(
            "FastAPI is not installed.  "
            "Install fastapi>=0.103.0 to use the monitor API."
        )
    if _manager is None or _health_checker is None:
        raise HTTPException(503, "Manager not initialised — call attach_manager() first")
    return _manager


# ── routes (only registered when FastAPI is available) ────────────────────────

if app is not None:

    # ── rate-limiting middleware (skipped for /health) ─────────────────────

    @app.middleware("http")
    async def _rate_limit_middleware(request, call_next):
        # Exempt /health endpoint (and sub-paths like /health/devices)
        if (request.url.path == "/health" or 
            request.url.path.startswith("/health/")):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        cutoff = now - _RATE_WINDOW_S

        timestamps = _rate_buckets.get(client_ip, [])
        timestamps = [t for t in timestamps if t > cutoff]

        if len(timestamps) >= _RATE_LIMIT_PER_MINUTE:
            retry_after = int(timestamps[0] + _RATE_WINDOW_S - now) + 1
            return JSONResponse(
                status_code=429,
                content={"detail": "Too Many Requests", "retry_after": retry_after},
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)
        _rate_buckets[client_ip] = timestamps

        global _rate_req_counter
        _rate_req_counter += 1
        if _rate_req_counter >= _RATE_BUCKET_CLEANUP_EVERY:
            _rate_req_counter = 0
            stale = [ip for ip, ts in _rate_buckets.items() if not ts]
            for ip in stale:
                del _rate_buckets[ip]

        return await call_next(request)

    # ── security headers middleware (all responses) ──────────────────────

    @app.middleware("http")
    async def _security_headers_middleware(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "service": "phone-farm", "python": sys.version}


    @app.get("/health/devices")
    def health_all(api_key: str = Depends(verify_api_key)) -> dict[str, Any]:
        _require_manager()
        return {
            "devices": [
                _health_checker.check(did).to_dict()
                for did in _manager.dm.all_devices
            ]
        }


    @app.get("/health/devices/{device_id}")
    def health_one(device_id: str, api_key: str = Depends(verify_api_key)) -> dict[str, Any]:
        _require_manager()
        validate_device_id(device_id)
        return _health_checker.check(device_id).to_dict()


    @app.get("/status")
    def status(api_key: str = Depends(verify_api_key)) -> dict[str, Any]:
        _require_manager()
        return _manager.status_summary()


    @app.get("/queue")
    def queue_all(api_key: str = Depends(verify_api_key)) -> dict[str, Any]:
        _require_manager()
        q = _manager.queue
        rows = q.get_all_jobs()
        return {"jobs": rows, "qsize": q.qsize()}


    @app.get("/queue/{job_id}")
    def queue_one(job_id: str, api_key: str = Depends(verify_api_key)) -> dict[str, Any]:
        _require_manager()
        rec = _manager.queue.get_status(job_id)
        if rec is None:
            raise HTTPException(404, detail=f"Job {job_id!r} not found")
        return rec

    @app.post("/tasks")
    def enqueue_task(
        task_name: str = Body(...),
        device_id: str = Body(...),
        params: dict = Body(default={}),
        api_key: str = Depends(verify_api_key)
    ) -> dict[str, Any]:
        _require_manager()
        validate_device_id(device_id)
        record = _manager.enqueue_task(task_name, device_id, params)
        return JSONResponse(
            status_code=201,
            content={"job_id": record["job_id"], "status": record["status"]}
        )

    @app.delete("/queue/{job_id}")
    def cancel_job(
        job_id: str,
        api_key: str = Depends(verify_api_key)
    ) -> dict[str, Any]:
        _require_manager()
        success = _manager.queue.cancel(job_id)
        if not success:
            raise HTTPException(404, detail=f"Job {job_id!r} not found or cannot be cancelled")
        return {"job_id": job_id, "status": "cancelled"}

    @app.post("/devices/{device_id}/run")
    def run_task_on_device(
        device_id: str,
        task_name: str = Body(...),
        params: dict = Body(default={}),
        api_key: str = Depends(verify_api_key)
    ) -> dict[str, Any]:
        _require_manager()
        validate_device_id(device_id)
        record = _manager.enqueue_task(task_name, device_id, params)
        return {"job_id": record["job_id"], "status": record["status"], "device_id": device_id}


    # ── phone call endpoints ─────────────────────────────────────────────────────

    @app.get("/phone/health")
    def phone_health_all(api_key: str = Depends(verify_api_key)) -> dict[str, Any]:
        """Health check for all devices."""
        _require_manager()
        phone_health = PhoneHealthChecker(_manager.dm.adb)
        return {
            "devices": [
                phone_health.full_health(did)
                for did in _manager.dm.all_devices
            ]
        }

    @app.get("/phone/health/{device_id}")
    def phone_health_one(device_id: str, api_key: str = Depends(verify_api_key)) -> dict[str, Any]:
        """Health check for a specific device."""
        _require_manager()
        validate_device_id(device_id)
        phone_health = PhoneHealthChecker(_manager.dm.adb)
        return phone_health.full_health(device_id)

    @app.post("/phone/call")
    def phone_call(
        device_id: str = Body(...),
        number: str = Body(...),
        api_key: str = Depends(verify_api_key)
    ) -> dict[str, Any]:
        """Initiate a phone call."""
        _require_manager()
        validate_device_id(device_id)
        validate_phone_number(number)
        phone_ops = PhoneOperations(_manager.dm.adb)
        result = phone_ops.call(number, device_id)
        if not result.get("ok"):
            raise HTTPException(400, detail=result.get("error", "Call failed"))
        return result

    @app.post("/phone/call-bulk")
    def phone_call_bulk(
        device_id: str = Body(...),
        csv_data: str = Body(...),
        api_key: str = Depends(verify_api_key)
    ) -> dict[str, Any]:
        """Initiate bulk phone calls from CSV data."""
        _require_manager()
        validate_device_id(device_id)
        if len(csv_data) > MAX_CSV_BODY:
            raise HTTPException(400, detail="CSV data exceeds maximum allowed size")
        phone_ops = PhoneOperations(_manager.dm.adb)
        csv_result = phone_ops.read_csv_string(csv_data)
        if csv_result.get("warnings"):
            # Log warnings but continue processing
            for warning in csv_result["warnings"]:
                logger.warning(warning)
        
        numbers = csv_result.get("numbers", [])
        if not numbers:
            raise HTTPException(400, detail="No valid numbers found in CSV data")
        
        results = []
        for item in numbers:
            number = item["number"]
            name = item.get("name", "")
            call_result = phone_ops.call(number, device_id)
            call_result["name"] = name
            results.append(call_result)
        
        return {
            "device_id": device_id,
            "total": len(results),
            "successful": sum(1 for r in results if r.get("ok")),
            "results": results
        }

    @app.post("/phone/answer")
    def phone_answer(
        device_id: str = Body(...),
        api_key: str = Depends(verify_api_key)
    ) -> dict[str, Any]:
        """Answer an incoming call."""
        _require_manager()
        validate_device_id(device_id)
        phone_ops = PhoneOperations(_manager.dm.adb)
        result = phone_ops.answer(device_id)
        if not result.get("ok"):
            raise HTTPException(400, detail=result.get("error", "Answer failed"))
        return result

    @app.post("/phone/hangup")
    def phone_hangup(
        device_id: str = Body(...),
        api_key: str = Depends(verify_api_key)
    ) -> dict[str, Any]:
        """Hang up an active call."""
        _require_manager()
        validate_device_id(device_id)
        phone_ops = PhoneOperations(_manager.dm.adb)
        result = phone_ops.hang_up(device_id)
        if not result.get("ok"):
            raise HTTPException(400, detail=result.get("error", "Hang up failed"))
        return result

    def _rotate_api_key_impl() -> dict[str, Any]:
        """Shared rotation body used by both /admin/rotate-key and /rotate-key."""
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
        old_key = _get_api_key()
        new_key = secrets.token_hex(16)

        lines = []
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
            if lines and not lines[-1].endswith("\n"):
                lines[-1] = lines[-1] + "\n"
            if lines and lines[-1].strip() != "":
                lines.append("\n")
            lines.append(f"API_SECRET_KEY={new_key}\n")

        with open(env_path, "w", encoding="utf-8") as fh:
            fh.writelines(lines)

        return {"status": "rotated", "new_key": new_key, "old_key_invalidated": bool(old_key)}

    @app.post("/admin/rotate-key")
    def rotate_api_key_endpoint(api_key: str = Depends(verify_api_key)) -> dict[str, Any]:
        """Rotate the API key. Requires current valid API key."""
        return _rotate_api_key_impl()

    @app.post("/rotate-key")
    def rotate_api_key_endpoint_alias(api_key: str = Depends(verify_api_key)) -> dict[str, Any]:
        """Alias for /admin/rotate-key (plan K5). Requires current valid API key."""
        return _rotate_api_key_impl()
