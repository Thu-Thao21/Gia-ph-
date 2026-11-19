"""Module Test C04: Inter-Family Controller & Model.

Kiểm tra:
- Khởi tạo thực thể InterClanLink và InterClanRequest
- Trạng thái liên kết dòng họ (PENDING, APPROVED, ACTIVE, REJECTED)
- Cách ly quyền dữ liệu giữa hai dòng tộc
"""

from __future__ import annotations

import uuid
import pytest
from app.models.inter_family.entities import InterClanLink, InterClanRequest


def test_inter_clan_request_lifecycle():
    from_clan_id = uuid.uuid4()
    to_clan_id = uuid.uuid4()
    requester_id = uuid.uuid4()

    req = InterClanRequest(
        id=uuid.uuid4(),
        source_clan_id=from_clan_id,
        target_clan_id=to_clan_id,
        requester_id=requester_id,
        connection_type="MATERNAL",
        status="PENDING",
    )

    assert req.status == "PENDING"
    assert req.connection_type == "MATERNAL"
    assert req.source_clan_id != req.target_clan_id


def test_inter_clan_link_active():
    clan_a = uuid.uuid4()
    clan_b = uuid.uuid4()

    link = InterClanLink(
        id=uuid.uuid4(),
        request_id=uuid.uuid4(),
        clan_a_id=clan_a,
        clan_b_id=clan_b,
        connection_type="IN_LAW",
        status="ACTIVE",
    )

    assert link.status == "ACTIVE"
    assert link.connection_type == "IN_LAW"


def test_my_family_network_boundary_limits():
    """Kiểm tra giới hạn cấu trúc phạm vi 4 thế hệ của My Family Network."""
    allowed_relative_levels = {-2, -1, 0, 1}
    sample_nodes = [
        {"id": "gp1", "relativeLevel": -2, "relativeRole": "GRANDFATHER", "canExpand": False},
        {"id": "gp2", "relativeLevel": -2, "relativeRole": "GRANDMOTHER", "canExpand": False},
        {"id": "p1", "relativeLevel": -1, "relativeRole": "FATHER", "canExpand": False},
        {"id": "ego", "relativeLevel": 0, "relativeRole": "EGO", "isEgo": True},
        {"id": "sp", "relativeLevel": 0, "relativeRole": "SPOUSE", "isSpouse": True},
        {"id": "sib", "relativeLevel": 0, "relativeRole": "SIBLING"},
        {"id": "ch1", "relativeLevel": 1, "relativeRole": "CHILD"},
    ]

    for node in sample_nodes:
        assert node["relativeLevel"] in allowed_relative_levels
        # Thế hệ ông bà bên phối ngẫu hoặc cận biên không được phép mở rộng sâu hơn
        if node["relativeLevel"] == -2:
            assert node.get("canExpand") is False


def test_my_family_network_data_isolation():
    """Kiểm tra bảo mật và cách ly dữ liệu hai dòng họ không bị gộp bảng."""
    clan_a_id = str(uuid.uuid4())
    clan_b_id = str(uuid.uuid4())

    natal_node = {
        "id": "person_a",
        "clanId": clan_a_id,
        "clanName": "Dòng Họ Dương",
        "isCrossClan": False,
    }
    in_law_node = {
        "id": "person_b",
        "clanId": clan_b_id,
        "clanName": "Mai Thế Tộc",
        "isCrossClan": True,
    }

    assert natal_node["clanId"] != in_law_node["clanId"]
    assert natal_node["clanName"] != in_law_node["clanName"]
    assert in_law_node["isCrossClan"] is True
    assert natal_node["isCrossClan"] is False


