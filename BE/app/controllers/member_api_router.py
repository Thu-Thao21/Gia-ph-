"""Member and Family API Router Aggregator.

Consolidates modular sub-routers:
- clan_profile_router: clan directory, profiles, branches
- members_router: members CRUD, query, relocation
- import_export_router: CSV/Excel data import & export
- locations_router: clan locations, burials & GPS navigation proposals
- announcements_router: clan news announcements & user notifications
"""

from __future__ import annotations

from fastapi import APIRouter

from app.controllers.member_management.clan_profile_router import router as clan_profile_router
from app.controllers.member_management.members_router import router as members_router
from app.controllers.member_management.import_export_router import (
    router as import_export_router,
    export_persons_csv,
)
from app.controllers.member_management.locations_router import router as locations_router
from app.controllers.member_management.announcements_router import router as announcements_router

# Re-export common helpers and models for backward compatibility
from app.controllers.member_management.common import (
    _family_uuid,
    _require,
    _require_branch_scope,
)
from app.controllers.member_management.clan_profile_router import (
    ClanProfileUpdate,
    BranchCreate,
)
from app.controllers.member_management.members_router import (
    MemberCreateRequest,
    MemberUpdateRequest,
    MemberRelocateRequest,
)
from app.controllers.member_management.locations_router import (
    ClanLocationCreate,
    ClanLocationUpdate,
    PersonBurialSave,
    LocationProposalCreate,
    LocationProposalReview,
)
from app.controllers.member_management.announcements_router import (
    ClanAnnouncementCreate,
)

router = APIRouter(tags=["members-families"])

router.include_router(clan_profile_router)
router.include_router(members_router)
router.include_router(import_export_router)
router.include_router(locations_router)
router.include_router(announcements_router)
