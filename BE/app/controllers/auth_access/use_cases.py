"""Auth use cases (Mốc D, Mốc M1). Use cases own the transaction.

The DB is the only way in: POST /auth/login checks credential_metadata.password_hash (bcrypt)
and POST /auth/change-password writes it. Firebase is never asked who the user is; after a
password change it is only kept in sync (best effort, after the commit).

Logging rule: only an event name, a fixed reason code and request_id. Never the bearer token,
the Firebase UID, the email or the password. Timing lines ("auth.<event> timing ...") carry step
names and milliseconds only.
"""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import math
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Awaitable, Callable, Optional, Protocol

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

if TYPE_CHECKING:
    from app.core.integrations.firebase_password_reset import PasswordResetProvider
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


# Writes ONE audit row in its own transaction (after the request's transaction has ended).
AuditWriter = Callable[..., Awaitable[None]]
# Runs a job after the response has been sent (FastAPI BackgroundTasks.add_task).
Scheduler = Callable[[Callable[[], Awaitable[object]]], None]


class _Steps:
    """Wall time of each step of one request, logged as ONE line: step names and ms only."""

    def __init__(self, event: str) -> None:
        self.event = event
        self._start = self._last = time.perf_counter()
        self._parts: list[str] = []

    def mark(self, step: str) -> None:
        now = time.perf_counter()
        self._parts.append(f"{step}={(now - self._last) * 1000:.0f}ms")
        self._last = now

    def log(self, outcome: str) -> None:
        total = (time.perf_counter() - self._start) * 1000
        logger.info(
            "auth.%s timing %s total=%.0fms outcome=%s request_id=%s",
            self.event, " ".join(self._parts), total, outcome, get_request_id(),
        )


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
    steps = _Steps("login")

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
        steps.mark("write")
        _log("login", reason.lower())
        steps.log(reason.lower())
        return error

    user = await users.get_user_by_login_identifier(ident) if ident else None
    steps.mark("lookup")
    if user is None:
        await asyncio.to_thread(verify_password, password, None)
        steps.mark("bcrypt")
        raise await failed(None, "UNKNOWN_IDENTIFIER", _authentication_failed())

    # Locked for the rest of the transaction: concurrent attempts on one account are counted one
    # after the other, so the lockout cannot be dodged by sending them in parallel. Created when
    # missing, so an account WITHOUT a credential row is counted and locked exactly like one with
    # a wrong password (an account must not stand out by never locking).
    cred = await users.lock_or_create_credential_metadata(user.user_id, now=now)
    steps.mark("lock")
    locked = _locked_error(cred, now)
    if locked is not None:
        raise await failed(user.user_id, "ACCOUNT_LOCKED", locked)

    stored_hash = cred.password_hash if cred is not None else None
    valid = await asyncio.to_thread(verify_password, password, stored_hash)
    steps.mark("bcrypt")
    if not valid:
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
    steps.mark("rules")

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
    steps.mark("write")
    _log("login", "created")
    steps.log("created")
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
    schedule: Scheduler | None = None,
    audit: AuditWriter | None = None,
) -> SessionCreateResponse:
    """DB first, in one transaction; then Firebase is kept in sync (best effort).

    The Firebase sync runs AFTER the commit, through `schedule` (the route passes
    BackgroundTasks.add_task, so the caller does not wait for up to three Firebase calls) or
    inline when no scheduler is given. A failure or timeout there never undoes or fails the
    change: it is logged (warning) and written to the audit log through `audit`.

    new_password already passed the shared policy (the Password type of the request body).
    A wrong current_password counts like a wrong login: the 5th in a row locks the account for
    15 minutes AND revokes every session (whoever holds this session is guessing the password).

    On success: password_hash, password_changed_at, must_change_password = false, temporary
    password cleared, PENDING -> ACTIVE, EVERY session revoked (this one too), and ONE new
    session is issued and returned, so the caller keeps working with the new access token.
    """
    now = now or _now()
    steps = _Steps("change_password")
    user = await users.get_user_by_id(principal.user_id)
    steps.mark("user")
    if user is None:
        raise AppError(ErrorCode.SESSION_INVALID)

    cred = await users.lock_credential_metadata(user.user_id)
    steps.mark("lock")
    locked = _locked_error(cred, now)
    if locked is not None:
        await db.commit()
        _log("change_password", "account_locked")
        steps.log("account_locked")
        raise locked

    stored_hash = cred.password_hash if cred is not None else None
    valid = await asyncio.to_thread(verify_password, current_password, stored_hash)
    steps.mark("bcrypt_verify")
    if not valid:
        locked_now = _count_wrong_password(cred, now)
        if locked_now:
            await users.revoke_all_sessions(user.user_id, reason="PASSWORD_GUESSING_LOCKOUT", now=now)
        await db.commit()
        steps.mark("db_write")
        reason = "wrong_current_password_locked_now" if locked_now else "wrong_current_password"
        _log("change_password", reason)
        steps.log(reason)
        if locked_now:
            raise _account_locked(cred.locked_until, now)
        raise AppError(ErrorCode.AUTHENTICATION_FAILED, WRONG_CURRENT_PASSWORD_MESSAGE)

    if new_password == current_password:
        raise AppError(ErrorCode.VALIDATION_ERROR, SAME_PASSWORD_MESSAGE)

    new_hash = await asyncio.to_thread(hash_password, new_password)
    steps.mark("bcrypt_hash")
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
        steps.mark("db_write")  # revoke sessions + new session + audit + commit
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error(
            "auth.change_password reason=db_failed error=%s request_id=%s",
            type(exc).__name__,
            get_request_id(),
        )
        steps.log("db_failed")
        raise AppError(ErrorCode.DATABASE_UNAVAILABLE) from None

    async def firebase_job() -> str:
        return await firebase_sync_after_commit(
            provider=provider, user_id=user.user_id, uid=user.firebase_uid, password=new_password, audit=audit
        )

    if schedule is not None:
        schedule(firebase_job)
        steps.log("done firebase=scheduled")
    else:
        outcome = await firebase_job()
        steps.mark("firebase")
        steps.log(f"done firebase={outcome}")
    _log("change_password", "done")
    return _session_response(user, token, expires_at, requires_password_change=False)


