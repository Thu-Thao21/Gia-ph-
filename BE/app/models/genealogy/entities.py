"""M03. Genealogy Model (Data Access & Entity Mapping).

Entities:
- FamilyBranch (branches)
- Person (persons)
- Relationship (relationships)
- PersonClosure (person_closure)
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FamilyBranch(Base):
    __tablename__ = "branches"

    id: Mapped[uuid.UUID] = mapped_column(
        "branch_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        "clan_id",
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.branch_id", ondelete="SET NULL"),
        nullable=True,
    )
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    branch_order: Mapped[int] = mapped_column(Integer, server_default="0", default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), server_default="ACTIVE", default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[uuid.UUID] = mapped_column(
        "person_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        "clan_id",
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.branch_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    death_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_alive: Mapped[Optional[bool]] = mapped_column(
        "is_living", Boolean, server_default="true", default=True, nullable=True
    )
    generation: Mapped[Optional[int]] = mapped_column(
        "generation_no", Integer, server_default="1", default=1, nullable=True
    )
    bio: Mapped[Optional[str]] = mapped_column("biography", Text, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(
        "avatar_storage_key", Text, nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), server_default="ACTIVE", default="ACTIVE", nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Relationship(Base):
    __tablename__ = "relationships"

    id: Mapped[uuid.UUID] = mapped_column(
        "relationship_id",
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        "clan_id",
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_member_id: Mapped[uuid.UUID] = mapped_column(
        "from_person_id",
        UUID(as_uuid=True),
        ForeignKey("persons.person_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    to_member_id: Mapped[uuid.UUID] = mapped_column(
        "to_person_id",
        UUID(as_uuid=True),
        ForeignKey("persons.person_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    relationship_type: Mapped[str] = mapped_column(String(30), nullable=False)
    parent_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    child_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    marriage_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    started_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ended_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), server_default="ACTIVE", default="ACTIVE", nullable=False)
    verified: Mapped[bool] = mapped_column(
        Boolean, server_default="false", default=False, nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class PersonClosure(Base):
    __tablename__ = "person_closure"

    ancestor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.person_id", ondelete="CASCADE"),
        primary_key=True,
    )
    descendant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.person_id", ondelete="CASCADE"),
        primary_key=True,
    )
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


Branch = FamilyBranch


class ClanLocation(Base):
    __tablename__ = "clan_locations"

    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    clan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("branches.branch_id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location_type: Mapped[str] = mapped_column(String(50), server_default="ANCESTRAL_HALL", default="ANCESTRAL_HALL", nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_urls: Mapped[Optional[list]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"), nullable=True)
    privacy_level: Mapped[str] = mapped_column(String(30), server_default="CLAN_ONLY", default="CLAN_ONLY", nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PersonBurial(Base):
    __tablename__ = "person_burials"

    burial_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.person_id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    clan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cemetery_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    grave_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    burial_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    orientation: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_urls: Mapped[Optional[list]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"), nullable=True)
    privacy_level: Mapped[str] = mapped_column(String(30), server_default="CLAN_ONLY", default="CLAN_ONLY", nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class LocationProposal(Base):
    __tablename__ = "location_proposals"

    proposal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    clan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    person_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.person_id", ondelete="CASCADE"),
        nullable=True,
    )
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clan_locations.location_id", ondelete="CASCADE"),
        nullable=True,
    )
    target_type: Mapped[str] = mapped_column(String(50), default="PERSON_BURIAL", nullable=False)
    proposer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    proposed_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    proposed_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proposed_lat: Mapped[float] = mapped_column(Float, nullable=False)
    proposed_lng: Mapped[float] = mapped_column(Float, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_photos: Mapped[Optional[list]] = mapped_column(JSONB, server_default=text("'[]'::jsonb"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), server_default="PENDING", default="PENDING", nullable=False)
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PersonPrivacySetting(Base):
    __tablename__ = "person_privacy_settings"

    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persons.person_id", ondelete="CASCADE"),
        primary_key=True,
    )
    full_name_visibility: Mapped[str] = mapped_column(String(50), server_default="CLAN", default="CLAN", nullable=False)
    birth_date_visibility: Mapped[str] = mapped_column(String(50), server_default="CLAN", default="CLAN", nullable=False)
    death_date_visibility: Mapped[str] = mapped_column(String(50), server_default="CLAN", default="CLAN", nullable=False)
    avatar_visibility: Mapped[str] = mapped_column(String(50), server_default="CLAN", default="CLAN", nullable=False)
    professional_visibility: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email_visibility: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    phone_visibility: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    address_visibility: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    relationship_visibility: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
