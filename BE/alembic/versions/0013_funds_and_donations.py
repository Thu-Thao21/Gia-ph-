"""add funds enhancements, clan_bank_accounts, donations, donation_evidence, fund_audit_logs

Revision ID: 0013_funds_and_donations
Revises: 0012_clan_ai_settings
Create Date: 2026-11-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0013_funds_and_donations"
down_revision: Union[str, Sequence[str], None] = "0012_clan_ai_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Bổ sung các cột purpose, target_amount, updated_at vào bảng funds nếu chưa có
    op.execute("""
    ALTER TABLE funds ADD COLUMN IF NOT EXISTS purpose TEXT NULL;
    ALTER TABLE funds ADD COLUMN IF NOT EXISTS target_amount NUMERIC(18, 2) NULL;
    ALTER TABLE funds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    CREATE INDEX IF NOT EXISTS idx_funds_clan_id ON funds(clan_id);
    """)

    # 2. Bảng tài khoản ngân hàng và QR nhận đóng góp của từng dòng họ
    op.execute("""
    CREATE TABLE IF NOT EXISTS clan_bank_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
        bank_name VARCHAR(255) NOT NULL,
        account_holder VARCHAR(255) NOT NULL,
        account_number VARCHAR(100) NOT NULL,
        qr_image_path TEXT NULL,
        transfer_instruction TEXT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID NOT NULL REFERENCES users(user_id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_clan_bank_accounts_clan_id ON clan_bank_accounts(clan_id);
    """)

    # 3. Bảng yêu cầu đóng góp quỹ của thành viên
    op.execute("""
    CREATE TABLE IF NOT EXISTS donations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
        fund_id UUID NOT NULL REFERENCES funds(fund_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        donor_name VARCHAR(255) NOT NULL,
        donation_code VARCHAR(50) NOT NULL,
        amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        bank_account_snapshot JSONB NULL,
        bank_transaction_reference VARCHAR(255) NULL,
        note TEXT NULL,
        rejection_reason TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        submitted_at TIMESTAMPTZ NULL,
        verified_at TIMESTAMPTZ NULL,
        verified_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_donations_clan_id ON donations(clan_id);
    CREATE INDEX IF NOT EXISTS idx_donations_fund_id ON donations(fund_id);
    CREATE INDEX IF NOT EXISTS idx_donations_user_id ON donations(user_id);
    CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_donations_code ON donations(donation_code);
    """)

    # 4. Bảng ảnh minh chứng chuyển khoản của thành viên
    op.execute("""
    CREATE TABLE IF NOT EXISTS donation_evidence (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        donation_id UUID NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
        image_path TEXT NOT NULL,
        file_name VARCHAR(255) NULL,
        mime_type VARCHAR(100) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_donation_evidence_donation_id ON donation_evidence(donation_id);
    """)

    # 5. Bảng nhật ký audit tài chính và thao tác quỹ
    op.execute("""
    CREATE TABLE IF NOT EXISTS fund_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clan_id UUID NOT NULL REFERENCES clans(clan_id) ON DELETE CASCADE,
        actor_id UUID NOT NULL REFERENCES users(user_id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID NOT NULL,
        old_value JSONB NULL,
        new_value JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_fund_audit_logs_clan_id ON fund_audit_logs(clan_id);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS donation_evidence CASCADE;")
    op.execute("DROP TABLE IF EXISTS donations CASCADE;")
    op.execute("DROP TABLE IF EXISTS clan_bank_accounts CASCADE;")
    op.execute("DROP TABLE IF EXISTS fund_audit_logs CASCADE;")
    op.execute("ALTER TABLE funds DROP COLUMN IF EXISTS purpose;")
    op.execute("ALTER TABLE funds DROP COLUMN IF EXISTS target_amount;")
    op.execute("ALTER TABLE funds DROP COLUMN IF EXISTS updated_at;")

