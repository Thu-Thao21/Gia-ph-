"""Dev script: set the DB login password of one account (Moc M1).

    cd BE
    .venv\\Scripts\\python scripts\\set_password.py <email> [--must-change]

- The password is asked twice with getpass: never shown, never printed, never logged, never an
  argument (it would land in the shell history).
- Policy: the shared one (app.core.security.password_hash.check_password_policy): at least 8
  characters, an upper-case letter, a lower-case letter, a digit, at most 72 bytes.
- The DB is the source of truth: credential_metadata.password_hash = bcrypt (cost 12),
  password_changed_at = now, must_change_password = --must-change, failed_login_count = 0,
  locked_until = NULL. Every session of the account is revoked. Committed BEFORE Firebase is
  touched (no transaction is held open across a Firebase call).
- Then the Firebase password is kept in sync (Admin SDK update_user, uid = users.firebase_uid)
  when that Firebase account exists, with the same helper as POST /auth/change-password. When it does not, a warning is printed and the DB change
  stays (Moc M2 handles those accounts). Firebase is NOT the login gate.
- DATABASE_URL comes from settings (BE/.env), never from the command line.

Exit codes: 0 done; 1 refused (bad input, no such user, weak password: nothing changed);
3 DB saved but the Firebase sync failed (see the warning).
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.controllers.auth_access.use_cases import sync_firebase_password  # noqa: E402
from app.core.integrations.firebase import IdentityProvider  # noqa: E402
from app.core.security.password_hash import check_password_policy, hash_password  # noqa: E402

EXIT_OK, EXIT_REFUSED, EXIT_FIREBASE_FAILED = 0, 1, 3
NO_FIREBASE_ACCOUNT_WARNING = "chưa có tài khoản Firebase - sẽ xử lý ở Mốc M2"


class Refused(Exception):
    """Nothing was changed. The message never holds the password."""


@dataclass
class Outcome:
    user_id: uuid.UUID
    firebase: str  # "updated" | "no_account" | "no_uid" | "failed:<reason>"


def check_new_password(password: str) -> None:
    """Refused (naming the rule, never the password) unless the shared policy holds."""
    try:
        check_password_policy(password)
    except ValueError as exc:
        raise Refused(f"Mật khẩu không đạt chính sách: {exc}.") from None


def validate_password(password: str, confirm: str) -> None:
    if password != confirm:
        raise Refused("Hai lần nhập mật khẩu không khớp.")
    check_new_password(password)


async def set_password(
    *,
    db,
    users,
    provider: IdentityProvider,
    email: str,
    password: str,
    must_change: bool,
    now: datetime | None = None,
) -> Outcome:
    """Policy -> DB (commit) -> Firebase. Raises Refused before any change."""
    check_new_password(password)
    password_hash = await asyncio.to_thread(hash_password, password)
    now = now or datetime.now(timezone.utc)

    user = await users.get_user_by_email_ci(email.strip())
    if user is None:
        raise Refused("Không tìm thấy tài khoản với email này.")

    cred = await users.lock_credential_metadata(user.user_id)
    if cred is None:
        cred = await users.add_credential_metadata(user.user_id, now=now)
    cred.password_hash = password_hash
    cred.password_changed_at = now
    cred.must_change_password = must_change
    cred.temporary_password_issued_at = None
    cred.temporary_password_expires_at = None
    cred.failed_login_count = 0
    cred.locked_until = None
    cred.updated_at = now
    revoked = await users.revoke_all_sessions(user.user_id, reason="PASSWORD_SET_BY_SCRIPT", now=now)
    await users.add_audit_log(
        actor_id=None,
        action="auth.password_set_by_script",
        entity_type="user",
        entity_id=user.user_id,
        old_data=None,
        new_data={"must_change_password": must_change, "revoked_sessions": revoked},
        ip_address=None,
        occurred_at=now,
    )
    await db.commit()

    return Outcome(user.user_id, await sync_firebase_password(provider, user.firebase_uid, password))


def _parse(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Set the DB login password of one account.")
    parser.add_argument("email", help="E-mail of the account (any letter case).")
    parser.add_argument(
        "--must-change",
        action="store_true",
        help="The user must change the password at the next login (restricted session).",
    )
    return parser.parse_args(argv)


async def _run(args: argparse.Namespace, password: str) -> Outcome:
    from app.core.integrations.firebase import get_identity_provider
    from app.db.postgres import async_session_maker, engine
    from app.models.user_access.repository import UserAccessRepository

    try:
        async with async_session_maker() as session:
            return await set_password(
                db=session,
                users=UserAccessRepository(session),
                provider=get_identity_provider(),
                email=args.email,
                password=password,
                must_change=args.must_change,
            )
    finally:
        await engine.dispose()


def main(
    argv: list[str] | None = None,
    *,
    ask: Callable[[str], str] = getpass.getpass,
    run=_run,
) -> int:
    args = _parse(sys.argv[1:] if argv is None else argv)
    password = ask("Mật khẩu mới (không hiển thị): ")
    confirm = ask("Nhập lại mật khẩu mới: ")
    try:
        validate_password(password, confirm)
        outcome = asyncio.run(run(args, password))
    except Refused as exc:
        print(f"TỪ CHỐI: {exc} Không có gì bị thay đổi.", file=sys.stderr)
        return EXIT_REFUSED

    print(f"Đã lưu mật khẩu vào DB cho user_id={outcome.user_id} (must_change_password={args.must_change}).")
    if outcome.firebase == "updated":
        print("Đã cập nhật mật khẩu Firebase.")
        return EXIT_OK
    if outcome.firebase in ("no_account", "no_uid"):
        print(f"CẢNH BÁO: {NO_FIREBASE_ACCOUNT_WARNING}.", file=sys.stderr)
        return EXIT_OK
    print(
        f"CẢNH BÁO: DB đã lưu nhưng KHÔNG cập nhật được Firebase ({outcome.firebase}). "
        "Kiểm tra FIREBASE_SERVICE_ACCOUNT_PATH rồi chạy lại.",
        file=sys.stderr,
    )
    return EXIT_FIREBASE_FAILED


if __name__ == "__main__":
    if sys.platform.startswith("win"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    raise SystemExit(main())
