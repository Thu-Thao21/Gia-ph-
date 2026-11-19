"""add clan_ai_settings table and update ai_consents

Revision ID: 0012_clan_ai_settings
Revises: 0011_clan_join_requests
Create Date: 2026-11-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0012_clan_ai_settings"
down_revision: Union[str, Sequence[str], None] = "0011_clan_join_requests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Bảng cấu hình AI theo dòng tộc (clan_ai_settings)
    op.execute("""
    CREATE TABLE IF NOT EXISTS clan_ai_settings (
        clan_id UUID PRIMARY KEY REFERENCES clans(clan_id) ON DELETE CASCADE,
        ai_enabled BOOLEAN NOT NULL DEFAULT false,
        features JSONB NOT NULL DEFAULT '{"assistant": true, "relationship_analysis": true, "suggestions": true, "biography": true}'::jsonb,
        allowed_data_scopes JSONB NOT NULL DEFAULT '{"public_events": true, "general_history": true, "personal_data": false, "images": false}'::jsonb,
        gemini_model VARCHAR(100) NULL,
        updated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """)

    # 2. Cập nhật bảng ai_consents nếu chưa có clan_id và revoked_at
    op.execute("""
    ALTER TABLE ai_consents ADD COLUMN IF NOT EXISTS clan_id UUID REFERENCES clans(clan_id) ON DELETE CASCADE;
    ALTER TABLE ai_consents ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;
    ALTER TABLE ai_consents ALTER COLUMN person_id DROP NOT NULL;
    """)

    # 3. Tạo Unique Index cho ai_consents theo (clan_id, user_id, purpose)
    op.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_consents_clan_user_purpose 
    ON ai_consents (clan_id, user_id, purpose);
    """)

    # 4. Tạo Index hỗ trợ truy vấn quyền AI theo clan và person
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_ai_consents_clan_person 
    ON ai_consents (clan_id, person_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS clan_ai_settings CASCADE;")
    op.execute("DROP INDEX IF EXISTS uq_ai_consents_user_person_purpose;")
    op.execute("DROP INDEX IF EXISTS idx_ai_consents_clan_person;")
    op.execute("ALTER TABLE ai_consents DROP COLUMN IF EXISTS clan_id;")
    op.execute("ALTER TABLE ai_consents DROP COLUMN IF EXISTS revoked_at;")
