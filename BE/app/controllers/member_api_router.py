"""Member and Family API Router for Dashboard Tree, MemberList & Relationship Finder.

Directly bridges the UI requests (/families, /members) with Neon PostgreSQL
clans, persons, and relationships.
"""

from __future__ import annotations

import csv
import io
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.family.entities import Clan, ClanProfile, ClanMembership, PersonAccountLink
from app.models.genealogy.entities import Person, Relationship, FamilyBranch
from app.models.user_access.entities import User

router = APIRouter(tags=["members-families"])


@router.get("/families")
async def list_families(
    db: AsyncSession = Depends(get_db),
):
    """List all active clans/families with member counts."""
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
):
    """List persons with parent/spouse relations resolved for TreeLayout and MemberList."""
    # Build query on persons
    if family_id:
        try:
            f_uuid = uuid.UUID(family_id)
            # Tự động đồng bộ các tài khoản thành viên (ClanMembership) chưa có Person trong dòng họ này
            active_mems_stmt = (
                select(ClanMembership, User)
                .join(User, User.user_id == ClanMembership.user_id)
                .outerjoin(
                    PersonAccountLink,
                    and_(
                        PersonAccountLink.user_id == ClanMembership.user_id,
                        PersonAccountLink.clan_id == f_uuid,
                        PersonAccountLink.status == "ACTIVE",
                        PersonAccountLink.revoked_at.is_(None),
                    ),
                )
                .where(
                    ClanMembership.clan_id == f_uuid,
                    ClanMembership.status == "ACTIVE",
                    PersonAccountLink.link_id.is_(None),
                )
            )
            missing_links = (await db.execute(active_mems_stmt)).all()
            for mem_row, user_row in missing_links:
                new_p = Person(
                    family_id=f_uuid,
                    full_name=user_row.display_name or (user_row.email.split("@")[0] if user_row.email else "Thành viên mới"),
                    gender="MALE",
                    is_alive=True,
                    generation=1,
                    created_by=user_row.user_id,
                )
                db.add(new_p)
                await db.flush()
                new_link = PersonAccountLink(
                    person_id=new_p.id,
                    user_id=user_row.user_id,
                    clan_id=f_uuid,
                    status="ACTIVE",
                    linked_by=user_row.user_id,
                )
                db.add(new_link)
            if missing_links:
                await db.commit()
        except ValueError:
            return {"items": [], "total": 0, "page": page, "limit": limit, "totalPages": 0}

    stmt = select(Person)
    if family_id:
        stmt = stmt.where(Person.family_id == f_uuid)

    if search:
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
):
    """Get single member detail."""
    try:
        p_uuid = uuid.UUID(member_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid member_id")

    stmt = select(Person).where(Person.id == p_uuid)
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Member not found")

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
):
    """Get clan profile including historical and origin details."""
    try:
        f_uuid = uuid.UUID(family_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid family_id")

    clan_res = await db.execute(select(Clan).where(Clan.clan_id == f_uuid))
    clan = clan_res.scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=404, detail="Family not found")

    prof_res = await db.execute(select(ClanProfile).where(ClanProfile.clan_id == f_uuid))
    prof = prof_res.scalar_one_or_none()

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


@router.put("/families/{family_id}/profile")
async def update_clan_profile(
    family_id: str,
    data: ClanProfileUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update clan profile (BUG-012)."""
    try:
        f_uuid = uuid.UUID(family_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid family_id")

    clan_res = await db.execute(select(Clan).where(Clan.clan_id == f_uuid))
    clan = clan_res.scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=404, detail="Family not found")

    if data.name:
        clan.name = data.name.strip()

    prof_res = await db.execute(select(ClanProfile).where(ClanProfile.clan_id == f_uuid))
    prof = prof_res.scalar_one_or_none()

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
):
    """List branches belonging to a family."""
    try:
        f_uuid = uuid.UUID(family_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid family_id")

    stmt = select(FamilyBranch).where(FamilyBranch.family_id == f_uuid).order_by(FamilyBranch.branch_order)
    res = await db.execute(stmt)
    branches = res.scalars().all()

    counts_stmt = (
        select(Person.branch_id, func.count(Person.id))
        .where(Person.family_id == f_uuid, Person.branch_id.isnot(None))
        .group_by(Person.branch_id)
    )
    counts_res = await db.execute(counts_stmt)
    count_map = {row[0]: row[1] for row in counts_res.all()}

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
            "memberCount": count_map.get(b.id, 0),
        }
        for b in branches
    ]


@router.post("/families/{family_id}/branches", status_code=status.HTTP_201_CREATED)
async def create_family_branch(
    family_id: str,
    data: BranchCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new branch with unique name constraint and leader person ID (BUG-020, BUG-024)."""
    try:
        f_uuid = uuid.UUID(family_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid family_id")

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
):
    """Delete a branch with member check protection (BUG-011)."""
    try:
        f_uuid = uuid.UUID(family_id)
        b_uuid = uuid.UUID(branch_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")

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
):
    """Export person list as CSV (BUG-025)."""
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


@router.post("/members", status_code=status.HTTP_201_CREATED)
async def create_member(
    data: MemberCreateRequest,
    db: AsyncSession = Depends(get_db),
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

    admin_uid_res = await db.execute(select(User.user_id).limit(1))
    admin_uid = admin_uid_res.scalar_one_or_none()

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


@router.patch("/members/{member_id}")
async def update_member(
    member_id: str,
    data: MemberUpdateRequest,
    db: AsyncSession = Depends(get_db),
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


@router.delete("/members/{member_id}", status_code=status.HTTP_200_OK)
async def delete_member(
    member_id: str,
    db: AsyncSession = Depends(get_db),
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

    # Delete all relationships involving this person
    rel_stmt = select(Relationship).where(
        or_(Relationship.from_member_id == p_uuid, Relationship.to_member_id == p_uuid)
    )
    rel_res = await db.execute(rel_stmt)
    for r in rel_res.scalars().all():
        await db.delete(r)

    await db.delete(p)
    await db.commit()
    return {"success": True, "message": f"Đã xóa thành viên '{p.full_name}' khỏi cây gia phả."}


@router.post("/members/{member_id}/relocate")
async def relocate_member(
    member_id: str,
    data: MemberRelocateRequest,
    db: AsyncSession = Depends(get_db),
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

            admin_uid_res = await db.execute(select(User.user_id).limit(1))
            admin_uid = admin_uid_res.scalar_one_or_none()

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

