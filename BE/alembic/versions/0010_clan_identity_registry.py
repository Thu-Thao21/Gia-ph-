"""clan_identity_registry: each clan exists ONCE (Mốc M5c), and clan codes unique in any letter case

New table clan_identity_registry. One ACTIVE row per clan_key = name_key + "|" + origin_key
(partial unique index uq_clan_identity_active_key WHERE status = 'active'), held by:
  kind 'clan'          a clan in any status but INACTIVE (registration_id kept when it has one)
  kind 'registration'  a Business registration PENDING / APPROVED / NEED_SUPPLEMENT without a clan
A REJECTED / CANCELLED registration releases its row (the app sets status 'released').

Also: unique index uq_clans_clan_code_lower ON clans (lower(clan_code)), so a generated code and the
Owner login ID made from it ("<code>@giapha.com") cannot differ from another code by letter case
only. Created only when the existing codes allow it (otherwise printed, and skipped).

BACKFILL (Python, deterministic, plan_backfill): same clan_key more than once -> ONE stays
'active', chosen by rank (clan > APPROVED > PENDING > NEED_SUPPLEMENT) then the OLDEST
(created_at); the others are 'duplicate' with note "duplicate_of:<registry_id>". The migration does
not fail on them and prints every group (ids and keys only, no personal data). Keys = the FROZEN
copy of app.core.utils.clan_identity below. Runs only when the table is empty.

DOWNGRADE DROPS THE TABLE AND THE INDEX: "one clan once" stops being enforced.

Revision ID: 0010_clan_identity_registry
Revises: 0009_users_contact_email
Create Date: 2026-10-27
"""
from __future__ import annotations

import re
import unicodedata
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_clan_identity_registry"
down_revision: Union[str, Sequence[str], None] = "0009_users_contact_email"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

HELD_REGISTRATION_STATUSES = ("APPROVED", "PENDING", "NEED_SUPPLEMENT")
_RANK = {"clan": 0, "APPROVED": 1, "PENDING": 2, "NEED_SUPPLEMENT": 3}

# ----- frozen copy of app.core.utils.clan_identity (2026-10-27) -----
NAME_PREFIXES = ("dòng họ", "gia tộc", "họ tộc", "tộc", "họ", "dong ho", "gia toc", "ho toc")


def _nfc_lower(text):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text or "")).strip().lower()


def _ascii_words(text):
    text = text.replace("đ", "d").replace("Đ", "D")
    text = "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text.lower())).strip()


def name_key(clan_name):
    text = _nfc_lower(clan_name)
    for prefix in NAME_PREFIXES:
        if text.startswith(prefix + " ") and len(text) > len(prefix) + 1:
            text = text[len(prefix) + 1:]
            break
    return _ascii_words(text)


def origin_key(origin_place):
    return _ascii_words(_nfc_lower(origin_place or ""))


# ----- the plan (pure: tests call it with duplicate data) -----

