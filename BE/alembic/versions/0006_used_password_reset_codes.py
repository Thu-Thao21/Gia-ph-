"""used_password_reset_codes: a password-reset code works ONCE (Mốc M4b)

One row per reset code already used to set a password: code_hash is the SHA-256 (hex) of the
code, never the code itself. The PRIMARY KEY on code_hash is the unique constraint that makes the
claim race-safe (two requests with one code: the second INSERT ... ON CONFLICT DO NOTHING inserts
nothing). user_id is kept for audit and is removed with the user (ON DELETE CASCADE).

Idempotent (IF NOT EXISTS / IF EXISTS), like 0005. A new table only: no existing table changes.
DOWNGRADE DROPS THE TABLE: every code already used becomes usable again until Firebase expires it.

Revision ID: 0006_used_password_reset_codes
Revises: 0005_credential_password_hash
Create Date: 2026-10-26
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006_used_password_reset_codes"
down_revision: Union[str, Sequence[str], None] = "0005_credential_password_hash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS used_password_reset_codes (
            code_hash VARCHAR(64) NOT NULL,
            user_id UUID NOT NULL,
            used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT used_password_reset_codes_pkey PRIMARY KEY (code_hash),
            CONSTRAINT used_password_reset_codes_code_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$'),
            CONSTRAINT used_password_reset_codes_user_id_fkey
                FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_used_password_reset_codes_user "
        "ON used_password_reset_codes (user_id, used_at DESC);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_used_password_reset_codes_user;")
    op.execute("DROP TABLE IF EXISTS used_password_reset_codes;")
