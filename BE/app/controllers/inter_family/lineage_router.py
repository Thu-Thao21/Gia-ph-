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


async def serialize_person_mapping(
    mapping: InterClanPersonMapping, repo: InterFamilyRepository
) -> PersonMappingResponse:
    clan_names = await repo.clan_names([mapping.clan_a_id, mapping.clan_b_id])
    p_a = await repo.get_person(mapping.person_a_id)
    p_b = await repo.get_person(mapping.person_b_id)
    return PersonMappingResponse(
        id=str(mapping.id),
        link_id=str(mapping.link_id),
        clan_a_id=str(mapping.clan_a_id),
        clan_a_name=clan_names.get(str(mapping.clan_a_id), "Dòng họ"),
        person_a_id=str(mapping.person_a_id),
        person_a_name=p_a.full_name if p_a else "Thành viên",
        person_a_gender=p_a.gender if p_a else None,
        clan_b_id=str(mapping.clan_b_id),
        clan_b_name=clan_names.get(str(mapping.clan_b_id), "Dòng họ"),
        person_b_id=str(mapping.person_b_id),
        person_b_name=p_b.full_name if p_b else "Thành viên",
        person_b_gender=p_b.gender if p_b else None,
        relationship_type=mapping.relationship_type,
        status=mapping.status,
        requested_by=str(mapping.requested_by) if mapping.requested_by else None,
        requested_clan_id=str(mapping.requested_clan_id),
        verified_by=str(mapping.verified_by) if mapping.verified_by else None,
        verified_at=mapping.verified_at,
        review_notes=mapping.review_notes,
        notes=mapping.notes,
        created_at=mapping.created_at,
    )


@router.get("/links/{link_id}/person-mappings", response_model=List[PersonMappingResponse])
async def list_person_mappings(
    link_id: str,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    link_uuid = _uuid(link_id, "link_id")
    link = await repo.get_link(link_uuid)
    if not link:
        raise _not_found("Liên kết liên họ không tồn tại.")
    if caller.scope() is not None and not (caller.scope() & {link.clan_a_id, link.clan_b_id}):
        raise _forbidden("Không có quyền xem thông tin liên kết của dòng họ này.")

    mappings = await repo.list_person_mappings(link_uuid)
    return [await serialize_person_mapping(m, repo) for m in mappings]


@router.post("/links/{link_id}/person-mappings", status_code=status.HTTP_201_CREATED, response_model=PersonMappingResponse)
async def create_person_mapping(
    link_id: str,
    data: PersonMappingCreate,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
    db: AsyncSession = Depends(get_db),
):
    link_uuid = _uuid(link_id, "link_id")
    link = await repo.get_link(link_uuid)
    if not link or link.status != "ACTIVE":
        raise _bad_request("Liên kết không tồn tại hoặc không ở trạng thái ACTIVE.")
    if link.connection_type != "IN_LAW":
        raise _bad_request("Chỉ liên kết loại Thông gia (IN_LAW) mới hỗ trợ ánh xạ cặp Person.")

    # Determine caller's clan in this link
    manages_a = await caller.manages(link.clan_a_id)
    manages_b = await caller.manages(link.clan_b_id)
    if not (manages_a or manages_b):
        raise _forbidden("Chỉ Trưởng tộc hoặc Family Admin của dòng họ trong liên kết mới có quyền đề xuất ánh xạ Person.")

    source_clan_id = link.clan_a_id if manages_a else link.clan_b_id
    target_clan_id = link.clan_b_id if manages_a else link.clan_a_id

    source_p_uuid = _uuid(data.source_person_id, "source_person_id")
    target_p_uuid = _uuid(data.target_person_id, "target_person_id")

    source_p = await repo.get_person(source_p_uuid)
    if not source_p or source_p.family_id != source_clan_id:
        raise _bad_request("Thành viên thứ nhất không tồn tại hoặc không thuộc dòng họ của bạn.")

    target_p = await repo.get_person(target_p_uuid)
    if not target_p or target_p.family_id != target_clan_id:
        raise _bad_request("Thành viên thứ hai không tồn tại hoặc không thuộc dòng họ đối tác.")

    # Check for symmetric duplicate mapping
    existing = await repo.find_person_mapping_between(source_p_uuid, target_p_uuid)
    if existing:
        if existing.status == "VERIFIED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cặp thành viên thông gia này đã được xác minh trước đó.",
            )
        elif existing.status == "PENDING":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Đã có yêu cầu xác minh đang chờ xử lý cho cặp thành viên này.",
            )

    now = datetime.now(timezone.utc)
    mapping = InterClanPersonMapping(
        id=uuid.uuid4(),
        link_id=link.id,
        clan_a_id=source_clan_id,
        person_a_id=source_p_uuid,
        clan_b_id=target_clan_id,
        person_b_id=target_p_uuid,
        relationship_type=data.relationship_type or "SPOUSE",
        status="PENDING",
        requested_by=caller.user_id,
        requested_clan_id=source_clan_id,
        notes=data.notes,
        created_at=now,
    )
    repo.add(mapping)
    await repo.flush()

    # Fan out in-app notification to target clan admins
    target_admins = await get_clan_admin_user_ids(db, target_clan_id)
    source_clan_names = await repo.clan_names([source_clan_id])
    s_clan_name = source_clan_names.get(str(source_clan_id), "Dòng họ đối tác")
    if target_admins:
        notif = Notification(
            notification_id=uuid.uuid4(),
            clan_id=target_clan_id,
            type="LINK",
            title=f"Đề xuất xác minh thông gia mới từ {s_clan_name}",
            body=f"Dòng họ {s_clan_name} đề xuất xác minh cặp thông gia: {source_p.full_name} ⟷ {target_p.full_name}. Vui lòng xác nhận chính danh.",
            entity_type="PERSON_MAPPING",
            sender_name=getattr(caller.account, "display_name", None) or "Trưởng tộc " + s_clan_name,
            sender_role="Trưởng tộc",
            target_audience="admin",
            priority="high",
            channels={"inApp": True, "email": False, "push": False},
            created_at=now,
        )
        db.add(notif)
        await db.flush()
        for tuid in target_admins:
            db.add(UserNotification(
                notification_id=notif.notification_id,
                user_id=tuid,
                delivered_at=now,
            ))

    await repo.commit()
    return await serialize_person_mapping(mapping, repo)


