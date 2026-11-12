"""Module Test C09: Phòng thờ 3D (bàn thờ, tầng bài vị, thắp hương, Lời viếng, chuỗi ngày).

PHẦN A - Unit KHÔNG cần DB (chạy mặc định bằng `pytest tests/test_c09_worship_hall.py`):
  vn_today / next_offer_at (đổi ngày 00:00 giờ Việt Nam), compute_next_streak, effective_streak,
  tier_for_generation, moderate_blessing, validate_image_filename, quyền xem / quản lý, schema,
  đối chiếu ORM với migration 0014 (bằng đọc mã nguồn, không kết nối DB), các route đã đăng ký.

PHẦN B - Tích hợp CẦN DB (class TestWorshipHallIntegration, đánh dấu `integration`):
  Mặc định bị loại bởi pytest.ini (`-m "not integration"`). Chỉ chạy khi có ALLOW_DB_TESTS=1 và `-m integration`,
  trên một nhánh DB riêng đã chạy migration 0014 (KHÔNG chạy trên production). Dữ liệu tạo ra có tiền tố
  `itest-` và được dọn trong finally. Đăng nhập được giả bằng header X-Test-User; "sang ngày" được giả bằng
  dependency get_now (vn_today nhận mốc thời gian thay thế).
"""

from __future__ import annotations

import asyncio
import importlib
import os
import re
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.errors import AppError
from app.schemas.errors import DEFAULT_ERROR_MESSAGE, ERROR_HTTP_STATUS, ErrorCode
from app.schemas.worship_hall import (
    BlessingCreate,
    HallUpdate,
    MeInfo,
    TabletBulkCreate,
    TabletItem,
    TierCreate,
    TierUpdate,
)
from app.services.worship import hall_service as hs
from app.services.worship.hall_service import (
    BLESSING,
    INCENSE,
    VN_TZ,
    Viewer,
    WorshipHallService,
    check_view_access,
    compute_next_streak,
    default_hall_title,
    default_tier_title,
    effective_streak,
    moderate_blessing,
    next_offer_at,
    require_manager,
    tier_for_generation,
    validate_image_filename,
    vn_today,
)


# =============================================================================
# A1. NGÀY GIỜ VIỆT NAM (UTC+7 cố định)
# =============================================================================

def test_vn_today_before_midnight_is_still_same_day():
    # 23:59:59 giờ VN ngày 11/11 = 16:59:59 UTC cùng ngày
    assert vn_today(datetime(2026, 11, 11, 16, 59, 59, tzinfo=timezone.utc)) == date(2026, 11, 11)
    assert vn_today(datetime(2026, 11, 11, 23, 59, 59, tzinfo=VN_TZ)) == date(2026, 11, 11)


def test_vn_today_at_midnight_rolls_to_next_day():
    # 00:00:00 giờ VN ngày 12/11 = 17:00:00 UTC ngày 11/11
    assert vn_today(datetime(2026, 11, 11, 17, 0, 0, tzinfo=timezone.utc)) == date(2026, 11, 12)
    assert vn_today(datetime(2026, 11, 12, 0, 0, 0, tzinfo=VN_TZ)) == date(2026, 11, 12)


def test_vn_today_naive_datetime_is_treated_as_utc():
    assert vn_today(datetime(2026, 11, 11, 17, 0, 0)) == date(2026, 11, 12)
    assert vn_today(datetime(2026, 11, 11, 16, 0, 0)) == date(2026, 11, 11)


def test_vn_today_without_argument_matches_real_clock():
    expected = datetime.now(timezone.utc).astimezone(VN_TZ).date()
    assert vn_today() in (expected, expected + timedelta(days=1))  # chịu được lúc chạy vắt qua 00:00


def test_next_offer_at_is_next_midnight_vn():
    nxt = next_offer_at(datetime(2026, 11, 11, 16, 59, 59, tzinfo=timezone.utc))  # 23:59:59 VN
    assert nxt == datetime(2026, 11, 12, 0, 0, 0, tzinfo=VN_TZ)
    assert nxt.isoformat() == "2026-11-12T00:00:00+07:00"
    # đúng 00:00:00 VN: lần tiếp theo là 00:00 của NGÀY KẾ TIẾP
    assert next_offer_at(datetime(2026, 11, 12, 0, 0, 0, tzinfo=VN_TZ)).isoformat() == "2026-11-13T00:00:00+07:00"


# =============================================================================
# A2. CHUỖI NGÀY
# =============================================================================

D = date(2026, 11, 12)


def test_streak_first_time():
    assert compute_next_streak(None, D, 0, 0) == (1, 1)


def test_streak_first_time_keeps_existing_longest():
    assert compute_next_streak(None, D, 0, 3) == (1, 3)


def test_streak_consecutive_day_increments():
    assert compute_next_streak(D - timedelta(days=1), D, 3, 3) == (4, 4)


def test_streak_skip_one_day_resets_to_one():
    assert compute_next_streak(D - timedelta(days=2), D, 5, 5) == (1, 5)


def test_streak_skip_many_days_resets_and_keeps_longest():
    assert compute_next_streak(D - timedelta(days=30), D, 2, 7) == (1, 7)


def test_streak_longest_is_kept_when_current_is_lower():
    assert compute_next_streak(D - timedelta(days=1), D, 2, 9) == (3, 9)


def test_streak_longest_grows_with_current():
    assert compute_next_streak(D - timedelta(days=1), D, 9, 9) == (10, 10)


def test_streak_same_day_changes_nothing():
    assert compute_next_streak(D, D, 4, 6) == (4, 6)


def test_effective_streak_shows_zero_after_missing_a_day():
    assert effective_streak(None, D, 0) == 0
    assert effective_streak(D, D, 4) == 4  # đã thắp hôm nay
    assert effective_streak(D - timedelta(days=1), D, 4) == 4  # hôm qua: còn cơ hội nối chuỗi
    assert effective_streak(D - timedelta(days=2), D, 4) == 0  # đã đứt


# =============================================================================
# A3. TẦNG THEO ĐỜI
# =============================================================================

@pytest.mark.parametrize(
    "generation, expected",
    [(1, 1), (2, 2), (5, 5), (6, 6), (7, 6), (9, 6), (None, 6), (0, 1), (-3, 1), ("7", 6), ("abc", 6)],
)
def test_tier_for_generation(generation, expected):
    assert tier_for_generation(generation) == expected


def test_default_tier_title():
    assert default_tier_title(1) == "Thủy tổ / Đời 1"
    assert default_tier_title(2) == "Đời 2"
    assert default_tier_title(6) == "Đời 6"


def test_default_hall_title_does_not_repeat_prefix():
    assert default_hall_title("Nguyễn") == "Dòng họ Nguyễn"
    assert default_hall_title("  Trần ") == "Dòng họ Trần"
    assert default_hall_title("Dòng họ Lê") == "Dòng họ Lê"
    assert default_hall_title("dong ho Pham") == "dong ho Pham"
    assert default_hall_title("DÒNG HỌ Vũ") == "DÒNG HỌ Vũ"


# =============================================================================
# A4. LỌC LỜI VIẾNG
# =============================================================================

@pytest.mark.parametrize(
    "content",
    [
        "Con cháu kính nhớ công ơn tổ tiên, cầu mong ông bà an nghỉ nơi chín suối.",
        "Chúc các cụ ngủ yên, con cháu nhớ ơn.",
        "Buổi sáng con thắp nén hương lên bàn thờ.",
        "Lớn lên rồi con mới hiểu công ơn các cụ.",
        "Năm 1975 gia đình ta đoàn tụ, nay con cháu quây quần.",
        "Con đeo khăn tang đứng trước bàn thờ cụ.",
        "Kính nhớ ông bà tổ tiên.",
    ],
)
def test_moderate_blessing_accepts_decent_text(content):
    result = moderate_blessing(content)
    assert result.ok is True, (content, result)


@pytest.mark.parametrize(
    "content",
    [
        "đồ chó",
        "Địt mẹ mày",
        "dit me may",
        "ditttttt",  # kéo dài chữ
        "ĐỤ",  # viết hoa
        "vcl",
        "fuck you",
        "đ.ị.t",  # chèn dấu
        "l0n",  # 0 -> o
        "c@c",  # @ -> a
        "l.o.n",
        "b u o i",  # tách chữ
        "d i t",
        "Thằng ngu",
    ],
)
def test_moderate_blessing_rejects_profanity_even_when_disguised(content):
    result = moderate_blessing(content)
    assert result.ok is False, content
    assert result.code == "profanity"


