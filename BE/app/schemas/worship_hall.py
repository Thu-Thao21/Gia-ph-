"""Schemas cho Phong tho 3D (ban tho, tang, bai vi, thap huong, Loi vieng).

JSON dung camelCase (alias), code Python dung snake_case. Loi vieng = BLESSING trong code/API.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --------------------------------------------------------------------------- responses
class StreakInfo(CamelModel):
    current: int = 0
    longest: int = 0
    total: int = 0
    last_date: Optional[str] = None  # ISO date (ngay VN)


class HallInfo(CamelModel):
    id: Optional[uuid.UUID] = None  # None: dong ho chua co phong (khung rong)
    title: str
    clan_name: str
    visibility: str
    blessings_enabled: bool = True
    cover_image_url: Optional[str] = None


class TabletItem(CamelModel):
    id: uuid.UUID
    person_id: uuid.UUID
    full_name: str
    generation: Optional[int] = None
    birth_year: Optional[int] = None
    death_year: Optional[int] = None
    birth_date: Optional[str] = None
    death_date: Optional[str] = None
    portrait_url: Optional[str] = None
    note: Optional[str] = None
    display_order: int = 0
    tier_id: Optional[uuid.UUID] = None
    is_visible: bool = True  # nguoi xem thuong luon thay True; chi Truong toc / Admin thay bai vi an (False)


class TierItem(CamelModel):
    tier_id: uuid.UUID
    tier_no: int
    title: str
    total: int = 0
    tablets: List[TabletItem] = []


class TodayInfo(CamelModel):
    incense_count: int = 0
    blessing_count: int = 0


class MeInfo(CamelModel):
    can_offer: bool = False  # duoc thap huong / viet Loi vieng (thanh vien dang hoat dong, Truong toc, System Admin)
    incense_done_today: bool = False
    blessing_done_today: bool = False
    incense_streak: StreakInfo = StreakInfo()
    blessing_streak: StreakInfo = StreakInfo()


class HallResponse(CamelModel):
    hall: HallInfo
    tiers: List[TierItem] = []
    today: TodayInfo = TodayInfo()
    me: Optional[MeInfo] = None
    can_manage: bool = False


class TierTabletsResponse(CamelModel):
    tier_id: uuid.UUID
    total: int
    offset: int
    limit: int
    tablets: List[TabletItem]


class TierBrief(CamelModel):
    tier_id: uuid.UUID
    tier_no: int
    title: str
    total: int = 0


class OfferResponse(CamelModel):
    offering_type: str
    offer_date: str
    streak: StreakInfo
    today_count: int


class BlessingItem(CamelModel):
    id: uuid.UUID
    content: str
    author_name: str
    created_at: datetime


class BlessingListResponse(CamelModel):
    items: List[BlessingItem]
    next_before: Optional[datetime] = None


class MyStreaksResponse(CamelModel):
    incense_done_today: bool = False
    blessing_done_today: bool = False
    incense_streak: StreakInfo = StreakInfo()
    blessing_streak: StreakInfo = StreakInfo()


class BulkSkipped(CamelModel):
    person_id: uuid.UUID
    reason: str  # ma: NOT_FOUND | NOT_DECEASED | ALREADY_EXISTS | LIMIT_REACHED
    message: str


class BulkAddResponse(CamelModel):
    added: List[TabletItem]
    skipped: List[BulkSkipped]


class CandidateItem(CamelModel):
    person_id: uuid.UUID
    full_name: str
    generation: Optional[int] = None
    birth_year: Optional[int] = None
    death_year: Optional[int] = None
    has_portrait: bool = False


class CandidateListResponse(CamelModel):
    items: List[CandidateItem]
    total: int
    offset: int
    limit: int


class MessageResponse(CamelModel):
    success: bool = True
    message: str = ""


# --------------------------------------------------------------------------- requests
class HallUpdate(CamelModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    visibility: Optional[Literal["PUBLIC", "CLAN_ONLY"]] = None
    blessings_enabled: Optional[bool] = None


class TabletCreate(CamelModel):
    person_id: uuid.UUID
    note: Optional[str] = Field(default=None, max_length=2000)
    tier_id: Optional[uuid.UUID] = None
    display_order: Optional[int] = Field(default=None, ge=0)


class TabletBulkCreate(CamelModel):
    person_ids: List[uuid.UUID] = Field(min_length=1, max_length=50)
    tier_id: Optional[uuid.UUID] = None


class TabletUpdate(CamelModel):
    note: Optional[str] = Field(default=None, max_length=2000)
    is_visible: Optional[bool] = None
    display_order: Optional[int] = Field(default=None, ge=0)
    tier_id: Optional[uuid.UUID] = None


class ReorderRequest(CamelModel):
    ordered_ids: List[uuid.UUID] = Field(min_length=1, max_length=300)


class BlessingCreate(CamelModel):
    # Do dai that su duoc kiem o moderate_blessing (300 ky tu, thong bao tieng Viet); 2000 chi la cau chan payload.
    content: str = Field(max_length=2000)


class TierCreate(CamelModel):
    title: str = Field(min_length=1, max_length=120)
    tier_no: Optional[int] = Field(default=None, ge=1, le=6)


class TierUpdate(CamelModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    tier_no: Optional[int] = Field(default=None, ge=1, le=6)