async def firebase_sync_after_commit(
    *,
    provider: IdentityProvider,
    user_id: uuid.UUID,
    uid: str | None,
    password: str,
    audit: AuditWriter | None,
) -> str:
    """The Firebase half of a password change, once the DB change is committed. Never raises.

    A failure or timeout (every SDK call is bounded by FIREBASE_CALL_TIMEOUT_SECONDS) is a
    warning plus an audit row; the reason code is the only detail kept (no password, no uid)."""
    started = time.perf_counter()
    outcome = await sync_firebase_password(provider, uid, password)
    if outcome.startswith("failed:"):
        _log("change_password", f"firebase_sync_{outcome}", level=logging.WARNING)
        if audit is not None:
            try:
                await audit(
                    action="auth.firebase_password_sync_failed",
                    user_id=user_id,
                    new_data={"reason": outcome.removeprefix("failed:")},
                )
            except Exception as exc:  # noqa: BLE001 - the change itself already succeeded
                logger.error(
                    "auth.change_password reason=firebase_sync_audit_failed error=%s request_id=%s",
                    type(exc).__name__,
                    get_request_id(),
                )
    logger.info(
        "auth.firebase_sync timing firebase=%.0fms outcome=%s request_id=%s",
        (time.perf_counter() - started) * 1000, outcome, get_request_id(),
    )
    return outcome


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


# ----- POST /auth/password-reset/confirm (Mốc M4: forgot password) -----

def reset_code_hash(oob_code: str) -> str:
    """used_password_reset_codes.code_hash of a reset code: SHA-256 hex (never the code)."""
    import hashlib

    return hashlib.sha256(oob_code.encode("utf-8")).hexdigest()


