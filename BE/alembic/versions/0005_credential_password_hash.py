"""credential_metadata.password_hash: the bcrypt hash checked by POST /auth/login (Moc M1)

Idempotent (IF NOT EXISTS): the main database already got the column from the old seed file,
which no longer adds it. Running the upgrade on a database that has the column changes nothing.

DOWNGRADE DROPS THE COLUMN AND EVERY STORED PASSWORD HASH: nobody can log in afterwards until
the passwords are set again with scripts/set_password.py.

Revision ID: 0005_credential_password_hash
Revises: 0004_genealogy_fields
Create Date: 2026-10-25
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005_credential_password_hash"
down_revision: Union[str, Sequence[str], None] = "0004_genealogy_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE credential_metadata ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);")


def downgrade() -> None:
    op.execute("ALTER TABLE credential_metadata DROP COLUMN IF EXISTS password_hash;")
