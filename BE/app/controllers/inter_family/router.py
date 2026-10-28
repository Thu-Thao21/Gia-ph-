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
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.models.family.entities import Clan, ClanMembership, ClanProfile
from app.models.genealogy.entities import Branch, Person, Relationship
from app.models.inter_family import (
    InterClanLink,
    InterClanRequest,
    InterClanSharedPolicy,
)
from app.models.inter_family.repository import InterFamilyRepository
from app.models.postgres import Account
from app.schemas.genealogy import RelationshipResponse, TreeDataResponse, TreeNode
from app.services.auth_access.access_service import AccessService

router = APIRouter(prefix="/networks", tags=["inter-family"])

MANAGE_PERMISSION = "family.update"
DEFAULT_ALLOWED_FIELDS = {"full_name": True, "generation": True, "gender": True, "avatar_url": True}

# ----- shared-tree privacy (Mốc M2c) -----
# The owner clan's policy (inter_clan_shared_policies.allowed_fields, JSONB) decides EVERY person
# field the other clan receives. A field is shown only when its key is exactly true:
#   full_name, gender, avatar_url   identity of a person
#   generation, branch_id           position in the clan
#   living_persons                  without it, a LIVING person (or one with is_alive unknown) is
#                                   shown masked whatever the keys above say: no name, gender,
#                                   avatar (birth date and contacts are never sent, see below)
# Never sent at all: birth/death date, biography, contacts (persons has no contact column).
# Always sent (the tree cannot be drawn without them): id, isLiving, status, the edges.
MASKED_NAME = "Thành viên gia tộc (Bảo mật)"
MASKED_GENDER = "unknown"
MASKED_GENERATION = 0


def shared_tree_node(person, allowed_fields: dict) -> TreeNode:
    def allowed(key: str) -> bool:
        return allowed_fields.get(key) is True

    living = person.is_alive is None or bool(person.is_alive)
    identity = not living or allowed("living_persons")
    return TreeNode(
        id=str(person.id),
        fullName=person.full_name if identity and allowed("full_name") else MASKED_NAME,
        gender=(person.gender or MASKED_GENDER) if identity and allowed("gender") else MASKED_GENDER,
        generation=(person.generation or 1) if allowed("generation") else MASKED_GENERATION,
        branchId=str(person.branch_id) if person.branch_id and allowed("branch_id") else None,
        avatarUrl=person.avatar_url if identity and allowed("avatar_url") else None,
        isLiving=living,
        status=person.status,
    )


class LinkRequestCreate(BaseModel):
    # Both spellings: the FE sends snake_case (target_family_id), the old contract camelCase.
    model_config = ConfigDict(populate_by_name=True)

    target_family_id: str = Field(alias="targetFamilyId")
    # The clan the request is sent FROM. Optional only when the caller manages exactly one clan.
    source_family_id: Optional[str] = Field(None, alias="sourceFamilyId")
    source_person_id: Optional[str] = Field(None, alias="sourcePersonId")
    target_person_id: Optional[str] = Field(None, alias="targetPersonId")
    message: Optional[str] = None


class LinkRequestReview(BaseModel):
    action: str = Field(description="'APPROVE' or 'REJECT'")
    reason: Optional[str] = None


class LinkRequestResponse(BaseModel):
    id: str
    source_family_id: str = Field(alias="sourceFamilyId")
    source_family_name: str = Field(alias="sourceFamilyName")
    target_family_id: str = Field(alias="targetFamilyId")
    target_family_name: str = Field(alias="targetFamilyName")
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
    status: str
    linked_at: datetime = Field(alias="linkedAt")
    ended_at: Optional[datetime] = Field(None, alias="endedAt")


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


# ----- access -----


def get_inter_family_repo(db: AsyncSession = Depends(get_db)) -> InterFamilyRepository:
    return InterFamilyRepository(db)


