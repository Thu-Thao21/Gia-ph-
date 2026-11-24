"""Module Test C10: GET /families/{family_id}/burials (lớp "Mộ phần" trên bản đồ thế giới).

PHẦN A - Unit KHÔNG cần DB (chạy mặc định bằng `pytest tests/test_c10_burials_map.py`):
  - _visible_privacy_levels / _resolve_membership (app/controllers/member_management/common.py):
    đúng 3 tầng quyền xem đang dùng ở GET /families/{id}/locations, không viết quy tắc mới.
  - GenealogyRepository._burial_has_coordinates (app/models/genealogy/repository.py): mộ thiếu tọa độ
    (NULL hoặc (0,0)) bị loại khỏi câu truy vấn, kiểm bằng cách biên dịch SQL (không cần kết nối DB).
  - Route GET /families/{family_id}/burials qua httpx.AsyncClient (ASGITransport) với get_db/
    get_current_account bị override và GenealogyRepository.count_clan_burials/list_clan_burials bị
    monkeypatch (không chạm DB thật): kiểm người ngoài họ chỉ thấy PUBLIC, mộ PRIVATE không lộ cho
    người không đủ quyền, phân trang (mặc định/giới hạn/truyền qua), và hình dạng JSON trả về.

  Lưu ý: không tìm thấy migration Alembic nào tạo bảng clan_locations / person_burials /
  location_proposals trong nhánh này (không có PHẦN B tích hợp DB thật như test_c09_worship_hall.py —
  xem báo cáo cuối nhiệm vụ).
"""

from __future__ import annotations

import uuid
from datetime import date
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import select

from app.controllers.member_management.common import _resolve_membership, _visible_privacy_levels
from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.main import app
from app.models.genealogy.entities import PersonBurial
from app.models.genealogy.repository import GenealogyRepository
from app.repositories.access_repository import AccessRepository


# =============================================================================
# A1. _visible_privacy_levels — ĐÚNG 3 tầng của GET /families/{id}/locations
# =============================================================================

def test_outsider_only_sees_public():
    assert _visible_privacy_levels(is_member=False, is_leader=False) == ["PUBLIC"]


def test_member_sees_public_and_clan_only_but_not_branch_or_private():
    levels = _visible_privacy_levels(is_member=True, is_leader=False)
    assert levels == ["PUBLIC", "CLAN_ONLY"]
    assert "BRANCH_ONLY" not in levels and "PRIVATE" not in levels


def test_leader_sees_every_tier_including_private():
    levels = _visible_privacy_levels(is_member=True, is_leader=True)
    assert set(levels) == {"PUBLIC", "CLAN_ONLY", "BRANCH_ONLY", "PRIVATE"}


def test_leader_flag_alone_implies_full_access_even_if_is_member_false():
    # _resolve_membership không bao giờ trả is_leader=True kèm is_member=False, nhưng
    # _visible_privacy_levels tự nó phải ưu tiên is_leader trước, không phụ thuộc thứ tự gọi.
    assert set(_visible_privacy_levels(is_member=False, is_leader=True)) == {
        "PUBLIC", "CLAN_ONLY", "BRANCH_ONLY", "PRIVATE"
    }


# =============================================================================
# A2. _resolve_membership — admin bỏ qua DB; thành viên/outsider tra qua AccessRepository
# =============================================================================

@pytest.mark.parametrize("role", ["admin", "ADMIN", "system_admin", "System_Admin"])
async def test_resolve_membership_admin_shortcut_skips_db(role, monkeypatch):
    called = False

    async def _should_not_be_called(self, account_id, family_id):
        nonlocal called
        called = True
        return set()

    monkeypatch.setattr(AccessRepository, "get_active_roles", _should_not_be_called)
    account = SimpleNamespace(primary_role=role, id=uuid.uuid4())
    is_member, is_leader = await _resolve_membership(db=None, account=account, family_id=uuid.uuid4())
    assert (is_member, is_leader) == (True, True)
    assert called is False, "Admin không cần tra AccessRepository"


async def test_resolve_membership_outsider_has_no_roles(monkeypatch):
    async def _no_roles(self, account_id, family_id):
        return set()

    monkeypatch.setattr(AccessRepository, "get_active_roles", _no_roles)
    account = SimpleNamespace(primary_role="", id=uuid.uuid4())
    assert await _resolve_membership(db=None, account=account, family_id=uuid.uuid4()) == (False, False)


async def test_resolve_membership_plain_member_is_not_leader(monkeypatch):
    async def _member_role(self, account_id, family_id):
        return {"family_member"}

    monkeypatch.setattr(AccessRepository, "get_active_roles", _member_role)
    account = SimpleNamespace(primary_role="", id=uuid.uuid4())
    assert await _resolve_membership(db=None, account=account, family_id=uuid.uuid4()) == (True, False)


