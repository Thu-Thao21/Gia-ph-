from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import Principal
from app.models.family.entities import (
    Clan,
    ClanMembership,
    ClanProfile,
    FamilyAdminAssignment,
    FamilyAdminPermission,
    PersonAccountLink,
    ClanJoinRequest,
)
from app.models.genealogy.entities import Person, FamilyBranch, Relationship
from app.models.user_access.entities import AuditLog, Role, User, UserRole
from app.schemas.clan_join import (
    ClanJoinRequestCreate,
    ClanJoinRequestResponse,
    ClanJoinRequestSupplement,
    ClanJoinReviewAction,
    PublicClanSearchItem,
)

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def check_clan_reviewer_permission(
    db: AsyncSession, clan_id: uuid.UUID, user_id: uuid.UUID
) -> Tuple[bool, str]:
    """Check if user_id is authorized to review join requests for clan_id.

    Allowed:
    - Clan Leader / Business Owner of clan_id
    - Family Admin of clan_id with MEMBER_ACCOUNT_MANAGE permission
    Returns (is_authorized, role_description).
    """
    # 1. Check if user is BUSINESS_OWNER of this clan
    bo_role_stmt = select(Role.role_id).where(Role.code == "BUSINESS_OWNER")
    bo_role_id = (await db.execute(bo_role_stmt)).scalar_one_or_none()
    if bo_role_id:
        user_bo_stmt = select(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.role_id == bo_role_id,
            UserRole.clan_id == clan_id,
            UserRole.revoked_at.is_(None),
        )
        if (await db.execute(user_bo_stmt)).scalar_one_or_none():
            return True, "Trưởng tộc"

    # Also check if user is clan.created_by
    clan_stmt = select(Clan).where(Clan.clan_id == clan_id)
    clan_obj = (await db.execute(clan_stmt)).scalar_one_or_none()
    if clan_obj and clan_obj.created_by == user_id:
        return True, "Chủ dòng họ"

    # 2. Check if user is FAMILY_ADMIN of this clan with MEMBER_ACCOUNT_MANAGE permission
    fa_role_stmt = select(Role.role_id).where(Role.code == "FAMILY_ADMIN")
    fa_role_id = (await db.execute(fa_role_stmt)).scalar_one_or_none()
    if fa_role_id:
        user_fa_stmt = select(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.role_id == fa_role_id,
            UserRole.clan_id == clan_id,
            UserRole.revoked_at.is_(None),
        )
        is_fa = (await db.execute(user_fa_stmt)).scalar_one_or_none() is not None
        if is_fa:
            # Check permission in family_admin_permissions
            perm_stmt = (
                select(FamilyAdminPermission)
                .join(
                    FamilyAdminAssignment,
                    FamilyAdminAssignment.assignment_id == FamilyAdminPermission.assignment_id,
                )
                .where(
                    FamilyAdminAssignment.clan_id == clan_id,
                    FamilyAdminAssignment.user_id == user_id,
                    FamilyAdminAssignment.revoked_at.is_(None),
                    FamilyAdminPermission.permission_code.in_(
                        ["MEMBER_ACCOUNT_MANAGE", "ADMIN_MANAGE"]
                    ),
                )
            )
            has_perm = (await db.execute(perm_stmt)).first() is not None
            if has_perm:
                return True, "Quản trị viên dòng họ (Được phân quyền)"

    return False, ""