# One answer for a wrong code, a used code and a code whose e-mail has no account here: the
# caller must not learn which e-mail addresses have an account.
RESET_CODE_INVALID_MESSAGE = (
    "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng. Vui lòng yêu cầu liên kết mới."
)
RESET_CODE_EXPIRED_MESSAGE = "Liên kết đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu liên kết mới."


async def confirm_password_reset(
    *,
    db: UnitOfWork,
    users: UserAccessRepository,
    reset: "PasswordResetProvider",
    oob_code: str,
    new_password: str,
    client: ClientInfo,
    audit: AuditWriter | None = None,
    now: datetime | None = None,
    schedule: Scheduler | None = None,
) -> None:
    """The e-mail link of "forgot password" (the DB is the login source).

    Step 4 (Firebase) runs after the commit: through `schedule` (the route passes
    BackgroundTasks.add_task) or inline; transient Firebase failures are retried with backoff
    (RESET_SYNC_BACKOFF_SECONDS) before the mismatch is audited.

      1. Firebase verifies the code and names the e-mail (the code is NOT used up yet).
      2. The DB user with that e-mail (any letter case); none -> the same answer as a bad code.
      3. DB, one transaction: bcrypt hash, password_changed_at, must_change_password false,
         temporary password cleared, failed_login_count 0, locked_until NULL, EVERY session
         revoked, audit auth.password_reset_confirm. Committed FIRST.
      4. Firebase sets the same password with the code. A failure there never undoes the DB
         change (the DB is where logins are checked): warning + audit
         auth.password_reset_firebase_sync_failed, so the mismatch is on record, not silent.
    new_password already passed the shared policy (Password type). Logs never hold the code,
    the password, the e-mail or a token.
    """
    from app.core.integrations.firebase_password_reset import ResetCodeExpired, ResetCodeInvalid

    now = now or _now()
    steps = _Steps("password_reset")
    code_hash = reset_code_hash(oob_code)
    # Single use, enforced HERE (M4b), whatever Firebase does with the code afterwards: a code
    # recorded as used is refused before Firebase is even asked.
    if await users.reset_code_used(code_hash):
        steps.mark("db_check")
        steps.log("code_already_used")
        raise AppError(ErrorCode.RESET_CODE_INVALID, RESET_CODE_INVALID_MESSAGE)
    steps.mark("db_check")
    try:
        email = await reset.verify_reset_code(oob_code)
    except ResetCodeExpired:
        steps.mark("firebase_verify")
        steps.log("code_expired")
        raise AppError(ErrorCode.RESET_CODE_EXPIRED, RESET_CODE_EXPIRED_MESSAGE) from None
    except ResetCodeInvalid:
        steps.mark("firebase_verify")
        steps.log("code_invalid")
        raise AppError(ErrorCode.RESET_CODE_INVALID, RESET_CODE_INVALID_MESSAGE) from None
    except ProviderUnavailable as exc:
        _log("password_reset", f"provider_{exc.reason}", level=logging.WARNING)
        raise AppError(ErrorCode.PROVIDER_UNAVAILABLE) from None
    steps.mark("firebase_verify")

    user = await users.get_user_by_email_ci(email)
    steps.mark("lookup")
    if user is None:
        steps.log("no_db_user")
        raise AppError(ErrorCode.RESET_CODE_INVALID, RESET_CODE_INVALID_MESSAGE)

    new_hash = await asyncio.to_thread(hash_password, new_password)
    steps.mark("bcrypt_hash")
    try:
        # Claimed in the SAME transaction as the new password: both happen or neither does, and of
        # two concurrent requests with one code only the first gets here with True.
        if not await users.claim_reset_code(user.user_id, code_hash, now=now):
            await db.rollback()
            steps.log("code_already_used")
            raise AppError(ErrorCode.RESET_CODE_INVALID, RESET_CODE_INVALID_MESSAGE)
        cred = await users.lock_or_create_credential_metadata(user.user_id, now=now)
        status_before = user.status
        cred.password_hash = new_hash
        cred.password_changed_at = now
        cred.must_change_password = False
        cred.temporary_password_issued_at = None
        cred.temporary_password_expires_at = None
        cred.failed_login_count = 0
        cred.locked_until = None
        cred.updated_at = now
        user.first_login_required = False
        if user.status == "PENDING":
            user.status = "ACTIVE"  # like a password change: the owner of the address chose it
        user.updated_at = now
        revoked = await users.revoke_all_sessions(user.user_id, reason="PASSWORD_RESET", now=now)
        await users.add_audit_log(
            actor_id=user.user_id,
            action="auth.password_reset_confirm",
            entity_type="user",
            entity_id=user.user_id,
            old_data={"status": status_before},
            new_data={"status": user.status, "revoked_sessions": revoked},
            ip_address=client.ip_address,
            occurred_at=now,
        )
        await db.commit()
        steps.mark("db_write")
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error(
            "auth.password_reset reason=db_failed error=%s request_id=%s",
            type(exc).__name__,
            get_request_id(),
        )
        steps.log("db_failed")
        raise AppError(ErrorCode.DATABASE_UNAVAILABLE) from None

    async def firebase_job() -> str:
        return await sync_reset_to_firebase(
            reset=reset, oob_code=oob_code, new_password=new_password, user_id=user.user_id, audit=audit
        )

    if schedule is not None:
        schedule(firebase_job)
        steps.log("done firebase=scheduled")
    else:
        outcome = await firebase_job()
        steps.mark("firebase_confirm")
        steps.log(f"done firebase={outcome}")


