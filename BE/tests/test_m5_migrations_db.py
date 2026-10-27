"""Mốc M5: migrations 0008 (gmail_registry) and 0009 (users.contact_email) against a REAL PostgreSQL:
upgrade with duplicate data, the partial unique index, downgrade, and a second upgrade.

Runs only with -m integration AND M5_TEST_DATABASE_URL pointing at a THROWAWAY database on
localhost (refused for any other host, so it can never touch Neon). It drops and re-creates the few
tables 0008/0009 read, with only the columns they use; the real schema is not needed. Example:

  docker run -d --rm --name m5-pg -e POSTGRES_PASSWORD=<pw> -p 127.0.0.1:55432:5432 postgres:16-alpine
  # 127.0.0.1, not localhost: localhost tries IPv6 first and every connection takes ~6 s
  $env:M5_TEST_DATABASE_URL = "postgresql+psycopg://postgres:<pw>@127.0.0.1:55432/postgres"
  .venv\\Scripts\\python.exe -m pytest -m integration tests/test_m5_migrations_db.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

pytestmark = pytest.mark.integration

BE_DIR = Path(__file__).resolve().parents[1]
URL = os.environ.get("M5_TEST_DATABASE_URL", "")

SCHEMA = """
DROP TABLE IF EXISTS gmail_registry, clan_ownership_history, clans, business_registrations, users,
    alembic_version CASCADE;
