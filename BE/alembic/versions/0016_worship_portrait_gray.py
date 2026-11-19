"""worship_spaces.portrait_grayscale: cai dat hien anh bai vi den trang trong canh 3D

Revision ID: 0016_worship_portrait_gray
Revises: 0015_worship_vis_clan_only
Create Date: 2026-11-16

Chi THEM mot cot boolean NOT NULL DEFAULT false (phong cu giu nguyen anh mau). Khong xoa / doi du lieu.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0016_worship_portrait_gray"
down_revision: Union[str, Sequence[str], None] = "0015_worship_vis_clan_only"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE worship_spaces ADD COLUMN IF NOT EXISTS portrait_grayscale BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE worship_spaces DROP COLUMN IF EXISTS portrait_grayscale")
