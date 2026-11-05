"""Member and Family API Router for Dashboard Tree, MemberList & Relationship Finder.

Directly bridges the UI requests (/families, /members) with Neon PostgreSQL
clans, persons, and relationships.

Access (Mốc M2, N-1/N-2): EVERY route needs a session (get_current_account) and the family
permission the genealogy service uses for the same data (AccessService, C01):
    person.view    members, member detail
    person.update  persons export (the whole clan with birth dates: managers only, Mốc M2b)
    family.view    clan profile          family.update   clan profile update
    branch.view    branch list           branch.manage   branch create / delete
System admins pass every family check; data spanning ALL clans (no family_id) is SA only.
A resource addressed by its own id (GET /members/{id}) that the caller may not see answers
404, exactly like a missing one, so ids of other clans cannot be probed.
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.models.family.entities import Clan, ClanProfile, ClanMembership, PersonAccountLink, BusinessRegistration, FamilyAdminAssignment, Notification, UserNotification
from app.models.genealogy.entities import Person, Relationship, FamilyBranch, ClanLocation, PersonBurial, LocationProposal
from app.models.user_access.entities import User, Role, UserRole
from app.models.postgres import Account
from app.services.auth_access.access_service import AccessService
from fastapi import File, UploadFile
from app.services.genealogy.excel_import_service import (
    generate_excel_template,
    validate_excel_data,
    execute_excel_import,
)

router = APIRouter(tags=["members-families"])


def _family_uuid(family_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(family_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid family_id")


async def _require(db: AsyncSession, account: Account, family_id: uuid.UUID, permission: str) -> None:
    """403 unless the caller holds `permission` in this family (SA always passes)."""
    await AccessService(db).require_family_permission(account, str(family_id), permission)


async def _require_branch_scope(
    db: AsyncSession,
    account: Account,
    clan_id: uuid.UUID,
    entity_branch_id: Optional[uuid.UUID],
    permission: str = "family.update",
) -> None:
    """
    RBAC check with Branch Scoping:
    - System Admin and Clan Leader: full access across all branches.
    - Family Admin:
      - Must have active, non-revoked assignment.
      - If assignment has branch_id set, entity_branch_id MUST match!
      - If entity has no branch_id (clan-wide location) and FA is branch-scoped, 403 Forbidden!
    - Member: 403 Forbidden.
    """
    await _require(db, account, clan_id, permission)

    if getattr(account, "primary_role", "").lower() in ("admin", "system_admin"):
        return

    roles = await AccessService(db).repo.get_active_roles(account.id, str(clan_id))
    role_set = {r.lower() for r in roles}

    if role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}):
        return

    if "family_admin" in role_set:
        stmt = select(FamilyAdminAssignment).where(
            FamilyAdminAssignment.user_id == account.id,
            FamilyAdminAssignment.clan_id == clan_id,
            FamilyAdminAssignment.revoked_at.is_(None),
        )
        res = await db.execute(stmt)
        assignments = res.scalars().all()
        if not assignments:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Quyền quản trị Family Admin đã bị thu hồi hoặc không hợp lệ.",
            )

        has_clan_wide = any(a.branch_id is None for a in assignments)
        if has_clan_wide:
            return

        allowed_branch_ids = {a.branch_id for a in assignments if a.branch_id is not None}
        if entity_branch_id is None or entity_branch_id not in allowed_branch_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family Admin chỉ được phép quản lý trong phạm vi chi nhánh được phân quyền.",
            )
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Thành viên chỉ được quyền xem hoặc gửi đề xuất, không được chỉnh sửa trực tiếp.",
    )


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


@router.get("/members")
async def list_members(
    family_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """List persons with parent/spouse relations resolved for TreeLayout and MemberList.

    With family_id: person.view in that family. Without: persons of EVERY clan, SA only."""
    # Build query on persons
    if family_id:
        try:
            f_uuid = uuid.UUID(family_id)
        except ValueError:
            return {"items": [], "total": 0, "page": page, "limit": limit, "totalPages": 0}
        await _require(db, account, f_uuid, "person.view")
    else:
        await AccessService(db).require_system_admin(account)

    stmt = select(Person)
    if family_id:
        stmt = stmt.where(Person.family_id == f_uuid)

    if search and isinstance(search, str) and search.strip():
        s = f"%{search.strip()}%"
        stmt = stmt.where(Person.full_name.ilike(s))

    stmt = stmt.order_by(Person.generation, Person.full_name)
    res = await db.execute(stmt)
    persons = res.scalars().all()

    if not persons:
        return {"items": [], "total": 0, "page": page, "limit": limit, "totalPages": 0}

    person_ids = [p.id for p in persons]

    # Pre-fetch person account links (to identify linked user accounts)
    link_stmt = select(PersonAccountLink.person_id, PersonAccountLink.user_id).where(
        PersonAccountLink.person_id.in_(person_ids),
        PersonAccountLink.status == "ACTIVE",
        PersonAccountLink.revoked_at.is_(None),
    )
    link_res = await db.execute(link_stmt)
    person_user_map = {row[0]: str(row[1]) for row in link_res.all()}

    # Pre-fetch relationships for these persons
    rel_stmt = select(Relationship).where(
        or_(
            Relationship.from_member_id.in_(person_ids),
            Relationship.to_member_id.in_(person_ids),
        )
    )
    rel_res = await db.execute(rel_stmt)
    relationships = rel_res.scalars().all()

    # Pre-fetch genders for parent mapping
    person_gender_map = {p.id: (p.gender or "MALE").upper() for p in persons}

    # Map relationships: fatherId, motherId, spouseId, children
    father_map: Dict[uuid.UUID, uuid.UUID] = {}
    mother_map: Dict[uuid.UUID, uuid.UUID] = {}
    spouse_map: Dict[uuid.UUID, uuid.UUID] = {}
    parent_with_children_set = set()

    for r in relationships:
        if r.relationship_type == "PARENT_CHILD":
            child_id = r.to_member_id
            parent_id = r.from_member_id
            parent_with_children_set.add(parent_id)
            p_gender = person_gender_map.get(parent_id, "MALE")
            if p_gender == "MALE":
                father_map[child_id] = parent_id
            else:
                mother_map[child_id] = parent_id
        elif r.relationship_type == "SPOUSE":
            spouse_map[r.from_member_id] = r.to_member_id
            spouse_map[r.to_member_id] = r.from_member_id

    items = []
    for p in persons:
        g = (p.gender or "MALE").lower()
        has_father = p.id in father_map
        has_mother = p.id in mother_map
        has_spouse = p.id in spouse_map
        has_children = p.id in parent_with_children_set
        is_unconnected = not (has_father or has_mother or has_spouse or has_children)

        items.append({
            "id": str(p.id),
            "familyId": str(p.family_id),
            "fullName": p.full_name,
            "otherName": None,
            "gender": g,
            "birthDate": p.birth_date.isoformat() if p.birth_date else None,
            "deathDate": p.death_date.isoformat() if p.death_date else None,
            "isAlive": p.is_alive if p.is_alive is not None else True,
            "generation": p.generation or 1,
            "branch": "Chi Trưởng" if (p.generation or 1) <= 2 else "Nhánh 1",
            "occupation": "Kinh doanh / Quản trị",
            "education": "Đại học",
            "avatarUrl": p.avatar_url,
            "status": p.status,
            "userId": person_user_map.get(p.id),
            "isUnconnected": is_unconnected,
            "fatherId": str(father_map[p.id]) if p.id in father_map else None,
            "motherId": str(mother_map[p.id]) if p.id in mother_map else None,
            "spouseId": str(spouse_map[p.id]) if p.id in spouse_map else None,
        })

    total = len(items)
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": 1,
    }


@router.get("/members/{member_id}")
async def get_member_detail(
    member_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Get single member detail (person.view in the member's family)."""
    try:
        p_uuid = uuid.UUID(member_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid member_id")

    stmt = select(Person).where(Person.id == p_uuid)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Member not found")
    try:
        await _require(db, account, p.family_id, "person.view")
    except HTTPException as exc:
        if exc.status_code == 403:  # another clan's member: same answer as a missing one
            raise HTTPException(status_code=404, detail="Member not found") from None
        raise

    # Get clan name
    clan_stmt = select(Clan.name).where(Clan.clan_id == p.family_id)
    clan_res = await db.execute(clan_stmt)
    clan_name = clan_res.scalar_one_or_none() or "Dòng họ"

    g = (p.gender or "MALE").lower()
    return {
        "id": str(p.id),
        "familyId": str(p.family_id),
        "familyName": clan_name,
        "fullName": p.full_name,
        "otherName": None,
        "gender": g,
        "birthDate": p.birth_date.isoformat() if p.birth_date else None,
        "deathDate": p.death_date.isoformat() if p.death_date else None,
        "isAlive": p.is_alive if p.is_alive is not None else True,
        "generation": p.generation or 1,
        "branch": "Chi Trưởng",
        "occupation": "Kinh doanh / Quản trị",
        "education": "Đại học",
        "bio": p.bio or "Thành viên cốt cán của gia đình.",
        "avatarUrl": p.avatar_url,
        "status": p.status,
        "contacts": [],
        "lifeEvents": [],
        "media": [],
        "skills": [],
        "galleryPhotos": [],
        "careerHistory": [],
    }


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


@router.get("/families/{family_id}/persons/export")
@router.get("/persons/export")
async def export_persons(
    family_id: Optional[str] = None,
    format: str = Query("csv"),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Export person list as CSV (BUG-025). person.update in that family."""
    return await export_persons_csv(db=db, account=account, family_id=family_id)


async def export_persons_csv(*, db: AsyncSession, account: Account, family_id: Optional[str]) -> Response:
    """The CSV of one family's persons. Also used by GET /api/v1/families/{id}/persons/export."""
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="family_id is required to export persons for a clan"
        )
    try:
        f_uuid = uuid.UUID(family_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid family_id format"
        )
    # The whole clan with birth and death dates leaves the system: managers only (Mốc M2b),
    # a plain member (person.view) gets 403.
    await _require(db, account, f_uuid, "person.update")

    stmt = select(Person).where(Person.family_id == f_uuid)

    stmt = stmt.order_by(Person.generation, Person.full_name)
    res = await db.execute(stmt)
    persons = res.scalars().all()

    branch_ids = [p.branch_id for p in persons if p.branch_id]
    branch_map = {}
    if branch_ids:
        b_res = await db.execute(select(FamilyBranch).where(FamilyBranch.id.in_(branch_ids)))
        branch_map = {b.id: b.name for b in b_res.scalars().all()}

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output)
    writer.writerow([
        "STT", "Mã thành viên", "Họ và tên", "Giới tính",
        "Ngày sinh", "Ngày mất", "Tình trạng", "Đời thứ", "Chi nhánh", "Ghi chú"
    ])

    for idx, p in enumerate(persons, 1):
        g = "Nam" if (p.gender or "").upper() == "MALE" else ("Nữ" if (p.gender or "").upper() == "FEMALE" else "Khác")
        alive = "Còn sống" if p.is_alive else "Đã mất"
        b_name = branch_map.get(p.branch_id, "Chi Trưởng")
        writer.writerow([
            idx,
            str(p.id),
            p.full_name,
            g,
            p.birth_date.isoformat() if p.birth_date else "",
            p.death_date.isoformat() if p.death_date else "",
            alive,
            p.generation or 1,
            b_name,
            p.bio or ""
        ])

    csv_content = output.getvalue()
    filename = f"danh_sach_thanh_vien_{family_id or 'all'}.csv"
    return Response(
        content=csv_content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# -----------------------------------------------------------------------------
# EXCEL IMPORT ENDPOINTS (PERSON - USER PARADIGM)
# -----------------------------------------------------------------------------
@router.get("/families/{family_id}/import/template")
async def download_import_template(
    family_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Download standardized 4-sheet Excel template for Clan Admin / Family Admin."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "person.create")

    clan = (await db.execute(select(Clan).where(Clan.clan_id == f_uuid))).scalar_one_or_none()
    clan_name = clan.name if clan else "Dòng họ"
    clan_code = clan.clan_code if clan else "CLAN"

    xlsx_bytes = generate_excel_template(clan_name, clan_code)
    filename = f"MFGMS_Mau_Nhap_Gia_Pha_{clan_code}.xlsx"

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/families/{family_id}/import/preview")
async def preview_excel_import(
    family_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Dry-run validation of uploaded Excel file: returns row-by-row error report and preview."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "person.create")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Tệp tin tải lên bị rỗng")
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Tệp tin vượt quá dung lượng tối đa 10MB")

    return await validate_excel_data(file_bytes, f_uuid, db)


@router.post("/families/{family_id}/import/execute")
async def confirm_excel_import(
    family_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Atomic transaction commit of valid Excel file into Neon DB.
    Enforces strict backend re-validation and branch scoping.
    """
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "person.create")

    # Kiểm tra phân quyền chi nhánh đối với Family Admin
    roles = await AccessService(db).repo.get_active_roles(account.id, str(f_uuid))
    role_set = {r.lower() for r in roles}
    is_clan_leader = bool(role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}))
    is_sys_admin = getattr(account, "primary_role", "").lower() in ("admin", "system_admin")

    allowed_branch_ids = None
    if not is_sys_admin and not is_clan_leader:
        if "family_admin" in role_set:
            from app.models.family.entities import FamilyAdminAssignment
            stmt = select(FamilyAdminAssignment).where(
                FamilyAdminAssignment.user_id == account.id,
                FamilyAdminAssignment.clan_id == f_uuid,
                FamilyAdminAssignment.revoked_at.is_(None),
            )
            assignments = (await db.execute(stmt)).scalars().all()
            if not assignments:
                raise HTTPException(status_code=403, detail="Quyền Quản trị viên chi nhánh đã bị thu hồi hoặc không hợp lệ.")
            has_clan_wide = any(a.branch_id is None for a in assignments)
            if not has_clan_wide:
                allowed_branch_ids = {a.branch_id for a in assignments if a.branch_id is not None}
        else:
            raise HTTPException(status_code=403, detail="Thành viên thông thường không có quyền nhập dữ liệu vào cơ sở dữ liệu.")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Tệp tin tải lên bị rỗng")
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Tệp tin vượt quá dung lượng tối đa 10MB")

    try:
        result = await execute_excel_import(
            file_bytes=file_bytes,
            clan_id=f_uuid,
            user_id=account.id,
            db=db,
            allowed_branch_ids=allowed_branch_ids,
        )
        await db.commit()
        return result
    except ValueError as val_err:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống khi lưu gia phả: {str(exc)}")


class MemberCreateRequest(BaseModel):
    family_id: Optional[str] = None
    fullName: str
    gender: Optional[str] = "male"
    birthDate: Optional[str] = None
    deathDate: Optional[str] = None
    isAlive: Optional[bool] = True
    generation: Optional[int] = None
    branchId: Optional[str] = None
    occupation: Optional[str] = None
    bio: Optional[str] = None
    parentId: Optional[str] = None
    spouseId: Optional[str] = None


class MemberUpdateRequest(BaseModel):
    fullName: Optional[str] = None
    gender: Optional[str] = None
    birthDate: Optional[str] = None
    deathDate: Optional[str] = None
    isAlive: Optional[bool] = None
    generation: Optional[int] = None
    branchId: Optional[str] = None
    occupation: Optional[str] = None
    bio: Optional[str] = None


class MemberRelocateRequest(BaseModel):
    newParentId: Optional[str] = None
    newBranchId: Optional[str] = None


@router.post("/members", status_code=status.HTTP_201_CREATED, dependencies=[Depends(get_current_account)])
async def create_member(
    data: MemberCreateRequest,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Create a new member and automatically establish parent-child or spouse relationships."""
    clean_name = data.fullName.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Họ và tên không được để trống")

    fam_id = None
    parent_obj = None
    spouse_obj = None

    if data.parentId:
        try:
            p_uuid = uuid.UUID(data.parentId)
            res = await db.execute(select(Person).where(Person.id == p_uuid))
            parent_obj = res.scalar_one_or_none()
            if parent_obj:
                fam_id = parent_obj.family_id
        except ValueError:
            pass

    if data.spouseId and not fam_id:
        try:
            s_uuid = uuid.UUID(data.spouseId)
            res = await db.execute(select(Person).where(Person.id == s_uuid))
            spouse_obj = res.scalar_one_or_none()
            if spouse_obj:
                fam_id = spouse_obj.family_id
        except ValueError:
            pass

    if not fam_id and data.family_id:
        try:
            fam_id = uuid.UUID(data.family_id)
        except ValueError:
            pass

    if not fam_id:
        # Default to first clan if not specified
        res = await db.execute(select(Clan.clan_id).limit(1))
        fam_id = res.scalar_one_or_none()
        if not fam_id:
            raise HTTPException(status_code=400, detail="Không tìm thấy dòng họ để thêm thành viên")

    # Member không được tự thêm Person; chỉ Clan Admin / Family Admin có quyền
    await _require(db, account, fam_id, "person.create")

    gen = data.generation
    if not gen:
        if parent_obj:
            gen = (parent_obj.generation or 1) + 1
        elif spouse_obj:
            gen = spouse_obj.generation or 1
        else:
            gen = 1

    b_date = None
    if data.birthDate:
        try:
            from datetime import date
            parts = [int(p) for p in data.birthDate.split("-")]
            if len(parts) == 3:
                b_date = date(parts[0], parts[1], parts[2])
            elif len(parts) == 1:
                b_date = date(parts[0], 1, 1)
        except Exception:
            pass

    d_date = None
    if data.deathDate:
        try:
            from datetime import date
            parts = [int(p) for p in data.deathDate.split("-")]
            if len(parts) == 3:
                d_date = date(parts[0], parts[1], parts[2])
            elif len(parts) == 1:
                d_date = date(parts[0], 1, 1)
        except Exception:
            pass

    admin_uid = account.id

    new_person = Person(
        family_id=fam_id,
        full_name=clean_name,
        gender=(data.gender or "male").upper(),
        birth_date=b_date,
        death_date=d_date,
        is_alive=data.isAlive if data.isAlive is not None else True,
        generation=gen,
        bio=data.bio or f"Thành viên đời thứ {gen}",
        status="ACTIVE",
        created_by=admin_uid,
    )
    db.add(new_person)
    await db.flush()

    # Create relationship if requested
    if parent_obj:
        rel = Relationship(
            family_id=fam_id,
            from_member_id=parent_obj.id,
            to_member_id=new_person.id,
            relationship_type="PARENT_CHILD",
            parent_type="BIOLOGICAL",
            status="ACTIVE",
            created_by=admin_uid,
        )
        db.add(rel)

    if spouse_obj:
        rel = Relationship(
            family_id=fam_id,
            from_member_id=spouse_obj.id,
            to_member_id=new_person.id,
            relationship_type="SPOUSE",
            status="ACTIVE",
            created_by=admin_uid,
        )
        db.add(rel)

    from app.models.user_access.entities import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=fam_id,
        actor_id=admin_uid,
        action="Thêm thành viên",
        entity_type="MEMBER",
        entity_id=new_person.id,
        new_data={"description": f"Thêm thành viên mới: {new_person.full_name} (Đời {gen})."},
        reason="Thêm thành viên gia phả",
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.commit()
    await db.refresh(new_person)

    return {
        "id": str(new_person.id),
        "familyId": str(new_person.family_id),
        "fullName": new_person.full_name,
        "gender": (new_person.gender or "MALE").lower(),
        "generation": new_person.generation,
        "isAlive": new_person.is_alive,
        "message": "Thêm thành viên thành công!",
    }


@router.patch("/members/{member_id}", dependencies=[Depends(get_current_account)])
async def update_member(
    member_id: str,
    data: MemberUpdateRequest,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Update member personal details."""
    try:
        p_uuid = uuid.UUID(member_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid member_id")

    res = await db.execute(select(Person).where(Person.id == p_uuid))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

    # Member không được tự sửa Person; chỉ Clan Admin / Family Admin có quyền
    await _require_branch_scope(db, account, p.family_id, p.branch_id, "person.update")

    if data.fullName is not None:
        name = data.fullName.strip()
        if name:
            p.full_name = name

    if data.gender is not None:
        p.gender = data.gender.strip().upper()

    if data.generation is not None:
        p.generation = data.generation

    if data.isAlive is not None:
        p.is_alive = data.isAlive

    if data.bio is not None:
        p.bio = data.bio

    if data.birthDate is not None:
        if not data.birthDate:
            p.birth_date = None
        else:
            try:
                from datetime import date
                parts = [int(x) for x in data.birthDate.split("-")]
                if len(parts) == 3:
                    p.birth_date = date(parts[0], parts[1], parts[2])
                elif len(parts) == 1:
                    p.birth_date = date(parts[0], 1, 1)
            except Exception:
                pass

    if data.deathDate is not None:
        if not data.deathDate:
            p.death_date = None
        else:
            try:
                from datetime import date
                parts = [int(x) for x in data.deathDate.split("-")]
                if len(parts) == 3:
                    p.death_date = date(parts[0], parts[1], parts[2])
                elif len(parts) == 1:
                    p.death_date = date(parts[0], 1, 1)
            except Exception:
                pass

    await db.commit()
    await db.refresh(p)
    return {
        "id": str(p.id),
        "fullName": p.full_name,
        "gender": (p.gender or "MALE").lower(),
        "generation": p.generation,
        "isAlive": p.is_alive,
        "message": "Cập nhật thành viên thành công!",
    }


@router.delete("/members/{member_id}", status_code=status.HTTP_200_OK, dependencies=[Depends(get_current_account)])
async def delete_member(
    member_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Delete a member and all their relationships from the family tree."""
    try:
        p_uuid = uuid.UUID(member_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid member_id")

    res = await db.execute(select(Person).where(Person.id == p_uuid))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

    # Member không được tự xóa Person; chỉ Clan Admin / Family Admin có quyền
    await _require_branch_scope(db, account, p.family_id, p.branch_id, "person.update")

    # Delete all relationships involving this person
    rel_stmt = select(Relationship).where(
        or_(Relationship.from_member_id == p_uuid, Relationship.to_member_id == p_uuid)
    )
    rel_res = await db.execute(rel_stmt)
    for r in rel_res.scalars().all():
        await db.delete(r)

    # Clean up PersonAccountLink if any (unlink account, but PRESERVE user's ClanMembership)
    link_stmt = select(PersonAccountLink).where(PersonAccountLink.person_id == p_uuid)
    link_res = await db.execute(link_stmt)
    for lk in link_res.scalars().all():
        await db.delete(lk)

    from app.models.user_access.entities import AuditLog
    from datetime import datetime, timezone
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=p.family_id,
        actor_id=account.id,
        action="Xóa nhân vật khỏi cây",
        entity_type="MEMBER",
        entity_id=p.id,
        new_data={"description": f"Đã xóa nhân vật '{p.full_name}' khỏi cây gia phả. Tài khoản thành viên liên kết (nếu có) vẫn được bảo lưu trong dòng họ."},
        reason="Xóa nhân vật trên cây gia phả",
        occurred_at=datetime.now(timezone.utc),
    ))

    await db.delete(p)
    await db.commit()
    return {"success": True, "message": f"Đã xóa nhân vật '{p.full_name}' khỏi cây gia phả. Tài khoản thành viên liên kết (nếu có) vẫn được bảo lưu trong dòng họ."}


@router.post("/members/{member_id}/relocate", dependencies=[Depends(get_current_account)])
async def relocate_member(
    member_id: str,
    data: MemberRelocateRequest,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Relocate a member under a new parent or branch."""
    try:
        p_uuid = uuid.UUID(member_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid member_id")

    res = await db.execute(select(Person).where(Person.id == p_uuid))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên")

    # Member không được tự thay đổi quan hệ phả hệ; chỉ Clan Admin / Family Admin có quyền
    await _require_branch_scope(db, account, p.family_id, p.branch_id, "person.update")

    if data.newParentId:
        try:
            parent_uuid = uuid.UUID(data.newParentId)
            parent_res = await db.execute(select(Person).where(Person.id == parent_uuid))
            parent = parent_res.scalar_one_or_none()
            if not parent:
                raise HTTPException(status_code=404, detail="Không tìm thấy cha/mẹ mới")

            # Remove existing parent-child relationships
            old_rels = await db.execute(
                select(Relationship).where(
                    Relationship.to_member_id == p_uuid,
                    Relationship.relationship_type == "PARENT_CHILD"
                )
            )
            for r in old_rels.scalars().all():
                await db.delete(r)

            admin_uid = account.id

            # Add new relationship
            new_rel = Relationship(
                family_id=parent.family_id,
                from_member_id=parent.id,
                to_member_id=p.id,
                relationship_type="PARENT_CHILD",
                parent_type="BIOLOGICAL",
                status="ACTIVE",
                created_by=admin_uid,
            )
            db.add(new_rel)
            p.generation = (parent.generation or 1) + 1
            p.family_id = parent.family_id
        except ValueError:
            pass

    await db.commit()
    return {"success": True, "message": f"Đã di chuyển thành viên '{p.full_name}' thành công."}



# ---------------------------------------------------------------------------
# Location & Burial API Schemas & Endpoints
# ---------------------------------------------------------------------------

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

class ClanAnnouncementCreate(BaseModel):
    title: str
    content: str
    category: Optional[str] = "event"
    targetAudience: Optional[str] = "all"
    priority: Optional[str] = "normal"
    channels: Optional[Dict[str, bool]] = None


@router.post("/families/{family_id}/announcements", status_code=201)
async def publish_clan_announcement(
    family_id: str,
    data: ClanAnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """
    Publish a new clan announcement and fan-out notifications to all active members of the clan.
    Only Clan Admin, Family Admin, or System Admin can publish.
    """
    f_uuid = _family_uuid(family_id)

    # RBAC check: must hold family.update or be clan leader
    await _require_branch_scope(db, account, f_uuid, None, "family.update")

    # Fetch clan
    clan_res = await db.execute(select(Clan).where(Clan.clan_id == f_uuid))
    clan = clan_res.scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=404, detail="Không tìm thấy dòng họ")

    # Determine sender display and role
    roles = await AccessService(db).repo.get_active_roles(account.id, str(f_uuid))
    role_set = {r.lower() for r in roles}
    is_leader = bool(role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}))
    sender_role = "Trưởng Tộc" if is_leader else "Quản trị viên gia tộc"
    sender_display = getattr(account, "display_name", None) or getattr(account, "full_name", None) or account.email.split("@")[0]

    notif = Notification(
        notification_id=uuid.uuid4(),
        clan_id=f_uuid,
        type=data.category.upper() if data.category else "EVENT",
        title=data.title.strip(),
        body=data.content.strip(),
        entity_type="ANNOUNCEMENT",
        sender_name=sender_display,
        sender_role=sender_role,
        target_audience=data.targetAudience or "all",
        priority=data.priority or "normal",
        channels=data.channels or {"inApp": True, "email": True, "push": False},
        created_at=datetime.now(timezone.utc),
    )
    db.add(notif)
    await db.flush()

    # Query all active members of this clan to fan-out notifications
    m_res = await db.execute(
        select(ClanMembership.user_id).where(
            ClanMembership.clan_id == f_uuid,
            ClanMembership.status == "ACTIVE",
            ClanMembership.revoked_at.is_(None),
        )
    )
    member_user_ids = set(m_res.scalars().all())
    # Ensure current author is also included in delivery list so they see it in their own inbox
    member_user_ids.add(account.id)

    # Deliver to each member's inbox
    now_utc = datetime.now(timezone.utc)
    for uid in member_user_ids:
        un = UserNotification(
            notification_id=notif.notification_id,
            user_id=uid,
            delivered_at=now_utc,
            read_at=now_utc if uid == account.id else None,
        )
        db.add(un)

    from app.models.user_access.entities import AuditLog
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=f_uuid,
        actor_id=account.id,
        action="Phát thông báo dòng họ",
        entity_type="ANNOUNCEMENT",
        entity_id=notif.notification_id,
        new_data={"title": notif.title, "recipient_count": len(member_user_ids)},
        reason="Thông báo dòng họ",
        occurred_at=now_utc,
    ))

    await db.commit()

    return {
        "success": True,
        "message": f"Đã phát thông báo thành công đến {len(member_user_ids)} thành viên dòng họ.",
        "announcement": {
            "id": str(notif.notification_id),
            "clanName": clan.name,
            "senderName": notif.sender_name,
            "senderRole": notif.sender_role,
            "title": notif.title,
            "content": notif.body,
            "category": notif.type.lower(),
            "targetAudience": notif.target_audience,
            "priority": notif.priority,
            "channels": notif.channels,
            "createdAt": notif.created_at.strftime("%d/%m/%Y %H:%M"),
            "recipientCount": len(member_user_ids),
            "readCount": 1,
        }
    }


@router.get("/families/{family_id}/announcements")
async def list_clan_announcements(
    family_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """List all broadcast announcements for a clan."""
    f_uuid = _family_uuid(family_id)

    clan_res = await db.execute(select(Clan).where(Clan.clan_id == f_uuid))
    clan = clan_res.scalar_one_or_none()
    clan_name = clan.name if clan else "Dòng họ"

    stmt = select(Notification).where(
        Notification.clan_id == f_uuid
    ).order_by(Notification.created_at.desc())

    res = await db.execute(stmt)
    notifs = res.scalars().all()

    items = []
    for n in notifs:
        # Count total recipients and read count
        u_res = await db.execute(
            select(
                func.count(UserNotification.user_id),
                func.count(UserNotification.read_at),
            ).where(UserNotification.notification_id == n.notification_id)
        )
        rec_cnt, read_cnt = u_res.first() or (0, 0)

        items.append({
            "id": str(n.notification_id),
            "clanName": clan_name,
            "senderName": n.sender_name or "Hội đồng gia tộc",
            "senderRole": n.sender_role or "Ban quản trị",
            "title": n.title,
            "content": n.body,
            "category": (n.type or "system").lower(),
            "targetAudience": n.target_audience or "all",
            "priority": n.priority or "normal",
            "channels": n.channels or {"inApp": True, "email": True, "push": False},
            "createdAt": n.created_at.strftime("%d/%m/%Y %H:%M"),
            "recipientCount": rec_cnt,
            "readCount": read_cnt,
        })

    return items


@router.delete("/families/{family_id}/announcements/{announcement_id}")
async def delete_clan_announcement(
    family_id: str,
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Delete/revoke a clan announcement."""
    f_uuid = _family_uuid(family_id)
    await _require_branch_scope(db, account, f_uuid, None, "family.update")

    try:
        a_uuid = uuid.UUID(announcement_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid announcement_id")

    n_res = await db.execute(select(Notification).where(Notification.notification_id == a_uuid, Notification.clan_id == f_uuid))
    notif = n_res.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo")

    await db.delete(notif)
    await db.commit()
    return {"success": True, "message": "Đã xóa thông báo dòng họ thành công."}


@router.get("/notifications")
async def list_user_notifications(
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """List inbox notifications for current account across all joined clans."""
    stmt = (
        select(Notification, UserNotification.read_at)
        .join(UserNotification, UserNotification.notification_id == Notification.notification_id)
        .where(UserNotification.user_id == account.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    )

    res = await db.execute(stmt)
    rows = res.all()

    items = []
    for notif, read_at in rows:
        items.append({
            "id": str(notif.notification_id),
            "notificationId": str(notif.notification_id),
            "category": (notif.type or "system").lower(),
            "title": notif.title,
            "content": notif.body,
            "createdAt": notif.created_at.strftime("%d/%m/%Y %H:%M"),
            "read": read_at is not None,
            "readAt": read_at.isoformat() if read_at else None,
            "senderName": notif.sender_name or "Hội đồng gia tộc",
            "targetAudience": notif.target_audience or "all",
            "priority": notif.priority or "normal",
        })

    return items


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Mark a notification as read."""
    try:
        n_uuid = uuid.UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification_id")

    res = await db.execute(
        select(UserNotification).where(
            UserNotification.notification_id == n_uuid,
            UserNotification.user_id == account.id,
        )
    )
    un = res.scalar_one_or_none()
    if un:
        un.read_at = datetime.now(timezone.utc)
        await db.commit()

    return {"success": True}


@router.put("/notifications/mark-all-read")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Mark all inbox notifications as read for the current user."""
    from sqlalchemy import update
    stmt = (
        update(UserNotification)
        .where(
            UserNotification.user_id == account.id,
            UserNotification.read_at.is_(None),
        )
        .values(read_at=datetime.now(timezone.utc))
    )
    await db.execute(stmt)
    await db.commit()
    return {"success": True}
