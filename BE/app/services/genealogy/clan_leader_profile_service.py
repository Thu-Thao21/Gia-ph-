"""Service to ensure Clan Leader (Trưởng tộc / Business Owner) has a real Person profile
in the clan's genealogy tree, linked via PersonAccountLink (Account–Person Link).

Guarantees:
- User and Person remain distinct domain entities.
- Explicit PersonAccountLink is created with ACTIVE status.
- Idempotent: safe to run multiple times without creating duplicate records.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family.entities import PersonAccountLink
from app.models.genealogy.entities import Person

logger = logging.getLogger(__name__)


def infer_gender(full_name: str, given_gender: Optional[str] = None) -> str:
    """Infer gender from name or normalize given gender."""
    if given_gender:
        norm = given_gender.strip().upper()
        if norm in ("MALE", "NAM", "TRAI"):
            return "MALE"
        if norm in ("FEMALE", "NỮ", "NU", "GÁI", "GAI"):
            return "FEMALE"
        return norm

    name_lower = full_name.lower().strip()
    female_indicators = ["thị", "thi", "thảo", "thao", "duyên", "duyen", "hoa", "hương", "huong", "lan", "mai", "ngọc", "ngoc"]
    male_indicators = ["văn", "van", "đức", "duc", "hùng", "hung", "minh", "quân", "quan", "dũng", "dung", "tuấn", "tuan"]

    for ind in female_indicators:
        if f" {ind} " in f" {name_lower} " or name_lower.endswith(f" {ind}"):
            return "FEMALE"

    for ind in male_indicators:
        if f" {ind} " in f" {name_lower} " or name_lower.endswith(f" {ind}"):
            return "MALE"

    return "OTHER"


async def ensure_clan_leader_person_profile(
    *,
    db: AsyncSession,
    clan_id: uuid.UUID,
    user_id: uuid.UUID,
    full_name: str,
    phone: Optional[str] = None,
    gender: Optional[str] = None,
    generation: int = 1,
) -> Person:
    """Ensure a Clan Leader has a linked Person profile in the clan phả hệ.

    1. Checks if (user_id, clan_id) is already linked to an active PersonAccountLink.
       If yes, returns that Person.
    2. If not, checks if an unlinked Person with matching full_name exists in this clan.
       If yes, links to that existing Person.
    3. If no matching unlinked Person exists, creates a new Person record in `persons`.
    4. Upserts PersonAccountLink connecting (user_id, person_id, clan_id) with status='ACTIVE'.
    """
    clean_name = full_name.strip()
    if not clean_name:
        clean_name = "Trưởng tộc"

    now = datetime.now(timezone.utc)

    # 1. Check existing active link for this (user_id, clan_id)
    stmt_link = select(PersonAccountLink).where(
        PersonAccountLink.user_id == user_id,
        PersonAccountLink.clan_id == clan_id,
        PersonAccountLink.status == "ACTIVE",
        PersonAccountLink.revoked_at.is_(None),
    )
    existing_link = (await db.execute(stmt_link)).scalar_one_or_none()
    if existing_link:
        p_stmt = select(Person).where(Person.id == existing_link.person_id)
        linked_person = (await db.execute(p_stmt)).scalar_one_or_none()
        if linked_person:
            logger.info(
                "ensure_clan_leader_person_profile: already linked user=%s to person=%s (%s)",
                user_id,
                linked_person.id,
                linked_person.full_name,
            )
            return linked_person

    # 2. Check if an unlinked Person with exact full_name exists in this clan
    candidate_stmt = select(Person).where(
        Person.family_id == clan_id,
        Person.full_name == clean_name,
        Person.status == "ACTIVE",
    )
    candidates = (await db.execute(candidate_stmt)).scalars().all()
    target_person: Optional[Person] = None

    for candidate in candidates:
        chk_stmt = select(PersonAccountLink).where(
            PersonAccountLink.person_id == candidate.id,
            PersonAccountLink.clan_id == clan_id,
            PersonAccountLink.status == "ACTIVE",
            PersonAccountLink.revoked_at.is_(None),
        )
        is_taken = (await db.execute(chk_stmt)).scalar_one_or_none() is not None
        if not is_taken:
            target_person = candidate
            logger.info(
                "ensure_clan_leader_person_profile: matched unlinked existing person=%s (%s) in clan=%s",
                target_person.id,
                target_person.full_name,
                clan_id,
            )
            break

    # 3. Create new Person if none found
    if target_person is None:
        target_person = Person(
            family_id=clan_id,
            branch_id=None,
            full_name=clean_name,
            gender=infer_gender(clean_name, gender),
            birth_date=None,
            is_alive=True,
            generation=generation,
            bio=f"Trưởng tộc khởi tạo dòng họ (SĐT: {phone})" if phone else "Trưởng tộc khởi tạo dòng họ",
            status="ACTIVE",
            created_by=user_id,
            created_at=now,
            updated_at=now,
        )
        db.add(target_person)
        await db.flush()  # populate target_person.id
        logger.info(
            "ensure_clan_leader_person_profile: created new Person id=%s full_name=%s clan=%s",
            target_person.id,
            clean_name,
            clan_id,
        )

    # 4. Upsert PersonAccountLink
    upsert_link_stmt = select(PersonAccountLink).where(
        PersonAccountLink.user_id == user_id,
        PersonAccountLink.clan_id == clan_id,
    )
    link_record = (await db.execute(upsert_link_stmt)).scalar_one_or_none()

    if link_record:
        link_record.person_id = target_person.id
        link_record.status = "ACTIVE"
        link_record.revoked_at = None
        link_record.linked_by = user_id
        link_record.linked_at = now
    else:
        new_link = PersonAccountLink(
            link_id=uuid.uuid4(),
            person_id=target_person.id,
            user_id=user_id,
            clan_id=clan_id,
            status="ACTIVE",
            linked_by=user_id,
            linked_at=now,
        )
        db.add(new_link)

    await db.flush()
    logger.info(
        "ensure_clan_leader_person_profile: linked user=%s with person=%s (%s) in clan=%s",
        user_id,
        target_person.id,
        target_person.full_name,
        clan_id,
    )
    return target_person

