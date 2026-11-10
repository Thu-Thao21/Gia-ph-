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

        # Enforce 4-generation privacy boundary for in-law visitors (cross-clan partners)
        is_sa = getattr(account, "primary_role", "").lower() in ("admin", "system_admin")
        if not is_sa:
            membership = await AccessService(db).repo.get_active_membership(account.id, str(f_uuid))
            if not membership:
                from sqlalchemy import text
                mapping_stmt = text("""
                    SELECT m.person_a_id, m.person_b_id, m.clan_a_id, m.clan_b_id
                    FROM inter_clan_person_mappings m
                    JOIN clan_memberships cm ON (cm.clan_id = m.clan_a_id OR cm.clan_id = m.clan_b_id)
                    WHERE cm.user_id = :uid AND cm.status = 'ACTIVE' AND m.status = 'VERIFIED'
                      AND (
                          (m.clan_a_id = cm.clan_id AND m.clan_b_id = :fid)
                          OR (m.clan_b_id = cm.clan_id AND m.clan_a_id = :fid)
                      )
                    LIMIT 1;
                """)
                m_res = await db.execute(mapping_stmt, {"uid": account.id, "fid": f_uuid})
                m_row = m_res.fetchone()
                if m_row:
                    target_bridge_person_id = m_row[0] if str(m_row[2]) == str(f_uuid) else m_row[1]
                    bridge_p = await db.get(Person, target_bridge_person_id)
                    if bridge_p:
                        anchor_gen = bridge_p.generation or 1
                        min_gen = max(1, anchor_gen - 2)
                        max_gen = anchor_gen + 1
                        stmt = stmt.where(Person.generation >= min_gen, Person.generation <= max_gen)

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

    # If in-law visitor, ensure the requested member is within the 4-generation scope
    is_sa = getattr(account, "primary_role", "").lower() in ("admin", "system_admin")
    if not is_sa:
        membership = await AccessService(db).repo.get_active_membership(account.id, str(p.family_id))
        if not membership:
            from sqlalchemy import text
            mapping_stmt = text("""
                SELECT m.person_a_id, m.person_b_id, m.clan_a_id, m.clan_b_id
                FROM inter_clan_person_mappings m
                JOIN clan_memberships cm ON (cm.clan_id = m.clan_a_id OR cm.clan_id = m.clan_b_id)
                WHERE cm.user_id = :uid AND cm.status = 'ACTIVE' AND m.status = 'VERIFIED'
                  AND (
                      (m.clan_a_id = cm.clan_id AND m.clan_b_id = :fid)
                      OR (m.clan_b_id = cm.clan_id AND m.clan_a_id = :fid)
                  )
                LIMIT 1;
            """)
            m_res = await db.execute(mapping_stmt, {"uid": account.id, "fid": p.family_id})
            m_row = m_res.fetchone()
            if m_row:
                target_bridge_person_id = m_row[0] if str(m_row[2]) == str(p.family_id) else m_row[1]
                bridge_p = await db.get(Person, target_bridge_person_id)
                if bridge_p:
                    anchor_gen = bridge_p.generation or 1
                    min_gen = max(1, anchor_gen - 2)
                    max_gen = anchor_gen + 1
                    p_gen = p.generation or 1
                    if p_gen < min_gen or p_gen > max_gen:
                        raise HTTPException(status_code=404, detail="Member not found")

    # Get clan name
    clan_stmt = select(Clan.name).where(Clan.clan_id == p.family_id)
    clan_res = await db.execute(clan_stmt)
    clan_name = clan_res.scalar_one_or_none() or "Dòng họ"

    # Query linked account if exists
    link_stmt = select(PersonAccountLink).where(
        PersonAccountLink.person_id == p.id,
        PersonAccountLink.status == "ACTIVE",
    )
    link_obj = (await db.execute(link_stmt)).scalar_one_or_none()
    linked_user_id = str(link_obj.user_id) if link_obj else None

    g = (p.gender or "MALE").lower()
    return {
        "id": str(p.id),
        "userId": linked_user_id,
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