@router.post("/person-mappings/{mapping_id}/review", response_model=PersonMappingResponse)
async def review_person_mapping(
    mapping_id: str,
    data: PersonMappingReview,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
    db: AsyncSession = Depends(get_db),
):
    mapping_uuid = _uuid(mapping_id, "mapping_id")
    mapping = await repo.get_person_mapping(mapping_uuid)
    if not mapping:
        raise _not_found("Yêu cầu xác minh cặp thông gia không tồn tại.")
    if mapping.status != "PENDING":
        raise _bad_request(f"Yêu cầu này đã được xử lý (trạng thái: {mapping.status}).")

    # Receiving clan is the clan in the link that did NOT create the request
    target_clan_id = mapping.clan_b_id if mapping.requested_clan_id == mapping.clan_a_id else mapping.clan_a_id
    if not await caller.manages(target_clan_id):
        raise _forbidden("Chỉ Trưởng tộc hoặc Family Admin của dòng họ nhận mới có quyền phê duyệt xác minh hồ sơ này.")

    now = datetime.now(timezone.utc)
    act = data.action.strip().upper()
    if act == "VERIFY":
        mapping.status = "VERIFIED"
        mapping.verified_by = caller.user_id
        mapping.verified_at = now
        mapping.review_notes = data.notes
    elif act == "REJECT":
        mapping.status = "REJECTED"
        mapping.verified_by = caller.user_id
        mapping.verified_at = now
        mapping.review_notes = data.notes
    else:
        raise _bad_request("Hành động không hợp lệ (chỉ chấp nhận 'VERIFY' hoặc 'REJECT').")

    # In-app notification to requesting clan admins
    req_admins = await get_clan_admin_user_ids(db, mapping.requested_clan_id)
    t_clan_names = await repo.clan_names([target_clan_id])
    t_name = t_clan_names.get(str(target_clan_id), "Dòng họ đối tác")
    p_a = await repo.get_person(mapping.person_a_id)
    p_b = await repo.get_person(mapping.person_b_id)
    p_names = f"{p_a.full_name if p_a else 'Thành viên'} ⟷ {p_b.full_name if p_b else 'Thành viên'}"

    if req_admins:
        title = "Hồ sơ thông gia đã được xác minh" if act == "VERIFY" else "Đề xuất thông gia đã bị từ chối"
        verdict = "chấp thuận xác nhận chính danh" if act == "VERIFY" else "từ chối xác nhận"
        notif = Notification(
            notification_id=uuid.uuid4(),
            clan_id=mapping.requested_clan_id,
            type="LINK",
            title=title,
            body=f"Dòng họ {t_name} đã {verdict} cho cặp thông gia {p_names}. {data.notes or ''}",
            entity_type="PERSON_MAPPING",
            sender_name=getattr(caller.account, "display_name", None) or "Trưởng tộc " + t_name,
            sender_role="Trưởng tộc",
            target_audience="admin",
            priority="normal",
            channels={"inApp": True, "email": False, "push": False},
            created_at=now,
        )
        db.add(notif)
        await db.flush()
        for r_uid in req_admins:
            db.add(UserNotification(
                notification_id=notif.notification_id,
                user_id=r_uid,
                delivered_at=now,
            ))

    await repo.commit()
    return await serialize_person_mapping(mapping, repo)


@router.post("/person-mappings/{mapping_id}/revoke")
async def revoke_person_mapping(
    mapping_id: str,
    data: PersonMappingRevoke,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
    db: AsyncSession = Depends(get_db),
):
    mapping_uuid = _uuid(mapping_id, "mapping_id")
    mapping = await repo.get_person_mapping(mapping_uuid)
    if not mapping:
        raise _not_found("Hồ sơ ánh xạ không tồn tại.")
    if mapping.status != "VERIFIED":
        raise _bad_request("Chỉ có thể thu hồi liên kết đối với hồ sơ đã xác minh (VERIFIED).")

    manages_a = await caller.manages(mapping.clan_a_id)
    manages_b = await caller.manages(mapping.clan_b_id)
    if not (manages_a or manages_b):
        raise _forbidden("Không có quyền thu hồi liên kết của hồ sơ này.")

    now = datetime.now(timezone.utc)
    mapping.status = "REVOKED"
    mapping.review_notes = data.reason

    # Tự động thu hồi quyền xem gia phả liên họ khi quan hệ hôn nhân liên họ bị thu hồi / ly hôn
    stmt_grants = select(LineageAccessGrant).where(
        LineageAccessGrant.status == "ACTIVE",
        LineageAccessGrant.anchor_person_id.in_([mapping.person_a_id, mapping.person_b_id]),
    )
    active_grants = (await db.execute(stmt_grants)).scalars().all()
    for g in active_grants:
        g.status = "REVOKED"
        g.revoked_by = caller.user_id
        g.revoked_at = now
        g.revocation_reason = f"Quan hệ hôn nhân liên họ đã bị thu hồi / ly hôn: {data.reason or 'Không có lý do'}"
        g.updated_at = now
        db.add(AuditLog(
            log_id=uuid.uuid4(),
            clan_id=g.owner_clan_id,
            actor_id=caller.user_id,
            action="lineage_access.revoke_on_divorce",
            entity_type="LINEAGE_ACCESS_GRANT",
            entity_id=g.id,
            new_data={"reason": g.revocation_reason, "mapping_id": str(mapping.id)},
        ))

    await repo.commit()
    return {"status": "REVOKED", "mapping_id": str(mapping.id)}



