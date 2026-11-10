"""Schemas for Module C07: Archive & Media Controller & Model.
Theo chuẩn MFGMS-AI Module View (MVC).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ClanDocumentBase(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "HISTORICAL"  # HISTORICAL, GENEALOGY_BOOK, PHOTO, CERTIFICATE, OTHER
    file_url: str
    file_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    is_public: bool = False
    access_level: str = "MEMBERS"  # PUBLIC, MEMBERS, CLAN_ADMIN, SYSTEM_ADMIN


class ClanDocumentCreate(ClanDocumentBase):
    pass


class ClanDocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_public: Optional[bool] = None
    access_level: Optional[str] = None


class ClanDocumentResponse(ClanDocumentBase):
    id: uuid.UUID
    family_id: uuid.UUID
    uploaded_by: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ArchiveMediaUploadResponse(BaseModel):
    file_id: uuid.UUID
    file_url: str
    file_name: str
    file_size_bytes: int
    content_type: str
    uploaded_at: datetime
