"""Schemas for Module C06: Worship Space Controller & Model.
Theo chuẩn MFGMS-AI Module View (MVC).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ClanLocationBase(BaseModel):
    name: str
    location_type: str = "ANCESTRAL_HALL"  # ANCESTRAL_HALL, GRAVE, MEMORIAL, BRANCH_HOUSE
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    photo_url: Optional[str] = None
    is_public: bool = True


class ClanLocationCreate(ClanLocationBase):
    pass


class ClanLocationUpdate(BaseModel):
    name: Optional[str] = None
    location_type: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    photo_url: Optional[str] = None
    is_public: Optional[bool] = None


class ClanLocationResponse(ClanLocationBase):
    id: uuid.UUID
    family_id: uuid.UUID
    created_by: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PersonBurialBase(BaseModel):
    person_id: uuid.UUID
    location_id: Optional[uuid.UUID] = None
    cemetery_name: Optional[str] = None
    plot_number: Optional[str] = None
    burial_date: Optional[datetime] = None
    memorial_notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class PersonBurialCreate(PersonBurialBase):
    pass


class PersonBurialUpdate(BaseModel):
    location_id: Optional[uuid.UUID] = None
    cemetery_name: Optional[str] = None
    plot_number: Optional[str] = None
    burial_date: Optional[datetime] = None
    memorial_notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class PersonBurialResponse(PersonBurialBase):
    id: uuid.UUID
    family_id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LocationProposalCreate(BaseModel):
    name: str
    location_type: str = "GRAVE"
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    person_id: Optional[uuid.UUID] = None


class LocationProposalReviewRequest(BaseModel):
    action: str = Field(description="'APPROVE' or 'REJECT'")
    review_notes: Optional[str] = None


class LocationProposalResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    proposer_id: uuid.UUID
    name: str
    location_type: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: Optional[str] = None
    person_id: Optional[uuid.UUID] = None
    status: str = "PENDING"
    reviewed_by: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
