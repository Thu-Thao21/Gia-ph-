"""Inter-Family Networking & Data Sharing Router (FR-BO-53..57, FR-BO-77).

Access (Mốc M2b). Every route needs a session; the caller's clans are the clans they are an
ACTIVE member of; "manage clan X" means the family permission family.update in X (AccessService,
the same check as the genealogy and member routes). A System Admin (SA) passes every check.

  GET  /families, /diagram       every ACTIVE clan (public directory data); links and
                                 "connected" only for links that involve the caller's clans
  GET  /links, /link-requests    only rows that involve one of the caller's clans
  GET  /links/{id}/policies      the caller is in one of the link's two clans
  PUT  /links/{id}/policies      manage the policy's owner clan
  DELETE|POST /links/{id}[/terminate]   manage one of the link's two clans
  POST /link-requests            manage the SOURCE clan named in the body (never any clan)
  POST /link-requests/{id}/review       manage the TARGET clan
  GET  /shared-tree/{clan}       member of a clan with an ACTIVE link to that clan

A link or request that involves none of the caller's clans answers 404, exactly like an id
that does not exist (no probing of other clans' ids); being in the clan without the right to
manage it answers 403.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.models.family.entities import Clan, ClanMembership, ClanProfile, Notification, UserNotification
from app.models.genealogy.entities import Branch, Person, Relationship
from app.models.inter_family import (
    InterClanLink,
    InterClanPersonMapping,
    InterClanRequest,
    InterClanSharedPolicy,
)
from app.models.genealogy.entities import PersonPrivacySetting
from app.models.inter_family.repository import InterFamilyRepository
from app.models.postgres import Account
from app.schemas.genealogy import RelationshipResponse, TreeDataResponse, TreeNode
from app.services.auth_access.access_service import AccessService

router = APIRouter(prefix="/networks", tags=["inter-family"])

MANAGE_PERMISSION = "family.update"
DEFAULT_ALLOWED_FIELDS = {
    "full_name": True,
    "gender": True,
    "generation": True,
    "avatar_url": True,
    "branch_id": False,
    "birth_date": False,
    "death_date": False,
    "bio": False,
    "burial_location": False,
    "living_persons": False,
}

SCOPE_PRESETS = {
    "BASIC": {
        "full_name": True,
        "gender": True,
        "generation": True,
        "avatar_url": True,
        "branch_id": False,
        "birth_date": False,
        "death_date": False,
        "bio": False,
        "burial_location": False,
        "living_persons": False,
    },
    "EXTENDED": {
        "full_name": True,
        "gender": True,
        "generation": True,
        "avatar_url": True,
        "branch_id": True,
        "birth_date": True,
        "death_date": True,
        "bio": False,
        "burial_location": False,
        "living_persons": False,
    },
    "FULL": {
        "full_name": True,
        "gender": True,
        "generation": True,
        "avatar_url": True,
        "branch_id": True,
        "birth_date": True,
        "death_date": True,
        "bio": True,
        "burial_location": True,
        "living_persons": True,
    },
}

# ----- shared-tree privacy (Giai doan 3: Data Sharing Policy & Privacy Boundary) -----
MASKED_NAME = "Thành viên gia tộc (Bảo mật)"
MASKED_GENDER = "unknown"
MASKED_GENERATION = 0


def normalize_allowed_fields(raw: Any) -> dict[str, bool]:
    base = dict(DEFAULT_ALLOWED_FIELDS)
    if not raw:
        return base
    if isinstance(raw, (list, tuple, set)):
        for item in raw:
            k = str(item).lower().strip()
            if k == "biography":
                k = "bio"
            base[k] = True
        return base
    if isinstance(raw, dict):
        for k, v in raw.items():
            key = str(k).lower().strip()
            if key == "biography":
                key = "bio"
            base[key] = bool(v)
        return base
    return base


def format_date_safe(d: Any) -> Optional[str]:
    if not d:
        return None
    if hasattr(d, "strftime"):
        return d.strftime("%d/%m/%Y")
    return str(d)


def shared_tree_node(person, allowed_fields: Any, privacy: Optional[PersonPrivacySetting] = None) -> TreeNode:
    norm_allowed = normalize_allowed_fields(allowed_fields)

    def allowed(key: str) -> bool:
        return norm_allowed.get(key) is True

    living = person.is_alive is None or bool(person.is_alive)

    indiv_name_vis = (privacy.full_name_visibility if privacy else "CLAN").upper()
    indiv_avatar_vis = (privacy.avatar_visibility if privacy else "CLAN").upper()
    indiv_birth_vis = (privacy.birth_date_visibility if privacy else "CLAN").upper()

    # Living person privacy:
    # 1. Clan sharing policy must allow living_persons
    # 2. Individual privacy must not be CLAN, PRIVATE, or HIDDEN (since viewer is from external clan)
    is_living_masked = False
    if living:
        if not allowed("living_persons"):
            is_living_masked = True
        elif indiv_name_vis in ("CLAN", "PRIVATE", "HIDDEN"):
            is_living_masked = True

    can_show_identity = not is_living_masked and allowed("full_name")
    can_show_gender = not is_living_masked and allowed("gender")
    can_show_gen = not is_living_masked and allowed("generation")
    can_show_avatar = not is_living_masked and allowed("avatar_url") and indiv_avatar_vis not in ("CLAN", "PRIVATE")
    can_show_birth = not is_living_masked and allowed("birth_date") and indiv_birth_vis not in ("CLAN", "PRIVATE")
    can_show_death = (not living) and allowed("death_date")

    return TreeNode(
        id=str(person.id),
        fullName=person.full_name if can_show_identity else MASKED_NAME,
        gender=(person.gender or MASKED_GENDER) if can_show_gender else MASKED_GENDER,
        generation=(person.generation or 1) if can_show_gen else MASKED_GENERATION,
        branchId=str(person.branch_id) if person.branch_id and allowed("branch_id") else None,
        avatarUrl=person.avatar_url if can_show_avatar else None,
        isLiving=living,
        status=person.status,
        birthDate=person.birth_date if can_show_birth else None,
        deathDate=person.death_date if can_show_death else None,
        privacyLevel="MASKED" if is_living_masked else ("PRIVATE" if indiv_name_vis == "PRIVATE" else "SHARED"),
    )
class LinkRequestCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    target_family_id: str = Field(alias="targetFamilyId")
    source_family_id: Optional[str] = Field(None, alias="sourceFamilyId")
    connection_type: str = Field("IN_LAW", alias="connectionType")
    source_person_id: Optional[str] = Field(None, alias="sourcePersonId")
    target_person_id: Optional[str] = Field(None, alias="targetPersonId")
    message: Optional[str] = None


class LinkRequestReview(BaseModel):
    action: str = Field(description="'APPROVE' or 'REJECT'")
    reason: Optional[str] = None


class LinkTerminateRequest(BaseModel):
    reason: Optional[str] = None


class LinkRequestResponse(BaseModel):
    id: str
    source_family_id: str = Field(alias="sourceFamilyId")
    source_family_name: str = Field(alias="sourceFamilyName")
    target_family_id: str = Field(alias="targetFamilyId")
    target_family_name: str = Field(alias="targetFamilyName")
    connection_type: str = Field("IN_LAW", alias="connectionType")
    source_person_id: Optional[str] = Field(None, alias="sourcePersonId")
    target_person_id: Optional[str] = Field(None, alias="targetPersonId")
    source_person_name: Optional[str] = Field(None, alias="sourcePersonName")
    target_person_name: Optional[str] = Field(None, alias="targetPersonName")
    status: str
    message: Optional[str] = None
    created_at: datetime = Field(alias="createdAt")


class LinkResponse(BaseModel):
    id: str
    request_id: str = Field(alias="requestId")
    clan_a_id: str = Field(alias="clanAId")
    clan_a_name: str = Field(alias="clanAName")
    clan_b_id: str = Field(alias="clanBId")
    clan_b_name: str = Field(alias="clanBName")
    connection_type: str = Field("IN_LAW", alias="connectionType")
    status: str
    linked_at: datetime = Field(alias="linkedAt")
    ended_at: Optional[datetime] = Field(None, alias="endedAt")
    terminated_by: Optional[str] = Field(None, alias="terminatedBy")
    termination_reason: Optional[str] = Field(None, alias="terminationReason")


class PolicyUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data_scope: Optional[str] = Field(None, alias="dataScope")
    allowed_fields: Optional[dict] = Field(None, alias="allowedFields")
    can_export: Optional[bool] = Field(None, alias="canExport")
    # Whose policy (each link has one per clan). Optional only when the caller manages exactly
    # one of the link's two clans.
    owner_clan_id: Optional[str] = Field(None, alias="ownerClanId")


class PolicyResponse(BaseModel):
    id: str
    link_id: str = Field(alias="linkId")
    owner_clan_id: str = Field(alias="ownerClanId")
    data_scope: str = Field(alias="dataScope")
    allowed_fields: dict = Field(alias="allowedFields")
    visibility: str
    can_export: bool = Field(alias="canExport")
    updated_at: datetime = Field(alias="updatedAt")


class PersonMappingCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_person_id: str = Field(alias="sourcePersonId")
    target_person_id: str = Field(alias="targetPersonId")
    relationship_type: str = Field("SPOUSE", alias="relationshipType")
    notes: Optional[str] = None


class PersonMappingReview(BaseModel):
    action: str = Field(description="'VERIFY' or 'REJECT'")
    notes: Optional[str] = None


class PersonMappingRevoke(BaseModel):
    reason: Optional[str] = None


class PersonMappingResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    link_id: str = Field(alias="linkId")
    clan_a_id: str = Field(alias="clanAId")
    clan_a_name: str = Field(alias="clanAName")
    person_a_id: str = Field(alias="personAId")
    person_a_name: str = Field(alias="personAName")
    person_a_gender: Optional[str] = Field(None, alias="personAGender")
    clan_b_id: str = Field(alias="clanBId")
    clan_b_name: str = Field(alias="clanBName")
    person_b_id: str = Field(alias="personBId")
    person_b_name: str = Field(alias="personBName")
    person_b_gender: Optional[str] = Field(None, alias="personBGender")
    relationship_type: str = Field("SPOUSE", alias="relationshipType")
    status: str
    requested_by: Optional[str] = Field(None, alias="requestedBy")
    requested_clan_id: str = Field(alias="requestedClanId")
    verified_by: Optional[str] = Field(None, alias="verifiedBy")
    verified_at: Optional[datetime] = Field(None, alias="verifiedAt")
    review_notes: Optional[str] = Field(None, alias="reviewNotes")
    notes: Optional[str] = None
    created_at: datetime = Field(alias="createdAt")


# ----- access -----


async def get_clan_admin_user_ids(db: AsyncSession, clan_id: uuid.UUID) -> list[uuid.UUID]:
    stmt = select(ClanMembership.user_id).where(
        ClanMembership.clan_id == clan_id,
        ClanMembership.status == "ACTIVE",
    )
    rows = (await db.execute(stmt)).scalars().all()
    access = AccessService(db)
    admin_uids: list[uuid.UUID] = []
    from app.models.user_access.entities import User
    for uid in rows:
        user_res = (await db.execute(select(User).where(User.user_id == uid))).scalar_one_or_none()
        if user_res and await access.has_family_permission(user_res, clan_id, MANAGE_PERMISSION):
            admin_uids.append(uid)
    return admin_uids

def get_inter_family_repo(db: AsyncSession = Depends(get_db)) -> InterFamilyRepository:
    return InterFamilyRepository(db)


@dataclass
class Caller:
    account: Account
    access: AccessService
    is_sa: bool
    clans: set[uuid.UUID]  # ACTIVE memberships

    @property
    def user_id(self) -> uuid.UUID:
        return getattr(self.account, "user_id", None) or getattr(self.account, "id", None)

    def scope(self) -> Optional[set[uuid.UUID]]:
        """Clan filter for list queries: None = every clan (SA)."""
        return None if self.is_sa else self.clans

    def involved(self, *clan_ids: uuid.UUID) -> bool:
        return self.is_sa or any(c in self.clans for c in clan_ids)

    async def manages(self, clan_id: uuid.UUID) -> bool:
        return self.is_sa or await self.access.has_family_permission(
            self.account, clan_id, MANAGE_PERMISSION
        )


async def get_caller(
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
) -> Caller:
    access = AccessService(db)
    return Caller(
        account=account,
        access=access,
        is_sa=await access.is_system_admin(account),
        clans=await access.member_clan_ids(account),
    )


get_caller.clan_permission = "inter-family (member / family.update)"  # read by scripts/route_inventory.py


def _not_found(what: str = "Not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=what)


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _uuid(raw: Optional[str], what: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(raw))
    except (TypeError, ValueError):
        raise _not_found(f"{what} not found") from None


async def _visible_link(repo: InterFamilyRepository, caller: Caller, link_id: str) -> InterClanLink:
    link = await repo.get_link(_uuid(link_id, "Link"))
    if link is None or not caller.involved(link.clan_a_id, link.clan_b_id):
        raise _not_found("Link not found")
    return link


# ----- routes -----


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
                c1.name as c1_name,
                c1.clan_id as c1_id,
                p2.person_id as p2_id,
                p2.full_name as p2_name,
                p2.gender as p2_gender,
                c2.name as c2_name,
                c2.clan_id as c2_id,
                r.started_on,
                r.created_at
            FROM relationships r
            JOIN persons p1 ON r.from_person_id = p1.person_id
            JOIN clans c1 ON p1.clan_id = c1.clan_id
            JOIN persons p2 ON r.to_person_id = p2.person_id
            JOIN clans c2 ON p2.clan_id = c2.clan_id
            WHERE r.relationship_type = 'SPOUSE'
              AND r.status = 'ACTIVE'
        """)
        res = await db.execute(stmt)
        marriages = []
        for row in res.fetchall():
            rel_id, p1_id, p1_name, p1_gender, c1_name, c1_id, p2_id, p2_name, p2_gender, c2_name, c2_id, started_on, created_at = row
            
            if filter_clan_uuid:
                if c1_id != filter_clan_uuid and c2_id != filter_clan_uuid:
                    continue
            elif not caller.is_sa and user_clan_ids:
                if c1_id not in user_clan_ids and c2_id not in user_clan_ids:
                    continue

            if str(p2_gender).upper() == "MALE" or str(p1_gender).upper() == "FEMALE":
                husband_name, husband_family = p2_name, c2_name
                husband_id, husband_clan_id = p2_id, c1_id
                wife_name, wife_family = p1_name, c1_name
                wife_id, wife_clan_id = p1_id, c1_id
            else:
                husband_name, husband_family = p1_name, c1_name
                husband_id, husband_clan_id = p1_id, c1_id
                wife_name, wife_family = p2_name, c2_name
                wife_id, wife_clan_id = p2_id, c2_id

            date_str = str(started_on) if started_on else (created_at.strftime("%d/%m/%Y") if created_at else None)
            
            marriages.append({
                "id": str(rel_id),
                "husbandName": husband_name,
                "husbandFamily": husband_family,
                "husbandPersonId": str(husband_id),
                "husbandClanId": str(husband_clan_id),
                "wifeName": wife_name,
                "wifeFamily": wife_family,
                "wifePersonId": str(wife_id),
                "wifeClanId": str(wife_clan_id),
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
                c1.name as c1_name,
                c1.clan_id as c1_id,
                p2.person_id as p2_id,
                p2.full_name as p2_name,
                p2.gender as p2_gender,
                c2.name as c2_name,
                c2.clan_id as c2_id,
                m.created_at,
                m.notes,
                m.link_id
            FROM inter_clan_person_mappings m
            JOIN persons p1 ON m.person_a_id = p1.person_id
            JOIN clans c1 ON m.clan_a_id = c1.clan_id
            JOIN persons p2 ON m.person_b_id = p2.person_id
            JOIN clans c2 ON m.clan_b_id = c2.clan_id
            WHERE m.status = 'VERIFIED'
        """)
        cross_res = await db.execute(cross_stmt)
        for row in cross_res.fetchall():
            map_id, p1_id, p1_name, p1_gender, c1_name, c1_id, p2_id, p2_name, p2_gender, c2_name, c2_id, created_at, notes, link_id = row
            
            if filter_clan_uuid:
                if c1_id != filter_clan_uuid and c2_id != filter_clan_uuid:
                    continue
            elif not caller.is_sa and user_clan_ids:
                if c1_id not in user_clan_ids and c2_id not in user_clan_ids:
                    continue

            if str(p2_gender).upper() == "MALE" or str(p1_gender).upper() == "FEMALE":
                husband_name, husband_family = p2_name, c2_name
                husband_id, husband_clan_id = p2_id, c2_id
                wife_name, wife_family = p1_name, c1_name
                wife_id, wife_clan_id = p1_id, c1_id
            else:
                husband_name, husband_family = p1_name, c1_name
                husband_id, husband_clan_id = p1_id, c1_id
                wife_name, wife_family = p2_name, c2_name
                wife_id, wife_clan_id = p2_id, c2_id

            date_str = created_at.strftime("%d/%m/%Y") if created_at else None
            marriages.append({
                "id": str(map_id),
                "husbandName": husband_name,
                "husbandFamily": husband_family,
                "husbandPersonId": str(husband_id),
                "husbandClanId": str(husband_clan_id),
                "wifeName": wife_name,
                "wifeFamily": wife_family,
                "wifePersonId": str(wife_id),
                "wifeClanId": str(wife_clan_id),
                "marriageDate": date_str,
                "isCrossClan": True,
                "linkId": str(link_id),
                "notes": notes or f"Hôn nhân thông gia: {husband_family} kết duyên cùng {wife_family}",
            })

        return marriages
    except Exception as e:
        logger.error(f"Error fetching inlaw marriages: {e}")
        return []


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
            raise _not_found("Dòng họ nguồn không tồn tại trong danh sách quản lý")
        if not await caller.manages(source_id):
            raise _forbidden("Chỉ Trưởng tộc / Quản trị viên dòng họ nguồn mới có quyền gửi yêu cầu")
    else:
        managed = [c for c in sorted(caller.clans, key=str) if await caller.manages(c)]
        if len(managed) != 1:
            raise HTTPException(
                status_code=422,
                detail="sourceFamilyId là bắt buộc (chỉ định dòng họ gửi yêu cầu)",
            )
        source_id = managed[0]

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
            sender_name=getattr(caller.account, "display_name", None) or "Trưởng tộc " + source_clan.name,
            sender_role="Trưởng tộc",
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

    mapping.status = "REVOKED"
    mapping.review_notes = data.reason
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

    # Helper to traverse parents up to depth generations
    async def get_ancestors_tree(start_person_id, depth=3):
        levels = []
        current_ids = [start_person_id]
        titles = {1: "Cha / Mẹ", 2: "Ông / Bà", 3: "Cụ Ông / Cụ Bà"}
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

        paternal_levels = await get_ancestors_tree(husband_id)
        maternal_levels = await get_ancestors_tree(wife_id)

        paternal_side = {
            "clanId": str(husband_clan_id),
            "clanName": f"{husband_clan_name} (Bên Nội)",
            "generations": paternal_levels
        }
        maternal_side = {
            "clanId": str(wife_clan_id),
            "clanName": f"{wife_clan_name} (Bên Ngoại)",
            "generations": maternal_levels
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
