"""Worship Space Domain Models (M05).

Defines entities for altars, worship records, memorials, rituals, burial sites, and clan locations.

Phong tho (migration 0014_worship_hall): moi dong ho co DUNG MOT phong tho (hall_type = 'CLAN').
Thap huong va Loi vieng tinh cho ca ban tho (space), khong theo bai vi.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.genealogy.entities import ClanLocation, PersonBurial, LocationProposal

__all__ = [
    "ClanLocation",
    "PersonBurial",
    "LocationProposal",
    "WorshipSpace",
    "WorshipTier",
    "WorshipPerson",
    "WorshipDailyOffering",
    "WorshipStreak",
]


class WorshipSpace(Base):
    """public.worship_spaces. Bang co tu truoc (initial_schema.sql); 0014 them cac cot cuoi."""

    __tablename__ = "worship_spaces"

    space_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    clan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clans.clan_id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # PUBLIC | CLAN_ONLY (bang cu co the co gia tri khac: coi nhu CLAN_ONLY)
    visibility: Mapped[str] = mapped_column(
        String(30), nullable=False, server_default=text("'CLAN_ONLY'")
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    # CLAN | BRANCH (moi chi dung CLAN)
    hall_type: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'CLAN'")
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.branch_id", ondelete="SET NULL"), nullable=True
    )
    blessings_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    cover_image_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class WorshipTier(Base):
    """Tang cua ban tho. tier_no 1 = tang tren cung (doi cao nhat), toi da 6 tang / phong."""

    __tablename__ = "worship_tiers"
    __table_args__ = (
        CheckConstraint("tier_no BETWEEN 1 AND 6", name="worship_tiers_tier_no_check"),
        # Rang buoc that trong DB la DEFERRABLE INITIALLY IMMEDIATE de hoan doi tierNo trong 1 giao dich.
        UniqueConstraint("space_id", "tier_no", name="uq_worship_tiers_space_tier_no"),
    )

    tier_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    space_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("worship_spaces.space_id", ondelete="CASCADE"), nullable=False
    )
    tier_no: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class WorshipPerson(Base):
    """Mot bai vi trong phong tho. Chi nguoi DA MAT cua cung dong ho."""

    __tablename__ = "worship_persons"
    __table_args__ = (
        UniqueConstraint("space_id", "person_id", name="uq_worship_persons_space_person"),
        Index("idx_worship_persons_space_tier_order", "space_id", "tier_id", "display_order"),
    )

    worship_person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    space_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("worship_spaces.space_id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("persons.person_id", ondelete="CASCADE"), nullable=False
    )
    altar_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Thu tu TRONG tang
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    portrait_image_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    added_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    tier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("worship_tiers.tier_id", ondelete="SET NULL"), nullable=True
    )


class WorshipDailyOffering(Base):
    """Mot luot thap huong (INCENSE) hoac mot Loi vieng (BLESSING) cua mot thanh vien trong mot ngay."""

    __tablename__ = "worship_daily_offerings"
    __table_args__ = (
        CheckConstraint("offering_type IN ('INCENSE', 'BLESSING')", name="worship_daily_offerings_type_check"),
        CheckConstraint("status IN ('PUBLISHED', 'HIDDEN')", name="worship_daily_offerings_status_check"),
        UniqueConstraint(
            "space_id", "user_id", "offering_type", "offer_date", name="uq_worship_daily_offering"
        ),
        Index(
            "idx_worship_offerings_space_type_time",
            "space_id",
            "offering_type",
            text("created_at DESC"),
        ),
    )

    offering_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    space_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("worship_spaces.space_id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    offering_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Ngay theo gio Viet Nam (UTC+7)
    offer_date: Mapped[date] = mapped_column(Date, nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default=text("'PUBLISHED'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class WorshipStreak(Base):
    """Chuoi ngay lien tiep cua mot thanh vien, rieng cho huong va rieng cho loi vieng."""

    __tablename__ = "worship_streaks"
    __table_args__ = (
        PrimaryKeyConstraint("space_id", "user_id", "offering_type", name="worship_streaks_pkey"),
        CheckConstraint("offering_type IN ('INCENSE', 'BLESSING')", name="worship_streaks_type_check"),
    )

    space_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("worship_spaces.space_id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    offering_type: Mapped[str] = mapped_column(String(20), nullable=False)
    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    longest_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    total_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    last_offer_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
