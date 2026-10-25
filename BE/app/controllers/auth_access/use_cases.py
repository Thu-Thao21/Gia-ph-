"""Auth use cases (Mốc D, Mốc M1). Use cases own the transaction.

The DB is the only way in: POST /auth/login checks credential_metadata.password_hash (bcrypt)
and POST /auth/change-password writes it. Firebase is never asked who the user is; after a
password change it is only kept in sync (best effort, after the commit).

Logging rule: only an event name, a fixed reason code and request_id. Never the bearer token,
the Firebase UID, the email or the password.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol

from fastapi import Request
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.errors import AppError
from app.core.integrations.firebase import (
    IdentityProvider,
    PasswordRejected,
    ProviderInvalidUser,
    ProviderUnavailable,
)
from app.core.middleware.request_id import get_request_id
from app.core.security.password_hash import hash_password, verify_password
from app.core.security.tokens import generate_session_token, hash_session_token
from app.dependencies.auth import Principal, evaluate_account
from app.dependencies.permissions import is_active_owner, owner_actions, system_admin_actions
from app.models.family.repository import FamilyRepository
from app.models.user_access.entities import CredentialMetadata, User
from app.models.user_access.repository import SYSTEM_ADMIN_ROLE, UserAccessRepository
from app.schemas.auth import MembershipSummary, MeResponse, SessionCreateResponse, SessionUser
from app.schemas.errors import ErrorCode

logger = logging.getLogger("mfg.auth")

USER_AGENT_MAX_LENGTH = 512
IDENTIFIER_MAX_LENGTH = 255

# Wrong passwords in a row (login or change-password) before the account is locked, and how long.
MAX_FAILED_LOGINS = 5
LOGIN_LOCKOUT = timedelta(minutes=15)
BUSINESS_OWNER_ROLE = "BUSINESS_OWNER"
OWNER_EMAIL_DOMAIN = "@giapha.com"
OWNER_EMAIL_DOMAIN_MESSAGE = (
    "Tài khoản Trưởng tộc bắt buộc phải sử dụng email định danh @giapha.com do hệ thống cấp."
)
WRONG_CURRENT_PASSWORD_MESSAGE = "Mật khẩu hiện tại không đúng."
SAME_PASSWORD_MESSAGE = "Invalid input. Fields: new_password (must differ from the current password)."


class UnitOfWork(Protocol):
    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


@dataclass(frozen=True)
class ClientInfo:
    ip_address: str | None
    user_agent: str | None

    @classmethod
    def from_request(cls, request: Request) -> "ClientInfo":
        # Direct peer only: X-Forwarded-For is not trusted until a proxy setup is agreed.
        host = request.client.host if request.client else None
        try:
            ip = str(ipaddress.ip_address(host)) if host else None
        except ValueError:
            ip = None
        agent = request.headers.get("user-agent")
        return cls(ip, agent[:USER_AGENT_MAX_LENGTH] if agent else None)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _log(event: str, reason: str, *, level: int = logging.INFO) -> None:
    logger.log(level, "auth.%s reason=%s request_id=%s", event, reason, get_request_id())


def _authentication_failed() -> AppError:
    return AppError(ErrorCode.AUTHENTICATION_FAILED)


def _account_locked(locked_until: datetime, now: datetime) -> AppError:
    seconds = max(1, math.ceil((locked_until - now).total_seconds()))
    minutes = math.ceil(seconds / 60)
    return AppError(
        ErrorCode.ACCOUNT_LOCKED,
        f"Tài khoản tạm thời bị khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau {minutes} phút.",
        headers={"Retry-After": str(seconds)},
    )


def _locked_error(cred: CredentialMetadata | None, now: datetime) -> AppError | None:
    """ACCOUNT_LOCKED while locked_until is in the future. Once it has passed, the counter and
    the lock are cleared, so the next attempts start from zero."""
    if cred is None or cred.locked_until is None:
        return None
    if cred.locked_until > now:
        return _account_locked(cred.locked_until, now)
    cred.locked_until = None
    cred.failed_login_count = 0
    return None


def _count_wrong_password(cred: CredentialMetadata | None, now: datetime) -> bool:
    """One more wrong password. True when this one starts the lock (MAX_FAILED_LOGINS in a row)."""
    if cred is None:
        return False
    cred.failed_login_count = (cred.failed_login_count or 0) + 1
    cred.updated_at = now
    if cred.failed_login_count >= MAX_FAILED_LOGINS:
        cred.locked_until = now + LOGIN_LOCKOUT
        return True
    return False


async def _issue_session(
    users: UserAccessRepository, user: User, *, now: datetime, client: ClientInfo
) -> tuple[str, datetime]:
    """A new application session. The raw token leaves only in the response; the DB keeps its hash."""
    token = generate_session_token()
    expires_at = now + timedelta(hours=settings.SESSION_TTL_HOURS)
    await users.add_session(
        user_id=user.user_id,
        token_jti_hash=hash_session_token(token),
        created_at=now,
        expires_at=expires_at,
        ip_address=client.ip_address,
        user_agent=client.user_agent,
    )
    return token, expires_at


def _session_response(
    user: User, token: str, expires_at: datetime, requires_password_change: bool
) -> SessionCreateResponse:
    return SessionCreateResponse(
        access_token=token,
        expires_at=expires_at,
        user=SessionUser(
            user_id=user.user_id,
            display_name=user.display_name,
            email=user.email,
            status=user.status,
        ),
        requires_password_change=requires_password_change,
    )


# ----- POST /auth/login -----


async def login(
    *,
    db: UnitOfWork,
    users: UserAccessRepository,
    identifier: str,
    password: str,
    client: ClientInfo,
    now: datetime | None = None,
) -> SessionCreateResponse:
    """The password is checked against credential_metadata.password_hash (bcrypt). Firebase is
    not involved. Order (the rate limit runs before, in the route):
      user -> locked_until -> bcrypt -> account status / temporary password -> Owner e-mail rule.

    Unknown identifier, wrong password and NO hash give the same 401 AUTHENTICATION_FAILED, and
    each runs exactly one bcrypt check, so neither the answer nor its timing tells them apart.
    A missing hash is never a way in. Every attempt writes one login_history row with the
    precise failure_reason and is committed BEFORE answering (the error path would roll it back).
    """
    now = now or _now()
    ident = identifier.strip().lower()[:IDENTIFIER_MAX_LENGTH]

    async def failed(user_id: uuid.UUID | None, reason: str, error: AppError) -> AppError:
        await users.add_login_history(
            user_id=user_id,
            identifier=ident or None,
            success=False,
            failure_reason=reason,
            ip_address=client.ip_address,
            user_agent=client.user_agent,
            occurred_at=now,
        )
        await db.commit()
        _log("login", reason.lower())
        return error

    user = await users.get_user_by_login_identifier(ident) if ident else None
    if user is None:
        await asyncio.to_thread(verify_password, password, None)
        raise await failed(None, "UNKNOWN_IDENTIFIER", _authentication_failed())

    # Locked for the rest of the transaction: concurrent attempts on one account are counted one
    # after the other, so the lockout cannot be dodged by sending them in parallel. Created when
    # missing, so an account WITHOUT a credential row is counted and locked exactly like one with
    # a wrong password (an account must not stand out by never locking).
    cred = await users.lock_or_create_credential_metadata(user.user_id, now=now)
    locked = _locked_error(cred, now)
    if locked is not None:
        raise await failed(user.user_id, "ACCOUNT_LOCKED", locked)

    stored_hash = cred.password_hash if cred is not None else None
    if not await asyncio.to_thread(verify_password, password, stored_hash):
        reason = "WRONG_PASSWORD" if stored_hash else "NO_PASSWORD_HASH"
        if _count_wrong_password(cred, now):
            reason += "_LOCKED_NOW"
        raise await failed(user.user_id, reason, _authentication_failed())

    async def load_cred():
        return cred

    # Same account rules as every later request (blocked status, expired temporary password,
    # PENDING only with a restricted session). The password was checked just now, so nothing
    # issued before a password change can be in play: a password_changed_at in the future
    # (clock skew) is refused like a wrong password.
    try:
        requires_password_change = await evaluate_account(
            user, load_cred, now=now, issued_at=now, stale_error=_authentication_failed
        )
    except AppError as exc:
        raise await failed(user.user_id, exc.code.value, exc) from None

    role_codes = {code for code, _ in await users.list_active_role_grants(user.user_id)}
    if (
        BUSINESS_OWNER_ROLE in role_codes
        and SYSTEM_ADMIN_ROLE not in role_codes
        and not user.email.lower().endswith(OWNER_EMAIL_DOMAIN)
    ):
        raise await failed(
            user.user_id,
            "OWNER_EMAIL_DOMAIN_REQUIRED",
            AppError(ErrorCode.FORBIDDEN, OWNER_EMAIL_DOMAIN_MESSAGE),
        )

    if cred is not None:
        cred.failed_login_count = 0
        cred.locked_until = None
        cred.updated_at = now
    token, expires_at = await _issue_session(users, user, now=now, client=client)
    user.last_login_at = now
    await users.add_login_history(
        user_id=user.user_id,
        identifier=ident,
        success=True,
        failure_reason=None,
        ip_address=client.ip_address,
        user_agent=client.user_agent,
        occurred_at=now,
    )
    await db.commit()
    _log("login", "created")
    return _session_response(user, token, expires_at, requires_password_change)


# ----- GET /auth/me -----


async def build_membership_summaries(
    *,
    users: UserAccessRepository,
    family: FamilyRepository,
    user_id: uuid.UUID,
    grants: list[tuple[str, uuid.UUID | None]],
) -> list[MembershipSummary]:
    """One summary per non-revoked membership of the user (GET /auth/me and
    GET /admin/users/{id}). permissions[] is PROVISIONAL (api_contract.md section 6)."""
    memberships: list[MembershipSummary] = []
    for membership, clan in await family.list_memberships_with_clans(user_id):
        permissions: set[str] = set()
        # Nothing is effective unless both the membership and the clan are ACTIVE,
        # mirroring authorize().
        if membership.status == "ACTIVE" and clan.status == "ACTIVE":
            if await is_active_owner(user_id, clan.clan_id, users, family):
                permissions.update(owner_actions())
            permissions.update(await family.list_fa_permission_codes(clan.clan_id, user_id))
        memberships.append(
            MembershipSummary(
                clan_id=clan.clan_id,
                clan_name=clan.name,
                clan_status=clan.status,
                membership_status=membership.status,
                roles=sorted({code for code, cid in grants if cid == clan.clan_id}),
                permissions=sorted(permissions),
            )
        )
    return memberships


async def get_me(
    *, users: UserAccessRepository, family: FamilyRepository, principal: Principal
) -> MeResponse:
    """permissions[] is PROVISIONAL (api_contract.md section 6): SA/BO get policy action
    codes, FA gets the codes stored in family_admin_permissions."""
    user = await users.get_user_by_id(principal.user_id)
    if user is None:
        raise AppError(ErrorCode.SESSION_INVALID)

    grants = await users.list_active_role_grants(user.user_id)
    is_system_admin = any(code == SYSTEM_ADMIN_ROLE and clan is None for code, clan in grants)
    memberships = await build_membership_summaries(
        users=users, family=family, user_id=user.user_id, grants=grants
    )

    return MeResponse(
        user_id=user.user_id,
        display_name=user.display_name,
        email=user.email,
        username=user.username,
        status=user.status,
        memberships=memberships,
        permissions=system_admin_actions() if is_system_admin else [],
        requires_password_change=principal.requires_password_change,
    )


# ----- POST /auth/logout -----


async def logout(
    *, db: UnitOfWork, users: UserAccessRepository, principal: Principal, now: datetime | None = None
) -> None:
    await users.revoke_session(principal.session_id, reason="LOGOUT", now=now or _now())
    await db.commit()
    _log("logout", "revoked")


# ----- POST /auth/change-password -----


async def change_password(
    *,
    db: UnitOfWork,
    users: UserAccessRepository,
    provider: IdentityProvider,
    principal: Principal,
    current_password: str,
    new_password: str,
    client: ClientInfo,
    now: datetime | None = None,
) -> SessionCreateResponse:
    """DB first, in one transaction; then Firebase is kept in sync (best effort).

    new_password already passed the shared policy (the Password type of the request body).
    A wrong current_password counts like a wrong login: the 5th in a row locks the account for
    15 minutes AND revokes every session (whoever holds this session is guessing the password).

    On success: password_hash, password_changed_at, must_change_password = false, temporary
    password cleared, PENDING -> ACTIVE, EVERY session revoked (this one too), and ONE new
    session is issued and returned, so the caller keeps working with the new access token.
    """
    now = now or _now()
    user = await users.get_user_by_id(principal.user_id)
    if user is None:
        raise AppError(ErrorCode.SESSION_INVALID)

    cred = await users.lock_credential_metadata(user.user_id)
    locked = _locked_error(cred, now)
    if locked is not None:
        await db.commit()
        _log("change_password", "account_locked")
        raise locked

    stored_hash = cred.password_hash if cred is not None else None
    if not await asyncio.to_thread(verify_password, current_password, stored_hash):
        locked_now = _count_wrong_password(cred, now)
        if locked_now:
            await users.revoke_all_sessions(user.user_id, reason="PASSWORD_GUESSING_LOCKOUT", now=now)
        await db.commit()
        _log("change_password", "wrong_current_password_locked_now" if locked_now else "wrong_current_password")
        if locked_now:
            raise _account_locked(cred.locked_until, now)
        raise AppError(ErrorCode.AUTHENTICATION_FAILED, WRONG_CURRENT_PASSWORD_MESSAGE)

    if new_password == current_password:
        raise AppError(ErrorCode.VALIDATION_ERROR, SAME_PASSWORD_MESSAGE)

    new_hash = await asyncio.to_thread(hash_password, new_password)
    try:
        status_before = user.status
        cred.password_hash = new_hash
        cred.must_change_password = False
        cred.temporary_password_issued_at = None
        cred.temporary_password_expires_at = None
        cred.password_changed_at = now
        cred.failed_login_count = 0
        cred.locked_until = None
        cred.updated_at = now
        user.first_login_required = False
        if user.status == "PENDING":
            # User ACCOUNT status only. Business/clan activation is a separate rule (D03).
            user.status = "ACTIVE"
        user.updated_at = now
        revoked = await users.revoke_all_sessions(user.user_id, reason="PASSWORD_CHANGED", now=now)
        # created_at == password_changed_at: not "before the change", so this session stays valid.
        token, expires_at = await _issue_session(users, user, now=now, client=client)
        await users.add_audit_log(
            actor_id=user.user_id,
            action="auth.password_changed",
            entity_type="user",
            entity_id=user.user_id,
            old_data={"status": status_before},
            new_data={"status": user.status, "revoked_sessions": revoked},
            ip_address=client.ip_address,
            occurred_at=now,
        )
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error(
            "auth.change_password reason=db_failed error=%s request_id=%s",
            type(exc).__name__,
            get_request_id(),
        )
        raise AppError(ErrorCode.DATABASE_UNAVAILABLE) from None

    outcome = await sync_firebase_password(provider, user.firebase_uid, new_password)
    if outcome.startswith("failed:"):
        _log("change_password", f"firebase_sync_{outcome}", level=logging.WARNING)
    _log("change_password", f"done firebase={outcome}")
    return _session_response(user, token, expires_at, requires_password_change=False)


async def sync_firebase_password(provider: IdentityProvider, uid: str | None, password: str) -> str:
    """Keep the Firebase password equal to the DB one (Admin SDK update_user + refresh-token
    revocation). Never raises; never blocks the DB change, which is already committed.

    Returns "updated", "no_uid", "no_account" (Mốc M2 creates those) or "failed:<reason code>".
    """
    if not uid:
        return "no_uid"
    try:
        if await provider.get_user(uid) is None:
            return "no_account"
        await provider.set_password(uid, password)
    except ProviderUnavailable as exc:
        return f"failed:{exc.reason}"
    except PasswordRejected:
        return "failed:password_rejected"
    except ProviderInvalidUser:
        return "failed:invalid_user"
    return "updated"
