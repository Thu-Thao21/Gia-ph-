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


@router.get("/diagram")
async def get_network_diagram(
    caller: Caller = Depends(get_caller),
    db: AsyncSession = Depends(get_db),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Network graph: connected clans as nodes; edges for active links, enriched with link types,
    verified in-law mappings count, and sharing policy scopes."""
    clans = await repo.list_active_clans()
    links = await repo.list_links(clan_ids=caller.scope(), status="ACTIVE")

    caller_clan_ids = caller.clans
    linked_clan_ids = {c for l in links for c in (l.clan_a_id, l.clan_b_id)}

    clan_map = {c.clan_id: c for c in clans}
    clan_names = {str(c.clan_id): c.name for c in clans}

    target_clan_ids = list(clan_map.keys())
    profiles_map = {}
    member_counts = defaultdict(int)

    if hasattr(db, "execute") and target_clan_ids:
        try:
            prof_res = await db.execute(select(ClanProfile).where(ClanProfile.clan_id.in_(target_clan_ids)))
            profiles_map = {p.clan_id: p for p in prof_res.scalars().all()}

            cnt_res = await db.execute(
                select(Person.family_id, func.count(Person.id))
                .where(Person.family_id.in_(target_clan_ids), Person.status == "ACTIVE")
                .group_by(Person.family_id)
            )
            for cid, cnt in cnt_res.all():
                member_counts[cid] = cnt
        except Exception:
            pass

    edges = []
    type_labels = {
        "IN_LAW": "Thông gia",
        "ANCESTRAL": "Cùng tổ tiên",
        "ALLIED": "Hợp tác",
    }
    for l in links:
        verified_list = await repo.list_person_mappings(l.id, status="VERIFIED")
        verified_cnt = len(verified_list)
        conn_type = getattr(l, "connection_type", "IN_LAW")

        pol_a = await repo.get_policy(l.id, l.clan_a_id)
        pol_b = await repo.get_policy(l.id, l.clan_b_id)

        edges.append({
            "id": str(l.id),
            "source": str(l.clan_a_id),
            "sourceName": clan_names.get(str(l.clan_a_id), "Dòng họ"),
            "target": str(l.clan_b_id),
            "targetName": clan_names.get(str(l.clan_b_id), "Dòng họ"),
            "connectionType": conn_type,
            "label": type_labels.get(conn_type, "Liên kết"),
            "status": l.status,
            "linkedAt": l.linked_at.isoformat() if l.linked_at else None,
            "verifiedCount": verified_cnt,
            "policies": {
                str(l.clan_a_id): pol_a.data_scope if pol_a else "BASIC",
                str(l.clan_b_id): pol_b.data_scope if pol_b else "BASIC",
            },
        })

    nodes = []
    for c in clans:
        c_id = c.clan_id
        is_caller = c_id in caller_clan_ids
        is_linked = c_id in linked_clan_ids

        if is_caller:
            category = "CURRENT"
            category_label = "Dòng họ của bạn"
        elif is_linked:
            direct_link = next(
                (l for l in links if (l.clan_a_id in caller_clan_ids and l.clan_b_id == c_id) or (l.clan_b_id in caller_clan_ids and l.clan_a_id == c_id)),
                None
            )
            conn_t = getattr(direct_link, "connection_type", "IN_LAW") if direct_link else "ALLIED"
            category = conn_t
            category_label = type_labels.get(conn_t, "Liên kết")
        else:
            category = "UNLINKED"
            category_label = "Chưa kết nối"

        profile = profiles_map.get(c_id)

        nodes.append({
            "id": str(c_id),
            "name": c.name,
            "code": c.clan_code,
            "isCallerClan": is_caller,
            "isLinked": is_linked,
            "category": category,
            "categoryLabel": category_label,
            "memberCount": member_counts.get(c_id, 0),
            "originPlace": profile.origin_place if profile and profile.origin_place else "Chưa rõ quê quán",
            "status": c.status,
            "connectionsCount": sum(1 for e in edges if e["source"] == str(c_id) or e["target"] == str(c_id)),
        })

    return {"nodes": nodes, "edges": edges}




@router.get("/shared-tree/{target_family_id}", response_model=TreeDataResponse)
@router.get("/families/{target_family_id}/shared-tree", response_model=TreeDataResponse)
async def get_shared_tree(
    target_family_id: str,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Shared tree of a clan LINKED to one of the caller's clans, under the target clan's policy
    on that link (FR-BO-56, FR-BO-77). SA: any clan."""
    target_uuid = _uuid(target_family_id, "Family")

    links = await repo.active_links_between(target_uuid, clan_ids=caller.scope())
    if not links and (not caller.is_sa or await repo.get_clan(target_uuid) is None):
        raise _not_found("Family not found or not connected")

    # Fetch sharing policy of target family on the caller's link
    policy = await repo.get_policy(links[0].id, target_uuid) if links else None
    allowed_fields = normalize_allowed_fields(policy.allowed_fields if policy else None)
    can_export = bool(policy.can_export) if policy else False

    # Fetch persons, relationships, and individual privacy settings of target clan
    persons = await repo.persons_of(target_uuid)
    relationships = await repo.relationships_of(target_uuid)
    privacy_map = await repo.privacy_settings_of([p.id for p in persons])

    # Build tree nodes with privacy scoping: every field through the owner clan's policy + individual privacy
    nodes = [shared_tree_node(p, allowed_fields, privacy_map.get(p.id)) for p in persons]

    edges = [
        RelationshipResponse(
            id=str(r.id),
            fromMemberId=str(r.from_member_id),
            toMemberId=str(r.to_member_id),
            relationshipType=r.relationship_type,
            notes=None,
        )
        for r in relationships
    ]

    return TreeDataResponse(nodes=nodes, edges=edges, canExport=can_export)


# ==============================================================================
# GIAI ĐOẠN 5: CÂY GIA PHẢ LIÊN HỌ KẾT HỢP (HYBRID TREE VIEW)
# ==============================================================================

@router.get("/links/{link_id}/hybrid-tree")
async def get_hybrid_tree(
    link_id: str,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Generates a hybrid connected genealogy tree between two linked clans at their verified
    in-law bridge points (Giai đoạn 5). Read-only for partner clan; enforces partner clan's
    sharing policy and individual privacy settings."""
    link = await _visible_link(repo, caller, link_id)
    if link.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cây liên họ chỉ khả dụng với liên kết đang hoạt động (ACTIVE)",
        )

    # Verified in-law mappings for this link
    verified_mappings = await repo.list_person_mappings(link.id, status="VERIFIED")

    # Determine primary (caller's) and partner clan
    caller_clan_ids = caller.clans
    if link.clan_a_id in caller_clan_ids:
        primary_clan_id = link.clan_a_id
        partner_clan_id = link.clan_b_id
    elif link.clan_b_id in caller_clan_ids:
        primary_clan_id = link.clan_b_id
        partner_clan_id = link.clan_a_id
    elif caller.is_sa:
        primary_clan_id = link.clan_a_id
        partner_clan_id = link.clan_b_id
    else:
        raise _forbidden("Bạn không có quyền truy cập cây gia phả liên họ này")

    clan_names = await repo.clan_names([primary_clan_id, partner_clan_id])
    primary_name = clan_names.get(str(primary_clan_id), "Dòng họ chính")
    partner_name = clan_names.get(str(partner_clan_id), "Dòng họ liên kết")

    # Partner clan's sharing policy
    policy = await repo.get_policy(link.id, partner_clan_id)
    allowed_fields = normalize_allowed_fields(policy.allowed_fields if policy else None)
    can_export = bool(policy.can_export) if policy else False
    data_scope = policy.data_scope if policy else "BASIC"

    # Query persons and relationships for both clans
    primary_persons = await repo.persons_of(primary_clan_id)
    primary_rels = await repo.relationships_of(primary_clan_id)

    partner_persons = await repo.persons_of(partner_clan_id)
    partner_rels = await repo.relationships_of(partner_clan_id)
    partner_privacy_map = await repo.privacy_settings_of([p.id for p in partner_persons])

    # Nodes construction
    nodes = []
    # 1. Primary clan nodes (full access)
    for p in primary_persons:
        living = p.is_alive is None or bool(p.is_alive)
        nodes.append({
            "id": str(p.id),
            "clanId": str(primary_clan_id),
            "clanName": primary_name,
            "isPrimaryClan": True,
            "fullName": p.full_name,
            "gender": p.gender or "unknown",
            "generation": p.generation or 1,
            "branchId": str(p.branch_id) if p.branch_id else None,
            "avatarUrl": p.avatar_url,
            "isLiving": living,
            "status": p.status,
            "birthDate": format_date_safe(p.birth_date),
            "deathDate": format_date_safe(p.death_date),
            "privacyLevel": "OWN_CLAN",
            "isReadOnly": False,
        })

    # 2. Partner clan nodes (strictly filtered by InterClanSharedPolicy & PersonPrivacySetting)
    for p in partner_persons:
        tn = shared_tree_node(p, allowed_fields, partner_privacy_map.get(p.id))
        nodes.append({
            "id": str(p.id),
            "clanId": str(partner_clan_id),
            "clanName": partner_name,
            "isPrimaryClan": False,
            "fullName": tn.full_name,
            "gender": tn.gender,
            "generation": tn.generation,
            "branchId": tn.branch_id,
            "avatarUrl": tn.avatar_url,
            "isLiving": tn.is_alive,
            "status": tn.status,
            "birthDate": format_date_safe(getattr(tn, "birth_date", None) or getattr(tn, "birthDate", None)),
            "deathDate": format_date_safe(getattr(tn, "death_date", None) or getattr(tn, "deathDate", None)),
            "privacyLevel": tn.privacy_level,
            "isReadOnly": True,
        })

    # Edges construction
    edges = []
    for r in primary_rels:
        edges.append({
            "id": str(r.id),
            "fromMemberId": str(r.from_member_id),
            "toMemberId": str(r.to_member_id),
            "relationshipType": r.relationship_type,
            "isBridge": False,
            "clanId": str(primary_clan_id),
        })

    for r in partner_rels:
        edges.append({
            "id": str(r.id),
            "fromMemberId": str(r.from_member_id),
            "toMemberId": str(r.to_member_id),
            "relationshipType": r.relationship_type,
            "isBridge": False,
            "clanId": str(partner_clan_id),
        })

    # Bridge edges for verified cross-clan mappings
    bridges = []
    for m in verified_mappings:
        is_a_primary = m.clan_a_id == primary_clan_id
        primary_pid = str(m.person_a_id) if is_a_primary else str(m.person_b_id)
        partner_pid = str(m.person_b_id) if is_a_primary else str(m.person_a_id)

        p_primary = next((p for p in primary_persons if str(p.id) == primary_pid), None)
        p_partner = next((p for p in partner_persons if str(p.id) == partner_pid), None)
        p_partner_tn = shared_tree_node(p_partner, allowed_fields, partner_privacy_map.get(p_partner.id)) if p_partner else None

        bridge_item = {
            "id": f"bridge-{m.id}",
            "mappingId": str(m.id),
            "primaryPersonId": primary_pid,
            "primaryPersonName": p_primary.full_name if p_primary else "Thành viên",
            "partnerPersonId": partner_pid,
            "partnerPersonName": p_partner_tn.full_name if p_partner_tn else "Thành viên liên tộc",
            "relationshipType": "CROSS_CLAN_SPOUSE",
            "label": "Hôn nhân liên tộc (Đã xác minh)",
            "isBridge": True,
        }
        bridges.append(bridge_item)
        edges.append({
            "id": bridge_item["id"],
            "fromMemberId": primary_pid,
            "toMemberId": partner_pid,
            "relationshipType": "CROSS_CLAN_SPOUSE",
            "isBridge": True,
            "label": bridge_item["label"],
        })

    return {
        "linkId": str(link.id),
        "connectionType": getattr(link, "connection_type", "IN_LAW"),
        "primaryClan": {
            "id": str(primary_clan_id),
            "name": primary_name,
        },
        "partnerClan": {
            "id": str(partner_clan_id),
            "name": partner_name,
            "dataScope": data_scope,
            "canExport": can_export,
        },
        "bridges": bridges,
        "nodes": nodes,
        "edges": edges,
        "canExport": can_export,
    }


# ==============================================================================
# GIAI ĐOẠN 2: PERSON MAPPINGS & CROSS-CLAN VERIFICATION
# ==============================================================================

