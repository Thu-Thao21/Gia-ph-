"""Cleanup 45 unused legacy tables from initial schema.

Revision ID: 0018_cleanup_legacy_tables
Revises: 0017_worship_removed_persons
Create Date: 2026-11-16

These 45 tables were created by the initial baseline schema (initial_schema.sql)
for planned/draft features that were never implemented in the ORM or have since
been superseded (e.g. legacy worship/fund tables replaced by dedicated modules).
All 45 tables contain 0 rows and zero active ORM dependencies.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0018_cleanup_legacy_tables"
down_revision: Union[str, Sequence[str], None] = "0017_worship_removed_persons"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES_TO_DROP = [
    # 1. AI legacy
    "ai_conversations",
    "ai_jobs",
    "ai_messages",
    "ai_suggestion_reviews",
    "ai_suggestions",
    # 2. Events & death anniversaries legacy
    "anniversary_follows",
    "death_anniversaries",
    "event_documents",
    "event_participants",
    "events",
    "scheduled_reminders",
    # 3. Old funds / transactions legacy (superseded by funds & donations)
    "contributions",
    "fund_categories",
    "fund_transaction_documents",
    "fund_transactions",
    "invoices",
    "payments",
    # 4. Old documents / archives legacy
    "document_access_policies",
    "document_categories",
    "documents",
    "person_documents",
    # 5. Old worship tables (superseded by worship_spaces, worship_tiers, etc.)
    "media_360_items",
    "memorial_messages",
    "three_d_items",
    "virtual_incense",
    "worship_artifacts",
    # 6. Person profile extensions legacy
    "person_aliases",
    "person_contacts",
    "person_merge_history",
    "person_professional_profiles",
    "relationship_evidence",
    "duplicate_person_suggestions",
    # 7. Maintenance / Jobs legacy
    "backup_jobs",
    "restore_jobs",
    "import_errors",
    "import_jobs",
    "export_jobs",
    # 8. Moderation / Requests legacy
    "change_requests",
    "request_reviews",
    "violation_reports",
    "public_contents",
    "clan_privacy_settings",
    "notification_preferences",
    "subscription_changes",
    "ownership_transfers",
]


def upgrade() -> None:
    # 1. Drop the legacy FK on clan_ownership_history if present
    op.execute(
        "ALTER TABLE clan_ownership_history DROP CONSTRAINT IF EXISTS clan_ownership_history_transfer_id_fkey CASCADE"
    )

    # 2. Drop all 45 unused tables
    for table_name in TABLES_TO_DROP:
        op.execute(f'DROP TABLE IF EXISTS "{table_name}" CASCADE')


def downgrade() -> None:
    pass