async def search_public_clans(
    db: AsyncSession,
    user_id: Optional[uuid.UUID],
    query: Optional[str] = None,
    limit: int = 50,
) -> List[PublicClanSearchItem]:
    """Search active clans for public join requests."""
    stmt = (
        select(Clan, ClanProfile)
        .outerjoin(ClanProfile, Clan.clan_id == ClanProfile.clan_id)
        .where(Clan.status == "ACTIVE")
    )
    if query and query.strip():
        q = f"%{query.strip()}%"
        stmt = stmt.where(or_(Clan.name.ilike(q), Clan.clan_code.ilike(q)))

    stmt = stmt.order_by(Clan.name).limit(limit)
    rows = (await db.execute(stmt)).all()

    # Get member count per clan
    clan_ids = [r[0].clan_id for r in rows]
    counts_map = {}
    if clan_ids:
        count_stmt = (
            select(Person.family_id, func.count(Person.id))
            .where(Person.family_id.in_(clan_ids))
            .group_by(Person.family_id)
        )
        for cid, cnt in (await db.execute(count_stmt)).all():
            counts_map[cid] = cnt

    # Check joined clans and active requests for current user
    joined_set = set()
    active_requests = {}
    if user_id and clan_ids:
        mem_stmt = select(ClanMembership.clan_id).where(
            ClanMembership.user_id == user_id,
            ClanMembership.clan_id.in_(clan_ids),
            ClanMembership.status == "ACTIVE",
        )
        joined_set = set((await db.execute(mem_stmt)).scalars().all())

        req_stmt = select(ClanJoinRequest).where(
            ClanJoinRequest.user_id == user_id,
            ClanJoinRequest.clan_id.in_(clan_ids),
            ClanJoinRequest.status.in_(["PENDING", "NEED_INFO"]),
        )
        for req in (await db.execute(req_stmt)).scalars().all():
            active_requests[req.clan_id] = (req.request_id, req.status)

    results = []
    for clan_obj, profile_obj in rows:
        cid = clan_obj.clan_id
        req_info = active_requests.get(cid)
        results.append(
            PublicClanSearchItem(
                clan_id=cid,
                name=clan_obj.name,
                code=clan_obj.clan_code,
                origin_place=profile_obj.origin_place if profile_obj else None,
                description=profile_obj.public_description if profile_obj else None,
                member_count=counts_map.get(cid, 0),
                is_joined=cid in joined_set,
                active_request_id=req_info[0] if req_info else None,
                active_request_status=req_info[1] if req_info else None,
            )
        )
    return results


async def create_clan_join_request(
    db: AsyncSession, principal: Principal, body: ClanJoinRequestCreate
) -> ClanJoinRequest:
    """Submit a join request to a target clan."""
    user_stmt = select(User).where(User.user_id == principal.user_id)
    user = (await db.execute(user_stmt)).scalar_one_or_none()
    if not user or user.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "USER_NOT_ACTIVE", "message": "Tài khoản của bạn không ở trạng thái hoạt động."},
        )

    clan_stmt = select(Clan).where(Clan.clan_id == body.clan_id)
    clan = (await db.execute(clan_stmt)).scalar_one_or_none()
    if not clan or clan.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CLAN_NOT_FOUND", "message": "Dòng họ đích không tồn tại hoặc đã ngừng hoạt động."},
        )

    # Check if user already has ACTIVE membership
    mem_stmt = select(ClanMembership).where(
        ClanMembership.user_id == principal.user_id,
        ClanMembership.clan_id == body.clan_id,
        ClanMembership.status == "ACTIVE",
    )
    if (await db.execute(mem_stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ALREADY_JOINED", "message": "Bạn đã là thành viên chính thức của dòng họ này."},
        )

    # Check for existing unfinished request (PENDING or NEED_INFO)
    existing_req_stmt = select(ClanJoinRequest).where(
        ClanJoinRequest.user_id == principal.user_id,
        ClanJoinRequest.clan_id == body.clan_id,
        ClanJoinRequest.status.in_(["PENDING", "NEED_INFO"]),
    )
    if (await db.execute(existing_req_stmt)).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "DUPLICATE_ACTIVE_REQUEST",
                "message": "Bạn đã có một yêu cầu gia nhập đang chờ xét duyệt hoặc cần bổ sung cho dòng họ này.",
            },
        )

    now = _utc_now()
    initial_history = [
        {
            "event": "CREATED",
            "at": now.isoformat(),
            "note": "Yêu cầu gia nhập được gửi tới người quản trị dòng họ.",
        }
    ]

    new_req = ClanJoinRequest(
        user_id=principal.user_id,
        clan_id=body.clan_id,
        lineage_type=body.lineage_type,
        full_name=body.full_name,
        birth_date=body.birth_date,
        relative_name=body.relative_name,
        relative_relation=body.relative_relation,
        relation_description=body.relation_description,
        verification_notes=body.verification_notes,
        consent_given=body.consent_given,
        status="PENDING",
        history=initial_history,
        created_at=now,
        updated_at=now,
    )
    db.add(new_req)

    try:
        await db.commit()
        await db.refresh(new_req)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "DUPLICATE_REQUEST_CONCURRENCY",
                "message": "Đã có yêu cầu đang chờ xử lý từ trước cho dòng họ này.",
            },
        )
    return new_req