def plan_backfill(clans, registrations):
    """clans: [(clan_id, registration_id, name, status, origin_place, created_at)];
    registrations: [(registration_id, clan_name, origin_place, status, created_at)].
    Returns (rows to insert, duplicate groups [[(rank_label, id, clan_key)]])."""
    candidates = []
    with_clan = set()
    for clan_id, registration_id, name, status, origin, created_at in clans:
        if status == "INACTIVE":
            continue
        if registration_id is not None:
            with_clan.add(registration_id)
        n, o = name_key(name), origin_key(origin)
        candidates.append({"kind": "clan", "rank": "clan", "clan_id": clan_id, "registration_id": registration_id,
                           "name_key": n, "origin_key": o, "clan_key": f"{n}|{o}", "created_at": created_at})
    for registration_id, name, origin, status, created_at in registrations:
        if status not in HELD_REGISTRATION_STATUSES or registration_id in with_clan:
            continue
        n, o = name_key(name), origin_key(origin)
        candidates.append({"kind": "registration", "rank": status, "clan_id": None,
                           "registration_id": registration_id, "name_key": n, "origin_key": o,
                           "clan_key": f"{n}|{o}", "created_at": created_at})
    groups = defaultdict(list)
    for c in candidates:
        groups[c["clan_key"]].append(c)
    rows, duplicates = [], []
    for key in sorted(groups):
        group = sorted(groups[key], key=lambda c: (
            _RANK[c["rank"]], c["created_at"] or datetime.max.replace(tzinfo=timezone.utc),
            str(c["clan_id"] or c["registration_id"])))
        keeper = uuid.uuid4()
        for i, c in enumerate(group):
            rows.append({
                "registry_id": keeper if i == 0 else uuid.uuid4(), "clan_key": c["clan_key"],
                "name_key": c["name_key"], "origin_key": c["origin_key"], "kind": c["kind"],
                "registration_id": c["registration_id"], "clan_id": c["clan_id"],
                "status": "active" if i == 0 else "duplicate",
                "note": None if i == 0 else f"duplicate_of:{keeper} (backfill 0010)",
                "created_at": c["created_at"],
            })
        if len(group) > 1:
            duplicates.append([(c["rank"], c["clan_id"] or c["registration_id"], key) for c in group])
    return rows, duplicates


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS clan_identity_registry (
            registry_id UUID NOT NULL,
            clan_key VARCHAR(600) NOT NULL,
            name_key VARCHAR(300) NOT NULL,
            origin_key VARCHAR(300) NOT NULL,
            kind VARCHAR(16) NOT NULL,
            registration_id UUID,
            clan_id UUID,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            note VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            released_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT clan_identity_registry_pkey PRIMARY KEY (registry_id),
            CONSTRAINT clan_identity_registry_kind_check CHECK (kind IN ('registration', 'clan')),
            CONSTRAINT clan_identity_registry_status_check CHECK (status IN ('active', 'released', 'duplicate')),
            CONSTRAINT clan_identity_registry_owner_check CHECK (registration_id IS NOT NULL OR clan_id IS NOT NULL),
            CONSTRAINT clan_identity_registry_registration_id_fkey FOREIGN KEY (registration_id)
                REFERENCES business_registrations (registration_id) ON DELETE CASCADE,
            CONSTRAINT clan_identity_registry_clan_id_fkey FOREIGN KEY (clan_id)
                REFERENCES clans (clan_id) ON DELETE CASCADE
        );
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_clan_identity_active_key "
        "ON clan_identity_registry (clan_key) WHERE status = 'active';"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_clan_identity_name_key ON clan_identity_registry (name_key);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_clan_identity_registration ON clan_identity_registry (registration_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_clan_identity_clan ON clan_identity_registry (clan_id);")
    if op.get_context().as_sql:
        op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_clans_clan_code_lower ON clans (lower(clan_code));")
        print("-- 0010: backfill skipped in --sql mode (it needs the data)")
        return
    bind = op.get_bind()
    _clan_code_index(bind)
    _backfill(bind)


def _clan_code_index(bind) -> None:
    clashes = bind.execute(sa.text(
        "SELECT lower(clan_code), count(*) FROM clans GROUP BY 1 HAVING count(*) > 1"
    )).all()
    if clashes:
        print(f"0010: uq_clans_clan_code_lower NOT created: {len(clashes)} clan code(s) differ only by case: "
              + ", ".join(c for c, _ in clashes))
        return
    bind.execute(sa.text("CREATE UNIQUE INDEX IF NOT EXISTS uq_clans_clan_code_lower ON clans (lower(clan_code))"))


def _backfill(bind) -> None:
    if bind.execute(sa.text("SELECT count(*) FROM clan_identity_registry")).scalar():
        print("0010: clan_identity_registry already filled, backfill skipped")
        return
    clans = bind.execute(sa.text(
        """
        SELECT c.clan_id, c.registration_id, c.name, c.status,
               COALESCE(r.origin_place, p.origin_place) AS origin_place, c.created_at
        FROM clans c
        LEFT JOIN business_registrations r ON r.registration_id = c.registration_id
        LEFT JOIN clan_profiles p ON p.clan_id = c.clan_id
        """
    )).all()
    registrations = bind.execute(sa.text(
        "SELECT registration_id, clan_name, origin_place, status, created_at FROM business_registrations"
    )).all()
    rows, duplicates = plan_backfill(clans, registrations)
    if rows:
        bind.execute(
            sa.text(
                """
                INSERT INTO clan_identity_registry (registry_id, clan_key, name_key, origin_key, kind,
                    registration_id, clan_id, status, note, created_at)
                VALUES (:registry_id, :clan_key, :name_key, :origin_key, :kind,
                    :registration_id, :clan_id, :status, :note, COALESCE(:created_at, now()))
                """
            ),
            rows,
        )
    kinds = defaultdict(int)
    for r in rows:
        if r["status"] == "active":
            kinds[r["kind"]] += 1
    print(f"0010: rows={len(rows)} active={sum(kinds.values())} {dict(kinds)} duplicate_groups={len(duplicates)}")
    for group in duplicates:  # ids and normalized keys only: no person's data
        kept, *others = group
        print(f"0010: duplicate key '{kept[2]}': kept {kept[0]}:{kept[1]}; duplicate "
              + ", ".join(f"{rank}:{i}" for rank, i, _ in others))


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_clans_clan_code_lower;")
    op.execute("DROP INDEX IF EXISTS idx_clan_identity_clan;")
    op.execute("DROP INDEX IF EXISTS idx_clan_identity_registration;")
    op.execute("DROP INDEX IF EXISTS idx_clan_identity_name_key;")
    op.execute("DROP INDEX IF EXISTS uq_clan_identity_active_key;")
    op.execute("DROP TABLE IF EXISTS clan_identity_registry;")
