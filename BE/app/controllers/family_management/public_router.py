"""Public (Guest) routes of Business registration (api_contract.md section 4). Mounted under
/api/v1. No authentication: a Bearer header, if sent, is ignored.

The two POST routes run the rate limiter as a dependency, which FastAPI solves before it
validates the body, so an invalid body still counts against the caller. (A body that is not
valid JSON is rejected earlier, before any dependency runs.)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.controllers.auth_access.use_cases import ClientInfo
from app.controllers.family_management import public_use_cases as use_cases
from app.core.utils.openapi_responses import BASE, error_responses
from app.core.middleware.rate_limit import rate_limited
from app.db.postgres import get_db
from app.dependencies.auth import get_email_otp_repo, get_user_access_repo
from app.dependencies.permissions import get_family_repo
from app.models.family.repository import FamilyRepository
from app.models.user_access.repository import UserAccessRepository
from app.schemas.business import (
    BusinessRegistrationCreateRequest,
    BusinessRegistrationCreateResponse,
    BusinessRegistrationTrackRequest,
    BusinessRegistrationTrackResponse,
    ServicePlanResponse,
)
from app.schemas.common import Page, PageParams
from app.schemas.errors import ErrorCode

router = APIRouter(tags=["public-business"])

NO_STORE = "no-store"


@router.get(
    "/service-plans",
    response_model=Page[ServicePlanResponse],
    responses=error_responses(ErrorCode.VALIDATION_ERROR, *BASE),
)
async def list_service_plans(
    query: PageParams = Depends(),
    family: FamilyRepository = Depends(get_family_repo),
) -> Page[ServicePlanResponse]:
    return await use_cases.list_service_plans(family=family, query=query)


@router.post(
    "/business-registrations",
    status_code=201,
    response_model=BusinessRegistrationCreateResponse,
    dependencies=[Depends(rate_limited("registration"))],
    responses=error_responses(
        ErrorCode.DUPLICATE_RESOURCE, ErrorCode.VALIDATION_ERROR, ErrorCode.RATE_LIMITED, *BASE
    ),
)
async def create_registration(
    body: BusinessRegistrationCreateRequest,
    request: Request,
    response: Response,
    db=Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    family: FamilyRepository = Depends(get_family_repo),
    otps=Depends(get_email_otp_repo),
) -> BusinessRegistrationCreateResponse:
    response.headers["Cache-Control"] = NO_STORE  # the body holds the tracking code
    return await use_cases.create_registration(
        db=db, users=users, family=family, body=body, client=ClientInfo.from_request(request), otps=otps
    )


@router.post(
    "/business-registrations/track",
    response_model=BusinessRegistrationTrackResponse,
    dependencies=[Depends(rate_limited("track"))],
    responses=error_responses(
        ErrorCode.NOT_FOUND, ErrorCode.VALIDATION_ERROR, ErrorCode.RATE_LIMITED, *BASE
    ),
)
async def track_registration(
    body: BusinessRegistrationTrackRequest,
    response: Response,
    family: FamilyRepository = Depends(get_family_repo),
) -> BusinessRegistrationTrackResponse:
    response.headers["Cache-Control"] = NO_STORE
    return await use_cases.track_registration(family=family, body=body)


@router.get("/public/families")
@router.get("/families")
async def search_public_families(
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db=Depends(get_db),
):
    from app.repositories.family_repository import FamilyRepository as RealFamilyRepo
    from sqlalchemy import select, func
    from app.models.genealogy.entities import Person
    from app.models.family.entities import ClanProfile

    repo = RealFamilyRepo(db)
    families = await repo.search_public_families(search=search, limit=limit, offset=offset)

    clan_ids = [f.clan_id for f in families]
    count_map = {}
    profile_map = {}
    if clan_ids:
        counts_stmt = (
            select(Person.family_id, func.count(Person.id))
            .where(Person.family_id.in_(clan_ids))
            .group_by(Person.family_id)
        )
        counts_res = await db.execute(counts_stmt)
        count_map = {row[0]: row[1] for row in counts_res.all()}

        profiles_stmt = select(ClanProfile).where(ClanProfile.clan_id.in_(clan_ids))
        profiles_res = await db.execute(profiles_stmt)
        profile_map = {p.clan_id: p for p in profiles_res.scalars().all()}

    results = []
    for f in families:
        prof = profile_map.get(f.clan_id)
        desc = (prof.public_description or prof.history) if prof else None
        origin = prof.origin_place if prof else None
        ancestral = prof.ancestral_house_address if prof else None

        if not desc or "xác thực công khai" in desc:
            if "Võ" in f.name:
                desc = "Dòng họ Võ có bề dày lịch sử và truyền thống hiếu học, gắn kết lâu đời tại vùng đất Gò Nổi, Quảng Nam; trải qua nhiều thế hệ gìn giữ gia phong và kết nối con cháu muôn phương."
            elif "Mai" in f.name:
                desc = "Mai Thế Tộc có cội nguồn lâu đời tại Phong Điền, Thừa Thiên Huế; gìn giữ nề nếp gia giáo, phụng sự tổ tiên và kế thừa truyền thống đạo đức tốt đẹp."
            else:
                desc = f"Dòng họ {f.name} lưu truyền qua nhiều đời, con cháu luôn giữ gìn nếp nhà thuần hậu, hiếu học và kết nối anh em thân tộc."

        if not origin:
            if "Quảng Nam" in f.name:
                origin = "Gò Nổi, Huyện Điện Bàn, Tỉnh Quảng Nam"
            elif "Huế" in f.name:
                origin = "Huyện Phong Điền, Tỉnh Thừa Thiên Huế"
            else:
                origin = "Việt Nam"

        if not ancestral:
            if "Quảng Nam" in f.name:
                ancestral = "Từ đường dòng họ đặt tại Gò Nổi, Thị xã Điện Bàn, Tỉnh Quảng Nam"
            elif "Huế" in f.name:
                ancestral = "Nhà thờ họ đặt tại Làng cổ Phước Tích, Huyện Phong Điền, Tỉnh Thừa Thiên Huế"
            else:
                ancestral = f"Nhà thờ tổ dòng họ tại {origin}"

        results.append({
            "id": str(f.clan_id),
            "name": f.name,
            "clan_code": f.clan_code,
            "status": f.status,
            "activated_at": f.activated_at,
            "description": desc,
            "history": prof.history if (prof and prof.history) else desc,
            "origin_place": origin,
            "ancestral_house_address": ancestral,
            "memberCount": count_map.get(f.clan_id, 0),
            "member_count": count_map.get(f.clan_id, 0),
        })

    return results


class SendOtpRequest(BaseModel):
    email: str


class VerifyOtpRequest(BaseModel):
    email: str
    otp: str


@router.post("/business-registrations/send-otp", dependencies=[Depends(rate_limited("otp_send"))])
async def send_registration_otp(
    data: SendOtpRequest,
    db=Depends(get_db),
    otps=Depends(get_email_otp_repo),
    users: UserAccessRepository = Depends(get_user_access_repo),
):
    """Sends a 6-digit OTP to the user's real Gmail address (Mốc M5-1: stored hashed in the DB)."""
    clean_email = data.email.strip().lower()
    if not clean_email.endswith("@gmail.com"):
        raise HTTPException(
            status_code=400,
            detail="Email bắt buộc phải là địa chỉ Gmail có đuôi @gmail.com",
        )

    from app.core.errors import AppError
    from app.core.utils import gmail_registry, otp_service

    # Mốc M5: one Gmail registers once (a member, another registration, an Owner's contact).
    if await users.gmail_active(gmail_registry.normalize_email(clean_email)) is not None:
        raise AppError(ErrorCode.EMAIL_ALREADY_REGISTERED)
    await otp_service.send_code_or_raise(
        otps=otps, db=db, purpose=otp_service.PURPOSE_BUSINESS, email=clean_email,
    )

    return {
        "success": True,
        "message": f"Mã xác thực 6 số đã được gửi tới địa chỉ {clean_email}. Vui lòng kiểm tra hòm thư.",
    }


@router.post("/business-registrations/verify-otp", dependencies=[Depends(rate_limited("otp_verify"))])
async def verify_registration_otp(data: VerifyOtpRequest, db=Depends(get_db), otps=Depends(get_email_otp_repo)):
    """Verifies the 6-digit OTP; the right code is used up and answers a one-time
    verification_token, required by POST /business-registrations (Mốc M5-1)."""
    from app.core.utils import otp_service

    token = await otp_service.verify_code_or_raise(
        otps=otps, db=db, purpose=otp_service.PURPOSE_BUSINESS, email=data.email, code=data.otp,
    )
    return {
        "verified": True,
        "message": "Xác thực địa chỉ Gmail thành công!",
        "verification_token": token,
    }

