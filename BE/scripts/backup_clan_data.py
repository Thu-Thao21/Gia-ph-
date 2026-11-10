"""Script: Backup Clan Data to JSON.
Xuất toàn bộ dữ liệu phả hệ của dòng họ (Persons, Relationships, Locations, Documents)
ra file JSON có cấu trúc để sao lưu an toàn.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from datetime import date, datetime
from pathlib import Path

# Load .env
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

sys.path.append(str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from app.db.postgres import async_session_maker
from app.models.family.entities import Clan
from app.models.genealogy.entities import Person, Relationship
from app.models.worship.entities import ClanLocation
from app.models.archive.entities import ClanDocument


def _json_serial(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, uuid.UUID):
        return str(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


async def backup_clan(clan_id: uuid.UUID, output_path: str):
    async with async_session_maker() as db:
        clan = (await db.execute(select(Clan).where(Clan.clan_id == clan_id))).scalar_one_or_none()
        if not clan:
            print(f"Không tìm thấy dòng họ với ID: {clan_id}")
            return

        # 1. Persons
        p_stmt = select(Person).where(Person.family_id == clan_id)
        persons = (await db.execute(p_stmt)).scalars().all()

        # 2. Relationships
        r_stmt = select(Relationship).where(Relationship.family_id == clan_id)
        relationships = (await db.execute(r_stmt)).scalars().all()

        # 3. Locations
        l_stmt = select(ClanLocation).where(ClanLocation.family_id == clan_id)
        locations = (await db.execute(l_stmt)).scalars().all()

        # 4. Documents
        d_stmt = select(ClanDocument).where(ClanDocument.family_id == clan_id)
        documents = (await db.execute(d_stmt)).scalars().all()

        backup_payload = {
            "clan": {
                "clan_id": clan.clan_id,
                "name": clan.name,
                "created_at": clan.created_at,
            },
            "exported_at": datetime.utcnow().isoformat(),
            "persons_count": len(persons),
            "relationships_count": len(relationships),
            "locations_count": len(locations),
            "documents_count": len(documents),
            "persons": [
                {
                    "id": p.id,
                    "full_name": p.full_name,
                    "gender": p.gender,
                    "generation": p.generation,
                    "birth_date": p.birth_date,
                    "death_date": p.death_date,
                    "is_alive": p.is_alive,
                }
                for p in persons
            ],
            "relationships": [
                {
                    "id": r.id,
                    "from_member_id": r.from_member_id,
                    "to_member_id": r.to_member_id,
                    "relationship_type": r.relationship_type,
                    "parent_type": r.parent_type,
                    "status": r.status,
                }
                for r in relationships
            ],
            "locations": [
                {
                    "id": l.id,
                    "name": l.name,
                    "location_type": l.location_type,
                    "address": l.address,
                    "latitude": l.latitude,
                    "longitude": l.longitude,
                }
                for l in locations
            ],
            "documents": [
                {
                    "id": d.id,
                    "title": d.title,
                    "category": d.category,
                    "file_url": d.file_url,
                }
                for d in documents
            ],
        }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(backup_payload, f, ensure_ascii=False, indent=2, default=_json_serial)

        print(f"Sao lưu thành công dòng họ '{clan.name}' vào file: {output_path}")
        print(f"Tổng số: {len(persons)} thành viên, {len(relationships)} quan hệ.")


async def main():
    async with async_session_maker() as db:
        clan = (await db.execute(select(Clan))).scalars().first()
        if not clan:
            print("Chưa có dòng họ nào trong cơ sở dữ liệu.")
            return

        out_file = f"backup_clan_{clan.clan_id}.json"
        await backup_clan(clan.clan_id, out_file)


if __name__ == "__main__":
    asyncio.run(main())

