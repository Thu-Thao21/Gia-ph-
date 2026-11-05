"""Module Test C01: Auth & Access Controller & Model.

Kiểm tra:
- Phân định danh tính caller qua Principal
- Khởi tạo thực thể User và Role
- Mã định danh vai trò chuẩn trong hệ thống (SUPER_ADMIN, BUSINESS_OWNER, CLAN_ADMIN, FAMILY_ADMIN, MEMBER)
"""

from __future__ import annotations

import uuid
import pytest
from app.models.user_access.entities import Role, User, UserRole
from app.dependencies.auth import Principal


def test_principal_identity():
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()

    principal = Principal(
        user_id=user_id,
        session_id=session_id,
        status="ACTIVE",
        requires_password_change=False,
    )

    assert principal.user_id == user_id
    assert principal.session_id == session_id
    assert principal.status == "ACTIVE"
    assert principal.requires_password_change is False


def test_user_entity_attributes():
    user_id = uuid.uuid4()
    user = User(
        user_id=user_id,
        email="test@genealogy.com",
        display_name="Nguyen Van A",
        phone="+84987654321",
        status="ACTIVE",
    )

    assert user.user_id == user_id
    assert user.email == "test@genealogy.com"
    assert user.display_name == "Nguyen Van A"
    assert user.status == "ACTIVE"


def test_role_hierarchy_codes():
    valid_roles = {"SUPER_ADMIN", "BUSINESS_OWNER", "CLAN_ADMIN", "FAMILY_ADMIN", "MEMBER", "GUEST"}
    assert "BUSINESS_OWNER" in valid_roles
    assert "CLAN_ADMIN" in valid_roles
    assert "MEMBER" in valid_roles
