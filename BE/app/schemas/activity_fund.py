"""Schemas for Module C05: Activity & Fund Controller & Model.
Theo chuẩn MFGMS-AI Module View (MVC).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class NotificationResponse(BaseModel):
    id: uuid.UUID
    recipient_user_id: uuid.UUID
    family_id: Optional[uuid.UUID] = None
    title: str
    body: str
    type: str = "INFO"
    link: Optional[str] = None
    is_read: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationMarkReadRequest(BaseModel):
    notification_ids: List[uuid.UUID]


# =============================================================================
# ACTIVITIES SCHEMAS (LEGACY COMPATIBILITY)
# =============================================================================

class ActivityBase(BaseModel):
    title: str
    description: Optional[str] = None
    activity_type: str = "COMMUNITY"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = None


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    activity_type: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = None


class ActivityResponse(ActivityBase):
    id: uuid.UUID
    family_id: uuid.UUID
    created_by: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# FUNDS SCHEMAS
# =============================================================================

class FundBase(BaseModel):
    name: str
    description: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: float = 0.0
    is_active: bool = True


class FundCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="Tên quỹ")
    purpose: str = Field(..., min_length=2, description="Mục đích thành lập quỹ")
    description: Optional[str] = None
    target_amount: Optional[float] = Field(default=None, ge=0, description="Số tiền mục tiêu (VNĐ)")
    visibility: Optional[str] = Field(default="PUBLIC", description="PUBLIC hoặc ADMIN_ONLY")
    status: Optional[str] = Field(default="ACTIVE", description="ACTIVE, CLOSED, hoặc PAUSED")


class FundUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    purpose: Optional[str] = Field(default=None, min_length=2)
    description: Optional[str] = None
    target_amount: Optional[float] = Field(default=None, ge=0)
    visibility: Optional[str] = None
    status: Optional[str] = None


class FundResponse(BaseModel):
    id: uuid.UUID
    clan_id: uuid.UUID
    name: str
    purpose: Optional[str] = None
    description: Optional[str] = None
    target_amount: Optional[float] = None
    current_amount: float = 0.0
    confirmed_donations_count: int = 0
    status: str = "ACTIVE"
    visibility: str = "PUBLIC"
    created_by: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# BANK ACCOUNT & QR SCHEMAS
# =============================================================================

class BankAccountUpdate(BaseModel):
    bank_name: str = Field(..., min_length=2, max_length=255, description="Tên ngân hàng")
    account_holder: str = Field(..., min_length=2, max_length=255, description="Chủ tài khoản")
    account_number: str = Field(..., min_length=3, max_length=100, description="Số tài khoản")
    qr_image_path: Optional[str] = Field(default=None, description="Đường dẫn ảnh QR ngân hàng")
    transfer_instruction: Optional[str] = Field(default=None, description="Ghi chú hướng dẫn chuyển khoản")
    is_active: bool = Field(default=True, description="Trạng thái hoạt động")


class BankAccountResponse(BaseModel):
    id: uuid.UUID
    clan_id: uuid.UUID
    bank_name: str
    account_holder: str
    account_number: str
    qr_image_path: Optional[str] = None
    transfer_instruction: Optional[str] = None
    is_active: bool = True
    created_by: uuid.UUID
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# DONATION SCHEMAS
# =============================================================================

class DonationCreate(BaseModel):
    fund_id: uuid.UUID
    amount: float = Field(gt=0, description="Số tiền đóng góp (VNĐ)")
    donor_name: Optional[str] = Field(default=None, description="Họ và tên người đóng góp")
    note: Optional[str] = Field(default=None, description="Lời nhắn / ghi chú đóng góp")


class DonationSubmitEvidence(BaseModel):
    bank_transaction_reference: Optional[str] = Field(default=None, description="Mã giao dịch ngân hàng")
    note: Optional[str] = Field(default=None, description="Ghi chú bổ sung")


class DonationVerifyRequest(BaseModel):
    note: Optional[str] = Field(default=None, description="Ghi chú xác nhận")


class DonationRejectRequest(BaseModel):
    reason: str = Field(..., min_length=2, description="Lý do từ chối giao dịch")


class DonationCancelRequest(BaseModel):
    reason: Optional[str] = Field(default=None, description="Lý do hủy yêu cầu")


class EvidenceItem(BaseModel):
    id: uuid.UUID
    image_path: str
    file_name: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DonationResponse(BaseModel):
    id: uuid.UUID
    clan_id: uuid.UUID
    fund_id: uuid.UUID
    fund_name: Optional[str] = None
    user_id: uuid.UUID
    donor_name: str
    donation_code: str
    amount: float
    status: str
    bank_account_snapshot: Optional[Dict[str, Any]] = None
    bank_transaction_reference: Optional[str] = None
    note: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    submitted_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    verified_by: Optional[uuid.UUID] = None
    verifier_name: Optional[str] = None
    evidence_items: List[EvidenceItem] = []

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# SUMMARY & STATS SCHEMAS
# =============================================================================

class FundSummaryResponse(BaseModel):
    total_funds_count: int = 0
    total_target_amount: float = 0.0
    total_collected_amount: float = 0.0
    pending_donations_count: int = 0
    confirmed_donations_count: int = 0
    awaiting_verification_count: int = 0