@pytest.mark.parametrize(
    "content",
    [
        "Xem tại https://abc.xyz",
        "http://abc.xyz/x",
        "vào www.abc.net ngay",
        "ghé abc.com nhé",
        "bit.ly/abc",
        "mua hàng tại shop.vn",
    ],
)
def test_moderate_blessing_rejects_links(content):
    result = moderate_blessing(content)
    assert (result.ok, result.code) == (False, "link"), content


@pytest.mark.parametrize(
    "content",
    ["Gọi 0912345678 nhé", "liên hệ 0912 345 678", "ĐT 091-234-5678", "zalo 091.234.5678", "84912345678"],
)
def test_moderate_blessing_rejects_phone_numbers(content):
    result = moderate_blessing(content)
    assert (result.ok, result.code) == (False, "phone"), content


def test_moderate_blessing_length_limit_is_300():
    ok_text = ("Kính nhớ tổ tiên. " * 30)[:300]
    assert len(ok_text) == 300
    assert moderate_blessing(ok_text).ok is True
    too_long = moderate_blessing(ok_text + "a")
    assert (too_long.ok, too_long.code) == (False, "too_long")
    assert "Lời viếng" in too_long.reason and "300" in too_long.reason


@pytest.mark.parametrize("content", ["", "   ", "\n\t", None])
def test_moderate_blessing_rejects_empty(content):
    result = moderate_blessing(content)
    assert (result.ok, result.code) == (False, "empty")


def test_moderation_messages_say_loi_vieng():
    for bad in ("", "x" * 301, "https://a.b", "0912345678", "đồ chó"):
        assert "Lời viếng" in moderate_blessing(bad).reason


def test_ai_moderation_fails_open_when_gemini_is_not_ready(monkeypatch):
    gm = importlib.import_module("app.services.ai.gemini_service")  # package re-export trung ten voi submodule

    class Boom:
        def is_configured(self):
            raise RuntimeError("không có Gemini")

    monkeypatch.setattr(gm, "gemini_service", Boom())
    assert asyncio.run(hs.ai_moderate_blessing("Kính nhớ tổ tiên")) is None


def test_ai_moderation_fails_open_on_timeout(monkeypatch):
    gm = importlib.import_module("app.services.ai.gemini_service")  # package re-export trung ten voi submodule

    class Slow:
        def is_configured(self):
            return True

        async def generate_content_safe(self, *a, **k):
            await asyncio.sleep(5)
            return {"success": True, "response": "BLOCK"}

    monkeypatch.setattr(gm, "gemini_service", Slow())
    started = time.monotonic()
    assert asyncio.run(hs.ai_moderate_blessing("Kính nhớ tổ tiên", timeout_seconds=0.05)) is None
    assert time.monotonic() - started < 2


def test_ai_moderation_blocks_only_on_explicit_block(monkeypatch):
    gm = importlib.import_module("app.services.ai.gemini_service")  # package re-export trung ten voi submodule

    class Fake:
        answer = "OK"

        def is_configured(self):
            return True

        async def generate_content_safe(self, *a, **k):
            return {"success": True, "response": self.answer}

    fake = Fake()
    monkeypatch.setattr(gm, "gemini_service", fake)
    assert asyncio.run(hs.ai_moderate_blessing("Kính nhớ tổ tiên")) is None
    fake.answer = "BLOCK"
    reason = asyncio.run(hs.ai_moderate_blessing("Kính nhớ tổ tiên"))
    assert reason and "Lời viếng" in reason


# =============================================================================
# A5. TÊN TỆP ẢNH (chống ../), QUYỀN XEM / QUẢN LÝ
# =============================================================================

@pytest.mark.parametrize(
    "filename, media",
    [("a.png", "image/png"), ("a.JPG", "image/jpeg"), ("a.jpeg", "image/jpeg"), ("a.webp", "image/webp"),
     ("0f3a9c.PNG", "image/png")],
)
def test_validate_image_filename_accepts(filename, media):
    assert validate_image_filename(filename) == media


@pytest.mark.parametrize(
    "filename",
    ["../secret.png", "..\\secret.png", "a/b.png", "a\\b.png", "evil..png", "x.svg", "x.gif", "x.png.exe",
     "noext", "", "x.png\x00", "/etc/passwd"],
)
def test_validate_image_filename_rejects_traversal_and_bad_extension(filename):
    with pytest.raises(AppError) as exc:
        validate_image_filename(filename)
    assert exc.value.status_code == 400


def test_guest_can_view_public_hall_but_not_clan_only():
    guest = Viewer()
    check_view_access("PUBLIC", guest)
    check_view_access("public", guest)
    for visibility in ("CLAN_ONLY", "SOMETHING_ELSE", None):
        with pytest.raises(AppError) as exc:
            check_view_access(visibility, guest)
        assert exc.value.status_code == 401


def test_outsider_cannot_view_clan_only_hall():
    outsider = Viewer(user_id=uuid.uuid4())
    check_view_access("PUBLIC", outsider)
    with pytest.raises(AppError) as exc:
        check_view_access("CLAN_ONLY", outsider)
    assert exc.value.status_code == 403


def test_member_leader_and_admin_can_view_clan_only_hall():
    uid = uuid.uuid4()
    for viewer in (Viewer(uid, is_member=True), Viewer(uid, is_leader=True), Viewer(uid, is_system_admin=True)):
        check_view_access("CLAN_ONLY", viewer)


def test_only_leader_or_admin_can_manage():
    uid = uuid.uuid4()
    with pytest.raises(AppError) as guest_exc:
        require_manager(Viewer())
    assert guest_exc.value.status_code == 401
    for viewer in (Viewer(uid), Viewer(uid, is_member=True)):  # người ngoài và thành viên thường
        with pytest.raises(AppError) as exc:
            require_manager(viewer)
        assert exc.value.status_code == 403
    require_manager(Viewer(uid, is_leader=True))
    require_manager(Viewer(uid, is_system_admin=True))


# =============================================================================
# A5b. canOffer (me.canOffer) VÀ BÀI VỊ ẨN CHO NGƯỜI QUẢN LÝ - logic thuần, không cần DB
# =============================================================================

def _viewers_for_offer():
    uid = uuid.uuid4()
    return {
        "guest": (Viewer(), False),
        "outsider": (Viewer(uid), False),
        "member": (Viewer(uid, is_member=True), True),
        "leader": (Viewer(uid, is_leader=True), True),
        "admin": (Viewer(uid, is_system_admin=True), True),
    }


@pytest.mark.parametrize("who", ["guest", "outsider", "member", "leader", "admin"])
def test_viewer_can_offer(who):
    viewer, expected = _viewers_for_offer()[who]
    assert viewer.can_offer is expected


def test_offer_and_hall_view_share_the_same_permission_check():
    """POST incense/blessing (offer) và me.canOffer của GET /hall phải dùng cùng một hàm kiểm quyền."""
    import inspect

    offer_src = inspect.getsource(WorshipHallService.offer)
    assert "viewer.can_offer" in offer_src
    assert "viewer.can_offer" in inspect.getsource(WorshipHallService.get_hall_view)
    # sau bước check_view_access, offer không được tự kiểm quyền bằng logic khác
    assert "can_view_private" not in offer_src.split("check_view_access", 1)[1]


def test_me_info_exposes_can_offer_camel_case_default_false():
    assert MeInfo().can_offer is False
    assert MeInfo(can_offer=True).model_dump(by_alias=True)["canOffer"] is True
    assert "canOffer" in MeInfo().model_dump(by_alias=True)


def test_tablet_item_exposes_is_visible_camel_case():
    item = TabletItem(id=uuid.uuid4(), person_id=uuid.uuid4(), full_name="A")
    assert item.is_visible is True
    assert item.model_dump(by_alias=True)["isVisible"] is True
    hidden = TabletItem(id=uuid.uuid4(), person_id=uuid.uuid4(), full_name="A", is_visible=False)
    assert hidden.model_dump(by_alias=True)["isVisible"] is False


