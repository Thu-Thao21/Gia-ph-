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


@router.get("/inlaw-marriages")
async def list_inlaw_marriages(
    clan_id: Optional[str] = Query(None),
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """Returns in-law marriages from internal relationships and verified inter-clan person mappings."""
    try:
        user_clan_ids = caller.clans
        filter_clan_uuid = uuid.UUID(clan_id) if clan_id else None

        # 1. Internal clan spouse relationships
        stmt = text("""
            SELECT 
                r.relationship_id,
                p1.person_id as p1_id,
                p1.full_name as p1_name,
                p1.gender as p1_gender,
                p1.birth_date as p1_birth_date,
                l1.user_id as p1_user_id,
                c1.name as c1_name,
                c1.clan_id as c1_id,
                p2.person_id as p2_id,
                p2.full_name as p2_name,
                p2.gender as p2_gender,
                p2.birth_date as p2_birth_date,
                l2.user_id as p2_user_id,
                c2.name as c2_name,
                c2.clan_id as c2_id,
                r.started_on,
                r.created_at
            FROM relationships r
            JOIN persons p1 ON r.from_person_id = p1.person_id
            LEFT JOIN person_account_links l1 ON p1.person_id = l1.person_id AND l1.status = 'ACTIVE'
            JOIN clans c1 ON p1.clan_id = c1.clan_id
            JOIN persons p2 ON r.to_person_id = p2.person_id
            LEFT JOIN person_account_links l2 ON p2.person_id = l2.person_id AND l2.status = 'ACTIVE'
            JOIN clans c2 ON p2.clan_id = c2.clan_id
            WHERE r.relationship_type = 'SPOUSE'
              AND r.status = 'ACTIVE'
        """)
        res = await db.execute(stmt)
        marriages = []
        for row in res.fetchall():
            rel_id, p1_id, p1_name, p1_gender, p1_bdate, p1_uid, c1_name, c1_id, p2_id, p2_name, p2_gender, p2_bdate, p2_uid, c2_name, c2_id, started_on, created_at = row
            
            if filter_clan_uuid:
                if c1_id != filter_clan_uuid and c2_id != filter_clan_uuid:
                    continue
            elif not caller.is_sa and user_clan_ids:
                if c1_id not in user_clan_ids and c2_id not in user_clan_ids:
                    continue

            if str(p2_gender).upper() == "MALE" or str(p1_gender).upper() == "FEMALE":
                husband_name, husband_family = p2_name, c2_name
                husband_id, husband_clan_id = p2_id, c1_id
                husband_bdate, husband_uid = p2_bdate, p2_uid
                wife_name, wife_family = p1_name, c1_name
                wife_id, wife_clan_id = p1_id, c1_id
                wife_bdate, wife_uid = p1_bdate, p1_uid
            else:
                husband_name, husband_family = p1_name, c1_name
                husband_id, husband_clan_id = p1_id, c1_id
                husband_bdate, husband_uid = p1_bdate, p1_uid
                wife_name, wife_family = p2_name, c2_name
                wife_id, wife_clan_id = p2_id, c2_id
                wife_bdate, wife_uid = p2_bdate, p2_uid

            date_str = str(started_on) if started_on else (created_at.strftime("%d/%m/%Y") if created_at else None)
            
            marriages.append({
                "id": str(rel_id),
                "husbandName": husband_name,
                "husbandFamily": husband_family,
                "husbandPersonId": str(husband_id),
                "husbandClanId": str(husband_clan_id),
                "husbandBirthDate": str(husband_bdate) if husband_bdate else None,
                "husbandOccupation": "Kinh doanh / Quản trị",
                "husbandUserId": str(husband_uid) if husband_uid else None,
                "wifeName": wife_name,
                "wifeFamily": wife_family,
                "wifePersonId": str(wife_id),
                "wifeClanId": str(wife_clan_id),
                "wifeBirthDate": str(wife_bdate) if wife_bdate else None,
                "wifeOccupation": "Kinh doanh / Quản trị",
                "wifeUserId": str(wife_uid) if wife_uid else None,
                "marriageDate": date_str,
                "isCrossClan": False,
                "notes": f"Hôn nhân kết nối {husband_family} và {wife_family}" if c1_id != c2_id else "Nội tộc dòng họ",
            })

        # 2. Cross-clan verified in-law mappings
        cross_stmt = text("""
            SELECT 
                m.mapping_id,
                p1.person_id as p1_id,
                p1.full_name as p1_name,
                p1.gender as p1_gender,
                p1.birth_date as p1_birth_date,
                l1.user_id as p1_user_id,
                c1.name as c1_name,
                c1.clan_id as c1_id,
                p2.person_id as p2_id,
                p2.full_name as p2_name,
                p2.gender as p2_gender,
                p2.birth_date as p2_birth_date,
                l2.user_id as p2_user_id,
                c2.name as c2_name,
                c2.clan_id as c2_id,
                m.created_at,
                m.notes,
                m.link_id
            FROM inter_clan_person_mappings m
            JOIN persons p1 ON m.person_a_id = p1.person_id
            LEFT JOIN person_account_links l1 ON p1.person_id = l1.person_id AND l1.status = 'ACTIVE'
            JOIN clans c1 ON m.clan_a_id = c1.clan_id
            JOIN persons p2 ON m.person_b_id = p2.person_id
            LEFT JOIN person_account_links l2 ON p2.person_id = l2.person_id AND l2.status = 'ACTIVE'
            JOIN clans c2 ON m.clan_b_id = c2.clan_id
            WHERE m.status = 'VERIFIED'
        """)
        cross_res = await db.execute(cross_stmt)
        for row in cross_res.fetchall():
            map_id, p1_id, p1_name, p1_gender, p1_bdate, p1_uid, c1_name, c1_id, p2_id, p2_name, p2_gender, p2_bdate, p2_uid, c2_name, c2_id, created_at, notes, link_id = row
            
            if filter_clan_uuid:
                if c1_id != filter_clan_uuid and c2_id != filter_clan_uuid:
                    continue
            elif not caller.is_sa and user_clan_ids:
                if c1_id not in user_clan_ids and c2_id not in user_clan_ids:
                    continue

            if str(p2_gender).upper() == "MALE" or str(p1_gender).upper() == "FEMALE":
                husband_name, husband_family = p2_name, c2_name
                husband_id, husband_clan_id = p2_id, c2_id
                husband_bdate, husband_uid = p2_bdate, p2_uid
                wife_name, wife_family = p1_name, c1_name
                wife_id, wife_clan_id = p1_id, c1_id
                wife_bdate, wife_uid = p1_bdate, p1_uid
            else:
                husband_name, husband_family = p1_name, c1_name
                husband_id, husband_clan_id = p1_id, c1_id
                husband_bdate, husband_uid = p1_bdate, p1_uid
                wife_name, wife_family = p2_name, c2_name
                wife_id, wife_clan_id = p2_id, c2_id
                wife_bdate, wife_uid = p2_bdate, p2_uid

            date_str = created_at.strftime("%d/%m/%Y") if created_at else None
            marriages.append({
                "id": str(map_id),
                "husbandName": husband_name,
                "husbandFamily": husband_family,
                "husbandPersonId": str(husband_id),
                "husbandClanId": str(husband_clan_id),
                "husbandBirthDate": str(husband_bdate) if husband_bdate else None,
                "husbandOccupation": "Kinh doanh / Quản trị",
                "husbandUserId": str(husband_uid) if husband_uid else None,
                "wifeName": wife_name,
                "wifeFamily": wife_family,
                "wifePersonId": str(wife_id),
                "wifeClanId": str(wife_clan_id),
                "wifeBirthDate": str(wife_bdate) if wife_bdate else None,
                "wifeOccupation": "Kinh doanh / Quản trị",
                "wifeUserId": str(wife_uid) if wife_uid else None,
                "marriageDate": date_str,
                "isCrossClan": True,
                "linkId": str(link_id),
                "notes": notes or f"Hôn nhân thông gia: {husband_family} kết duyên cùng {wife_family}",
            })

        return marriages
    except Exception as e:
        logger.error(f"Error fetching inlaw marriages: {e}")
        return []




@router.get("/clans/{target_clan_id}/candidate-members")
async def get_candidate_members(
    target_clan_id: uuid.UUID,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Trả về danh sách thành viên cơ bản của dòng họ đối tác
    phục vụ lựa chọn dâu/rể khi thiết lập liên kết dòng họ hoặc ghép cặp thông gia.
    Chỉ trả về các trường công khai tối thiểu (id, full_name, gender, generation_no, is_living).
    """
    stmt = (
        select(Person)
        .where(
            Person.family_id == target_clan_id,
            Person.status == "ACTIVE"
        )
        .order_by(Person.generation, Person.full_name)
    )
    res = await db.execute(stmt)
    persons = res.scalars().all()
    return [
        {
            "id": str(p.id),
            "fullName": p.full_name,
            "gender": (p.gender or "OTHER").lower(),
            "generation": p.generation or 1,
            "isLiving": p.is_alive if p.is_alive is not None else True,
        }
        for p in persons
    ]


# ==============================================================================
# MARRIAGE INVITATIONS (Lời mời kết nối hôn phối liên họ giữa hai Member)
# ==============================================================================


@router.post("/marriage-invitations", response_model=MarriageInvitationResponse)
async def create_marriage_invitation(
    data: MarriageInvitationCreate,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Member gửi lời mời kết nối hôn phối liên họ đến Member thuộc dòng họ đối tác.
    Quy trình:
    1. Người gửi phải có hồ sơ Person liên kết ACTIVE.
    2. Người nhận phải là Person thuộc dòng họ khác (liên họ).
    3. Trạng thái khởi tạo: AWAITING_SPOUSE_CONFIRMATION (Chờ đối phương xác nhận).
    4. Gửi Notification đến người phối ngẫu và ghi AuditLog.
    """
    # 1. Tìm Person liên kết với caller
    stmt_link = (
        select(PersonAccountLink, Person)
        .join(Person, PersonAccountLink.person_id == Person.id)
        .where(
            PersonAccountLink.user_id == caller.user_id,
            PersonAccountLink.status == "ACTIVE",
        )
    )
    res_link = (await db.execute(stmt_link)).first()
    if not res_link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản của bạn chưa được liên kết với hồ sơ thành viên nào trong gia phả.",
        )
    sender_person = res_link[1]
    sender_clan_id = sender_person.family_id

    # 2. Tìm Person của người phối ngẫu
    target_p = (await db.execute(select(Person).where(Person.id == data.target_person_id))).scalar_one_or_none()
    if not target_p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ người phối ngẫu.")
    if target_p.family_id == sender_clan_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người phối ngẫu cùng thuộc dòng họ nội tộc. Chức năng này dành cho hôn phối liên họ (hai dòng họ khác nhau).",
        )
    target_clan_id = target_p.family_id

    # 3. Kiểm tra xem đã có liên kết cặp Person này chưa
    stmt_existing = select(InterClanPersonMapping).where(
        (
            (InterClanPersonMapping.person_a_id == sender_person.id)
            & (InterClanPersonMapping.person_b_id == target_p.id)
        )
        | (
            (InterClanPersonMapping.person_b_id == sender_person.id)
            & (InterClanPersonMapping.person_a_id == target_p.id)
        )
    )
    existing_map = (await db.execute(stmt_existing)).scalars().first()
    if existing_map:
        if existing_map.status == "VERIFIED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hai bạn đã có liên kết hôn nhân chính danh đã được xác minh trước đó.",
            )
        elif existing_map.status in ("AWAITING_SPOUSE", "PENDING"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Đã có lời mời kết hôn hoặc yêu cầu xác minh đang chờ xử lý giữa hai bạn.",
            )

    # 4. Tìm hoặc tạo liên kết InterClanLink giữa hai dòng họ
    stmt_link_check = select(InterClanLink).where(
        (
            (InterClanLink.clan_a_id == sender_clan_id)
            & (InterClanLink.clan_b_id == target_clan_id)
        )
        | (
            (InterClanLink.clan_b_id == sender_clan_id)
            & (InterClanLink.clan_a_id == target_clan_id)
        ),
        InterClanLink.status == "ACTIVE",
    )
    link_row = (await db.execute(stmt_link_check)).scalars().first()
    if not link_row:
        req_dummy = InterClanRequest(
            id=uuid.uuid4(),
            source_clan_id=sender_clan_id,
            target_clan_id=target_clan_id,
            requester_id=caller.user_id,
            connection_type="IN_LAW",
            status="APPROVED",
            message="Khởi tạo tự động từ lời mời kết nối hôn nhân liên họ",
            reviewed_by=caller.user_id,
            reviewed_at=datetime.now(timezone.utc),
        )
        db.add(req_dummy)
        await db.flush()
        link_row = InterClanLink(
            id=uuid.uuid4(),
            request_id=req_dummy.id,
            clan_a_id=sender_clan_id,
            clan_b_id=target_clan_id,
            connection_type="IN_LAW",
            status="ACTIVE",
        )
        db.add(link_row)
        await db.flush()

    # 5. Khởi tạo InterClanPersonMapping
    now = datetime.now(timezone.utc)

    # 6. Tìm User của người nhận để gửi Notification hoặc chuyển Trưởng tộc duyệt thay thế
    stmt_target_user = select(PersonAccountLink).where(
        PersonAccountLink.person_id == target_p.id,
        PersonAccountLink.status == "ACTIVE",
    )
    target_link = (await db.execute(stmt_target_user)).scalar_one_or_none()
    target_user_id = target_link.user_id if target_link else None

    # Nếu người phối ngẫu chưa có tài khoản: Trạng thái là PENDING để Trưởng tộc xác minh thay thế
    initial_status = "AWAITING_SPOUSE" if target_user_id else "PENDING"
    system_notes = (data.notes or "") + (
        "" if target_user_id else " [Xác minh thay thế: Người phối ngẫu chưa có tài khoản ứng dụng; chuyển Trưởng tộc 2 bên thẩm tra.]"
    )

    mapping = InterClanPersonMapping(
        id=uuid.uuid4(),
        link_id=link_row.id,
        clan_a_id=sender_clan_id,
        person_a_id=sender_person.id,
        clan_b_id=target_clan_id,
        person_b_id=target_p.id,
        relationship_type="SPOUSE",
        status=initial_status,
        requested_by=caller.user_id,
        requested_clan_id=sender_clan_id,
        notes=system_notes.strip() or None,
        created_at=now,
    )
    db.add(mapping)

    sender_clan = (await db.execute(select(Clan).where(Clan.clan_id == sender_clan_id))).scalar_one_or_none()
    target_clan = (await db.execute(select(Clan).where(Clan.clan_id == target_clan_id))).scalar_one_or_none()
    sender_clan_name = sender_clan.name if sender_clan else "Dòng họ"
    target_clan_name = target_clan.name if target_clan else "Dòng họ đối tác"

    if target_user_id:
        notif = Notification(
            notification_id=uuid.uuid4(),
            clan_id=target_clan_id,
            type="LINK",
            title=f"Lời mời kết nối hôn phối từ {sender_person.full_name}",
            body=f"Thành viên {sender_person.full_name} thuộc dòng họ {sender_clan_name} đã gửi lời mời xác nhận quan hệ hôn nhân liên họ với bạn. Vui lòng xác nhận.",
            entity_type="MARRIAGE_INVITATION",
            entity_id=mapping.id,
            created_at=now,
        )
        db.add(notif)
        db.add(UserNotification(
            notification_id=notif.notification_id,
            user_id=target_user_id,
            delivered_at=now,
        ))
    else:
        # Gửi thông báo đến Trưởng tộc 2 bên để kiểm tra và xác minh thay thế
        admins_a = await get_clan_admin_user_ids(db, sender_clan_id)
        admins_b = await get_clan_admin_user_ids(db, target_clan_id)
        proxy_title = f"Yêu cầu xác minh hôn nhân liên họ: {sender_person.full_name} ⟷ {target_p.full_name}"
        proxy_body = (
            f"Thành viên {sender_person.full_name} ({sender_clan_name}) đề nghị liên kết hôn phối với {target_p.full_name} ({target_clan_name}). "
            f"Do người phối ngẫu chưa có tài khoản, yêu cầu được chuyển đến Trưởng tộc hai bên để kiểm tra hồ sơ và xác minh thay thế."
        )
        for clan_id, admin_list in [(sender_clan_id, admins_a), (target_clan_id, admins_b)]:
            if admin_list:
                notif = Notification(
                    notification_id=uuid.uuid4(),
                    clan_id=clan_id,
                    type="LINK",
                    title=proxy_title,
                    body=proxy_body,
                    entity_type="PERSON_MAPPING",
                    entity_id=mapping.id,
                    created_at=now,
                )
                db.add(notif)
                await db.flush()
                for auid in admin_list:
                    db.add(UserNotification(
                        notification_id=notif.notification_id,
                        user_id=auid,
                        delivered_at=now,
                    ))

    # 7. Ghi AuditLog
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=sender_clan_id,
        actor_id=caller.user_id,
        action="marriage.invite" if target_user_id else "marriage.invite_proxy_admin",
        entity_type="INTER_CLAN_PERSON_MAPPING",
        entity_id=mapping.id,
        new_data={
            "sender_person_id": str(sender_person.id),
            "target_person_id": str(target_p.id),
            "status": initial_status,
            "has_spouse_account": bool(target_user_id),
            "notes": data.notes,
        },
    ))

    await db.commit()
    await db.refresh(mapping)

    return MarriageInvitationResponse(
        id=mapping.id,
        link_id=mapping.link_id,
        sender_user_id=caller.user_id,
        sender_name=sender_person.full_name,
        sender_person_id=mapping.person_a_id,
        sender_clan_id=mapping.clan_a_id,
        sender_clan_name=sender_clan_name,
        target_person_id=mapping.person_b_id,
        target_name=target_p.full_name,
        target_clan_id=mapping.clan_b_id,
        target_clan_name=target_clan_name,
        target_user_id=target_user_id,
        relationship_type=mapping.relationship_type,
        status=mapping.status,
        notes=mapping.notes,
        review_notes=mapping.review_notes,
        can_respond=False,
        created_at=mapping.created_at,
    )


