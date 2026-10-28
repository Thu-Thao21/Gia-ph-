"""User administration routes (api_contract.md section 4). Mounted under /api/v1.

Every route is guarded by require_action: restricted sessions are rejected, the actor's
role/membership/assignment are re-read from the DB, and the action table in
permissions.py is the only authorization source. Authorization runs before the body or
query is validated, so a caller without access never learns about validation details.
"""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.auth_access import user_admin_use_cases as use_cases
from app.controllers.auth_access.use_cases import ClientInfo
from app.core.middleware.request_id import get_request_id
from app.core.utils.openapi_responses import AUTHENTICATED, error_responses
from app.db.postgres import get_db
from app.dependencies.auth import Principal, get_user_access_repo
from app.dependencies.permissions import Action, clan_scope_from_path, get_family_repo, require_action
from app.models.family.repository import FamilyRepository
from app.models.user_access.repository import UserAccessRepository
from app.schemas.common import Page
from app.schemas.errors import ErrorCode
from app.schemas.users import (
    AdminUserDetail,
    AdminUserListQuery,
    AdminUserSummary,
    ClanUserItem,
    ClanUserListQuery,
    FamilyAdminAssignRequest,
    FamilyAdminAssignResponse,
    FamilyAdminPermissionsResponse,
    FamilyAdminPermissionsUpdateRequest,
    UserStatusUpdateRequest,
    UserStatusUpdateResponse,
)

router = APIRouter(tags=["user-admin"])
logger = logging.getLogger("mfg.admin")

ADMIN_STATS_KEYS = (
    "total_users", "active_users", "total_clans", "active_clans", "total_persons",
    "pending_registrations", "total_packages", "total_documents",
)
ADMIN_STATS_SQL = text(
    """
    SELECT
        u.total_users, u.active_users, c.total_clans, c.active_clans,
        (SELECT count(*) FROM persons) AS total_persons,
        (SELECT count(*) FROM business_registrations WHERE status = 'PENDING') AS pending_registrations,
        (SELECT count(*) FROM subscription_plans) AS total_packages,
        (SELECT count(*) FROM documents) AS total_documents
    FROM
        (SELECT count(*) AS total_users,
                count(*) FILTER (WHERE status = 'ACTIVE') AS active_users FROM users) AS u,
        (SELECT count(*) AS total_clans,
                count(*) FILTER (WHERE status = 'ACTIVE') AS active_clans FROM clans) AS c
    """
)


@router.get(
    "/admin/stats",
    response_model=dict,
    dependencies=[Depends(require_action(Action.USER_LIST))],
    responses=error_responses(*AUTHENTICATED, ErrorCode.FORBIDDEN),
)
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """All counters in ONE statement (N-12): each count was its own round trip to Neon (about
    0.23 s each from here), so 8 of them took 2-8 s. FILTER keeps one scan per table."""
    started = time.perf_counter()
    row = (await db.execute(ADMIN_STATS_SQL)).mappings().one()
    logger.info(
        "admin.stats timing db=%.0fms request_id=%s",
        (time.perf_counter() - started) * 1000,
        get_request_id(),
    )
    return {**{key: int(row[key] or 0) for key in ADMIN_STATS_KEYS}, "system_status": "100%"}


@router.get(
    "/admin/users",
    response_model=Page[AdminUserSummary],
    dependencies=[Depends(require_action(Action.USER_LIST))],
    responses=error_responses(*AUTHENTICATED, ErrorCode.FORBIDDEN, ErrorCode.VALIDATION_ERROR),
)
async def list_users(
    query: AdminUserListQuery = Depends(),
    users: UserAccessRepository = Depends(get_user_access_repo),
) -> Page[AdminUserSummary]:
    return await use_cases.list_users(users=users, query=query)


@router.get(
    "/admin/users/{user_id}",
    response_model=AdminUserDetail,
    dependencies=[Depends(require_action(Action.USER_READ))],
    responses=error_responses(
        *AUTHENTICATED, ErrorCode.FORBIDDEN, ErrorCode.NOT_FOUND, ErrorCode.VALIDATION_ERROR
    ),
)
async def get_user(
    user_id: uuid.UUID,
    users: UserAccessRepository = Depends(get_user_access_repo),
    family: FamilyRepository = Depends(get_family_repo),
) -> AdminUserDetail:
    return await use_cases.get_user_detail(users=users, family=family, user_id=user_id)


