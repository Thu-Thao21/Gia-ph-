"""Auth routes (api_contract.md section 3). Mounted under /api/v1.

One way in: POST /auth/login (password checked in the DB, Mốc M1). There is no Firebase
ID-token exchange any more; Firebase is only kept in sync after a password change.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.auth_access import use_cases
from app.controllers.auth_access.use_cases import ClientInfo
from app.core.config import settings
from app.core.errors import AppError
from app.core.integrations.firebase import (
    IdentityProvider,
    ProviderEmailTaken,
    get_identity_provider,
    own_uid,
)
from app.core.errors.db_errors import constraint_name
from app.core.middleware.rate_limit import rate_limited
from app.core.security.password_hash import check_password_policy, hash_password
from app.core.security.security_headers import NoStoreRoute
from app.core.security.tokens import generate_session_token, hash_session_token
from app.core.utils.openapi_responses import (
    AUTHENTICATED_RESTRICTED_OK,
    BASE,
    error_responses,
)
from app.db.postgres import async_session_maker, get_db
from app.dependencies.auth import Principal, get_principal_allow_restricted, get_user_access_repo
from app.dependencies.permissions import get_family_repo
from app.models.family.repository import FamilyRepository
from app.models.user_access.repository import UserAccessRepository
from app.core.integrations.firebase_password_reset import (
    PasswordResetProvider,
    get_password_reset_provider,
)
from app.core.integrations.email_sender import EmailSender, get_email_sender
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetRequestAccepted,
    MeResponse,
    SessionCreateResponse,
    SessionUser,
)
from app.schemas.errors import ErrorCode

logger = logging.getLogger("mfg.auth")

router = APIRouter(prefix="/auth", tags=["auth"], route_class=NoStoreRoute)


async def _write_audit_row(*, action: str, user_id, new_data: dict) -> None:
    """One audit row in its OWN session: the request's transaction has ended by then."""
    async with async_session_maker() as session:
        await UserAccessRepository(session).add_audit_log(
            actor_id=user_id,
            action=action,
            entity_type="user",
            entity_id=user_id,
            old_data=None,
            new_data=new_data,
            ip_address=None,
            occurred_at=datetime.now(timezone.utc),
        )
        await session.commit()


def get_audit_writer() -> use_cases.AuditWriter:
    """Dependency (tests replace it): where the after-commit Firebase sync writes its audit row."""
    return _write_audit_row


@router.post(
    "/login",
    status_code=200,
    response_model=SessionCreateResponse,
    dependencies=[Depends(rate_limited("login"))],
    responses=error_responses(
        ErrorCode.AUTHENTICATION_FAILED,
        ErrorCode.ACCOUNT_LOCKED,
        ErrorCode.ACCOUNT_BLOCKED,
        ErrorCode.TEMPORARY_PASSWORD_EXPIRED,
        ErrorCode.FORBIDDEN,
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.RATE_LIMITED,
        *BASE,
    ),
)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
) -> SessionCreateResponse:
    return await use_cases.login(
        db=db,
        users=users,
        identifier=body.email,
        password=body.password.get_secret_value(),
        client=ClientInfo.from_request(request),
    )


PASSWORD_RESET_REQUESTED_MESSAGE = (
    "Nếu địa chỉ email này có tài khoản trong hệ thống, một liên kết đặt lại mật khẩu đã được gửi "
    "đến hộp thư. Vui lòng kiểm tra cả thư mục Spam/Quảng cáo. Liên kết chỉ dùng được một lần."
)


