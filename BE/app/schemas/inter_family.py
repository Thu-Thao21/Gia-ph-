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


# ==============================================================================
# Marriage Invitation & Verification Schemas (Lời mời kết hôn & xác minh liên họ)
# ==============================================================================


class MarriageInvitationCreate(BaseModel):
    target_person_id: uuid.UUID = Field(description="ID hồ sơ Person của người phối ngẫu bên dòng họ đối tác")
    notes: Optional[str] = Field(default=None, description="Lời nhắn / Ghi chú gửi kèm lời mời kết hôn")


class MarriageInvitationRespond(BaseModel):
    action: str = Field(description="'ACCEPT' để chấp nhận, 'REJECT' để từ chối")
    notes: Optional[str] = Field(default=None, description="Lý do / phản hồi của người nhận lời mời")


class MarriageInvitationResponse(BaseModel):
    id: uuid.UUID
    link_id: uuid.UUID
    sender_user_id: Optional[uuid.UUID] = None
    sender_name: Optional[str] = None
    sender_person_id: uuid.UUID
    sender_clan_id: uuid.UUID
    sender_clan_name: Optional[str] = None
    target_person_id: uuid.UUID
    target_name: Optional[str] = None
    target_clan_id: uuid.UUID
    target_clan_name: Optional[str] = None
    target_user_id: Optional[uuid.UUID] = None
    relationship_type: str = "SPOUSE"
    status: str  # AWAITING_SPOUSE_CONFIRMATION, PENDING (Awaiting Admin Verification), VERIFIED, REJECTED, REVOKED
    notes: Optional[str] = None
    review_notes: Optional[str] = None
    can_respond: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==============================================================================
# Lineage Access Grant & Request Schemas (Phê duyệt quyền xem cây 4 đời liên họ)
# ==============================================================================


class LineageAccessRequestCreate(BaseModel):
    owner_clan_id: Optional[uuid.UUID] = Field(default=None, description="ID dòng họ sở hữu dữ liệu gia phả được chia sẻ (mặc định là dòng họ của người gửi)")
    anchor_person_id: uuid.UUID = Field(description="ID Person của người phối ngẫu làm tâm 4 đời")
    reason: Optional[str] = Field(default=None, description="Lý do gửi Trưởng tộc xin cấp quyền xem gia phả")


class LineageAccessReviewRequest(BaseModel):
    action: str = Field(description="'APPROVE' hoặc 'REJECT'")
    rejection_reason: Optional[str] = Field(default=None, description="Lý do từ chối (bắt buộc nếu REJECT)")


class LineageAccessRevokeRequest(BaseModel):
    revocation_reason: Optional[str] = Field(default=None, description="Lý do thu hồi quyền xem gia phả")


class LineageAccessRequestResponse(BaseModel):
    id: uuid.UUID
    owner_clan_id: uuid.UUID
    owner_clan_name: Optional[str] = None
    requester_user_id: uuid.UUID
    requester_name: Optional[str] = None
    anchor_person_id: uuid.UUID
    anchor_person_name: Optional[str] = None
    grantee_user_id: uuid.UUID
    grantee_name: Optional[str] = None
    scope_type: str = "FOUR_GENERATIONS"
    status: str  # PENDING, APPROVED, REJECTED
    reason: Optional[str] = None
    reviewed_by: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LineageAccessGrantResponse(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    owner_clan_id: uuid.UUID
    owner_clan_name: Optional[str] = None
    anchor_person_id: uuid.UUID
    anchor_person_name: Optional[str] = None
    grantee_user_id: uuid.UUID
    grantee_name: Optional[str] = None
    scope_type: str = "FOUR_GENERATIONS"
    permission: str = "VIEW_ONLY"
    status: str  # ACTIVE, REVOKED, EXPIRED
    approved_by: uuid.UUID
    approved_at: datetime
    expires_at: Optional[datetime] = None
    revoked_by: Optional[uuid.UUID] = None
    revoked_at: Optional[datetime] = None
    revocation_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