@dataclass
class Caller:
    account: Account
    access: AccessService
    is_sa: bool
    clans: set[uuid.UUID]  # ACTIVE memberships

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

    maternal_clan_ids: set[uuid.UUID] = set()
    if hasattr(db, "execute") and hasattr(caller.account, "user_id"):
        try:
            user_memberships_res = await db.execute(
                select(ClanMembership).where(
                    ClanMembership.user_id == caller.account.user_id,
                    ClanMembership.status == "ACTIVE",
                )
            )
            for m in user_memberships_res.scalars().all():
                if (m.lineage_type or "").upper() == "MATERNAL":
                    maternal_clan_ids.add(m.clan_id)
        except Exception:
            pass

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
            if clan_cat == "noi":
                if is_user_paternal or (c_id in user_clan_ids) or len(user_clan_ids) == 0:
                    selected_clans.append((clan, "noi", 0 if is_user_paternal else 1))
        elif cat_filter == "ngoai":
            if clan_cat == "ngoai":
                selected_clans.append((clan, "ngoai", 0 if is_user_maternal else 1))
        else:
            selected_clans.append((clan, clan_cat, 0 if (is_user_paternal or is_user_maternal) else 1))

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

        members_data = []
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
                "birthDate": p.birth_date.strftime("%d/%m/%Y") if p.birth_date else None,
                "deathDate": p.death_date.strftime("%d/%m/%Y") if p.death_date else None,
                "isAlive": p.is_alive if p.is_alive is not None else True,
                "branch": branch_map.get(p.branch_id, "Nhánh chính") if p.branch_id else "Nhánh chính",
                "bio": p.bio or "",
            })

        is_connected = caller.is_sa or (c_id in user_clan_ids) or (c_id in linked_clans)

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
                status=link.status,
                linkedAt=link.linked_at,
                endedAt=link.ended_at,
            )
        )
    return output


