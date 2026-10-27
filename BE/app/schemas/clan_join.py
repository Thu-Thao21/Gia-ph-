from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import Field, field_validator

from app.schemas.common import RequestModel, ResponseModel, UtcDatetime


class ClanJoinRequestCreate(RequestModel):
    clan_id: uuid.UUID
    lineage_type: Literal["PATERNAL", "MATERNAL"]
    full_name: str = Field(min_length=2, max_length=255)
    birth_date: Optional[date] = None
    relative_name: str = Field(min_length=2, max_length=255)
    relative_relation: str = Field(min_length=2, max_length=100)
    relation_description: Optional[str] = Field(default=None, max_length=500)
    verification_notes: str = Field(min_length=5, max_length=3000)
    consent_given: bool = True

    @field_validator("full_name", "relative_name", "relative_relation", "verification_notes")
    @classmethod
    def _strip_strings(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Trường không được để trống hoặc chỉ chứa khoảng trắng.")
        return s

    @field_validator("consent_given")
    @classmethod
    def _require_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Bạn phải đồng ý gửi thông tin xác minh tới Quản trị viên dòng họ.")
        return v


class ClanJoinRequestSupplement(RequestModel):
    relative_name: Optional[str] = Field(default=None, max_length=255)
    relative_relation: Optional[str] = Field(default=None, max_length=100)
    relation_description: Optional[str] = Field(default=None, max_length=500)
    verification_notes: str = Field(min_length=5, max_length=3000)

    @field_validator("verification_notes")
    @classmethod
    def _strip_notes(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Nội dung bổ sung không được để trống.")
        return s


class ClanJoinReviewAction(RequestModel):
    action: Literal["APPROVE", "REJECT", "NEED_INFO"]
    review_note: Optional[str] = Field(default=None, max_length=2000)
    person_id: Optional[uuid.UUID] = None
    new_person: Optional[dict[str, Any]] = None

    @field_validator("review_note")
    @classmethod
    def _validate_note(cls, v: Optional[str], info) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                return None
        return v


class ClanJoinRequestResponse(ResponseModel):
    request_id: uuid.UUID
    user_id: uuid.UUID
    user_email: Optional[str] = None
    user_display_name: Optional[str] = None
    clan_id: uuid.UUID
    clan_name: str
    clan_code: str
    lineage_type: str
    full_name: str
    birth_date: Optional[date] = None
    relative_name: str
    relative_relation: str
    relation_description: Optional[str] = None
    verification_notes: str
    consent_given: bool
    status: str
    reviewer_id: Optional[uuid.UUID] = None
    reviewer_name: Optional[str] = None
    review_note: Optional[str] = None
    reviewed_at: Optional[UtcDatetime] = None
    linked_person_id: Optional[uuid.UUID] = None
    linked_person_name: Optional[str] = None
    history: list[dict[str, Any]] = Field(default_factory=list)
    created_at: UtcDatetime
    updated_at: UtcDatetime


class PublicClanSearchItem(ResponseModel):
    clan_id: uuid.UUID
    name: str
    code: str
    origin_place: Optional[str] = None
    description: Optional[str] = None
    member_count: int = 0
    is_joined: bool = False
    active_request_id: Optional[uuid.UUID] = None
    active_request_status: Optional[str] = None


class MyClansSummary(ResponseModel):
    joined_clans: list[dict[str, Any]]
    my_requests: list[ClanJoinRequestResponse]