@router.patch(
    "/admin/users/{user_id}/status",
    response_model=UserStatusUpdateResponse,
    responses=error_responses(
        *AUTHENTICATED,
        ErrorCode.FORBIDDEN,
        ErrorCode.NOT_FOUND,
        ErrorCode.STATE_CONFLICT,
        ErrorCode.VALIDATION_ERROR,
    ),
)
async def update_user_status(
    user_id: uuid.UUID,
    body: UserStatusUpdateRequest,
    request: Request,
    principal: Principal = Depends(require_action(Action.USER_STATUS_UPDATE)),
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
) -> UserStatusUpdateResponse:
    return await use_cases.update_user_status(
        db=db,
        users=users,
        principal=principal,
        user_id=user_id,
        body=body,
        client=ClientInfo.from_request(request),
    )


@router.get(
    "/clans/{clan_id}/users",
    response_model=Page[ClanUserItem],
    dependencies=[Depends(require_action(Action.CLAN_USERS_LIST, clan_scope_from_path()))],
    responses=error_responses(
        *AUTHENTICATED, ErrorCode.FORBIDDEN, ErrorCode.NOT_FOUND, ErrorCode.VALIDATION_ERROR
    ),
)
async def list_clan_users(
    clan_id: str,  # already validated by clan_scope_from_path (malformed -> 404)
    query: ClanUserListQuery = Depends(),
    users: UserAccessRepository = Depends(get_user_access_repo),
    family: FamilyRepository = Depends(get_family_repo),
) -> Page[ClanUserItem]:
    return await use_cases.list_clan_users(
        users=users, family=family, clan_id=uuid.UUID(clan_id), query=query
    )


@router.put(
    "/clans/{clan_id}/admins/{user_id}/permissions",
    response_model=FamilyAdminPermissionsResponse,
    responses=error_responses(
        *AUTHENTICATED,
        ErrorCode.FORBIDDEN,
        ErrorCode.NOT_FOUND,
        ErrorCode.STATE_CONFLICT,
        ErrorCode.VALIDATION_ERROR,
    ),
)
async def update_fa_permissions(
    clan_id: str,  # already validated by clan_scope_from_path (malformed -> 404)
    user_id: uuid.UUID,
    body: FamilyAdminPermissionsUpdateRequest,
    request: Request,
    principal: Principal = Depends(
        require_action(Action.CLAN_FA_PERMISSIONS_UPDATE, clan_scope_from_path())
    ),
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    family: FamilyRepository = Depends(get_family_repo),
) -> FamilyAdminPermissionsResponse:
    return await use_cases.update_fa_permissions(
        db=db,
        users=users,
        family=family,
        principal=principal,
        clan_id=uuid.UUID(clan_id),
        user_id=user_id,
        body=body,
        client=ClientInfo.from_request(request),
    )


@router.post(
    "/clans/{clan_id}/admins",
    status_code=201,
    response_model=FamilyAdminAssignResponse,
    responses=error_responses(
        *AUTHENTICATED,
        ErrorCode.FORBIDDEN,
        ErrorCode.NOT_FOUND,
        ErrorCode.STATE_CONFLICT,
        ErrorCode.VALIDATION_ERROR,
    ),
)
async def assign_family_admin(
    clan_id: str,  # already validated by clan_scope_from_path (malformed -> 404)
    body: FamilyAdminAssignRequest,
    request: Request,
    principal: Principal = Depends(
        require_action(Action.CLAN_FA_ASSIGN, clan_scope_from_path())
    ),
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    family: FamilyRepository = Depends(get_family_repo),
) -> FamilyAdminAssignResponse:
    return await use_cases.assign_family_admin(
        db=db,
        users=users,
        family=family,
        principal=principal,
        clan_id=uuid.UUID(clan_id),
        body=body,
        client=ClientInfo.from_request(request),
    )


@router.delete(
    "/clans/{clan_id}/admins/{user_id}",
    status_code=204,
    response_class=Response,
    responses=error_responses(
        *AUTHENTICATED, ErrorCode.FORBIDDEN, ErrorCode.NOT_FOUND, ErrorCode.VALIDATION_ERROR
    ),
)
async def revoke_family_admin(
    clan_id: str,  # already validated by clan_scope_from_path (malformed -> 404)
    user_id: uuid.UUID,
    request: Request,
    principal: Principal = Depends(
        require_action(Action.CLAN_FA_REVOKE, clan_scope_from_path())
    ),
    db: AsyncSession = Depends(get_db),
    users: UserAccessRepository = Depends(get_user_access_repo),
    family: FamilyRepository = Depends(get_family_repo),
) -> Response:
    await use_cases.revoke_family_admin(
        db=db,
        users=users,
        family=family,
        principal=principal,
        clan_id=uuid.UUID(clan_id),
        user_id=user_id,
        client=ClientInfo.from_request(request),
    )
    return Response(status_code=204)