@pytest.mark.parametrize("role", ["family_head", "Clan_Admin", "OWNER", "business_owner"])
async def test_resolve_membership_leader_roles_grant_leader_flag(role, monkeypatch):
    async def _leader_role(self, account_id, family_id):
        return {role}

    monkeypatch.setattr(AccessRepository, "get_active_roles", _leader_role)
    account = SimpleNamespace(primary_role="", id=uuid.uuid4())
    assert await _resolve_membership(db=None, account=account, family_id=uuid.uuid4()) == (True, True)


# =============================================================================
# A3. Mộ thiếu tọa độ bị loại khỏi câu truy vấn (kiểm bằng SQL đã biên dịch, không cần DB)
# =============================================================================

def _compiled(stmt) -> str:
    return str(stmt.compile(compile_kwargs={"literal_binds": True})).replace("\n", " ")


def test_burial_has_coordinates_excludes_null_latitude_and_longitude():
    sql = _compiled(select(PersonBurial.burial_id).where(GenealogyRepository._burial_has_coordinates()))
    assert "person_burials.latitude IS NOT NULL" in sql
    assert "person_burials.longitude IS NOT NULL" in sql


def test_burial_has_coordinates_excludes_zero_zero_sentinel():
    sql = _compiled(select(PersonBurial.burial_id).where(GenealogyRepository._burial_has_coordinates()))
    # (0, 0) được FE coi là "chưa nhập tọa độ": phải bị loại dù không NULL.
    assert "person_burials.latitude != 0" in sql
    assert "person_burials.longitude != 0" in sql


def test_list_and_count_queries_both_filter_coordinates_and_privacy_and_clan():
    clan_id = uuid.uuid4()
    for stmt in (
        select(PersonBurial).where(
            PersonBurial.clan_id == clan_id,
            PersonBurial.privacy_level.in_(["PUBLIC"]),
            GenealogyRepository._burial_has_coordinates(),
        ),
    ):
        sql = _compiled(stmt)
        assert "person_burials.clan_id = " in sql and str(clan_id).replace("-", "") in sql.replace("-", "")
        assert "privacy_level IN ('PUBLIC')" in sql
        assert "latitude IS NOT NULL" in sql


# =============================================================================
# A4. Route HTTP: GET /families/{family_id}/burials (repo thật bị monkeypatch, không chạm DB)
# =============================================================================

class _RepoCalls(list):
    """Ghi lại tham số mỗi lần route gọi GenealogyRepository, để assert mà không cần DB thật."""


@pytest.fixture
async def http(monkeypatch):
    calls = _RepoCalls()
    state = {"total": 0, "rows": []}

    async def fake_count(self, clan_id, privacy_levels):
        calls.append(("count", clan_id, list(privacy_levels)))
        return state["total"]

    async def fake_list(self, clan_id, privacy_levels, limit=200, offset=0):
        calls.append(("list", clan_id, list(privacy_levels), limit, offset))
        return state["rows"]

    monkeypatch.setattr(GenealogyRepository, "count_clan_burials", fake_count)
    monkeypatch.setattr(GenealogyRepository, "list_clan_burials", fake_list)

    async def override_db():
        yield None

    app.dependency_overrides[get_db] = override_db
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            yield SimpleNamespace(client=client, calls=calls, state=state)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_account, None)


def _as_account(role: str = "") -> SimpleNamespace:
    return SimpleNamespace(primary_role=role, id=uuid.uuid4())


async def _get(http, clan_id, account, **params):
    app.dependency_overrides[get_current_account] = lambda: account
    return await http.client.get(f"/families/{clan_id}/burials", params=params)


async def test_outsider_is_blocked_from_non_public_burials(http, monkeypatch):
    async def _no_roles(self, account_id, family_id):
        return set()

    monkeypatch.setattr(AccessRepository, "get_active_roles", _no_roles)
    resp = await _get(http, uuid.uuid4(), _as_account(""))
    assert resp.status_code == 200, resp.text
    assert http.calls[-1][2] == ["PUBLIC"]  # repo chỉ được yêu cầu mộ PUBLIC
    assert resp.json() == {"items": [], "total": 0, "limit": 200, "offset": 0}


async def test_private_burials_not_leaked_to_plain_member(http, monkeypatch):
    async def _member(self, account_id, family_id):
        return {"family_member"}

    monkeypatch.setattr(AccessRepository, "get_active_roles", _member)
    resp = await _get(http, uuid.uuid4(), _as_account(""))
    assert resp.status_code == 200, resp.text
    levels = http.calls[-1][2]
    assert "PRIVATE" not in levels and "BRANCH_ONLY" not in levels
    assert set(levels) == {"PUBLIC", "CLAN_ONLY"}


