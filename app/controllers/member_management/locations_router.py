from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Response, status, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.models.family.entities import (
    Clan, ClanProfile, ClanMembership, PersonAccountLink,
    BusinessRegistration, FamilyAdminAssignment, Notification, UserNotification
)
from app.models.genealogy.entities import (
    Person, Relationship, FamilyBranch, ClanLocation, PersonBurial, LocationProposal
)
from app.models.genealogy.repository import GenealogyRepository
from app.models.user_access.entities import User, Role, UserRole
from app.models.postgres import Account
from app.services.auth_access.access_service import AccessService
from app.controllers.member_management.common import (
    _family_uuid, _require, _require_branch_scope, _resolve_membership, _visible_privacy_levels
)

router = APIRouter()


class ClanLocationCreate(BaseModel):
    name: str
    locationType: Optional[str] = "ANCESTRAL_HALL"
    branchId: Optional[str] = None
    address: Optional[str] = None
    latitude: float
    longitude: float
    description: Optional[str] = None
    photoUrls: Optional[List[str]] = []
    privacyLevel: Optional[str] = "CLAN_ONLY"


class ClanLocationUpdate(BaseModel):
    name: Optional[str] = None
    locationType: Optional[str] = None
    branchId: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    photoUrls: Optional[List[str]] = None
    privacyLevel: Optional[str] = None


class PersonBurialSave(BaseModel):
    cemeteryName: Optional[str] = None
    graveCode: Optional[str] = None
    address: Optional[str] = None
    latitude: float
    longitude: float
    burialDate: Optional[str] = None
    orientation: Optional[str] = None
    notes: Optional[str] = None
    photoUrls: Optional[List[str]] = []
    privacyLevel: Optional[str] = "CLAN_ONLY"


class LocationProposalCreate(BaseModel):
    targetType: Optional[str] = "PERSON_BURIAL"
    personId: Optional[str] = None
    locationId: Optional[str] = None
    proposedName: Optional[str] = None
    proposedAddress: Optional[str] = None
    proposedLat: float
    proposedLng: float
    reason: str
    evidencePhotos: Optional[List[str]] = []


class LocationProposalReview(BaseModel):
    action: str  # "APPROVE" or "REJECT"
    reviewNotes: Optional[str] = None




@router.get("/families/{family_id}/locations")
async def list_clan_locations(
    family_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """List all registered clan locations with multi-tier privacy control."""
    f_uuid = _family_uuid(family_id)

    is_member = False
    is_leader = False

    if getattr(account, "primary_role", "").lower() in ("admin", "system_admin"):
        is_member = True
        is_leader = True
    else:
        roles = await AccessService(db).repo.get_active_roles(account.id, str(f_uuid))
        role_set = {r.lower() for r in roles}
        if role_set:
            is_member = True
            if role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}):
                is_leader = True

    stmt = select(ClanLocation).where(ClanLocation.clan_id == f_uuid).order_by(ClanLocation.created_at.desc())

    if not is_member:
        stmt = stmt.where(ClanLocation.privacy_level == "PUBLIC")
    elif not is_leader:
        stmt = stmt.where(ClanLocation.privacy_level.in_(["PUBLIC", "CLAN_ONLY"]))

    res = await db.execute(stmt)
    locations = res.scalars().all()

    return [
        {
            "id": str(loc.location_id),
            "locationId": str(loc.location_id),
            "clanId": str(loc.clan_id),
            "branchId": str(loc.branch_id) if loc.branch_id else None,
            "name": loc.name,
            "locationType": loc.location_type,
            "address": loc.address,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "description": loc.description,
            "photoUrls": loc.photo_urls or [],
            "privacyLevel": loc.privacy_level,
            "createdAt": loc.created_at.isoformat() if loc.created_at else None,
            "updatedAt": loc.updated_at.isoformat() if loc.updated_at else None,
        }
        for loc in locations
    ]


