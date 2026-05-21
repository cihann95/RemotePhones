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

import logging
import sys

try:
    from fastapi import FastAPI, HTTPException
except ImportError:  # pragma: no cover
    FastAPI = None  # type: ignore[assignment,misc]
    HTTPException = None  # type: ignore[assignment]

from monitor.health import HealthChecker
from scheduler.manager import PhoneFarmManager

logger = logging.getLogger(__name__)

if FastAPI is None:
    logger.warning(
        "FastAPI is not installed — monitor/api.py routes will raise ImportError "
        "at call time.  Install fastapi>=0.103.0 to enable the HTTP API."
    )
    app = None  # type: ignore[assignment]
else:
    app = FastAPI(title="Phone Farm Monitor", version="0.1.0")

# ── shared state ──────────────────────────────────────────────────────────────

_manager: PhoneFarmManager | None = None
_health_checker: HealthChecker | None = None


def attach_manager(mgr: PhoneFarmManager) -> None:
    global _manager, _health_checker
    _manager = mgr
    _health_checker = HealthChecker(mgr.adb)
    logger.info("PhoneFarmManager attached to API")


# ── helpers ───────────────────────────────────────────────────────────────────

def _require_manager():
    if FastAPI is None:
        raise RuntimeError(
            "FastAPI is not installed.  "
            "Install fastapi>=0.103.0 to use the monitor API."
        )
    if _manager is None or _health_checker is None:
        raise HTTPException(503, "Manager not initialised — call attach_manager() first")


# ── routes (only registered when FastAPI is available) ────────────────────────

if app is not None:

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "phone-farm", "python": sys.version}


    @app.get("/health/devices")
    def health_all():
        _require_manager()
        return {
            "devices": [
                _health_checker.check(did).to_dict()
                for did in _manager.dm.all_devices
            ]
        }


    @app.get("/health/devices/{device_id}")
    def health_one(device_id: str):
        _require_manager()
        return _health_checker.check(device_id).to_dict()


    @app.get("/status")
    def status():
        _require_manager()
        return _manager.status_summary()


    @app.get("/queue")
    def queue_all():
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
    def queue_one(job_id: str):
        _require_manager()
        rec = _manager.queue.get_status(job_id)
        if rec is None:
            raise HTTPException(404, detail=f"Job {job_id!r} not found")
        return rec
