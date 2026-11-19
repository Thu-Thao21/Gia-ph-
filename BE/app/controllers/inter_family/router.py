"""Inter-Family Networking & Data Sharing Router Aggregator.

Consolidates modular sub-routers:
- links_router: clan directory, connection requests, active links, policies
- trees_router: network diagram, shared family trees, hybrid 4-generation tree
- lineage_router: person mappings, dual-lineage (Noi - Ngoai), family network
- marriages_router: in-law marriages, marriage invitations, lineage access requests and grants
"""

from __future__ import annotations

from fastapi import APIRouter

from app.controllers.inter_family.links_router import router as links_router
from app.controllers.inter_family.trees_router import router as trees_router
from app.controllers.inter_family.lineage_router import router as lineage_router
from app.controllers.inter_family.marriages_router import router as marriages_router

# Re-export common types and helpers for backward compatibility
from app.controllers.inter_family.common import (
    Caller,
    get_caller,
    get_inter_family_repo,
    get_clan_admin_user_ids,
    MANAGE_PERMISSION,
    DEFAULT_ALLOWED_FIELDS,
    SCOPE_PRESETS,
    MASKED_NAME,
    MASKED_GENDER,
    MASKED_GENERATION,
    normalize_allowed_fields,
    format_date_safe,
    shared_tree_node,
    LinkRequestCreate,
    LinkRequestReview,
    LinkTerminateRequest,
    LinkRequestResponse,
    LinkResponse,
    PolicyUpdate,
    PolicyResponse,
    PersonMappingCreate,
    PersonMappingReview,
    PersonMappingRevoke,
    PersonMappingResponse,
    _not_found,
    _forbidden,
    _uuid,
    _visible_link,
)

# Re-export functions needed by tests and scripts
from app.controllers.inter_family.marriages_router import (
    create_marriage_invitation,
    respond_marriage_invitation,
    create_lineage_access_request,
    review_lineage_access_request,
    revoke_lineage_access_grant,
)
from app.controllers.inter_family.lineage_router import (
    review_person_mapping,
    revoke_person_mapping,
    serialize_person_mapping,
)

router = APIRouter(prefix="/networks", tags=["inter-family"])

router.include_router(links_router)
router.include_router(trees_router)
router.include_router(lineage_router)
router.include_router(marriages_router)