# Waits between Firebase attempts after a reset (attempts = len + 1). Tests set it to (0, 0).
RESET_SYNC_BACKOFF_SECONDS: tuple[float, ...] = (0.5, 2.0)


async def sync_reset_to_firebase(
    *,
    reset: "PasswordResetProvider",
    oob_code: str,
    new_password: str,
    user_id: uuid.UUID,
    audit: AuditWriter | None,
) -> str:
    """Set the Firebase password with the reset code, AFTER the DB commit. Never raises.

    Only a transient failure (ProviderUnavailable: timeout, network, 5xx) is retried, with the
    waits of RESET_SYNC_BACKOFF_SECONDS; a refused code or password is final. A final failure is a
    warning + audit auth.password_reset_firebase_sync_failed (reason code and attempts only).
    The code cannot be reused meanwhile: used_password_reset_codes already holds its hash."""
    from app.core.integrations.firebase_password_reset import ResetCodeExpired, ResetCodeInvalid

    started = time.perf_counter()
    attempts = 0
    outcome = "updated"
    for delay in (*RESET_SYNC_BACKOFF_SECONDS, None):
        attempts += 1
        try:
            await reset.confirm_reset(oob_code, new_password)
            outcome = "updated"
            break
        except (ResetCodeExpired, ResetCodeInvalid):
            outcome = "failed:code_rejected_on_confirm"
            break
        except PasswordRejected:
            outcome = "failed:password_rejected"
            break
        except ProviderUnavailable as exc:
            outcome = f"failed:{exc.reason}"
            if delay is None:
                break
            _log("password_reset", f"firebase_retry attempt={attempts} reason={exc.reason}", level=logging.WARNING)
            await asyncio.sleep(delay)

    if outcome != "updated":
        _log("password_reset", f"firebase_sync_{outcome}", level=logging.WARNING)
        if audit is not None:
            try:
                await audit(
                    action="auth.password_reset_firebase_sync_failed",
                    user_id=user_id,
                    new_data={"reason": outcome.removeprefix("failed:"), "attempts": attempts},
                )
            except Exception as exc:  # noqa: BLE001 - the reset itself already succeeded
                logger.error(
                    "auth.password_reset reason=firebase_sync_audit_failed error=%s request_id=%s",
                    type(exc).__name__,
                    get_request_id(),
                )
    logger.info(
        "auth.password_reset_firebase timing firebase=%.0fms attempts=%d outcome=%s request_id=%s",
        (time.perf_counter() - started) * 1000, attempts, outcome, get_request_id(),
    )
    return outcome