CREATE TABLE users (
    user_id UUID PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE business_registrations (
    registration_id UUID PRIMARY KEY, representative_email VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE clans (clan_id UUID PRIMARY KEY, registration_id UUID UNIQUE REFERENCES business_registrations);
CREATE TABLE clan_ownership_history (
    ownership_id UUID PRIMARY KEY, clan_id UUID NOT NULL REFERENCES clans, user_id UUID NOT NULL REFERENCES users,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ);
CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY);
INSERT INTO alembic_version VALUES ('0007_email_otp_challenges');
"""

IDS = {k: uuid.uuid4() for k in (
    "legacy_owner", "giapha_owner", "member", "reg_legacy", "reg_giapha", "reg_dup", "reg_rejected",
    "reg_old_pending", "clan_legacy", "clan_giapha")}


def seed(conn):
    t = lambda m: f"now() - interval '{m} minutes'"  # noqa: E731 - older = bigger m
    conn.execute(text(f"""
        INSERT INTO users VALUES
          ('{IDS['legacy_owner']}', 'boss+one@gmail.com', {t(50)}),        -- Owner whose login is its Gmail
          ('{IDS['giapha_owner']}', 'ho.nguyen@giapha.com', {t(40)}),     -- Owner with a login id
          ('{IDS['member']}', 'Mem.Ber@gmail.com', {t(30)});
        INSERT INTO business_registrations VALUES
          ('{IDS['reg_legacy']}', 'boss+one@gmail.com', 'APPROVED', {t(60)}),
          ('{IDS['reg_giapha']}', 'real.owner@gmail.com', 'APPROVED', {t(45)}),
          ('{IDS['reg_dup']}', 'member@gmail.com', 'PENDING', {t(35)}),     -- OLDER than the member
          ('{IDS['reg_old_pending']}', 'Real.Owner+x@gmail.com', 'PENDING', {t(90)}),  -- older than the Owner
          ('{IDS['reg_rejected']}', 'free@gmail.com', 'REJECTED', {t(5)});
        INSERT INTO clans VALUES ('{IDS['clan_legacy']}', '{IDS['reg_legacy']}'),
                                 ('{IDS['clan_giapha']}', '{IDS['reg_giapha']}');
        INSERT INTO clan_ownership_history (ownership_id, clan_id, user_id) VALUES
          ('{uuid.uuid4()}', '{IDS['clan_legacy']}', '{IDS['legacy_owner']}'),
          ('{uuid.uuid4()}', '{IDS['clan_giapha']}', '{IDS['giapha_owner']}');
    """))


def alembic(*args):
    from app.db.fingerprint import database_fingerprint

    env = {**os.environ, "DATABASE_URL": URL, "ALLOW_MIGRATE": "1",
           "MIGRATE_EXPECT_FINGERPRINT": database_fingerprint(URL), "ALLOW_GMAIL_PLUS_ALIAS": "false"}
    run = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BE_DIR, env=env,
                         capture_output=True, text=True, encoding="utf-8")
    assert run.returncode == 0, run.stderr[-2000:]
    return run.stdout + run.stderr


@pytest.fixture(scope="module")
def engine():
    if not URL:
        pytest.skip("M5_TEST_DATABASE_URL is not set")
    host = make_url(URL).host or ""
    if host not in ("localhost", "127.0.0.1", "::1"):
        pytest.fail(f"refusing to run against a non-local host ({host!r}): use a throwaway local DB")
    eng = create_engine(URL)
    with eng.begin() as conn:
        conn.execute(text(SCHEMA))
        seed(conn)
    yield eng
    eng.dispose()


def registry(conn):
    return conn.execute(text(
        "SELECT normalized_email, owner_type, user_id, registration_id, status, note FROM gmail_registry"
    )).mappings().all()


def test_upgrade_backfills_with_duplicates_then_downgrade_and_upgrade_again(engine):
    out = alembic("upgrade", "head")
    assert "duplicate_groups=2" in out and "contact_email set for 2 Owner(s)" in out
    assert "boss+one@gmail.com" not in out and "member@gmail.com" not in out  # masked only

    with engine.connect() as conn:
        rows = registry(conn)
        active = {r["normalized_email"]: r for r in rows if r["status"] == "active"}
        assert set(active) == {"boss@gmail.com", "realowner@gmail.com", "member@gmail.com"}
        # the legacy Owner and its own registration: ONE row
        assert (active["boss@gmail.com"]["owner_type"], active["boss@gmail.com"]["user_id"]) == (
            "clan_owner_contact", IDS["legacy_owner"])
        # Priority clan_owner_contact > member > business_registration, even against OLDER rows.
        assert (active["realowner@gmail.com"]["owner_type"], active["realowner@gmail.com"]["user_id"]) == (
            "clan_owner_contact", IDS["giapha_owner"])
        assert active["member@gmail.com"]["owner_type"] == "member"
        dups = [r for r in rows if r["status"] == "duplicate"]
        assert {r["registration_id"] for r in dups} == {IDS["reg_dup"], IDS["reg_old_pending"]}
        keepers = {str(k) for k in conn.execute(text(
            "SELECT registry_id FROM gmail_registry WHERE status = 'active'")).scalars()}
        assert all(r["note"].startswith("duplicate_of:") and r["note"].split(":")[1].split()[0] in keepers
                   for r in dups)
        assert not any(r["normalized_email"].endswith("@giapha.com") for r in rows)
        assert not any(r["registration_id"] == IDS["reg_rejected"] for r in rows)
        contacts = dict(conn.execute(text("SELECT user_id, contact_email FROM users")).all())
        assert contacts[IDS["giapha_owner"]] == "real.owner@gmail.com"
        assert contacts[IDS["legacy_owner"]] == "boss+one@gmail.com" and contacts[IDS["member"]] is None

    # The partial unique index: a second ACTIVE row is refused; a released one is fine.
    with engine.begin() as conn:
        conn.execute(text(
            f"INSERT INTO gmail_registry (registry_id, normalized_email, original_email, owner_type, user_id, status)"
            f" VALUES ('{uuid.uuid4()}', 'member@gmail.com', 'x', 'member', '{IDS['member']}', 'released')"))
    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(text(
                f"INSERT INTO gmail_registry (registry_id, normalized_email, original_email, owner_type, user_id)"
                f" VALUES ('{uuid.uuid4()}', 'member@gmail.com', 'x', 'member', '{IDS['member']}')"))
    with pytest.raises(IntegrityError):  # @giapha.com never registered
        with engine.begin() as conn:
            conn.execute(text(
                f"INSERT INTO gmail_registry (registry_id, normalized_email, original_email, owner_type, user_id)"
                f" VALUES ('{uuid.uuid4()}', 'x@giapha.com', 'x', 'member', '{IDS['member']}')"))
    # The app's claim statement on the real index: the second one inserts nothing.
    with engine.begin() as conn:
        claim = text(
            "INSERT INTO gmail_registry (registry_id, normalized_email, original_email, owner_type, user_id) "
            "VALUES (:id, 'new@gmail.com', 'new@gmail.com', 'member', :u) "
            "ON CONFLICT (normalized_email) WHERE status = 'active' DO NOTHING RETURNING registry_id")
        first = conn.execute(claim, {"id": uuid.uuid4(), "u": IDS["member"]}).first()
        second = conn.execute(claim, {"id": uuid.uuid4(), "u": IDS["member"]}).first()
    assert first is not None and second is None

    alembic("downgrade", "0007_email_otp_challenges")
    with engine.connect() as conn:
        assert conn.execute(text("SELECT to_regclass('public.gmail_registry')")).scalar() is None
        assert conn.execute(text(
            "SELECT count(*) FROM information_schema.columns WHERE table_name='users' AND column_name='contact_email'"
        )).scalar() == 0

    out = alembic("upgrade", "head")  # again, from scratch: same result
    assert "duplicate_groups=2" in out
    with engine.connect() as conn:
        assert len([r for r in registry(conn) if r["status"] == "active"]) == 3
    out = alembic("upgrade", "head")  # already at head: nothing to do, nothing broken
    with engine.connect() as conn:
        assert len(registry(conn)) == 5