async def supplement_clan_join_request(
    db: AsyncSession,
    principal: Principal,
    request_id: uuid.UUID,
    body: ClanJoinRequestSupplement,
) -> ClanJoinRequest:
    """Supplement verification information and resubmit when request is in NEED_INFO state."""
    req_stmt = select(ClanJoinRequest).where(ClanJoinRequest.request_id == request_id).with_for_update()
    req = (await db.execute(req_stmt)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Yêu cầu gia nhập không tồn tại.")

    if req.user_id != principal.user_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền chỉnh sửa yêu cầu của người khác.")

    if req.status != "NEED_INFO":
        raise HTTPException(
            status_code=400,
            detail=f"Chỉ có thể bổ sung thông tin khi yêu cầu ở trạng thái 'Cần bổ sung' (Trạng thái hiện tại: {req.status}).",
        )

    now = _utc_now()
    if body.relative_name:
        req.relative_name = body.relative_name
    if body.relative_relation:
        req.relative_relation = body.relative_relation
    if body.relation_description is not None:
        req.relation_description = body.relation_description

    req.verification_notes = f"{req.verification_notes}\n[Bổ sung {now.strftime('%d/%m/%Y %H:%M')}]: {body.verification_notes}"
    req.status = "PENDING"
    req.updated_at = now

    hist = list(req.history) if req.history else []
    hist.append({
        "event": "SUPPLEMENTED",
        "at": now.isoformat(),
        "note": body.verification_notes,
    })
    req.history = hist

    await db.commit()
    await db.refresh(req)
    return req


async def cancel_clan_join_request(
    db: AsyncSession, principal: Principal, request_id: uuid.UUID
) -> ClanJoinRequest:
    """Cancel a join request created by the user."""
    req_stmt = select(ClanJoinRequest).where(ClanJoinRequest.request_id == request_id).with_for_update()
    req = (await db.execute(req_stmt)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Yêu cầu gia nhập không tồn tại.")

    if req.user_id != principal.user_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền hủy yêu cầu của người khác.")

    if req.status not in ["PENDING", "NEED_INFO"]:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể hủy yêu cầu đã có kết quả xét duyệt hoặc đã hủy (Trạng thái: {req.status}).",
        )

    now = _utc_now()
    req.status = "CANCELLED"
    req.updated_at = now

    hist = list(req.history) if req.history else []
    hist.append({"event": "CANCELLED", "at": now.isoformat(), "note": "Người gửi đã hủy yêu cầu."})
    req.history = hist

    await db.commit()
    await db.refresh(req)
    return req


async def format_request_response(db: AsyncSession, req: ClanJoinRequest) -> ClanJoinRequestResponse:
    """Helper to convert ClanJoinRequest into rich response schema."""
    clan = (await db.execute(select(Clan).where(Clan.clan_id == req.clan_id))).scalar_one_or_none()
    user = (await db.execute(select(User).where(User.user_id == req.user_id))).scalar_one_or_none()

    reviewer_name = None
    if req.reviewer_id:
        rev = (await db.execute(select(User.display_name).where(User.user_id == req.reviewer_id))).scalar_one_or_none()
        reviewer_name = rev

    linked_person_name = None
    if req.linked_person_id:
        pname = (await db.execute(select(Person.full_name).where(Person.id == req.linked_person_id))).scalar_one_or_none()
        linked_person_name = pname

    return ClanJoinRequestResponse(
        request_id=req.request_id,
        user_id=req.user_id,
        user_email=user.email if user else None,
        user_display_name=user.display_name if user else None,
        clan_id=req.clan_id,
        clan_name=clan.name if clan else "Dòng họ",
        clan_code=clan.clan_code if clan else "",
        lineage_type=req.lineage_type,
        full_name=req.full_name,
        birth_date=req.birth_date,
        relative_name=req.relative_name,
        relative_relation=req.relative_relation,
        relation_description=req.relation_description,
        verification_notes=req.verification_notes,
        consent_given=req.consent_given,
        status=req.status,
        reviewer_id=req.reviewer_id,
        reviewer_name=reviewer_name,
        review_note=req.review_note,
        reviewed_at=req.reviewed_at,
        linked_person_id=req.linked_person_id,
        linked_person_name=linked_person_name,
        history=req.history or [],
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


async def review_clan_join_request(
    db: AsyncSession,
    principal: Principal,
    clan_id: uuid.UUID,
    request_id: uuid.UUID,
    body: ClanJoinReviewAction,
) -> ClanJoinRequestResponse:
    """Review action (APPROVE, REJECT, NEED_INFO) performed by Clan Leader or authorized FA."""
    # 1. Check authorization on target clan
    is_authorized, role_desc = await check_clan_reviewer_permission(db, clan_id, principal.user_id)
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Bạn không có quyền phê duyệt yêu cầu gia nhập cho dòng họ này.",
            },
        )

    # 2. Lock request row for transaction
    req_stmt = (
        select(ClanJoinRequest)
        .where(ClanJoinRequest.request_id == request_id, ClanJoinRequest.clan_id == clan_id)
        .with_for_update()
    )
    req = (await db.execute(req_stmt)).scalar_one_or_none()
    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "REQUEST_NOT_FOUND", "message": "Không tìm thấy yêu cầu gia nhập trong dòng họ này."},
        )

    # 3. Check reviewer is not the applicant
    if req.user_id == principal.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "SELF_REVIEW_NOT_ALLOWED", "message": "Người gửi không thể tự xét duyệt yêu cầu của chính mình."},
        )

    # 4. Check request status is actionable
    if req.status not in ["PENDING", "NEED_INFO"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "STATE_CONFLICT",
                "message": f"Yêu cầu này đã được xử lý trước đó (Trạng thái: {req.status}).",
            },
        )

    now = _utc_now()
    hist = list(req.history) if req.history else []

    # -------------------------------------------------------------
    # ACTION: NEED_INFO
    # -------------------------------------------------------------
    if body.action == "NEED_INFO":
        if not body.review_note or not body.review_note.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "VALIDATION_ERROR", "message": "Vui lòng nhập nội dung phản hồi hướng dẫn người dùng bổ sung thông tin."},
            )
        req.status = "NEED_INFO"
        req.reviewer_id = principal.user_id
        req.review_note = body.review_note.strip()
        req.reviewed_at = now
        req.updated_at = now
        hist.append({
            "event": "NEED_INFO",
            "at": now.isoformat(),
            "reviewer_id": str(principal.user_id),
            "note": req.review_note,
        })
        req.history = hist
        await db.commit()
        return await format_request_response(db, req)

    # -------------------------------------------------------------
    # ACTION: REJECT
    # -------------------------------------------------------------
    if body.action == "REJECT":
        if not body.review_note or not body.review_note.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "VALIDATION_ERROR", "message": "Vui lòng nhập lý do từ chối yêu cầu gia nhập."},
            )
        req.status = "REJECTED"
        req.reviewer_id = principal.user_id
        req.review_note = body.review_note.strip()
        req.reviewed_at = now
        req.updated_at = now
        hist.append({
            "event": "REJECTED",
            "at": now.isoformat(),
            "reviewer_id": str(principal.user_id),
            "note": req.review_note,
        })
        req.history = hist
        await db.commit()
        return await format_request_response(db, req)

    # -------------------------------------------------------------
    # ACTION: APPROVE
    # -------------------------------------------------------------
    target_person: Optional[Person] = None

    # Case A: Existing Person selected
    if body.person_id:
        person_stmt = select(Person).where(Person.id == body.person_id, Person.family_id == clan_id)
        target_person = (await db.execute(person_stmt)).scalar_one_or_none()
        if not target_person:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "PERSON_NOT_FOUND", "message": "Hồ sơ Person được chọn không thuộc dòng họ này."},
            )

        # Check if Person is already linked to another user in this clan
        existing_link_stmt = select(PersonAccountLink).where(
            PersonAccountLink.person_id == body.person_id,
            PersonAccountLink.clan_id == clan_id,
            PersonAccountLink.status == "ACTIVE",
            PersonAccountLink.revoked_at.is_(None),
        )
        existing_link = (await db.execute(existing_link_stmt)).scalar_one_or_none()
        if existing_link and existing_link.user_id != req.user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "PERSON_ALREADY_LINKED",
                    "message": "Hồ sơ Person này đã được liên kết với một tài khoản khác. Vui lòng kiểm tra lại hồ sơ trùng lặp.",
                },
            )

        # Check if this Person is already linked to another user in this clan
        existing_link_stmt = select(PersonAccountLink).where(
            PersonAccountLink.person_id == body.person_id,
            PersonAccountLink.clan_id == clan_id,
            PersonAccountLink.status == "ACTIVE",
            PersonAccountLink.revoked_at.is_(None),
        )
        existing_link = (await db.execute(existing_link_stmt)).scalar_one_or_none()
        if existing_link and existing_link.user_id != req.user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "PERSON_ALREADY_LINKED",
                    "message": "Hồ sơ Person này đã được liên kết với một tài khoản khác. Vui lòng kiểm tra lại hồ sơ trùng lặp.",
                },
            )

        # Upsert PersonAccountLink for (req.user_id, clan_id)
        user_link_stmt = select(PersonAccountLink).where(
            PersonAccountLink.user_id == req.user_id,
            PersonAccountLink.clan_id == clan_id,
        )
        user_link = (await db.execute(user_link_stmt)).scalar_one_or_none()
        if user_link:
            user_link.person_id = target_person.id
            user_link.status = "ACTIVE"
            user_link.revoked_at = None
            user_link.linked_by = principal.user_id
            user_link.linked_at = now
        else:
            db.add(
                PersonAccountLink(
                    person_id=target_person.id,
                    user_id=req.user_id,
                    clan_id=clan_id,
                    status="ACTIVE",
                    linked_by=principal.user_id,
                    linked_at=now,
                )
            )

    # Case B: Create new verified Person (or auto-create from applicant details)
    else:
        new_p_data = body.new_person or {}
        full_name = (new_p_data.get("full_name") or req.full_name or "Thành viên mới").strip()
        raw_gender = new_p_data.get("gender") or "MALE"
        gender = raw_gender.upper() if raw_gender else "MALE"
        
        raw_birth = new_p_data.get("birth_date") or req.birth_date
        birth_d = raw_birth if raw_birth and str(raw_birth).strip() else None

        # Safely parse branch_id (ignore non-UUID or non-existent branch)
        branch_id_val = new_p_data.get("branch_id")
        branch_uuid = None
        if branch_id_val and str(branch_id_val).strip():
            try:
                cand_branch_uuid = uuid.UUID(str(branch_id_val).strip())
                b_stmt = select(FamilyBranch).where(
                    FamilyBranch.id == cand_branch_uuid,
                    FamilyBranch.family_id == clan_id,
                )
                if (await db.execute(b_stmt)).scalar_one_or_none():
                    branch_uuid = cand_branch_uuid
            except (ValueError, TypeError):
                branch_uuid = None

        # Safely parse parent_id
        parent_id_val = new_p_data.get("parent_id")
        parent_obj: Optional[Person] = None
        gen = new_p_data.get("generation", 1)
        if parent_id_val and str(parent_id_val).strip():
            try:
                parent_uuid = uuid.UUID(str(parent_id_val).strip())
                parent_stmt = select(Person).where(
                    Person.id == parent_uuid,
                    Person.family_id == clan_id,
                )
                parent_obj = (await db.execute(parent_stmt)).scalar_one_or_none()
                if parent_obj:
                    gen = (parent_obj.generation or 1) + 1
            except (ValueError, TypeError):
                parent_obj = None

        target_person = Person(
            family_id=clan_id,
            branch_id=branch_uuid,
            full_name=full_name,
            gender=gender,
            birth_date=birth_d,
            is_alive=True,
            generation=gen,
            created_by=principal.user_id,
            created_at=now,
            updated_at=now,
        )
        db.add(target_person)
        await db.flush()  # Obtain target_person.id

        # If parent was selected, create relationship immediately!
        if parent_obj:
            parent_rel = Relationship(
                family_id=clan_id,
                from_member_id=parent_obj.id,
                to_member_id=target_person.id,
                relationship_type="PARENT_CHILD",
                parent_type="BIOLOGICAL",
                status="ACTIVE",
                verified=True,
                created_by=principal.user_id,
            )
            db.add(parent_rel)

        # Upsert PersonAccountLink for (req.user_id, clan_id)
        user_link_stmt = select(PersonAccountLink).where(
            PersonAccountLink.user_id == req.user_id,
            PersonAccountLink.clan_id == clan_id,
        )
        user_link = (await db.execute(user_link_stmt)).scalar_one_or_none()
        if user_link:
            user_link.person_id = target_person.id
            user_link.status = "ACTIVE"
            user_link.revoked_at = None
            user_link.linked_by = principal.user_id
            user_link.linked_at = now
        else:
            db.add(
                PersonAccountLink(
                    person_id=target_person.id,
                    user_id=req.user_id,
                    clan_id=clan_id,
                    status="ACTIVE",
                    linked_by=principal.user_id,
                    linked_at=now,
                )
            )

    # 5. Handle ClanMembership (Support reactivation for users who previously left)
    mem_stmt = select(ClanMembership).where(
        ClanMembership.clan_id == clan_id, ClanMembership.user_id == req.user_id
    )
    existing_mem = (await db.execute(mem_stmt)).scalar_one_or_none()
    if existing_mem:
        if existing_mem.status == "SUSPENDED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "MEMBERSHIP_SUSPENDED",
                    "message": "Tài khoản này đang ở trạng thái bị đình chỉ tại dòng họ này. Vui lòng mở khóa trước.",
                },
            )
        existing_mem.status = "ACTIVE"
        existing_mem.revoked_at = None
        existing_mem.lineage_type = req.lineage_type
        existing_mem.joined_at = existing_mem.joined_at or now
    else:
        new_mem = ClanMembership(
            clan_id=clan_id,
            user_id=req.user_id,
            status="ACTIVE",
            lineage_type=req.lineage_type,
            joined_at=now,
        )
        db.add(new_mem)

    # 6. Assign or reactivate FAMILY_MEMBER role for target clan
    member_role_stmt = select(Role.role_id).where(Role.code == "FAMILY_MEMBER")
    member_role_id = (await db.execute(member_role_stmt)).scalar_one_or_none()
    if member_role_id:
        user_role_stmt = select(UserRole).where(
            UserRole.user_id == req.user_id,
            UserRole.role_id == member_role_id,
            UserRole.clan_id == clan_id,
        )
        existing_user_role = (await db.execute(user_role_stmt)).scalar_one_or_none()
        if existing_user_role:
            existing_user_role.revoked_at = None
            existing_user_role.granted_by = principal.user_id
            existing_user_role.granted_at = now
        else:
            db.add(
                UserRole(
                    user_id=req.user_id,
                    role_id=member_role_id,
                    clan_id=clan_id,
                    granted_by=principal.user_id,
                    granted_at=now,
                )
            )

    # 7. Update Request
    req.status = "APPROVED"
    req.reviewer_id = principal.user_id
    req.review_note = body.review_note.strip() if body.review_note else "Đã duyệt gia nhập dòng tộc."
    req.reviewed_at = now
    req.linked_person_id = target_person.id
    req.updated_at = now

    hist.append({
        "event": "APPROVED",
        "at": now.isoformat(),
        "reviewer_id": str(principal.user_id),
        "linked_person_id": str(target_person.id),
        "note": req.review_note,
    })
    req.history = hist

    # 8. Record Audit Log
    audit = AuditLog(
        clan_id=clan_id,
        actor_id=principal.user_id,
        action="clan.join_request_approved",
        entity_type="clan_join_request",
        entity_id=req.request_id,
        new_data={
            "user_id": str(req.user_id),
            "linked_person_id": str(target_person.id),
            "lineage_type": req.lineage_type,
            "role": "FAMILY_MEMBER",
        },
        occurred_at=now,
    )
    db.add(audit)

    await db.commit()
    await db.refresh(req)
    return await format_request_response(db, req)