@router.post(
    "/password-reset/request",
    status_code=200,
    response_model=PasswordResetRequestAccepted,
    dependencies=[Depends(rate_limited("password_reset_request"))],
    responses=error_responses(ErrorCode.VALIDATION_ERROR, ErrorCode.RATE_LIMITED, *BASE),
)
async def request_password_reset(
    body: PasswordResetRequest,
    request: Request,
    background: BackgroundTasks,
    users: UserAccessRepository = Depends(get_user_access_repo),
    provider: IdentityProvider = Depends(get_identity_provider),
    sender: EmailSender = Depends(get_email_sender),
    audit: use_cases.AuditWriter = Depends(get_audit_writer),
) -> PasswordResetRequestAccepted:
    """Forgot password, step 1 (Mốc M4b): the app mails its own reset link (no Firebase template).

    ALWAYS the same 200 and body, whether the e-mail has an account or not (no enumeration). The
    slow part (Firebase link + SMTP) runs after the response, so the answer time does not tell
    either. Limits: per caller address (429) and per target e-mail (silently nothing sent).
    Every outcome writes one audit row after the response (Mốc M3a), the e-mail masked."""
    user, outcome = await use_cases.request_password_reset(users=users, email=body.email)
    email_ok = request.app.state.rate_limiters.allow_key(
        "password_reset_request_email", use_cases.email_rate_key(body.email)
    )
    if outcome == "eligible" and not email_ok:
        logger.info("auth.password_reset_request reason=email_rate_limited")
        outcome = "email_rate_limited"
    user_id = user.user_id if user is not None else None
    if outcome == "eligible":
        firebase_uid, address, name = user.firebase_uid, user.email, user.display_name
        destination = use_cases.reset_destination(user)  # an Owner: users.contact_email (Mốc M5)

        async def mail_job() -> str:
            return await use_cases.send_password_reset_mail(
                provider=provider, sender=sender, audit=audit, user_id=user_id,
                firebase_uid=firebase_uid, email=address, display_name=name,
                frontend_base_url=settings.FRONTEND_BASE_URL, to_email=destination,
            )

        background.add_task(mail_job)
    else:
        background.add_task(
            use_cases.record_request_outcome,
            audit=audit,
            action=f"auth.password_reset_{outcome}",
            user_id=user_id,
            email=body.email,
        )
    return PasswordResetRequestAccepted(message=PASSWORD_RESET_REQUESTED_MESSAGE)


@router.post(
    "/password-reset/confirm",
    status_code=204,
    response_class=Response,
    dependencies=[Depends(rate_limited("password_reset"))],
    responses=error_responses(
        ErrorCode.RESET_CODE_INVALID,
        ErrorCode.RESET_CODE_EXPIRED,
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.RATE_LIMITED,
        ErrorCode.PROVIDER_UNAVAILABLE,
        *BASE,
    ),
)
async def confirm_password_reset(
    body: PasswordResetConfirmRequest,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    reset: PasswordResetProvider = Depends(get_password_reset_provider),
    audit: use_cases.AuditWriter = Depends(get_audit_writer),
) -> Response:
    """Forgot password (Mốc M4): the code from the Firebase e-mail link + the new password.

    Public. Two limits per caller address: every call ("password_reset"), and the wrong or
    expired codes only ("password_reset_failures", checked before, counted after a failure)."""
    limiters = request.app.state.rate_limiters
    limiters.peek("password_reset_failures", request)
    try:
        await use_cases.confirm_password_reset(
            db=db,
            users=users,
            reset=reset,
            oob_code=body.oob_code.get_secret_value(),
            new_password=body.new_password.get_secret_value(),
            client=ClientInfo.from_request(request),
            audit=audit,
            schedule=background.add_task,
        )
    except AppError as exc:
        if exc.code in (ErrorCode.RESET_CODE_INVALID, ErrorCode.RESET_CODE_EXPIRED):
            limiters.record("password_reset_failures", request)
        raise
    return Response(status_code=204)


# The three routes below are the ONLY ones using get_principal_allow_restricted.


@router.get(
    "/me", response_model=MeResponse, responses=error_responses(*AUTHENTICATED_RESTRICTED_OK)
)
async def me(
    principal: Principal = Depends(get_principal_allow_restricted),
    users: UserAccessRepository = Depends(get_user_access_repo),
    family: FamilyRepository = Depends(get_family_repo),
) -> MeResponse:
    return await use_cases.get_me(users=users, family=family, principal=principal)