def _filter_sql(viewer) -> str:
    from sqlalchemy.dialects import postgresql

    conds = WorshipHallService(None)._tablet_filters(viewer)
    return " AND ".join(str(c.compile(dialect=postgresql.dialect())) for c in conds)


def test_regular_viewers_filter_out_hidden_tablets_but_managers_do_not():
    uid = uuid.uuid4()
    for viewer in (Viewer(), Viewer(uid), Viewer(uid, is_member=True)):
        assert "is_visible IS true" in _filter_sql(viewer)
    for viewer in (Viewer(uid, is_leader=True), Viewer(uid, is_system_admin=True)):
        assert WorshipHallService(None)._tablet_filters(viewer) == []


def test_tablet_item_reports_is_visible_from_the_row():
    """Người quản lý nhận cả bài vị ẩn (isVisible=False); người xem thường đã bị loại bài vị ẩn ở truy vấn."""
    from types import SimpleNamespace

    wp = SimpleNamespace(
        worship_person_id=uuid.uuid4(), portrait_image_path=None, note=None, display_order=0,
        tier_id=uuid.uuid4(), is_visible=False,
    )
    person = SimpleNamespace(
        id=uuid.uuid4(), full_name="Nguyễn Văn A", generation=2, birth_date=None, death_date=None, avatar_url=None,
    )
    svc = WorshipHallService(None)
    item = svc._tablet_item(wp, person, None, uuid.uuid4(), Viewer(uuid.uuid4(), is_leader=True))
    assert item.is_visible is False
    wp.is_visible = True
    assert svc._tablet_item(wp, person, None, uuid.uuid4(), Viewer(uuid.uuid4(), is_member=True)).is_visible is True


# =============================================================================
# A6. THÔNG BÁO 409, SCHEMA, MÃ LỖI
# =============================================================================

def test_already_offered_error_contract():
    assert ERROR_HTTP_STATUS[ErrorCode.ALREADY_OFFERED_TODAY] == 409
    assert "ngày mai" in DEFAULT_ERROR_MESSAGE[ErrorCode.ALREADY_OFFERED_TODAY]
    now = datetime(2026, 11, 11, 16, 59, 59, tzinfo=timezone.utc)  # 23:59:59 giờ VN
    with pytest.raises(AppError) as exc:
        WorshipHallService._raise_already_offered(INCENSE, now)
    err = exc.value
    assert err.status_code == 409 and err.code == ErrorCode.ALREADY_OFFERED_TODAY
    assert "thắp hương" in err.message and "00:00 ngày 12/11/2026" in err.message
    assert err.details["next_offer_at"] == "2026-11-12T00:00:00+07:00"
    assert err.details["retry_after_seconds"] == 1
    with pytest.raises(AppError) as exc2:
        WorshipHallService._raise_already_offered(BLESSING, now)
    assert "Lời viếng" in exc2.value.message


def test_bulk_schema_accepts_at_most_50_ids():
    ids = [str(uuid.uuid4()) for _ in range(50)]
    assert len(TabletBulkCreate.model_validate({"personIds": ids}).person_ids) == 50
    with pytest.raises(ValidationError):
        TabletBulkCreate.model_validate({"personIds": ids + [str(uuid.uuid4())]})
    with pytest.raises(ValidationError):
        TabletBulkCreate.model_validate({"personIds": []})


def test_schemas_validation_rules():
    with pytest.raises(ValidationError):
        TierCreate(title="Tầng 7", tier_no=7)
    with pytest.raises(ValidationError):
        TierCreate(title="")
    with pytest.raises(ValidationError):
        TierUpdate(tier_no=0)
    with pytest.raises(ValidationError):
        HallUpdate(visibility="SECRET")
    assert HallUpdate.model_validate({"blessingsEnabled": False}).blessings_enabled is False
    assert HallUpdate(visibility="PUBLIC").visibility == "PUBLIC"
    with pytest.raises(ValidationError):
        BlessingCreate(content="x" * 2001)


# =============================================================================
# A7. ĐỐI CHIẾU ORM VỚI MIGRATION 0014 (đọc mã nguồn, không kết nối DB)
# =============================================================================

MIGRATION = Path(__file__).resolve().parent.parent / "alembic" / "versions" / "0014_worship_hall.py"


def _migration_parts() -> tuple[str, str, str]:
    text = MIGRATION.read_text(encoding="utf-8")
    head, _, rest = text.partition("def upgrade()")
    upgrade, _, downgrade = rest.partition("def downgrade()")
    return head, upgrade, downgrade


def test_migration_chain_and_revision():
    head, _, _ = _migration_parts()
    assert re.search(r'revision: str = "0014_worship_hall"', head)
    assert re.search(r'down_revision: .* = "0013_funds_and_donations"', head)


def test_migration_orm_columns_exist_in_migration():
    from app.models.worship.entities import (
        WorshipDailyOffering,
        WorshipPerson,
        WorshipSpace,
        WorshipStreak,
        WorshipTier,
    )

    _, upgrade, _ = _migration_parts()
    for model in (WorshipSpace, WorshipTier, WorshipPerson, WorshipDailyOffering, WorshipStreak):
        assert re.search(rf"\b{model.__tablename__}\b", upgrade), model.__tablename__
        for column in model.__table__.columns:
            assert re.search(rf"\b{column.name}\b", upgrade), f"{model.__tablename__}.{column.name} thiếu trong migration"


def test_migration_is_additive_and_idempotent():
    _, upgrade, downgrade = _migration_parts()
    assert not re.search(r"\bDROP\b", upgrade, re.I)
    assert not re.search(r"\bTRUNCATE\b|\bDELETE\s+FROM\b|\bRENAME\b", upgrade, re.I)
    for statement in re.findall(r"CREATE TABLE[^\(]*", upgrade):
        assert "IF NOT EXISTS" in statement, statement
    for statement in re.findall(r"ADD COLUMN[^\n]*", upgrade):
        assert "IF NOT EXISTS" in statement, statement
    for statement in re.findall(r"CREATE (?:UNIQUE )?INDEX[^\n]*", upgrade):
        assert "IF NOT EXISTS" in statement, statement
    # downgrade không được xóa hai bảng có từ trước
    assert not re.search(r"DROP TABLE[^\n]*worship_spaces", downgrade)
    assert not re.search(r"DROP TABLE[^\n]*worship_persons", downgrade)


def test_migration_creates_tiers_before_tier_id_column():
    _, upgrade, downgrade = _migration_parts()
    created = upgrade.index("CREATE TABLE IF NOT EXISTS worship_tiers")
    column = upgrade.index("ADD COLUMN IF NOT EXISTS tier_id")
    assert created < column
    # downgrade phải gỡ cột tier_id TRƯỚC khi drop bảng tầng
    assert downgrade.index("DROP COLUMN IF EXISTS tier_id") < downgrade.index("DROP TABLE IF EXISTS worship_tiers")


def test_migration_has_required_constraints():
    _, upgrade, _ = _migration_parts()
    for name in (
        "uq_worship_spaces_clan",
        "uq_worship_tiers_space_tier_no",
        "uq_worship_daily_offering",
        "uq_worship_persons_space_person",
    ):
        assert name in upgrade, name
    assert "UNIQUE (space_id, user_id, offering_type, offer_date)" in upgrade
    assert "UNIQUE (space_id, tier_no)" in upgrade
    assert "tier_no BETWEEN 1 AND 6" in upgrade
    assert "PRIMARY KEY (space_id, user_id, offering_type)" in upgrade


def test_orm_matches_migration_key_types():
    from app.models.worship.entities import WorshipDailyOffering, WorshipStreak, WorshipTier

    assert {c.name for c in WorshipDailyOffering.__table__.c} >= {
        "offering_id", "space_id", "user_id", "offering_type", "offer_date", "content", "status", "created_at"
    }
    assert [c.name for c in WorshipStreak.__table__.primary_key.columns] == ["space_id", "user_id", "offering_type"]
    assert WorshipTier.__table__.c.tier_no.type.__class__.__name__ == "SmallInteger"
    assert WorshipDailyOffering.__table__.c.offer_date.type.__class__.__name__ == "Date"


# =============================================================================
# A8. ROUTE ĐÃ ĐĂNG KÝ
# =============================================================================

