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
from app.models.family.entities import Clan, ClanMembership, ClanProfile, Notification, UserNotification, PersonAccountLink
from app.models.genealogy.entities import Branch, Person, Relationship
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
from app.models.genealogy.entities import PersonPrivacySetting
from app.models.inter_family.repository import InterFamilyRepository
from app.models.postgres import Account
from app.schemas.genealogy import RelationshipResponse, TreeDataResponse, TreeNode
from app.services.auth_access.access_service import AccessService


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
    declared_spouse_info: Optional[dict] = Field(None, alias="declaredSpouseInfo")
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

