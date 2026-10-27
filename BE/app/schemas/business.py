"""Business registration / clan provisioning contracts (plan section 7, 8).

Never exposed: tracking_code_hash, attachment storage_key, raw ORM rows.
tracking_code (plain) appears only once, in BusinessRegistrationCreateResponse.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Annotated, Literal, Optional

import re

from pydantic import AfterValidator, Field, StringConstraints, model_validator

from app.schemas.auth import ClanStatus
from app.schemas.common import (
    Email,
    MultilineText,
    PageParams,
    Phone,
    RequestModel,
    ResponseModel,
    SearchText,
    SecretToken,
    Str255,
    UtcDatetime,
)

RegistrationStatus = Literal[
    "DRAFT", "PENDING", "APPROVED", "NEED_SUPPLEMENT", "REJECTED", "CANCELLED"
]
ReviewDecision = Literal["APPROVED", "REJECTED"]
SubscriptionStatus = Literal["PENDING", "ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"]
# No DB table yet: provisioning jobs need a migration (plan section 7).
ProvisioningJobStatus = Literal["PENDING", "RUNNING", "SUCCEEDED", "FAILED_RETRYABLE", "FAILED"]
# ----- Mốc M5c: the public registration form, checked here as strictly as (or more than) the FE -----
# Every type below runs after Str255's cleaning (no control characters, NFC, whitespace collapsed).

_PERSON_NAME = re.compile(r"^[^\W\d_]+(?:[ .'-][^\W\d_]+)*\.?$")
_CLAN_NAME = re.compile(r"^[^\W_]+(?: [^\W_]+)*$")
_ORIGIN = re.compile(r"^[\w ,./()'-]+$")
_VN_MOBILE = re.compile(r"^0(?:3|5|7|8|9)\d{8}$")


def _person_name(value: str) -> str:
    if not 2 <= len(value) <= 100 or not _PERSON_NAME.match(value):
        raise ValueError("letters, spaces and . ' - only, 2 to 100 characters")
    return value


def _gmail(value: str) -> str:
    if not value.strip().lower().endswith("@gmail.com"):
        raise ValueError("a @gmail.com address is required")
    return value


def _vn_mobile(value: str) -> str:
    """A Vietnamese mobile number, stored as 0XXXXXXXXX. Accepts spaces, dots, dashes, brackets
    and the +84 / 84 prefix ("+84 912 345 678", "0912.345.678")."""
    digits = re.sub(r"[ .()\-]", "", value)
    if digits.startswith("+84"):
        digits = "0" + digits[3:]
    elif digits.startswith("84") and len(digits) == 11:
        digits = "0" + digits[2:]
    if not _VN_MOBILE.match(digits):
        raise ValueError("a Vietnamese mobile number (03/05/07/08/09 + 8 digits)")
    return digits


def _clan_name(value: str) -> str:
    if not 5 <= len(value) <= 255 or not _CLAN_NAME.match(value):
        raise ValueError("letters, digits and spaces only, 5 to 255 characters")
    return value


def _origin(value: str) -> str:
    if not 2 <= len(value) <= 255 or not _ORIGIN.match(value) or "_" in value:
        raise ValueError("letters, digits, spaces and , . / ( ) ' - only, 2 to 255 characters")
    return value


PersonName = Annotated[Str255, AfterValidator(_person_name)]
GmailAddress = Annotated[Email, AfterValidator(_gmail)]
VnMobile = Annotated[Str255, AfterValidator(_vn_mobile)]
ClanName = Annotated[Str255, AfterValidator(_clan_name)]
OriginPlace = Annotated[Str255, AfterValidator(_origin)]

ClanCode = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=3, max_length=50, pattern=r"^[A-Z0-9_-]+$"),
]


# ----- GET /service-plans (Guest) -----


class PlanFeaturePublic(ResponseModel):
    feature_code: str
    enabled: bool
    limit_value: Optional[Decimal] = None


class ServicePlanResponse(ResponseModel):
    plan_id: uuid.UUID
    code: str
    name: str
    description: Optional[str] = None
    price: Decimal = Field(description="Serialized as a decimal string, e.g. \"199000.00\".")
    billing_period_months: int
    max_members: Optional[int] = None
    max_family_admins: Optional[int] = None
    storage_mb: Optional[int] = None
    features: list[PlanFeaturePublic] = Field(default_factory=list)


# ----- POST /business-registrations (Guest) -----


class BusinessRegistrationCreateRequest(RequestModel):
    """Mốc M5c: as strict as the wizard (BE is where it is enforced): every field the wizard
    requires is required here, a person's name, a Gmail, a Vietnamese mobile, a clan name of
    letters / digits / spaces, an origin place."""

    representative_name: PersonName
    representative_email: GmailAddress
    representative_phone: VnMobile
    clan_name: ClanName
    origin_place: OriginPlace
    requested_plan_id: uuid.UUID
    # Mốc M5-1: the one-time token of POST /business-registrations/verify-otp for representative_email.
    verification_token: Optional[SecretToken] = None


class BusinessRegistrationCreateResponse(ResponseModel):
    """201. tracking_code is shown once; the server stores only its hash."""

    registration_id: uuid.UUID
    tracking_code: str
    status: RegistrationStatus
    created_at: UtcDatetime


# ----- POST /business-registrations/track (Guest) -----


class BusinessRegistrationTrackRequest(RequestModel):
    tracking_code: SecretToken


class BusinessRegistrationTrackResponse(ResponseModel):
    clan_name: str
    status: RegistrationStatus
    public_reason: Optional[str] = Field(
        default=None, description="Only the reason allowed to be published (e.g. rejection)."
    )
    submitted_at: UtcDatetime
    updated_at: UtcDatetime


# ----- GET /admin/business-registrations[/{id}] (SA) -----


class BusinessRegistrationListQuery(PageParams):
    status: Optional[RegistrationStatus] = None
    q: Optional[SearchText] = Field(
        default=None,
        description=(
            "Case-insensitive substring of the clan name, the representative name or the "
            "representative e-mail (2 to 100 characters, control characters are rejected)."
        ),
    )
    created_from: Optional[UtcDatetime] = Field(
        default=None, description="Inclusive lower bound of created_at (needs a time zone)."
    )
    created_to: Optional[UtcDatetime] = Field(
        default=None, description="Exclusive upper bound of created_at (needs a time zone)."
    )


class BusinessRegistrationSummary(ResponseModel):
    """One row of the SA list. It deliberately has NO e-mail, phone, place of origin, reason,
    reviewer, history or attachments: those are in the detail only."""

    registration_id: uuid.UUID
    clan_name: str
    representative_name: str
    requested_plan_id: uuid.UUID
    requested_plan_code: str
    status: RegistrationStatus
    created_at: UtcDatetime
    reviewed_at: Optional[UtcDatetime] = None


class RegistrationStatusHistoryItem(ResponseModel):
    from_status: Optional[RegistrationStatus] = None
    to_status: RegistrationStatus
    changed_by: Optional[uuid.UUID] = None
    reason: Optional[str] = None
    changed_at: UtcDatetime


class RegistrationAttachmentItem(ResponseModel):
    """storage_key is intentionally omitted; downloads go through a signed URL later."""

    attachment_id: uuid.UUID
    file_name: str
    mime_type: Optional[str] = None
    uploaded_at: UtcDatetime


class SimilarClanItem(ResponseModel):
    """A soft warning for the System Admin (Mốc M5c): a clan or registration that looks like this
    one. Never blocking. No representative's personal data."""

    kind: Literal["clan", "registration"]
    registration_id: Optional[uuid.UUID] = None
    clan_id: Optional[uuid.UUID] = None
    clan_code: Optional[str] = None
    clan_name: str
    origin_place: Optional[str] = None
    status: str
    reason: Literal["same_clan_key", "same_name_other_origin", "similar_name_shared_origin"]
    message: str


