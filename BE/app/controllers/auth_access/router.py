"""Auth routes (api_contract.md section 3). Mounted under /api/v1."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.auth_access import use_cases
from app.controllers.auth_access.use_cases import ClientInfo
from app.core.integrations.firebase import IdentityProvider, get_identity_provider
from app.core.utils.openapi_responses import (
    AUTHENTICATED_RESTRICTED_OK,
    BASE,
    error_responses,
)
from app.core.middleware.rate_limit import rate_limited
from app.core.security.security_headers import NoStoreRoute
from app.db.postgres import get_db
from app.dependencies.auth import Principal, get_principal_allow_restricted, get_user_access_repo
from app.dependencies.permissions import get_family_repo
from app.models.family.repository import FamilyRepository
from app.models.user_access.repository import UserAccessRepository
from app.schemas.errors import ErrorCode
from app.schemas.auth import (
    ChangePasswordRequest,
    MeResponse,
    SessionCreateRequest,
    SessionCreateResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"], route_class=NoStoreRoute)


@router.post(
    "/session",
    status_code=201,
    response_model=SessionCreateResponse,
    dependencies=[Depends(rate_limited("session"))],
    responses=error_responses(
        ErrorCode.INVALID_ID_TOKEN,
        ErrorCode.ACCOUNT_BLOCKED,
        ErrorCode.TEMPORARY_PASSWORD_EXPIRED,
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.RATE_LIMITED,
        ErrorCode.PROVIDER_UNAVAILABLE,
        *BASE,
    ),
)
async def create_session(
    body: SessionCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    provider: IdentityProvider = Depends(get_identity_provider),
) -> SessionCreateResponse:
    return await use_cases.create_session(
        db=db,
        users=users,
        provider=provider,
        id_token=body.id_token.get_secret_value(),
        client=ClientInfo.from_request(request),
    )


from datetime import datetime, timezone, timedelta
import bcrypt
from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from app.core.config import settings
from app.core.errors import AppError
from app.core.security.tokens import generate_session_token, hash_session_token
from app.models.user_access.entities import User, CredentialMetadata
from app.schemas.auth import SessionUser


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post(
    "/login",
    status_code=200,
    response_model=SessionCreateResponse,
)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
) -> SessionCreateResponse:
    ident = body.email.strip().lower()
    stmt = (
        select(User, CredentialMetadata)
        .outerjoin(CredentialMetadata, User.user_id == CredentialMetadata.user_id)
        .where((func.lower(User.email) == ident) | (func.lower(User.username) == ident))
    )
    res = await db.execute(stmt)
    row = res.first()
    if not row:
        raise HTTPException(
            status_code=401,
            detail={"code": "AUTHENTICATION_FAILED", "message": "Email hoặc tên đăng nhập không tồn tại trong hệ thống."}
        )
    user, cred = row

    requires_password_change = bool(user.first_login_required) or bool(cred and cred.must_change_password)

    if user.status != "ACTIVE":
        if user.status == "PENDING" and requires_password_change:
            pass  # Cho phép phiên tạm thời để đổi mật khẩu lần đầu
        else:
            raise HTTPException(
                status_code=403,
                detail={"code": "ACCOUNT_BLOCKED", "message": "Tài khoản của bạn hiện đang bị khóa hoặc chưa kích hoạt."}
            )

    # Verify password if credential_metadata has password_hash
    if cred and cred.password_hash:
        try:
            valid = bcrypt.checkpw(body.password.encode("utf-8"), cred.password_hash.encode("utf-8"))
        except Exception:
            valid = False
        if not valid:
            cred.failed_login_count += 1
            await db.commit()
            raise HTTPException(
                status_code=401,
                detail={"code": "AUTHENTICATION_FAILED", "message": "Mật khẩu không chính xác."}
            )
    else:
        # Nếu chưa có password_hash trong PostgreSQL (tài khoản được cấp qua Firebase Auth):
        # Xác thực với Firebase Identity Toolkit API
        import httpx
        api_key = settings.FIREBASE_API_KEY
        authenticated = False
        if api_key:
            try:
                async with httpx.AsyncClient(timeout=10.0) as http_client:
                    fb_res = await http_client.post(
                        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}",
                        json={
                            "email": user.email,
                            "password": body.password,
                            "returnSecureToken": True,
                        },
                    )
                    if fb_res.status_code == 200:
                        authenticated = True
                        if cred:
                            hashed = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
                            cred.password_hash = hashed
            except Exception as e:
                logger.error("Firebase auth check error: %s", e)
        if not authenticated:
            raise HTTPException(
                status_code=401,
                detail={"code": "AUTHENTICATION_FAILED", "message": "Mật khẩu không chính xác."}
            )

    now = datetime.now(timezone.utc)
    token = generate_session_token()
    expires_at = now + timedelta(hours=settings.SESSION_TTL_HOURS)
    client = ClientInfo.from_request(request)

    await users.add_session(
        user_id=user.user_id,
        token_jti_hash=hash_session_token(token),
        created_at=now,
        expires_at=expires_at,
        ip_address=client.ip_address,
        user_agent=client.user_agent,
    )
    user.last_login_at = now
    if cred:
        cred.failed_login_count = 0
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

    return SessionCreateResponse(
        access_token=token,
        expires_at=expires_at,
        user=SessionUser(
            user_id=user.user_id,
            display_name=user.display_name,
            email=user.email,
            status=user.status,
        ),
        requires_password_change=cred.must_change_password if cred else False,
    )



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
    status_code=204,
    response_class=Response,
    responses=error_responses(
        *AUTHENTICATED_RESTRICTED_OK,
        ErrorCode.RECENT_LOGIN_REQUIRED,
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.PROVIDER_UNAVAILABLE,
    ),
)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    principal: Principal = Depends(get_principal_allow_restricted),
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    provider: IdentityProvider = Depends(get_identity_provider),
) -> Response:
    await use_cases.change_password(
        db=db,
        users=users,
        provider=provider,
        principal=principal,
        new_password=body.new_password.get_secret_value(),
        recent_id_token=body.recent_id_token.get_secret_value(),
        client=ClientInfo.from_request(request),
    )
    return Response(status_code=204)


import uuid
from fastapi import HTTPException
from app.core.utils.otp_service import (
    can_send_otp,
    generate_otp,
    verify_otp,
    is_email_verified,
    consume_verified_email,
    send_otp_via_email,
)


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
    otp: str | None = None


@router.post(
    "/register-send-otp",
    status_code=200,
)
async def register_send_otp(
    body: RegisterSendOtpRequest,
    users: UserAccessRepository = Depends(get_user_access_repo),
):
    email = body.email.strip().lower()
    if not email.endswith("@gmail.com"):
        raise HTTPException(
            status_code=422,
            detail={"code": "VALIDATION_ERROR", "message": "Email bắt buộc phải là địa chỉ Gmail có đuôi @gmail.com"}
        )
    existing = await users.get_user_by_email_ci(email)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "EMAIL_ALREADY_EXISTS", "message": "Địa chỉ Gmail này đã được sử dụng để đăng ký tài khoản."}
        )
    allowed, wait_sec = can_send_otp(email)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={"code": "TOO_MANY_REQUESTS", "message": f"Vui lòng đợi {wait_sec} giây trước khi yêu cầu gửi lại mã OTP."}
        )
    otp = generate_otp(email)
    delivered = send_otp_via_email(email, otp)
    if not delivered:
        raise HTTPException(
            status_code=503,
            detail={"code": "SERVICE_UNAVAILABLE", "message": "Hệ thống gửi email OTP đang bận hoặc gặp lỗi. Vui lòng thử lại sau."}
        )
    return {"message": "Mã xác thực 6 số đã được gửi tới Gmail của bạn. Vui lòng kiểm tra hộp thư."}


@router.post(
    "/register-verify-otp",
    status_code=200,
)
async def register_verify_otp(body: RegisterVerifyOtpRequest):
    email = body.email.strip().lower()
    if not email.endswith("@gmail.com"):
        raise HTTPException(
            status_code=422,
            detail={"code": "VALIDATION_ERROR", "message": "Email bắt buộc phải là địa chỉ Gmail có đuôi @gmail.com"}
        )
    success = verify_otp(email, body.otp)
    if not success:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_OTP", "message": "Mã xác thực OTP không đúng, đã quá số lần thử hoặc đã hết hạn (5 phút)."}
        )
    return {"message": "Xác thực Gmail thành công."}


@router.post(
    "/register-public",
    status_code=201,
    response_model=SessionCreateResponse,
)
async def register_public(
    body: RegisterPublicRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    provider: IdentityProvider = Depends(get_identity_provider),
) -> SessionCreateResponse:
    email = body.email.strip().lower()
    if not email.endswith("@gmail.com"):
        raise HTTPException(
            status_code=422,
            detail={"code": "VALIDATION_ERROR", "message": "Email bắt buộc phải là địa chỉ Gmail có đuôi @gmail.com"}
        )
    # Check OTP verification
    if not is_email_verified(email):
        if not body.otp or not verify_otp(email, body.otp):
            raise HTTPException(
                status_code=400,
                detail={"code": "EMAIL_NOT_VERIFIED", "message": "Địa chỉ Gmail chưa được xác thực bằng mã OTP."}
            )

    # Check unique email
    existing = await users.get_user_by_email_ci(email)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "EMAIL_ALREADY_EXISTS", "message": "Địa chỉ Gmail này đã được sử dụng."}
        )

    now = datetime.now(timezone.utc)
    user_id = uuid.uuid4()
    firebase_uid = f"usr_{uuid.uuid4().hex[:16]}"

    # Try creating user in identity provider if configured
    try:
        provider_user = await provider.create_user(
            uid=firebase_uid,
            email=email,
            display_name=body.display_name,
            password=body.password,
        )
        if provider_user and hasattr(provider_user, "uid") and provider_user.uid:
            firebase_uid = provider_user.uid
    except Exception as e:
        logger.warning("Identity provider creation skipped or failed: %s", e)

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
    cred.password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")

    # Consume the verified state
    consume_verified_email(email)

    # Issue session token
    token = generate_session_token()
    expires_at = now + timedelta(hours=settings.SESSION_TTL_HOURS)
    client = ClientInfo.from_request(request)

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