@router.get("/marriage-invitations/my", response_model=List[MarriageInvitationResponse])
async def get_my_marriage_invitations(
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy danh sách lời mời kết hôn liên họ mà Member hiện tại đã gửi đi hoặc nhận được.
    """
    stmt_link = (
        select(PersonAccountLink)
        .where(
            PersonAccountLink.user_id == caller.user_id,
            PersonAccountLink.status == "ACTIVE",
        )
    )
    links = (await db.execute(stmt_link)).scalars().all()
    if not links:
        return []
    my_person_ids = [l.person_id for l in links]

    stmt = (
        select(InterClanPersonMapping)
        .where(
            (InterClanPersonMapping.person_a_id.in_(my_person_ids))
            | (InterClanPersonMapping.person_b_id.in_(my_person_ids)),
            InterClanPersonMapping.relationship_type == "SPOUSE",
        )
        .order_by(InterClanPersonMapping.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    results = []
    for m in rows:
        p_a = (await db.execute(select(Person).where(Person.id == m.person_a_id))).scalar_one_or_none()
        p_b = (await db.execute(select(Person).where(Person.id == m.person_b_id))).scalar_one_or_none()
        c_a = (await db.execute(select(Clan).where(Clan.clan_id == m.clan_a_id))).scalar_one_or_none()
        c_b = (await db.execute(select(Clan).where(Clan.clan_id == m.clan_b_id))).scalar_one_or_none()

        target_link = (await db.execute(
            select(PersonAccountLink).where(PersonAccountLink.person_id == m.person_b_id, PersonAccountLink.status == "ACTIVE")
        )).scalar_one_or_none()

        is_recipient = m.person_b_id in my_person_ids
        can_respond = is_recipient and m.status == "AWAITING_SPOUSE"

        results.append(
            MarriageInvitationResponse(
                id=m.id,
                link_id=m.link_id,
                sender_user_id=m.requested_by,
                sender_name=p_a.full_name if p_a else "Thành viên",
                sender_person_id=m.person_a_id,
                sender_clan_id=m.clan_a_id,
                sender_clan_name=c_a.name if c_a else "Dòng họ",
                target_person_id=m.person_b_id,
                target_name=p_b.full_name if p_b else "Người phối ngẫu",
                target_clan_id=m.clan_b_id,
                target_clan_name=c_b.name if c_b else "Dòng họ đối tác",
                target_user_id=target_link.user_id if target_link else None,
                relationship_type=m.relationship_type,
                status=m.status,
                notes=m.notes,
                review_notes=m.review_notes,
                can_respond=can_respond,
                created_at=m.created_at,
            )
        )
    return results


@router.post("/marriage-invitations/{mapping_id}/respond", response_model=MarriageInvitationResponse)
async def respond_marriage_invitation(
    mapping_id: uuid.UUID,
    data: MarriageInvitationRespond,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Người phối ngẫu chấp nhận (ACCEPT) hoặc từ chối (REJECT) lời mời kết hôn liên họ.
    Khi chấp thuận, trạng thái chuyển sang PENDING (chờ Trưởng tộc 2 họ xác minh chính danh).
    """
    stmt = select(InterClanPersonMapping).where(InterClanPersonMapping.id == mapping_id)
    mapping = (await db.execute(stmt)).scalar_one_or_none()
    if not mapping:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lời mời kết hôn.")

    if mapping.status != "AWAITING_SPOUSE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Lời mời đã ở trạng thái {mapping.status}, không thể phản hồi lại.",
        )

    # Caller phải là người nhận (person_b)
    stmt_link = select(PersonAccountLink).where(
        PersonAccountLink.user_id == caller.user_id,
        PersonAccountLink.person_id == mapping.person_b_id,
        PersonAccountLink.status == "ACTIVE",
    )
    if not (await db.execute(stmt_link)).first() and not caller.is_sa:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không phải là người nhận của lời mời kết hôn này.",
        )

    now = datetime.now(timezone.utc)
    act = data.action.upper().strip()

    p_a = (await db.execute(select(Person).where(Person.id == mapping.person_a_id))).scalar_one_or_none()
    p_b = (await db.execute(select(Person).where(Person.id == mapping.person_b_id))).scalar_one_or_none()
    c_a = (await db.execute(select(Clan).where(Clan.clan_id == mapping.clan_a_id))).scalar_one_or_none()
    c_b = (await db.execute(select(Clan).where(Clan.clan_id == mapping.clan_b_id))).scalar_one_or_none()
    c_a_name = c_a.name if c_a else "Dòng họ"
    c_b_name = c_b.name if c_b else "Dòng họ đối tác"
    name_a = p_a.full_name if p_a else "Thành viên"
    name_b = p_b.full_name if p_b else "Người phối ngẫu"

    if act == "ACCEPT":
        mapping.status = "PENDING"
        mapping.review_notes = data.notes

        admins_a = await get_clan_admin_user_ids(db, mapping.clan_a_id)
        admins_b = await get_clan_admin_user_ids(db, mapping.clan_b_id)
        all_admins = list(set(admins_a + admins_b))

        if all_admins:
            notif = Notification(
                notification_id=uuid.uuid4(),
                clan_id=mapping.clan_a_id,
                type="LINK",
                title="Cặp đôi đã xác nhận hôn phối - Chờ Trưởng tộc xác minh",
                body=f"Cặp đôi {name_a} ({c_a_name}) ⟷ {name_b} ({c_b_name}) đã đồng thuận xác nhận hôn nhân. Kính mời Trưởng tộc vào xét duyệt xác minh chính danh.",
                entity_type="PERSON_MAPPING",
                entity_id=mapping.id,
                created_at=now,
            )
            db.add(notif)
            for tuid in all_admins:
                db.add(UserNotification(
                    notification_id=notif.notification_id,
                    user_id=tuid,
                    delivered_at=now,
                ))

        if mapping.requested_by:
            notif_sender = Notification(
                notification_id=uuid.uuid4(),
                clan_id=mapping.clan_a_id,
                type="LINK",
                title=f"{name_b} đã đồng ý lời mời kết hôn",
                body=f"Người phối ngẫu {name_b} đã đồng thuận kết nối hôn phối. Hồ sơ đang được chuyển đến Trưởng tộc hai bên để xác minh chính danh.",
                entity_type="PERSON_MAPPING",
                entity_id=mapping.id,
                created_at=now,
            )
            db.add(notif_sender)
            db.add(UserNotification(
                notification_id=notif_sender.notification_id,
                user_id=mapping.requested_by,
                delivered_at=now,
            ))

        db.add(AuditLog(
            log_id=uuid.uuid4(),
            clan_id=mapping.clan_b_id,
            actor_id=caller.user_id,
            action="marriage.accept",
            entity_type="INTER_CLAN_PERSON_MAPPING",
            entity_id=mapping.id,
            new_data={"status": "PENDING", "notes": data.notes},
        ))

    elif act == "REJECT":
        mapping.status = "REJECTED"
        mapping.review_notes = data.notes or "Người nhận từ chối lời mời kết hôn."

        if mapping.requested_by:
            notif_sender = Notification(
                notification_id=uuid.uuid4(),
                clan_id=mapping.clan_a_id,
                type="LINK",
                title=f"{name_b} đã từ chối lời mời kết hôn",
                body=f"Lời mời kết nối hôn phối với {name_b} đã bị từ chối. Lý do: {mapping.review_notes}",
                entity_type="PERSON_MAPPING",
                entity_id=mapping.id,
                created_at=now,
            )
            db.add(notif_sender)
            db.add(UserNotification(
                notification_id=notif_sender.notification_id,
                user_id=mapping.requested_by,
                delivered_at=now,
            ))

        db.add(AuditLog(
            log_id=uuid.uuid4(),
            clan_id=mapping.clan_b_id,
            actor_id=caller.user_id,
            action="marriage.reject",
            entity_type="INTER_CLAN_PERSON_MAPPING",
            entity_id=mapping.id,
            new_data={"status": "REJECTED", "reason": mapping.review_notes},
        ))
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hành động không hợp lệ ('ACCEPT' hoặc 'REJECT').")

    await db.commit()
    await db.refresh(mapping)

    return MarriageInvitationResponse(
        id=mapping.id,
        link_id=mapping.link_id,
        sender_user_id=mapping.requested_by,
        sender_name=name_a,
        sender_person_id=mapping.person_a_id,
        sender_clan_id=mapping.clan_a_id,
        sender_clan_name=c_a_name,
        target_person_id=mapping.person_b_id,
        target_name=name_b,
        target_clan_id=mapping.clan_b_id,
        target_clan_name=c_b_name,
        target_user_id=caller.user_id,
        relationship_type=mapping.relationship_type,
        status=mapping.status,
        notes=mapping.notes,
        review_notes=mapping.review_notes,
        can_respond=False,
        created_at=mapping.created_at,
    )


