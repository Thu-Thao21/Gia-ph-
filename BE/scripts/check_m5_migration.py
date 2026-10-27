# Usage (BE folder, PowerShell): $env:PYTHONPATH="."; .venv\Scripts\python.exe scripts\check_m5_migration.py
"""DRY RUN of 0008/0009 on the database of BE/.env. READ ONLY: prints the target host's endpoint id,
refuses anything but dev_minhquan's endpoint, and computes the 0008 backfill plan + the 0009 update
count without writing. Masked e-mails only."""
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
if endpoint == PROD or endpoint.startswith(PROD):
    sys.exit("REFUSED: this is the PRODUCTION endpoint")
if not endpoint.startswith(DEV):
    sys.exit(f"REFUSED: expected {DEV} (dev_minhquan)")

spec = importlib.util.spec_from_file_location("m0008", Path("alembic/versions/0008_gmail_registry.py"))
m0008 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m0008)
spec9 = importlib.util.spec_from_file_location("m0009", Path("alembic/versions/0009_users_contact_email.py"))
m0009 = importlib.util.module_from_spec(spec9)
spec9.loader.exec_module(m0009)


async def main():
    e = create_async_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 15})
    async with e.connect() as c:
        await c.execute(text("SET TRANSACTION READ ONLY"))
        print("alembic_version:", (await c.execute(text("SELECT version_num FROM alembic_version"))).scalars().all())
        users = (await c.execute(text("SELECT user_id, email, created_at FROM users"))).all()
        regs = (await c.execute(text(
            "SELECT registration_id, representative_email, status, created_at FROM business_registrations"))).all()
        owners = dict((await c.execute(text(
            "SELECT c.registration_id, o.user_id FROM clans c JOIN clan_ownership_history o "
            "ON o.clan_id = c.clan_id AND o.ended_at IS NULL WHERE c.registration_id IS NOT NULL"))).all())
        owners_total = (await c.execute(text(
            "SELECT count(DISTINCT user_id) FROM clan_ownership_history WHERE ended_at IS NULL"))).scalar()
        await c.rollback()
    await e.dispose()
    print(f"source rows: users={len(users)} registrations={len(regs)} owned_registrations={len(owners)}")
    print(f"0009 would set contact_email for up to {owners_total} current Owner(s)")
    for flag in (False, True):
        rows, dups = m0008.plan_backfill(users, regs, owners, flag)
        st = Counter(r["status"] for r in rows)
        types = Counter(r["owner_type"] for r in rows if r["status"] == "active")
        print(f"\n0008 plan ALLOW_GMAIL_PLUS_ALIAS={flag}: rows={len(rows)} {dict(st)} active by type {dict(types)} "
              f"duplicate_groups={len(dups)}")
        for group in dups:
            kept, *others = group
            print(f"  {m0008.mask(kept[1])}: kept {kept[0]}; duplicates: "
                  + ", ".join(f"{t}" for t, _, _ in others) + f" ({len(others)})")

asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