@router.post(
    "/logout",
    status_code=204,
    response_class=Response,
    responses=error_responses(*AUTHENTICATED_RESTRICTED_OK),
)
async def logout(
    principal: Principal = Depends(get_principal_allow_restricted),
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
) -> Response:
    await use_cases.logout(db=db, users=users, principal=principal)
    return Response(status_code=204)


@router.post(
    "/change-password",
    status_code=200,
    response_model=SessionCreateResponse,
    responses=error_responses(
        *AUTHENTICATED_RESTRICTED_OK,
        ErrorCode.AUTHENTICATION_FAILED,
        ErrorCode.ACCOUNT_LOCKED,
        ErrorCode.VALIDATION_ERROR,
    ),
)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    background: BackgroundTasks,
    principal: Principal = Depends(get_principal_allow_restricted),
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    provider: IdentityProvider = Depends(get_identity_provider),
    audit: use_cases.AuditWriter = Depends(get_audit_writer),
) -> SessionCreateResponse:
    """Every session of the user is revoked; the response carries the ONE new session.
    Firebase is synced after the response is sent (background), see use_cases.change_password."""
    return await use_cases.change_password(
        db=db,
        users=users,
        provider=provider,
        principal=principal,
        current_password=body.current_password.get_secret_value(),
        new_password=body.new_password.get_secret_value(),
        client=ClientInfo.from_request(request),
        schedule=background.add_task,
        audit=audit,
    )


import uuid
from app.core.utils import otp_service
from app.core.utils import gmail_registry
from app.dependencies.auth import get_email_otp_repo


class RegisterSendOtpRequest(BaseModel):
    email: str


class RegisterVerifyOtpRequest(BaseModel):
    email: str
    otp: str


class RegisterPublicRequest(BaseModel):
    email: str
    password: str
    display_name: str
    username: str | None = None
    phone: str | None = None
    # The one-time token returned by POST /auth/register-verify-otp for THIS e-mail (Mốc M5-1).
    verification_token: str | None = None


def _verification_error(status: str) -> AppError:
    """register-public refused for its verification token (Mốc M3b): one code per reason."""
    if status == "expired":
        return AppError(
            ErrorCode.VERIFICATION_EXPIRED,
            details={"verification_ttl_seconds": settings.OTP_VERIFIED_TOKEN_TTL_SECONDS},
        )
    if status == "used":
        return AppError(ErrorCode.VERIFICATION_USED)
    return AppError(ErrorCode.EMAIL_NOT_VERIFIED)


@router.post(
    "/register-send-otp",
    status_code=200,
    dependencies=[Depends(rate_limited("otp_send"))],
)
async def register_send_otp(
    body: RegisterSendOtpRequest,
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    otps=Depends(get_email_otp_repo),
):
    email = body.email.strip().lower()
    if not email.endswith("@gmail.com"):
        raise HTTPException(
            status_code=422,
            detail={"code": "VALIDATION_ERROR", "message": "Email bắt buộc phải là địa chỉ Gmail có đuôi @gmail.com"}
        )
    if (
        await users.get_user_by_email_ci(email) is not None
        or await users.gmail_active(gmail_registry.normalize_email(email)) is not None
    ):
        raise AppError(ErrorCode.EMAIL_ALREADY_REGISTERED)  # no code is sent for a taken Gmail
    await otp_service.send_code_or_raise(
        otps=otps, db=db, purpose=otp_service.PURPOSE_MEMBER, email=email
    )
    return {"message": "Mã xác thực 6 số đã được gửi tới Gmail của bạn. Vui lòng kiểm tra hộp thư."}


@router.post(
    "/register-verify-otp",
    status_code=200,
    dependencies=[Depends(rate_limited("otp_verify"))],
)
async def register_verify_otp(
    body: RegisterVerifyOtpRequest,
    db: AsyncSession = Depends(get_db),
    otps=Depends(get_email_otp_repo),
):
    """The right code is used up and answers a one-time verification_token (Mốc M5-1): POST
    /auth/register-public creates the account only with it."""
    email = body.email.strip().lower()
    if not email.endswith("@gmail.com"):
        raise HTTPException(
            status_code=422,
            detail={"code": "VALIDATION_ERROR", "message": "Email bắt buộc phải là địa chỉ Gmail có đuôi @gmail.com"}
        )
    token = await otp_service.verify_code_or_raise(
        otps=otps, db=db, purpose=otp_service.PURPOSE_MEMBER, email=email, code=body.otp,
    )
    return {"message": "Xác thực Gmail thành công.", "verification_token": token}


