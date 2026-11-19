"""Common dependencies and helpers for Member and Clan Management."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family.entities import FamilyAdminAssignment
from app.models.postgres import Account
from app.services.auth_access.access_service import AccessService


def _family_uuid(family_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(family_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid family_id")


async def _require(db: AsyncSession, account: Account, family_id: uuid.UUID, permission: str) -> None:
    """403 unless the caller holds permission in this family (SA always passes)."""
    await AccessService(db).require_family_permission(account, str(family_id), permission)


async def _require_branch_scope(
    db: AsyncSession,
    account: Account,
    clan_id: uuid.UUID,
    entity_branch_id: Optional[uuid.UUID],
    permission: str = "family.update",
) -> None:
    """
    RBAC check with Branch Scoping:
    - System Admin and Clan Leader: full access across all branches.
    - Family Admin:
      - Must have active, non-revoked assignment.
      - If assignment has branch_id set, entity_branch_id MUST match!
      - If entity has no branch_id (clan-wide location) and FA is branch-scoped, 403 Forbidden!
    - Member: 403 Forbidden.
    """
    await _require(db, account, clan_id, permission)

    if getattr(account, "primary_role", "").lower() in ("admin", "system_admin"):
        return

    roles = await AccessService(db).repo.get_active_roles(account.id, str(clan_id))
    role_set = {r.lower() for r in roles}

    if role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}):
        return

    if "family_admin" in role_set:
        stmt = select(FamilyAdminAssignment).where(
            FamilyAdminAssignment.user_id == account.id,
            FamilyAdminAssignment.clan_id == clan_id,
            FamilyAdminAssignment.revoked_at.is_(None),
        )
        res = await db.execute(stmt)
        assignments = res.scalars().all()
        if not assignments:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Quyền quản trị Family Admin đã bị thu hồi hoặc không hợp lệ.",
            )

        has_clan_wide = any(a.branch_id is None for a in assignments)
        if has_clan_wide:
            return

        allowed_branch_ids = {a.branch_id for a in assignments if a.branch_id is not None}
        if entity_branch_id is None or entity_branch_id not in allowed_branch_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Family Admin chỉ được phép quản lý trong phạm vi chi nhánh được phân quyền.",
            )
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Thành viên chỉ được quyền xem hoặc gửi đề xuất, không được chỉnh sửa trực tiếp.",
    )
