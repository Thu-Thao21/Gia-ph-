"""Mốc M5c: one clan once (clan key), soft warnings for the System Admin, clan code and Owner login
ID from the clan name, strict form validation, and logo images checked by content."""

from __future__ import annotations

import asyncio
import importlib.util
import struct
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.errors import AppError
from app.core.utils import clan_identity as ci
from app.core.utils.image_validation import ImageRejected, check_image
from app.schemas.business import BusinessRegistrationCreateRequest
from tests.fakes import FakeFamilyRepo, FakeUserAccessRepo, make_user
from tests.test_otp_security import World

BE_DIR = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 10, 27, 8, 0, tzinfo=timezone.utc)


def load_migration(name):
    spec = importlib.util.spec_from_file_location(f"m_{name}", BE_DIR / "alembic" / "versions" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


M0010 = load_migration("0010_clan_identity_registry")


# ----- keys -----


@pytest.mark.parametrize(("raw", "key"), [
    ("Dòng Họ Nguyễn Chi 1 Kim Liên", "nguyen chi 1 kim lien"),
    ("  DÒNG   HỌ  nguyễn chi 1   kim liên ", "nguyen chi 1 kim lien"),
    ("Họ Nguyễn Chi 1 Kim Liên", "nguyen chi 1 kim lien"),
    ("Tộc Nguyễn Chi 1 Kim Liên", "nguyen chi 1 kim lien"),
    ("Gia tộc Nguyễn Chi 1 Kim Liên", "nguyen chi 1 kim lien"),
    ("dong ho Nguyen chi 1 kim lien", "nguyen chi 1 kim lien"),  # typed without diacritics
    ("Nguyễn Chi 1 Kim Liên", "nguyen chi 1 kim lien"),
    ("Họ Hồ", "ho"),               # prefix "Họ", then the surname Hồ
    ("Hồ Văn", "ho van"),          # the surname Hồ is NOT a prefix
    ("ho Tran", "ho tran"),        # bare "ho" without diacritics is ambiguous: kept
    ("Họ Đặng", "dang"),
])
def test_name_key(raw, key):
    assert ci.name_key(raw) == key


def test_composed_and_decomposed_spellings_give_one_key():
    import unicodedata

    text = "Họ Nguyễn Kim Liên"
    assert ci.name_key(unicodedata.normalize("NFD", text)) == ci.name_key(unicodedata.normalize("NFC", text))


def test_origin_key():
    assert ci.origin_key("Làng Đông,  Xã Kim Liên, Nghệ An") == "lang dong xa kim lien nghe an"
    assert ci.clan_key("Dòng họ Nguyễn", "Nghệ An") == ci.clan_key("Nguyễn", "  nghệ  an ")


@pytest.mark.parametrize("raw", ["Dòng Họ Nguyễn Chi 1", "Họ Hồ", "x", "", "ĐẶNG  văn"])
def test_the_migration_keeps_a_faithful_frozen_copy(raw):
    assert M0010.name_key(raw) == ci.name_key(raw) and M0010.origin_key(raw) == ci.origin_key(raw)


def test_similarity_reasons():
    assert ci.similarity_reason("nguyen kim", "nghe an", "nguyen kim", "nghe an") is None  # hard duplicate
    assert ci.similarity_reason("nguyen kim", "nghe an", "nguyen kim", "ha tinh") == "same_name_other_origin"
    assert ci.similarity_reason("nguyen kim lien", "xa kim lien nam dan", "nguyen kimlien", "nam dan nghe an") \
        == "similar_name_shared_origin"
    assert ci.similarity_reason("nguyen kim lien", "nghe an", "nguyen kimlien", "ha noi") is None
    assert ci.similarity_reason("tran", "xa hoa binh", "nguyen", "xa hoa binh") is None


# ----- clan code and Owner login ID -----


def test_code_candidates():
    assert list(ci.code_candidates("Dòng Họ Nguyễn Chi 1 Kim Liên", attempts=2)) == [
        "nguyenchi1kimlien", "nguyenchi1kimlien-2", "nguyenchi1kimlien-3"]
    assert next(ci.code_candidates("Họ !!!")) == "dongho"


async def test_owner_login_id_from_the_clan_code_skips_taken_ones():
    from app.controllers.family_management.registration_admin_use_cases import owner_login_id

    users = FakeUserAccessRepo()
    assert await owner_login_id(users, "tranvan") == "tranvan@giapha.com"
    existing = users.add_user(make_user())
    existing.email = "TranVan@giapha.com"
    assert await owner_login_id(users, "tranvan") == "tranvan-2@giapha.com"
    assert await owner_login_id(users, "CLAN-ABCD2345") == "clan-abcd2345@giapha.com"  # an older code


async def test_approval_uses_the_clan_code_login_and_never_renames_an_existing_owner(monkeypatch):
    from app.controllers.family_management import owner_provisioning_use_cases as prov_uc
    from app.controllers.family_management import registration_admin_use_cases as reg_uc

    family = FakeFamilyRepo()
    plan = family.add_plan("BASIC")
    reg = family.add_registration(plan, status="APPROVED", clan_name="Họ Phạm Văn")
    clan = family.add_clan("ACTIVE")
    clan.registration_id, clan.clan_code, clan.name = reg.registration_id, "phamvan", "Họ Phạm Văn"
    seen = {}

    async def fake_provision_owner(**kw):
        seen["login"] = kw["body"].email
        return SimpleNamespace(response=SimpleNamespace(
            temporary_password="x", temporary_password_expires_at=NOW, email_delivery_status="SENT",
            owner_email=kw["body"].email, owner_display_name="A"))

    monkeypatch.setattr(prov_uc, "provision_owner", fake_provision_owner)
    await reg_uc.approve_and_provision_registration(
        db=SimpleNamespace(commit=_noop, rollback=_noop), users=FakeUserAccessRepo(), family=family, jobs=None,
        idempotency=None, provider=SimpleNamespace(admin_api_enabled=True), sender=None,
        principal=SimpleNamespace(user_id=uuid.uuid4()), registration_id=reg.registration_id,
        client=SimpleNamespace(ip_address=None, user_agent=None),
    )
    assert seen["login"] == "phamvan@giapha.com"

    # A clan that already has an Owner: nothing is provisioned, its login ID is untouched.
    owner = make_user("ACTIVE")
    owner.email = "ho.pham.old@giapha.com"
    users = FakeUserAccessRepo()
    users.add_user(owner)
    family.add_owner(clan, owner)
    seen.clear()
    await reg_uc.approve_and_provision_registration(
        db=SimpleNamespace(commit=_noop, rollback=_noop), users=users, family=family, jobs=None,
        idempotency=None, provider=SimpleNamespace(admin_api_enabled=True), sender=None,
        principal=SimpleNamespace(user_id=uuid.uuid4()), registration_id=reg.registration_id,
        client=SimpleNamespace(ip_address=None, user_agent=None),
    )
    assert seen == {} and owner.email == "ho.pham.old@giapha.com"


async def _noop(*a, **k):
    return None


# ----- one clan once, through the public registration -----


@pytest.fixture
def w(monkeypatch):
    return World(monkeypatch)


def body(w, *, email, clan_name="Dòng Họ Nguyễn Kim Liên", origin="Kim Liên, Nam Đàn, Nghệ An", token=None):
    plan = next(iter(w.family.plans.values()), None) or w.family.add_plan("BASIC")
    return BusinessRegistrationCreateRequest(
        representative_name="Nguyễn Văn Đại", representative_email=email, representative_phone="0912345678",
        clan_name=clan_name, origin_place=origin, requested_plan_id=plan.plan_id, verification_token=token)


async def register(w, email, **kw):
    from app.controllers.family_management import public_use_cases

    w.b_send(email)
    token = w.b_verify(email).json()["verification_token"]
    return await public_use_cases.create_registration(
        db=w.db, users=w.repo, family=w.family, body=body(w, email=email, token=token, **kw),
        client=SimpleNamespace(ip_address=None, user_agent=None), otps=w.otps)


async def test_the_same_clan_twice_is_duplicate_clan_whatever_the_spelling(w):
    await register(w, "first@gmail.com")
    with pytest.raises(AppError) as caught:
        await register(w, "second@gmail.com", clan_name="họ   NGUYỄN kim liên", origin="kim liên , nam đàn,nghệ an")
    err = caught.value
    assert err.code == "DUPLICATE_CLAN" and err.status_code == 409
    # Nothing about the other clan: no name, no Gmail, no phone, no ids.
    for leak in ("first@gmail.com", "Nguyễn Văn Đại", "0912345678", "Kim Liên"):
        assert leak not in err.message
    assert err.details is None
    assert len(w.family.registrations) == 1


async def test_a_clan_that_exists_blocks_a_new_registration(w):
    clan = w.family.add_clan("SUSPENDED")
    await w.family.clan_key_claim(clan_key=ci.clan_key("Họ Lý", "Bắc Ninh"), name_key="ly", origin_key="bac ninh",
                                  kind="clan", registration_id=None, clan_id=clan.clan_id, now=NOW)
    with pytest.raises(AppError) as caught:
        await register(w, "x@gmail.com", clan_name="Dòng họ Lý", origin="Bắc Ninh")
    assert caught.value.code == "DUPLICATE_CLAN"


async def test_same_name_other_origin_is_allowed(w):
    await register(w, "first@gmail.com")
    created = await register(w, "second@gmail.com", origin="Hà Tĩnh")
    assert created.status == "PENDING" and len(w.family.registrations) == 2


async def test_a_rejected_registration_gives_the_clan_back(w):
    from app.controllers.family_management.registration_admin_use_cases import review_registration
    from app.schemas.business import RegistrationReviewRequest

    first = await register(w, "first@gmail.com")
    await review_registration(
        db=w.db, users=w.repo, family=w.family, principal=SimpleNamespace(user_id=uuid.uuid4()),
        registration_id=first.registration_id, body=RegistrationReviewRequest(decision="REJECTED", reason="Sai"),
        client=SimpleNamespace(ip_address=None, user_agent=None),
    )
    assert {r.status for r in w.family.clan_keys} == {"released"}
    again = await register(w, "second@gmail.com")
    assert again.status == "PENDING"


async def test_concurrent_claims_of_one_clan_only_one_wins():
    family = FakeFamilyRepo()

    async def claim():
        return await family.clan_key_claim(clan_key="a|b", name_key="a", origin_key="b", kind="registration",
                                           registration_id=uuid.uuid4(), clan_id=None, now=NOW)

    assert (await asyncio.gather(*[claim() for _ in range(6)])).count(True) == 1


async def test_a_registration_that_loses_the_clan_race_is_rolled_back(w, monkeypatch):
    real = w.family.clan_key_claim

    async def lost(**kw):
        await real(**{**kw, "registration_id": uuid.uuid4()})  # the other request got there first
        return False

    monkeypatch.setattr(w.family, "clan_key_claim", lost)
    with pytest.raises(AppError) as caught:
        await register(w, "racer@gmail.com")
    assert caught.value.code == "DUPLICATE_CLAN" and w.db.rollbacks >= 1


def test_the_real_claim_is_one_insert_on_the_partial_unique_index():
    from sqlalchemy.dialects import postgresql

    from app.models.family.repository import FamilyRepository

    class Recording:
        def __init__(self):
            self.sql = []

        async def flush(self):
            pass

        async def execute(self, stmt):
            self.sql.append(str(stmt.compile(dialect=postgresql.dialect())))
            return SimpleNamespace(first=lambda: None)

    session = Recording()
    asyncio.run(FamilyRepository(session).clan_key_claim(
        clan_key="a|b", name_key="a", origin_key="b", kind="registration", registration_id=uuid.uuid4(),
        clan_id=None, now=NOW))
    [sql] = session.sql
    assert sql.startswith("INSERT INTO clan_identity_registry") and "ON CONFLICT (clan_key) WHERE status = " in sql


def test_the_public_route_answers_409_duplicate_clan_with_nothing_else(w):
    async def taken(_key):
        return SimpleNamespace(clan_key="x")

    w.family.clan_key_active = taken
    w.b_send("route@gmail.com")
    token = w.b_verify("route@gmail.com").json()["verification_token"]
    plan = w.family.add_plan("BASIC")
    r = w.client.post("/api/v1/business-registrations", json={
        "representative_name": "Nguyễn Văn Đại", "representative_email": "route@gmail.com",
        "representative_phone": "0912 345 678", "clan_name": "Họ Nguyễn Kim", "origin_place": "Nghệ An",
        "requested_plan_id": str(plan.plan_id), "verification_token": token})
    assert r.status_code == 409
    assert set(r.json()["error"]) == {"code", "message", "request_id"} and r.json()["error"]["code"] == "DUPLICATE_CLAN"


# ----- soft warnings for the System Admin -----


async def test_soft_warnings_list_look_alikes_without_personal_data(w):
    from app.controllers.family_management.registration_admin_use_cases import get_registration_detail

    await register(w, "a@gmail.com", clan_name="Họ Nguyễn Kim Liên", origin="Xã Kim Liên, Nam Đàn")
    await register(w, "b@gmail.com", clan_name="Họ Nguyễn Kim Liên", origin="Hà Tĩnh")          # same name
    await register(w, "c@gmail.com", clan_name="Họ Nguyễn KimLiên", origin="Nam Đàn, Nghệ An")   # spacing + origin
    await register(w, "d@gmail.com", clan_name="Họ Trần Kim", origin="Nam Đàn")                  # unrelated
    first = w.family.registrations[0]
    detail = await get_registration_detail(family=w.family, registration_id=first.registration_id)
    reasons = sorted(s.reason for s in detail.similar_clans)
    assert reasons == ["same_name_other_origin", "similar_name_shared_origin"]
    for item in detail.similar_clans:
        assert item.message and item.registration_id and item.kind == "registration"
        dumped = item.model_dump_json()
        for leak in ("b@gmail.com", "c@gmail.com", "0912345678", "Nguyễn Văn Đại"):
            assert leak not in dumped


# ----- strict form validation (BE is where it is enforced) -----


@pytest.mark.parametrize(("field", "value"), [
    ("representative_name", "A1"), ("representative_name", "x" * 101),
    ("representative_email", "rep@giapha.com"), ("representative_phone", "12345"),
    ("representative_phone", "0212345678"), ("clan_name", "Họ_Nguyễn"), ("clan_name", "Họ"),
    ("origin_place", ""), ("origin_place", "x_y"), ("clan_name", "Họ\u0000Nguyễn"),
])
def test_validation_error_names_the_fields(w, field, value):
    plan = w.family.add_plan("BASIC")
    payload = {"representative_name": "Nguyễn Văn Đại", "representative_email": "ok@gmail.com",
               "representative_phone": "0912345678", "clan_name": "Họ Nguyễn Kim", "origin_place": "Nghệ An",
               "requested_plan_id": str(plan.plan_id), "verification_token": "t"}
    payload[field] = value
    r = w.client.post("/api/v1/business-registrations", json=payload)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert r.json()["error"]["details"]["fields"] == [f"body.{field}"]


@pytest.mark.parametrize(("raw", "stored"), [
    ("0912345678", "0912345678"), ("+84 912 345 678", "0912345678"), ("84912345678", "0912345678"),
    ("(091) 234-5678", "0912345678"), ("0389.123.456", "0389123456"),
])
def test_vietnamese_mobile_is_normalized(w, raw, stored):
    req = body(w, email="p@gmail.com")
    assert BusinessRegistrationCreateRequest(**{**req.model_dump(), "representative_phone": raw,
                                                "verification_token": "t"}).representative_phone == stored


# ----- logo images: by content, never SVG -----


def png(w=64, h=64):
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", w, h) + b"\x08\x06\x00\x00\x00" + b"\x00" * 64


def jpeg(w=64, h=48):
    return (b"\xff\xd8" + b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00" + b"\x00" * 9
            + b"\xff\xc0" + struct.pack(">HBHH", 17, 8, h, w) + b"\x03" + b"\x00" * 9 + b"\xff\xd9")


def webp(w=100, h=80):
    chunk = b"VP8X" + struct.pack("<I", 10) + b"\x00\x00\x00\x00" + (w - 1).to_bytes(3, "little") + (h - 1).to_bytes(3, "little")
    return b"RIFF" + struct.pack("<I", 4 + len(chunk)) + b"WEBP" + chunk + b"\x00" * 32


@pytest.mark.parametrize(("data", "mime", "size"), [
    (png(64, 32), "image/png", (64, 32)), (jpeg(64, 48), "image/jpeg", (64, 48)), (webp(100, 80), "image/webp", (100, 80)),
], ids=["png", "jpeg", "webp"])
def test_real_images_are_accepted_with_a_generated_name(data, mime, size):
    checked = check_image(data)
    assert (checked.mime_type, (checked.width, checked.height)) == (mime, size)
    assert len(checked.stored_name.split(".")[0]) == 32 and checked.stored_name.endswith("." + checked.extension)


@pytest.mark.parametrize("svg", [
    b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>',
    b'<svg><foreignObject><iframe src="https://evil.example"/></foreignObject></svg>',
    b'<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
    b'<svg><image href="https://evil.example/x.png"/></svg>',
    b'<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>',
    b'   \n<svg/>',
], ids=["script", "onload", "foreignObject", "javascript-href", "external-href", "xxe", "leading-space"])
def test_every_svg_is_refused(svg):
    with pytest.raises(ImageRejected) as caught:
        check_image(svg)
    assert caught.value.reason == "svg_not_allowed"


@pytest.mark.parametrize(("data", "reason"), [
    (b"<html><script>alert(1)</script></html>", "unknown_type"),     # an HTML page renamed logo.png
    (b"GIF89a" + b"\x00" * 64, "unknown_type"),
    (png()[:20], "corrupt"),
    (png()[:-64] + b"<script>alert(1)</script>" + b"\x00" * 40, "markup"),  # polyglot
    (png(8, 8), "bad_dimensions"), (png(5000, 100), "bad_dimensions"),
    (b"", "empty"), (png() + b"\x00" * (2 * 1024 * 1024), "too_large"),
], ids=["html-renamed", "gif", "truncated-png", "polyglot", "too-small", "too-wide", "empty", "too-large"])
def test_fake_or_unsafe_images_are_refused(data, reason):
    with pytest.raises(ImageRejected) as caught:
        check_image(data)
    assert caught.value.reason == reason


# ----- 0010 backfill plan -----


def T(m):
    return NOW + timedelta(minutes=m)


def test_backfill_priority_clan_then_approved_then_pending_then_oldest():
    clan_id, reg_of_clan, reg_appr, reg_pend_old, reg_pend_new, reg_rej, reg_other = (uuid.uuid4() for _ in range(7))
    clans = [(clan_id, reg_of_clan, "Họ Nguyễn Kim", "ACTIVE", "Nghệ An", T(50))]
    registrations = [
        (reg_of_clan, "Họ Nguyễn Kim", "Nghệ An", "APPROVED", T(40)),          # covered by its clan
        (reg_appr, "Dòng họ Nguyễn Kim", "nghệ  an", "APPROVED", T(-100)),     # older, but not a clan
        (reg_pend_old, "Tộc Trần", "Huế", "PENDING", T(-50)),
        (reg_pend_new, "Họ Trần", "Huế", "PENDING", T(-10)),
        (reg_rej, "Họ Trần", "Huế", "REJECTED", T(-300)),                      # released: not held
        (reg_other, "Họ Lê", "Huế", "PENDING", T(0)),
    ]
    rows, groups = M0010.plan_backfill(clans, registrations)
    active = {r["clan_key"]: r for r in rows if r["status"] == "active"}
    assert active["nguyen kim|nghe an"]["clan_id"] == clan_id
    assert active["nguyen kim|nghe an"]["registration_id"] == reg_of_clan
    assert active["tran|hue"]["registration_id"] == reg_pend_old
    assert {r["registration_id"] for r in rows if r["status"] == "duplicate"} == {reg_appr, reg_pend_new}
    keepers = {r["registry_id"] for r in active.values()}
    assert all(uuid.UUID(r["note"].split(":")[1].split()[0]) in keepers for r in rows if r["status"] == "duplicate")
    assert len(groups) == 2 and not any(r["registration_id"] == reg_rej for r in rows)


def test_inactive_clans_do_not_hold_a_key():
    rows, _ = M0010.plan_backfill([(uuid.uuid4(), None, "Họ Lý", "INACTIVE", "Huế", T(0))], [])
    assert rows == []