@router.delete("/links/{link_id}")
@router.post("/links/{link_id}/terminate")
async def terminate_link(
    link_id: str,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Terminates an inter-family connection link (FR-BO-55): manage one of its two clans."""
    link = await _visible_link(repo, caller, link_id)
    if not (await caller.manages(link.clan_a_id) or await caller.manages(link.clan_b_id)):
        raise _forbidden("Managing one of the linked clans is required")

    if link.status == "TERMINATED":
        return {"status": "TERMINATED", "message": "Link already terminated"}

    link.status = "TERMINATED"
    link.ended_at = datetime.now(timezone.utc)
    await repo.commit()
    return {"status": "TERMINATED", "link_id": str(link.id)}


@router.get("/diagram")
async def get_network_diagram(
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Network graph: every ACTIVE clan as a node; edges only for the caller's links (SA: all)."""
    clans = await repo.list_active_clans()
    links = await repo.list_links(clan_ids=caller.scope(), status="ACTIVE")

    nodes = [
        {
            "id": str(c.clan_id),
            "name": c.name,
            "code": c.clan_code,
            "status": c.status,
        }
        for c in clans
    ]

    edges = [
        {
            "id": str(l.id),
            "source": str(l.clan_a_id),
            "target": str(l.clan_b_id),
            "status": l.status,
            "linkedAt": l.linked_at.isoformat() if l.linked_at else None,
        }
        for l in links
    ]

    return {"nodes": nodes, "edges": edges}


@router.get("/links/{link_id}/policies", response_model=List[PolicyResponse])
async def get_sharing_policies(
    link_id: str,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Gets shared data policies of a link of the caller's clans (FR-BO-57, FR-BO-77)."""
    link = await _visible_link(repo, caller, link_id)
    policies = await repo.list_policies(link.id)

    return [
        PolicyResponse(
            id=str(p.id),
            linkId=str(p.link_id),
            ownerClanId=str(p.owner_clan_id),
            dataScope=p.data_scope,
            allowedFields=p.allowed_fields or {},
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
        raise _not_found("Policy not found for this link")

    if data.data_scope is not None:
        policy.data_scope = data.data_scope
    if data.allowed_fields is not None:
        policy.allowed_fields = data.allowed_fields
    if data.can_export is not None:
        policy.can_export = data.can_export

    policy.updated_by = caller.account.id
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
        output.append(
            LinkRequestResponse(
                id=str(req.id),
                sourceFamilyId=s_id,
                sourceFamilyName=names.get(s_id, "Dòng họ nguồn"),
                targetFamilyId=t_id,
                targetFamilyName=names.get(t_id, "Dòng họ đích"),
                status=req.status,
                message=req.message,
                createdAt=req.created_at,
            )
        )
    return output


@router.post("/link-requests", status_code=status.HTTP_201_CREATED, response_model=LinkRequestResponse)
async def create_link_request(
    data: LinkRequestCreate,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Sends a connection request (FR-BO-53) FROM a clan the caller manages.

    The source clan is the one named in the body; without one, the only clan the caller manages.
    It is never picked for them (it used to be "the first ACTIVE clan in the system")."""
    if data.source_family_id is not None:
        source_id = _uuid(data.source_family_id, "Source family")
        if not caller.involved(source_id):
            raise _not_found("Source family not found")
        if not await caller.manages(source_id):
            raise _forbidden("Managing the source clan is required")
    else:
        managed = [c for c in sorted(caller.clans, key=str) if await caller.manages(c)]
        if len(managed) != 1:
            raise HTTPException(
                status_code=422,
                detail="sourceFamilyId is required (the clan the request is sent from)",
            )
        source_id = managed[0]

    source_clan = await repo.get_clan(source_id)
    target_id = _uuid(data.target_family_id, "Target family")
    target_clan = await repo.get_clan(target_id)
    if source_clan is None or source_clan.status != "ACTIVE":
        raise _not_found("Source family not found")
    if target_clan is None or target_clan.status != "ACTIVE":
        raise _not_found("Target family not found")
    if target_id == source_id:
        raise HTTPException(status_code=422, detail="A clan cannot link to itself")

    # A person named in the request must belong to the side it is named for.
    person_ids: dict[str, Optional[uuid.UUID]] = {}
    for field, raw, clan_id in (
        ("sourcePersonId", data.source_person_id, source_id),
        ("targetPersonId", data.target_person_id, target_id),
    ):
        if raw is None:
            person_ids[field] = None
            continue
        person = await repo.get_person(_uuid(raw, "Person"))
        if person is None or person.family_id != clan_id:
            raise HTTPException(
                status_code=422,
                detail=f"{field} is not a person of that clan",
            )
        person_ids[field] = person.id

    req = InterClanRequest(
        id=uuid.uuid4(),
        source_clan_id=source_id,
        target_clan_id=target_id,
        requester_id=caller.account.id,
        source_person_id=person_ids["sourcePersonId"],
        target_person_id=person_ids["targetPersonId"],
        message=data.message,
        status="PENDING",
    )
    repo.add(req)
    await repo.commit()

    return LinkRequestResponse(
        id=str(req.id),
        sourceFamilyId=str(req.source_clan_id),
        sourceFamilyName=source_clan.name,
        targetFamilyId=str(req.target_clan_id),
        targetFamilyName=target_clan.name,
        status=req.status,
        message=req.message,
        createdAt=req.created_at or datetime.now(timezone.utc),
    )


@router.post("/link-requests/{request_id}/review")
async def review_link_request(
    request_id: str,
    data: LinkRequestReview,
    caller: Caller = Depends(get_caller),
    repo: InterFamilyRepository = Depends(get_inter_family_repo),
):
    """Approves or rejects a request (FR-BO-54): manage the TARGET clan."""
    req = await repo.get_request(_uuid(request_id, "Request"))
    if not req or not caller.involved(req.source_clan_id, req.target_clan_id):
        raise _not_found("Request not found")
    if not await caller.manages(req.target_clan_id):
        raise _forbidden("Managing the target clan is required")

    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Request already processed ({req.status})")

    now = datetime.now(timezone.utc)
    action = data.action.upper()

    try:
        if action == "APPROVE":
            req.status = "APPROVED"
            req.reviewed_by = caller.account.id
            req.reviewed_at = now

            # Create active InterClanLink
            link = InterClanLink(
                id=uuid.uuid4(),
                request_id=req.id,
                clan_a_id=req.source_clan_id,
                clan_b_id=req.target_clan_id,
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
                        updated_by=caller.account.id,
                    )
                )

            await repo.commit()
            return {"status": "APPROVED", "link_id": str(link.id)}

        elif action == "REJECT":
            req.status = "REJECTED"
            req.reviewed_by = caller.account.id
            req.reviewed_at = now
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
        raise _not_found("Family not found")

    # Fetch sharing policy of target family on the caller's link
    policy = await repo.get_policy(links[0].id, target_uuid) if links else None
    # The policy row decides, even when it shares nothing ({}); the defaults only stand in for a
    # missing row (an SA looking at a clan without links). Living persons stay masked either way.
    allowed_fields = (policy.allowed_fields or {}) if policy else dict(DEFAULT_ALLOWED_FIELDS)

    # Fetch persons and relationships of target clan
    persons = await repo.persons_of(target_uuid)
    relationships = await repo.relationships_of(target_uuid)

    # Build tree nodes with privacy scoping: every field through the owner clan's policy
    nodes = [shared_tree_node(p, allowed_fields) for p in persons]

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

    return TreeDataResponse(nodes=nodes, edges=edges)
