"""worship hall: tiers, tablets, daily incense / blessing offerings and streaks

Revision ID: 0014_worship_hall
Revises: 0013_funds_and_donations
Create Date: 2026-11-11

Chi THEM: khong DROP bang cu, khong doi ten, khong xoa du lieu.
worship_spaces / worship_persons co the da ton tai (initial_schema.sql) hoac chua: CREATE TABLE IF NOT EXISTS
roi ADD COLUMN IF NOT EXISTS, nen chay duoc o ca hai truong hop.

Hai chi muc UNIQUE tren du lieu cu (uq_worship_spaces_clan, uq_worship_persons_space_person) chi duoc tao khi
du lieu hien co KHONG vi pham; neu vi pham thi migration chi RAISE NOTICE va bo qua (khong lam hong migration).
Khi do dich vu van an toan nho khoa advisory trong ensure_hall va kiem tra trung truoc khi them bai vi.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014_worship_hall"
down_revision: Union[str, Sequence[str], None] = "0013_funds_and_donations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # a) Bang goc (giu nguyen neu da ton tai)
    op.execute("""
    CREATE TABLE IF NOT EXISTS worship_spaces (
        space_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        visibility VARCHAR(30) NOT NULL DEFAULT 'CLAN_ONLY',
        created_by UUID NOT NULL REFERENCES users(user_id)
    )
    """)
    op.execute("""
    CREATE TABLE IF NOT EXISTS worship_persons (
        worship_person_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        space_id UUID NOT NULL REFERENCES worship_spaces(space_id) ON DELETE CASCADE,
        person_id UUID NOT NULL REFERENCES persons(person_id) ON DELETE CASCADE,
        altar_position INTEGER
    )
    """)

    # b) Cot moi cua worship_spaces
    op.execute("ALTER TABLE worship_spaces ALTER COLUMN space_id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE worship_spaces ADD COLUMN IF NOT EXISTS hall_type VARCHAR(20) NOT NULL DEFAULT 'CLAN'")
    op.execute("""
    ALTER TABLE worship_spaces
        ADD COLUMN IF NOT EXISTS branch_id UUID NULL REFERENCES branches(branch_id) ON DELETE SET NULL
    """)
    op.execute("ALTER TABLE worship_spaces ADD COLUMN IF NOT EXISTS blessings_enabled BOOLEAN NOT NULL DEFAULT true")
    op.execute("ALTER TABLE worship_spaces ADD COLUMN IF NOT EXISTS cover_image_path TEXT NULL")
    op.execute("ALTER TABLE worship_spaces ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    op.execute("ALTER TABLE worship_spaces ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()")

    # c) Bang tang (tao TRUOC khi them cot tier_id)
    op.execute("""
    CREATE TABLE IF NOT EXISTS worship_tiers (
        tier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        space_id UUID NOT NULL REFERENCES worship_spaces(space_id) ON DELETE CASCADE,
        tier_no SMALLINT NOT NULL CHECK (tier_no BETWEEN 1 AND 6),
        title VARCHAR(120) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_worship_tiers_space_tier_no UNIQUE (space_id, tier_no) DEFERRABLE INITIALLY IMMEDIATE
    )
    """)

    # b) Cot moi cua worship_persons
    op.execute("ALTER TABLE worship_persons ALTER COLUMN worship_person_id SET DEFAULT gen_random_uuid()")
    op.execute("ALTER TABLE worship_persons ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE worship_persons ADD COLUMN IF NOT EXISTS portrait_image_path TEXT NULL")
    op.execute("ALTER TABLE worship_persons ADD COLUMN IF NOT EXISTS note TEXT NULL")
    op.execute("ALTER TABLE worship_persons ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true")
    op.execute("""
    ALTER TABLE worship_persons
        ADD COLUMN IF NOT EXISTS added_by UUID NULL REFERENCES users(user_id) ON DELETE SET NULL
    """)
    op.execute("ALTER TABLE worship_persons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    op.execute("""
    ALTER TABLE worship_persons
        ADD COLUMN IF NOT EXISTS tier_id UUID NULL REFERENCES worship_tiers(tier_id) ON DELETE SET NULL
    """)

    # b) Chi muc. Hai chi muc UNIQUE chi tao khi du lieu cu khong vi pham.
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM worship_persons GROUP BY space_id, person_id HAVING count(*) > 1
        ) THEN
            RAISE NOTICE 'worship_persons co (space_id, person_id) trung: bo qua uq_worship_persons_space_person';
        ELSE
            CREATE UNIQUE INDEX IF NOT EXISTS uq_worship_persons_space_person
                ON worship_persons (space_id, person_id);
        END IF;
    END
    $$
    """)
    op.execute("""
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM worship_spaces WHERE hall_type = 'CLAN' GROUP BY clan_id HAVING count(*) > 1
        ) THEN
            RAISE NOTICE 'worship_spaces co nhieu phong CLAN cho mot dong ho: bo qua uq_worship_spaces_clan';
        ELSE
            CREATE UNIQUE INDEX IF NOT EXISTS uq_worship_spaces_clan
                ON worship_spaces (clan_id) WHERE hall_type = 'CLAN';
        END IF;
    END
    $$
    """)
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_worship_persons_space_tier_order
        ON worship_persons (space_id, tier_id, display_order)
    """)

    # d) Moi thanh vien: 1 lan thap huong / 1 loi vieng moi ngay (ngay gio Viet Nam), chan o muc DB
    op.execute("""
    CREATE TABLE IF NOT EXISTS worship_daily_offerings (
        offering_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        space_id UUID NOT NULL REFERENCES worship_spaces(space_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        offering_type VARCHAR(20) NOT NULL CHECK (offering_type IN ('INCENSE', 'BLESSING')),
        offer_date DATE NOT NULL,
        content TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'HIDDEN')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_worship_daily_offering UNIQUE (space_id, user_id, offering_type, offer_date)
    )
    """)
    op.execute("""
    CREATE INDEX IF NOT EXISTS idx_worship_offerings_space_type_time
        ON worship_daily_offerings (space_id, offering_type, created_at DESC)
    """)

    # e) Chuoi ngay rieng cho huong va loi vieng
    op.execute("""
    CREATE TABLE IF NOT EXISTS worship_streaks (
        space_id UUID NOT NULL REFERENCES worship_spaces(space_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        offering_type VARCHAR(20) NOT NULL CHECK (offering_type IN ('INCENSE', 'BLESSING')),
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        total_count INTEGER NOT NULL DEFAULT 0,
        last_offer_date DATE NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (space_id, user_id, offering_type)
    )
    """)


def downgrade() -> None:
    # Chi go nhung gi 0014 them. KHONG drop worship_spaces / worship_persons.
    op.execute("DROP TABLE IF EXISTS worship_daily_offerings")
    op.execute("DROP TABLE IF EXISTS worship_streaks")

    op.execute("DROP INDEX IF EXISTS idx_worship_persons_space_tier_order")
    op.execute("DROP INDEX IF EXISTS uq_worship_persons_space_person")
    op.execute("DROP INDEX IF EXISTS uq_worship_spaces_clan")

    # tier_id tro toi worship_tiers nen phai go cot truoc khi drop bang
    op.execute("ALTER TABLE worship_persons DROP COLUMN IF EXISTS tier_id")
    op.execute("ALTER TABLE worship_persons DROP COLUMN IF EXISTS created_at")
    op.execute("ALTER TABLE worship_persons DROP COLUMN IF EXISTS added_by")
    op.execute("ALTER TABLE worship_persons DROP COLUMN IF EXISTS is_visible")
    op.execute("ALTER TABLE worship_persons DROP COLUMN IF EXISTS note")
    op.execute("ALTER TABLE worship_persons DROP COLUMN IF EXISTS portrait_image_path")
    op.execute("ALTER TABLE worship_persons DROP COLUMN IF EXISTS display_order")

    op.execute("DROP TABLE IF EXISTS worship_tiers")

    op.execute("ALTER TABLE worship_spaces DROP COLUMN IF EXISTS updated_at")
    op.execute("ALTER TABLE worship_spaces DROP COLUMN IF EXISTS created_at")
    op.execute("ALTER TABLE worship_spaces DROP COLUMN IF EXISTS cover_image_path")
    op.execute("ALTER TABLE worship_spaces DROP COLUMN IF EXISTS blessings_enabled")
    op.execute("ALTER TABLE worship_spaces DROP COLUMN IF EXISTS branch_id")
    op.execute("ALTER TABLE worship_spaces DROP COLUMN IF EXISTS hall_type")
