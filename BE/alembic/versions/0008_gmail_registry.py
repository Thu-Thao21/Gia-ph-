"""gmail_registry: a real Gmail registers ONCE, for any kind of account (Mốc M5)

New table gmail_registry. One ACTIVE row per normalized_email (partial unique index
uq_gmail_registry_active_email WHERE status = 'active'); 'released' rows (a rejected / cancelled
Business registration gave its Gmail back) and 'duplicate' rows (found by this backfill) are kept
for the record and never block anybody.

  owner_type  member | business_registration | clan_owner_contact
  user_id / registration_id  who holds the Gmail (ON DELETE CASCADE: deleting the holder frees it)

@giapha.com addresses are NOT registered (login identifiers issued by the system, CHECK).

BACKFILL (Python, deterministic, plan_backfill below):
  * every Business registration in PENDING / APPROVED / NEED_SUPPLEMENT: its representative_email.
    If its clan has a current Owner (clans.registration_id -> clan_ownership_history.ended_at IS
    NULL) the row is clan_owner_contact with that Owner's user_id, else business_registration.
  * every user whose e-mail is not @giapha.com: member, UNLESS the user is the Owner of a clan whose
    representative_email is the same Gmail (then the clan_owner_contact row above already holds it).
  * same normalized Gmail more than once: ONE stays 'active', chosen by owner_type first
    (clan_owner_contact > member > business_registration: a provisioned Owner or an existing account
    is never displaced by a registration still waiting), then the OLDEST source row (created_at)
    within the same type. The others are written as 'duplicate' with note
    "duplicate_of:<registry_id>". The migration does not fail on them and prints every group
    (masked addresses) so they can be resolved by hand.
  * normalization = the FROZEN copy below (app.core.utils.gmail_registry may evolve; this must not),
    with ALLOW_GMAIL_PLUS_ALIAS read from the settings AT MIGRATION TIME.
  * runs only when the table is empty (a second upgrade changes nothing).

DOWNGRADE DROPS THE TABLE: the "one Gmail once" rule stops being enforced until it is re-created.

Revision ID: 0008_gmail_registry
Revises: 0007_email_otp_challenges
Create Date: 2026-10-27
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_gmail_registry"
down_revision: Union[str, Sequence[str], None] = "0007_email_otp_challenges"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

HELD_REGISTRATION_STATUSES = ("PENDING", "APPROVED", "NEED_SUPPLEMENT")
# Which row of a duplicate group stays active: the lowest rank, then the oldest (team lead, M5).
_TYPE_ORDER = {"clan_owner_contact": 0, "member": 1, "business_registration": 2}


# ----- frozen copy of app.core.utils.gmail_registry (2026-10-27) -----

def normalize_email(email: str, allow_plus_alias: bool) -> str:
    address = (email or "").strip().lower()
    local, sep, domain = address.rpartition("@")
    if not sep:
        return address
    if domain in ("gmail.com", "googlemail.com"):
        domain = "gmail.com"
        if not allow_plus_alias:
            local = local.split("+", 1)[0]
        local = local.replace(".", "")
    return f"{local}@{domain}"


def is_login_identifier(email: str) -> bool:
    return (email or "").strip().lower().rstrip(".").endswith("@giapha.com")


def mask(email: str) -> str:
    local, _, domain = (email or "").strip().partition("@")
    return f"{local[:1]}***@{domain}" if local and domain else "***"


# ----- the plan (pure: tests call it with duplicate data) -----

def plan_backfill(users, registrations, owner_of_registration, allow_plus_alias: bool):
    """users: [(user_id, email, created_at)]; registrations: [(registration_id, email, status,
    created_at)]; owner_of_registration: {registration_id: user_id of its clan's current Owner}.
    Returns (rows to insert, duplicate groups) where a group is [(owner_type, email, source_id)]."""
    candidates = []
    owner_gmails: dict = defaultdict(set)  # user_id -> normalized representative e-mails it owns
    for registration_id, email, status, created_at in registrations:
        if status not in HELD_REGISTRATION_STATUSES or not email or is_login_identifier(email):
            continue
        owner = owner_of_registration.get(registration_id)
        key = normalize_email(email, allow_plus_alias)
        if owner is not None:
            owner_gmails[owner].add(key)
        candidates.append({
            "normalized_email": key, "original_email": email.strip(),
            "owner_type": "clan_owner_contact" if owner is not None else "business_registration",
            "user_id": owner, "registration_id": registration_id, "created_at": created_at,
        })
    for user_id, email, created_at in users:
        if not email or is_login_identifier(email):
            continue
        key = normalize_email(email, allow_plus_alias)
        if key in owner_gmails.get(user_id, ()):
            continue  # the Owner's own contact row already holds this Gmail
        candidates.append({
            "normalized_email": key, "original_email": email.strip(), "owner_type": "member",
            "user_id": user_id, "registration_id": None, "created_at": created_at,
        })

    groups: dict = defaultdict(list)
    for c in candidates:
        groups[c["normalized_email"]].append(c)
    rows, duplicates = [], []
    for key in sorted(groups):
        group = sorted(
            groups[key],
            key=lambda c: (_TYPE_ORDER[c["owner_type"]],
                           c["created_at"] or datetime.max.replace(tzinfo=timezone.utc),
                           str(c["user_id"] or c["registration_id"])),
        )
        keeper_id = uuid.uuid4()
        for i, c in enumerate(group):
            row = dict(c, registry_id=keeper_id if i == 0 else uuid.uuid4(),
                       status="active" if i == 0 else "duplicate",
                       note=None if i == 0 else f"duplicate_of:{keeper_id} (backfill 0008)")
            rows.append(row)
        if len(group) > 1:
            duplicates.append([
                (c["owner_type"], c["original_email"], c["user_id"] or c["registration_id"]) for c in group
            ])
    return rows, duplicates


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS gmail_registry (
            registry_id UUID NOT NULL,
            normalized_email VARCHAR(255) NOT NULL,
            original_email VARCHAR(255) NOT NULL,
            owner_type VARCHAR(32) NOT NULL,
            user_id UUID,
            registration_id UUID,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            note VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            released_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT gmail_registry_pkey PRIMARY KEY (registry_id),
            CONSTRAINT gmail_registry_owner_type_check
                CHECK (owner_type IN ('member', 'business_registration', 'clan_owner_contact')),
            CONSTRAINT gmail_registry_status_check CHECK (status IN ('active', 'released', 'duplicate')),
            CONSTRAINT gmail_registry_owner_check CHECK (user_id IS NOT NULL OR registration_id IS NOT NULL),
            CONSTRAINT gmail_registry_not_login_id_check CHECK (normalized_email NOT LIKE '%@giapha.com'),
            CONSTRAINT gmail_registry_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
            CONSTRAINT gmail_registry_registration_id_fkey
                FOREIGN KEY (registration_id) REFERENCES business_registrations (registration_id) ON DELETE CASCADE
        );
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_registry_active_email "
        "ON gmail_registry (normalized_email) WHERE status = 'active';"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_gmail_registry_user ON gmail_registry (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gmail_registry_registration ON gmail_registry (registration_id);")
    _backfill()


def _backfill() -> None:
    if context_is_offline():
        print("-- 0008: backfill skipped in --sql mode (it needs the data)")
        return
    bind = op.get_bind()
    if bind.execute(sa.text("SELECT count(*) FROM gmail_registry")).scalar():
        print("0008: gmail_registry already filled, backfill skipped")
        return
    from app.core.config import settings  # the flag in force NOW (see the module docstring)

    allow_plus = bool(settings.ALLOW_GMAIL_PLUS_ALIAS)
    users = bind.execute(sa.text("SELECT user_id, email, created_at FROM users")).all()
    registrations = bind.execute(sa.text(
        "SELECT registration_id, representative_email, status, created_at FROM business_registrations"
    )).all()
    owners = dict(bind.execute(sa.text(
        """
        SELECT c.registration_id, o.user_id
        FROM clans c JOIN clan_ownership_history o ON o.clan_id = c.clan_id AND o.ended_at IS NULL
        WHERE c.registration_id IS NOT NULL
        """
    )).all())
    rows, duplicates = plan_backfill(users, registrations, owners, allow_plus)
    if rows:
        bind.execute(
            sa.text(
                """
                INSERT INTO gmail_registry (registry_id, normalized_email, original_email, owner_type,
                    user_id, registration_id, status, note, created_at)
                VALUES (:registry_id, :normalized_email, :original_email, :owner_type,
                    :user_id, :registration_id, :status, :note, COALESCE(:created_at, now()))
                """
            ),
            rows,
        )
    by_type: dict = defaultdict(int)
    for r in rows:
        if r["status"] == "active":
            by_type[r["owner_type"]] += 1
    print(
        f"0008: ALLOW_GMAIL_PLUS_ALIAS={allow_plus} rows={len(rows)} "
        f"active={sum(by_type.values())} {dict(by_type)} duplicate_groups={len(duplicates)}"
    )
    for group in duplicates:  # masked: the report needs the shape, not the addresses
        kept, *others = group
        print(f"0008: duplicate {mask(kept[1])}: kept {kept[0]}:{kept[2]}; duplicate "
              + ", ".join(f"{t}:{i}" for t, _, i in others))


def context_is_offline() -> bool:
    return op.get_context().as_sql


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_gmail_registry_registration;")
    op.execute("DROP INDEX IF EXISTS idx_gmail_registry_user;")
    op.execute("DROP INDEX IF EXISTS uq_gmail_registry_active_email;")
    op.execute("DROP TABLE IF EXISTS gmail_registry;")