# ----- POST /auth/password-reset/request (Mốc M4b: the app mails the link itself) -----


def email_rate_key(email: str) -> str:
    """Limiter key of a TARGET e-mail: its SHA-256, so the limiter table holds no address."""
    import hashlib

    return "email:" + hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


from app.core.integrations.email_sender import mask_email  # noqa: E402 - one masking rule


def reset_destination(user: User) -> Optional[str]:
    """Where the reset e-mail of `user` goes (Mốc M5): an Owner's login identifier (@giapha.com) is
    not a mailbox, so an Owner is mailed at users.contact_email (None when it has none); everybody
    else at the account's own e-mail. Never a @giapha.com address."""
    from app.core.utils.gmail_registry import is_login_identifier

    if is_login_identifier(user.email):
        contact = (user.contact_email or "").strip()
        return contact if contact and not is_login_identifier(contact) else None
    return user.email


async def request_password_reset(
    *, users: UserAccessRepository, email: str
) -> tuple[Optional[User], str]:
    """(the account a reset e-mail may be sent to, or None; the outcome code). The route answers
    the SAME 200 either way; the outcome only picks the background job and its audit row.
    `email` is the login e-mail / identifier (@giapha.com for an Owner) OR an Owner's contact
    Gmail (Mốc M5, through the Gmail registry).
    Outcomes: "eligible", "no_db_user", "account_not_active", "no_contact_email"."""
    from app.core.utils.gmail_registry import is_login_identifier, normalize_email

    user = await users.get_user_by_email_ci(email.strip())
    if user is None and not is_login_identifier(email):
        user = await users.get_owner_by_contact(normalize_email(email))
    if user is None:
        _log("password_reset_request", "no_db_user")
        return None, "no_db_user"
    if user.status != "ACTIVE":
        _log("password_reset_request", "account_not_active")
        return user, "account_not_active"
    if reset_destination(user) is None:
        _log("password_reset_request", "no_contact_email", level=logging.WARNING)
        return user, "no_contact_email"
    return user, "eligible"


async def record_request_outcome(
    *, audit: AuditWriter | None, action: str, user_id: uuid.UUID | None, email: str, **extra: object
) -> None:
    """One audit row for an outcome of POST /auth/password-reset/request (Mốc M3a). Background
    job: never raises. new_data holds the MASKED e-mail and reason codes only."""
    if audit is None:
        return
    try:
        await audit(action=action, user_id=user_id, new_data={"email": mask_email(email), **extra})
    except Exception as exc:  # noqa: BLE001 - the caller already got its generic answer
        logger.error("auth.password_reset_request reason=audit_failed error=%s", type(exc).__name__)


async def ensure_firebase_account(
    *, provider: IdentityProvider, firebase_uid: str | None, email: str, display_name: str
) -> str:
    """Mốc M3a: create the Firebase account of an ACTIVE DB user that has none, so the reset link
    can be made. uid = users.firebase_uid (kept as is: no DB write, and the password sync after a
    change finds it); only an app-managed `own-<uuid>` uid is created. The Firebase password is a
    random secret nobody receives: logins are checked in the DB, and the reset link replaces it.
    Returns "created", "exists" (a concurrent request created it) or "failed:<reason code>"."""
    import secrets

    from app.core.integrations.firebase import (
        ProviderEmailTaken,
        ProviderUserExists,
        UnsafeUid,
        is_own_uid,
    )

    if not firebase_uid or not is_own_uid(firebase_uid):
        return "failed:uid_not_app_managed"
    try:
        await provider.create_user(
            uid=firebase_uid, email=email, display_name=display_name, password=secrets.token_urlsafe(32)
        )
    except ProviderEmailTaken:
        return "exists"
    except ProviderUserExists:
        return "failed:uid_taken_by_other_email"
    except UnsafeUid:
        return "failed:uid_not_app_managed"
    except PasswordRejected:
        return "failed:password_rejected"
    except ProviderInvalidUser:
        return "failed:invalid_user"
    except ProviderUnavailable as exc:
        return f"failed:{exc.reason}"
    return "created"


