"""Mốc M5: the Gmail registry (gmail_registry, 0008), users.contact_email (0009) and the Owner's
password reset. Routes run with the in-memory fakes (no DB, no Firebase, no SMTP)."""

from __future__ import annotations

import asyncio
import importlib.util
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.core.errors import AppError
from app.core.utils import gmail_registry
from app.core.utils.gmail_registry import is_login_identifier, normalize_email
from app.schemas.business import BusinessRegistrationCreateRequest
from tests.fakes import FakeDb, FakeUserAccessRepo, make_user
from tests.test_otp_security import World

BE_DIR = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 10, 27, 8, 0, tzinfo=timezone.utc)


def load_migration(name):
    spec = importlib.util.spec_from_file_location(f"m_{name}", BE_DIR / "alembic" / "versions" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


M0008 = load_migration("0008_gmail_registry")


@pytest.fixture(autouse=True)
def no_plus_alias(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_GMAIL_PLUS_ALIAS", False)


@pytest.fixture
def w(monkeypatch):
    return World(monkeypatch)


# ----- normalization -----


@pytest.mark.parametrize(("raw", "key"), [
    ("Nguyen.Van.A@Gmail.com", "nguyenvana@gmail.com"),
    ("  nguyenvana+test1@gmail.com ", "nguyenvana@gmail.com"),
    ("n.guyen.vana+a+b@googlemail.com", "nguyenvana@gmail.com"),
    ("first.last+x@example.com", "first.last+x@example.com"),  # not Gmail: lower-cased only
    ("A@Sub.Example.COM", "a@sub.example.com"),
])
def test_normalization(raw, key):
    assert normalize_email(raw) == key


def test_plus_alias_kept_only_with_the_dev_flag(monkeypatch):
    assert normalize_email("a.b+test1@gmail.com") == "ab@gmail.com"
    monkeypatch.setattr(settings, "APP_ENV", "dev")  # the flag is dev only (Mốc M7)
    monkeypatch.setattr(settings, "ALLOW_GMAIL_PLUS_ALIAS", True)
    assert normalize_email("a.b+test1@gmail.com") == "ab+test1@gmail.com"
    assert normalize_email("a.b+test1@googlemail.com") == "ab+test1@gmail.com"  # dots still go


@pytest.mark.parametrize("flag", [False, True])
@pytest.mark.parametrize("raw", [
    "Nguyen.Van.A@Gmail.com", "x+y@googlemail.com", "a+b@example.com", "no-at-sign", "", "u@giapha.com",
])
def test_the_migration_keeps_a_faithful_frozen_copy(raw, flag):
    assert M0008.normalize_email(raw, flag) == normalize_email(raw, allow_plus_alias=flag)
    assert M0008.is_login_identifier(raw) == is_login_identifier(raw)


def test_giapha_login_ids_are_recognized():
    assert is_login_identifier("ho.nguyen@GiaPha.com") and is_login_identifier("x@giapha.com.")
    assert not is_login_identifier("x@giapha.com.vn") and not is_login_identifier("x@gmail.com")


# ----- one Gmail, once, across member / Business / Owner contact -----


def register_member(w, email):
    w.send(email)
    code = w.inbox[email.strip().lower()][-1]  # the route mails the lower-cased address
    token = w.verify(email, code).json()["verification_token"]
    return w.register(email, token=token)


def test_member_registration_writes_the_registry_in_the_same_transaction(w):
    assert register_member(w, "Nguyen.Van.A@gmail.com").status_code == 201
    [row] = w.repo.gmail_rows
    [user] = w.repo.users.values()
    assert (row.normalized_email, row.owner_type, row.user_id, row.status) == (
        "nguyenvana@gmail.com", "member", user.user_id, "active")


def test_an_alias_of_a_registered_member_is_refused_at_send_and_at_register(w):
    assert register_member(w, "nguyenvana@gmail.com").status_code == 201
    r = w.send("Nguyen.Van.A+second@gmail.com")  # (googlemail.com is refused earlier: Gmail only)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ALREADY_REGISTERED")


def test_dev_flag_lets_plus_aliases_register_separately(w, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "dev")  # the flag is dev only (Mốc M7)
    monkeypatch.setattr(settings, "ALLOW_GMAIL_PLUS_ALIAS", True)
    assert register_member(w, "dev+one@gmail.com").status_code == 201
    assert register_member(w, "dev+two@gmail.com").status_code == 201
    assert {r.normalized_email for r in w.repo.gmail_rows} == {"dev+one@gmail.com", "dev+two@gmail.com"}


def test_a_business_representative_gmail_cannot_register_as_member(w):
    w.repo.gmail_rows.append(SimpleNamespace(
        normalized_email="rep@gmail.com", status="active", owner_type="business_registration",
        user_id=None, registration_id=uuid.uuid4(),
    ))
    r = w.send("r.e.p@gmail.com")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ALREADY_REGISTERED")
    assert w.otps.rows == []  # no code was sent


def test_an_owner_contact_gmail_cannot_become_a_member_even_with_a_token(w):
    token = None
    w.send("owner.contact@gmail.com")
    token = w.verify("owner.contact@gmail.com").json()["verification_token"]
    # meanwhile the Gmail became an Owner's contact
    w.repo.gmail_rows.append(SimpleNamespace(
        normalized_email="ownercontact@gmail.com", status="active", owner_type="clan_owner_contact",
        user_id=uuid.uuid4(), registration_id=None,
    ))
    r = w.register("owner.contact@gmail.com", token=token)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ALREADY_REGISTERED")
    assert w.provider.provider_calls == []  # refused before Firebase


def test_a_member_gmail_cannot_start_a_business_registration(w):
    assert register_member(w, "member@gmail.com").status_code == 201
    r = w.b_send("Mem.ber@gmail.com")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ALREADY_REGISTERED")


def business_body(w, email, token):
    plan = next(iter(w.family.plans.values()), None) or w.family.add_plan("BASIC")
    return BusinessRegistrationCreateRequest(
        representative_name="Đại Diện", representative_email=email, representative_phone="0912345678",
        clan_name=f"Họ {uuid.uuid4().hex[:6]}", origin_place="Kim Liên, Nghệ An",
        requested_plan_id=plan.plan_id, verification_token=token,
    )


async def create_business(w, email):
    from app.controllers.family_management import public_use_cases

    w.b_send(email)
    token = w.b_verify(email).json()["verification_token"]
    return await public_use_cases.create_registration(
        db=w.db, users=w.repo, family=w.family, body=business_body(w, email, token),
        client=SimpleNamespace(ip_address=None, user_agent=None), otps=w.otps,
    )


async def test_a_business_registration_holds_its_gmail_and_a_second_one_is_refused(w):
    created = await create_business(w, "rep@gmail.com")
    [row] = w.repo.gmail_rows
    assert (row.owner_type, row.registration_id, row.status) == (
        "business_registration", created.registration_id, "active")
    r = w.b_send("r.e.p@gmail.com")  # an alias of the same Gmail
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ALREADY_REGISTERED")


async def test_the_create_step_rechecks_the_registry(w):
    from app.controllers.family_management import public_use_cases

    w.b_send("rep@gmail.com")
    token = w.b_verify("rep@gmail.com").json()["verification_token"]
    await w.repo.gmail_claim(normalized_email="rep@gmail.com", original_email="rep@gmail.com",
                             owner_type="member", user_id=uuid.uuid4(), registration_id=None, now=NOW)
    with pytest.raises(AppError) as caught:
        await public_use_cases.create_registration(
            db=w.db, users=w.repo, family=w.family, body=business_body(w, "rep@gmail.com", token),
            client=SimpleNamespace(ip_address=None, user_agent=None), otps=w.otps,
        )
    assert caught.value.code == "EMAIL_ALREADY_REGISTERED" and w.family.registrations == []


async def test_a_rejected_registration_releases_its_gmail(w):
    from app.controllers.family_management.registration_admin_use_cases import review_registration
    from app.schemas.business import RegistrationReviewRequest

    created = await create_business(w, "rep@gmail.com")
    await review_registration(
        db=w.db, users=w.repo, family=w.family, principal=SimpleNamespace(user_id=uuid.uuid4()),
        registration_id=created.registration_id,
        body=RegistrationReviewRequest(decision="REJECTED", reason="Thiếu giấy tờ"),
        client=SimpleNamespace(ip_address=None, user_agent=None),
    )
    [row] = w.repo.gmail_rows
    assert row.status == "released" and row.released_at is not None
    assert register_member(w, "rep@gmail.com").status_code == 201  # free again


# ----- races: only one request wins -----


async def test_concurrent_claims_of_one_gmail_only_one_wins():
    repo = FakeUserAccessRepo()

    async def claim(i):
        return await repo.gmail_claim(
            normalized_email="same@gmail.com", original_email=f"s.a.m.e+{i}@gmail.com", owner_type="member",
            user_id=uuid.uuid4(), registration_id=None, now=NOW,
        )

    results = await asyncio.gather(*[claim(i) for i in range(8)])
    assert results.count(True) == 1 and len(repo.gmail_rows) == 1


def test_a_registration_that_loses_the_race_leaves_nothing_behind(w, monkeypatch):
    """Both requests passed the early check; the claim in the account's transaction fails."""
    w.send("racer@gmail.com")
    token = w.verify("racer@gmail.com").json()["verification_token"]
    real_claim = w.repo.gmail_claim

    async def lost(**kw):
        await real_claim(**{**kw, "user_id": uuid.uuid4()})  # the other request inserted it first
        return False

    monkeypatch.setattr(w.repo, "gmail_claim", lost)
    r = w.register("racer@gmail.com", token=token)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ALREADY_REGISTERED")
    # The account's transaction was rolled back (in PostgreSQL that removes the user row; the fake
    # repo does not undo it), no session was issued, and the Firebase user was removed again.
    assert w.db.rollbacks >= 1 and w.repo.sessions == {}
    assert w.provider.provider_users == {}


def test_the_real_claim_is_one_insert_on_the_partial_unique_index():
    from sqlalchemy.dialects import postgresql

    from app.models.user_access.repository import UserAccessRepository

    class Recording:
        def __init__(self):
            self.sql = []

        async def flush(self):
            pass

        async def execute(self, stmt):
            self.sql.append(str(stmt.compile(dialect=postgresql.dialect())))
            return SimpleNamespace(first=lambda: None)

    session = Recording()
    ok = asyncio.run(UserAccessRepository(session).gmail_claim(
        normalized_email="x@gmail.com", original_email="x@gmail.com", owner_type="member",
        user_id=uuid.uuid4(), registration_id=None, now=NOW,
    ))
    [sql] = session.sql
    assert ok is False
    assert sql.startswith("INSERT INTO gmail_registry")
    assert "ON CONFLICT (normalized_email) WHERE status = " in sql and "DO NOTHING" in sql


# ----- provisioning: contact_email, no second row, @giapha.com never registered -----


async def test_provisioning_binds_the_registration_row_to_the_owner_without_a_second_row():
    from app.controllers.family_management.owner_provisioning_use_cases import bind_owner_contact

    users = FakeUserAccessRepo()
    registration_id = uuid.uuid4()
    await users.gmail_claim(normalized_email="rep@gmail.com", original_email="Rep@gmail.com",
                            owner_type="business_registration", user_id=None,
                            registration_id=registration_id, now=NOW)
    owner = users.add_user(make_user("PENDING"))
    owner.email = "ho.nguyen@giapha.com"
    outcome = await bind_owner_contact(users=users, owner=owner, registration_id=registration_id,
                                       contact_email="Rep@gmail.com", actor_id=None, clan_id=uuid.uuid4(), now=NOW)
    [row] = users.gmail_rows
    assert outcome == "bound" and owner.contact_email == "Rep@gmail.com"
    assert (row.owner_type, row.user_id, row.registration_id) == ("clan_owner_contact", owner.user_id, registration_id)
    assert not any(r.normalized_email.endswith("@giapha.com") for r in users.gmail_rows)


async def test_provisioning_with_a_gmail_held_by_someone_else_is_audited():
    from app.controllers.family_management.owner_provisioning_use_cases import bind_owner_contact

    users = FakeUserAccessRepo()
    await users.gmail_claim(normalized_email="rep@gmail.com", original_email="rep@gmail.com",
                            owner_type="member", user_id=uuid.uuid4(), registration_id=None, now=NOW)
    owner = users.add_user(make_user("PENDING"))
    outcome = await bind_owner_contact(users=users, owner=owner, registration_id=uuid.uuid4(),
                                       contact_email="r.e.p@gmail.com", actor_id=None, clan_id=uuid.uuid4(), now=NOW)
    assert outcome == "conflict" and owner.contact_email == "r.e.p@gmail.com"
    assert users.audit[-1]["action"] == "gmail_registry.owner_contact_conflict"
    assert users.audit[-1]["new_data"] == {"email": "r***@gmail.com"}


async def test_a_giapha_contact_is_never_registered():
    from app.controllers.family_management.owner_provisioning_use_cases import bind_owner_contact

    users = FakeUserAccessRepo()
    owner = users.add_user(make_user("PENDING"))
    outcome = await bind_owner_contact(users=users, owner=owner, registration_id=None,
                                       contact_email="x@giapha.com", actor_id=None, clan_id=uuid.uuid4(), now=NOW)
    assert outcome == "no_contact" and users.gmail_rows == [] and owner.contact_email is None


# ----- the Owner's password reset -----


@pytest.fixture
def rw(monkeypatch):
    from tests.test_password_reset import World as ResetWorld

    monkeypatch.setattr(settings, "ALLOW_GMAIL_PLUS_ALIAS", False)
    return ResetWorld()


def owner_account(rw, contact="owner.real@gmail.com"):
    from app.core.integrations.firebase import ProviderUser

    owner = rw.repo.add_user(make_user("ACTIVE", firebase_uid=f"own-{uuid.uuid4()}"))
    owner.email = "ho.nguyen@giapha.com"
    owner.contact_email = contact
    if contact:
        rw.repo.gmail_rows.append(SimpleNamespace(
            normalized_email=normalize_email(contact), status="active", owner_type="clan_owner_contact",
            user_id=owner.user_id, registration_id=uuid.uuid4(),
        ))
    rw.provider.provider_users[owner.firebase_uid] = ProviderUser(
        uid=owner.firebase_uid, email=owner.email, display_name=owner.display_name, disabled=False)
    return owner


@pytest.mark.parametrize("typed", ["ho.nguyen@giapha.com", "owner.real@gmail.com", "Owner.Real+x@gmail.com"])
def test_owner_reset_by_login_id_or_contact_gmail_is_mailed_to_the_contact(rw, typed):
    owner_account(rw)
    r = rw.request_reset(typed)
    assert r.status_code == 200
    [(to, link)] = rw.sender.sent
    assert to == "owner.real@gmail.com" and "oobCode=" in link
    # The link is for the Owner's own (Firebase) account, the @giapha.com one.
    assert [a["action"] for a in rw.after_commit_audit] == ["auth.password_reset_email_sent"]


def test_owner_without_contact_gets_no_mail_and_an_audit_row(rw):
    owner_account(rw, contact=None)
    r = rw.request_reset("ho.nguyen@giapha.com")
    assert r.status_code == 200 and rw.sender.sent == [] and rw.provider.provider_calls == []
    assert rw.after_commit_audit == [{
        "action": "auth.password_reset_no_contact_email", "user_id": rw.after_commit_audit[0]["user_id"],
        "new_data": {"email": "h***@giapha.com"},
    }]


def test_a_member_is_mailed_at_its_own_address(rw):
    member = rw.with_firebase_account(rw.user())
    rw.request_reset(member.email)
    [(to, _)] = rw.sender.sent
    assert to == member.email


def test_nothing_is_ever_sent_to_giapha_even_with_a_giapha_contact(rw):
    owner_account(rw, contact="other@giapha.com")
    rw.request_reset("ho.nguyen@giapha.com")
    assert rw.sender.sent == []
    assert rw.after_commit_audit[0]["action"] == "auth.password_reset_no_contact_email"


def test_all_answers_stay_the_same_200(rw):
    owner_account(rw)
    owner_account(rw, contact=None).email = "khac@giapha.com"
    bodies = {rw.request_reset(e).content for e in (
        "ho.nguyen@giapha.com", "owner.real@gmail.com", "khac@giapha.com", "nobody@gmail.com", "ghost@giapha.com")}
    assert len(bodies) == 1


# ----- backfill plan (0008) with duplicate data -----


def T(minutes):
    return NOW + timedelta(minutes=minutes)


def test_backfill_merges_an_owner_with_its_own_registration_and_keeps_the_oldest_duplicate():
    owner, member, early = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    reg_owned, reg_pending, reg_rejected, reg_dup = (uuid.uuid4() for _ in range(4))
    users = [
        (owner, "boss+one@gmail.com", T(10)),         # an Owner whose login is its contact Gmail (legacy)
        (member, "m.e.m.b.e.r@gmail.com", T(20)),
        (early, "ho.nguyen@giapha.com", T(0)),        # login id: never registered
    ]
    registrations = [
        (reg_owned, "boss+one@gmail.com", "APPROVED", T(5)),
        (reg_pending, "member@gmail.com", "PENDING", T(30)),   # same Gmail as the member, newer
        (reg_rejected, "member@gmail.com", "REJECTED", T(1)),  # released: not held
        (reg_dup, "boss+two@gmail.com", "PENDING", T(40)),     # + alias of the Owner's Gmail
    ]
    rows, duplicates = M0008.plan_backfill(users, registrations, {reg_owned: owner}, allow_plus_alias=False)

    active = {r["normalized_email"]: r for r in rows if r["status"] == "active"}
    assert set(active) == {"boss@gmail.com", "member@gmail.com"}
    assert (active["boss@gmail.com"]["owner_type"], active["boss@gmail.com"]["user_id"],
            active["boss@gmail.com"]["registration_id"]) == ("clan_owner_contact", owner, reg_owned)
    assert active["member@gmail.com"]["owner_type"] == "member"  # the older one
    dups = [r for r in rows if r["status"] == "duplicate"]
    assert {r["registration_id"] for r in dups} == {reg_pending, reg_dup}
    assert all(r["note"].startswith("duplicate_of:") for r in dups)
    assert len(duplicates) == 2
    assert not any(r["normalized_email"].endswith("@giapha.com") for r in rows)
    assert not any(r["registration_id"] == reg_rejected for r in rows)


def test_backfill_with_the_dev_flag_keeps_aliases_apart():
    owner = uuid.uuid4()
    reg_owned, reg_other = uuid.uuid4(), uuid.uuid4()
    rows, duplicates = M0008.plan_backfill(
        [(owner, "boss+one@gmail.com", T(10))],
        [(reg_owned, "boss+one@gmail.com", "APPROVED", T(5)), (reg_other, "boss+two@gmail.com", "PENDING", T(40))],
        {reg_owned: owner}, allow_plus_alias=True,
    )
    assert duplicates == [] and {r["status"] for r in rows} == {"active"} and len(rows) == 2


# ----- migrations: structure (the real-DB run is in tests/test_m5_migrations_db.py) -----


def test_0008_and_0009_offline_sql(monkeypatch):
    executed = []
    for name in ("0008_gmail_registry", "0009_users_contact_email"):
        module = load_migration(name)
        monkeypatch.setattr(module.op, "execute", executed.append)
        monkeypatch.setattr(module.op, "get_context", lambda: SimpleNamespace(as_sql=True))
        module.upgrade()
    sql = "\n".join(executed)
    assert "CREATE TABLE IF NOT EXISTS gmail_registry" in sql
    assert "CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_registry_active_email" in sql and "WHERE status = 'active'" in sql
    assert "normalized_email NOT LIKE '%@giapha.com'" in sql
    assert "ADD COLUMN IF NOT EXISTS contact_email" in sql and "UPDATE users AS u" in sql


def test_backfill_priority_is_owner_then_member_then_registration_then_oldest():
    """Team lead rule: an older registration still waiting never displaces an Owner or a member."""
    owner, member_old, member_new = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    reg_owned, reg_old_a, reg_old_b, reg_x, reg_y = (uuid.uuid4() for _ in range(5))
    users = [
        (owner, "ho.nguyen@giapha.com", T(50)),
        (member_new, "a.l.i.c.e@gmail.com", T(40)),
        (member_old, "alice+2@gmail.com", T(30)),           # same Gmail, OLDER member
    ]
    registrations = [
        (reg_old_a, "Owner.Real@gmail.com", "PENDING", T(-100)),   # much older than the Owner's row
        (reg_owned, "ownerreal+x@gmail.com", "APPROVED", T(10)),
        (reg_old_b, "alice@gmail.com", "PENDING", T(-200)),        # older than both members
        (reg_x, "solo@gmail.com", "PENDING", T(20)),
        (reg_y, "s.o.l.o@gmail.com", "PENDING", T(5)),             # same type: the oldest stays
    ]
    rows, groups = M0008.plan_backfill(users, registrations, {reg_owned: owner}, allow_plus_alias=False)
    active = {r["normalized_email"]: r for r in rows if r["status"] == "active"}
    assert (active["ownerreal@gmail.com"]["owner_type"], active["ownerreal@gmail.com"]["user_id"]) == (
        "clan_owner_contact", owner)
    assert (active["alice@gmail.com"]["owner_type"], active["alice@gmail.com"]["user_id"]) == ("member", member_old)
    assert active["solo@gmail.com"]["registration_id"] == reg_y
    keepers = {r["registry_id"] for r in active.values()}
    for r in rows:
        if r["status"] == "duplicate":
            assert r["note"].startswith("duplicate_of:")
            assert uuid.UUID(r["note"].split(":")[1].split()[0]) in keepers
    assert {r["registration_id"] or r["user_id"] for r in rows if r["status"] == "duplicate"} == {
        reg_old_a, reg_old_b, member_new, reg_x}
    assert len(groups) == 3 and [g[0][0] for g in groups] == ["member", "clan_owner_contact", "business_registration"]
