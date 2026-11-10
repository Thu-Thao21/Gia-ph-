"""Queries of the inter-family network (links between clans). Mốc M2b.

Only data access; WHO may see or change what is decided in controllers/inter_family/router.py.
`clan_ids=None` means "every clan" (System Admin); otherwise only rows that involve one of
those clans are returned.
"""

from __future__ import annotations

import uuid
from typing import Iterable, Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family.entities import Clan
from app.models.genealogy.entities import Person, Relationship, PersonPrivacySetting
from app.models.inter_family.entities import (
    InterClanLink,
    InterClanPersonMapping,
    InterClanRequest,
    InterClanSharedPolicy,
)


class InterFamilyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ----- clans -----

    async def get_clan(self, clan_id: uuid.UUID) -> Optional[Clan]:
        return (await self._session.execute(select(Clan).where(Clan.clan_id == clan_id))).scalar_one_or_none()

    async def list_active_clans(self) -> list[Clan]:
        return list((await self._session.execute(select(Clan).where(Clan.status == "ACTIVE"))).scalars().all())

    async def clan_names(self, clan_ids: Iterable[uuid.UUID]) -> dict[str, str]:
        ids = set(clan_ids)
        if not ids:
            return {}
        rows = (await self._session.execute(select(Clan).where(Clan.clan_id.in_(ids)))).scalars().all()
        return {str(c.clan_id): c.name for c in rows}

    # ----- links -----

    async def get_link(self, link_id: uuid.UUID) -> Optional[InterClanLink]:
        stmt = select(InterClanLink).where(InterClanLink.id == link_id)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def list_links(
        self, *, clan_ids: Optional[set[uuid.UUID]], status: Optional[str] = None
    ) -> list[InterClanLink]:
        stmt = select(InterClanLink).order_by(InterClanLink.linked_at.desc())
        if status:
            stmt = stmt.where(InterClanLink.status == status)
        if clan_ids is not None:
            if not clan_ids:
                return []
            stmt = stmt.where(
                or_(InterClanLink.clan_a_id.in_(clan_ids), InterClanLink.clan_b_id.in_(clan_ids))
            )
        return list((await self._session.execute(stmt)).scalars().all())

    async def active_links_between(
        self, target_clan_id: uuid.UUID, *, clan_ids: Optional[set[uuid.UUID]]
    ) -> list[InterClanLink]:
        """ACTIVE links with `target_clan_id` on one side and, unless clan_ids is None, one of
        clan_ids on the other side."""
        stmt = select(InterClanLink).where(InterClanLink.status == "ACTIVE")
        if clan_ids is None:
            stmt = stmt.where(
                or_(InterClanLink.clan_a_id == target_clan_id, InterClanLink.clan_b_id == target_clan_id)
            )
        else:
            if not clan_ids:
                return []
            stmt = stmt.where(
                or_(
                    and_(InterClanLink.clan_a_id == target_clan_id, InterClanLink.clan_b_id.in_(clan_ids)),
                    and_(InterClanLink.clan_b_id == target_clan_id, InterClanLink.clan_a_id.in_(clan_ids)),
                )
            )
        return list((await self._session.execute(stmt.order_by(InterClanLink.linked_at))).scalars().all())

    async def find_active_link_between(
        self, clan_a: uuid.UUID, clan_b: uuid.UUID
    ) -> Optional[InterClanLink]:
        stmt = select(InterClanLink).where(
            InterClanLink.status == "ACTIVE",
            or_(
                and_(InterClanLink.clan_a_id == clan_a, InterClanLink.clan_b_id == clan_b),
                and_(InterClanLink.clan_a_id == clan_b, InterClanLink.clan_b_id == clan_a),
            ),
        )
        return (await self._session.execute(stmt)).scalars().first()

    # ----- policies -----

    async def list_policies(self, link_id: uuid.UUID) -> list[InterClanSharedPolicy]:
        stmt = select(InterClanSharedPolicy).where(InterClanSharedPolicy.link_id == link_id)
        return list((await self._session.execute(stmt)).scalars().all())

    async def get_policy(self, link_id: uuid.UUID, owner_clan_id: uuid.UUID) -> Optional[InterClanSharedPolicy]:
        stmt = select(InterClanSharedPolicy).where(
            InterClanSharedPolicy.link_id == link_id,
            InterClanSharedPolicy.owner_clan_id == owner_clan_id,
        )
        return (await self._session.execute(stmt)).scalars().first()

    # ----- requests -----

    async def find_pending_request_between(
        self, clan_a: uuid.UUID, clan_b: uuid.UUID
    ) -> Optional[InterClanRequest]:
        stmt = select(InterClanRequest).where(
            InterClanRequest.status == "PENDING",
            or_(
                and_(InterClanRequest.source_clan_id == clan_a, InterClanRequest.target_clan_id == clan_b),
                and_(InterClanRequest.source_clan_id == clan_b, InterClanRequest.target_clan_id == clan_a),
            ),
        )
        return (await self._session.execute(stmt)).scalars().first()

    async def get_request(self, request_id: uuid.UUID) -> Optional[InterClanRequest]:
        stmt = select(InterClanRequest).where(InterClanRequest.id == request_id)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def list_requests(self, *, clan_ids: Optional[set[uuid.UUID]], limit: int = 100) -> list[InterClanRequest]:
        stmt = select(InterClanRequest).order_by(InterClanRequest.created_at.desc()).limit(limit)
        if clan_ids is not None:
            if not clan_ids:
                return []
            stmt = stmt.where(
                or_(InterClanRequest.source_clan_id.in_(clan_ids), InterClanRequest.target_clan_id.in_(clan_ids))
            )
        return list((await self._session.execute(stmt)).scalars().all())

    # ----- person mappings (Phase 2) -----

    async def list_person_mappings(
        self, link_id: uuid.UUID, *, status: Optional[str] = None
    ) -> list[InterClanPersonMapping]:
        stmt = select(InterClanPersonMapping).where(InterClanPersonMapping.link_id == link_id)
        if status:
            stmt = stmt.where(InterClanPersonMapping.status == status)
        stmt = stmt.order_by(InterClanPersonMapping.created_at.desc())
        return list((await self._session.execute(stmt)).scalars().all())

    async def find_person_mapping_between(
        self, person_a: uuid.UUID, person_b: uuid.UUID
    ) -> Optional[InterClanPersonMapping]:
        stmt = select(InterClanPersonMapping).where(
            InterClanPersonMapping.status.in_(["PENDING", "VERIFIED"]),
            or_(
                and_(
                    InterClanPersonMapping.person_a_id == person_a,
                    InterClanPersonMapping.person_b_id == person_b,
                ),
                and_(
                    InterClanPersonMapping.person_a_id == person_b,
                    InterClanPersonMapping.person_b_id == person_a,
                ),
            ),
        )
        return (await self._session.execute(stmt)).scalars().first()

    async def get_person_mapping(
        self, mapping_id: uuid.UUID
    ) -> Optional[InterClanPersonMapping]:
        stmt = select(InterClanPersonMapping).where(InterClanPersonMapping.id == mapping_id)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    # ----- tree of a clan -----

    async def get_person(self, person_id: uuid.UUID) -> Optional[Person]:
        return (await self._session.execute(select(Person).where(Person.id == person_id))).scalar_one_or_none()

    async def persons_of(self, clan_id: uuid.UUID) -> list[Person]:
        return list((await self._session.execute(select(Person).where(Person.family_id == clan_id))).scalars().all())

    async def relationships_of(self, clan_id: uuid.UUID) -> list[Relationship]:
        stmt = select(Relationship).where(Relationship.family_id == clan_id)
        return list((await self._session.execute(stmt)).scalars().all())

    async def has_inlaw_relationship(self, person_a: uuid.UUID, person_b: uuid.UUID) -> bool:
        stmt = select(Relationship).where(
            Relationship.relationship_type == "SPOUSE",
            or_(
                and_(Relationship.from_member_id == person_a, Relationship.to_member_id == person_b),
                and_(Relationship.from_member_id == person_b, Relationship.to_member_id == person_a),
            ),
        )
        res = (await self._session.execute(stmt)).scalars().first()
        return res is not None


    async def privacy_settings_of(self, person_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, PersonPrivacySetting]:
        pids = list(person_ids)
        if not pids:
            return {}
        stmt = select(PersonPrivacySetting).where(PersonPrivacySetting.person_id.in_(pids))
        res = await self._session.execute(stmt)
        return {p.person_id: p for p in res.scalars().all()}

    # ----- unit of work -----

    def add(self, row) -> None:
        self._session.add(row)

    async def flush(self) -> None:
        await self._session.flush()

    async def commit(self) -> None:
        await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()