@router.get("/persons/{person_id}/dual-lineage")
async def get_dual_lineage(
    person_id: uuid.UUID,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns 2-3 generations of Paternal (Noi) and Maternal (Ngoai) lineage for a person,
    leveraging both internal clan parent-child relationships and cross-clan person mappings.
    Available to all authenticated members of the involved clans.
    """
    # 1. Fetch target person info
    stmt_p = text("""
        SELECT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.clan_id, c.name as clan_name
        FROM persons p
        JOIN clans c ON p.clan_id = c.clan_id
        WHERE p.person_id = :pid;
    """)
    res_p = await db.execute(stmt_p, {"pid": person_id})
    p_row = res_p.fetchone()
    if not p_row:
        raise _not_found("Hồ sơ thành viên không tồn tại.")
    person_info = dict(p_row._mapping)

    # 2. Check for in-law marriage bridge (inter_clan_person_mappings)
    stmt_map = text("""
        SELECT m.mapping_id, m.link_id, m.person_a_id, m.clan_a_id, ca.name as clan_a_name, pa.full_name as name_a, pa.gender as gender_a,
               m.person_b_id, m.clan_b_id, cb.name as clan_b_name, pb.full_name as name_b, pb.gender as gender_b
        FROM inter_clan_person_mappings m
        JOIN persons pa ON m.person_a_id = pa.person_id
        JOIN clans ca ON m.clan_a_id = ca.clan_id
        JOIN persons pb ON m.person_b_id = pb.person_id
        JOIN clans cb ON m.clan_b_id = cb.clan_id
        WHERE m.status = 'VERIFIED'
          AND (m.person_a_id = :pid OR m.person_b_id = :pid);
    """)
    res_map = await db.execute(stmt_map, {"pid": person_id})
    map_row = res_map.fetchone()

    spouse_bridge = None
    partner_id = None
    if map_row:
        m = dict(map_row._mapping)
        is_a = m["person_a_id"] == person_id
        partner_id = m["person_b_id"] if is_a else m["person_a_id"]
        partner_name = m["name_b"] if is_a else m["name_a"]
        partner_clan_name = m["clan_b_name"] if is_a else m["clan_a_name"]
        partner_clan_id = m["clan_b_id"] if is_a else m["clan_a_id"]
        partner_gender = m["gender_b"] if is_a else m["gender_a"]
        spouse_bridge = {
            "partnerPersonId": str(partner_id),
            "partnerName": partner_name,
            "partnerClanName": partner_clan_name,
            "partnerClanId": str(partner_clan_id),
            "partnerGender": partner_gender,
            "linkId": str(m["link_id"]),
            "isCrossClan": True,
        }

    # Helper to traverse parents up to depth generations (default depth=2: Level -1 Cha/Mẹ, Level -2 Ông/Bà -> tổng phạm vi 4 đời)
    async def get_ancestors_tree(start_person_id, depth=2):
        levels = []
        current_ids = [start_person_id]
        titles = {1: "Cha / Mẹ", 2: "Ông / Bà"}
        for d in range(1, depth + 1):
            if not current_ids:
                break
            stmt_par = text("""
                SELECT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.clan_id, c.name as clan_name
                FROM relationships r
                JOIN persons p ON r.from_person_id = p.person_id
                JOIN clans c ON p.clan_id = c.clan_id
                WHERE r.to_person_id IN :ids
                  AND r.relationship_type = 'PARENT_CHILD'
                  AND r.status = 'ACTIVE'
                ORDER BY p.gender DESC, p.full_name;
            """).bindparams(bindparam("ids", expanding=True))
            par_res = await db.execute(stmt_par, {"ids": current_ids})
            parents = [dict(r._mapping) for r in par_res.fetchall()]
            if not parents:
                break
            levels.append({
                "level": d,
                "title": titles.get(d, f"Đời thứ {d}"),
                "members": [
                    {
                        "id": str(p["person_id"]),
                        "fullName": p["full_name"],
                        "gender": p["gender"],
                        "generation": p["generation_no"],
                        "isLiving": p["is_living"],
                        "clanId": str(p["clan_id"]),
                        "clanName": p["clan_name"],
                    }
                    for p in parents
                ]
            })
            current_ids = [p["person_id"] for p in parents]
        return levels

    # If target person is part of a cross-clan marriage:
    if spouse_bridge and partner_id:
        is_male = str(person_info["gender"]).upper() == "MALE"
        husband_id = person_id if is_male else partner_id
        wife_id = partner_id if is_male else person_id
        husband_clan_name = person_info["clan_name"] if is_male else spouse_bridge["partnerClanName"]
        husband_clan_id = person_info["clan_id"] if is_male else spouse_bridge["partnerClanId"]
        wife_clan_name = spouse_bridge["partnerClanName"] if is_male else person_info["clan_name"]
        wife_clan_id = spouse_bridge["partnerClanId"] if is_male else person_info["clan_id"]

        # Kiểm tra bảo mật quyền xem gia phả bên dòng họ đối tác:
        # Caller chỉ xem được tổ tiên của partner nếu là SA, thuộc dòng họ partner, hoặc có LineageAccessGrant ACTIVE
        partner_clan_uuid = uuid.UUID(spouse_bridge["partnerClanId"])
        has_partner_access = (
            caller.is_sa
            or (partner_clan_uuid in caller.clans)
        )
        if not has_partner_access:
            stmt_partner_grant = select(LineageAccessGrant).where(
                LineageAccessGrant.owner_clan_id == partner_clan_uuid,
                LineageAccessGrant.grantee_user_id == caller.user_id,
                LineageAccessGrant.status == "ACTIVE",
            )
            has_partner_access = bool((await db.execute(stmt_partner_grant)).scalar_one_or_none())

        target_levels = await get_ancestors_tree(person_id, depth=2)
        partner_levels = await get_ancestors_tree(partner_id, depth=2) if has_partner_access else []

        paternal_levels = target_levels if is_male else partner_levels
        maternal_levels = partner_levels if is_male else target_levels

        paternal_side = {
            "clanId": str(husband_clan_id),
            "clanName": f"{husband_clan_name} (Bên Nội)",
            "generations": paternal_levels,
            "hasAccess": True if is_male else has_partner_access,
            "notice": None if (is_male or has_partner_access) else "Cần được Trưởng tộc dòng họ bên chồng xét duyệt để xem nhánh gia phả 4 đời.",
        }
        maternal_side = {
            "clanId": str(wife_clan_id),
            "clanName": f"{wife_clan_name} (Bên Ngoại)",
            "generations": maternal_levels,
            "hasAccess": has_partner_access if is_male else True,
            "notice": None if (not is_male or has_partner_access) else "Cần được Trưởng tộc dòng họ bên vợ xét duyệt để xem nhánh gia phả 4 đời.",
        }
    else:
        # Traversal from direct parents: Father side and Mother side
        stmt_parents = text("""
            SELECT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.clan_id, c.name as clan_name
            FROM relationships r
            JOIN persons p ON r.from_person_id = p.person_id
            JOIN clans c ON p.clan_id = c.clan_id
            WHERE r.to_person_id = :pid
              AND r.relationship_type = 'PARENT_CHILD'
              AND r.status = 'ACTIVE';
        """)
        pars_res = await db.execute(stmt_parents, {"pid": person_id})
        parents = [dict(r._mapping) for r in pars_res.fetchall()]
        father = next((p for p in parents if str(p["gender"]).upper() == "MALE"), None)
        mother = next((p for p in parents if str(p["gender"]).upper() == "FEMALE"), None)

        paternal_levels = await get_ancestors_tree(father["person_id"]) if father else []
        maternal_levels = await get_ancestors_tree(mother["person_id"]) if mother else []

        paternal_side = {
            "clanId": str(father["clan_id"]) if father else str(person_info["clan_id"]),
            "clanName": f"{father['clan_name'] if father else person_info['clan_name']} (Bên Nội)",
            "generations": paternal_levels
        }
        maternal_side = {
            "clanId": str(mother["clan_id"]) if mother else "",
            "clanName": f"{mother['clan_name'] if mother else 'Bên Ngoại'} (Bên Ngoại)",
            "generations": maternal_levels
        }

    return {
        "person": {
            "id": str(person_info["person_id"]),
            "fullName": person_info["full_name"],
            "gender": person_info["gender"],
            "generation": person_info["generation_no"],
            "clanId": str(person_info["clan_id"]),
            "clanName": person_info["clan_name"],
        },
        "spouseBridge": spouse_bridge,
        "paternalSide": paternal_side,
        "maternalSide": maternal_side,
    }


@router.get("/my-family-network")
async def get_my_family_network(
    clan_id: Optional[uuid.UUID] = Query(None, description="Tùy chọn clan_id nếu người dùng muốn chọn gia tộc cụ thể"),
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    My Family Network (Mạng lưới liên họ lấy Member/Ego làm trung tâm):
    - Đặt Person đã xác minh liên kết với tài khoản Member làm trung tâm (Ego).
    - Hiển thị cây gia phả dòng họ gốc của Ego.
    - Kết nối với nhánh dòng họ bên phối ngẫu qua hôn nhân liên họ trong cùng một đồ thị.
    - Phạm vi chia sẻ bên phối ngẫu tuân thủ nghiêm ngặt tối đa 4 thế hệ (Ông bà, Cha mẹ, Phối ngẫu, Con cái).
    - Áp dụng chính sách bảo mật chia sẻ (InterClanSharedPolicy) độc lập giữa 2 dòng họ.
    """
    # 1. Xác định hồ sơ Person liên kết với tài khoản Member hiện tại
    stmt_link = (
        select(PersonAccountLink, Person, Clan)
        .join(Person, PersonAccountLink.person_id == Person.id)
        .join(Clan, Person.family_id == Clan.clan_id)
        .where(
            PersonAccountLink.user_id == caller.user_id,
            PersonAccountLink.status == "ACTIVE",
        )
    )
    if clan_id:
        stmt_link = stmt_link.where(Person.family_id == clan_id)

    res_links = (await db.execute(stmt_link)).all()

    if not res_links:
        stmt_pending = select(PersonAccountLink).where(PersonAccountLink.user_id == caller.user_id)
        pending_link = (await db.execute(stmt_pending)).scalar_one_or_none()
        msg = (
            "Hồ sơ của bạn đang chờ quản trị viên phê duyệt liên kết."
            if pending_link and pending_link.status == "PENDING"
            else "Tài khoản hiện chưa được liên kết với hồ sơ thành viên nào trong gia phả."
        )
        return {
            "isLinked": False,
            "ego": None,
            "natalClan": None,
            "spouseClan": None,
            "nodes": [],
            "edges": [],
            "bridges": [],
            "generationCounts": {"-2": 0, "-1": 0, "0": 0, "1": 0},
            "hasCrossClanLink": False,
            "message": msg,
        }

    link_row = res_links[0]
    ego_person = link_row[1]
    natal_clan = link_row[2]

    nodes_dict: dict[str, dict[str, Any]] = {}
    edges_list: list[dict[str, Any]] = []
    edges_seen: set[str] = set()

    def add_edge(u: str, v: str, edge_type: str, label: str):
        if edge_type in ("MARRIAGE", "INTER_CLAN_BRIDGE"):
            p1, p2 = sorted([u, v])
            edge_key = f"{p1}<->{p2}:{edge_type}"
        else:
            edge_key = f"{u}->{v}:{edge_type}"

        if edge_key not in edges_seen:
            edges_seen.add(edge_key)
            edges_list.append({
                "id": f"edge_{len(edges_list) + 1}",
                "source": u,
                "target": v,
                "type": edge_type,
                "label": label,
            })

    # Tạo node Ego
    ego_id = str(ego_person.id)
    ego_gender = (ego_person.gender or "OTHER").upper()
    nodes_dict[ego_id] = {
        "id": ego_id,
        "fullName": ego_person.full_name,
        "gender": ego_gender,
        "generation": ego_person.generation or 1,
        "relativeLevel": 0,
        "relativeRole": "EGO",
        "clanId": str(natal_clan.clan_id),
        "clanName": natal_clan.name,
        "isEgo": True,
        "isSpouse": False,
        "isLiving": ego_person.is_alive if ego_person.is_alive is not None else True,
        "avatarUrl": ego_person.avatar_url,
        "isCrossClan": False,
        "canExpand": False,
        "privacyMasked": False,
    }

    # 2. Truy vấn nhánh Dòng Họ Gốc của Ego (Natal Subgraph)
    # 2.1. Cha mẹ của Ego (Level -1)
    stmt_parents = text("""
        SELECT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.avatar_storage_key, p.clan_id, c.name as clan_name
        FROM relationships r
        JOIN persons p ON r.from_person_id = p.person_id
        JOIN clans c ON p.clan_id = c.clan_id
        WHERE r.to_person_id = :ego_id
          AND r.relationship_type = 'PARENT_CHILD'
          AND r.status = 'ACTIVE'
        ORDER BY p.gender DESC, p.full_name;
    """)
    res_parents = await db.execute(stmt_parents, {"ego_id": ego_person.id})
    parents = [dict(r._mapping) for r in res_parents.fetchall()]
    parent_ids = [p["person_id"] for p in parents]

    for p in parents:
        pid = str(p["person_id"])
        pgender = (p["gender"] or "OTHER").upper()
        prole = "FATHER" if pgender == "MALE" else ("MOTHER" if pgender == "FEMALE" else "PARENT")
        if pid not in nodes_dict:
            nodes_dict[pid] = {
                "id": pid,
                "fullName": p["full_name"],
                "gender": pgender,
                "generation": p["generation_no"] or (ego_person.generation - 1 if ego_person.generation else 1),
                "relativeLevel": -1,
                "relativeRole": prole,
                "clanId": str(p["clan_id"]),
                "clanName": p["clan_name"],
                "isEgo": False,
                "isSpouse": False,
                "isLiving": p["is_living"],
                "avatarUrl": p["avatar_storage_key"],
                "isCrossClan": False,
                "canExpand": False,
                "privacyMasked": False,
            }
        add_edge(pid, ego_id, "BLOODLINE", "Cha - Con" if pgender == "MALE" else "Mẹ - Con")

    # 2.2. Ông bà của Ego (Level -2)
    grandparent_ids = []
    if parent_ids:
        stmt_grandparents = text("""
            SELECT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.avatar_storage_key, p.clan_id, c.name as clan_name, r.to_person_id as child_id
            FROM relationships r
            JOIN persons p ON r.from_person_id = p.person_id
            JOIN clans c ON p.clan_id = c.clan_id
            WHERE r.to_person_id IN :parent_ids
              AND r.relationship_type = 'PARENT_CHILD'
              AND r.status = 'ACTIVE'
            ORDER BY p.gender DESC, p.full_name;
        """).bindparams(bindparam("parent_ids", expanding=True))
        res_gp = await db.execute(stmt_grandparents, {"parent_ids": parent_ids})
        grandparents = [dict(r._mapping) for r in res_gp.fetchall()]
        for gp in grandparents:
            gpid = str(gp["person_id"])
            grandparent_ids.append(gp["person_id"])
            gpgender = (gp["gender"] or "OTHER").upper()
            gprole = "GRANDFATHER" if gpgender == "MALE" else ("GRANDMOTHER" if gpgender == "FEMALE" else "GRANDPARENT")
            if gpid not in nodes_dict:
                nodes_dict[gpid] = {
                    "id": gpid,
                    "fullName": gp["full_name"],
                    "gender": gpgender,
                    "generation": gp["generation_no"] or 1,
                    "relativeLevel": -2,
                    "relativeRole": gprole,
                    "clanId": str(gp["clan_id"]),
                    "clanName": gp["clan_name"],
                    "isEgo": False,
                    "isSpouse": False,
                    "isLiving": gp["is_living"],
                    "avatarUrl": gp["avatar_storage_key"],
                    "isCrossClan": False,
                    "canExpand": False,
                    "privacyMasked": False,
                }
            add_edge(gpid, str(gp["child_id"]), "BLOODLINE", "Ông - Cha/Mẹ" if gpgender == "MALE" else "Bà - Cha/Mẹ")

        # Tìm quan hệ hôn phối giữa các ông bà của Ego
        if grandparent_ids:
            stmt_egp_marr = text("""
                SELECT from_person_id, to_person_id
                FROM relationships
                WHERE from_person_id IN :gp_ids AND to_person_id IN :gp_ids
                  AND relationship_type = 'SPOUSE' AND status = 'ACTIVE';
            """).bindparams(bindparam("gp_ids", expanding=True))
            res_egp_marr = await db.execute(stmt_egp_marr, {"gp_ids": grandparent_ids})
            for em in res_egp_marr.fetchall():
                add_edge(str(em[0]), str(em[1]), "MARRIAGE", "Hôn nhân (Ông Bà bên bạn)")

    # 2.3. Anh chị em ruột của Ego (Level 0)
    if parent_ids:
        stmt_siblings = text("""
            SELECT DISTINCT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.avatar_storage_key, p.clan_id, c.name as clan_name, r.from_person_id as parent_id
            FROM relationships r
            JOIN persons p ON r.to_person_id = p.person_id
            JOIN clans c ON p.clan_id = c.clan_id
            WHERE r.from_person_id IN :parent_ids
              AND r.to_person_id != :ego_id
              AND r.relationship_type = 'PARENT_CHILD'
              AND r.status = 'ACTIVE'
            ORDER BY p.generation_no, p.full_name;
        """).bindparams(bindparam("parent_ids", expanding=True))
        res_siblings = await db.execute(stmt_siblings, {"parent_ids": parent_ids, "ego_id": ego_person.id})
        siblings = [dict(r._mapping) for r in res_siblings.fetchall()]
        for s in siblings:
            sid = str(s["person_id"])
            sgender = (s["gender"] or "OTHER").upper()
            if sid not in nodes_dict:
                nodes_dict[sid] = {
                    "id": sid,
                    "fullName": s["full_name"],
                    "gender": sgender,
                    "generation": s["generation_no"] or ego_person.generation or 1,
                    "relativeLevel": 0,
                    "relativeRole": "SIBLING",
                    "clanId": str(s["clan_id"]),
                    "clanName": s["clan_name"],
                    "isEgo": False,
                    "isSpouse": False,
                    "isLiving": s["is_living"],
                    "avatarUrl": s["avatar_storage_key"],
                    "isCrossClan": False,
                    "canExpand": False,
                    "privacyMasked": False,
                }
            add_edge(str(s["parent_id"]), sid, "BLOODLINE", "Cha/Mẹ - Con")

    # 2.4. Con cái của Ego (Level +1)
    stmt_children = text("""
        SELECT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.avatar_storage_key, p.clan_id, c.name as clan_name
        FROM relationships r
        JOIN persons p ON r.to_person_id = p.person_id
        JOIN clans c ON p.clan_id = c.clan_id
        WHERE r.from_person_id = :ego_id
          AND r.relationship_type = 'PARENT_CHILD'
          AND r.status = 'ACTIVE'
        ORDER BY p.gender DESC, p.full_name;
    """)
    res_children = await db.execute(stmt_children, {"ego_id": ego_person.id})
    children = [dict(r._mapping) for r in res_children.fetchall()]

    for ch in children:
        chid = str(ch["person_id"])
        chgender = (ch["gender"] or "OTHER").upper()
        if chid not in nodes_dict:
            nodes_dict[chid] = {
                "id": chid,
                "fullName": ch["full_name"],
                "gender": chgender,
                "generation": ch["generation_no"] or (ego_person.generation + 1 if ego_person.generation else 2),
                "relativeLevel": 1,
                "relativeRole": "CHILD",
                "clanId": str(ch["clan_id"]),
                "clanName": ch["clan_name"],
                "isEgo": False,
                "isSpouse": False,
                "isLiving": ch["is_living"],
                "avatarUrl": ch["avatar_storage_key"],
                "isCrossClan": False,
                "canExpand": False,
                "privacyMasked": False,
            }
        add_edge(ego_id, chid, "BLOODLINE", "Cha/Mẹ - Con")

    # 2.5. Phối ngẫu nội bộ trong bảng relationships (nếu có)
    stmt_internal_spouse = text("""
        SELECT r.relationship_id,
               CASE WHEN r.from_person_id = :ego_id THEN r.to_person_id ELSE r.from_person_id END as spouse_id,
               p.full_name, p.gender, p.generation_no, p.is_living, p.avatar_storage_key, p.clan_id, c.name as clan_name
        FROM relationships r
        JOIN persons p ON (
            CASE WHEN r.from_person_id = :ego_id THEN r.to_person_id ELSE r.from_person_id END = p.person_id
        )
        JOIN clans c ON p.clan_id = c.clan_id
        WHERE (r.from_person_id = :ego_id OR r.to_person_id = :ego_id)
          AND r.relationship_type = 'SPOUSE'
          AND r.status = 'ACTIVE';
    """)
    res_int_spouse = await db.execute(stmt_internal_spouse, {"ego_id": ego_person.id})
    int_spouses = [dict(r._mapping) for r in res_int_spouse.fetchall()]
    for isp in int_spouses:
        ispid = str(isp["spouse_id"])
        ispgender = (isp["gender"] or "OTHER").upper()
        if ispid not in nodes_dict:
            nodes_dict[ispid] = {
                "id": ispid,
                "fullName": isp["full_name"],
                "gender": ispgender,
                "generation": isp["generation_no"] or ego_person.generation or 1,
                "relativeLevel": 0,
                "relativeRole": "SPOUSE",
                "clanId": str(isp["clan_id"]),
                "clanName": isp["clan_name"],
                "isEgo": False,
                "isSpouse": True,
                "isLiving": isp["is_living"],
                "avatarUrl": isp["avatar_storage_key"],
                "isCrossClan": False,
                "canExpand": False,
                "privacyMasked": False,
            }
        add_edge(ego_id, ispid, "MARRIAGE", "Hôn nhân")
        for ch in children:
            add_edge(ispid, str(ch["person_id"]), "BLOODLINE", "Mẹ/Cha - Con")

    # 3. Kết nối liên họ qua hôn nhân (InterClanLink + InterClanPersonMapping)
    stmt_cross_mapping = text("""
        SELECT m.mapping_id, m.link_id, m.relationship_type, m.status,
               m.person_a_id, m.clan_a_id, ca.name as clan_a_name, pa.full_name as name_a, pa.gender as gender_a, pa.generation_no as gen_a, pa.avatar_storage_key as avatar_a, pa.is_living as living_a,
               m.person_b_id, m.clan_b_id, cb.name as clan_b_name, pb.full_name as name_b, pb.gender as gender_b, pb.generation_no as gen_b, pb.avatar_storage_key as avatar_b, pb.is_living as living_b,
               l.status as link_status
        FROM inter_clan_person_mappings m
        JOIN inter_clan_links l ON m.link_id = l.link_id
        JOIN persons pa ON m.person_a_id = pa.person_id
        JOIN clans ca ON m.clan_a_id = ca.clan_id
        JOIN persons pb ON m.person_b_id = pb.person_id
        JOIN clans cb ON m.clan_b_id = cb.clan_id
        WHERE m.status IN ('VERIFIED', 'PENDING', 'AWAITING_SPOUSE', 'REJECTED')
          AND l.status = 'ACTIVE'
          AND (m.person_a_id = :ego_id OR m.person_b_id = :ego_id);
    """)
    res_cross = await db.execute(stmt_cross_mapping, {"ego_id": ego_person.id})
    cross_mappings = [dict(r._mapping) for r in res_cross.fetchall()]

    bridges: list[dict[str, Any]] = []
    primary_spouse_clan: Optional[dict[str, Any]] = None

    for m in cross_mappings:
        is_a = m["person_a_id"] == ego_person.id
        spouse_id = str(m["person_b_id"] if is_a else m["person_a_id"])
        spouse_name = m["name_b"] if is_a else m["name_a"]
        spouse_gender = (m["gender_b"] if is_a else m["gender_a"] or "OTHER").upper()
        spouse_gen = (m["gen_b"] if is_a else m["gen_a"]) or 1
        spouse_avatar = m["avatar_b"] if is_a else m["avatar_a"]
        spouse_living = m["living_b"] if is_a else m["living_a"]
        spouse_clan_id = str(m["clan_b_id"] if is_a else m["clan_a_id"])
        spouse_clan_name = m["clan_b_name"] if is_a else m["clan_a_name"]
        link_id = str(m["link_id"])

        target_owner_clan_id = m["clan_b_id"] if is_a else m["clan_a_id"]

        mapping_status = m["status"]

        # Kiểm tra quyền cấp xem gia phả (LineageAccessGrant) độc lập 2 chiều
        stmt_grant = select(LineageAccessGrant).where(
            LineageAccessGrant.owner_clan_id == target_owner_clan_id,
            LineageAccessGrant.grantee_user_id == caller.user_id,
            LineageAccessGrant.status == "ACTIVE",
        )
        active_grant = (await db.execute(stmt_grant)).scalar_one_or_none()

        stmt_last_req = (
            select(LineageAccessRequest)
            .where(
                LineageAccessRequest.owner_clan_id == target_owner_clan_id,
                LineageAccessRequest.grantee_user_id == caller.user_id,
            )
            .order_by(LineageAccessRequest.created_at.desc())
        )
        last_req = (await db.execute(stmt_last_req)).scalars().first()

        stmt_revoked = (
            select(LineageAccessGrant)
            .where(
                LineageAccessGrant.owner_clan_id == target_owner_clan_id,
                LineageAccessGrant.grantee_user_id == caller.user_id,
                LineageAccessGrant.status == "REVOKED",
            )
            .order_by(LineageAccessGrant.revoked_at.desc())
        )
        revoked_grant = (await db.execute(stmt_revoked)).scalars().first()

        grant_status = "NONE"
        rejection_reason = None
        revocation_reason = None
        active_grant_id = None

        if mapping_status == "AWAITING_SPOUSE":
            grant_status = "AWAITING_SPOUSE"
            is_sharing_allowed = False
        elif mapping_status == "PENDING":
            grant_status = "PENDING_ADMIN_VERIFICATION"
            is_sharing_allowed = False
        elif mapping_status == "REJECTED":
            grant_status = "MARRIAGE_REJECTED"
            is_sharing_allowed = False
        elif active_grant:
            grant_status = "APPROVED"
            active_grant_id = str(active_grant.id)
            is_sharing_allowed = True
        elif last_req and last_req.status == "PENDING":
            grant_status = "PENDING"
            is_sharing_allowed = False
        elif revoked_grant and (not last_req or (revoked_grant.revoked_at and last_req.created_at and revoked_grant.revoked_at >= last_req.created_at)):
            grant_status = "REVOKED"
            revocation_reason = revoked_grant.revocation_reason
            is_sharing_allowed = False
        elif last_req and last_req.status == "REJECTED":
            grant_status = "REJECTED"
            rejection_reason = last_req.rejection_reason
            is_sharing_allowed = False
        else:
            grant_status = "NONE"
            is_sharing_allowed = False

        stmt_pol = select(InterClanSharedPolicy).where(
            InterClanSharedPolicy.link_id == m["link_id"],
            InterClanSharedPolicy.owner_clan_id == target_owner_clan_id,
        )
        pol = (await db.execute(stmt_pol)).scalar_one_or_none()

        if pol and (pol.visibility == "PRIVATE" or pol.data_scope == "NONE"):
            is_sharing_allowed = False

        can_request_access = (mapping_status == "VERIFIED") and (grant_status in ("NONE", "REJECTED", "REVOKED"))

        if not primary_spouse_clan:
            primary_spouse_clan = {
                "id": spouse_clan_id,
                "name": spouse_clan_name,
                "linkId": link_id,
                "isSharingAllowed": is_sharing_allowed,
                "grantStatus": grant_status,
                "grantId": active_grant_id or (str(revoked_grant.id) if revoked_grant else None),
                "requestId": str(last_req.id) if last_req else None,
                "rejectionReason": rejection_reason,
                "revocationReason": revocation_reason,
                "canRequestAccess": can_request_access,
            }

        bridges.append({
            "linkId": link_id,
            "mappingId": str(m["mapping_id"]),
            "egoPersonId": ego_id,
            "spousePersonId": spouse_id,
            "spouseName": spouse_name,
            "spouseClanId": spouse_clan_id,
            "spouseClanName": spouse_clan_name,
            "status": "ACTIVE",
            "isSharingAllowed": is_sharing_allowed,
            "grantStatus": grant_status,
            "grantId": active_grant_id or (str(revoked_grant.id) if revoked_grant else None),
            "requestId": str(last_req.id) if last_req else None,
            "rejectionReason": rejection_reason,
            "revocationReason": revocation_reason,
            "canRequestAccess": can_request_access,
        })

        if spouse_id not in nodes_dict:
            nodes_dict[spouse_id] = {
                "id": spouse_id,
                "fullName": spouse_name,
                "gender": spouse_gender,
                "generation": spouse_gen,
                "relativeLevel": 0,
                "relativeRole": "SPOUSE",
                "clanId": spouse_clan_id,
                "clanName": spouse_clan_name,
                "isEgo": False,
                "isSpouse": True,
                "isLiving": spouse_living if spouse_living is not None else True,
                "avatarUrl": spouse_avatar,
                "isCrossClan": True,
                "canExpand": False,
                "privacyMasked": False,
                "isReadOnly": True,
                "grantStatus": grant_status,
                "grantId": active_grant_id or (str(revoked_grant.id) if revoked_grant else None),
                "requestId": str(last_req.id) if last_req else None,
                "rejectionReason": rejection_reason,
                "revocationReason": revocation_reason,
                "canRequestAccess": can_request_access,
            }

        add_edge(ego_id, spouse_id, "INTER_CLAN_BRIDGE", f"Hôn nhân liên họ ({natal_clan.name} - {spouse_clan_name})")

        for ch in children:
            chid = str(ch["person_id"])
            # Kiểm tra quan hệ thực tế trong bảng relationships để tránh gán nhầm con riêng khi có nhiều cuộc hôn nhân
            stmt_par_check = text("""
                SELECT from_person_id FROM relationships
                WHERE to_person_id = :ch_id
                  AND relationship_type = 'PARENT_CHILD'
                  AND status = 'ACTIVE';
            """)
            known_pars = [
                str(r[0])
                for r in (await db.execute(stmt_par_check, {"ch_id": ch["person_id"]})).fetchall()
            ]
            # Nếu child có cha/mẹ được ghi nhận là spouse_id, hoặc ego chỉ có duy nhất 1 cuộc hôn nhân
            if not known_pars or spouse_id in known_pars or (len(cross_mappings) == 1 and not int_spouses):
                add_edge(spouse_id, chid, "BLOODLINE", "Cha/Mẹ - Con")

        # 4. Phạm vi 4 thế hệ bên phối ngẫu (nếu được cấp quyền chia sẻ)
        if is_sharing_allowed:
            # 4.1. Cha mẹ bên phối ngẫu (Level -1)
            stmt_inlaw_parents = text("""
                SELECT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.avatar_storage_key, p.clan_id, c.name as clan_name
                FROM relationships r
                JOIN persons p ON r.from_person_id = p.person_id
                JOIN clans c ON p.clan_id = c.clan_id
                WHERE r.to_person_id = :sp_id
                  AND r.relationship_type = 'PARENT_CHILD'
                  AND r.status = 'ACTIVE'
                ORDER BY p.gender DESC, p.full_name;
            """)
            res_inlaw_par = await db.execute(stmt_inlaw_parents, {"sp_id": uuid.UUID(spouse_id)})
            inlaw_parents = [dict(r._mapping) for r in res_inlaw_par.fetchall()]
            inlaw_par_ids = [p["person_id"] for p in inlaw_parents]

            for ip in inlaw_parents:
                ipid = str(ip["person_id"])
                ipgender = (ip["gender"] or "OTHER").upper()
                iprole = "FATHER" if ipgender == "MALE" else ("MOTHER" if ipgender == "FEMALE" else "PARENT")
                if ipid not in nodes_dict:
                    nodes_dict[ipid] = {
                        "id": ipid,
                        "fullName": ip["full_name"],
                        "gender": ipgender,
                        "generation": ip["generation_no"] or (spouse_gen - 1 if spouse_gen else 1),
                        "relativeLevel": -1,
                        "relativeRole": iprole,
                        "clanId": str(ip["clan_id"]),
                        "clanName": ip["clan_name"],
                        "isEgo": False,
                        "isSpouse": False,
                        "isLiving": ip["is_living"],
                        "avatarUrl": ip["avatar_storage_key"],
                        "isCrossClan": True,
                        "canExpand": False,
                        "privacyMasked": False,
                    }
                add_edge(ipid, spouse_id, "BLOODLINE", "Cha - Con" if ipgender == "MALE" else "Mẹ - Con")

            # 4.1b. Phối ngẫu của cha/mẹ bên phối ngẫu (Mẹ hoặc Cha còn lại - Level -1)
            if inlaw_par_ids:
                stmt_inlaw_par_sp = text("""
                    SELECT r.from_person_id, r.to_person_id,
                           p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.avatar_storage_key, p.clan_id, c.name as clan_name
                    FROM relationships r
                    JOIN persons p ON (CASE WHEN r.from_person_id IN :par_ids THEN r.to_person_id ELSE r.from_person_id END = p.person_id)
                    JOIN clans c ON p.clan_id = c.clan_id
                    WHERE (r.from_person_id IN :par_ids OR r.to_person_id IN :par_ids)
                      AND r.relationship_type = 'SPOUSE'
                      AND r.status = 'ACTIVE';
                """).bindparams(bindparam("par_ids", expanding=True))
                res_inlaw_par_sp = await db.execute(stmt_inlaw_par_sp, {"par_ids": inlaw_par_ids})
                for isp in res_inlaw_par_sp.fetchall():
                    isp_map = dict(isp._mapping)
                    ispid = str(isp_map["person_id"])
                    ispgender = (isp_map["gender"] or "OTHER").upper()
                    isprole = "FATHER" if ispgender == "MALE" else ("MOTHER" if ispgender == "FEMALE" else "PARENT")
                    if ispid not in nodes_dict:
                        nodes_dict[ispid] = {
                            "id": ispid,
                            "uniqueKey": f"{isp_map['clan_id']}:{ispid}",
                            "fullName": isp_map["full_name"],
                            "gender": ispgender,
                            "generation": isp_map["generation_no"] or (spouse_gen - 1 if spouse_gen else 1),
                            "relativeLevel": -1,
                            "relativeRole": isprole,
                            "clanId": str(isp_map["clan_id"]),
                            "clanName": isp_map["clan_name"],
                            "isEgo": False,
                            "isSpouse": False,
                            "isLiving": isp_map["is_living"],
                            "avatarUrl": isp_map["avatar_storage_key"],
                            "isCrossClan": True,
                            "canExpand": False,
                            "privacyMasked": False,
                        }
                    matched_par_id = str(isp_map["from_person_id"] if str(isp_map["to_person_id"]) == ispid else isp_map["to_person_id"])
                    add_edge(matched_par_id, ispid, "MARRIAGE", "Hôn nhân (Cha Mẹ bên chồng/vợ)")
                    add_edge(ispid, spouse_id, "BLOODLINE", "Mẹ - Con" if ispgender == "FEMALE" else "Cha - Con")

            # 4.1c. Anh chị em ruột của bên phối ngẫu (Level 0)
            if inlaw_par_ids:
                stmt_inlaw_sibs = text("""
                    SELECT DISTINCT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.avatar_storage_key, p.clan_id, c.name as clan_name, r.from_person_id as parent_id
                    FROM relationships r
                    JOIN persons p ON r.to_person_id = p.person_id
                    JOIN clans c ON p.clan_id = c.clan_id
                    WHERE r.from_person_id IN :par_ids
                      AND r.to_person_id != :sp_id
                      AND r.relationship_type = 'PARENT_CHILD'
                      AND r.status = 'ACTIVE'
                    ORDER BY p.generation_no, p.full_name;
                """).bindparams(bindparam("par_ids", expanding=True))
                res_inlaw_sibs = await db.execute(stmt_inlaw_sibs, {"par_ids": inlaw_par_ids, "sp_id": uuid.UUID(spouse_id)})
                for s in res_inlaw_sibs.fetchall():
                    s_dict = dict(s._mapping)
                    sid = str(s_dict["person_id"])
                    sgender = (s_dict["gender"] or "OTHER").upper()
                    if sid not in nodes_dict:
                        nodes_dict[sid] = {
                            "id": sid,
                            "uniqueKey": f"{s_dict['clan_id']}:{sid}",
                            "fullName": s_dict["full_name"],
                            "gender": sgender,
                            "generation": s_dict["generation_no"] or spouse_gen,
                            "relativeLevel": 0,
                            "relativeRole": "SIBLING",
                            "clanId": str(s_dict["clan_id"]),
                            "clanName": s_dict["clan_name"],
                            "isEgo": False,
                            "isSpouse": False,
                            "isLiving": s_dict["is_living"],
                            "avatarUrl": s_dict["avatar_storage_key"],
                            "isCrossClan": True,
                            "canExpand": False,
                            "privacyMasked": False,
                        }
                    add_edge(str(s_dict["parent_id"]), sid, "BLOODLINE", "Cha/Mẹ - Con")

            # 4.2. Ông bà bên phối ngẫu (Level -2) - Giới hạn tuyệt đối của phạm vi 4 thế hệ
            if inlaw_par_ids:
                stmt_inlaw_gp = text("""
                    SELECT p.person_id, p.full_name, p.gender, p.generation_no, p.is_living, p.avatar_storage_key, p.clan_id, c.name as clan_name, r.to_person_id as child_id
                    FROM relationships r
                    JOIN persons p ON r.from_person_id = p.person_id
                    JOIN clans c ON p.clan_id = c.clan_id
                    WHERE r.to_person_id IN :inlaw_par_ids
                      AND r.relationship_type = 'PARENT_CHILD'
                      AND r.status = 'ACTIVE'
                    ORDER BY p.gender DESC, p.full_name;
                """).bindparams(bindparam("inlaw_par_ids", expanding=True))
                res_inlaw_gp = await db.execute(stmt_inlaw_gp, {"inlaw_par_ids": inlaw_par_ids})
                inlaw_gps = [dict(r._mapping) for r in res_inlaw_gp.fetchall()]
                inlaw_gp_ids = [gp["person_id"] for gp in inlaw_gps]

                for igp in inlaw_gps:
                    igpid = str(igp["person_id"])
                    igpgender = (igp["gender"] or "OTHER").upper()
                    igprole = "GRANDFATHER" if igpgender == "MALE" else ("GRANDMOTHER" if igpgender == "FEMALE" else "GRANDPARENT")
                    if igpid not in nodes_dict:
                        nodes_dict[igpid] = {
                            "id": igpid,
                            "uniqueKey": f"{igp['clan_id']}:{igpid}",
                            "fullName": igp["full_name"],
                            "gender": igpgender,
                            "generation": igp["generation_no"] or 1,
                            "relativeLevel": -2,
                            "relativeRole": igprole,
                            "clanId": str(igp["clan_id"]),
                            "clanName": igp["clan_name"],
                            "isEgo": False,
                            "isSpouse": False,
                            "isLiving": igp["is_living"],
                            "avatarUrl": igp["avatar_storage_key"],
                            "isCrossClan": True,
                            "canExpand": False,
                            "privacyMasked": False,
                        }
                    add_edge(igpid, str(igp["child_id"]), "BLOODLINE", "Ông - Cha/Mẹ" if igpgender == "MALE" else "Bà - Cha/Mẹ")

                # Tìm quan hệ hôn phối giữa các ông bà bên phối ngẫu
                if inlaw_gp_ids:
                    stmt_igp_marr = text("""
                        SELECT from_person_id, to_person_id
                        FROM relationships
                        WHERE from_person_id IN :gp_ids AND to_person_id IN :gp_ids
                          AND relationship_type = 'SPOUSE' AND status = 'ACTIVE';
                    """).bindparams(bindparam("gp_ids", expanding=True))
                    res_igp_marr = await db.execute(stmt_igp_marr, {"gp_ids": inlaw_gp_ids})
                    for im in res_igp_marr.fetchall():
                        add_edge(str(im[0]), str(im[1]), "MARRIAGE", "Hôn nhân (Ông Bà bên chồng/vợ)")

    # Bổ sung thông tin tài khoản người dùng đã liên kết (userId)
    nodes_dict[ego_id]["userId"] = str(caller.user_id)
    all_pids: list[uuid.UUID] = []
    for pid_str in nodes_dict.keys():
        try:
            all_pids.append(uuid.UUID(pid_str))
        except ValueError:
            pass

    if all_pids:
        stmt_links = select(PersonAccountLink).where(
            PersonAccountLink.person_id.in_(all_pids),
            PersonAccountLink.status == "ACTIVE",
        )
        for link in (await db.execute(stmt_links)).scalars().all():
            p_key = str(link.person_id)
            if p_key in nodes_dict:
                nodes_dict[p_key]["userId"] = str(link.user_id)

    gen_counts = {"-2": 0, "-1": 0, "0": 0, "1": 0}
    for n in nodes_dict.values():
        lvl = str(n.get("relativeLevel", 0))
        if lvl in gen_counts:
            gen_counts[lvl] += 1

    return {
        "isLinked": True,
        "ego": nodes_dict.get(ego_id),
        "natalClan": {
            "id": str(natal_clan.clan_id),
            "name": natal_clan.name,
        },
        "spouseClan": primary_spouse_clan,
        "spouseClans": [
            {
                "id": b["spouseClanId"],
                "name": b["spouseClanName"],
                "linkId": b["linkId"],
                "isSharingAllowed": b["isSharingAllowed"],
                "grantStatus": b["grantStatus"],
                "grantId": b["grantId"],
                "requestId": b["requestId"],
                "rejectionReason": b["rejectionReason"],
                "revocationReason": b["revocationReason"],
                "canRequestAccess": b["canRequestAccess"],
            }
            for b in bridges
        ],
        "nodes": list(nodes_dict.values()),
        "edges": edges_list,
        "bridges": bridges,
        "generationCounts": gen_counts,
        "hasCrossClanLink": len(bridges) > 0,
        "message": "Tải mạng lưới gia tộc thành công.",
    }