class BusinessRegistrationDetail(BusinessRegistrationSummary):
    """The SA sees the applicant's personal data here (e-mail, phone)."""

    representative_email: str
    representative_phone: Optional[str] = None
    origin_place: Optional[str] = None
    reviewed_by: Optional[uuid.UUID] = None
    rejection_reason: Optional[str] = None
    updated_at: UtcDatetime
    clan_id: Optional[uuid.UUID] = Field(
        default=None, description="Set once the Business (clan) has been created."
    )
    status_history: list[RegistrationStatusHistoryItem] = Field(default_factory=list)
    attachments: list[RegistrationAttachmentItem] = Field(default_factory=list)
    similar_clans: list[SimilarClanItem] = Field(
        default_factory=list, description="Soft warnings (Mốc M5c): look-alike clans / registrations."
    )


# ----- POST /admin/business-registrations/{id}/review (SA) -----


class RegistrationReviewRequest(RequestModel):
    decision: ReviewDecision
    reason: Optional[MultilineText] = Field(
        default=None,
        description=(
            "Required when decision is REJECTED. WHEN REJECTED THE APPLICANT SEES THIS TEXT "
            "(POST /business-registrations/track, public_reason). When APPROVED it is an optional "
            "internal note kept in the status history, never shown to the applicant."
        ),
    )

    @model_validator(mode="after")
    def _reason_required_on_reject(self) -> "RegistrationReviewRequest":
        if self.decision == "REJECTED" and not self.reason:
            raise ValueError("reason is required when decision is REJECTED")
        return self


