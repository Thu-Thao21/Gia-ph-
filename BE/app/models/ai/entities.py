from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ClanAISetting(Base):
    """Maps public.clan_ai_settings for clan-wide AI permissions and configuration."""

    __tablename__ = "clan_ai_settings"

    clan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id", ondelete="CASCADE"),
        primary_key=True,
    )
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    features: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text(
            '\'{"assistant": true, "relationship_analysis": true, "suggestions": true, "biography": true}\'::jsonb'
        ),
    )
    allowed_data_scopes: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text(
            '\'{"public_events": true, "general_history": true, "personal_data": false, "images": false}\'::jsonb'
        ),
    )
    gemini_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        onupdate=_utc_now,
        nullable=False,
    )


class AIConsent(Base):
    """Maps public.ai_consents for per-person, per-purpose AI consent grants/revocations."""

    __tablename__ = "ai_consents"
    __table_args__ = (
        UniqueConstraint("clan_id", "user_id", "purpose", name="uq_ai_consents_clan_user_purpose"),
        Index("idx_ai_consents_clan_person", "clan_id", "person_id"),
    )

    consent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.person_id", ondelete="CASCADE"),
        nullable=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    clan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id", ondelete="CASCADE"),
        nullable=True,
    )
    purpose: Mapped[str] = mapped_column(String(255), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        nullable=False,
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
