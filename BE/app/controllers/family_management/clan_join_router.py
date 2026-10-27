from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.family_management import clan_join_use_cases as use_cases
from app.db.postgres import get_db
from app.dependencies.auth import (
    Principal,
    get_principal,
    get_user_access_repo,
    resolve_principal,
    _bearer,
    HTTPAuthorizationCredentials,
)
from app.models.family.entities import ClanJoinRequest, Clan, ClanMembership, ClanProfile
from app.models.user_access.entities import UserRole, Role
from app.models.user_access.repository import UserAccessRepository
from app.schemas.clan_join import (
    ClanJoinRequestCreate,
    ClanJoinRequestResponse,
    ClanJoinRequestSupplement,
    ClanJoinReviewAction,
    MyClansSummary,
    PublicClanSearchItem,
)

router = APIRouter(tags=["clan-join"])


async def get_optional_principal(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    repo: UserAccessRepository = Depends(get_user_access_repo),
) -> Optional[Principal]:
    if not credentials or not credentials.credentials:
        return None
    try:
        return await resolve_principal(credentials.credentials.strip(), repo)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 1. Tra cứu dòng họ công khai
# ---------------------------------------------------------------------------
@router.get("/clans/search-public", response_model=List[PublicClanSearchItem])
async def search_public_clans(
    q: Optional[str] = Query(None, description="Tìm kiếm theo tên hoặc mã dòng tộc"),
    limit: int = Query(50, ge=1, le=100),
    principal: Optional[Principal] = Depends(get_optional_principal),
    db: AsyncSession = Depends(get_db),
):
    """Tìm kiếm dòng họ công khai để người dùng nộp yêu cầu gia nhập."""
    user_id = principal.user_id if principal else None
    return await use_cases.search_public_clans(db=db, user_id=user_id, query=q, limit=limit)


