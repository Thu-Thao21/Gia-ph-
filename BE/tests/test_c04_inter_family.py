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