@router.post("/families/{family_id}/locations", status_code=status.HTTP_201_CREATED)
async def create_clan_location(
    family_id: str,
    data: ClanLocationCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Create a new clan location (ancestral hall, tomb grounds, etc.)."""
    f_uuid = _family_uuid(family_id)

    branch_uuid = None
    if data.branchId:
        try:
            branch_uuid = uuid.UUID(data.branchId)
        except ValueError:
            pass

    await _require_branch_scope(db, account, f_uuid, branch_uuid, "family.update")

    new_loc = ClanLocation(
        clan_id=f_uuid,
        branch_id=branch_uuid,
        name=data.name.strip(),
        location_type=data.locationType or "ANCESTRAL_HALL",
        address=data.address.strip() if data.address else None,
        latitude=data.latitude,
        longitude=data.longitude,
        description=data.description.strip() if data.description else None,
        photo_urls=data.photoUrls or [],
        privacy_level=data.privacyLevel or "CLAN_ONLY",
        created_by=account.id,
    )
    db.add(new_loc)

    from app.models.user_access.entities import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=f_uuid,
        actor_id=account.id,
        action="Thêm địa điểm dòng họ",
        entity_type="BRANCH",
        entity_id=new_loc.location_id,
        new_data={"description": f"Đã đánh dấu địa điểm mới: {new_loc.name} ({new_loc.address or 'Tọa độ GPS'})."},
        reason="Quản lý bản đồ gia tộc",
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.commit()
    await db.refresh(new_loc)

    return {
        "id": str(new_loc.location_id),
        "locationId": str(new_loc.location_id),
        "name": new_loc.name,
        "locationType": new_loc.location_type,
        "address": new_loc.address,
        "latitude": new_loc.latitude,
        "longitude": new_loc.longitude,
        "message": "Đã lưu địa điểm dòng họ thành công.",
    }


@router.put("/families/{family_id}/locations/{location_id}")
async def update_clan_location(
    family_id: str,
    location_id: str,
    data: ClanLocationUpdate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Update an existing clan location."""
    f_uuid = _family_uuid(family_id)

    try:
        loc_uuid = uuid.UUID(location_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid location_id")

    res = await db.execute(select(ClanLocation).where(ClanLocation.location_id == loc_uuid, ClanLocation.clan_id == f_uuid))
    loc = res.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=404, detail="Không tìm thấy địa điểm")

    await _require_branch_scope(db, account, f_uuid, loc.branch_id, "family.update")

    if data.name is not None:
        loc.name = data.name.strip()
    if data.locationType is not None:
        loc.location_type = data.locationType
    if data.address is not None:
        loc.address = data.address.strip()
    if data.latitude is not None:
        loc.latitude = data.latitude
    if data.longitude is not None:
        loc.longitude = data.longitude
    if data.description is not None:
        loc.description = data.description.strip()
    if data.photoUrls is not None:
        loc.photo_urls = data.photoUrls
    if data.privacyLevel is not None:
        loc.privacy_level = data.privacyLevel
    if data.branchId is not None:
        try:
            loc.branch_id = uuid.UUID(data.branchId) if data.branchId else None
        except ValueError:
            pass

    from app.models.user_access.entities import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=f_uuid,
        actor_id=account.id,
        action="Cập nhật địa điểm dòng họ",
        entity_type="BRANCH",
        entity_id=loc.location_id,
        new_data={"description": f"Cập nhật tọa độ / thông tin địa điểm: {loc.name}."},
        reason="Chỉnh sửa bản đồ dòng họ",
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.commit()
    await db.refresh(loc)
    return {"success": True, "message": "Đã cập nhật địa điểm thành công."}


@router.delete("/families/{family_id}/locations/{location_id}")
async def delete_clan_location(
    family_id: str,
    location_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Delete a clan location."""
    f_uuid = _family_uuid(family_id)

    try:
        loc_uuid = uuid.UUID(location_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid location_id")

    res = await db.execute(select(ClanLocation).where(ClanLocation.location_id == loc_uuid, ClanLocation.clan_id == f_uuid))
    loc = res.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=404, detail="Không tìm thấy địa điểm")

    await _require_branch_scope(db, account, f_uuid, loc.branch_id, "family.update")

    loc_name = loc.name
    await db.delete(loc)

    from app.models.user_access.entities import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=f_uuid,
        actor_id=account.id,
        action="Xóa địa điểm dòng họ",
        entity_type="BRANCH",
        entity_id=loc_uuid,
        new_data={"description": f"Đã xóa địa điểm '{loc_name}' khỏi bản đồ dòng họ."},
        reason="Xóa địa điểm",
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.commit()
    return {"success": True, "message": f"Đã xóa địa điểm '{loc_name}'."}


# ---------------------------------------------------------------------------
# Person Burial Endpoints
# ---------------------------------------------------------------------------

@router.get("/families/{family_id}/burials")
async def list_clan_burials(
    family_id: str,
    limit: int = Query(200, ge=1, le=500, description="Số bản ghi tối đa mỗi trang (mặc định 200, tối đa 500)."),
    offset: int = Query(0, ge=0, description="Bỏ qua bao nhiêu bản ghi đầu (phân trang)."),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """List burial (mộ phần) locations of a clan for the world map.

    Dùng lại ĐÚNG quy tắc phân quyền riêng tư của GET /families/{family_id}/locations (xem
    _resolve_membership / _visible_privacy_levels ở common.py): người ngoài dòng họ chỉ thấy mộ
    PUBLIC, thành viên thường thấy thêm CLAN_ONLY, Trưởng tộc/Quản trị thấy cả BRANCH_ONLY và PRIVATE.
    Mộ thiếu tọa độ (NULL hoặc (0,0)) bị loại khỏi kết quả. Tên người được JOIN cùng truy vấn
    (không gọi N+1 /members/{id}/burial cho từng người)."""
    f_uuid = _family_uuid(family_id)
    is_member, is_leader = await _resolve_membership(db, account, f_uuid)
    privacy_levels = _visible_privacy_levels(is_member, is_leader)

    repo = GenealogyRepository(db)
    total = await repo.count_clan_burials(f_uuid, privacy_levels)
    rows = await repo.list_clan_burials(f_uuid, privacy_levels, limit=limit, offset=offset)

    items = [
        {
            "personId": str(burial.person_id),
            "personName": full_name,
            "burialId": str(burial.burial_id),
            "clanId": str(burial.clan_id),
            "cemeteryName": burial.cemetery_name,
            "graveCode": burial.grave_code,
            "address": burial.address,
            "burialDate": burial.burial_date.isoformat() if burial.burial_date else None,
            "latitude": burial.latitude,
            "longitude": burial.longitude,
            "privacyLevel": burial.privacy_level,
            "photoUrls": burial.photo_urls or [],
        }
        for burial, full_name in rows
    ]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/members/{person_id}/burial")
async def get_person_burial(
    person_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Retrieve burial / grave coordinates and details for a deceased ancestor."""
    try:
        p_uuid = uuid.UUID(person_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid person_id")

    p_res = await db.execute(select(Person).where(Person.id == p_uuid))
    p = p_res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

    is_member = False
    is_leader = False
    if getattr(account, "primary_role", "").lower() in ("admin", "system_admin"):
        is_member = True
        is_leader = True
    else:
        roles = await AccessService(db).repo.get_active_roles(account.id, str(p.family_id))
        role_set = {r.lower() for r in roles}
        if role_set:
            is_member = True
            if role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}):
                is_leader = True

    b_res = await db.execute(select(PersonBurial).where(PersonBurial.person_id == p_uuid))
    burial = b_res.scalar_one_or_none()
    if not burial:
        return None

    if burial.privacy_level == "PRIVATE" and not is_leader:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vị trí mộ phần này được cài đặt riêng tư bởi Trưởng tộc.")
    if burial.privacy_level == "CLAN_ONLY" and not is_member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vị trí mộ phần chỉ dành cho thành viên nội bộ dòng họ.")

    return {
        "burialId": str(burial.burial_id),
        "personId": str(burial.person_id),
        "clanId": str(burial.clan_id),
        "cemeteryName": burial.cemetery_name,
        "graveCode": burial.grave_code,
        "address": burial.address,
        "latitude": burial.latitude,
        "longitude": burial.longitude,
        "burialDate": burial.burial_date.isoformat() if burial.burial_date else None,
        "orientation": burial.orientation,
        "notes": burial.notes,
        "photoUrls": burial.photo_urls or [],
        "privacyLevel": burial.privacy_level,
        "updatedAt": burial.updated_at.isoformat() if burial.updated_at else None,
    }


@router.put("/members/{person_id}/burial")
async def save_person_burial(
    person_id: str,
    data: PersonBurialSave,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Create or update burial location for a person."""
    try:
        p_uuid = uuid.UUID(person_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid person_id")

    p_res = await db.execute(select(Person).where(Person.id == p_uuid))
    p = p_res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

    await _require_branch_scope(db, account, p.family_id, p.branch_id, "person.update")

    b_date = None
    if data.burialDate:
        try:
            from datetime import date
            parts = [int(x) for x in data.burialDate.split("-")]
            if len(parts) == 3:
                b_date = date(parts[0], parts[1], parts[2])
        except Exception:
            pass

    b_res = await db.execute(select(PersonBurial).where(PersonBurial.person_id == p_uuid))
    burial = b_res.scalar_one_or_none()

    if not burial:
        burial = PersonBurial(
            person_id=p_uuid,
            clan_id=p.family_id,
            cemetery_name=data.cemeteryName.strip() if data.cemeteryName else None,
            grave_code=data.graveCode.strip() if data.graveCode else None,
            address=data.address.strip() if data.address else None,
            latitude=data.latitude,
            longitude=data.longitude,
            burial_date=b_date,
            orientation=data.orientation.strip() if data.orientation else None,
            notes=data.notes.strip() if data.notes else None,
            photo_urls=data.photoUrls or [],
            privacy_level=data.privacyLevel or "CLAN_ONLY",
            created_by=account.id,
        )
        db.add(burial)
    else:
        burial.cemetery_name = data.cemeteryName.strip() if data.cemeteryName else burial.cemetery_name
        burial.grave_code = data.graveCode.strip() if data.graveCode else burial.grave_code
        burial.address = data.address.strip() if data.address else burial.address
        burial.latitude = data.latitude
        burial.longitude = data.longitude
        burial.burial_date = b_date if b_date is not None else burial.burial_date
        burial.orientation = data.orientation.strip() if data.orientation else burial.orientation
        burial.notes = data.notes.strip() if data.notes else burial.notes
        if data.photoUrls is not None:
            burial.photo_urls = data.photoUrls
        if data.privacyLevel is not None:
            burial.privacy_level = data.privacyLevel

    from app.models.user_access.entities import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=p.family_id,
        actor_id=account.id,
        action="Cập nhật vị trí mộ phần",
        entity_type="MEMBER",
        entity_id=p.id,
        new_data={"description": f"Đã cập nhật tọa độ mộ phần cho cụ {p.full_name} ({burial.cemetery_name or 'Khu mộ tổ'})."},
        reason="Định vị mộ phần tiền nhân",
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.commit()
    await db.refresh(burial)

    return {
        "success": True,
        "message": f"Đã lưu tọa độ mộ phần của cụ '{p.full_name}' thành công.",
        "burialId": str(burial.burial_id),
        "latitude": burial.latitude,
        "longitude": burial.longitude,
    }


@router.delete("/members/{person_id}/burial")
async def delete_person_burial(
    person_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Delete burial location for a person."""
    try:
        p_uuid = uuid.UUID(person_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid person_id")

    p_res = await db.execute(select(Person).where(Person.id == p_uuid))
    p = p_res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

    await _require_branch_scope(db, account, p.family_id, p.branch_id, "person.update")

    b_res = await db.execute(select(PersonBurial).where(PersonBurial.person_id == p_uuid))
    burial = b_res.scalar_one_or_none()
    if not burial:
        raise HTTPException(status_code=404, detail="Không có thông tin mộ phần để xóa")

    await db.delete(burial)

    from app.models.user_access.entities import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=p.family_id,
        actor_id=account.id,
        action="Xóa vị trí mộ phần",
        entity_type="MEMBER",
        entity_id=p.id,
        new_data={"description": f"Đã gỡ bỏ tọa độ mộ phần của cụ {p.full_name}."},
        reason="Xóa định vị mộ phần",
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.commit()
    return {"success": True, "message": f"Đã xóa thông tin mộ phần của cụ '{p.full_name}'."}


# ---------------------------------------------------------------------------
# Location Proposals Endpoints
# ---------------------------------------------------------------------------

@router.get("/families/{family_id}/location-proposals")
async def list_location_proposals(
    family_id: str,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """List location and grave modification proposals for a clan."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "family.view")

    stmt = select(LocationProposal).where(LocationProposal.clan_id == f_uuid).order_by(LocationProposal.created_at.desc())
    if status_filter and status_filter != "all":
        stmt = stmt.where(LocationProposal.status == status_filter.upper())

    res = await db.execute(stmt)
    proposals = res.scalars().all()

    items = []
    for prop in proposals:
        target_name = prop.proposed_name or "Vị trí địa lý"
        if prop.person_id:
            p_res = await db.execute(select(Person.full_name).where(Person.id == prop.person_id))
            p_name = p_res.scalar_one_or_none()
            if p_name:
                target_name = f"Mộ phần cụ {p_name}"

        proposer_name = "Thành viên dòng họ"
        u_res = await db.execute(select(User.display_name).where(User.user_id == prop.proposer_id))
        u_name = u_res.scalar_one_or_none()
        if u_name:
            proposer_name = u_name

        items.append({
            "id": str(prop.proposal_id),
            "proposalId": str(prop.proposal_id),
            "clanId": str(prop.clan_id),
            "personId": str(prop.person_id) if prop.person_id else None,
            "locationId": str(prop.location_id) if prop.location_id else None,
            "targetType": prop.target_type,
            "targetName": target_name,
            "proposerId": str(prop.proposer_id),
            "proposerName": proposer_name,
            "proposedName": prop.proposed_name,
            "proposedAddress": prop.proposed_address,
            "proposedLat": prop.proposed_lat,
            "proposedLng": prop.proposed_lng,
            "reason": prop.reason,
            "evidencePhotos": prop.evidence_photos or [],
            "status": prop.status,
            "reviewedBy": str(prop.reviewed_by) if prop.reviewed_by else None,
            "reviewedAt": prop.reviewed_at.isoformat() if prop.reviewed_at else None,
            "reviewNotes": prop.review_notes,
            "createdAt": prop.created_at.isoformat() if prop.created_at else None,
        })

    return items


@router.post("/families/{family_id}/location-proposals", status_code=status.HTTP_201_CREATED)
async def submit_location_proposal(
    family_id: str,
    data: LocationProposalCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Member submits a proposal to correct or add a tomb or ancestral hall location."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "family.view")

    p_uuid = None
    if data.personId:
        try:
            p_uuid = uuid.UUID(data.personId)
        except ValueError:
            pass

    loc_uuid = None
    if data.locationId:
        try:
            loc_uuid = uuid.UUID(data.locationId)
        except ValueError:
            pass

    prop = LocationProposal(
        clan_id=f_uuid,
        person_id=p_uuid,
        location_id=loc_uuid,
        target_type=data.targetType or "PERSON_BURIAL",
        proposer_id=account.id,
        proposed_name=data.proposedName.strip() if data.proposedName else None,
        proposed_address=data.proposedAddress.strip() if data.proposedAddress else None,
        proposed_lat=data.proposedLat,
        proposed_lng=data.proposedLng,
        reason=data.reason.strip(),
        evidence_photos=data.evidencePhotos or [],
        status="PENDING",
    )
    db.add(prop)

    from app.models.user_access.entities import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=f_uuid,
        actor_id=account.id,
        action="Gửi đề xuất vị trí",
        entity_type="APPROVAL",
        entity_id=prop.proposal_id,
        new_data={"description": f"Thành viên gửi đề xuất đính chính vị trí: {data.reason}."},
        reason="Đề xuất vị trí bản đồ",
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.commit()
    await db.refresh(prop)

    return {
        "success": True,
        "message": "Đã gửi đề xuất cập nhật vị trí. Trưởng tộc sẽ kiểm tra và phê duyệt.",
        "proposalId": str(prop.proposal_id),
    }


@router.put("/families/{family_id}/location-proposals/{proposal_id}/review")
async def review_location_proposal(
    family_id: str,
    proposal_id: str,
    data: LocationProposalReview,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Clan Leader or Family Admin reviews and approves/rejects a location proposal."""
    f_uuid = _family_uuid(family_id)

    try:
        prop_uuid = uuid.UUID(proposal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid proposal_id")

    res = await db.execute(select(LocationProposal).where(LocationProposal.proposal_id == prop_uuid, LocationProposal.clan_id == f_uuid))
    prop = res.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề xuất")

    target_branch_id = None
    if prop.person_id:
        p_res = await db.execute(select(Person.branch_id).where(Person.id == prop.person_id))
        target_branch_id = p_res.scalar_one_or_none()
    elif prop.location_id:
        l_res = await db.execute(select(ClanLocation.branch_id).where(ClanLocation.location_id == prop.location_id))
        target_branch_id = l_res.scalar_one_or_none()

    await _require_branch_scope(db, account, f_uuid, target_branch_id, "family.update")

    from datetime import datetime, timezone
    act = data.action.upper()
    prop.reviewed_by = account.id
    prop.reviewed_at = datetime.now(timezone.utc)
    prop.review_notes = data.reviewNotes.strip() if data.reviewNotes else None

    if act == "APPROVE":
        prop.status = "APPROVED"

        # Apply changes automatically if approved
        if prop.target_type == "PERSON_BURIAL" and prop.person_id:
            b_res = await db.execute(select(PersonBurial).where(PersonBurial.person_id == prop.person_id))
            burial = b_res.scalar_one_or_none()
            if burial:
                burial.latitude = prop.proposed_lat
                burial.longitude = prop.proposed_lng
                if prop.proposed_address:
                    burial.address = prop.proposed_address
            else:
                burial = PersonBurial(
                    person_id=prop.person_id,
                    clan_id=f_uuid,
                    address=prop.proposed_address,
                    latitude=prop.proposed_lat,
                    longitude=prop.proposed_lng,
                    notes=f"Được cập nhật theo đề xuất của thành viên: {prop.reason}",
                    privacy_level="CLAN_ONLY",
                    created_by=account.id,
                )
                db.add(burial)

        elif prop.target_type == "CLAN_LOCATION" and prop.location_id:
            l_res = await db.execute(select(ClanLocation).where(ClanLocation.location_id == prop.location_id))
            loc = l_res.scalar_one_or_none()
            if loc:
                loc.latitude = prop.proposed_lat
                loc.longitude = prop.proposed_lng
                if prop.proposed_address:
                    loc.address = prop.proposed_address
                if prop.proposed_name:
                    loc.name = prop.proposed_name

        from app.models.user_access.entities import AuditLog
        db.add(AuditLog(
            log_id=uuid.uuid4(),
            clan_id=f_uuid,
            actor_id=account.id,
            action="Phê duyệt đề xuất vị trí",
            entity_type="APPROVAL",
            entity_id=prop.proposal_id,
            new_data={"description": "Đã chấp thuận đề xuất và tự động cập nhật tọa độ mới vào bản đồ."},
            reason="Phê duyệt đề xuất bản đồ",
            occurred_at=datetime.now(timezone.utc),
        ))

    else:
        prop.status = "REJECTED"
        from app.models.user_access.entities import AuditLog
        db.add(AuditLog(
            log_id=uuid.uuid4(),
            clan_id=f_uuid,
            actor_id=account.id,
            action="Từ chối đề xuất vị trí",
            entity_type="APPROVAL",
            entity_id=prop.proposal_id,
            new_data={"description": f"Từ chối đề xuất: {prop.review_notes or 'Không đủ căn cứ xác thực'}."},
            reason="Từ chối đề xuất bản đồ",
            occurred_at=datetime.now(timezone.utc),
        ))

    await db.commit()
    return {"success": True, "message": f"Đã {('chấp thuận' if act == 'APPROVE' else 'từ chối')} đề xuất cập nhật vị trí."}



# ---------------------------------------------------------------------------
# Clan Announcements & Member Notifications
# ---------------------------------------------------------------------------

