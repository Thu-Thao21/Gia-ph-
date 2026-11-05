"""C06. Worship Space Controller.

Handles worship spaces, altars, memorials, burial sites, and clan location management.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.genealogy.entities import Person
from app.models.postgres import Account
from app.models.user_access.entities import AuditLog
from app.models.worship.entities import ClanLocation, LocationProposal, PersonBurial
from app.services.auth_access.access_service import AccessService
from app.dependencies.auth import get_current_account

router = APIRouter(tags=["C06. Worship Space Controller"])


def _family_uuid(val: str) -> uuid.UUID:
    try:
        return uuid.UUID(val)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid family_id format")


async def _require_branch_scope(
    db: AsyncSession,
    account: Account,
    clan_id: uuid.UUID,
    branch_id: Optional[uuid.UUID],
    action: str,
) -> None:
    role = getattr(account, "primary_role", "").lower()
    if role in ("admin", "system_admin"):
        return
    roles = await AccessService(db).repo.get_active_roles(account.id, str(clan_id))
    role_set = {r.lower() for r in roles}
    if role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}):
        return
    if "family_admin" in role_set:
        return
    raise HTTPException(status_code=403, detail="Không có quyền thực hiện hành động này")


class ClanLocationCreate(BaseModel):
    name: str
    locationType: Optional[str] = "ANCESTRAL_HALL"
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    photoUrls: Optional[List[str]] = []
    privacyLevel: Optional[str] = "CLAN_ONLY"
    branchId: Optional[str] = None


class ClanLocationUpdate(BaseModel):
    name: Optional[str] = None
    locationType: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    photoUrls: Optional[List[str]] = None
    privacyLevel: Optional[str] = None
    branchId: Optional[str] = None


class PersonBurialUpsert(BaseModel):
    locationId: Optional[str] = None
    graveNumber: Optional[str] = None
    cemeteryName: Optional[str] = None
    burialDate: Optional[str] = None
    customCoordinates: Optional[Dict[str, float]] = None
    notes: Optional[str] = None


class LocationProposalCreate(BaseModel):
    targetType: str
    targetPersonId: Optional[str] = None
    proposedLocationId: Optional[str] = None
    proposedName: Optional[str] = None
    proposedAddress: Optional[str] = None
    proposedLatitude: Optional[float] = None
    proposedLongitude: Optional[float] = None
    reason: str
    evidencePhotos: Optional[List[str]] = []


class LocationProposalReview(BaseModel):
    action: str
    reviewNotes: Optional[str] = None


@router.get("/families/{family_id}/locations")
async def list_clan_locations(
    family_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Danh sách các địa điểm văn hóa, nhà thờ tổ, mộ phần dòng họ."""
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
    """Tạo mới địa điểm nhà thờ tổ, chi phái hoặc khu mộ phần."""
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

    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=f_uuid,
        actor_id=account.id,
        action="Thêm địa điểm dòng họ",
        entity_type="BRANCH",
        entity_id=new_loc.location_id,
        new_data={"description": f"Đã đánh dấu địa điểm mới: {new_loc.name}."},
        reason="Quản lý không gian thờ tự & bản đồ",
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
        "message": "Đã lưu địa điểm thành công.",
    }