def test_all_worship_hall_routes_are_registered():
    from app.main import app

    registered = set()
    for route in app.routes:
        path = getattr(route, "path", "")
        for method in getattr(route, "methods", None) or ():
            registered.add((method, path))
    base = "/families/{clan_id}/worship"
    expected = [
        ("GET", "/hall"), ("PATCH", "/hall"),
        ("GET", "/tiers/{tier_id}/tablets"),
        ("POST", "/incense"), ("POST", "/blessing"), ("GET", "/blessings"), ("GET", "/me/streaks"),
        ("POST", "/tablets"), ("POST", "/tablets/bulk"), ("PUT", "/tablets/reorder"),
        ("PATCH", "/tablets/{tablet_id}"), ("DELETE", "/tablets/{tablet_id}"),
        ("POST", "/tablets/{tablet_id}/portrait"), ("DELETE", "/tablets/{tablet_id}/portrait"),
        ("POST", "/hall/cover"), ("DELETE", "/hall/cover"),
        ("POST", "/tiers"), ("PUT", "/tiers/reorder"), ("PATCH", "/tiers/{tier_id}"), ("DELETE", "/tiers/{tier_id}"),
        ("PATCH", "/blessings/{blessing_id}/hide"), ("DELETE", "/blessings/{blessing_id}"),
        ("GET", "/candidates"), ("GET", "/images/{filename}"),
    ]
    for method, tail in expected:
        assert (method, base + tail) in registered, (method, tail)
        assert (method, "/api/v1" + base + tail) in registered or any(
            m == method and p.endswith(base + tail) and p != base + tail for m, p in registered
        ), f"thiếu bản có tiền tố API: {method} {tail}"


# =============================================================================
# PHẦN B. TÍCH HỢP (CẦN DB) - chỉ viết, chạy trên nhánh DB riêng
# =============================================================================

integration = pytest.mark.integration

PNG_16 = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x64\x00\x00\x00\x64\x08\x02\x00\x00\x00"
)


class _Clock:
    """Đồng hồ giả cho dependency get_now: `advance(days=1)` = sang ngày hôm sau."""

    def __init__(self) -> None:
        # Giữa trưa giờ VN, để cộng 1 ngày không bao giờ vắt qua ranh giới do giờ chạy test
        today = datetime.now(timezone.utc).astimezone(VN_TZ).date()
        self.now = datetime(today.year, today.month, today.day, 12, 0, 0, tzinfo=VN_TZ)

    def advance(self, days: int = 1) -> None:
        self.now += timedelta(days=days)


class _World:
    pass


@pytest.fixture
async def world():
    if os.environ.get("ALLOW_DB_TESTS") != "1":
        pytest.skip("Cần ALLOW_DB_TESTS=1 và một nhánh DB riêng (KHÔNG dùng production).")

    import httpx
    from fastapi import Request
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from sqlalchemy.pool import NullPool

    from app.controllers.worship_hall import router as hall_router_module  # noqa: F401
    from app.controllers.worship_hall.router import get_optional_account
    from app.db.postgres import get_db, make_engine
    from app.dependencies.auth import get_current_account
    from app.main import app
    from app.models.family.entities import Clan, ClanMembership
    from app.models.genealogy.entities import Person, PersonPrivacySetting
    from app.models.user_access.entities import User

    engine = make_engine(poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    tag = f"itest-{uuid.uuid4().hex[:8]}"
    clock = _Clock()

    w = _World()
    w.tag, w.maker, w.clock = tag, maker, clock
    w.clan_ids, w.user_ids = [], []

    def mk_user(name: str) -> User:
        u = User(
            user_id=uuid.uuid4(), email=f"{tag}-{name}@example.test", display_name=f"{tag} {name}", status="ACTIVE"
        )
        w.user_ids.append(u.user_id)
        return u

    def mk_person(clan, name, *, generation=None, dead=True, birth=date(1930, 1, 1), death=date(1990, 5, 5)):
        return Person(
            id=uuid.uuid4(), family_id=clan.clan_id, full_name=f"{tag} {name}", generation=generation,
            is_alive=not dead, birth_date=birth, death_date=death if dead else None,
        )

    try:
        async with maker() as s:
            w.leader_a, w.member_a, w.member_a2 = mk_user("leader-a"), mk_user("member-a"), mk_user("member-a2")
            w.outsider, w.leader_b, w.member_b = mk_user("outsider"), mk_user("leader-b"), mk_user("member-b")
            s.add_all([w.leader_a, w.member_a, w.member_a2, w.outsider, w.leader_b, w.member_b])
            await s.flush()
            w.clan_a = Clan(clan_id=uuid.uuid4(), clan_code=f"{tag}-A", name="Nguyễn", status="ACTIVE",
                            created_by=w.leader_a.user_id)
            w.clan_b = Clan(clan_id=uuid.uuid4(), clan_code=f"{tag}-B", name="Trần", status="ACTIVE",
                            created_by=w.leader_b.user_id)
            s.add_all([w.clan_a, w.clan_b])
            await s.flush()
            w.clan_ids = [w.clan_a.clan_id, w.clan_b.clan_id]
            s.add_all([
                ClanMembership(clan_id=w.clan_a.clan_id, user_id=w.member_a.user_id, status="ACTIVE"),
                ClanMembership(clan_id=w.clan_a.clan_id, user_id=w.member_a2.user_id, status="ACTIVE"),
                ClanMembership(clan_id=w.clan_b.clan_id, user_id=w.member_b.user_id, status="ACTIVE"),
            ])
            w.p1 = mk_person(w.clan_a, "doi1", generation=1)
            w.p5 = mk_person(w.clan_a, "doi5", generation=5)
            w.p6 = mk_person(w.clan_a, "doi6", generation=6)
            w.p9 = mk_person(w.clan_a, "doi9", generation=9)
            w.p_none = mk_person(w.clan_a, "khongdoi", generation=None)
            w.p_alive = mk_person(w.clan_a, "consong", generation=3, dead=False)
            w.p_other_clan = mk_person(w.clan_b, "dongho-khac", generation=2)
            w.p_private = mk_person(w.clan_a, "riengtu", generation=2)
            w.crowd = [mk_person(w.clan_a, f"dong-{i:02d}", generation=3) for i in range(15)]
            s.add_all([w.p1, w.p5, w.p6, w.p9, w.p_none, w.p_alive, w.p_other_clan, w.p_private, *w.crowd])
            await s.flush()
            s.add(PersonPrivacySetting(person_id=w.p_private.id, full_name_visibility="PRIVATE"))
            await s.commit()

        async def override_db():
            async with maker() as session:
                yield session

        async def fake_account(request: Request) -> User:
            raw = request.headers.get("x-test-user")
            if not raw:
                raise AppError(ErrorCode.UNAUTHENTICATED, headers={"WWW-Authenticate": "Bearer"})
            async with maker() as session:
                return await session.get(User, uuid.UUID(raw))

        async def fake_optional(request: Request):
            return await fake_account(request) if request.headers.get("x-test-user") else None

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_account] = fake_account
        app.dependency_overrides[get_optional_account] = fake_optional
        app.dependency_overrides[hs.get_now] = lambda: clock.now

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            w.client = client
            yield w
    finally:
        app.dependency_overrides.pop(hs.get_now, None)
        from app.db.postgres import get_db as _g
        from app.dependencies.auth import get_current_account as _a
        from app.controllers.worship_hall.router import get_optional_account as _o
        for dep in (_g, _a, _o):
            app.dependency_overrides.pop(dep, None)
        try:
            async with maker() as s:
                if w.clan_ids:
                    params = {"c": w.clan_ids}
                    files = (
                        await s.execute(
                            text(
                                "SELECT cover_image_path FROM worship_spaces WHERE clan_id = ANY(:c) "
                                "AND cover_image_path IS NOT NULL UNION "
                                "SELECT wp.portrait_image_path FROM worship_persons wp "
                                "JOIN worship_spaces ws ON ws.space_id = wp.space_id WHERE ws.clan_id = ANY(:c) "
                                "AND wp.portrait_image_path IS NOT NULL"
                            ),
                            params,
                        )
                    ).scalars().all()
                    for name in files:
                        hs._remove_image_file(name)
                    for sql in (
                        "DELETE FROM worship_daily_offerings WHERE space_id IN (SELECT space_id FROM worship_spaces WHERE clan_id = ANY(:c))",
                        "DELETE FROM worship_streaks WHERE space_id IN (SELECT space_id FROM worship_spaces WHERE clan_id = ANY(:c))",
                        "DELETE FROM worship_persons WHERE space_id IN (SELECT space_id FROM worship_spaces WHERE clan_id = ANY(:c))",
                        "DELETE FROM worship_tiers WHERE space_id IN (SELECT space_id FROM worship_spaces WHERE clan_id = ANY(:c))",
                        "DELETE FROM worship_spaces WHERE clan_id = ANY(:c)",
                        "DELETE FROM audit_logs WHERE clan_id = ANY(:c)",
                        "DELETE FROM person_privacy_settings WHERE person_id IN (SELECT person_id FROM persons WHERE clan_id = ANY(:c))",
                        "DELETE FROM persons WHERE clan_id = ANY(:c)",
                        "DELETE FROM clan_memberships WHERE clan_id = ANY(:c)",
                        "DELETE FROM clans WHERE clan_id = ANY(:c)",
                    ):
                        await s.execute(text(sql), params)
                if w.user_ids:
                    await s.execute(text("DELETE FROM users WHERE user_id = ANY(:u)"), {"u": w.user_ids})
                await s.commit()
        finally:
            await engine.dispose()