# ==============================================================================
# LINEAGE ACCESS GRANTS & REQUESTS (Phê duyệt quyền xem gia phả 4 đời liên họ)
# ==============================================================================


@router.post("/lineage-access-requests", response_model=LineageAccessRequestResponse)
async def create_lineage_access_request(
    data: LineageAccessRequestCreate,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Member gửi yêu cầu lên Trưởng tộc dòng họ mình để xin cấp quyền xem gia phả 4 đời cho người phối ngẫu.
    (Ví dụ: Hậu gửi lên Trưởng tộc họ Mai xin cho Thảo xem họ Mai; Thảo gửi lên Trưởng tộc họ Dương xin cho Hậu xem họ Dương).
    Điều kiện:
    - Người gửi phải có hồ sơ Person liên kết ACTIVE trong dòng họ mình.
    - Phải có liên kết hôn nhân liên họ (inter_clan_person_mappings) ở trạng thái VERIFIED
      giữa Person của người gửi và anchor_person_id.
    - Hồ sơ người phối ngẫu phải được liên kết với tài khoản người dùng trong hệ thống.
    - Chưa có quyền ACTIVE hay yêu cầu PENDING trùng lặp.
    """
    # 1. Tìm Person liên kết với caller
    stmt_link = (
        select(PersonAccountLink, Person)
        .join(Person, PersonAccountLink.person_id == Person.id)
        .where(
            PersonAccountLink.user_id == caller.user_id,
            PersonAccountLink.status == "ACTIVE",
        )
    )
    res_link = (await db.execute(stmt_link)).first()
    if not res_link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản của bạn chưa được liên kết với hồ sơ thành viên nào trong gia phả.",
        )
    ego_person = res_link[1]
    caller_clan_id = ego_person.family_id

    # 2. Tìm hồ sơ người phối ngẫu (anchor_person)
    spouse_p = (await db.execute(select(Person).where(Person.id == data.anchor_person_id))).scalar_one_or_none()
    if not spouse_p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy hồ sơ người phối ngẫu.")

    # 3. Kiểm tra quan hệ hôn nhân liên họ đã được xác minh chính danh (VERIFIED)
    stmt_map = select(InterClanPersonMapping).where(
        InterClanPersonMapping.status == "VERIFIED",
        (
            (InterClanPersonMapping.person_a_id == ego_person.id)
            & (InterClanPersonMapping.person_b_id == data.anchor_person_id)
        )
        | (
            (InterClanPersonMapping.person_b_id == ego_person.id)
            & (InterClanPersonMapping.person_a_id == data.anchor_person_id)
        ),
    )
    map_row = (await db.execute(stmt_map)).scalar_one_or_none()
    if not map_row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quan hệ hôn nhân với thành viên dòng họ đối tác chưa được xác minh (chưa có hồ sơ thông gia chính danh).",
        )

    # 4. Xác định dòng họ chia sẻ dữ liệu và người nhận quyền:
    # Thành viên gửi lên Trưởng tộc dòng họ mình để xin cấp quyền cho người phối ngẫu
    stmt_spouse_link = select(PersonAccountLink).where(
        PersonAccountLink.person_id == data.anchor_person_id,
        PersonAccountLink.status == "ACTIVE",
    )
    spouse_account_link = (await db.execute(stmt_spouse_link)).scalar_one_or_none()
    spouse_user_id = spouse_account_link.user_id if spouse_account_link else None

    # Hỗ trợ cả 2 trường hợp:
    # Case A: data.owner_clan_id là dòng họ của caller (hoặc None) -> requester=caller, grantee=spouse_user_id, owner_clan=caller_clan
    # Case B: data.owner_clan_id là dòng họ của spouse -> requester=caller, grantee=caller.user_id (legacy fallback)
    if data.owner_clan_id and data.owner_clan_id == spouse_p.family_id and spouse_p.family_id != caller_clan_id:
        target_owner_clan_id = data.owner_clan_id
        target_grantee_user_id = caller.user_id
    else:
        if not spouse_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Hồ sơ người phối ngẫu ({spouse_p.full_name}) chưa được liên kết với tài khoản người dùng trong hệ thống.",
            )
        target_owner_clan_id = caller_clan_id
        target_grantee_user_id = spouse_user_id

    # 5. Kiểm tra xem đã có quyền ACTIVE chưa
    stmt_grant = select(LineageAccessGrant).where(
        LineageAccessGrant.owner_clan_id == target_owner_clan_id,
        LineageAccessGrant.grantee_user_id == target_grantee_user_id,
        LineageAccessGrant.status == "ACTIVE",
    )
    existing_grant = (await db.execute(stmt_grant)).scalar_one_or_none()
    if existing_grant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Người phối ngẫu đã được cấp quyền xem gia phả của dòng họ này rồi.",
        )

    # 6. Kiểm tra xem có yêu cầu PENDING nào chưa
    stmt_pending = select(LineageAccessRequest).where(
        LineageAccessRequest.owner_clan_id == target_owner_clan_id,
        LineageAccessRequest.grantee_user_id == target_grantee_user_id,
        LineageAccessRequest.status == "PENDING",
    )
    existing_pending = (await db.execute(stmt_pending)).scalar_one_or_none()
    if existing_pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Yêu cầu xin cấp quyền cho người phối ngẫu đang chờ Trưởng tộc xét duyệt, vui lòng kiên nhẫn.",
        )

    # 7. Tạo yêu cầu mới
    req = LineageAccessRequest(
        id=uuid.uuid4(),
        owner_clan_id=target_owner_clan_id,
        requester_user_id=caller.user_id,
        anchor_person_id=data.anchor_person_id,
        grantee_user_id=target_grantee_user_id,
        scope_type="FOUR_GENERATIONS",
        status="PENDING",
        reason=data.reason,
    )
    db.add(req)

    clan = (await db.execute(select(Clan).where(Clan.clan_id == target_owner_clan_id))).scalar_one_or_none()
    owner_clan_name = clan.name if clan else "Dòng họ"
    anchor_name = spouse_p.full_name

    # 8. Gửi in-app notification tới Trưởng tộc / Admins của dòng họ sở hữu dữ liệu
    target_admins = await get_clan_admin_user_ids(db, target_owner_clan_id)
    now = datetime.now(timezone.utc)
    if target_admins:
        notif = Notification(
            notification_id=uuid.uuid4(),
            clan_id=target_owner_clan_id,
            type="LINK",
            title=f"Yêu cầu cấp quyền xem gia phả từ {ego_person.full_name}",
            body=f"Thành viên {ego_person.full_name} xin phép cấp quyền xem nhánh gia phả 4 đời của dòng họ {owner_clan_name} cho người phối ngẫu là {anchor_name}. Lý do: {data.reason or 'Không có'}",
            entity_type="LINEAGE_ACCESS_REQUEST",
            entity_id=req.id,
            created_at=now,
        )
        db.add(notif)
        for tuid in target_admins:
            db.add(UserNotification(
                notification_id=notif.notification_id,
                user_id=tuid,
                delivered_at=now,
            ))

    # 9. Ghi AuditLog
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=target_owner_clan_id,
        actor_id=caller.user_id,
        action="lineage_access.request",
        entity_type="LINEAGE_ACCESS_REQUEST",
        entity_id=req.id,
        new_data={
            "requester_user_id": str(caller.user_id),
            "grantee_user_id": str(target_grantee_user_id),
            "owner_clan_id": str(target_owner_clan_id),
            "anchor_person_id": str(data.anchor_person_id),
            "reason": data.reason,
        },
    ))

    await db.commit()
    await db.refresh(req)

    grantee_user = (await db.execute(select(User).where(User.user_id == target_grantee_user_id))).scalar_one_or_none()
    grantee_name = grantee_user.email if grantee_user else anchor_name

    return LineageAccessRequestResponse(
        id=req.id,
        owner_clan_id=req.owner_clan_id,
        owner_clan_name=owner_clan_name,
        requester_user_id=req.requester_user_id,
        requester_name=ego_person.full_name,
        anchor_person_id=req.anchor_person_id,
        anchor_person_name=anchor_name,
        grantee_user_id=req.grantee_user_id,
        grantee_name=grantee_name,
        scope_type=req.scope_type,
        status=req.status,
        reason=req.reason,
        reviewed_by=req.reviewed_by,
        reviewed_at=req.reviewed_at,
        rejection_reason=req.rejection_reason,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.get("/lineage-access-requests/my", response_model=List[LineageAccessRequestResponse])
async def get_my_lineage_access_requests(
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Lấy danh sách các yêu cầu xem phả hệ liên họ mà người dùng đã gửi đi.
    """
    stmt = (
        select(
            LineageAccessRequest,
            Clan.name.label("owner_clan_name"),
            Person.full_name.label("anchor_person_name"),
        )
        .join(Clan, LineageAccessRequest.owner_clan_id == Clan.clan_id)
        .join(Person, LineageAccessRequest.anchor_person_id == Person.id)
        .where(LineageAccessRequest.grantee_user_id == caller.user_id)
        .order_by(LineageAccessRequest.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    results = []
    for req, clan_name, anchor_name in rows:
        results.append(
            LineageAccessRequestResponse(
                id=req.id,
                owner_clan_id=req.owner_clan_id,
                owner_clan_name=clan_name,
                requester_user_id=req.requester_user_id,
                requester_name=getattr(caller.account, "email", "Thành viên"),
                anchor_person_id=req.anchor_person_id,
                anchor_person_name=anchor_name,
                grantee_user_id=req.grantee_user_id,
                grantee_name=getattr(caller.account, "email", "Thành viên"),
                scope_type=req.scope_type,
                status=req.status,
                reason=req.reason,
                reviewed_by=req.reviewed_by,
                reviewed_at=req.reviewed_at,
                rejection_reason=req.rejection_reason,
                created_at=req.created_at,
                updated_at=req.updated_at,
            )
        )
    return results


@router.get("/lineage-access-requests/pending", response_model=List[LineageAccessRequestResponse])
async def get_pending_lineage_access_requests(
    clan_id: Optional[uuid.UUID] = Query(None, description="Dòng họ cần lọc yêu cầu"),
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Trưởng tộc / Quản trị viên dòng họ lấy danh sách yêu cầu xin xem gia phả gửi đến dòng họ của mình.
    """
    managed_clans: list[uuid.UUID] = []
    if clan_id:
        if not await caller.manages(clan_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền quản lý dòng họ này.")
        managed_clans = [clan_id]
    else:
        for c in caller.clans:
            if await caller.manages(c):
                managed_clans.append(c)
        if caller.is_sa and not managed_clans:
            all_clans = (await db.execute(select(Clan.clan_id))).scalars().all()
            managed_clans = list(all_clans)

    if not managed_clans:
        return []

    stmt = (
        select(
            LineageAccessRequest,
            Clan.name.label("owner_clan_name"),
            Person.full_name.label("anchor_person_name"),
            User.email.label("grantee_email"),
        )
        .join(Clan, LineageAccessRequest.owner_clan_id == Clan.clan_id)
        .join(Person, LineageAccessRequest.anchor_person_id == Person.id)
        .join(User, LineageAccessRequest.grantee_user_id == User.user_id)
        .where(LineageAccessRequest.owner_clan_id.in_(managed_clans))
        .order_by(LineageAccessRequest.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    results = []
    for req, clan_name, anchor_name, grantee_email in rows:
        results.append(
            LineageAccessRequestResponse(
                id=req.id,
                owner_clan_id=req.owner_clan_id,
                owner_clan_name=clan_name,
                requester_user_id=req.requester_user_id,
                requester_name=grantee_email or "Người yêu cầu",
                anchor_person_id=req.anchor_person_id,
                anchor_person_name=anchor_name,
                grantee_user_id=req.grantee_user_id,
                grantee_name=grantee_email or "Người được cấp quyền",
                scope_type=req.scope_type,
                status=req.status,
                reason=req.reason,
                reviewed_by=req.reviewed_by,
                reviewed_at=req.reviewed_at,
                rejection_reason=req.rejection_reason,
                created_at=req.created_at,
                updated_at=req.updated_at,
            )
        )
    return results


@router.post("/lineage-access-requests/{request_id}/review", response_model=LineageAccessRequestResponse)
async def review_lineage_access_request(
    request_id: uuid.UUID,
    data: LineageAccessReviewRequest,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Trưởng tộc / Quản trị viên phê duyệt (APPROVE) hoặc từ chối (REJECT) yêu cầu cấp quyền xem cây gia phả.
    """
    stmt = select(LineageAccessRequest).where(LineageAccessRequest.id == request_id)
    req = (await db.execute(stmt)).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu.")

    if not await caller.manages(req.owner_clan_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền quản lý dòng họ này.")

    if req.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Yêu cầu đã ở trạng thái {req.status}, không thể xét duyệt lại.",
        )

    now = datetime.now(timezone.utc)
    clan = (await db.execute(select(Clan).where(Clan.clan_id == req.owner_clan_id))).scalar_one_or_none()
    clan_name = clan.name if clan else "Dòng họ"
    action = data.action.upper().strip()

    if action == "APPROVE":
        req.status = "APPROVED"
        req.reviewed_by = caller.user_id
        req.reviewed_at = now
        req.updated_at = now

        # Kiểm tra xem đã có grant nào chưa, nếu có update ACTIVE, nếu chưa tạo mới
        stmt_existing = select(LineageAccessGrant).where(
            LineageAccessGrant.owner_clan_id == req.owner_clan_id,
            LineageAccessGrant.grantee_user_id == req.grantee_user_id,
        )
        existing_grant = (await db.execute(stmt_existing)).scalar_one_or_none()
        if existing_grant:
            existing_grant.status = "ACTIVE"
            existing_grant.request_id = req.id
            existing_grant.anchor_person_id = req.anchor_person_id
            existing_grant.scope_type = req.scope_type
            existing_grant.permission = "VIEW_ONLY"
            existing_grant.approved_by = caller.user_id
            existing_grant.approved_at = now
            existing_grant.revoked_by = None
            existing_grant.revoked_at = None
            existing_grant.revocation_reason = None
            existing_grant.updated_at = now
        else:
            grant = LineageAccessGrant(
                id=uuid.uuid4(),
                request_id=req.id,
                owner_clan_id=req.owner_clan_id,
                anchor_person_id=req.anchor_person_id,
                grantee_user_id=req.grantee_user_id,
                scope_type=req.scope_type,
                permission="VIEW_ONLY",
                status="ACTIVE",
                approved_by=caller.user_id,
                approved_at=now,
            )
            db.add(grant)

        # Thông báo tới người được cấp quyền
        notif = Notification(
            notification_id=uuid.uuid4(),
            clan_id=req.owner_clan_id,
            type="LINK",
            title=f"Yêu cầu xem gia phả đã được phê duyệt",
            body=f"Trưởng tộc dòng họ {clan_name} đã chấp thuận cấp quyền xem cây gia phả 4 đời cho bạn.",
            entity_type="LINEAGE_ACCESS_GRANT",
            entity_id=req.id,
            created_at=now,
        )
        db.add(notif)
        db.add(UserNotification(
            notification_id=notif.notification_id,
            user_id=req.grantee_user_id,
            delivered_at=now,
        ))

        # AuditLog
        db.add(AuditLog(
            log_id=uuid.uuid4(),
            clan_id=req.owner_clan_id,
            actor_id=caller.user_id,
            action="lineage_access.approve",
            entity_type="LINEAGE_ACCESS_REQUEST",
            entity_id=req.id,
            new_data={"grantee_user_id": str(req.grantee_user_id), "status": "APPROVED"},
        ))

    elif action == "REJECT":
        if not data.rejection_reason or not data.rejection_reason.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vui lòng cung cấp lý do từ chối.")
        req.status = "REJECTED"
        req.reviewed_by = caller.user_id
        req.reviewed_at = now
        req.rejection_reason = data.rejection_reason.strip()
        req.updated_at = now

        # Thông báo tới người bị từ chối
        notif = Notification(
            notification_id=uuid.uuid4(),
            clan_id=req.owner_clan_id,
            type="LINK",
            title=f"Yêu cầu xem gia phả đã bị từ chối",
            body=f"Trưởng tộc dòng họ {clan_name} đã từ chối yêu cầu của bạn. Lý do: {req.rejection_reason}",
            entity_type="LINEAGE_ACCESS_REQUEST",
            entity_id=req.id,
            created_at=now,
        )
        db.add(notif)
        db.add(UserNotification(
            notification_id=notif.notification_id,
            user_id=req.grantee_user_id,
            delivered_at=now,
        ))

        # AuditLog
        db.add(AuditLog(
            log_id=uuid.uuid4(),
            clan_id=req.owner_clan_id,
            actor_id=caller.user_id,
            action="lineage_access.reject",
            entity_type="LINEAGE_ACCESS_REQUEST",
            entity_id=req.id,
            new_data={"rejection_reason": req.rejection_reason, "status": "REJECTED"},
        ))
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hành động không hợp lệ (APPROVE hoặc REJECT).")

    await db.commit()
    await db.refresh(req)

    anchor_p = (await db.execute(select(Person).where(Person.id == req.anchor_person_id))).scalar_one_or_none()
    grantee_u = (await db.execute(select(User).where(User.user_id == req.grantee_user_id))).scalar_one_or_none()

    return LineageAccessRequestResponse(
        id=req.id,
        owner_clan_id=req.owner_clan_id,
        owner_clan_name=clan_name,
        requester_user_id=req.requester_user_id,
        requester_name=grantee_u.email if grantee_u else "Người yêu cầu",
        anchor_person_id=req.anchor_person_id,
        anchor_person_name=anchor_p.full_name if anchor_p else "Người phối ngẫu",
        grantee_user_id=req.grantee_user_id,
        grantee_name=grantee_u.email if grantee_u else "Người được cấp quyền",
        scope_type=req.scope_type,
        status=req.status,
        reason=req.reason,
        reviewed_by=req.reviewed_by,
        reviewed_at=req.reviewed_at,
        rejection_reason=req.rejection_reason,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.post("/lineage-access-grants/{grant_id}/revoke", response_model=LineageAccessGrantResponse)
async def revoke_lineage_access_grant(
    grant_id: uuid.UUID,
    data: LineageAccessRevokeRequest,
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Trưởng tộc / Quản trị viên thu hồi quyền xem cây gia phả liên họ đã cấp.
    Ngay lập tức, người phối ngẫu sẽ không thể truy cập dữ liệu gia phả 4 đời của dòng họ.
    """
    stmt = select(LineageAccessGrant).where(LineageAccessGrant.id == grant_id)
    grant = (await db.execute(stmt)).scalar_one_or_none()
    if not grant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bản ghi cấp quyền.")

    if not await caller.manages(grant.owner_clan_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền quản lý dòng họ này.")

    if grant.status != "ACTIVE":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quyền này không ở trạng thái kích hoạt.")

    now = datetime.now(timezone.utc)
    clan = (await db.execute(select(Clan).where(Clan.clan_id == grant.owner_clan_id))).scalar_one_or_none()
    clan_name = clan.name if clan else "Dòng họ"

    grant.status = "REVOKED"
    grant.revoked_by = caller.user_id
    grant.revoked_at = now
    grant.revocation_reason = (data.revocation_reason or "Thu hồi bởi Quản trị viên / Trưởng tộc").strip()
    grant.updated_at = now

    # Thông báo thu hồi tới người dùng bị thu hồi quyền
    notif = Notification(
        notification_id=uuid.uuid4(),
        clan_id=grant.owner_clan_id,
        type="LINK",
        title=f"Quyền xem gia phả liên họ đã bị thu hồi",
        body=f"Trưởng tộc dòng họ {clan_name} đã thu hồi quyền xem gia phả của bạn. Lý do: {grant.revocation_reason}",
        entity_type="LINEAGE_ACCESS_REVOKE",
        entity_id=grant.id,
        created_at=now,
    )
    db.add(notif)
    db.add(UserNotification(
        notification_id=notif.notification_id,
        user_id=grant.grantee_user_id,
        delivered_at=now,
    ))

    # Ghi nhận AuditLog
    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=grant.owner_clan_id,
        actor_id=caller.user_id,
        action="lineage_access.revoke",
        entity_type="LINEAGE_ACCESS_GRANT",
        entity_id=grant.id,
        new_data={
            "grantee_user_id": str(grant.grantee_user_id),
            "revocation_reason": grant.revocation_reason,
            "status": "REVOKED",
        },
    ))

    await db.commit()
    await db.refresh(grant)

    anchor_p = (await db.execute(select(Person).where(Person.id == grant.anchor_person_id))).scalar_one_or_none()
    grantee_u = (await db.execute(select(User).where(User.user_id == grant.grantee_user_id))).scalar_one_or_none()

    return LineageAccessGrantResponse(
        id=grant.id,
        request_id=grant.request_id,
        owner_clan_id=grant.owner_clan_id,
        owner_clan_name=clan_name,
        anchor_person_id=grant.anchor_person_id,
        anchor_person_name=anchor_p.full_name if anchor_p else "Người phối ngẫu",
        grantee_user_id=grant.grantee_user_id,
        grantee_name=grantee_u.email if grantee_u else "Người dùng",
        scope_type=grant.scope_type,
        permission=grant.permission,
        status=grant.status,
        approved_by=grant.approved_by,
        approved_at=grant.approved_at,
        expires_at=grant.expires_at,
        revoked_by=grant.revoked_by,
        revoked_at=grant.revoked_at,
        revocation_reason=grant.revocation_reason,
        created_at=grant.created_at,
        updated_at=grant.updated_at,
    )


@router.get("/lineage-access-grants", response_model=List[LineageAccessGrantResponse])
async def list_lineage_access_grants(
    clan_id: Optional[uuid.UUID] = Query(None, description="Lọc theo dòng họ quản lý"),
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
):
    """
    Danh sách các quyền truy cập gia phả đã cấp thuộc các dòng họ do người dùng quản lý.
    """
    managed_clans: list[uuid.UUID] = []
    if clan_id:
        if not await caller.manages(clan_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền quản lý dòng họ này.")
        managed_clans = [clan_id]
    else:
        for c in caller.clans:
            if await caller.manages(c):
                managed_clans.append(c)
        if caller.is_sa and not managed_clans:
            all_clans = (await db.execute(select(Clan.clan_id))).scalars().all()
            managed_clans = list(all_clans)

    if not managed_clans:
        return []

    stmt = (
        select(
            LineageAccessGrant,
            Clan.name.label("owner_clan_name"),
            Person.full_name.label("anchor_person_name"),
            User.email.label("grantee_email"),
        )
        .join(Clan, LineageAccessGrant.owner_clan_id == Clan.clan_id)
        .join(Person, LineageAccessGrant.anchor_person_id == Person.id)
        .join(User, LineageAccessGrant.grantee_user_id == User.user_id)
        .where(LineageAccessGrant.owner_clan_id.in_(managed_clans))
        .order_by(LineageAccessGrant.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    results = []
    for g, clan_name, anchor_name, grantee_email in rows:
        results.append(
            LineageAccessGrantResponse(
                id=g.id,
                request_id=g.request_id,
                owner_clan_id=g.owner_clan_id,
                owner_clan_name=clan_name,
                anchor_person_id=g.anchor_person_id,
                anchor_person_name=anchor_name,
                grantee_user_id=g.grantee_user_id,
                grantee_name=grantee_email or "Người dùng",
                scope_type=g.scope_type,
                permission=g.permission,
                status=g.status,
                approved_by=g.approved_by,
                approved_at=g.approved_at,
                expires_at=g.expires_at,
                revoked_by=g.revoked_by,
                revoked_at=g.revoked_at,
                revocation_reason=g.revocation_reason,
                created_at=g.created_at,
                updated_at=g.updated_at,
            )
        )
    return results