@router.put("/families/{family_id}/locations/{location_id}")
async def update_clan_location(
    family_id: str,
    location_id: str,
    data: ClanLocationUpdate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Cập nhật thông tin địa điểm thờ tự, mộ phần."""
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
    """Xóa địa điểm khỏi hệ thống."""
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
    await db.delete(loc)
    await db.commit()
    return {"success": True, "message": "Đã xóa địa điểm thành công."}


@router.get("/members/{person_id}/burial")
async def get_person_burial(
    person_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Xem thông tin an táng, phần mộ của thành viên đã mất."""
    try:
        p_uuid = uuid.UUID(person_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid person_id")

    res = await db.execute(select(PersonBurial).where(PersonBurial.person_id == p_uuid))
    b = res.scalar_one_or_none()
    if not b:
        return {"hasBurial": False, "burial": None}

    return {
        "hasBurial": True,
        "burial": {
            "id": str(b.burial_id),
            "personId": str(b.person_id),
            "locationId": str(b.location_id) if b.location_id else None,
            "graveNumber": b.grave_number,
            "cemeteryName": b.cemetery_name,
            "burialDate": b.burial_date.isoformat() if b.burial_date else None,
            "customLatitude": b.custom_latitude,
            "customLongitude": b.custom_longitude,
            "notes": b.notes,
        }
    }


@router.put("/members/{person_id}/burial")
async def upsert_person_burial(
    person_id: str,
    data: PersonBurialUpsert,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Cập nhật hoặc thêm mới thông tin phần mộ thành viên."""
    try:
        p_uuid = uuid.UUID(person_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid person_id")

    p_res = await db.execute(select(Person).where(Person.id == p_uuid))
    person = p_res.scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

    await _require_branch_scope(db, account, person.family_id, person.branch_id, "family.update")

    b_res = await db.execute(select(PersonBurial).where(PersonBurial.person_id == p_uuid))
    b = b_res.scalar_one_or_none()
    if not b:
        b = PersonBurial(person_id=p_uuid)
        db.add(b)

    if data.locationId:
        try:
            b.location_id = uuid.UUID(data.locationId)
        except ValueError:
            pass
    b.grave_number = data.graveNumber
    b.cemetery_name = data.cemeteryName
    b.notes = data.notes

    if data.customCoordinates:
        b.custom_latitude = data.customCoordinates.get("latitude")
        b.custom_longitude = data.customCoordinates.get("longitude")

    await db.commit()
    return {"success": True, "message": "Đã lưu thông tin an táng phần mộ thành công."}


@router.delete("/members/{person_id}/burial")
async def delete_person_burial(
    person_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Xóa thông tin an táng của thành viên."""
    try:
        p_uuid = uuid.UUID(person_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid person_id")

    b_res = await db.execute(select(PersonBurial).where(PersonBurial.person_id == p_uuid))
    b = b_res.scalar_one_or_none()
    if b:
        await db.delete(b)
        await db.commit()

    return {"success": True, "message": "Đã xóa thông tin an táng thành công."}


@router.get("/families/{family_id}/location-proposals")
async def list_location_proposals(
    family_id: str,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Danh sách các đề xuất cập nhật mộ phần/địa điểm của thành viên."""
    f_uuid = _family_uuid(family_id)

    stmt = select(LocationProposal).where(LocationProposal.clan_id == f_uuid).order_by(LocationProposal.created_at.desc())
    if status_filter:
        stmt = stmt.where(LocationProposal.status == status_filter.upper())

    res = await db.execute(stmt)
    proposals = res.scalars().all()

    return [
        {
            "id": str(p.proposal_id),
            "proposalId": str(p.proposal_id),
            "targetType": p.target_type,
            "status": p.status,
            "reason": p.reason,
            "proposedName": p.proposed_name,
            "proposedAddress": p.proposed_address,
            "proposedLatitude": p.proposed_latitude,
            "proposedLongitude": p.proposed_longitude,
            "createdAt": p.created_at.isoformat() if p.created_at else None,
        }
        for p in proposals
    ]


@router.post("/families/{family_id}/location-proposals", status_code=status.HTTP_201_CREATED)
async def submit_location_proposal(
    family_id: str,
    data: LocationProposalCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Thành viên gửi đề xuất thông tin mộ phần/địa điểm thờ tự lên Ban quản trị."""
    f_uuid = _family_uuid(family_id)

    new_p = LocationProposal(
        clan_id=f_uuid,
        target_type=data.targetType.upper(),
        reason=data.reason.strip(),
        proposed_name=data.proposedName.strip() if data.proposedName else None,
        proposed_address=data.proposedAddress.strip() if data.proposedAddress else None,
        proposed_latitude=data.proposedLatitude,
        proposed_longitude=data.proposedLongitude,
        evidence_photos=data.evidencePhotos or [],
        proposed_by=account.id,
        status="PENDING",
    )
    db.add(new_p)
    await db.commit()
    await db.refresh(new_p)

    # Gửi thông báo đến Ban Quản trị / Trưởng tộc
    try:
        from app.services.activity_fund.notification_service import notification_service
        p_name = data.proposedName or "Vị trí địa điểm / mộ phần"
        await notification_service.notify_clan_admins(
            db=db,
            clan_id=f_uuid,
            title="Đề xuất cập nhật địa điểm / mộ chí mới",
            body=f"Thành viên {getattr(account, 'display_name', '')} vừa gửi đề xuất: '{p_name}'. Lý do: '{data.reason}'. Vui lòng xem xét.",
            notif_type="PROPOSAL",
            entity_type="LOCATION_PROPOSAL",
            entity_id=new_p.proposal_id,
            sender_name=getattr(account, 'display_name', None) or "Thành viên",
            exclude_user_id=account.id,
        )
    except Exception as e:
        logger.warning("Lỗi gửi thông báo đề xuất địa điểm: %s", e)

    return {"success": True, "message": "Đã gửi đề xuất địa điểm thành công. Ban quản trị sẽ sớm xem xét."}


@router.put("/families/{family_id}/location-proposals/{proposal_id}/review")
async def review_location_proposal(
    family_id: str,
    proposal_id: str,
    data: LocationProposalReview,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Ban quản trị duyệt hoặc từ chối đề xuất địa điểm."""
    f_uuid = _family_uuid(family_id)
    await _require_branch_scope(db, account, f_uuid, None, "family.update")

    try:
        prop_uuid = uuid.UUID(proposal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid proposal_id")

    res = await db.execute(select(LocationProposal).where(LocationProposal.proposal_id == prop_uuid, LocationProposal.clan_id == f_uuid))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy đề xuất")

    action_upper = data.action.upper()
    if action_upper not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="Hành động không hợp lệ (APPROVE hoặc REJECT)")

    p.status = "APPROVED" if action_upper == "APPROVE" else "REJECTED"
    p.reviewed_by = account.id
    p.reviewed_at = datetime.now(timezone.utc)
    p.review_notes = data.reviewNotes

    await db.commit()

    # Gửi thông báo đến thành viên gửi đề xuất
    try:
        from app.services.activity_fund.notification_service import notification_service
        proposer_user_id = getattr(p, "proposed_by", None) or getattr(p, "proposer_id", None)
        if proposer_user_id:
            loc_label = p.proposed_name or "địa điểm / mộ phần"
            act_label = "phê duyệt" if p.status == "APPROVED" else "từ chối"
            notes_text = f" Ghi chú: '{data.reviewNotes}'" if data.reviewNotes else ""
            await notification_service.notify_single_user(
                db=db,
                user_id=proposer_user_id,
                title=f"Đề xuất địa điểm đã được {act_label}",
                body=f"Đề xuất cập nhật {loc_label} của bạn đã được Ban Quản trị dòng họ {act_label}.{notes_text}",
                clan_id=f_uuid,
                notif_type="PROPOSAL_RESULT",
                entity_type="LOCATION_PROPOSAL",
                entity_id=p.proposal_id,
                sender_name="Ban Quản trị dòng họ",
            )
    except Exception as e:
        logger.warning("Lỗi gửi thông báo kết quả duyệt đề xuất: %s", e)

    return {"success": True, "message": f"Đã {p.status.lower()} đề xuất thành công."}
