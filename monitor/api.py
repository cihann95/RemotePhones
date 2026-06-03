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

import re
from typing import Any

import csv
import io
import logging
import os
import sys
import time

DEVICE_ID_RE = re.compile(r'^[a-zA-Z0-9_\-]+$')
PHONE_RE = re.compile(r'^\+?[0-9]{10,15}$')
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
    from dotenv import load_dotenv
    load_dotenv()
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

if FastAPI is None:
    logger.warning(
        "FastAPI is not installed — monitor/api.py routes will raise ImportError "
        "at call time.  Install fastapi>=0.103.0 to enable the HTTP API."
    )
    app = None  # type: ignore[assignment]
else:
    def verify_api_key(authorization: str = Header(None)) -> str:
        expected_token = os.getenv("API_SECRET_KEY")
        if expected_token is None:
            raise HTTPException(status_code=401, detail="API_SECRET_KEY not set")
        if authorization is None:
            raise HTTPException(status_code=401, detail="Missing Authorization header")
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Invalid Authorization header format")
        token = authorization[7:]
        if token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid API key")
        return token

    app = FastAPI(title="Phone Farm Monitor", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "file://",
            "http://127.0.0.1:8000",
            "http://localhost:8000",
        ],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

# ── rate limiting ─────────────────────────────────────────────────────────────

_RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "100"))
_RATE_WINDOW_S = 60.0
_rate_buckets: dict[str, list[float]] = {}

# ── shared state ──────────────────────────────────────────────────────────────

_manager: PhoneFarmManager | None = None
_health_checker: DeviceHealthChecker | None = None


def attach_manager(mgr: PhoneFarmManager) -> None:
    global _manager, _health_checker
    _manager = mgr
    _health_checker = DeviceHealthChecker(device_manager=mgr.dm, config={})
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
        # Also exempt phone endpoints as they should not be rate limited
        if (request.url.path == "/health" or 
            request.url.path.startswith("/health/") or
            request.url.path.startswith("/phone/")):
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
        return await call_next(request)

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
        with q._lock:
            rows = [
                {"job_id": jid, **rec}
                for jid, rec in q._store.items()
            ]
        rows.sort(key=lambda r: r.get("created_at", 0), reverse=True)
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
