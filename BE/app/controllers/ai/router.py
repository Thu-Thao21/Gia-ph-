"""AI Controller Router Aggregator.

Aggregates modular sub-routers:
- settings_router: clan AI configuration, member consents, Gemini connectivity test
- assistant_router: smart genealogy chat assistant, kinship explainer, biography summarizer
- quality_audit_router: data quality audit reports, duplicate candidates, data anomalies, missing relationships, Excel import audit
"""

from __future__ import annotations

from fastapi import APIRouter

from app.controllers.ai.settings_router import router as settings_router
from app.controllers.ai.assistant_router import router as assistant_router
from app.controllers.ai.quality_audit_router import router as quality_audit_router
from app.controllers.ai.smart_excel_router import router as smart_excel_router

# Re-export common helpers and constants for backward compatibility
from app.controllers.ai.common import (
    _utc_now,
    DEFAULT_FEATURES,
    DEFAULT_DATA_SCOPES,
    PURPOSE_KEYS,
    _require_clan_leader,
    _require_clan_membership,
    _require_quality_audit_access,
)

router = APIRouter(prefix="", tags=["ai-management"])

router.include_router(settings_router)
router.include_router(assistant_router)
router.include_router(quality_audit_router)
router.include_router(smart_excel_router)
