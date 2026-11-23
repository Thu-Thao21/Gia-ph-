"""C06b. Worship Hall Controller: phong tho 3D (ban tho, tang, bai vi, thap huong, Loi vieng).

Duong dan /families/{clan_id}/worship/... Nghiep vu o app/services/worship/hall_service.py; router chi noi dependency.
Xem phong: PUBLIC thi ai cung xem (dang nhap tuy chon); CLAN_ONLY thi chi thanh vien dang hoat dong, Truong toc, Admin.
Thap huong / Loi vieng can dang nhap. Moi thao tac quan ly chi Truong toc hoac System Admin (kiem trong service).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.utils.image_validation import SAFE_SERVE_HEADERS
from app.db.postgres import get_db
from app.dependencies.auth import get_current_account, get_user_access_repo, resolve_principal
from app.models.user_access.entities import User
from app.schemas.errors import ErrorCode
from app.schemas.worship_hall import (
    BlessingCreate,
    BlessingListResponse,
    BulkAddResponse,
    CandidateListResponse,
    HallInfo,
    HallResponse,
    HallUpdate,
    MessageResponse,
    MyStreaksResponse,
    OfferResponse,
    ReorderRequest,
    TabletBulkCreate,
    TabletCreate,
    TabletItem,
    TabletUpdate,
    TierBrief,
    TierCreate,
    TierTabletsResponse,
    TierUpdate,
)
from app.services.worship.hall_service import BLESSING, INCENSE, WorshipHallService, get_now

router = APIRouter(prefix="/families/{clan_id}/worship", tags=["C06b. Worship Hall Controller"])

_optional_bearer = HTTPBearer(auto_error=False, description="Application session token (tuy chon)")


async def get_optional_account(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
    repo=Depends(get_user_access_repo),
) -> Optional[User]:
    """Khach khong gui token -> None (chi xem phong PUBLIC). Co gui token thi PHAI hop le (sai -> 401)."""
    if credentials is None:
        return None
    token = credentials.credentials.strip()
    if not token or len(token) > 512:
        raise AppError(ErrorCode.SESSION_INVALID, headers={"WWW-Authenticate": "Bearer"})
    principal = await resolve_principal(token, repo)
    if principal.requires_password_change:
        raise AppError(ErrorCode.PASSWORD_CHANGE_REQUIRED)
    user = await repo.get_user_by_id(principal.user_id)
    if user is None:
        raise AppError(ErrorCode.SESSION_INVALID, headers={"WWW-Authenticate": "Bearer"})
    return user


def _svc(db: AsyncSession) -> WorshipHallService:
    return WorshipHallService(db)


# ----------------------------------------------------------------------------- xem phong
@router.get("/hall", response_model=HallResponse)
async def get_worship_hall(
    clan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    account: Optional[User] = Depends(get_optional_account),
    now: datetime = Depends(get_now),
):
    """Phong tho: thong tin, cac tang (moi tang toi da 12 bai vi dau), so luot hom nay va trang thai cua toi."""
    return await _svc(db).get_hall_view(clan_id, account, now)


@router.get("/tiers/{tier_id}/tablets", response_model=TierTabletsResponse)
async def list_tier_tablets(
    clan_id: uuid.UUID,
    tier_id: uuid.UUID,
    offset: int = Query(0, ge=0),
    limit: int = Query(12, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    account: Optional[User] = Depends(get_optional_account),
):
    """Phan trang bai vi trong mot tang."""
    return await _svc(db).list_tier_tablets(clan_id, tier_id, account, offset, limit)


# ----------------------------------------------------------------------------- thap huong / Loi vieng
@router.post("/incense", response_model=OfferResponse)
async def light_incense(
    clan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
    now: datetime = Depends(get_now),
):
    """Thap huong cho ca ban tho: moi thanh vien 1 lan / ngay (doi ngay luc 00:00 gio Viet Nam)."""
    return await _svc(db).offer(clan_id, account, INCENSE, None, now)


@router.post("/blessing", response_model=OfferResponse)
async def write_blessing(
    clan_id: uuid.UUID,
    data: BlessingCreate,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
    now: datetime = Depends(get_now),
):
    """Viet Loi vieng cho ca ban tho: moi thanh vien 1 lan / ngay."""
    return await _svc(db).offer(clan_id, account, BLESSING, data.content, now)


@router.get("/blessings", response_model=BlessingListResponse)
async def list_blessings(
    clan_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=50),
    before: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    account: Optional[User] = Depends(get_optional_account),
):
    """Loi vieng moi nhat (da hien thi), phan trang theo `before` (createdAt cua phan tu cuoi trang truoc)."""
    return await _svc(db).list_blessings(clan_id, account, limit, before)


@router.get("/me/streaks", response_model=MyStreaksResponse)
async def my_streaks(
    clan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
    now: datetime = Depends(get_now),
):
    return await _svc(db).my_streaks(clan_id, account, now)


# ----------------------------------------------------------------------------- quan ly (Truong toc / Admin)
@router.patch("/hall", response_model=HallInfo)
async def update_worship_hall(
    clan_id: uuid.UUID,
    data: HallUpdate,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return await _svc(db).update_hall(clan_id, account, data)


@router.post("/tablets/bulk", response_model=BulkAddResponse)
async def bulk_add_tablets(
    clan_id: uuid.UUID,
    data: TabletBulkCreate,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return await _svc(db).bulk_add_tablets(clan_id, account, data.person_ids, data.tier_id)


@router.put("/tablets/reorder", response_model=MessageResponse)
async def reorder_tablets(
    clan_id: uuid.UUID,
    data: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return MessageResponse(message=await _svc(db).reorder_tablets(clan_id, account, data.ordered_ids))


@router.post("/tablets", response_model=TabletItem, status_code=status.HTTP_201_CREATED)
async def add_tablet(
    clan_id: uuid.UUID,
    data: TabletCreate,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return await _svc(db).add_tablet(clan_id, account, data.person_id, data.note, data.tier_id, data.display_order)


@router.patch("/tablets/{tablet_id}", response_model=TabletItem)
async def update_tablet(
    clan_id: uuid.UUID,
    tablet_id: uuid.UUID,
    data: TabletUpdate,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return await _svc(db).update_tablet(clan_id, tablet_id, account, data)


@router.delete("/tablets/{tablet_id}", response_model=MessageResponse)
async def delete_tablet(
    clan_id: uuid.UUID,
    tablet_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return MessageResponse(message=await _svc(db).delete_tablet(clan_id, tablet_id, account))


@router.post("/tablets/{tablet_id}/portrait")
async def upload_tablet_portrait(
    clan_id: uuid.UUID,
    tablet_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    """Anh bai vi (JPG/PNG/WebP <= 5MB, canh dai <= 4000px, nhan dang theo noi dung that; sai -> 422).
    Tu tao ban nho 512px webp canh tep goc (<goc>_thumb.webp). Thay anh cu thi xoa ca tep cu va ban nho cu."""
    return {"portraitUrl": await _svc(db).set_portrait(clan_id, tablet_id, account, file)}


@router.delete("/tablets/{tablet_id}/portrait", response_model=MessageResponse)
async def delete_tablet_portrait(
    clan_id: uuid.UUID,
    tablet_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return MessageResponse(message=await _svc(db).delete_portrait(clan_id, tablet_id, account))


@router.post("/hall/cover")
async def upload_hall_cover(
    clan_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return {"coverImageUrl": await _svc(db).set_cover(clan_id, account, file)}


@router.delete("/hall/cover", response_model=MessageResponse)
async def delete_hall_cover(
    clan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return MessageResponse(message=await _svc(db).delete_cover(clan_id, account))


@router.post("/tiers", response_model=TierBrief, status_code=status.HTTP_201_CREATED)
async def create_tier(
    clan_id: uuid.UUID,
    data: TierCreate,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return await _svc(db).create_tier(clan_id, account, data.title, data.tier_no)


@router.put("/tiers/reorder", response_model=List[TierBrief])
async def reorder_tiers(
    clan_id: uuid.UUID,
    data: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return await _svc(db).reorder_tiers(clan_id, account, data.ordered_ids)


@router.patch("/tiers/{tier_id}", response_model=TierBrief)
async def update_tier(
    clan_id: uuid.UUID,
    tier_id: uuid.UUID,
    data: TierUpdate,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return await _svc(db).update_tier(clan_id, tier_id, account, data)


@router.delete("/tiers/{tier_id}", response_model=MessageResponse)
async def delete_tier(
    clan_id: uuid.UUID,
    tier_id: uuid.UUID,
    move_to_tier_id: Optional[uuid.UUID] = Query(None, alias="moveToTierId"),
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    """Xoa tang. Tang con bai vi -> 409, tru khi co moveToTierId hop le (cung phong) de chuyen bai vi sang."""
    return MessageResponse(message=await _svc(db).delete_tier(clan_id, tier_id, account, move_to_tier_id))


@router.patch("/blessings/{blessing_id}/hide", response_model=MessageResponse)
async def hide_blessing(
    clan_id: uuid.UUID,
    blessing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return MessageResponse(message=await _svc(db).hide_blessing(clan_id, blessing_id, account))


@router.delete("/blessings/{blessing_id}", response_model=MessageResponse)
async def delete_blessing(
    clan_id: uuid.UUID,
    blessing_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    return MessageResponse(message=await _svc(db).delete_blessing(clan_id, blessing_id, account))


@router.get("/candidates", response_model=CandidateListResponse)
async def list_tablet_candidates(
    clan_id: uuid.UUID,
    search: Optional[str] = Query(None, max_length=100),
    generation: Optional[int] = Query(None, ge=0, le=99),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    """Nguoi DA MAT cua dong ho CHUA co bai vi trong phong tho (tim theo ten, khong phan biet dau)."""
    return await _svc(db).list_candidates(clan_id, account, search, generation, limit, offset)


# ----------------------------------------------------------------------------- phuc vu anh
@router.get("/images/{filename}")
async def serve_worship_image(
    clan_id: uuid.UUID,
    filename: str,
    db: AsyncSession = Depends(get_db),
    account: Optional[User] = Depends(get_optional_account),
):
    """Phuc vu anh phong tho co kiem tra quyen xem; chi anh thuoc phong tho cua dong ho nay."""
    path, media_type = await _svc(db).resolve_image(clan_id, filename, account)
    return FileResponse(path, media_type=media_type, headers=SAFE_SERVE_HEADERS)