# ---------------------------------------------------------------------------
# 2. Thành viên: Tạo yêu cầu gia nhập
# ---------------------------------------------------------------------------
@router.post("/my-clans/join-requests", response_model=ClanJoinRequestResponse)
async def create_join_request(
    body: ClanJoinRequestCreate,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Tạo yêu cầu gia nhập dòng tộc thứ hai (hoặc dòng tộc mới) với nhãn Bên nội/Bên ngoại."""
    req = await use_cases.create_clan_join_request(db=db, principal=principal, body=body)
    return await use_cases.format_request_response(db, req)


# ---------------------------------------------------------------------------
# 3. Thành viên: Danh sách & chi tiết yêu cầu của tôi
# ---------------------------------------------------------------------------
@router.get("/my-clans/join-requests", response_model=List[ClanJoinRequestResponse])
async def list_my_join_requests(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Xem danh sách các yêu cầu gia nhập do chính tài khoản gửi."""
    stmt = (
        select(ClanJoinRequest)
        .where(ClanJoinRequest.user_id == principal.user_id)
        .order_by(ClanJoinRequest.created_at.desc())
    )
    reqs = (await db.execute(stmt)).scalars().all()
    results = []
    for r in reqs:
        results.append(await use_cases.format_request_response(db, r))
    return results


@router.get("/my-clans/join-requests/{request_id}", response_model=ClanJoinRequestResponse)
async def get_my_join_request_detail(
    request_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Xem chi tiết một yêu cầu gia nhập của bản thân."""
    stmt = select(ClanJoinRequest).where(ClanJoinRequest.request_id == request_id)
    req = (await db.execute(stmt)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu gia nhập.")
    if req.user_id != principal.user_id:
        raise HTTPException(status_code=403, detail="Bạn không thể xem yêu cầu của tài khoản khác.")
    return await use_cases.format_request_response(db, req)


# ---------------------------------------------------------------------------
# 4. Thành viên: Bổ sung thông tin (khi NEED_INFO) & Hủy yêu cầu
# ---------------------------------------------------------------------------
@router.put("/my-clans/join-requests/{request_id}/supplement", response_model=ClanJoinRequestResponse)
async def supplement_join_request(
    request_id: uuid.UUID,
    body: ClanJoinRequestSupplement,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Người gửi bổ sung thông tin giải trình theo yêu cầu của người duyệt và gửi lại (NEED_INFO -> PENDING)."""
    req = await use_cases.supplement_clan_join_request(
        db=db, principal=principal, request_id=request_id, body=body
    )
    return await use_cases.format_request_response(db, req)


@router.post("/my-clans/join-requests/{request_id}/cancel", response_model=ClanJoinRequestResponse)
async def cancel_join_request(
    request_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Người gửi tự hủy yêu cầu gia nhập của mình."""
    req = await use_cases.cancel_clan_join_request(db=db, principal=principal, request_id=request_id)
    return await use_cases.format_request_response(db, req)


# ---------------------------------------------------------------------------
# 5. Màn hình "Dòng tộc của tôi" tổng hợp
# ---------------------------------------------------------------------------
@router.get("/my-clans/summary", response_model=MyClansSummary)
async def get_my_clans_summary(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Trả về toàn bộ dữ liệu phục vụ màn hình 'Dòng tộc của tôi': các dòng họ đã tham gia và các yêu cầu gia nhập."""
    # 1. Query joined clans with details
    mem_stmt = (
        select(ClanMembership, Clan, ClanProfile)
        .join(Clan, ClanMembership.clan_id == Clan.clan_id)
        .outerjoin(ClanProfile, Clan.clan_id == ClanProfile.clan_id)
        .where(
            ClanMembership.user_id == principal.user_id,
            ClanMembership.status == "ACTIVE",
        )
        .order_by(Clan.name)
    )
    mem_rows = (await db.execute(mem_stmt)).all()

    # Get roles for user
    role_stmt = (
        select(UserRole.clan_id, Role.code, Role.name)
        .join(Role, UserRole.role_id == Role.role_id)
        .where(UserRole.user_id == principal.user_id, UserRole.revoked_at.is_(None))
    )
    user_roles = (await db.execute(role_stmt)).all()
    roles_map: dict[uuid.UUID, list[dict[str, str]]] = {}
    for cid, rcode, rname in user_roles:
        if cid:
            roles_map.setdefault(cid, []).append({"code": rcode, "name": rname})

    joined_list = []
    for mem, clan, profile in mem_rows:
        joined_list.append({
            "clan_id": str(clan.clan_id),
            "clan_name": clan.name,
            "clan_code": clan.clan_code,
            "origin_place": profile.origin_place if profile else None,
            "lineage_type": mem.lineage_type,  # 'PATERNAL', 'MATERNAL', or None
            "membership_status": mem.status,
            "clan_status": clan.status,
            "roles": roles_map.get(clan.clan_id, [{"code": "FAMILY_MEMBER", "name": "Thành viên"}]),
            "joined_at": mem.joined_at.isoformat() if mem.joined_at else None,
        })

    # 2. Query user's join requests
    req_stmt = (
        select(ClanJoinRequest)
        .where(ClanJoinRequest.user_id == principal.user_id)
        .order_by(ClanJoinRequest.created_at.desc())
    )
    reqs = (await db.execute(req_stmt)).scalars().all()
    my_requests = []
    for r in reqs:
        my_requests.append(await use_cases.format_request_response(db, r))

    return MyClansSummary(joined_clans=joined_list, my_requests=my_requests)


@router.post(
    "/my-clans/{clan_id}/leave",
    summary="Rời khỏi dòng họ đã tham gia",
    description="Cho phép tài khoản tự rời khỏi dòng họ nếu vào nhầm hoặc không muốn tham gia.",
)
async def leave_clan_endpoint(
    clan_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Rời dòng họ (xóa liên kết, chuyển membership thành INACTIVE, hủy vai trò)."""
    return await use_cases.leave_clan(db=db, principal=principal, clan_id=clan_id)


# ---------------------------------------------------------------------------
# 6. Người duyệt: Danh sách, chi tiết và hành động duyệt yêu cầu của dòng họ
# ---------------------------------------------------------------------------
@router.get("/clans/{clan_id}/join-requests", response_model=List[ClanJoinRequestResponse])
async def list_clan_join_requests_for_reviewer(
    clan_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Xem danh sách các yêu cầu gia nhập gửi tới dòng tộc đích (Chỉ dành cho Trưởng tộc hoặc Family Admin có quyền)."""
    is_auth, _ = await use_cases.check_clan_reviewer_permission(db, clan_id, principal.user_id)
    if not is_auth:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền quản trị hoặc xét duyệt yêu cầu gia nhập cho dòng họ này.",
        )

    stmt = (
        select(ClanJoinRequest)
        .where(ClanJoinRequest.clan_id == clan_id)
        .order_by(ClanJoinRequest.created_at.desc())
    )
    reqs = (await db.execute(stmt)).scalars().all()
    results = []
    for r in reqs:
        results.append(await use_cases.format_request_response(db, r))
    return results


@router.get("/clans/{clan_id}/join-requests/{request_id}", response_model=ClanJoinRequestResponse)
async def get_clan_join_request_detail_for_reviewer(
    clan_id: uuid.UUID,
    request_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Xem chi tiết thông tin xác minh của một yêu cầu gia nhập."""
    is_auth, _ = await use_cases.check_clan_reviewer_permission(db, clan_id, principal.user_id)
    if not is_auth:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập hồ sơ này.")

    stmt = select(ClanJoinRequest).where(
        ClanJoinRequest.request_id == request_id, ClanJoinRequest.clan_id == clan_id
    )
    req = (await db.execute(stmt)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Yêu cầu không tồn tại trong dòng họ này.")
    return await use_cases.format_request_response(db, req)


@router.post("/clans/{clan_id}/join-requests/{request_id}/review", response_model=ClanJoinRequestResponse)
async def review_join_request(
    clan_id: uuid.UUID,
    request_id: uuid.UUID,
    body: ClanJoinReviewAction,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Xét duyệt yêu cầu gia nhập: Chấp thuận (liên kết/tạo Person), Yêu cầu bổ sung, hoặc Từ chối."""
    return await use_cases.review_clan_join_request(
        db=db,
        principal=principal,
        clan_id=clan_id,
        request_id=request_id,
        body=body,
    )
