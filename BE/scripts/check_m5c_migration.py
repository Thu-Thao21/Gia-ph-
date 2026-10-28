# Usage (BE folder, PowerShell): $env:PYTHONPATH="."; .venv\Scripts\python.exe scripts\check_m5c_migration.py
"""DRY RUN of migration 0010 (clan_identity_registry) on the database of BE/.env. READ ONLY.

Prints the target host's endpoint id and STOPS unless it is dev_minhquan's endpoint (never the
production one), then computes the 0010 backfill plan from the real rows without writing anything:
how many rows, how many duplicate groups (ids and normalized keys only, no person's data), and
whether uq_clans_clan_code_lower could be created."""
import asyncio
import importlib.util
import selectors
import sys
from collections import Counter
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.fingerprint import database_fingerprint

DEV = "ep-patient-term-b4dlkr06"
PROD = "ep-green-mode-b4ugmgu4"

url = make_url(settings.DATABASE_URL)
endpoint = (url.host or "").split(".")[0]
print(f"host endpoint: {endpoint}  database: {url.database}  fingerprint: {database_fingerprint(settings.DATABASE_URL)}")
if endpoint.startswith(PROD):
    sys.exit("REFUSED: this is the PRODUCTION endpoint")
if not endpoint.startswith(DEV):
    sys.exit(f"REFUSED: expected {DEV} (dev_minhquan)")

spec = importlib.util.spec_from_file_location("m0010", Path("alembic/versions/0010_clan_identity_registry.py"))
m0010 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m0010)


async def main():
    e = create_async_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 15})
    async with e.connect() as c:
        await c.execute(text("SET TRANSACTION READ ONLY"))
        print("alembic_version:", (await c.execute(text("SELECT version_num FROM alembic_version"))).scalars().all())
        clans = (await c.execute(text(
            """
            SELECT c.clan_id, c.registration_id, c.name, c.status,
                   COALESCE(r.origin_place, p.origin_place) AS origin_place, c.created_at
            FROM clans c
            LEFT JOIN business_registrations r ON r.registration_id = c.registration_id
            LEFT JOIN clan_profiles p ON p.clan_id = c.clan_id
            """))).all()
        regs = (await c.execute(text(
            "SELECT registration_id, clan_name, origin_place, status, created_at FROM business_registrations"))).all()
        clashes = (await c.execute(text(
            "SELECT lower(clan_code), count(*) FROM clans GROUP BY 1 HAVING count(*) > 1"))).all()
        await c.rollback()
    await e.dispose()
    print(f"source rows: clans={len(clans)} {dict(Counter(r.status for r in clans))} "
          f"registrations={len(regs)} {dict(Counter(r.status for r in regs))}")
    rows, groups = m0010.plan_backfill(clans, regs)
    status = Counter(r["status"] for r in rows)
    kinds = Counter(r["kind"] for r in rows if r["status"] == "active")
    print(f"0010 plan: rows={len(rows)} {dict(status)} active by kind {dict(kinds)} duplicate_groups={len(groups)}")
    for group in groups:
        kept, *others = group
        print(f"  key '{kept[2]}': kept {kept[0]}; duplicates: "
              + ", ".join(rank for rank, _, _ in others) + f" ({len(others)})")
    print("uq_clans_clan_code_lower:", "would be created" if not clashes else f"SKIPPED ({len(clashes)} case clash(es))")


asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
