from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Any, Dict, Set

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, bindparam, text, and_, or_, not_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.models.family.entities import Clan, ClanMembership, ClanProfile, Notification, UserNotification, PersonAccountLink
from app.models.genealogy.entities import Branch, Person, Relationship, PersonPrivacySetting
from app.models.inter_family import (
    InterClanLink,
    InterClanPersonMapping,
    InterClanRequest,
    InterClanSharedPolicy,
    LineageAccessGrant,
    LineageAccessRequest,
)
from app.models.user_access.entities import AuditLog, User
from app.schemas.inter_family import (
    LineageAccessGrantResponse,
    LineageAccessRequestCreate,
    LineageAccessRequestResponse,
    LineageAccessReviewRequest,
    LineageAccessRevokeRequest,
    MarriageInvitationCreate,
    MarriageInvitationRespond,
    MarriageInvitationResponse,
)
from app.models.inter_family.repository import InterFamilyRepository
from app.models.postgres import Account
from app.schemas.genealogy import RelationshipResponse, TreeDataResponse, TreeNode
from app.services.auth_access.access_service import AccessService
from app.controllers.inter_family.common import (
    MANAGE_PERMISSION,
    DEFAULT_ALLOWED_FIELDS,
    SCOPE_PRESETS,
    MASKED_NAME,
    MASKED_GENDER,
    MASKED_GENERATION,
    normalize_allowed_fields,
    format_date_safe,
    shared_tree_node,
    LinkRequestCreate,
    LinkRequestReview,
    LinkTerminateRequest,
    LinkRequestResponse,
    LinkResponse,
    PolicyUpdate,
    PolicyResponse,
    PersonMappingCreate,
    PersonMappingReview,
    PersonMappingRevoke,
    PersonMappingResponse,
    get_clan_admin_user_ids,
    get_inter_family_repo,
    Caller,
    get_caller,
    _not_found,
    _forbidden,
    _uuid,
    _visible_link,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/families")
async def get_network_families(
    category: str = Query("all"),
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Returns linked families or discovered clans for the network tab with member details."""
    user_clan_ids = caller.clans
    # Get links scoped to caller (SA gets all, members get only their clan's links)
    links = await repo.list_links(clan_ids=caller.scope(), status="ACTIVE")
    linked_clans = {c for l in links for c in (l.clan_a_id, l.clan_b_id)}

    user_memberships = []
    maternal_clan_ids: set[uuid.UUID] = set()
    paternal_clan_ids: set[uuid.UUID] = set()

    if hasattr(db, "execute") and hasattr(caller.account, "user_id"):
        try:
            user_memberships_res = await db.execute(
                select(ClanMembership).where(
                    ClanMembership.user_id == caller.account.user_id,
                    ClanMembership.status == "ACTIVE",
                ).order_by(ClanMembership.joined_at.asc())
            )
            user_memberships = list(user_memberships_res.scalars().all())
            for m in user_memberships:
                lt = (m.lineage_type or "").upper()
                if lt == "MATERNAL":
                    maternal_clan_ids.add(m.clan_id)
                elif lt == "PATERNAL":
                    paternal_clan_ids.add(m.clan_id)
        except Exception:
            pass

    # Smart deduction for users with 2 clans (1 Noi, 1 Ngoai):
    if len(user_memberships) >= 2:
        if not paternal_clan_ids:
            first_clan = user_memberships[0].clan_id
            paternal_clan_ids.add(first_clan)
            maternal_clan_ids.discard(first_clan)
        for m in user_memberships:
            if m.clan_id not in paternal_clan_ids:
                maternal_clan_ids.add(m.clan_id)
    elif len(user_memberships) == 1:
        if not maternal_clan_ids and not paternal_clan_ids:
            paternal_clan_ids.add(user_memberships[0].clan_id)
    else:
        paternal_clan_ids = user_clan_ids - maternal_clan_ids

    all_clans = await repo.list_active_clans()

    cat_filter = category.lower().strip()
    selected_clans = []

    for clan in all_clans:
        c_id = clan.clan_id
        is_user_maternal = c_id in maternal_clan_ids
        is_user_paternal = c_id in paternal_clan_ids

        # Check if connected via link to user's paternal clan
        is_linked_to_user_paternal = any(
            (l.clan_a_id in paternal_clan_ids and l.clan_b_id == c_id)
            or (l.clan_b_id in paternal_clan_ids and l.clan_a_id == c_id)
            for l in links
        )

        if is_user_maternal or is_linked_to_user_paternal:
            clan_cat = "ngoai"
        elif is_user_paternal:
            clan_cat = "noi"
        else:
            clan_cat = "noi"

        if cat_filter == "noi":
            if is_user_paternal:
                selected_clans.append((clan, "noi", 0))
            elif clan_cat == "noi" and (caller.is_sa or len(user_clan_ids) == 0):
                selected_clans.append((clan, "noi", 1))
        elif cat_filter in ("ngoai", "thong-gia", "thong_gia", "affiliated"):
            if is_user_maternal:
                selected_clans.append((clan, "ngoai", 0))
            elif is_linked_to_user_paternal and not is_user_paternal:
                selected_clans.append((clan, "ngoai", 1))
            elif clan_cat == "ngoai" and (caller.is_sa or len(user_clan_ids) == 0):
                selected_clans.append((clan, "ngoai", 2))
        else:
            priority = 0 if (is_user_paternal or is_user_maternal) else 1
            selected_clans.append((clan, clan_cat, priority))

    # Sort so user's direct clans appear first
    selected_clans.sort(key=lambda x: (x[2], x[0].name))

    if not selected_clans:
        return []

    target_clan_ids = [c[0].clan_id for c in selected_clans]
    profiles_map = {}
    clan_branches_map = defaultdict(list)
    branch_map = {}
    persons_by_clan = defaultdict(list)

    if hasattr(db, "execute"):
        try:
            # Batch query profiles
            profiles_res = await db.execute(
                select(ClanProfile).where(ClanProfile.clan_id.in_(target_clan_ids))
            )
            profiles_map = {p.clan_id: p for p in profiles_res.scalars().all()}

            # Batch query branches
            branches_res = await db.execute(
                select(Branch).where(Branch.family_id.in_(target_clan_ids))
            )
            for b in branches_res.scalars().all():
                branch_map[b.id] = b.name
                clan_branches_map[b.family_id].append(b.name)

            # Batch query active persons
            persons_res = await db.execute(
                select(Person).where(
                    Person.family_id.in_(target_clan_ids),
                    Person.status == "ACTIVE",
                ).order_by(
                    Person.family_id,
                    Person.generation.asc(),
                    Person.birth_date.asc(),
                    Person.full_name.asc(),
                )
            )
            for p in persons_res.scalars().all():
                persons_by_clan[p.family_id].append(p)
        except Exception:
            pass

    items = []
    for clan, cat, _ in selected_clans:
        c_id = clan.clan_id
        profile = profiles_map.get(c_id)
        clan_persons = persons_by_clan.get(c_id, [])
        branches = clan_branches_map.get(c_id, [])
        if not branches:
            branches = ["Nhánh chính"]

        founder_name = None
        if profile and profile.founder_person_id:
            for p in clan_persons:
                if p.id == profile.founder_person_id:
                    founder_name = p.full_name
                    break
        if not founder_name and clan_persons:
            gen1_persons = [p for p in clan_persons if (p.generation or 1) == 1]
            if gen1_persons:
                male_gen1 = [p for p in gen1_persons if (p.gender or "").upper() == "MALE"]
                founder_name = male_gen1[0].full_name if male_gen1 else gen1_persons[0].full_name
            else:
                founder_name = clan_persons[0].full_name

        origin_place = (
            profile.origin_place
            if profile and profile.origin_place
            else "Chưa rõ quê quán"
        )
        history = (
            profile.history
            if profile and profile.history
            else (
                profile.public_description
                if profile and profile.public_description
                else "Chưa có lịch sử dòng họ."
            )
        )

        is_connected = caller.is_sa or (c_id in user_clan_ids) or (c_id in linked_clans)
        members_data = []
        can_export_family = False

        if is_connected:
            if c_id in user_clan_ids or caller.is_sa:
                # Own clan or SA: full access
                for p in clan_persons:
                    gender_label = (
                        "Nam"
                        if (p.gender or "").upper() == "MALE"
                        else ("Nữ" if (p.gender or "").upper() == "FEMALE" else "Khác")
                    )
                    members_data.append({
                        "id": str(p.id),
                        "fullName": p.full_name,
                        "gender": gender_label,
                        "generation": p.generation or 1,
                        "birthDate": format_date_safe(p.birth_date),
                        "deathDate": format_date_safe(p.death_date),
                        "isAlive": p.is_alive if p.is_alive is not None else True,
                        "branch": branch_map.get(p.branch_id, "Nhánh chính") if p.branch_id else "Nhánh chính",
                        "bio": p.bio or "",
                    })
                can_export_family = True
            else:
                # Linked external clan: apply InterClanSharedPolicy and PersonPrivacySetting
                link_match = next((l for l in links if c_id in (l.clan_a_id, l.clan_b_id)), None)
                clan_policy = await repo.get_policy(link_match.id, c_id) if link_match else None
                allowed_f = normalize_allowed_fields(clan_policy.allowed_fields if clan_policy else None)
                can_export_family = bool(clan_policy.can_export) if clan_policy else False
                privacy_map = await repo.privacy_settings_of([p.id for p in clan_persons])

                for p in clan_persons:
                    node = shared_tree_node(p, allowed_f, privacy_map.get(p.id))
                    gender_label = (
                        "Nam"
                        if (node.gender or "").upper() == "MALE"
                        else ("Nữ" if (node.gender or "").upper() == "FEMALE" else ("Khác" if node.gender != MASKED_GENDER else "Bảo mật"))
                    )
                    members_data.append({
                        "id": str(p.id),
                        "fullName": node.full_name,
                        "gender": gender_label,
                        "generation": node.generation,
                        "birthDate": format_date_safe(getattr(node, "birth_date", None) or getattr(node, "birthDate", None)),
                        "deathDate": format_date_safe(getattr(node, "death_date", None) or getattr(node, "deathDate", None)),
                        "isAlive": getattr(node, "is_alive", True) if hasattr(node, "is_alive") else getattr(node, "isLiving", True),
                        "branch": branch_map.get(p.branch_id, "Nhánh chính") if (getattr(node, "branch_id", None) or getattr(node, "branchId", None)) else None,
                        "bio": p.bio if (allowed_f.get("bio") and (getattr(node, "privacy_level", None) or getattr(node, "privacyLevel", "SHARED")) != "MASKED") else "",
                        "privacyLevel": getattr(node, "privacy_level", None) or getattr(node, "privacyLevel", "SHARED"),
                    })
        else:
            # Unlinked clan: no member list returned for privacy boundary
            members_data = []

        items.append({
            "id": str(c_id),
            "name": clan.name,
            "code": clan.clan_code,
            "category": cat,
            "founderName": founder_name,
            "originPlace": origin_place,
            "history": history,
            "ancestralHouseAddress": profile.ancestral_house_address if profile else "",
            "branches": branches,
            "memberCount": len(clan_persons),
            "status": "connected" if is_connected else "available",
            "relationshipCount": 1 if is_connected else 0,
            "members": members_data,
        })
    return items





@router.get("/links", response_model=List[LinkResponse])
async def list_inter_clan_links(
    status_filter: Optional[str] = Query(None, alias="status"),
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Lists inter-clan links of the caller's clans (FR-BO-53..55); SA sees all."""
    links = await repo.list_links(
        clan_ids=caller.scope(), status=status_filter.upper() if status_filter else None
    )
    names = await repo.clan_names(c for l in links for c in (l.clan_a_id, l.clan_b_id))

    output = []
    for link in links:
        a_id = str(link.clan_a_id)
        b_id = str(link.clan_b_id)
        output.append(
            LinkResponse(
                id=str(link.id),
                requestId=str(link.request_id),
                clanAId=a_id,
                clanAName=names.get(a_id, "Dòng họ A"),
                clanBId=b_id,
                clanBName=names.get(b_id, "Dòng họ B"),
                connectionType=getattr(link, "connection_type", "IN_LAW"),
                status=link.status,
                linkedAt=link.linked_at,
                endedAt=link.ended_at,
                terminatedBy=str(link.terminated_by) if getattr(link, "terminated_by", None) else None,
                terminationReason=getattr(link, "termination_reason", None),
            )
        )
    return output


@router.delete("/links/{link_id}")
@router.post("/links/{link_id}/terminate")
async def terminate_link(
    link_id: str,
    data: Optional[LinkTerminateRequest] = None,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Terminates an inter-family connection link (FR-BO-55): manage one of its two clans."""
    link = await _visible_link(repo, caller, link_id)
    if not (await caller.manages(link.clan_a_id) or await caller.manages(link.clan_b_id)):
        raise _forbidden("Chỉ Quản trị viên dòng họ của một trong hai bên mới có quyền chấm dứt liên kết.")

    if link.status == "TERMINATED":
        return {"status": "TERMINATED", "message": "Liên kết này đã bị chấm dứt trước đó."}

    now = datetime.now(timezone.utc)
    link.status = "TERMINATED"
    link.ended_at = now
    link.terminated_by = caller.user_id
    link.termination_reason = data.reason.strip() if data and data.reason else None

    # Tự động thu hồi toàn bộ quyền xem gia phả liên họ đã cấp giữa 2 dòng họ khi chấm dứt liên kết
    stmt_link_grants = select(LineageAccessGrant).where(
        LineageAccessGrant.status == "ACTIVE",
        LineageAccessGrant.owner_clan_id.in_([link.clan_a_id, link.clan_b_id]),
    )
    active_link_grants = (await db.execute(stmt_link_grants)).scalars().all()
    for lg in active_link_grants:
        lg.status = "REVOKED"
        lg.revoked_by = caller.user_id
        lg.revoked_at = now
        lg.revocation_reason = f"Liên kết dòng họ đã bị chấm dứt: {link.termination_reason or 'Hai dòng họ dừng liên kết'}"
        lg.updated_at = now
        db.add(AuditLog(
            log_id=uuid.uuid4(),
            clan_id=lg.owner_clan_id,
            actor_id=caller.user_id,
            action="lineage_access.revoke_on_link_termination",
            entity_type="LINEAGE_ACCESS_GRANT",
            entity_id=lg.id,
            new_data={"reason": lg.revocation_reason, "link_id": str(link.id)},
        ))

    await repo.commit()

    # Send in-app notification to the other clan's leader
    other_clan_id = link.clan_b_id if await caller.manages(link.clan_a_id) else link.clan_a_id
    caller_clan_id = link.clan_a_id if other_clan_id == link.clan_b_id else link.clan_b_id
    caller_clan = await repo.get_clan(caller_clan_id)
    caller_clan_name = caller_clan.name if caller_clan else "Dòng họ liên kết"

    other_admin_uids = await get_clan_admin_user_ids(db, other_clan_id)
    if other_admin_uids:
        reason_txt = f" Lý do: '{link.termination_reason}'." if link.termination_reason else ""
        notif = Notification(
            notification_id=uuid.uuid4(),
            clan_id=other_clan_id,
            type="LINK",
            title="Liên kết dòng họ đã bị chấm dứt",
            body=f"Dòng họ {caller_clan_name} đã chấm dứt liên kết liên họ.{reason_txt} Quyền truy cập phả hệ dùng chung đã lập tức bị thu hồi.",
            entity_type="LINK_TERMINATION",
            sender_name=getattr(caller.account, "display_name", None) or "Trưởng tộc " + caller_clan_name,
            sender_role="Trưởng tộc",
            target_audience="admin",
            priority="high",
            channels={"inApp": True, "email": False, "push": False},
            created_at=now,
        )
        db.add(notif)
        await db.flush()
        for ouid in other_admin_uids:
            db.add(UserNotification(
                notification_id=notif.notification_id,
                user_id=ouid,
                delivered_at=now,
            ))
        await db.commit()

    return {"status": "TERMINATED", "link_id": str(link.id)}




@router.get("/links/{link_id}/policies", response_model=List[PolicyResponse])
async def get_link_policies(
    link_id: str,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Gets shared data policies of a link of the caller's clans (FR-BO-57, FR-BO-77)."""
    link = await _visible_link(repo, caller, link_id)
    policies = await repo.list_policies(link.id)

    # Self-healing: if either clan lacks a policy row, create with default BASIC preset
    existing_owners = {p.owner_clan_id for p in policies}
    created_any = False
    for clan_owner in (link.clan_a_id, link.clan_b_id):
        if clan_owner not in existing_owners:
            new_p = InterClanSharedPolicy(
                id=uuid.uuid4(),
                link_id=link.id,
                owner_clan_id=clan_owner,
                data_scope="BASIC",
                allowed_fields=dict(SCOPE_PRESETS["BASIC"]),
                visibility="INTER_FAMILY",
                can_export=False,
            )
            repo.add(new_p)
            policies.append(new_p)
            created_any = True
    if created_any:
        await repo.commit()

    return [
        PolicyResponse(
            id=str(p.id),
            linkId=str(p.link_id),
            ownerClanId=str(p.owner_clan_id),
            dataScope=p.data_scope,
            allowedFields=normalize_allowed_fields(p.allowed_fields),
            visibility=p.visibility,
            canExport=p.can_export,
            updatedAt=p.updated_at,
        )
        for p in policies
    ]


@router.put("/links/{link_id}/policies")
async def update_sharing_policy(
    link_id: str,
    data: PolicyUpdate,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Updates the caller's OWN clan's sharing policy on a link (FR-BO-57, FR-BO-77): manage
    the policy's owner clan. Never the other clan's policy."""
    link = await _visible_link(repo, caller, link_id)
    sides = (link.clan_a_id, link.clan_b_id)

    if data.owner_clan_id is not None:
        owner = _uuid(data.owner_clan_id, "Policy")
        if owner not in sides:
            raise _not_found("Policy not found for this link")
        if not await caller.manages(owner):
            raise _forbidden("Managing the policy's owner clan is required")
    else:
        managed = [c for c in sides if await caller.manages(c)]
        if not managed:
            raise _forbidden("Managing the policy's owner clan is required")
        if len(managed) > 1:
            raise HTTPException(
                status_code=422,
                detail="ownerClanId is required: you manage both clans of this link",
            )
        owner = managed[0]

    policy = await repo.get_policy(link.id, owner)
    if not policy:
        policy = InterClanSharedPolicy(
            id=uuid.uuid4(),
            link_id=link.id,
            owner_clan_id=owner,
            data_scope="BASIC",
            allowed_fields=dict(SCOPE_PRESETS["BASIC"]),
            visibility="INTER_FAMILY",
            can_export=False,
        )
        repo.add(policy)

    if data.data_scope is not None:
        scope_upper = data.data_scope.upper().strip()
        policy.data_scope = scope_upper
        if data.allowed_fields is None and scope_upper in SCOPE_PRESETS:
            policy.allowed_fields = dict(SCOPE_PRESETS[scope_upper])

    if data.allowed_fields is not None:
        base_fields = normalize_allowed_fields(policy.allowed_fields or DEFAULT_ALLOWED_FIELDS)
        for k, v in data.allowed_fields.items():
            base_fields[k] = bool(v)
        policy.allowed_fields = base_fields

    if data.can_export is not None:
        policy.can_export = bool(data.can_export)

    policy.updated_by = caller.user_id
    policy.updated_at = datetime.now(timezone.utc)
    await repo.commit()

    return {
        "status": "SUCCESS",
        "policy_id": str(policy.id),
        "data_scope": policy.data_scope,
        "allowed_fields": policy.allowed_fields,
        "can_export": policy.can_export,
    }


@router.get("/link-requests", response_model=List[LinkRequestResponse])
async def list_link_requests(
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Lists connection requests sent by or to the caller's clans (SA: all)."""
    requests = await repo.list_requests(clan_ids=caller.scope())
    names = await repo.clan_names(c for r in requests for c in (r.source_clan_id, r.target_clan_id))

    output = []
    for req in requests:
        s_id = str(req.source_clan_id)
        t_id = str(req.target_clan_id)
        
        sp_name = None
        if req.source_person_id:
            sp = await repo.get_person(req.source_person_id)
            if sp:
                sp_name = sp.full_name
        tp_name = None
        if req.target_person_id:
            tp = await repo.get_person(req.target_person_id)
            if tp:
                tp_name = tp.full_name

        output.append(
            LinkRequestResponse(
                id=str(req.id),
                sourceFamilyId=s_id,
                sourceFamilyName=names.get(s_id, "Dòng họ nguồn"),
                targetFamilyId=t_id,
                targetFamilyName=names.get(t_id, "Dòng họ đích"),
                connectionType=getattr(req, "connection_type", "IN_LAW"),
                sourcePersonId=str(req.source_person_id) if req.source_person_id else None,
                targetPersonId=str(req.target_person_id) if req.target_person_id else None,
                sourcePersonName=sp_name,
                targetPersonName=tp_name,
                status=req.status,
                message=req.message,
                createdAt=req.created_at or datetime.now(timezone.utc),
            )
        )
    return output


@router.post("/link-requests", status_code=status.HTTP_201_CREATED, response_model=LinkRequestResponse)
async def create_link_request(
    data: LinkRequestCreate,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Sends a connection request (FR-BO-53) FROM a clan the caller manages."""
    if data.source_family_id is not None:
        source_id = _uuid(data.source_family_id, "Source family")
        if not caller.involved(source_id):
            raise _not_found("Dòng họ nguồn không tồn tại trong danh sách của bạn")
        is_manager = await caller.manages(source_id)
        is_self_source_person = False
        if not is_manager and data.source_person_id:
            src_p_id = _uuid(data.source_person_id, "Source person")
            stmt_user_person = select(PersonAccountLink).where(
                PersonAccountLink.user_id == caller.user_id,
                PersonAccountLink.person_id == src_p_id,
                PersonAccountLink.status == "ACTIVE"
            )
            up = (await db.execute(stmt_user_person)).scalar_one_or_none()
            if up:
                is_self_source_person = True

        if not is_manager and not is_self_source_person:
            raise _forbidden("Chỉ Trưởng tộc / Quản trị viên hoặc thành viên kết hôn liên họ mới có quyền gửi yêu cầu")
    else:
        managed = [c for c in sorted(caller.clans, key=str) if await caller.manages(c)]
        if len(managed) == 1:
            source_id = managed[0]
        elif len(caller.clans) == 1:
            source_id = list(caller.clans)[0]
        else:
            raise HTTPException(
                status_code=422,
                detail="sourceFamilyId là bắt buộc (chỉ định dòng họ gửi yêu cầu)",
            )

    source_clan = await repo.get_clan(source_id)
    target_id = _uuid(data.target_family_id, "Target family")
    target_clan = await repo.get_clan(target_id)
    if source_clan is None or source_clan.status != "ACTIVE":
        raise _not_found("Dòng họ gửi không tồn tại hoặc đã ngừng hoạt động")
    if target_clan is None or target_clan.status != "ACTIVE":
        raise _not_found("Dòng họ nhận không tồn tại hoặc đã ngừng hoạt động")
    if target_id == source_id:
        raise HTTPException(status_code=422, detail="Một dòng họ không thể tự gửi yêu cầu liên họ tới chính mình")

    # Symmetric Check 1: Check existing ACTIVE link between both clans
    active_link = await repo.find_active_link_between(source_id, target_id)
    if active_link:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Hai dòng họ này đã có liên kết liên họ đang hoạt động.",
        )

    # Symmetric Check 2: Check existing PENDING request between both clans
    pending_req = await repo.find_pending_request_between(source_id, target_id)
    if pending_req:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Đã có yêu cầu liên họ đang chờ duyệt giữa hai dòng họ này. Vui lòng kiểm tra danh sách yêu cầu.",
        )

    conn_type = (data.connection_type or "IN_LAW").upper()
    if conn_type not in ["IN_LAW", "ANCESTRAL", "ALLIED"]:
        raise HTTPException(status_code=422, detail="Loại liên kết không hợp lệ. Phải là IN_LAW, ANCESTRAL hoặc ALLIED.")

    # Person validation
    person_ids: dict[str, Optional[uuid.UUID]] = {"sourcePersonId": None, "targetPersonId": None}
    source_person_obj = None
    target_person_obj = None

    if conn_type == "IN_LAW":
        if not data.source_person_id or not data.target_person_id:
            raise HTTPException(
                status_code=422,
                detail="Liên kết thông gia (IN_LAW) bắt buộc phải chọn cặp thành viên (Person) đại diện từ cả hai dòng họ.",
            )
        source_person_obj = await repo.get_person(_uuid(data.source_person_id, "Source person"))
        if not source_person_obj or source_person_obj.family_id != source_id:
            raise HTTPException(
                status_code=422,
                detail="Thành viên nguồn không tồn tại hoặc không thuộc dòng họ gửi yêu cầu.",
            )
        target_person_obj = await repo.get_person(_uuid(data.target_person_id, "Target person"))
        if not target_person_obj or target_person_obj.family_id != target_id:
            raise HTTPException(
                status_code=422,
                detail="Thành viên đích không tồn tại hoặc không thuộc dòng họ nhận yêu cầu.",
            )
        person_ids["sourcePersonId"] = source_person_obj.id
        person_ids["targetPersonId"] = target_person_obj.id
    else:
        # ANCESTRAL or ALLIED: person pairs are optional
        if data.source_person_id:
            p = await repo.get_person(_uuid(data.source_person_id, "Source person"))
            if p and p.family_id == source_id:
                person_ids["sourcePersonId"] = p.id
                source_person_obj = p
        if data.target_person_id:
            p = await repo.get_person(_uuid(data.target_person_id, "Target person"))
            if p and p.family_id == target_id:
                person_ids["targetPersonId"] = p.id
                target_person_obj = p

    req = InterClanRequest(
        id=uuid.uuid4(),
        source_clan_id=source_id,
        target_clan_id=target_id,
        connection_type=conn_type,
        requester_id=caller.user_id,
        source_person_id=person_ids["sourcePersonId"],
        target_person_id=person_ids["targetPersonId"],
        message=data.message,
        status="PENDING",
    )
    repo.add(req)
    await repo.flush()

    # Send in-app notification to target clan admins
    now = datetime.now(timezone.utc)
    target_admin_uids = await get_clan_admin_user_ids(db, target_id)
    conn_label = "Thông gia" if conn_type == "IN_LAW" else ("Cùng tổ tiên" if conn_type == "ANCESTRAL" else "Hợp tác / Giao hảo")
    if target_admin_uids:
        msg_detail = f" Lời nhắn: '{data.message}'." if data.message else ""
        notif = Notification(
            notification_id=uuid.uuid4(),
            clan_id=target_id,
            type="LINK",
            title=f"Yêu cầu liên họ mới từ {source_clan.name}",
            body=f"Dòng họ {source_clan.name} đã gửi lời mời liên họ loại '{conn_label}'.{msg_detail} Vui lòng xem xét và phê duyệt.",
            entity_type="LINK_REQUEST",
            sender_name=getattr(caller.account, "display_name", None) or ("Trưởng tộc " + source_clan.name if (await caller.manages(source_id)) else "Thành viên " + source_clan.name),
            sender_role="Trưởng tộc" if (await caller.manages(source_id)) else "Thành viên",
            target_audience="admin",
            priority="high",
            channels={"inApp": True, "email": False, "push": False},
            created_at=now,
        )
        db.add(notif)
        await db.flush()
        for tuid in target_admin_uids:
            db.add(UserNotification(
                notification_id=notif.notification_id,
                user_id=tuid,
                delivered_at=now,
            ))

    await repo.commit()

    return LinkRequestResponse(
        id=str(req.id),
        sourceFamilyId=str(req.source_clan_id),
        sourceFamilyName=source_clan.name,
        targetFamilyId=str(req.target_clan_id),
        targetFamilyName=target_clan.name,
        connectionType=req.connection_type,
        sourcePersonId=str(req.source_person_id) if req.source_person_id else None,
        targetPersonId=str(req.target_person_id) if req.target_person_id else None,
        sourcePersonName=source_person_obj.full_name if source_person_obj else None,
        targetPersonName=target_person_obj.full_name if target_person_obj else None,
        status=req.status,
        message=req.message,
        createdAt=req.created_at or now,
    )


@router.post("/link-requests/{request_id}/review")
async def review_link_request(
    request_id: str,
    data: LinkRequestReview,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Approves or rejects a request (FR-BO-54): manage the TARGET clan."""
    req = await repo.get_request(_uuid(request_id, "Request"))
    if not req or not caller.involved(req.source_clan_id, req.target_clan_id):
        raise _not_found("Yêu cầu liên họ không tồn tại")

    # RBAC & Anti-Self-Approval:
    # Caller must manage the target clan
    if not await caller.manages(req.target_clan_id):
        raise _forbidden("Chỉ Trưởng tộc / Quản trị viên của dòng họ nhận mới có quyền phê duyệt yêu cầu này.")

    # Prevent self-approval: caller cannot approve if they only represent source clan
    if req.source_clan_id == req.target_clan_id:
        raise _forbidden("Không thể tự duyệt yêu cầu của cùng một dòng họ.")

    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Yêu cầu này đã được xử lý trước đó ({req.status})")

    now = datetime.now(timezone.utc)
    action = data.action.upper()

    try:
        source_admin_uids = await get_clan_admin_user_ids(db, req.source_clan_id)
        target_clan = await repo.get_clan(req.target_clan_id)
        target_clan_name = target_clan.name if target_clan else "Dòng họ nhận"

        if action == "APPROVE":
            # Check duplicate active link once more
            existing_link = await repo.find_active_link_between(req.source_clan_id, req.target_clan_id)
            if existing_link:
                raise HTTPException(status_code=409, detail="Hai dòng họ đã có liên kết đang hoạt động.")

            req.status = "APPROVED"
            req.reviewed_by = caller.user_id
            req.reviewed_at = now

            # Create active InterClanLink
            link = InterClanLink(
                id=uuid.uuid4(),
                request_id=req.id,
                clan_a_id=req.source_clan_id,
                clan_b_id=req.target_clan_id,
                connection_type=getattr(req, "connection_type", "IN_LAW"),
                status="ACTIVE",
                linked_at=now,
            )
            repo.add(link)
            await repo.flush()

            # Create default InterClanSharedPolicy for both clans atomically
            for owner in (req.source_clan_id, req.target_clan_id):
                repo.add(
                    InterClanSharedPolicy(
                        id=uuid.uuid4(),
                        link_id=link.id,
                        owner_clan_id=owner,
                        data_scope="BASIC",
                        allowed_fields=dict(DEFAULT_ALLOWED_FIELDS),
                        visibility="INTER_FAMILY",
                        can_export=False,
                        updated_by=caller.user_id,
                    )
                )

            # If this is an IN_LAW link with a verified person pair, record the verified person mapping
            if req.source_person_id and req.target_person_id:
                repo.add(
                    InterClanPersonMapping(
                        id=uuid.uuid4(),
                        link_id=link.id,
                        clan_a_id=link.clan_a_id,
                        person_a_id=req.source_person_id,
                        clan_b_id=link.clan_b_id,
                        person_b_id=req.target_person_id,
                        relationship_type="SPOUSE",
                        status="VERIFIED",
                        requested_by=req.requester_id,
                        requested_clan_id=req.source_clan_id,
                        verified_by=caller.user_id,
                        verified_at=now,
                        notes="Khởi tạo tự động từ cặp thông gia khi phê duyệt liên kết liên họ",
                    )
                )

            # In-app notification to source clan admins
            if source_admin_uids:
                notif = Notification(
                    notification_id=uuid.uuid4(),
                    clan_id=req.source_clan_id,
                    type="LINK",
                    title="Yêu cầu liên họ đã được chấp thuận",
                    body=f"Dòng họ {target_clan_name} đã chấp thuận lời mời liên họ. Hai dòng tộc hiện đã chính thức kết nối.",
                    entity_type="LINK_REQUEST",
                    sender_name=getattr(caller.account, "display_name", None) or "Trưởng tộc " + target_clan_name,
                    sender_role="Trưởng tộc",
                    target_audience="admin",
                    priority="high",
                    channels={"inApp": True, "email": False, "push": False},
                    created_at=now,
                )
                db.add(notif)
                await db.flush()
                for suid in source_admin_uids:
                    db.add(UserNotification(
                        notification_id=notif.notification_id,
                        user_id=suid,
                        delivered_at=now,
                    ))

            await repo.commit()
            return {"status": "APPROVED", "link_id": str(link.id)}

        elif action == "REJECT":
            req.status = "REJECTED"
            req.reviewed_by = caller.user_id
            req.reviewed_at = now

            # In-app notification to source clan admins
            if source_admin_uids:
                reason_txt = f" Lý do: '{data.reason}'." if data.reason else ""
                notif = Notification(
                    notification_id=uuid.uuid4(),
                    clan_id=req.source_clan_id,
                    type="LINK",
                    title="Yêu cầu liên họ đã bị từ chối",
                    body=f"Dòng họ {target_clan_name} đã từ chối yêu cầu liên họ.{reason_txt}",
                    entity_type="LINK_REQUEST",
                    sender_name=getattr(caller.account, "display_name", None) or "Trưởng tộc " + target_clan_name,
                    sender_role="Trưởng tộc",
                    target_audience="admin",
                    priority="normal",
                    channels={"inApp": True, "email": False, "push": False},
                    created_at=now,
                )
                db.add(notif)
                await db.flush()
                for suid in source_admin_uids:
                    db.add(UserNotification(
                        notification_id=notif.notification_id,
                        user_id=suid,
                        delivered_at=now,
                    ))

            await repo.commit()
            return {"status": "REJECTED"}

        else:
            raise HTTPException(status_code=400, detail="Invalid review action. Must be APPROVE or REJECT.")
    except Exception:
        await repo.rollback()
        raise


