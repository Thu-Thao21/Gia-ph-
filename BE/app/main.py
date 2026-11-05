import asyncio
import logging
import sys

if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models.registry  # noqa: F401

from app.controllers.auth_access.router import router as auth_router
from app.controllers.auth_access.user_admin_router import router as user_admin_router
from app.controllers.family_management.public_router import router as public_router
from app.controllers.family_management.clan_admin_router import router as clan_admin_router
from app.controllers.family_management.clan_join_router import router as clan_join_router
from app.controllers.family_management.owner_admin_router import router as owner_admin_router
from app.controllers.family_management.registration_admin_router import (
    router as registration_admin_router,
)
from app.controllers.genealogy import router as genealogy_router
from app.controllers.inter_family.router import router as inter_family_router
from app.core.config import settings
from app.core.errors.errors import UnhandledErrorMiddleware, register_exception_handlers
from app.core.middleware.rate_limit import build_rate_limiters
from app.core.middleware.request_id import RequestIdMiddleware
from app.core.security import password_hash
from app.core.security.security_headers import SecurityHeadersMiddleware
from app.core.config.startup_checks import ConfigurationError, validate_runtime_config
from app.db.postgres import close_db, init_db
from app.dependencies.auth import API_PREFIX
from app.controllers import health

logger = logging.getLogger("mfg")


def configure_logging() -> None:
    """The app's loggers ("mfg.*") at settings.LOG_LEVEL (default INFO) on the console. Uvicorn's
    log config only sets up its own "uvicorn.*" loggers, so without this an app INFO line is
    dropped (Python's last-resort handler prints WARNING and above only). Idempotent. The logger
    still propagates: pytest's caplog keeps seeing it, and uvicorn leaves the root without a
    handler, so nothing is printed twice."""
    if not any(getattr(h, "_mfg_console", False) for h in logger.handlers):
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        handler._mfg_console = True  # type: ignore[attr-defined]
        logger.addHandler(handler)
    logger.setLevel(settings.LOG_LEVEL.upper())


def create_app() -> FastAPI:
    """Build the application. The module-level `app` below is the one uvicorn serves;
    tests call create_app() to get a fresh instance they can extend."""
    configure_logging()
    application = FastAPI(title="Multi-family Genealogy API")

    # Middleware order: the LAST one added is the OUTERMOST. From outside in:
    #   RequestIdMiddleware -> CORSMiddleware -> UnhandledErrorMiddleware -> handlers/routes
    # UnhandledErrorMiddleware must sit inside CORS so a 500 envelope still gets the
    # Access-Control-* headers; RequestIdMiddleware outermost so every response, preflight
    # and error included, carries a request_id.
    application.add_middleware(UnhandledErrorMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Without this the browser hides these headers from frontend JavaScript.
        expose_headers=["X-Request-ID", "Retry-After", "Idempotency-Replayed"],
    )
    application.add_middleware(SecurityHeadersMiddleware)
    application.add_middleware(RequestIdMiddleware)
    register_exception_handlers(application)
    # In-memory, per process (docs/known_issues.md KI-17). Tests replace it to use a fake clock.
    application.state.rate_limiters = build_rate_limiters(settings)
    return application


app = create_app()


