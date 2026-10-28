"""Mốc M5c: migration 0010 (clan_identity_registry + uq_clans_clan_code_lower) against a REAL
PostgreSQL, with duplicate clans, then downgrade and a second upgrade.

Same rules as tests/test_m5_migrations_db.py: -m integration, M5_TEST_DATABASE_URL on a THROWAWAY
local database only (any other host is refused). The few tables 0010 reads are re-created with
only the columns it uses; alembic_version is set to 0009.
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
DROP TABLE IF EXISTS clan_identity_registry, clan_profiles, clans, business_registrations, alembic_version CASCADE;
CREATE TABLE business_registrations (
    registration_id UUID PRIMARY KEY, clan_name VARCHAR(255) NOT NULL, origin_place VARCHAR(255),
    status VARCHAR(30) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE clans (
    clan_id UUID PRIMARY KEY, registration_id UUID UNIQUE REFERENCES business_registrations,
    clan_code VARCHAR(50) NOT NULL UNIQUE, name VARCHAR(255) NOT NULL, status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE clan_profiles (clan_id UUID PRIMARY KEY REFERENCES clans, origin_place VARCHAR(255));
CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY);
INSERT INTO alembic_version VALUES ('0009_users_contact_email');
"""

IDS = {k: uuid.uuid4() for k in ("reg_clan", "reg_appr", "reg_pend_old", "reg_pend_new", "reg_rej",
                                 "clan", "clan_manual", "clan_inactive")}


def seed(conn, *, clashing_codes=False):
    t = lambda m: f"now() - interval '{m} minutes'"  # noqa: E731
    conn.execute(text(f"""
        INSERT INTO business_registrations VALUES
          ('{IDS['reg_clan']}', 'Họ Nguyễn Kim', 'Nghệ An', 'APPROVED', {t(40)}),
          ('{IDS['reg_appr']}', 'Dòng họ Nguyễn Kim', 'nghệ  an', 'APPROVED', {t(100)}),   -- older, no clan
          ('{IDS['reg_pend_old']}', 'Tộc Trần', 'Huế', 'PENDING', {t(50)}),
          ('{IDS['reg_pend_new']}', 'Họ Trần', 'Huế', 'PENDING', {t(10)}),
          ('{IDS['reg_rej']}', 'Họ Trần', 'Huế', 'REJECTED', {t(300)});
        INSERT INTO clans VALUES
          ('{IDS['clan']}', '{IDS['reg_clan']}', 'CLAN-AAAAAAAA', 'Họ Nguyễn Kim', 'ACTIVE', {t(30)}),
          ('{IDS['clan_manual']}', NULL, '{'clan-aaaaaaaa' if clashing_codes else 'CLAN-BBBBBBBB'}',
              'Họ Lê', 'SUSPENDED', {t(20)}),
          ('{IDS['clan_inactive']}', NULL, 'CLAN-CCCCCCCC', 'Họ Lê', 'INACTIVE', {t(25)});
        INSERT INTO clan_profiles VALUES ('{IDS['clan_manual']}', 'Bắc Ninh'), ('{IDS['clan_inactive']}', 'Bắc Ninh');
    """))


def alembic(*args):
    from app.db.fingerprint import database_fingerprint

    env = {**os.environ, "DATABASE_URL": URL, "ALLOW_MIGRATE": "1",
           "MIGRATE_EXPECT_FINGERPRINT": database_fingerprint(URL)}
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
    yield eng
    eng.dispose()


def fresh(engine, **kw):
    with engine.begin() as conn:
        conn.execute(text(SCHEMA))
        seed(conn, **kw)


def rows(conn):
    return conn.execute(text(
        "SELECT clan_key, kind, registration_id, clan_id, status, note FROM clan_identity_registry")).mappings().all()


def index_exists(conn, name):
    return conn.execute(text("SELECT to_regclass(:n)"), {"n": f"public.{name}"}).scalar() is not None


def test_0010_upgrade_with_duplicates_downgrade_and_again(engine):
    fresh(engine)
    out = alembic("upgrade", "head")
    assert "duplicate_groups=2" in out

    with engine.connect() as conn:
        rs = rows(conn)
        active = {r["clan_key"]: r for r in rs if r["status"] == "active"}
        assert set(active) == {"nguyen kim|nghe an", "tran|hue", "le|bac ninh"}
        assert (active["nguyen kim|nghe an"]["kind"], active["nguyen kim|nghe an"]["clan_id"]) == ("clan", IDS["clan"])
        assert active["tran|hue"]["registration_id"] == IDS["reg_pend_old"]
        assert active["le|bac ninh"]["clan_id"] == IDS["clan_manual"]          # the INACTIVE one holds nothing
        dups = [r for r in rs if r["status"] == "duplicate"]
        assert {r["registration_id"] for r in dups} == {IDS["reg_appr"], IDS["reg_pend_new"]}
        assert all(r["note"].startswith("duplicate_of:") for r in dups)
        assert not any(r["registration_id"] == IDS["reg_rej"] for r in rs)
        assert index_exists(conn, "uq_clans_clan_code_lower")

    with pytest.raises(IntegrityError):  # one ACTIVE row per key
        with engine.begin() as conn:
            conn.execute(text(f"INSERT INTO clan_identity_registry (registry_id, clan_key, name_key, origin_key, kind, "
                              f"registration_id) VALUES ('{uuid.uuid4()}', 'tran|hue', 'tran', 'hue', 'registration', "
                              f"'{IDS['reg_pend_new']}')"))
    with pytest.raises(IntegrityError):  # clan codes are unique in any letter case
        with engine.begin() as conn:
            conn.execute(text(f"INSERT INTO clans (clan_id, registration_id, clan_code, name, status) "
                              f"VALUES ('{uuid.uuid4()}', NULL, 'clan-aaaaaaaa', 'X', 'ACTIVE')"))
    with engine.begin() as conn:  # the app's claim on the real index: the second inserts nothing
        claim = text("INSERT INTO clan_identity_registry (registry_id, clan_key, name_key, origin_key, kind, registration_id) "
                     "VALUES (:id, 'moi|ha noi', 'moi', 'ha noi', 'registration', :r) "
                     "ON CONFLICT (clan_key) WHERE status = 'active' DO NOTHING RETURNING registry_id")
        first = conn.execute(claim, {"id": uuid.uuid4(), "r": IDS["reg_pend_new"]}).first()
        second = conn.execute(claim, {"id": uuid.uuid4(), "r": IDS["reg_rej"]}).first()
    assert first is not None and second is None

    alembic("downgrade", "0009_users_contact_email")
    with engine.connect() as conn:
        assert not index_exists(conn, "clan_identity_registry") and not index_exists(conn, "uq_clans_clan_code_lower")

    out = alembic("upgrade", "head")
    assert "duplicate_groups=2" in out
    with engine.connect() as conn:
        assert len([r for r in rows(conn) if r["status"] == "active"]) == 3


def test_0010_codes_differing_by_case_only_do_not_break_the_migration(engine):
    fresh(engine, clashing_codes=True)
    out = alembic("upgrade", "head")
    assert "uq_clans_clan_code_lower NOT created: 1 clan code(s) differ only by case" in out
    with engine.connect() as conn:
        assert not index_exists(conn, "uq_clans_clan_code_lower")
        assert index_exists(conn, "uq_clan_identity_active_key")
    alembic("downgrade", "0009_users_contact_email")