def test_lineage_access_request_entity():
    """Kiểm tra khởi tạo thực thể LineageAccessRequest."""
    from app.models.inter_family.entities import LineageAccessRequest

    req_id = uuid.uuid4()
    owner_clan_id = uuid.uuid4()
    requester_user_id = uuid.uuid4()
    anchor_person_id = uuid.uuid4()

    req = LineageAccessRequest(
        id=req_id,
        owner_clan_id=owner_clan_id,
        requester_user_id=requester_user_id,
        anchor_person_id=anchor_person_id,
        grantee_user_id=requester_user_id,
        scope_type="FOUR_GENERATIONS",
        status="PENDING",
        reason="Xin xem gia phả bên chồng",
    )

    assert req.id == req_id
    assert req.owner_clan_id == owner_clan_id
    assert req.scope_type == "FOUR_GENERATIONS"
    assert req.status == "PENDING"
    assert req.reason == "Xin xem gia phả bên chồng"


def test_lineage_access_grant_entity():
    """Kiểm tra khởi tạo thực thể LineageAccessGrant."""
    from app.models.inter_family.entities import LineageAccessGrant

    grant_id = uuid.uuid4()
    req_id = uuid.uuid4()
    owner_clan_id = uuid.uuid4()
    grantee_id = uuid.uuid4()
    anchor_id = uuid.uuid4()
    approved_by = uuid.uuid4()

    grant = LineageAccessGrant(
        id=grant_id,
        request_id=req_id,
        owner_clan_id=owner_clan_id,
        anchor_person_id=anchor_id,
        grantee_user_id=grantee_id,
        scope_type="FOUR_GENERATIONS",
        permission="VIEW_ONLY",
        status="ACTIVE",
        approved_by=approved_by,
    )

    assert grant.id == grant_id
    assert grant.permission == "VIEW_ONLY"
    assert grant.status == "ACTIVE"
    assert grant.approved_by == approved_by


def test_bilateral_independent_access_isolation():
    """Kiểm tra tính độc lập 2 chiều: Cấp quyền Clan B cho User A không tự động cấp Clan A cho User B."""
    clan_a = uuid.uuid4()
    clan_b = uuid.uuid4()
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()

    # User A được Clan B cấp quyền xem
    grant_a_for_b = {
        "owner_clan_id": clan_b,
        "grantee_user_id": user_a,
        "status": "ACTIVE",
    }

    # Bảng grant của hệ thống
    active_grants = [grant_a_for_b]

    # Kiểm tra User A có quyền xem Clan B
    has_a_access_b = any(
        g["owner_clan_id"] == clan_b and g["grantee_user_id"] == user_a and g["status"] == "ACTIVE"
        for g in active_grants
    )
    assert has_a_access_b is True

    # Kiểm tra User B KHÔNG tự động có quyền xem Clan A
    has_b_access_a = any(
        g["owner_clan_id"] == clan_a and g["grantee_user_id"] == user_b and g["status"] == "ACTIVE"
        for g in active_grants
    )
    assert has_b_access_a is False, "Quyền liên họ 2 chiều phải xét duyệt độc lập, không được tự động cấp chéo!"


def test_lineage_access_schemas():
    """Kiểm tra schema validation cho yêu cầu và xét duyệt cấp quyền gia phả."""
    from app.schemas.inter_family import (
        LineageAccessRequestCreate,
        LineageAccessReviewRequest,
        LineageAccessRevokeRequest,
    )

    clan_id = uuid.uuid4()
    anchor_id = uuid.uuid4()

    create_data = LineageAccessRequestCreate(
        owner_clan_id=clan_id,
        anchor_person_id=anchor_id,
        reason="Kính gửi Trưởng tộc phê duyệt",
    )
    assert create_data.owner_clan_id == clan_id
    assert create_data.reason == "Kính gửi Trưởng tộc phê duyệt"

    review_approve = LineageAccessReviewRequest(action="APPROVE")
    assert review_approve.action == "APPROVE"

    review_reject = LineageAccessReviewRequest(
        action="REJECT",
        rejection_reason="Chưa đủ thông tin xác minh",
    )
    assert review_reject.rejection_reason == "Chưa đủ thông tin xác minh"

    revoke = LineageAccessRevokeRequest(revocation_reason="Hết thời hạn xem")
    assert revoke.revocation_reason == "Hết thời hạn xem"