class RegistrationReviewResponse(ResponseModel):
    registration_id: uuid.UUID
    status: RegistrationStatus
    reviewed_by: uuid.UUID
    reviewed_at: UtcDatetime
    reason_visible_to_applicant: bool = Field(
        description=(
            "True only when the registration was REJECTED: the reason is then shown to the "
            "applicant on tracking. False for an approval (its note is internal)."
        )
    )


# ----- POST /admin/business-registrations/{id}/business (SA, Idempotency-Key) -----


class BusinessCreateRequest(RequestModel):
    clan_code: Optional[ClanCode] = Field(
        default=None, description="Optional; the server generates one when omitted."
    )


class BusinessCreateResponse(ResponseModel):
    """201. Clan starts PENDING; no permission is granted from Guest payload."""

    clan_id: uuid.UUID
    clan_code: str
    clan_status: ClanStatus
    subscription_id: uuid.UUID
    plan_id: uuid.UUID
    subscription_status: SubscriptionStatus
    starts_at: UtcDatetime
    ends_at: UtcDatetime


# ----- POST /admin/clans/{id}/owner (SA, Idempotency-Key) -> 202 -----


class OwnerProvisionRequest(RequestModel):
    """All fields optional: defaults to the registration representative."""

    email: Optional[Email] = None
    display_name: Optional[Str255] = None
    phone: Optional[Phone] = None


class ProvisioningJobAccepted(ResponseModel):
    """RETIRED in E6a: POST /admin/clans/{id}/owner answers 201 OwnerProvisionResponse now."""

    job_id: uuid.UUID
    status: ProvisioningJobStatus


class OwnerProvisionResponse(ResponseModel):
    """201 of POST /admin/clans/{id}/owner and 200 of POST /admin/provisioning-jobs/{id}/retry.

    temporary_password is shown ONCE, in this response only, with Cache-Control: no-store. It is
    never stored, so a replay of the same Idempotency-Key answers with the same job but every field
    below `user_id` set to null. A retry that only cleans up (the job stays FAILED) answers with
    status FAILED and every field below `user_id` null: no password is made.
    """

    job_id: uuid.UUID
    status: ProvisioningJobStatus
    clan_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    owner_email: Optional[str] = None
    owner_display_name: Optional[str] = None
    temporary_password: Optional[str] = Field(
        default=None, repr=False, description="Shown once. Null on a replay."
    )
    temporary_password_expires_at: Optional[UtcDatetime] = None
    email_delivery_status: Optional[Literal["QUEUED", "SENT", "FAILED", "BOUNCED"]] = Field(
        default=None, description="Null while only the Noop sender exists: the SA passes the password on."
    )


