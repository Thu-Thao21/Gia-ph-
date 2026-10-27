"""Health probes (Mốc M7). Public (app.core.public_routes), fast, and they say nothing sensitive:
no version, no host, no database name, no error text.

  GET /api/health        liveness: the process answers. Never touches the database.
  GET /api/health/ready  readiness: one "SELECT 1", bounded by READY_TIMEOUT_SECONDS; 503 when the
                         database does not answer in time. Only the exception CLASS is logged.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse

from app.db.postgres import check_db

logger = logging.getLogger("mfg.health")
router = APIRouter()

READY_TIMEOUT_SECONDS = 2.0
NO_STORE = {"Cache-Control": "no-store"}


def get_db_probe() -> Callable[[], Awaitable[None]]:
    """Dependency (tests replace it): the database probe of the readiness check."""
    return check_db


@router.get("/health")
async def health(response: Response):
    response.headers.update(NO_STORE)
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness(probe: Callable[[], Awaitable[None]] = Depends(get_db_probe)):
    try:
        await asyncio.wait_for(probe(), timeout=READY_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        logger.error("Readiness check failed (timeout after %.1fs).", READY_TIMEOUT_SECONDS)
        return JSONResponse(status_code=503, content={"status": "not_ready"}, headers=NO_STORE)
    except Exception as exc:  # noqa: BLE001 - any failure is "not ready"; the class only is logged
        logger.error("Readiness check failed (%s).", type(exc).__name__)
        return JSONResponse(status_code=503, content={"status": "not_ready"}, headers=NO_STORE)
    return JSONResponse(content={"status": "ready"}, headers=NO_STORE)
