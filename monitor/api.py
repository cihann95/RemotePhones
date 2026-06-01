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

from typing import Any

import logging
import os
import sys
import time

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
from scheduler.manager import PhoneFarmManager

logger = logging.getLogger(__name__)

if FastAPI is None:
    logger.warning(
        "FastAPI is not installed — monitor/api.py routes will raise ImportError "
        "at call time.  Install fastapi>=0.103.0 to enable the HTTP API."
    )
    app = None  # type: ignore[assignment]
else:
    def verify_api_key(authorization: str = Header(None)):
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

_RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
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
        if request.url.path == "/health" or request.url.path.startswith("/health/"):
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
        record = _manager.enqueue_task(task_name, device_id, params)
        return {"job_id": record["job_id"], "status": record["status"], "device_id": device_id}