class BusinessApproveAndProvisionResponse(ResponseModel):
    registration_id: uuid.UUID
    clan_id: uuid.UUID
    clan_name: str
    status: str
    clan_status: str
    owner_email: str
    owner_display_name: str
    temporary_password: Optional[str] = Field(
        default=None, repr=False, description="Mật khẩu tạm thời cho Trưởng tộc, hiển thị một lần."
    )
    temporary_password_expires_at: Optional[UtcDatetime] = None
    email_sent: bool
    email_delivery_status: Optional[str] = None
    message: str


# ----- POST /admin/clans/{id}/owner/temporary-password (SA) -> 200 -----


class OwnerPasswordResetResponse(ResponseModel):
    """200. The new temporary password is shown ONCE, in this response only (Cache-Control: no-store);
    it is never stored, logged or audited."""

    clan_id: uuid.UUID
    user_id: uuid.UUID
    owner_email: str
    owner_display_name: str
    temporary_password: str = Field(repr=False, description="Shown once.")
    temporary_password_expires_at: UtcDatetime
    email_delivery_status: Optional[Literal["QUEUED", "SENT", "FAILED", "BOUNCED"]] = Field(
        default=None, description="Null while only the Noop sender exists: the SA passes the password on."
    )


# ----- GET /admin/provisioning-jobs (SA) -----


class ProvisioningJobListQuery(PageParams):
    clan_id: Optional[uuid.UUID] = None
    status: Optional[ProvisioningJobStatus] = None


# ----- GET /admin/provisioning-jobs/{id} (SA) -----


class ProvisioningJobResponse(ResponseModel):
    """Never contains the temporary password or the Firebase UID secret material."""

    job_id: uuid.UUID
    job_type: Literal["OWNER_PROVISIONING"]
    clan_id: uuid.UUID
    status: ProvisioningJobStatus
    user_id: Optional[uuid.UUID] = None
    email_delivery_status: Optional[Literal["QUEUED", "SENT", "FAILED", "BOUNCED"]] = None
    attempt_count: int = Field(ge=0)
    needs_cleanup: bool = False
    error_code: Optional[str] = None
    created_at: UtcDatetime
    updated_at: UtcDatetime


# ----- POST /admin/clans/{id}/activate (SA) -> 200 -----


class ClanActivateResponse(ResponseModel):
    """200. The clan is ACTIVE and its subscription starts now (the SA's manual confirmation, D03)."""

    clan_id: uuid.UUID
    status: ClanStatus
    activated_at: UtcDatetime
    subscription_id: uuid.UUID
    subscription_status: SubscriptionStatus
    starts_at: UtcDatetime
    ends_at: UtcDatetime


# ----- GET /admin/clans/{id} (SA) -----


class ClanSubscriptionSummary(ResponseModel):
    subscription_id: uuid.UUID
    plan_id: uuid.UUID
    plan_code: Optional[str] = None
    status: SubscriptionStatus
    starts_at: UtcDatetime
    ends_at: UtcDatetime


class ClanOwnerJobSummary(ResponseModel):
    """The latest Owner provisioning job: its id and state only (the job itself is read at
    GET /admin/provisioning-jobs/{id})."""

    job_id: uuid.UUID
    status: ProvisioningJobStatus
    needs_cleanup: bool = False


class ClanDetailResponse(ResponseModel):
    """Never an e-mail, a name, a phone, a Firebase uid or a clan name: ids, codes, statuses, dates."""

    clan_id: uuid.UUID
    clan_code: str
    status: ClanStatus
    registration_id: Optional[uuid.UUID] = None
    created_at: UtcDatetime
    activated_at: Optional[UtcDatetime] = None
    subscription: Optional[ClanSubscriptionSummary] = None
    owner_user_id: Optional[uuid.UUID] = None
    last_owner_job: Optional[ClanOwnerJobSummary] = None