async def leave_clan(
    db: AsyncSession,
    principal: Principal,
    clan_id: uuid.UUID,
) -> dict:
    """Cho phép thành viên tự rời khỏi một dòng họ (nếu vào nhầm hoặc không muốn tham gia).
    
    Quy tắc an toàn:
    - Nếu là Trưởng tộc duy nhất (sole BUSINESS_OWNER) của dòng họ thì không được tự ý rời mà phải chuyển giao quyền quản trị trước.
    - Membership chuyển sang INACTIVE.
    - PersonAccountLink của tài khoản trong dòng họ chuyển sang INACTIVE và ghi revoked_at.
    - Các vai trò UserRole của tài khoản trong dòng họ bị thu hồi (revoked_at = now).
    - Các yêu cầu gia nhập đang chờ duyệt tại dòng họ này của user bị CANCELLED.
    - Ghi nhận AuditLog.
    """
    now = _utc_now()

    # 1. Kiểm tra tư cách thành viên
    mem_stmt = select(ClanMembership).where(
        ClanMembership.clan_id == clan_id,
        ClanMembership.user_id == principal.user_id,
        ClanMembership.status == "ACTIVE",
    )
    mem = (await db.execute(mem_stmt)).scalar_one_or_none()
    if not mem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MEMBERSHIP_NOT_FOUND", "message": "Bạn không phải là thành viên hoạt động trong dòng họ này."},
        )

    # 2. Kiểm tra nếu là Trưởng tộc (BUSINESS_OWNER) duy nhất
    bo_role_stmt = select(Role.role_id).where(Role.code == "BUSINESS_OWNER")
    bo_role_id = (await db.execute(bo_role_stmt)).scalar_one_or_none()
    if bo_role_id:
        user_bo_stmt = select(UserRole).where(
            UserRole.user_id == principal.user_id,
            UserRole.role_id == bo_role_id,
            UserRole.clan_id == clan_id,
            UserRole.revoked_at.is_(None),
        )
        is_bo = (await db.execute(user_bo_stmt)).scalar_one_or_none() is not None
        if is_bo:
            other_bo_stmt = select(func.count(UserRole.user_role_id)).where(
                UserRole.clan_id == clan_id,
                UserRole.role_id == bo_role_id,
                UserRole.user_id != principal.user_id,
                UserRole.revoked_at.is_(None),
            )
            other_bo_count = (await db.execute(other_bo_stmt)).scalar_one() or 0
            if other_bo_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "SOLE_OWNER_CANNOT_LEAVE",
                        "message": "Bạn đang là Trưởng tộc duy nhất của dòng họ này. Vui lòng chuyển giao quyền quản trị trước khi rời dòng họ.",
                    },
                )

    # 3. Cập nhật ClanMembership -> REVOKED
    mem.status = "REVOKED"
    mem.revoked_at = now
    mem.updated_at = now

    # 4. Thu hồi PersonAccountLink -> REVOKED
    link_stmt = select(PersonAccountLink).where(
        PersonAccountLink.clan_id == clan_id,
        PersonAccountLink.user_id == principal.user_id,
        PersonAccountLink.status == "ACTIVE",
        PersonAccountLink.revoked_at.is_(None),
    )
    links = (await db.execute(link_stmt)).scalars().all()
    for link in links:
        link.status = "REVOKED"
        link.revoked_at = now

    # 5. Thu hồi UserRole của user trong clan
    roles_stmt = select(UserRole).where(
        UserRole.clan_id == clan_id,
        UserRole.user_id == principal.user_id,
        UserRole.revoked_at.is_(None),
    )
    roles = (await db.execute(roles_stmt)).scalars().all()
    for r in roles:
        r.revoked_at = now

    # 6. Hủy bỏ yêu cầu gia nhập đang chờ (nếu có)
    req_stmt = select(ClanJoinRequest).where(
        ClanJoinRequest.clan_id == clan_id,
        ClanJoinRequest.user_id == principal.user_id,
        ClanJoinRequest.status.in_(["PENDING", "NEED_INFO"]),
    )
    reqs = (await db.execute(req_stmt)).scalars().all()
    for r in reqs:
        r.status = "CANCELLED"
        r.updated_at = now

    # 7. Ghi AuditLog
    audit = AuditLog(
        clan_id=clan_id,
        actor_id=principal.user_id,
        action="clan.leave_clan",
        entity_type="clan_membership",
        entity_id=mem.membership_id,
        new_data={"status": "REVOKED"},
        occurred_at=now,
    )
    db.add(audit)

    await db.commit()

    clan_name_stmt = select(Clan.name).where(Clan.clan_id == clan_id)
    clan_name = (await db.execute(clan_name_stmt)).scalar_one_or_none() or "dòng họ"

    return {
        "success": True,
        "message": f"Bạn đã rời khỏi dòng họ '{clan_name}' thành công.",
        "clan_id": str(clan_id),
    }

