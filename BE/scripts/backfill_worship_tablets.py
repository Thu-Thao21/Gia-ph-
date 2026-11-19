"""Backfill bai vi cho nguoi DA MAT chua co bai vi trong phong tho CUA MOT dong ho.

Mac dinh la DRY-RUN: chi in danh sach se them, KHONG ghi gi vao DB. Chi ghi khi co --apply.
Bat buoc chi dinh --clan-id (mot dong ho moi lan chay). Bo qua nguoi da co bai vi va nguoi Truong toc da go
(worship_removed_persons); toi da 300 bai vi / phong; tang xep theo doi (generation_no).

    python scripts/backfill_worship_tablets.py --clan-id <uuid>            # xem truoc
    python scripts/backfill_worship_tablets.py --clan-id <uuid> --apply    # ghi that

Can da chay migration 0017 (bang worship_removed_persons).
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def _parse_args(argv=None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--clan-id", required=True, type=uuid.UUID, help="UUID cua dong ho (bat buoc, mot dong ho)")
    parser.add_argument("--apply", action="store_true", help="Ghi that vao DB (mac dinh chi in danh sach)")
    parser.add_argument("--dry-run", action="store_true", help="Chi in (day la mac dinh; khong dung cung --apply)")
    args = parser.parse_args(argv)
    if args.apply and args.dry_run:
        parser.error("--apply va --dry-run khong dung cung nhau")
    return args


def format_report(result: dict, apply: bool) -> str:
    clan = result["clan"]
    lines = [
        f"Dong ho: {clan.name} ({clan.clan_id})",
        f"Phong tho: {'da co' if result['hall_exists'] else 'chua co (se duoc tao khi --apply)'}; "
        f"bai vi hien co: {result['existing']}",
        f"Nguoi da mat bi Truong toc go truoc do (bo qua): {result['removed_by_leader']}",
        f"Se them: {len(result['to_add'])} bai vi" + (f"; vuot gioi han 300, bo qua: {len(result['over_limit'])}"
                                                      if result["over_limit"] else ""),
    ]
    for p in result["to_add"]:
        lines.append(f"  + doi {p.generation if p.generation is not None else '?'} | {p.full_name} | {p.id}")
    if apply:
        lines.append(f"Da them: {result['added']}; that bai: {result['failed']}")
    else:
        lines.append("DRY-RUN: chua ghi gi. Them --apply de ghi that.")
    return "\n".join(lines)


async def run(clan_id: uuid.UUID, apply: bool) -> int:
    import app.models.registry  # noqa: F401  (nap day du mapper ORM)
    from app.db.postgres import async_session_maker, engine
    from app.services.worship.hall_service import WorshipHallService

    try:
        async with async_session_maker() as session:
            result = await WorshipHallService(session).backfill_missing_tablets(clan_id, apply=apply)
            print(format_report(result, apply))
            if apply:
                await session.commit()
            else:
                await session.rollback()
        return 0
    finally:
        await engine.dispose()


def main(argv=None) -> int:
    args = _parse_args(argv)
    return asyncio.run(run(args.clan_id, args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