@router.post(
    "/register-public",
    status_code=201,
    response_model=SessionCreateResponse,
    dependencies=[Depends(rate_limited("register_public"))],
)
async def register_public(
    body: RegisterPublicRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    provider: IdentityProvider = Depends(get_identity_provider),
    otps=Depends(get_email_otp_repo),
) -> SessionCreateResponse:
    email = body.email.strip().lower()
    if not email.endswith("@gmail.com"):
        raise HTTPException(
            status_code=422,
            detail={"code": "VALIDATION_ERROR", "message": "Email bắt buộc phải là địa chỉ Gmail có đuôi @gmail.com"}
        )
    # Mốc M5-1: only with the one-time token of a verified code for THIS e-mail. Read first (no
    # side effect yet); claimed for real in the transaction that creates the account.
    try:
        status = await otp_service.verification_status(
            otps=otps, purpose=otp_service.PURPOSE_MEMBER, email=email, token=body.verification_token
        )
    except otp_service.OtpUnavailable:
        raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, otp_service.OTP_UNAVAILABLE_MESSAGE) from None
    if status != "ok":
        raise _verification_error(status)

    client = ClientInfo.from_request(request)
    # A Gmail registers ONCE: the DB is checked BEFORE Firebase, so the answer is early and the
    # same as when Firebase says the address is taken.
    if await users.get_user_by_email_ci(email) is not None:
        await _email_taken(db, users, email=email, source="db", client=client)
    # Mốc M5: the Gmail registry (a Business representative, an Owner's contact, an alias of a member).
    if await users.gmail_active(gmail_registry.normalize_email(email)) is not None:
        await _email_taken(db, users, email=email, source="registry", client=client)

    try:
        check_password_policy(body.password)
    except ValueError:
        raise AppError(ErrorCode.VALIDATION_ERROR, "Invalid input. Fields: password (password policy).") from None

    now = datetime.now(timezone.utc)
    user_id = uuid.uuid4()
    # own-<uuid>: the only uid shape the adapter creates (and may delete again on a failure below).
    firebase_uid = own_uid(user_id)

    # Firebase FIRST and mandatory (S-6): if it fails, no DB user is created at all. Never log
    # the exception text (it can echo the e-mail); the class name only.
    try:
        provider_user = await provider.create_user(
            uid=firebase_uid,
            email=email,
            display_name=body.display_name,
            password=body.password,
        )
    except ProviderEmailTaken:
        # A Firebase account with this Gmail but no DB user (an orphan from an earlier test or a
        # Google sign-in). It is NOT taken over, deleted or given a new password: 409, and the
        # person logs in or resets the password. (Decision pending with the team lead.)
        logger.info("auth.register_public reason=firebase_email_taken")
        await _email_taken(db, users, email=email, source="firebase", client=client)
    except Exception as exc:  # noqa: BLE001 - network, permissions, configuration: 503
        logger.warning("auth.register_public reason=firebase_create_failed error=%s", type(exc).__name__)
        raise AppError(ErrorCode.PROVIDER_UNAVAILABLE) from None
    firebase_uid = provider_user.uid

    try:
        # The token is used up in THIS transaction: of two requests with one token only one gets
        # here with True; on a rollback the token stays usable.
        if not await otp_service.claim_token(
            otps=otps, purpose=otp_service.PURPOSE_MEMBER, email=email, token=body.verification_token
        ):
            await db.rollback()
            await _delete_firebase_user_quietly(provider, firebase_uid)
            raise _verification_error("used")  # a concurrent request used it first
        # Create user in PostgreSQL
        user = await users.create_user_account(
            user_id=user_id,
            firebase_uid=firebase_uid,
            email=body.email.strip(),
            display_name=body.display_name.strip(),
            phone=body.phone,
            status="ACTIVE",
            first_login_required=False,
            now=now,
        )
        user.email_verified = True
        if body.username:
            user.username = body.username.strip()

        cred = await users.add_credential_metadata(user_id, now=now)
        cred.must_change_password = False
        cred.password_hash = await asyncio.to_thread(hash_password, body.password)  # off the event loop
        # The Gmail registry row, in THIS transaction: of two concurrent registrations of one Gmail
        # (or of its aliases) only one inserts it; the other is rolled back with nothing left.
        if not await users.gmail_claim(
            normalized_email=gmail_registry.normalize_email(email), original_email=email,
            owner_type=gmail_registry.MEMBER, user_id=user_id, registration_id=None, now=now,
        ):
            await db.rollback()
            await _delete_firebase_user_quietly(provider, firebase_uid)
            await _email_taken(db, users, email=email, source="registry", client=client)
        cred.password_changed_at = now

        # Issue session token
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
        user.last_login_at = now
        await users.add_login_history(
            user_id=user.user_id,
            identifier=user.email,
            success=True,
            failure_reason=None,
            ip_address=client.ip_address,
            user_agent=client.user_agent,
            occurred_at=now,
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        await _delete_firebase_user_quietly(provider, firebase_uid)  # the one THIS request created
        if constraint_name(exc) in USER_EMAIL_CONSTRAINTS:  # a concurrent registration won
            await _email_taken(db, users, email=email, source="db", client=client)
        logger.error("auth.register_public reason=db_integrity error=%s", type(exc).__name__)
        raise AppError(ErrorCode.DATABASE_UNAVAILABLE) from None
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error("auth.register_public reason=db_failed error=%s", type(exc).__name__)
        await _delete_firebase_user_quietly(provider, firebase_uid)
        raise AppError(ErrorCode.DATABASE_UNAVAILABLE) from None

    return SessionCreateResponse(
        access_token=token,
        expires_at=expires_at,
        user=SessionUser(
            user_id=user.user_id,
            display_name=user.display_name,
            email=user.email,
            status=user.status,
        ),
        requires_password_change=False,
    )



async def _delete_firebase_user_quietly(provider: IdentityProvider, firebase_uid: str) -> None:
    """Undo the Firebase user of a registration that did not get its DB row."""
    try:
        await provider.delete_user(firebase_uid)
    except Exception as cleanup_exc:  # noqa: BLE001
        logger.error("auth.register_public reason=firebase_cleanup_failed error=%s", type(cleanup_exc).__name__)


USER_EMAIL_CONSTRAINTS = ("users_email_key", "uq_users_email_lower")


async def _email_taken(db, users: UserAccessRepository, *, email: str, source: str, client: ClientInfo):
    """409 after one audit row auth.register_public_email_taken (masked e-mail; source "db",
    "registry" or "firebase"). "db" / "registry": EMAIL_ALREADY_REGISTERED (log in or reset the
    password; the registry may hold it for a Business representative or an Owner). source
    "firebase", an orphan Firebase account with no DB user: EMAIL_ACCOUNT_NEEDS_ADMIN, since
    neither login nor password reset works without a DB user. Nothing else about the account.
    A failing audit write never changes the answer."""
    from app.core.integrations.email_sender import mask_email

    try:
        await users.add_audit_log(
            actor_id=None,
            action="auth.register_public_email_taken",
            entity_type="user",
            entity_id=None,
            old_data=None,
            new_data={"email": mask_email(email), "source": source},
            ip_address=client.ip_address,
            occurred_at=datetime.now(timezone.utc),
        )
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.error("auth.register_public reason=audit_failed error=%s", type(exc).__name__)
    if source == "firebase":
        raise AppError(ErrorCode.EMAIL_ACCOUNT_NEEDS_ADMIN)
    raise AppError(ErrorCode.EMAIL_ALREADY_REGISTERED)
