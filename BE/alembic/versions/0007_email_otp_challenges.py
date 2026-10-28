"""email_otp_challenges: e-mail OTP codes kept in the database, hashed (Mốc M5-1)

One row per OTP sent to prove a Gmail address, for one PURPOSE (member registration or Business
registration: a code or a proof of one never works for the other):

  email_hash   HMAC-SHA256(OTP_HMAC_KEY, normalized e-mail): the address itself is not stored.
  code_hash    HMAC-SHA256(OTP_HMAC_KEY, purpose + email_hash + code): bound to the e-mail and the
               purpose, and a 6-digit code cannot be brute-forced offline without the key.
  failed_attempts / invalidated_at   wrong codes; a newer code or too many wrong ones ends it.
  verified_at  the right code was entered (once: the code is then used up).
  token_hash   SHA-256 of the one-time verification token handed to that caller; the account /
               registration is created only by presenting it (token_used_at, claimed atomically
               in the same transaction).

Idempotent (IF NOT EXISTS / IF EXISTS), like 0005/0006. A new table only: no existing table changes.
DOWNGRADE DROPS THE TABLE: OTPs in flight stop working; users simply request a new code.

Revision ID: 0007_email_otp_challenges
Revises: 0006_used_password_reset_codes
Create Date: 2026-10-26
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0007_email_otp_challenges"
down_revision: Union[str, Sequence[str], None] = "0006_used_password_reset_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_otp_challenges (
            challenge_id UUID NOT NULL,
            purpose VARCHAR(32) NOT NULL,
            email_hash VARCHAR(64) NOT NULL,
            code_hash VARCHAR(64) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            invalidated_at TIMESTAMP WITH TIME ZONE,
            verified_at TIMESTAMP WITH TIME ZONE,
            token_hash VARCHAR(64),
            token_expires_at TIMESTAMP WITH TIME ZONE,
            token_used_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT email_otp_challenges_pkey PRIMARY KEY (challenge_id),
            CONSTRAINT email_otp_challenges_purpose_check
                CHECK (purpose IN ('MEMBER_REGISTRATION', 'BUSINESS_REGISTRATION')),
            CONSTRAINT email_otp_challenges_email_hash_check CHECK (email_hash ~ '^[0-9a-f]{64}$'),
            CONSTRAINT email_otp_challenges_code_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$'),
            CONSTRAINT email_otp_challenges_token_hash_check
                CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
            CONSTRAINT email_otp_challenges_failed_attempts_check CHECK (failed_attempts >= 0),
            CONSTRAINT email_otp_challenges_token_hash_key UNIQUE (token_hash)
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_email_otp_challenges_lookup "
        "ON email_otp_challenges (purpose, email_hash, created_at DESC);"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_email_otp_challenges_lookup;")
    op.execute("DROP TABLE IF EXISTS email_otp_challenges;")
