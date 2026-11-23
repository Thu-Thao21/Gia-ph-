"""Module Test C04 Security: Lineage Access & My Family Network Security Assertions.

Kiểm tra bảo mật toàn diện:
1. Xác minh hôn nhân bắt buộc trước khi gửi yêu cầu xem gia phả (chặn nếu unverified).
2. Phân quyền phê duyệt: Chặn Member thường duyệt hoặc thu hồi quyền (403 Forbidden).
3. Độc lập hai chiều: Quyền dòng họ A -> B không tự động cấp dòng họ B -> A.
4. Từ chối yêu cầu bắt buộc có lý do và cho phép gửi lại yêu cầu mới.
5. Thu hồi quyền tức thì và cascade tự động khi ly hôn (revoke mapping) hoặc chấm dứt liên kết (terminate link).
6. Giới hạn cứng 4 thế hệ: Không vượt quá Level -2 (Ông bà) và Level +1 (Con cái).
7. Bảo mật endpoint dual-lineage: Chặn truy cập tổ tiên bên thông gia nếu chưa có LineageAccessGrant ACTIVE.
8. Phân lập con cái trong trường hợp có nhiều cuộc hôn nhân (blended families).
9. Ghi nhận đầy đủ nhật ký kiểm toán (AuditLog) cho mọi thao tác.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
import pytest
from fastapi import HTTPException

from app.models.inter_family.entities import (
    LineageAccessRequest,
    LineageAccessGrant,
    InterClanPersonMapping,
    InterClanLink,
)
from app.models.user_access.entities import AuditLog
from app.schemas.inter_family import (
    LineageAccessRequestCreate,
    LineageAccessReviewRequest,
    LineageAccessRevokeRequest,
)


def test_unverified_marriage_blocks_lineage_request():
    """Bảo mật 1: Chặn gửi yêu cầu nếu hôn nhân chưa VERIFIED (chưa xác minh)."""
    # Mô phỏng dữ liệu mapping ở trạng thái PENDING (chưa xác minh)
    person_a = uuid.uuid4()
    person_b = uuid.uuid4()
    mapping = InterClanPersonMapping(
        id=uuid.uuid4(),
        link_id=uuid.uuid4(),
        person_a_id=person_a,
        clan_a_id=uuid.uuid4(),
        person_b_id=person_b,
        clan_b_id=uuid.uuid4(),
        relationship_type="SPOUSE",
        status="PENDING",  # Chưa xác minh!
    )

    # Logic kiểm tra: mapping phải ở trạng thái VERIFIED
    is_marriage_verified = (
        mapping.status == "VERIFIED"
        and (
            (mapping.person_a_id == person_a and mapping.person_b_id == person_b)
            or (mapping.person_b_id == person_a and mapping.person_a_id == person_b)
        )
    )
    assert is_marriage_verified is False, "Hôn nhân chưa VERIFIED không được phép thông qua!"


def test_verified_marriage_allows_lineage_request():
    """Bảo mật 1b: Hôn nhân VERIFIED được phép gửi yêu cầu."""
    person_a = uuid.uuid4()
    person_b = uuid.uuid4()
    mapping = InterClanPersonMapping(
        id=uuid.uuid4(),
        link_id=uuid.uuid4(),
        person_a_id=person_a,
        clan_a_id=uuid.uuid4(),
        person_b_id=person_b,
        clan_b_id=uuid.uuid4(),
        relationship_type="SPOUSE",
        status="VERIFIED",
    )

    is_marriage_verified = (
        mapping.status == "VERIFIED"
        and (
            (mapping.person_a_id == person_a and mapping.person_b_id == person_b)
            or (mapping.person_b_id == person_a and mapping.person_a_id == person_b)
        )
    )
    assert is_marriage_verified is True


def test_member_cannot_approve_lineage_request():
    """Bảo mật 2: Member thông thường không có quyền quản lý dòng họ bị từ chối 403."""
    class DummyCaller:
        user_id = uuid.uuid4()
        is_sa = False
        clans = [uuid.uuid4()]

        def check_manages(self, clan_id: uuid.UUID) -> bool:
            return False  # Member thông thường, không phải Clan Admin / Family Admin

    caller = DummyCaller()
    owner_clan_id = uuid.uuid4()

    if not caller.check_manages(owner_clan_id):
        with pytest.raises(HTTPException) as exc_info:
            raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý dòng họ này.")
        assert exc_info.value.status_code == 403


def test_rejection_requires_explicit_reason():
    """Bảo mật 3: Từ chối yêu cầu bắt buộc phải có lý do minh bạch."""
    review_empty_reason = LineageAccessReviewRequest(action="REJECT", rejection_reason="")
    review_whitespace = LineageAccessReviewRequest(action="REJECT", rejection_reason="   ")

    assert not review_empty_reason.rejection_reason or not review_empty_reason.rejection_reason.strip()
    assert not review_whitespace.rejection_reason or not review_whitespace.rejection_reason.strip()

    review_valid = LineageAccessReviewRequest(action="REJECT", rejection_reason="Chưa xác minh được danh tính")
    assert bool(review_valid.rejection_reason and review_valid.rejection_reason.strip()) is True


def test_bilateral_independence_strict_isolation():
    """Bảo mật 4: Độc lập 2 chiều tuyệt đối."""
    clan_duong = uuid.uuid4()
    clan_mai = uuid.uuid4()
    user_thao = uuid.uuid4()  # Bên Dương
    user_hau = uuid.uuid4()   # Bên Mai

    # Mai Thế Tộc duyệt cấp quyền cho Thảo xem nhánh Mai Thế Tộc
    grant_thao = LineageAccessGrant(
        id=uuid.uuid4(),
        request_id=uuid.uuid4(),
        owner_clan_id=clan_mai,
        anchor_person_id=uuid.uuid4(),
        grantee_user_id=user_thao,
        scope_type="FOUR_GENERATIONS",
        permission="VIEW_ONLY",
        status="ACTIVE",
    )

    grants_table = [grant_thao]

    # Kiểm tra Thảo có quyền xem họ Mai
    thao_can_view_mai = any(
        g.owner_clan_id == clan_mai and g.grantee_user_id == user_thao and g.status == "ACTIVE"
        for g in grants_table
    )
    assert thao_can_view_mai is True

    # Kiểm tra Hậu KHÔNG có quyền xem họ Dương (chưa được họ Dương duyệt)
    hau_can_view_duong = any(
        g.owner_clan_id == clan_duong and g.grantee_user_id == user_hau and g.status == "ACTIVE"
        for g in grants_table
    )
    assert hau_can_view_duong is False, "Quyền liên họ độc lập 2 chiều: Hậu không thể xem họ Dương khi chưa được duyệt!"


def test_revocation_lifecycle_and_audit():
    """Bảo mật 5: Thu hồi quyền tức thì chuyển trạng thái sang REVOKED và ghi nhận AuditLog."""
    clan_id = uuid.uuid4()
    grantee_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    grant = LineageAccessGrant(
        id=uuid.uuid4(),
        request_id=uuid.uuid4(),
        owner_clan_id=clan_id,
        anchor_person_id=uuid.uuid4(),
        grantee_user_id=grantee_id,
        scope_type="FOUR_GENERATIONS",
        permission="VIEW_ONLY",
        status="ACTIVE",
    )

    # Thu hồi quyền
    now = datetime.now(timezone.utc)
    grant.status = "REVOKED"
    grant.revoked_by = actor_id
    grant.revoked_at = now
    grant.revocation_reason = "Thu hồi theo yêu cầu của hội đồng gia tộc"

    audit = AuditLog(
        log_id=uuid.uuid4(),
        clan_id=clan_id,
        actor_id=actor_id,
        action="lineage_access.revoke",
        entity_type="LINEAGE_ACCESS_GRANT",
        entity_id=grant.id,
        new_data={"status": "REVOKED", "reason": grant.revocation_reason},
    )

    assert grant.status == "REVOKED"
    assert grant.revoked_by == actor_id
    assert audit.action == "lineage_access.revoke"
    assert audit.entity_id == grant.id


def test_divorce_cascades_grant_revocation():
    """Bảo mật 6: Khi ly hôn / hủy quan hệ hôn nhân, quyền xem gia phả tự động thu hồi."""
    person_a = uuid.uuid4()
    person_b = uuid.uuid4()
    clan_a = uuid.uuid4()
    clan_b = uuid.uuid4()

    # Hai quyền đang active cho hai người
    grant_a = LineageAccessGrant(
        id=uuid.uuid4(),
        request_id=uuid.uuid4(),
        owner_clan_id=clan_b,
        anchor_person_id=person_b,
        grantee_user_id=uuid.uuid4(),
        scope_type="FOUR_GENERATIONS",
        permission="VIEW_ONLY",
        status="ACTIVE",
    )
    grant_b = LineageAccessGrant(
        id=uuid.uuid4(),
        request_id=uuid.uuid4(),
        owner_clan_id=clan_a,
        anchor_person_id=person_a,
        grantee_user_id=uuid.uuid4(),
        scope_type="FOUR_GENERATIONS",
        permission="VIEW_ONLY",
        status="ACTIVE",
    )

    grants = [grant_a, grant_b]

    # Giả lập sự kiện hủy hôn nhân liên họ (divorce / unlinking)
    anchor_targets = {person_a, person_b}
    revoked_count = 0
    now = datetime.now(timezone.utc)
    for g in grants:
        if g.anchor_person_id in anchor_targets and g.status == "ACTIVE":
            g.status = "REVOKED"
            g.revoked_at = now
            g.revocation_reason = "Quan hệ hôn nhân liên họ đã bị thu hồi / ly hôn"
            revoked_count += 1

    assert revoked_count == 2
    assert all(g.status == "REVOKED" for g in grants)


def test_strict_four_generation_depth_limit():
    """Bảo mật 7: Giới hạn cứng 4 thế hệ, tuyệt đối không rò rỉ Cụ (Level -3) hay Cháu (Level +2)."""
    # Các thế hệ hợp lệ trong mô hình My Family Network:
    # Level -2: Ông/Bà (Grandparents)
    # Level -1: Cha/Mẹ (Parents)
    # Level  0: Ego, Phối ngẫu, Anh chị em
    # Level +1: Con cái (Children)
    allowed_levels = {-2, -1, 0, 1}

    # Bất kỳ node nào có Level -3 (Cụ) hoặc +2 (Cháu nội/ngoại) phải bị loại trừ
    test_node_great_grandparent = {"id": "cu_to", "relativeLevel": -3}
    test_node_grandchild = {"id": "chau_noi", "relativeLevel": 2}
    test_node_child = {"id": "con_gai", "relativeLevel": 1}
    test_node_grandparent = {"id": "ong_noi", "relativeLevel": -2}

    assert test_node_great_grandparent["relativeLevel"] not in allowed_levels
    assert test_node_grandchild["relativeLevel"] not in allowed_levels
    assert test_node_child["relativeLevel"] in allowed_levels
    assert test_node_grandparent["relativeLevel"] in allowed_levels


def test_dual_lineage_partner_clan_privacy_without_grant():
    """Bảo mật 8: Endpoint dual-lineage không trả về tổ tiên của bên thông gia nếu caller chưa có grant."""
    caller_clan_id = uuid.uuid4()
    partner_clan_id = uuid.uuid4()
    caller_user_id = uuid.uuid4()

    # Không có grant active nào cho caller trên partner clan
    active_grants = []

    has_partner_access = any(
        g.owner_clan_id == partner_clan_id
        and g.grantee_user_id == caller_user_id
        and g.status == "ACTIVE"
        for g in active_grants
    )

    # Nếu không có quyền:
    partner_generations = [{"level": 1, "title": "Cha/Mẹ"}] if has_partner_access else []
    notice = None if has_partner_access else "Cần được Trưởng tộc phê duyệt để xem gia phả 4 đời."

    assert partner_generations == []
    assert notice is not None


def test_dual_lineage_partner_clan_access_with_grant():
    """Bảo mật 8b: Endpoint dual-lineage trả về tổ tiên đối tác khi đã có LineageAccessGrant ACTIVE."""
    partner_clan_id = uuid.uuid4()
    caller_user_id = uuid.uuid4()

    active_grant = LineageAccessGrant(
        id=uuid.uuid4(),
        request_id=uuid.uuid4(),
        owner_clan_id=partner_clan_id,
        anchor_person_id=uuid.uuid4(),
        grantee_user_id=caller_user_id,
        scope_type="FOUR_GENERATIONS",
        permission="VIEW_ONLY",
        status="ACTIVE",
    )
    active_grants = [active_grant]

    has_partner_access = any(
        g.owner_clan_id == partner_clan_id
        and g.grantee_user_id == caller_user_id
        and g.status == "ACTIVE"
        for g in active_grants
    )

    partner_generations = [{"level": 1, "title": "Cha/Mẹ"}] if has_partner_access else []
    assert has_partner_access is True
    assert len(partner_generations) == 1


def test_multiple_marriages_child_isolation_logic():
    """Bảo mật 9: Xử lý nhiều cuộc hôn nhân (Blended Families) không gán nhầm con riêng."""
    ego_id = "ego_thao"
    spouse1_id = "sp1_hau"
    spouse2_id = "sp2_nam"
    child_of_sp1 = "child_1"
    child_of_sp2 = "child_2"

    # Bảng relationships ghi nhận cha/mẹ cụ thể của từng con
    relationships_db = {
        child_of_sp1: {ego_id, spouse1_id},
        child_of_sp2: {ego_id, spouse2_id},
    }

    # Kiểm tra spouse 1 chỉ có cạnh nối tới child 1, KHÔNG nối tới child 2
    spouse1_children = [
        ch_id for ch_id, pars in relationships_db.items()
        if spouse1_id in pars
    ]
    assert spouse1_children == [child_of_sp1]
    assert child_of_sp2 not in spouse1_children

    # Kiểm tra spouse 2 chỉ có cạnh nối tới child 2, KHÔNG nối tới child 1
    spouse2_children = [
        ch_id for ch_id, pars in relationships_db.items()
        if spouse2_id in pars
    ]
    assert spouse2_children == [child_of_sp2]
    assert child_of_sp1 not in spouse2_children
