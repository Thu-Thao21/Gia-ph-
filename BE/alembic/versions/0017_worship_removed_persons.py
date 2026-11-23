"""worship_removed_persons: dau vet Truong toc da GO bai vi (de tu dong lap bai vi khong them lai)

Revision ID: 0017_worship_removed_persons
Revises: 0016_worship_portrait_gray
Create Date: 2026-11-16

Chi THEM mot bang moi (khong dung bang cu, khong xoa / doi du lieu). Khi Truong toc go bai vi (DELETE tablet),
dich vu ghi mot dong (space_id, person_id) o day. Viec tu dong lap bai vi khi mot nguoi chuyen thanh "da mat"
bo qua nguoi co dong nay; them tay qua API van duoc va se xoa dong nay.
Bai vi da go TRUOC migration nay khong co dau vet.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0017_worship_removed_persons"
down_revision: Union[str, Sequence[str], None] = "0016_worship_portrait_gray"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS worship_removed_persons (
        space_id UUID NOT NULL REFERENCES worship_spaces(space_id) ON DELETE CASCADE,
        person_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
        removed_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
        removed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_worship_removed_persons PRIMARY KEY (space_id, person_id)
    )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS worship_removed_persons")