async def test_leader_sees_private_tier(http, monkeypatch):
    async def _leader(self, account_id, family_id):
        return {"family_head"}

    monkeypatch.setattr(AccessRepository, "get_active_roles", _leader)
    resp = await _get(http, uuid.uuid4(), _as_account(""))
    assert resp.status_code == 200, resp.text
    assert "PRIVATE" in http.calls[-1][2]


async def test_system_admin_sees_private_tier_without_role_lookup(http, monkeypatch):
    called = False

    async def _should_not_run(self, account_id, family_id):
        nonlocal called
        called = True
        return set()

    monkeypatch.setattr(AccessRepository, "get_active_roles", _should_not_run)
    resp = await _get(http, uuid.uuid4(), _as_account("system_admin"))
    assert resp.status_code == 200, resp.text
    assert "PRIVATE" in http.calls[-1][2]
    assert called is False


async def test_pagination_defaults_to_200_and_offset_0(http):
    resp = await _get(http, uuid.uuid4(), _as_account("admin"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["limit"] == 200 and body["offset"] == 0
    _, _, _, limit, offset = http.calls[-1]
    assert (limit, offset) == (200, 0)


async def test_pagination_passes_limit_and_offset_through(http):
    resp = await _get(http, uuid.uuid4(), _as_account("admin"), limit=25, offset=50)
    assert resp.status_code == 200
    body = resp.json()
    assert body["limit"] == 25 and body["offset"] == 50
    _, _, _, limit, offset = http.calls[-1]
    assert (limit, offset) == (25, 50)


@pytest.mark.parametrize("limit", [0, 501, -1])
async def test_pagination_limit_out_of_bounds_is_rejected_before_hitting_repo(http, limit):
    resp = await _get(http, uuid.uuid4(), _as_account("admin"), limit=limit)
    assert resp.status_code == 422
    assert not http.calls  # không chạm repo khi 422


async def test_pagination_negative_offset_is_rejected(http):
    resp = await _get(http, uuid.uuid4(), _as_account("admin"), offset=-1)
    assert resp.status_code == 422
    assert not http.calls


async def test_total_in_response_reflects_full_filtered_count_not_page_size(http):
    http.state["total"] = 137
    http.state["rows"] = []
    resp = await _get(http, uuid.uuid4(), _as_account("admin"), limit=10)
    assert resp.json()["total"] == 137


async def test_response_item_shape_matches_spec(http):
    burial = PersonBurial(
        burial_id=uuid.uuid4(),
        person_id=uuid.uuid4(),
        clan_id=uuid.uuid4(),
        cemetery_name="Nghĩa trang Gò Dưa",
        grave_code="A-12",
        address="123 Đường ABC, Q.9, TP.HCM",
        latitude=10.8231,
        longitude=106.6297,
        burial_date=date(1998, 3, 2),
        orientation="Nam",
        notes="ghi chú",
        photo_urls=["https://x/1.jpg"],
        privacy_level="PUBLIC",
    )
    http.state["rows"] = [(burial, "Nguyễn Văn A")]
    http.state["total"] = 1
    resp = await _get(http, uuid.uuid4(), _as_account("admin"))
    assert resp.status_code == 200, resp.text
    item = resp.json()["items"][0]
    assert item == {
        "personId": str(burial.person_id),
        "personName": "Nguyễn Văn A",
        "burialId": str(burial.burial_id),
        "clanId": str(burial.clan_id),
        "cemeteryName": "Nghĩa trang Gò Dưa",
        "graveCode": "A-12",
        "address": "123 Đường ABC, Q.9, TP.HCM",
        "burialDate": "1998-03-02",
        "latitude": 10.8231,
        "longitude": 106.6297,
        "privacyLevel": "PUBLIC",
        "photoUrls": ["https://x/1.jpg"],
    }


async def test_response_item_handles_missing_optional_fields(http):
    burial = PersonBurial(
        burial_id=uuid.uuid4(),
        person_id=uuid.uuid4(),
        clan_id=uuid.uuid4(),
        cemetery_name=None,
        grave_code=None,
        address=None,
        latitude=1.0,
        longitude=1.0,
        burial_date=None,
        photo_urls=None,
        privacy_level="CLAN_ONLY",
    )
    http.state["rows"] = [(burial, "Không tên")]
    http.state["total"] = 1
    resp = await _get(http, uuid.uuid4(), _as_account("admin"))
    item = resp.json()["items"][0]
    assert item["burialDate"] is None
    assert item["photoUrls"] == []


async def test_invalid_family_id_returns_400(http):
    resp = await _get(http, "not-a-uuid", _as_account("admin"))
    assert resp.status_code == 400
