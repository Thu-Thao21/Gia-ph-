import asyncio
import os
import sys
import uuid
from dotenv import load_dotenv

# Add BE to path and load BE/.env
be_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, be_dir)
load_dotenv(os.path.join(be_dir, ".env"))

from app.db.postgres import async_session_maker
from sqlalchemy import select
from app.models.user_access.entities import User
from app.models.genealogy.entities import Person
from app.models.family.entities import Clan, PersonAccountLink, ClanMembership
from app.models.user_access.entities import Role, UserRole
from app.models.inter_family.entities import (
    InterClanPersonMapping,
    LineageAccessGrant,
    LineageAccessRequest,
)


async def check():
    async with async_session_maker() as s:
        stmt = (
            select(User, PersonAccountLink, Person, Clan)
            .outerjoin(PersonAccountLink, PersonAccountLink.user_id == User.user_id)
            .outerjoin(Person, Person.id == PersonAccountLink.person_id)
            .outerjoin(Clan, Clan.clan_id == Person.family_id)
            .where(User.email.in_(["thuthaor120608@gmail.com", "maiphuchau144@gmail.com"]))
        )
        res = (await s.execute(stmt)).all()
        print("--- USERS & PERSON LINKS ---")
        for u, pal, p, c in res:
            print(
                f"User: {u.email} ({u.display_name}) | Person: {p.full_name if p else None} ({p.id if p else None}) | Clan: {c.name if c else None} ({c.clan_id if c else None})"
            )

        print("\n--- MEMBERSHIPS FOR HAU & THAO ---")
        mems = (
            await s.execute(
                select(User.email, ClanMembership.clan_id, ClanMembership.status, Clan.name)
                .join(Clan, Clan.clan_id == ClanMembership.clan_id)
                .join(User, User.user_id == ClanMembership.user_id)
                .where(User.email.in_(["maiphuchau144@gmail.com", "thaoduong.07082005@gmail.com", "thuthaor120608@gmail.com"]))
            )
        ).all()
        for uemail, cid, mstatus, cname in mems:
            print(f"User: {uemail} | Clan: {cname} ({cid}) | Status: {mstatus}")

        print("\n--- LINEAGE ACCESS GRANTS ---")
        grants = (await s.execute(select(LineageAccessGrant).order_by(LineageAccessGrant.created_at.desc()).limit(5))).scalars().all()
        for g in grants:
            print(f"Grant ID: {g.id} | Clan: {g.owner_clan_id} | GranteeUser: {g.grantee_user_id} | Anchor: {g.anchor_person_id} | Status: {g.status}")

        print("\n--- CLAN ADMINS / OWNERS ---")
        admins = (
            await s.execute(
                select(Clan.name, Clan.clan_id, User.email, User.user_id, User.display_name, Role.code)
                .join(ClanMembership, ClanMembership.clan_id == Clan.clan_id)
                .join(User, User.user_id == ClanMembership.user_id)
                .outerjoin(UserRole, (UserRole.user_id == User.user_id) & (UserRole.clan_id == Clan.clan_id))
                .outerjoin(Role, Role.role_id == UserRole.role_id)
                .where(Clan.clan_id.in_([
                    uuid.UUID("3705a0e2-7eb4-4eaa-89ed-a92b4e7613e4"),
                    uuid.UUID("c0000000-0000-0000-0000-000000000002")
                ]))
            )
        ).all()
        for cname, cid, uemail, uid, uname, crole in admins:
            print(f"Clan: {cname} | User: {uemail} ({uname}) | Role: {crole}")





if __name__ == "__main__":
    asyncio.run(check())
