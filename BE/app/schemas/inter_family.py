"""Schemas for Module C04: Inter-Family Controller & Model.
Theo chuẩn MFGMS-AI Module View (MVC).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class InterClanRequestCreate(BaseModel):
    target_clan_id: uuid.UUID
    connection_type: str = "MATERNAL"  # MATERNAL, IN_LAW, PATERNAL
    source_person_id: Optional[uuid.UUID] = None
    target_person_id: Optional[uuid.UUID] = None
    message: Optional[str] = None


class InterClanRequestReview(BaseModel):
    action: str = Field(description="'APPROVE' or 'REJECT'")
    notes: Optional[str] = None


class InterClanRequestResponse(BaseModel):
    id: uuid.UUID
    source_clan_id: uuid.UUID
    target_clan_id: uuid.UUID
    requester_id: uuid.UUID
    source_person_id: Optional[uuid.UUID] = None
    target_person_id: Optional[uuid.UUID] = None
    connection_type: str
    status: str
    message: Optional[str] = None
    reviewed_by: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InterClanLinkResponse(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    clan_a_id: uuid.UUID
    clan_b_id: uuid.UUID
    connection_type: str
    status: str
    linked_at: datetime
    ended_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class InterClanSharedPolicyUpdate(BaseModel):
    data_scope: str = "ANCESTRAL_ONLY"  # ANCESTRAL_ONLY, FULL_TREE, PUBLIC_ONLY
    allowed_fields: Dict[str, bool] = Field(default_factory=dict)
    visibility: str = "MEMBERS_ONLY"
    can_export: bool = False
