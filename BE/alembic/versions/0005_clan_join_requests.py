"""add clan_join_requests table and lineage_type to clan_memberships

Revision ID: 0005_clan_join_requests
Revises: 0004_genealogy_fields
Create Date: 2026-10-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_clan_join_requests"
down_revision: Union[str, Sequence[str], None] = "0004_genealogy_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE clan_memberships ADD COLUMN IF NOT EXISTS lineage_type VARCHAR(30) NULL;")
    op.execute("""
    CREATE TABLE IF NOT EXISTS clan_join_requests (
        request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        clan_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
        lineage_type VARCHAR(30) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        birth_date DATE NULL,
        relative_name VARCHAR(255) NOT NULL,
        relative_relation VARCHAR(100) NOT NULL,
        relation_description TEXT NULL,
        verification_notes TEXT NOT NULL,
        consent_given BOOLEAN NOT NULL DEFAULT true,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        reviewer_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
        review_note TEXT NULL,
        reviewed_at TIMESTAMPTZ NULL,
        linked_person_id UUID NULL REFERENCES persons(person_id) ON DELETE SET NULL,
        history JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    """)
    op.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS uq_clan_join_active_request 
    ON clan_join_requests (user_id, clan_id) 
    WHERE status IN ('PENDING', 'NEED_INFO');
    """)
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_clan_join_clan_status 
    ON clan_join_requests (clan_id, status);
    """)
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_clan_join_user 
    ON clan_join_requests (user_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS clan_join_requests CASCADE;")
    op.execute("ALTER TABLE clan_memberships DROP COLUMN IF EXISTS lineage_type;")
