"""users.contact_email: the real Gmail of a clan Owner (Mốc M5)

An Owner's users.email is a @giapha.com login identifier, not a mailbox. Every mail meant for the
Owner (temporary password, password reset) now reads users.contact_email instead of the fragile
chain users -> clan_ownership_history (ended_at IS NULL) -> clans.registration_id ->
business_registrations.representative_email.

BACKFILL: every current Owner gets the representative_email of the registration of the clan it
owns (the most recently started ownership when there are several), trimmed, as typed (the mailbox
to deliver to; the registry keeps the normalized key). Only rows where contact_email IS NULL.
Two Owners with the same normalized Gmail are NOT refused here: gmail_registry (0008) marked all but
the oldest as 'duplicate', and the counts are printed.

Nullable, IF NOT EXISTS: a second upgrade changes nothing.
DOWNGRADE DROPS THE COLUMN: the app then has no address for the Owners' mail.

Revision ID: 0009_users_contact_email
Revises: 0008_gmail_registry
Create Date: 2026-10-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_users_contact_email"
down_revision: Union[str, Sequence[str], None] = "0008_gmail_registry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BACKFILL_SQL = """
UPDATE users AS u
SET contact_email = src.representative_email
FROM (
    SELECT DISTINCT ON (o.user_id) o.user_id, btrim(r.representative_email) AS representative_email
    FROM clan_ownership_history o
    JOIN clans c ON c.clan_id = o.clan_id
    JOIN business_registrations r ON r.registration_id = c.registration_id
    WHERE o.ended_at IS NULL
    ORDER BY o.user_id, o.started_at DESC
) AS src
WHERE u.user_id = src.user_id AND u.contact_email IS NULL;
"""


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);")
    if op.get_context().as_sql:
        op.execute(BACKFILL_SQL)
        return
    bind = op.get_bind()
    updated = bind.execute(sa.text(BACKFILL_SQL)).rowcount
    owners_without = bind.execute(sa.text(
        """
        SELECT count(*) FROM users u
        WHERE u.contact_email IS NULL AND EXISTS (
            SELECT 1 FROM clan_ownership_history o WHERE o.user_id = u.user_id AND o.ended_at IS NULL)
        """
    )).scalar()
    print(f"0009: contact_email set for {updated} Owner(s); Owners still without one: {owners_without}")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS contact_email;")