@app.on_event("startup")
async def startup_event():
    # Fail closed: a bad Firebase/CORS configuration stops the process with a clear
    # message (variable names only, never values). Runs before the DB check and only on
    # real startup, never on import.
    try:
        validate_runtime_config(settings)
    except ConfigurationError as exc:
        logger.critical("%s", exc)
        raise
    # The bcrypt dummy hash (cost 12) used by logins of unknown accounts: built here, not in the
    # first such login (it doubled that request's bcrypt time).
    await asyncio.to_thread(password_hash.warm_up)
    try:
        await init_db()
        logger.info("Database connectivity check passed.")
        from app.db.postgres import engine
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text("""
                ALTER TABLE inter_clan_requests 
                ADD COLUMN IF NOT EXISTS connection_type VARCHAR(30) DEFAULT 'IN_LAW';
            """))
            await conn.execute(text("""
                ALTER TABLE inter_clan_links 
                ADD COLUMN IF NOT EXISTS connection_type VARCHAR(30) DEFAULT 'IN_LAW',
                ADD COLUMN IF NOT EXISTS terminated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
                ADD COLUMN IF NOT EXISTS termination_reason TEXT;
            """))
            await conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_inter_clan_requests_pending_symmetric 
                ON inter_clan_requests (
                    LEAST(source_clan_id, target_clan_id), 
                    GREATEST(source_clan_id, target_clan_id)
                ) WHERE status = 'PENDING';
            """))
            await conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_inter_clan_links_active_symmetric 
                ON inter_clan_links (
                    LEAST(clan_a_id, clan_b_id), 
                    GREATEST(clan_a_id, clan_b_id)
                ) WHERE status = 'ACTIVE';
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS inter_clan_person_mappings (
                    mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    link_id UUID NOT NULL REFERENCES inter_clan_links(link_id) ON DELETE CASCADE,
                    clan_a_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
                    person_a_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
                    clan_b_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
                    person_b_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
                    relationship_type VARCHAR(30) NOT NULL DEFAULT 'SPOUSE',
                    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                    requested_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
                    requested_clan_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
                    verified_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
                    verified_at TIMESTAMPTZ,
                    review_notes TEXT,
                    notes TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
            """))
            await conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_inter_clan_person_mappings_symmetric
                ON inter_clan_person_mappings (
                    LEAST(person_a_id, person_b_id),
                    GREATEST(person_a_id, person_b_id)
                ) WHERE status IN ('PENDING', 'VERIFIED');
            """))
        logger.info("Inter-family Phase 1 and 2 schema migration completed.")
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS clan_ai_settings (
                    clan_id UUID PRIMARY KEY REFERENCES clans(clan_id) ON DELETE CASCADE,
                    ai_enabled BOOLEAN NOT NULL DEFAULT false,
                    features JSONB NOT NULL DEFAULT '{"assistant": true, "relationship_analysis": true, "suggestions": true, "biography": true}'::jsonb,
                    allowed_data_scopes JSONB NOT NULL DEFAULT '{"public_events": true, "general_history": true, "personal_data": false, "images": false}'::jsonb,
                    gemini_model VARCHAR(100) NULL,
                    updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                ALTER TABLE ai_consents ADD COLUMN IF NOT EXISTS clan_id UUID REFERENCES clans(clan_id) ON DELETE CASCADE;
                ALTER TABLE ai_consents ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_consents_user_person_purpose 
                ON ai_consents (user_id, person_id, purpose);
                CREATE INDEX IF NOT EXISTS idx_ai_consents_clan_person 
                ON ai_consents (clan_id, person_id);
            """))
        logger.info("AI settings & consents schema verified on Neon DB.")
        async with engine.begin() as conn:
            await conn.execute(text("""
                ALTER TABLE funds ADD COLUMN IF NOT EXISTS purpose TEXT NULL;
                ALTER TABLE funds ADD COLUMN IF NOT EXISTS target_amount NUMERIC(18, 2) NULL;
                ALTER TABLE funds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
                CREATE INDEX IF NOT EXISTS idx_funds_clan_id ON funds(clan_id);

                CREATE TABLE IF NOT EXISTS clan_bank_accounts (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    clan_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
                    bank_name VARCHAR(255) NOT NULL,
                    account_holder VARCHAR(255) NOT NULL,
                    account_number VARCHAR(100) NOT NULL,
                    qr_image_path TEXT NULL,
                    transfer_instruction TEXT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT true,
                    created_by UUID NOT NULL REFERENCES users(user_id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS idx_clan_bank_accounts_clan_id ON clan_bank_accounts(clan_id);

                CREATE TABLE IF NOT EXISTS donations (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    clan_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
                    fund_id UUID NOT NULL REFERENCES funds(fund_id) ON DELETE CASCADE,
                    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                    donor_name VARCHAR(255) NOT NULL,
                    donation_code VARCHAR(50) NOT NULL,
                    amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
                    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
                    bank_account_snapshot JSONB NULL,
                    bank_transaction_reference VARCHAR(255) NULL,
                    note TEXT NULL,
                    rejection_reason TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    submitted_at TIMESTAMPTZ NULL,
                    verified_at TIMESTAMPTZ NULL,
                    verified_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS idx_donations_clan_id ON donations(clan_id);
                CREATE INDEX IF NOT EXISTS idx_donations_fund_id ON donations(fund_id);
                CREATE INDEX IF NOT EXISTS idx_donations_user_id ON donations(user_id);
                CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
                CREATE UNIQUE INDEX IF NOT EXISTS uq_donations_code ON donations(donation_code);

                CREATE TABLE IF NOT EXISTS donation_evidence (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    donation_id UUID NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
                    image_path TEXT NOT NULL,
                    file_name VARCHAR(255) NULL,
                    mime_type VARCHAR(100) NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS idx_donation_evidence_donation_id ON donation_evidence(donation_id);

                CREATE TABLE IF NOT EXISTS fund_audit_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    clan_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
                    actor_id UUID NOT NULL REFERENCES users(user_id),
                    action VARCHAR(100) NOT NULL,
                    entity_type VARCHAR(50) NOT NULL,
                    entity_id UUID NOT NULL,
                    old_value JSONB NULL,
                    new_value JSONB NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS idx_fund_audit_logs_clan_id ON fund_audit_logs(clan_id);
            """))
        logger.info("Funds & donations schema verified on Neon DB.")
    except Exception as exc:
        # The class only: a connection error's text and traceback can carry the database host.
        logger.error(
            "Database connectivity check failed at startup (%s). "
            "App will keep running; /api/health/ready will return 503.",
            type(exc).__name__,
        )


