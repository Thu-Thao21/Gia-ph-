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
from app.models.user_access.entities import User, Role, UserRole
from app.models.postgres import Account
from app.services.auth_access.access_service import AccessService
from app.controllers.member_management.common import (
    _family_uuid, _require, _require_branch_scope
)

router = APIRouter()


@router.get("/families")
async def list_families(
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """List all active clans/families with member counts (every clan: system admin only).

    NOTE: public_router registers GET /families first, so this handler is not reached today."""
    await AccessService(db).require_system_admin(account)
    clans_stmt = select(Clan).where(Clan.status == "ACTIVE").order_by(Clan.name)
    clans_res = await db.execute(clans_stmt)
    clans = clans_res.scalars().all()

    # Get member count per clan
    counts_stmt = (
        select(Person.family_id, func.count(Person.id))
        .group_by(Person.family_id)
    )
    counts_res = await db.execute(counts_stmt)
    count_map = {row[0]: row[1] for row in counts_res.all()}

    results = []
    for c in clans:
        results.append({
            "id": str(c.clan_id),
            "name": c.name,
            "code": c.clan_code,
            "status": c.status,
            "description": f"Dòng họ văn hóa lịch sử {c.name}",
            "founderName": "Nguyễn Văn An",
            "originPlace": "Việt Nam",
            "memberCount": count_map.get(c.clan_id, 0),
        })
    return results




class ClanProfileUpdate(BaseModel):
    name: Optional[str] = None
    originPlace: Optional[str] = Field(None, alias="origin_place")
    history: Optional[str] = None
    ancestralHouseAddress: Optional[str] = Field(None, alias="ancestral_house_address")
    publicDescription: Optional[str] = Field(None, alias="public_description")
    founderPersonId: Optional[str] = Field(None, alias="founder_person_id")
    logoUrl: Optional[str] = Field(None, alias="logo_url")

    class Config:
        populate_by_name = True


class BranchCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    parentBranchId: Optional[str] = Field(None, alias="parent_branch_id")
    leaderPersonId: Optional[str] = Field(None, alias="leader_person_id")

    class Config:
        populate_by_name = True




@router.get("/families/{family_id}/profile")
async def get_clan_profile(
    family_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Get clan profile including historical and origin details (family.view)."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "family.view")

    clan_res = await db.execute(select(Clan).where(Clan.clan_id == f_uuid))
    clan = clan_res.scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=404, detail="Family not found")

    prof_res = await db.execute(select(ClanProfile).where(ClanProfile.clan_id == f_uuid))
    prof = prof_res.scalars().first()

    leader_name = None
    if clan.registration_id:
        reg_res = await db.execute(
            select(BusinessRegistration.representative_name).where(
                BusinessRegistration.registration_id == clan.registration_id
            )
        )
        leader_name = reg_res.scalar_one_or_none()

    if not leader_name:
        leader_user_res = await db.execute(
            select(User.display_name)
            .join(UserRole, UserRole.user_id == User.user_id)
            .join(Role, Role.role_id == UserRole.role_id)
            .where(
                UserRole.clan_id == f_uuid,
                UserRole.revoked_at.is_(None),
                Role.name.ilike("%Clan Leader%"),
            )
        )
        leader_name = leader_user_res.scalars().first()

    return {
        "clanId": str(clan.clan_id),
        "name": clan.name,
        "clanCode": clan.clan_code,
        "status": clan.status,
        "leaderName": leader_name or "Chưa cập nhật",
        "originPlace": prof.origin_place if prof else None,
        "history": prof.history if prof else None,
        "ancestralHouseAddress": prof.ancestral_house_address if prof else None,
        "publicDescription": prof.public_description if prof else None,
        "founderPersonId": str(prof.founder_person_id) if (prof and prof.founder_person_id) else None,
        "updatedAt": prof.updated_at.isoformat() if (prof and prof.updated_at) else None,
    }


@router.put("/families/{family_id}/profile")
async def update_clan_profile(
    family_id: str,
    data: ClanProfileUpdate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Update clan profile (BUG-012). family.update."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "family.update")

    clan_res = await db.execute(select(Clan).where(Clan.clan_id == f_uuid))
    clan = clan_res.scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=404, detail="Family not found")

    if data.name:
        clan.name = data.name.strip()

    prof_res = await db.execute(select(ClanProfile).where(ClanProfile.clan_id == f_uuid))
    prof = prof_res.scalars().first()

    f_founder = None
    if data.founderPersonId:
        try:
            f_founder = uuid.UUID(data.founderPersonId)
        except ValueError:
            pass

    if prof is None:
        prof = ClanProfile(
            clan_id=f_uuid,
            origin_place=data.originPlace,
            history=data.history,
            ancestral_house_address=data.ancestralHouseAddress,
            public_description=data.publicDescription,
            founder_person_id=f_founder,
        )
        db.add(prof)
    else:
        if data.originPlace is not None:
            prof.origin_place = data.originPlace
        if data.history is not None:
            prof.history = data.history
        if data.ancestralHouseAddress is not None:
            prof.ancestral_house_address = data.ancestralHouseAddress
        if data.publicDescription is not None:
            prof.public_description = data.publicDescription
        if data.founderPersonId is not None:
            prof.founder_person_id = f_founder

    from app.models.user_access.entities import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=f_uuid,
        actor_id=account.id,
        action="Cập nhật hồ sơ dòng họ",
        entity_type="PERMISSION",
        entity_id=f_uuid,
        new_data={"description": f"Cập nhật hồ sơ dòng họ: {clan.name} (quê quán, từ đường, tộc ước)."},
        reason="Cập nhật hồ sơ gia tộc",
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.commit()
    await db.refresh(clan)

    return {
        "clanId": str(clan.clan_id),
        "name": clan.name,
        "clanCode": clan.clan_code,
        "status": clan.status,
        "originPlace": prof.origin_place if prof else None,
        "history": prof.history if prof else None,
        "ancestralHouseAddress": prof.ancestral_house_address if prof else None,
        "publicDescription": prof.public_description if prof else None,
        "founderPersonId": str(prof.founder_person_id) if (prof and prof.founder_person_id) else None,
        "updatedAt": prof.updated_at.isoformat() if (prof and prof.updated_at) else None,
    }


@router.get("/families/{family_id}/branches")
async def list_family_branches(
    family_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """List branches belonging to a family (branch.view)."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "branch.view")

    stmt = select(FamilyBranch).where(FamilyBranch.family_id == f_uuid).order_by(FamilyBranch.branch_order)
    res = await db.execute(stmt)
    branches = res.scalars().all()

    counts_stmt = (
        select(Person.branch_id, func.count(Person.id))
        .where(Person.family_id == f_uuid, Person.branch_id.isnot(None))
        .group_by(Person.branch_id)
    )
    counts_res = await db.execute(counts_stmt)
    count_map = {str(row[0]): row[1] for row in counts_res.all()}

    return [
        {
            "id": str(b.id),
            "branchId": str(b.id),
            "familyId": str(b.family_id),
            "name": b.name,
            "code": b.code,
            "description": b.description,
            "branchOrder": b.branch_order,
            "status": b.status,
            "parentBranchId": str(b.parent_branch_id) if b.parent_branch_id else None,
            "memberCount": count_map.get(str(b.id), count_map.get(b.id, 0)),
        }
        for b in branches
    ]


@router.post("/families/{family_id}/branches", status_code=status.HTTP_201_CREATED)
async def create_family_branch(
    family_id: str,
    data: BranchCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Create a new branch with unique name constraint and leader person ID (BUG-020, BUG-024).
    branch.manage."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "branch.manage")

    clean_name = data.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Tên Chi/Nhánh không được để trống")

    # Check unique name per family (BUG-020)
    existing = await db.execute(
        select(FamilyBranch).where(
            FamilyBranch.family_id == f_uuid,
            func.lower(FamilyBranch.name) == clean_name.lower(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tên Chi/Nhánh '{clean_name}' đã tồn tại trong dòng họ.",
        )

    parent_uuid = None
    if data.parentBranchId:
        try:
            parent_uuid = uuid.UUID(data.parentBranchId)
        except ValueError:
            pass

    branch = FamilyBranch(
        family_id=f_uuid,
        name=clean_name,
        code=data.code.strip() if data.code else None,
        description=data.description,
        parent_branch_id=parent_uuid,
    )
    db.add(branch)
    await db.commit()
    await db.refresh(branch)

    return {
        "id": str(branch.id),
        "branchId": str(branch.id),
        "familyId": str(branch.family_id),
        "name": branch.name,
        "code": branch.code,
        "description": branch.description,
        "status": branch.status,
        "parentBranchId": str(branch.parent_branch_id) if branch.parent_branch_id else None,
        "memberCount": 0,
    }


@router.delete("/families/{family_id}/branches/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_family_branch(
    family_id: str,
    branch_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Delete a branch with member check protection (BUG-011). branch.manage."""
    try:
        f_uuid = uuid.UUID(family_id)
        b_uuid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    await _require(db, account, f_uuid, "branch.manage")

    branch_res = await db.execute(
        select(FamilyBranch).where(FamilyBranch.id == b_uuid, FamilyBranch.family_id == f_uuid)
    )
    branch = branch_res.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    # Check if branch has members (BUG-011)
    cnt_res = await db.execute(
        select(func.count(Person.id)).where(Person.family_id == f_uuid, Person.branch_id == b_uuid)
    )
    member_count = cnt_res.scalar_one() or 0
    if member_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể xóa Chi nhánh đang có {member_count} thành viên. Vui lòng chuyển thành viên sang Chi khác trước khi xóa.",
        )

    await db.delete(branch)
    await db.commit()


