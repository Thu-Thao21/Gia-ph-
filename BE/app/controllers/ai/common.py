"""Common helpers, permissions & constants for AI controllers."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import Principal
from app.models.family.entities import Clan, ClanMembership, FamilyAdminAssignment
from app.models.user_access.entities import Role, UserRole

logger = logging.getLogger("mfg.ai.common")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


DEFAULT_FEATURES = {
    "assistant": True,
    "relationship_analysis": True,
    "suggestions": True,
    "biography": True,
}

DEFAULT_DATA_SCOPES = {
    "public_events": True,
    "general_history": True,
    "personal_data": False,
    "images": False,
}

PURPOSE_KEYS = [
    "personalData",
    "images",
    "genealogyData",
    "relationshipAnalysis",
    "dataSuggestions",
    "biographyDrafts",
]


async def _require_clan_leader(
    db: AsyncSession, principal: Principal, clan_id: uuid.UUID
) -> Clan:
    """Xac thuc nguoi dung la Truong toc (BUSINESS_OWNER hoac nguoi khoi tao dong ho)."""
    clan_stmt = select(Clan).where(Clan.clan_id == clan_id)
    clan = (await db.execute(clan_stmt)).scalar_one_or_none()
    if not clan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dong ho khong ton tai.",
        )

    if clan.created_by == principal.user_id:
        return clan

    bo_role_stmt = select(Role.role_id).where(Role.code == "BUSINESS_OWNER")
    bo_role_id = (await db.execute(bo_role_stmt)).scalar_one_or_none()
    if bo_role_id:
        user_bo_stmt = select(UserRole).where(
            UserRole.user_id == principal.user_id,
            UserRole.role_id == bo_role_id,
            UserRole.clan_id == clan_id,
            UserRole.revoked_at.is_(None),
        )
        if (await db.execute(user_bo_stmt)).scalar_one_or_none():
            return clan

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Chi Truong toc / Chu so huu dong ho moi co quyen cau hinh tinh nang AI cho dong ho.",
    )


async def _require_clan_membership(
    db: AsyncSession, principal: Principal, clan_id: uuid.UUID
) -> ClanMembership:
    """Xac thuc nguoi dung co tu cach thanh vien hoat dong trong dong ho (Tenant isolation)."""
    mem_stmt = select(ClanMembership).where(
        ClanMembership.clan_id == clan_id,
        ClanMembership.user_id == principal.user_id,
        ClanMembership.status == "ACTIVE",
    )
    mem = (await db.execute(mem_stmt)).scalar_one_or_none()
    if not mem:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ban chua gia nhap dong ho nay hoac tu cach thanh vien da bi thu hoi.",
        )
    return mem


async def _require_quality_audit_access(
    db: AsyncSession,
    principal: Principal,
    clan_id: uuid.UUID,
    requested_branch_id: Optional[uuid.UUID] = None,
) -> Tuple[str, Optional[Set[uuid.UUID]]]:
    """Xac thuc quyen kiem dinh chat luong du lieu (Admin, Clan Leader, Family Admin)."""
    if getattr(principal, "primary_role", "").lower() in ("admin", "system_admin"):
        if requested_branch_id:
            return ("SYSTEM_ADMIN", {requested_branch_id})
        return ("SYSTEM_ADMIN", None)

    clan_stmt = select(Clan).where(Clan.clan_id == clan_id)
    clan = (await db.execute(clan_stmt)).scalar_one_or_none()
    if not clan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dong ho khong ton tai.",
        )

    is_creator = clan.created_by == principal.user_id

    from app.services.auth_access.access_service import AccessService
    roles = await AccessService(db).repo.get_active_roles(principal.user_id, str(clan_id))
    role_set = {r.lower() for r in roles}

    is_clan_leader = is_creator or bool(
        role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"})
    )

    if is_clan_leader:
        if requested_branch_id:
            return ("CLAN_LEADER", {requested_branch_id})
        return ("CLAN_LEADER", None)

    if "family_admin" in role_set:
        stmt = select(FamilyAdminAssignment).where(
            FamilyAdminAssignment.user_id == principal.user_id,
            FamilyAdminAssignment.clan_id == clan_id,
            FamilyAdminAssignment.revoked_at.is_(None),
        )
        res = await db.execute(stmt)
        assignments = res.scalars().all()
        if not assignments:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Quyen quan tri Family Admin da bi thu hoi hoac khong hop le.",
            )

        has_clan_wide = any(a.branch_id is None for a in assignments)
        if has_clan_wide:
            if requested_branch_id:
                return ("FAMILY_ADMIN", {requested_branch_id})
            return ("FAMILY_ADMIN", None)

        allowed_branch_ids = {a.branch_id for a in assignments if a.branch_id is not None}
        if requested_branch_id:
            if requested_branch_id not in allowed_branch_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Ban chi duoc kiem dinh chat luong trong chi nhanh duoc phan quyen.",
                )
            return ("FAMILY_ADMIN", {requested_branch_id})

        return ("FAMILY_ADMIN", allowed_branch_ids)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Tinh nang kiem dinh chat luong du lieu chi danh cho Truong toc va Quan tri vien chi nhanh.",
    )