@app.on_event("shutdown")
async def shutdown_event():
    await close_db()


# /api/health and /api/health/ready: app.controllers.health (Mốc M7).
app.include_router(health.router, prefix="/api")
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(user_admin_router, prefix=API_PREFIX)
app.include_router(public_router, prefix=API_PREFIX)
app.include_router(registration_admin_router, prefix=API_PREFIX)
app.include_router(owner_admin_router, prefix=API_PREFIX)
app.include_router(clan_admin_router, prefix=API_PREFIX)
app.include_router(clan_join_router, prefix=API_PREFIX)

# Also mount at root for seamless compatibility with FE calls
app.include_router(auth_router)
app.include_router(user_admin_router)
app.include_router(public_router)
app.include_router(registration_admin_router)
app.include_router(owner_admin_router)
app.include_router(clan_admin_router)
app.include_router(clan_join_router)
app.include_router(inter_family_router, prefix=API_PREFIX)
app.include_router(inter_family_router)

from app.controllers.member_api_router import router as member_api_router
from app.controllers.activity_fund import router as activity_fund_router
from app.controllers.worship_space import router as worship_space_router
from app.controllers.archive_media import router as archive_media_router
from app.controllers.ai import router as ai_router

# C03. Genealogy Controller
app.include_router(genealogy_router)
# C05. Activity & Fund Controller
app.include_router(activity_fund_router)
app.include_router(activity_fund_router, prefix=API_PREFIX)
# C06. Worship Space Controller
app.include_router(worship_space_router)
app.include_router(worship_space_router, prefix=API_PREFIX)
# C07. Archive & Media Controller
app.include_router(archive_media_router)
app.include_router(archive_media_router, prefix=API_PREFIX)
# Member API compatibility router
app.include_router(member_api_router)
app.include_router(member_api_router, prefix=API_PREFIX)
# C08. AI Assistant Controller
app.include_router(ai_router)
app.include_router(ai_router, prefix=API_PREFIX)

# To run: uvicorn app.main:app --reload --port 8001