def _h(user=None) -> dict:
    return {"x-test-user": str(user.user_id)} if user is not None else {}


def _url(clan, tail: str) -> str:
    return f"/families/{clan.clan_id}/worship{tail}"


async def _call(w, method: str, clan, tail: str, user=None, **kwargs):
    return await w.client.request(method, _url(clan, tail), headers=_h(user), **kwargs)


def _code(resp) -> str:
    return resp.json()["error"]["code"]


async def _make_hall(w) -> dict:
    """Trưởng tộc A tạo phòng (PATCH hall tạo phòng nếu chưa có)."""
    resp = await _call(w, "PATCH", w.clan_a, "/hall", w.leader_a, json={"blessingsEnabled": True})
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _add(w, person, user=None, **extra):
    return await _call(w, "POST", w.clan_a, "/tablets", user or w.leader_a, json={"personId": str(person.id), **extra})


async def _tiers(w, user=None) -> list:
    resp = await _call(w, "GET", w.clan_a, "/hall", user or w.leader_a)
    assert resp.status_code == 200, resp.text
    return resp.json()["tiers"]


@integration
class TestWorshipHallIntegration:
    # ------------------------------------------------------------------ thắp hương / Lời viếng
    async def test_incense_once_per_day_then_409(self, world):
        w = world
        first = await _call(w, "POST", w.clan_a, "/incense", w.member_a)
        assert first.status_code == 200, first.text
        assert first.json()["streak"]["current"] == 1
        second = await _call(w, "POST", w.clan_a, "/incense", w.member_a)
        assert second.status_code == 409
        assert _code(second) == "ALREADY_OFFERED_TODAY"
        assert "next_offer_at" in second.json()["error"]["details"]
        # thành viên khác vẫn thắp được (mỗi thành viên một lần)
        other = await _call(w, "POST", w.clan_a, "/incense", w.member_a2)
        assert other.status_code == 200
        assert other.json()["todayCount"] == 2

    @pytest.mark.concurrency
    async def test_parallel_incense_only_one_succeeds(self, world):
        w = world
        results = await asyncio.gather(*[_call(w, "POST", w.clan_a, "/incense", w.member_a) for _ in range(6)])
        statuses = sorted(r.status_code for r in results)
        assert statuses.count(200) == 1, statuses
        assert statuses.count(409) == 5, statuses
        streaks = (await _call(w, "GET", w.clan_a, "/me/streaks", w.member_a)).json()
        assert streaks["incenseStreak"]["total"] == 1 and streaks["incenseStreak"]["current"] == 1

    @pytest.mark.concurrency
    async def test_parallel_blessing_only_one_succeeds(self, world):
        w = world
        body = {"content": "Con cháu kính nhớ tổ tiên."}
        results = await asyncio.gather(*[_call(w, "POST", w.clan_a, "/blessing", w.member_a, json=body) for _ in range(4)])
        statuses = sorted(r.status_code for r in results)
        assert statuses.count(200) == 1 and statuses.count(409) == 3, statuses
        items = (await _call(w, "GET", w.clan_a, "/blessings", w.member_a)).json()["items"]
        assert len(items) == 1

    async def test_next_day_incense_streak_plus_one(self, world):
        w = world
        assert (await _call(w, "POST", w.clan_a, "/incense", w.member_a)).json()["streak"]["current"] == 1
        w.clock.advance(1)
        me = (await _call(w, "GET", w.clan_a, "/hall", w.member_a)).json()["me"]
        assert me["incenseDoneToday"] is False and me["incenseStreak"]["current"] == 1
        second = await _call(w, "POST", w.clan_a, "/incense", w.member_a)
        assert second.status_code == 200
        assert second.json()["streak"]["current"] == 2 and second.json()["streak"]["longest"] == 2

    async def test_skipping_a_day_resets_streak_but_keeps_longest(self, world):
        w = world
        for _ in range(2):  # ngày 1, ngày 2 -> chuỗi 2
            assert (await _call(w, "POST", w.clan_a, "/incense", w.member_a)).status_code == 200
            w.clock.advance(1)
        w.clock.advance(1)  # bỏ một ngày
        me = (await _call(w, "GET", w.clan_a, "/me/streaks", w.member_a)).json()
        assert me["incenseStreak"]["current"] == 0 and me["incenseStreak"]["longest"] == 2
        again = (await _call(w, "POST", w.clan_a, "/incense", w.member_a)).json()
        assert again["streak"]["current"] == 1 and again["streak"]["longest"] == 2

    async def test_incense_and_blessing_are_independent(self, world):
        w = world
        assert (await _call(w, "POST", w.clan_a, "/incense", w.member_a)).status_code == 200
        blessing = await _call(w, "POST", w.clan_a, "/blessing", w.member_a, json={"content": "Kính nhớ ông bà."})
        assert blessing.status_code == 200, blessing.text
        assert (await _call(w, "POST", w.clan_a, "/blessing", w.member_a, json={"content": "Lại viết nữa."})).status_code == 409
        w.clock.advance(1)
        # ngày 2: chỉ thắp hương; chuỗi Lời viếng không tăng, chuỗi hương tăng
        assert (await _call(w, "POST", w.clan_a, "/incense", w.member_a)).json()["streak"]["current"] == 2
        me = (await _call(w, "GET", w.clan_a, "/me/streaks", w.member_a)).json()
        assert me["incenseStreak"]["current"] == 2 and me["blessingStreak"]["current"] == 1
        assert me["incenseDoneToday"] is True and me["blessingDoneToday"] is False

    async def test_blessing_violation_is_422_and_does_not_use_up_the_day(self, world):
        w = world
        for bad in ("Địt mẹ mày", "xem https://abc.xyz", "gọi 0912345678", "x" * 301, "   "):
            resp = await _call(w, "POST", w.clan_a, "/blessing", w.member_a, json={"content": bad})
            assert resp.status_code == 422, (bad, resp.text)
            assert "Lời viếng" in resp.json()["error"]["message"]
        ok = await _call(w, "POST", w.clan_a, "/blessing", w.member_a, json={"content": "Kính nhớ tổ tiên."})
        assert ok.status_code == 200

    async def test_blessings_disabled_returns_403_but_incense_still_works(self, world):
        w = world
        resp = await _call(w, "PATCH", w.clan_a, "/hall", w.leader_a, json={"blessingsEnabled": False})
        assert resp.status_code == 200 and resp.json()["blessingsEnabled"] is False
        blocked = await _call(w, "POST", w.clan_a, "/blessing", w.member_a, json={"content": "Kính nhớ tổ tiên."})
        assert blocked.status_code == 403
        assert (await _call(w, "POST", w.clan_a, "/incense", w.member_a)).status_code == 200

    async def test_blessing_list_hide_and_delete_by_leader(self, world):
        w = world
        await _call(w, "POST", w.clan_a, "/blessing", w.member_a, json={"content": "Lời viếng của thành viên A."})
        await _call(w, "POST", w.clan_a, "/blessing", w.member_a2, json={"content": "Lời viếng của thành viên A2."})
        items = (await _call(w, "GET", w.clan_a, "/blessings", w.member_a)).json()["items"]
        assert len(items) == 2
        target = items[0]["id"]
        assert (await _call(w, "PATCH", w.clan_a, f"/blessings/{target}/hide", w.member_a)).status_code == 403
        assert (await _call(w, "PATCH", w.clan_a, f"/blessings/{target}/hide", w.leader_a)).status_code == 200
        assert len((await _call(w, "GET", w.clan_a, "/blessings", w.member_a)).json()["items"]) == 1
        remaining = (await _call(w, "GET", w.clan_a, "/blessings", w.member_a)).json()["items"][0]["id"]
        assert (await _call(w, "DELETE", w.clan_a, f"/blessings/{remaining}", w.leader_a)).status_code == 200
        assert (await _call(w, "GET", w.clan_a, "/blessings", w.member_a)).json()["items"] == []
        # Ẩn / xóa không trả lượt: người gửi vẫn không viết thêm được trong ngày
        again = await _call(w, "POST", w.clan_a, "/blessing", w.member_a, json={"content": "Viết lại lần nữa."})
        assert again.status_code == 409

    # ------------------------------------------------------------------ quyền xem
    async def test_clan_only_hall_blocks_outsider_and_guest(self, world):
        w = world
        assert (await _call(w, "GET", w.clan_a, "/hall", w.outsider)).status_code == 403
        assert (await _call(w, "GET", w.clan_a, "/hall")).status_code == 401
        assert (await _call(w, "GET", w.clan_a, "/hall", w.member_a)).status_code == 200
        assert (await _call(w, "GET", w.clan_a, "/hall", w.leader_a)).status_code == 200
        # thành viên dòng họ B không vào được phòng dòng họ A
        assert (await _call(w, "GET", w.clan_a, "/hall", w.member_b)).status_code == 403
        assert (await _call(w, "POST", w.clan_a, "/incense", w.outsider)).status_code == 403

    async def test_public_hall_guest_can_view_but_not_offer(self, world):
        w = world
        assert (await _call(w, "PATCH", w.clan_a, "/hall", w.leader_a, json={"visibility": "PUBLIC"})).status_code == 200
        assert (await _call(w, "GET", w.clan_a, "/hall")).status_code == 200
        assert (await _call(w, "GET", w.clan_a, "/blessings")).status_code == 200
        assert (await _call(w, "POST", w.clan_a, "/incense")).status_code == 401
        assert (await _call(w, "POST", w.clan_a, "/blessing", json={"content": "Kính nhớ."})).status_code == 401
        # người đăng nhập nhưng ngoài dòng họ xem được, nhưng không thắp hương / viết Lời viếng
        assert (await _call(w, "GET", w.clan_a, "/hall", w.outsider)).status_code == 200
        assert (await _call(w, "POST", w.clan_a, "/incense", w.outsider)).status_code == 403

    async def test_get_hall_does_not_write_and_returns_default_title(self, world):
        w = world
        resp = await _call(w, "GET", w.clan_b, "/hall", w.member_b)
        assert resp.status_code == 200
        body = resp.json()
        assert body["hall"]["id"] is None and body["hall"]["title"] == "Dòng họ Trần"
        assert body["hall"]["clanName"] == "Trần" and body["tiers"] == []
        from sqlalchemy import text

        async with w.maker() as s:
            n = (await s.execute(text("SELECT count(*) FROM worship_spaces WHERE clan_id = :c"),
                                 {"c": w.clan_b.clan_id})).scalar_one()
        assert n == 0

    # ------------------------------------------------------------------ phân quyền quản lý
    async def test_member_gets_403_on_every_management_endpoint(self, world):
        w = world
        await _make_hall(w)
        rid = str(uuid.uuid4())
        png = {"file": ("a.png", PNG_16, "image/png")}
        calls = [
            ("PATCH", "/hall", {"json": {"title": "Đổi tên"}}),
            ("POST", "/tablets", {"json": {"personId": str(w.p1.id)}}),
            ("POST", "/tablets/bulk", {"json": {"personIds": [str(w.p1.id)]}}),
            ("PUT", "/tablets/reorder", {"json": {"orderedIds": [rid]}}),
            ("PATCH", f"/tablets/{rid}", {"json": {"note": "x"}}),
            ("DELETE", f"/tablets/{rid}", {}),
            ("POST", f"/tablets/{rid}/portrait", {"files": png}),
            ("DELETE", f"/tablets/{rid}/portrait", {}),
            ("POST", "/hall/cover", {"files": png}),
            ("DELETE", "/hall/cover", {}),
            ("POST", "/tiers", {"json": {"title": "Tầng mới"}}),
            ("PUT", "/tiers/reorder", {"json": {"orderedIds": [rid]}}),
            ("PATCH", f"/tiers/{rid}", {"json": {"title": "x"}}),
            ("DELETE", f"/tiers/{rid}", {}),
            ("PATCH", f"/blessings/{rid}/hide", {}),
            ("DELETE", f"/blessings/{rid}", {}),
            ("GET", "/candidates", {}),
        ]
        for method, tail, kwargs in calls:
            resp = await _call(w, method, w.clan_a, tail, w.member_a, **kwargs)
            assert resp.status_code == 403, (method, tail, resp.status_code, resp.text)
            guest = await _call(w, method, w.clan_a, tail, None, **kwargs)
            assert guest.status_code == 401, (method, tail, guest.status_code)

    async def test_leader_of_one_clan_cannot_touch_another_clan(self, world):
        w = world
        resp = await _call(w, "PATCH", w.clan_b, "/hall", w.leader_a, json={"title": "Chiếm phòng"})
        assert resp.status_code == 403
        added = await _call(w, "POST", w.clan_b, "/tablets", w.leader_a, json={"personId": str(w.p_other_clan.id)})
        assert added.status_code == 403
        assert (await _call(w, "GET", w.clan_b, "/candidates", w.leader_a)).status_code == 403
        assert (await _call(w, "POST", w.clan_b, "/tiers", w.leader_a, json={"title": "x"})).status_code == 403

    # ------------------------------------------------------------------ bài vị
    async def test_add_tablet_rules(self, world):
        w = world
        alive = await _add(w, w.p_alive)
        assert alive.status_code == 422, alive.text
        other = await _add(w, w.p_other_clan)  # người của dòng họ B
        assert other.status_code == 404, other.text
        ok = await _add(w, w.p1)
        assert ok.status_code == 201, ok.text
        tablet = ok.json()
        assert tablet["personId"] == str(w.p1.id) and tablet["tierId"]
        assert tablet["birthDate"] == "1930-01-01" and tablet["deathDate"] == "1990-05-05"
        assert "portraitUrl" in tablet
        dup = await _add(w, w.p1)
        assert dup.status_code == 409 and _code(dup) == "DUPLICATE_RESOURCE"

    async def test_tablets_are_placed_in_tiers_by_generation(self, world):
        w = world
        for person in (w.p1, w.p5, w.p6, w.p9, w.p_none):
            assert (await _add(w, person)).status_code == 201
        by_no = {t["tierNo"]: t for t in await _tiers(w)}
        assert sorted(by_no) == [1, 5, 6]
        assert by_no[1]["title"] == "Thủy tổ / Đời 1" and by_no[1]["total"] == 1
        assert by_no[5]["title"] == "Đời 5" and by_no[5]["total"] == 1
        assert by_no[6]["title"] == "Đời 6" and by_no[6]["total"] == 3  # đời 6, 9 và không rõ đời
        hall = (await _call(w, "GET", w.clan_a, "/hall", w.leader_a)).json()["hall"]
        assert hall["title"] == "Dòng họ Nguyễn"

    async def test_tier_limit_is_six(self, world):
        w = world
        await _make_hall(w)
        for i in range(6):
            resp = await _call(w, "POST", w.clan_a, "/tiers", w.leader_a, json={"title": f"Tầng {i + 1}"})
            assert resp.status_code == 201, resp.text
        seventh = await _call(w, "POST", w.clan_a, "/tiers", w.leader_a, json={"title": "Tầng 7"})
        assert seventh.status_code == 422, seventh.text

    async def test_tablet_limit_is_300(self, world):
        w = world
        await _make_hall(w)
        from sqlalchemy import select

        from app.models.genealogy.entities import Person
        from app.models.worship.entities import WorshipPerson, WorshipSpace

        async with w.maker() as s:
            space = (await s.execute(select(WorshipSpace).where(WorshipSpace.clan_id == w.clan_a.clan_id))).scalar_one()
            people = [
                Person(id=uuid.uuid4(), family_id=w.clan_a.clan_id, full_name=f"{w.tag} bulk {i}", generation=4,
                       is_alive=False, death_date=date(1980, 1, 1))
                for i in range(300)
            ]
            s.add_all(people)
            await s.flush()
            s.add_all([WorshipPerson(space_id=space.space_id, person_id=p.id, display_order=i) for i, p in enumerate(people)])
            await s.commit()
        over = await _add(w, w.p1)
        assert over.status_code == 422, over.text
        bulk = await _call(w, "POST", w.clan_a, "/tablets/bulk", w.leader_a, json={"personIds": [str(w.p1.id)]})
        assert bulk.status_code == 200
        assert [s["reason"] for s in bulk.json()["skipped"]] == ["LIMIT_REACHED"] and bulk.json()["added"] == []

    async def test_delete_tier_with_tablets_is_409_unless_moved(self, world):
        w = world
        assert (await _add(w, w.p1)).status_code == 201
        tiers = await _tiers(w)
        old_id = tiers[0]["tierId"]
        blocked = await _call(w, "DELETE", w.clan_a, f"/tiers/{old_id}", w.leader_a)
        assert blocked.status_code == 409, blocked.text
        new_tier = (await _call(w, "POST", w.clan_a, "/tiers", w.leader_a, json={"title": "Tầng nhận"})).json()
        moved = await _call(w, "DELETE", w.clan_a, f"/tiers/{old_id}?moveToTierId={new_tier['tierId']}", w.leader_a)
        assert moved.status_code == 200, moved.text
        page = (await _call(w, "GET", w.clan_a, f"/tiers/{new_tier['tierId']}/tablets", w.leader_a)).json()
        assert page["total"] == 1
        assert all(t["tierId"] != old_id for t in await _tiers(w))

    async def test_changing_tier_no_swaps_with_the_other_tier(self, world):
        w = world
        t1 = (await _call(w, "POST", w.clan_a, "/tiers", w.leader_a, json={"title": "Một"})).json()
        t2 = (await _call(w, "POST", w.clan_a, "/tiers", w.leader_a, json={"title": "Hai"})).json()
        assert (t1["tierNo"], t2["tierNo"]) == (1, 2)
        resp = await _call(w, "PATCH", w.clan_a, f"/tiers/{t1['tierId']}", w.leader_a, json={"tierNo": 2})
        assert resp.status_code == 200 and resp.json()["tierNo"] == 2
        by_id = {t["tierId"]: t["tierNo"] for t in await _tiers(w)}
        assert by_id == {t1["tierId"]: 2, t2["tierId"]: 1}

    async def test_bulk_add_skips_with_reasons_and_does_not_fail_the_batch(self, world):
        w = world
        assert (await _add(w, w.p5)).status_code == 201
        ids = [w.p1, w.p_alive, w.p_other_clan, w.p5, w.p9]
        resp = await _call(w, "POST", w.clan_a, "/tablets/bulk", w.leader_a,
                           json={"personIds": [str(p.id) for p in ids]})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert {a["personId"] for a in body["added"]} == {str(w.p1.id), str(w.p9.id)}
        reasons = {s["personId"]: s["reason"] for s in body["skipped"]}
        assert reasons == {
            str(w.p_alive.id): "NOT_DECEASED",
            str(w.p_other_clan.id): "NOT_FOUND",
            str(w.p5.id): "ALREADY_EXISTS",
        }
        assert all(s["message"] for s in body["skipped"])
        too_many = await _call(w, "POST", w.clan_a, "/tablets/bulk", w.leader_a,
                               json={"personIds": [str(uuid.uuid4()) for _ in range(51)]})
        assert too_many.status_code == 422

    async def test_tier_tablets_are_paginated(self, world):
        w = world
        tier = (await _call(w, "POST", w.clan_a, "/tiers", w.leader_a, json={"title": "Tầng đông"})).json()
        resp = await _call(w, "POST", w.clan_a, "/tablets/bulk", w.leader_a,
                           json={"personIds": [str(p.id) for p in w.crowd], "tierId": tier["tierId"]})
        assert resp.status_code == 200 and len(resp.json()["added"]) == 15
        first = (await _call(w, "GET", w.clan_a, f"/tiers/{tier['tierId']}/tablets?limit=12", w.member_a)).json()
        assert first["total"] == 15 and len(first["tablets"]) == 12 and first["offset"] == 0
        second = (await _call(w, "GET", w.clan_a, f"/tiers/{tier['tierId']}/tablets?limit=12&offset=12", w.member_a)).json()
        assert len(second["tablets"]) == 3
        seen = {t["id"] for t in first["tablets"]} | {t["id"] for t in second["tablets"]}
        assert len(seen) == 15
        # GET hall chỉ mang 12 bài vị đầu của tầng nhưng total là 15
        in_hall = [t for t in await _tiers(w, w.member_a) if t["tierId"] == tier["tierId"]][0]
        assert in_hall["total"] == 15 and len(in_hall["tablets"]) == 12

    async def test_candidates_exclude_existing_tablets_and_the_living(self, world):
        w = world
        assert (await _add(w, w.p1)).status_code == 201
        resp = await _call(w, "GET", w.clan_a, "/candidates?limit=50", w.leader_a)
        assert resp.status_code == 200, resp.text
        ids = {c["personId"] for c in resp.json()["items"]}
        assert str(w.p1.id) not in ids  # đã có bài vị
        assert str(w.p_alive.id) not in ids  # còn sống
        assert str(w.p_other_clan.id) not in ids  # dòng họ khác
        assert str(w.p5.id) in ids
        found = (await _call(w, "GET", w.clan_a, "/candidates?search=doi5", w.leader_a)).json()
        assert [c["personId"] for c in found["items"]] == [str(w.p5.id)]

    async def test_private_person_is_hidden_from_regular_viewers(self, world):
        w = world
        assert (await _add(w, w.p_private)).status_code == 201
        assert (await _add(w, w.p1)).status_code == 201
        member_ids = {t["personId"] for tier in await _tiers(w, w.member_a) for t in tier["tablets"]}
        leader_ids = {t["personId"] for tier in await _tiers(w, w.leader_a) for t in tier["tablets"]}
        assert str(w.p_private.id) not in member_ids and str(w.p1.id) in member_ids
        assert str(w.p_private.id) in leader_ids

    # ------------------------------------------------------------------ ảnh
    async def test_portrait_upload_validation_and_serving(self, world):
        w = world
        tablet = (await _add(w, w.p1)).json()
        path = f"/tablets/{tablet['id']}/portrait"
        not_image = await _call(w, "POST", w.clan_a, path, w.leader_a, files={"file": ("a.png", b"hello world", "image/png")})
        assert not_image.status_code == 400, not_image.text
        svg = await _call(w, "POST", w.clan_a, path, w.leader_a,
                          files={"file": ("a.svg", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", "image/svg+xml")})
        assert svg.status_code == 400
        big = PNG_16 + b"\x00" * (2 * 1024 * 1024 + 1)
        too_large = await _call(w, "POST", w.clan_a, path, w.leader_a, files={"file": ("big.png", big, "image/png")})
        assert too_large.status_code == 400
        ok = await _call(w, "POST", w.clan_a, path, w.leader_a, files={"file": ("a.png", PNG_16, "image/png")})
        assert ok.status_code == 200, ok.text
        url = ok.json()["portraitUrl"]
        assert url.startswith(f"/families/{w.clan_a.clan_id}/worship/images/") and url.endswith(".png")
        served = await w.client.get(url, headers=_h(w.member_a))
        assert served.status_code == 200 and served.headers["content-type"] == "image/png"
        assert (await w.client.get(url, headers=_h(w.outsider))).status_code == 403
        assert (await w.client.get(url)).status_code == 401
        # thay ảnh: ảnh cũ không còn được phục vụ
        replaced = await _call(w, "POST", w.clan_a, path, w.leader_a, files={"file": ("b.png", PNG_16 + b"\x01", "image/png")})
        assert replaced.status_code == 200 and replaced.json()["portraitUrl"] != url
        assert (await w.client.get(url, headers=_h(w.member_a))).status_code == 404

    async def test_image_endpoint_rejects_traversal_and_bad_extensions(self, world):
        w = world
        await _make_hall(w)
        for name in ("..%5Csecret.png", "evil..png", "a.gif", "a.svg", "noext"):
            resp = await w.client.get(f"/families/{w.clan_a.clan_id}/worship/images/{name}", headers=_h(w.leader_a))
            assert resp.status_code == 400, (name, resp.status_code)
        missing = await w.client.get(
            f"/families/{w.clan_a.clan_id}/worship/images/{uuid.uuid4().hex}.png", headers=_h(w.leader_a)
        )
        assert missing.status_code == 404

    async def test_hall_cover_upload_and_delete(self, world):
        w = world
        up = await _call(w, "POST", w.clan_a, "/hall/cover", w.leader_a, files={"file": ("c.png", PNG_16, "image/png")})
        assert up.status_code == 200, up.text
        cover = (await _call(w, "GET", w.clan_a, "/hall", w.member_a)).json()["hall"]["coverImageUrl"]
        assert cover == up.json()["coverImageUrl"]
        assert (await w.client.get(cover, headers=_h(w.member_a))).status_code == 200
        assert (await _call(w, "DELETE", w.clan_a, "/hall/cover", w.leader_a)).status_code == 200
        assert (await _call(w, "GET", w.clan_a, "/hall", w.member_a)).json()["hall"]["coverImageUrl"] is None
        assert (await w.client.get(cover, headers=_h(w.member_a))).status_code == 404

    # ------------------------------------------------------------------ me.canOffer
    async def test_me_can_offer_matches_who_may_light_incense(self, world):
        w = world
        await _make_hall(w)
        assert (await _call(w, "PATCH", w.clan_a, "/hall", w.leader_a, json={"visibility": "PUBLIC"})).status_code == 200

        async def can_offer(user):
            resp = await _call(w, "GET", w.clan_a, "/hall", user)
            assert resp.status_code == 200, resp.text
            me = resp.json()["me"]
            return None if me is None else me["canOffer"]

        assert await can_offer(None) is None  # khách: không có `me`
        assert await can_offer(w.member_a) is True
        assert await can_offer(w.leader_a) is True
        assert await can_offer(w.outsider) is False
        assert await can_offer(w.member_b) is False  # thành viên dòng họ khác = người ngoài
        # nhất quán với POST: người ngoài bị 403, thành viên thắp được
        assert (await _call(w, "POST", w.clan_a, "/incense", w.outsider)).status_code == 403
        assert (await _call(w, "POST", w.clan_a, "/incense", w.member_b)).status_code == 403
        assert (await _call(w, "POST", w.clan_a, "/incense", w.member_a)).status_code == 200

    async def test_me_can_offer_without_hall_and_for_system_admin(self, world):
        from sqlalchemy import delete, select

        from app.models.user_access.entities import Role, UserRole

        w = world
        # dòng họ chưa có phòng: khung rỗng nhưng `me.canOffer` vẫn đúng với từng người xem
        empty = await _call(w, "GET", w.clan_a, "/hall", w.member_a)
        assert empty.status_code == 200 and empty.json()["me"]["canOffer"] is True
        assert (await _call(w, "GET", w.clan_a, "/hall", w.leader_a)).json()["me"]["canOffer"] is True

        await _make_hall(w)
        await _call(w, "PATCH", w.clan_a, "/hall", w.leader_a, json={"visibility": "PUBLIC"})
        admin = w.outsider  # không thuộc dòng họ A; được cấp quyền System Admin (clan_id NULL)
        assert (await _call(w, "GET", w.clan_a, "/hall", admin)).json()["me"]["canOffer"] is False
        created_role = None
        async with w.maker() as s:
            role = (await s.execute(select(Role).where(Role.code == "admin"))).scalar_one_or_none()
            if role is None:
                role = created_role = Role(role_id=uuid.uuid4(), code="admin", name="itest admin")
                s.add(role)
                await s.flush()
            grant = UserRole(user_id=admin.user_id, role_id=role.role_id, clan_id=None)
            s.add(grant)
            await s.commit()
            grant_id = grant.user_role_id
        try:
            body = (await _call(w, "GET", w.clan_a, "/hall", admin)).json()
            assert body["me"]["canOffer"] is True and body["canManage"] is True
        finally:
            async with w.maker() as s:
                await s.execute(delete(UserRole).where(UserRole.user_role_id == grant_id))
                if created_role is not None:
                    await s.execute(delete(Role).where(Role.role_id == created_role.role_id))
                await s.commit()

    # ------------------------------------------------------------------ bài vị ẩn
    async def test_hidden_tablets_visible_only_to_managers(self, world):
        w = world
        shown = (await _add(w, w.p5)).json()
        hidden = (await _add(w, w.p6)).json()
        assert hidden["isVisible"] is True
        patched = await _call(w, "PATCH", w.clan_a, f"/tablets/{hidden['id']}", w.leader_a, json={"isVisible": False})
        assert patched.status_code == 200, patched.text
        assert patched.json()["isVisible"] is False
        tier_id = hidden["tierId"]
        assert shown["tierId"] != tier_id  # đời 5 và đời 6 ở hai tầng khác nhau

        # Thành viên thường: không thấy bài vị ẩn, total không đếm, mọi tablet isVisible=True
        member_tiers = {t["tierId"]: t for t in await _tiers(w, w.member_a)}
        assert member_tiers[tier_id]["total"] == 0 and member_tiers[tier_id]["tablets"] == []
        assert member_tiers[shown["tierId"]]["total"] == 1
        page = (await _call(w, "GET", w.clan_a, f"/tiers/{tier_id}/tablets", w.member_a)).json()
        assert page["total"] == 0 and page["tablets"] == []
        assert hidden["personId"] not in str((await _call(w, "GET", w.clan_a, "/hall", w.member_a)).json())
        for tier in member_tiers.values():
            assert all(t["isVisible"] is True for t in tier["tablets"])

        # Trưởng tộc: thấy cả bài vị ẩn với isVisible=False, total đếm cả bài vị ẩn
        leader_tiers = {t["tierId"]: t for t in await _tiers(w, w.leader_a)}
        assert leader_tiers[tier_id]["total"] == 1
        only = leader_tiers[tier_id]["tablets"]
        assert [t["personId"] for t in only] == [hidden["personId"]] and only[0]["isVisible"] is False
        assert leader_tiers[shown["tierId"]]["tablets"][0]["isVisible"] is True
        lpage = (await _call(w, "GET", w.clan_a, f"/tiers/{tier_id}/tablets", w.leader_a)).json()
        assert lpage["total"] == 1 and lpage["tablets"][0]["isVisible"] is False

        # Hiện lại bài vị: thành viên thường thấy lại và total tăng
        shown_again = await _call(w, "PATCH", w.clan_a, f"/tablets/{hidden['id']}", w.leader_a, json={"isVisible": True})
        assert shown_again.status_code == 200
        again = (await _call(w, "GET", w.clan_a, f"/tiers/{tier_id}/tablets", w.member_a)).json()
        assert again["total"] == 1 and again["tablets"][0]["isVisible"] is True

    async def test_hidden_tablets_never_leak_to_outsider_or_guest_on_public_hall(self, world):
        w = world
        assert (await _call(w, "PATCH", w.clan_a, "/hall", w.leader_a, json={"visibility": "PUBLIC"})).status_code == 200
        hidden = (await _add(w, w.p1)).json()
        await _call(w, "PATCH", w.clan_a, f"/tablets/{hidden['id']}", w.leader_a, json={"isVisible": False})
        for viewer in (None, w.outsider, w.member_b):
            hall = (await _call(w, "GET", w.clan_a, "/hall", viewer)).json()
            assert hidden["personId"] not in str(hall)
            assert all(t["total"] == 0 for t in hall["tiers"])
            page = await _call(w, "GET", w.clan_a, f"/tiers/{hidden['tierId']}/tablets", viewer)
            assert page.status_code == 200 and page.json()["total"] == 0 and page.json()["tablets"] == []