async def send_password_reset_mail(
    *,
    provider: IdentityProvider,
    sender,
    audit: AuditWriter | None,
    user_id: uuid.UUID,
    firebase_uid: str | None,
    email: str,
    display_name: str,
    frontend_base_url: str,
    to_email: str | None = None,
) -> str:
    """Background job: Firebase (Admin SDK) makes the reset code, the app builds ITS OWN link
    {FRONTEND_BASE_URL}/reset-password?mode=resetPassword&oobCode=<code> and mails it (SMTP).
    No Firebase account for the address -> one is created first (ensure_firebase_account).
    Every outcome is audited (masked e-mail, reason codes). Never raises; never logs the link or
    the code. Returns an outcome code (tests, timing log).
    `email` is the account's (Firebase) e-mail; `to_email` where the mail goes when it differs
    (an Owner's contact Gmail, Mốc M5)."""
    to_email = to_email or email
    from urllib.parse import parse_qs, urlencode, urlparse

    from app.core.integrations.email_sender import EmailDeliveryResult
    from app.core.integrations.firebase import ProviderUserNotFound

    async def record(action: str, **extra: object) -> None:
        await record_request_outcome(audit=audit, action=action, user_id=user_id, email=email, **extra)

    async def reset_link() -> str:
        return await provider.generate_password_reset_link(email)

    try:
        try:
            firebase_link = await reset_link()
        except ProviderUserNotFound:
            created = await ensure_firebase_account(
                provider=provider, firebase_uid=firebase_uid, email=email, display_name=display_name
            )
            if created.startswith("failed:"):
                reason = created.removeprefix("failed:")
                _log("password_reset_request", f"firebase_account_not_created reason={reason}", level=logging.WARNING)
                await record("auth.password_reset_firebase_account_create_failed", reason=reason)
                return f"failed:firebase_account_{reason}"
            _log("password_reset_request", f"firebase_account_{created}")
            if created == "created":
                await record("auth.password_reset_firebase_account_created")
            firebase_link = await reset_link()
    except ProviderUserNotFound:
        _log("password_reset_request", "no_firebase_account", level=logging.WARNING)
        await record("auth.password_reset_request_no_firebase_account", reason="no_firebase_account")
        return "no_firebase_account"
    except (ProviderUnavailable, ProviderInvalidUser) as exc:
        reason = getattr(exc, "reason", "invalid_user")
        # The SDK exception as "ClassName:CODE" (never its message: it can echo the e-mail).
        error = getattr(exc, "error", None) or type(exc).__name__
        _log("password_reset_request", f"firebase_{reason} error={error}", level=logging.WARNING)
        await record("auth.password_reset_email_failed", reason=f"firebase_{reason}", error=error)
        return f"failed:firebase_{reason}"

    codes = parse_qs(urlparse(firebase_link).query).get("oobCode") or []
    if not codes or not codes[0]:
        _log("password_reset_request", "firebase_link_without_code", level=logging.WARNING)
        await record("auth.password_reset_email_failed", reason="firebase_link_without_code")
        return "failed:firebase_link_without_code"
    link = f"{frontend_base_url.rstrip('/')}/reset-password?" + urlencode(
        {"mode": "resetPassword", "oobCode": codes[0]}
    )

    try:
        result = await sender.send_password_reset_link(to_email=to_email, display_name=display_name, reset_link=link)
    except Exception as exc:  # noqa: BLE001 - a sender bug must not lose the audit row
        result = EmailDeliveryResult(status="FAILED", error=type(exc).__name__)
    if result.status != "SENT":
        error = getattr(result, "error", None) or "unknown"
        _log("password_reset_request", f"email_not_sent error={error}", level=logging.WARNING)
        await record("auth.password_reset_email_failed", reason="email_not_sent", error=error)
        return "failed:email_not_sent"
    _log("password_reset_request", "email_sent")
    await record("auth.password_reset_email_sent")
    return "sent"
