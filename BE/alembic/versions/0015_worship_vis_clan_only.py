"""worship_spaces.visibility: cho phep them gia tri 'CLAN_ONLY'

Revision ID: 0015_worship_vis_clan_only
Revises: 0014_worship_hall
Create Date: 2026-11-13

Bang cu worship_spaces (initial_schema.sql) co CHECK worship_spaces_visibility_check chi cho
PUBLIC / FAMILY / ADMIN_ONLY / PRIVATE / INTER_FAMILY. Code phong tho moi ghi visibility = 'CLAN_ONLY'
nen tao phong lan dau bi IntegrityError. Migration nay chi THAY rang buoc do: giu nguyen 5 gia tri cu
va them 'CLAN_ONLY'. Khong dung gi khac, khong xoa du lieu.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0015_worship_vis_clan_only"
down_revision: Union[str, Sequence[str], None] = "0014_worship_hall"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE worship_spaces DROP CONSTRAINT IF EXISTS worship_spaces_visibility_check")
    op.execute("""
    ALTER TABLE worship_spaces
        ADD CONSTRAINT worship_spaces_visibility_check
        CHECK (visibility IN ('PUBLIC', 'FAMILY', 'ADMIN_ONLY', 'PRIVATE', 'INTER_FAMILY', 'CLAN_ONLY'))
    """)


def downgrade() -> None:
    # 'CLAN_ONLY' khong con hop le sau khi khoi phuc rang buoc cu: chuyen ve 'FAMILY' (gan nghia nhat)
    op.execute("UPDATE worship_spaces SET visibility = 'FAMILY' WHERE visibility = 'CLAN_ONLY'")
    op.execute("ALTER TABLE worship_spaces DROP CONSTRAINT IF EXISTS worship_spaces_visibility_check")
    op.execute("""
    ALTER TABLE worship_spaces
        ADD CONSTRAINT worship_spaces_visibility_check
        CHECK (visibility IN ('PUBLIC', 'FAMILY', 'ADMIN_ONLY', 'PRIVATE', 'INTER_FAMILY'))
    """)
