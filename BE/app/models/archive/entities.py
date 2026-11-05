"""Archive & Media Domain Models (M06).

Defines entities for documents, historical records, media assets, categories, and archive metadata.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import Base


class ClanDocument(Base):
    """Tài liệu lịch sử, văn bia, gia huấn và tư liệu dòng họ."""

    __tablename__ = "clan_documents"

    id = Column("document_id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clan_id = Column(UUID(as_uuid=True), ForeignKey("clans.clan_id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False, default="GENERAL")  # HISTORY, RITUAL, GENEALOGY, MEDIA
    file_url = Column(String(512), nullable=True)
    file_type = Column(String(50), nullable=True)
    uploaded_by = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


__all__ = ["ClanDocument"]

