"""C01. Auth & Access Service - Permission checking for family actions."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.postgres import Account
from app.repositories.access_repository import AccessRepository


VIEW_PERMISSIONS = {
    "family.view",
    "branch.view",
    "person.view",
    "relationship.view",
    "tree.view",
}

MANAGE_PERMISSIONS = VIEW_PERMISSIONS | {
    "family.update",
    "branch.manage",
    "person.create",
    "person.update",
    "relationship.manage",
}


SYSTEM_ADMIN_ROLES = {"admin", "system_admin"}

# These are the built-in minimums for the canonical production roles. Database
# RolePermission rows may extend them, but family-scoped roles still require an
# active membership and a role assignment for the requested family.
ROLE_PERMISSION_DEFAULTS = {
    "business_owner": MANAGE_PERMISSIONS,
    "owner": MANAGE_PERMISSIONS,
    "manager": MANAGE_PERMISSIONS,
    "family_head": MANAGE_PERMISSIONS,
    "family_admin": MANAGE_PERMISSIONS,
    "family_member": VIEW_PERMISSIONS,
    "member": VIEW_PERMISSIONS,
}


def get_default_permission_codes(role_names: set[str]) -> set[str]:
    granted: set[str] = set()
    for role_name in role_names:
        granted.update(ROLE_PERMISSION_DEFAULTS.get(role_name.lower(), set()))
    return granted


class AccessService:
    def __init__(self, db: AsyncSession):
        self.repo = AccessRepository(db)

    async def is_system_admin(self, account: Account) -> bool:
        """An active system-scope admin role (clan_id NULL), the same roles that bypass the
        family checks below."""
        if not account or account.status.upper() != "ACTIVE":
            return False
        roles = {role.lower() for role in await self.repo.get_active_roles(account.id, None)}
        return bool(roles.intersection(SYSTEM_ADMIN_ROLES))

    async def member_clan_ids(self, account: Account) -> set:
        """Clans the account is an ACTIVE member of (empty for an inactive account)."""
        if not account or account.status.upper() != "ACTIVE":
            return set()
        return await self.repo.get_active_clan_ids(account.id)

    async def has_family_permission(self, account: Account, family_id, permission: str) -> bool:
        """require_family_permission as a yes/no answer (same rules, SA included)."""
        try:
            await self.require_family_permission(account, str(family_id), permission)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                return False
            raise
        return True

    async def require_system_admin(self, account: Account) -> None:
        """For data that spans every clan (lists without a family_id)."""
        if not await self.is_system_admin(account):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="System administrator access is required",
            )

    async def require_family_permission(
        self,
        account: Account,
        family_id: str,
        permission: str,
    ) -> None:
        if not account or account.status.upper() != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive or unavailable",
            )

        role_names = {
            role.lower()
            for role in await self.repo.get_active_roles(account.id, family_id)
        }

        if role_names.intersection(SYSTEM_ADMIN_ROLES):
            return

        membership = await self.repo.get_active_membership(account.id, family_id)
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active family membership is required",
            )

        granted = get_default_permission_codes(role_names)
        granted.update(await self.repo.get_granted_permission_codes(role_names))

        if permission not in granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: {permission}",
            )
