"""MFGMS-AI - Module View (MVC)
Data Transfer Objects & Validation Schemas.

Modules:
- C01 / M01: Auth & Access Schemas (auth, users, errors)
- C02 / M02: Family Management Schemas (business, clan_join)
- C03 / M03: Genealogy Schemas (genealogy)
- C04 / M02-M03: Inter-Family Schemas (inter_family)
- C05 / M04: Activity & Fund Schemas (activity_fund)
- C06 / M05: Worship Space Schemas (worship_space)
- C07 / M06: Archive & Media Schemas (archive_media)
- C08 / M07: AI Assistant Schemas (ai)
"""

from app.schemas.common import Page, PageParams
from app.schemas.errors import ERROR_HTTP_STATUS, ErrorBody, ErrorCode, ErrorResponse
from app.schemas.auth import (
    LoginRequest,
    SessionCreateResponse,
    SessionUser,
    MeResponse,
    PasswordResetRequest,
    PasswordResetConfirmRequest,
    ChangePasswordRequest,
)
from app.schemas.users import (
    AdminUserSummary,
    AdminUserDetail,
    UserStatusUpdateRequest,
    UserStatusUpdateResponse,
    ClanUserItem,
    FamilyAdminAssignRequest,
    FamilyAdminPermissionsResponse,
)
from app.schemas.business import (
    BusinessRegistrationCreateRequest,
    BusinessRegistrationCreateResponse,
    ClanDetailResponse,
)
from app.schemas.clan_join import (
    ClanJoinRequestCreate,
    ClanJoinRequestResponse,
)
from app.schemas.inter_family import (
    InterClanRequestCreate,
    InterClanRequestResponse,
    InterClanLinkResponse,
    InterClanSharedPolicyUpdate,
)
from app.schemas.activity_fund import (
    ActivityCreate,
    ActivityResponse,
    ActivityUpdate,
    DonationCreate,
    DonationResponse,
    FundCreate,
    FundResponse,
    NotificationMarkReadRequest,
    NotificationResponse,
)
from app.schemas.worship_space import (
    ClanLocationCreate,
    ClanLocationResponse,
    ClanLocationUpdate,
    LocationProposalCreate,
    LocationProposalResponse,
    LocationProposalReviewRequest,
    PersonBurialCreate,
    PersonBurialResponse,
    PersonBurialUpdate,
)
from app.schemas.archive_media import (
    ArchiveMediaUploadResponse,
    ClanDocumentCreate,
    ClanDocumentResponse,
    ClanDocumentUpdate,
)
from app.schemas.ai import (
    AIBiographySummarizeRequest,
    AIBiographySummarizeResponse,
    AIChatRequest,
    AIChatResponse,
    AIDataQualityReportRequest,
    AIDataQualityReportResponse,
    AIKinshipExplainRequest,
    AIKinshipExplainResponse,
    AITestConnectionRequest,
    AITestConnectionResponse,
    ClanAISettingResponse,
    ClanAISettingUpdate,
    MemberAIConsentsResponse,
    MemberAIConsentsUpdate,
)

__all__ = [
    # Common & Errors
    "Page",
    "PageParams",
    "ERROR_HTTP_STATUS",
    "ErrorBody",
    "ErrorCode",
    "ErrorResponse",
    # C01 / M01: Auth & Access
    "LoginRequest",
    "SessionCreateResponse",
    "SessionUser",
    "MeResponse",
    "PasswordResetRequest",
    "PasswordResetConfirmRequest",
    "ChangePasswordRequest",
    "AdminUserSummary",
    "AdminUserDetail",
    "UserStatusUpdateRequest",
    "UserStatusUpdateResponse",
    "ClanUserItem",
    "FamilyAdminAssignRequest",
    "FamilyAdminPermissionsResponse",
    # C02 / M02: Family Management
    "BusinessRegistrationCreateRequest",
    "BusinessRegistrationCreateResponse",
    "ClanDetailResponse",
    "ClanJoinRequestCreate",
    "ClanJoinRequestResponse",
    # C04: Inter-Family
    "InterClanRequestCreate",
    "InterClanRequestResponse",
    "InterClanLinkResponse",
    "InterClanSharedPolicyUpdate",
    # C05 / M04: Activity & Fund
    "ActivityCreate",
    "ActivityResponse",
    "ActivityUpdate",
    "DonationCreate",
    "DonationResponse",
    "FundCreate",
    "FundResponse",
    "NotificationMarkReadRequest",
    "NotificationResponse",
    # C06 / M05: Worship Space
    "ClanLocationCreate",
    "ClanLocationResponse",
    "ClanLocationUpdate",
    "LocationProposalCreate",
    "LocationProposalResponse",
    "LocationProposalReviewRequest",
    "PersonBurialCreate",
    "PersonBurialResponse",
    "PersonBurialUpdate",
    # C07 / M06: Archive & Media
    "ArchiveMediaUploadResponse",
    "ClanDocumentCreate",
    "ClanDocumentResponse",
    "ClanDocumentUpdate",
    # C08 / M07: AI Assistant
    "AIChatRequest",
    "AIChatResponse",
    "AIKinshipExplainRequest",
    "AIKinshipExplainResponse",
    "AIBiographySummarizeRequest",
    "AIBiographySummarizeResponse",
    "AIDataQualityReportRequest",
    "AIDataQualityReportResponse",
    "AITestConnectionRequest",
    "AITestConnectionResponse",
    "ClanAISettingResponse",
    "ClanAISettingUpdate",
    "MemberAIConsentsResponse",
    "MemberAIConsentsUpdate",
]
