from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    """Maps public.users (Neon inspect)."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED')",
            name="users_status_check",
        ),
        UniqueConstraint("email", name="users_email_key"),
        UniqueConstraint("firebase_uid", name="users_firebase_uid_key"),
        UniqueConstraint("username", name="users_username_key"),
        # Migration 0002: e-mail is unique regardless of case. users_email_key (exact match)
        # stays. Registration code (M???c E) must catch the IntegrityError and answer 409.
        Index("uq_users_email_lower", text("lower(email)"), unique=True),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    firebase_uid: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Mốc M5 (migration 0009): the real Gmail of a clan Owner, whose `email` is a @giapha.com login
    # identifier. Every mail meant for the Owner (temporary password, password reset) goes here.
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        server_default=text("'ACTIVE'::character varying"),
    )
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    phone_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    first_login_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    @property
    def id(self) -> "uuid.UUID":
        """Alias for user_id – used by Sprint 2 genealogy / access service code."""
        return self.user_id


class CredentialMetadata(Base):
    """Maps public.credential_metadata (Neon inspect)."""

    __tablename__ = "credential_metadata"
    __table_args__ = (
        CheckConstraint(
            "failed_login_count >= 0",
            name="credential_metadata_failed_login_count_check",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id"),
        primary_key=True,
    )
    auth_provider: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        server_default=text("'FIREBASE'::character varying"),
    )
    password_hash: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    temporary_password_issued_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    temporary_password_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    failed_login_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    locked_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class UserSession(Base):
    """Maps public.user_sessions (Neon inspect)."""

    __tablename__ = "user_sessions"
    __table_args__ = (
        Index("idx_user_sessions_active", "user_id", "revoked_at", "expires_at"),
        Index("idx_user_sessions_user", "user_id"),
        # Migration 0002 (KI-04). The column stays nullable: NULLs are distinct, so any
        # number of rows without a hash is allowed.
        Index("uq_user_sessions_token_jti_hash", "token_jti_hash", unique=True),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id"),
        nullable=False,
    )
    token_jti_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoke_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class LoginHistory(Base):
    """Maps public.login_history (Neon inspect)."""

    __tablename__ = "login_history"
    __table_args__ = (
        Index("idx_login_history_user_time", "user_id", text("occurred_at DESC")),
    )

    login_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id"),
        nullable=True,
    )
    identifier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    failure_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class UsedPasswordResetCode(Base):
    """Maps public.used_password_reset_codes (migration 0006, Mốc M4b): reset codes already used.

    code_hash = SHA-256 hex of the code (never the code). The primary key is the unique constraint
    that makes "use a code once" race-safe."""

    __tablename__ = "used_password_reset_codes"
    __table_args__ = (
        CheckConstraint("code_hash ~ '^[0-9a-f]{64}$'", name="used_password_reset_codes_code_hash_check"),
        Index("idx_used_password_reset_codes_user", "user_id", text("used_at DESC")),
    )

    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
    )
    used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class AuditLog(Base):
    """Maps public.audit_logs (Neon inspect)."""

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_logs_actor_time", "actor_id", text("occurred_at DESC")),
        Index("idx_audit_logs_clan_time", "clan_id", text("occurred_at DESC")),
    )

    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    clan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id"),
        nullable=True,
    )
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    old_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    new_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class Role(Base):
    """Maps public.roles (Neon inspect)."""

    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("code", name="roles_code_key"),)

    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_system_role: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )


class Permission(Base):
    """Maps public.permissions (Neon inspect)."""

    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("code", name="permissions_code_key"),)

    permission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    module: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class RolePermission(Base):
    """Maps public.role_permissions (Neon inspect)."""

    __tablename__ = "role_permissions"

    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roles.role_id"),
        primary_key=True,
    )
    permission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("permissions.permission_id"),
        primary_key=True,
    )


class UserRole(Base):
    """Maps public.user_roles (Neon inspect)."""

    __tablename__ = "user_roles"
    __table_args__ = (
        Index(
            "uq_active_user_role_scope",
            "user_id",
            "role_id",
            "clan_id",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
            # Migration 0002 (KI-03): NULL clan_id (system scope, e.g. SYSTEM_ADMIN) counts as
            # one value, so a duplicate active system grant is rejected. Needs PostgreSQL 15+.
            postgresql_nulls_not_distinct=True,
        ),
    )

    user_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id"),
        nullable=False,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("roles.role_id"),
        nullable=False,
    )
    clan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clans.clan_id"),
        nullable=True,
    )
    granted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id"),
        nullable=True,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class EmailOtpChallenge(Base):
    """Maps public.email_otp_challenges (migration 0007, Mốc M5-1): one e-mail OTP, hashed.

    No e-mail address, no code, no token is stored: email_hash and code_hash are HMACs keyed by
    OTP_HMAC_KEY, token_hash the SHA-256 of a random one-time token."""

    __tablename__ = "email_otp_challenges"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('MEMBER_REGISTRATION', 'BUSINESS_REGISTRATION')",
            name="email_otp_challenges_purpose_check",
        ),
        CheckConstraint("email_hash ~ '^[0-9a-f]{64}$'", name="email_otp_challenges_email_hash_check"),
        CheckConstraint("code_hash ~ '^[0-9a-f]{64}$'", name="email_otp_challenges_code_hash_check"),
        CheckConstraint(
            "token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'",
            name="email_otp_challenges_token_hash_check",
        ),
        CheckConstraint("failed_attempts >= 0", name="email_otp_challenges_failed_attempts_check"),
        UniqueConstraint("token_hash", name="email_otp_challenges_token_hash_key"),
        Index("idx_email_otp_challenges_lookup", "purpose", "email_hash", text("created_at DESC")),
    )

    challenge_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    email_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    invalidated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    token_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class GmailRegistryEntry(Base):
    """Maps public.gmail_registry (migration 0008, Mốc M5): a real Gmail registers ONCE.

    One ACTIVE row per normalized_email (partial unique index); see app.core.utils.gmail_registry."""

    __tablename__ = "gmail_registry"
    __table_args__ = (
        CheckConstraint(
            "owner_type IN ('member', 'business_registration', 'clan_owner_contact')",
            name="gmail_registry_owner_type_check",
        ),
        CheckConstraint("status IN ('active', 'released', 'duplicate')", name="gmail_registry_status_check"),
        CheckConstraint(
            "user_id IS NOT NULL OR registration_id IS NOT NULL", name="gmail_registry_owner_check"
        ),
        CheckConstraint(
            "normalized_email NOT LIKE '%@giapha.com'", name="gmail_registry_not_login_id_check"
        ),
        Index(
            "uq_gmail_registry_active_email",
            "normalized_email",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index("idx_gmail_registry_user", "user_id"),
        Index("idx_gmail_registry_registration", "registration_id"),
    )

    registry_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    normalized_email: Mapped[str] = mapped_column(String(255), nullable=False)
    original_email: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_type: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=True
    )
    registration_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("business_registrations.registration_id", ondelete="CASCADE"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'active'"))
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
