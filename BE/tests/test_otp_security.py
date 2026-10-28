"""Mốc M5-1: e-mail OTP of the two registrations (member: /auth/register-*, Business:
/business-registrations/*). One test group per finding of the review (R1..R7), run through the real
routes with an in-memory email_otp_challenges (FakeEmailOtpRepo); SMTP is replaced.

R1 no SMTP -> "sent"            R2 a verification usable by anyone who knows the address
R3 one state for both purposes   R4 no per-address limit (new code = fresh attempts, forever)
R5 plain SHA-256 of 6 digits, in process memory   R6 full address in logs   R7 OTP printed/logged
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.controllers.auth_access.router import router as auth_router
from app.controllers.family_management import public_use_cases
from app.controllers.family_management.public_router import router as public_router
from app.core.config import settings
from app.core.errors import AppError, register_exception_handlers
from app.core.integrations.firebase import get_identity_provider
from app.core.middleware.request_id import RequestIdMiddleware
from app.core.utils import otp_service
from app.db.postgres import get_db
from app.dependencies.auth import get_email_otp_repo, get_user_access_repo
from app.dependencies.permissions import get_family_repo
from app.schemas.business import BusinessRegistrationCreateRequest
from tests.fakes import (
    FakeDb,
    FakeEmailOtpRepo,
    FakeFamilyRepo,
    FakeIdentityProvider,
    FakeUserAccessRepo,
    disabled_rate_limiters,
)

KEY = "test-otp-hmac-key-0123456789abcdef"
VICTIM = "victim.test@gmail.com"
ATTACKER = "attacker.test@gmail.com"
PASSWORD = "Password123!"


class World:
    def __init__(self, monkeypatch):
        monkeypatch.setattr(settings, "OTP_HMAC_KEY", KEY)
        monkeypatch.setattr(settings, "DEBUG", False)
        self.repo = FakeUserAccessRepo()
        self.family = FakeFamilyRepo()
        self.db = FakeDb(repo=self.repo)
        self.otps = FakeEmailOtpRepo()
        self.provider = FakeIdentityProvider()
        self.inbox: dict[str, list[str]] = {}
        self.mail_ok = True

        def fake_send(to_email, code):
            if self.mail_ok:
                self.inbox.setdefault(to_email, []).append(code)
            return self.mail_ok

        monkeypatch.setattr(otp_service, "send_otp_via_email", fake_send)
        app = FastAPI()
        app.add_middleware(RequestIdMiddleware)
        register_exception_handlers(app)
        app.include_router(auth_router, prefix="/api/v1")
        app.include_router(public_router, prefix="/api/v1")
        app.state.rate_limiters = disabled_rate_limiters()
        app.dependency_overrides.update({
            get_db: lambda: self.db,
            get_user_access_repo: lambda: self.repo,
            get_family_repo: lambda: self.family,
            get_identity_provider: lambda: self.provider,
            get_email_otp_repo: lambda: self.otps,
        })
        self.client = TestClient(app)

    # member registration
    def send(self, email=VICTIM):
        return self.client.post("/api/v1/auth/register-send-otp", json={"email": email})

    def verify(self, email=VICTIM, code=None):
        code = code if code is not None else self.inbox[email][-1]
        return self.client.post("/api/v1/auth/register-verify-otp", json={"email": email, "otp": code})

    def token_for(self, email=VICTIM):
        self.send(email)
        return self.verify(email).json()["verification_token"]

    def register(self, email=VICTIM, token=None, **extra):
        body = {"email": email, "password": PASSWORD, "display_name": "Người Thử", **extra}
        if token is not None:
            body["verification_token"] = token
        return self.client.post("/api/v1/auth/register-public", json=body)

    # Business wizard
    def b_send(self, email=VICTIM):
        return self.client.post("/api/v1/business-registrations/send-otp", json={"email": email})

    def b_verify(self, email=VICTIM, code=None):
        code = code if code is not None else self.inbox[email][-1]
        return self.client.post("/api/v1/business-registrations/verify-otp", json={"email": email, "otp": code})

    def age(self, seconds):
        """Move every challenge `seconds` into the past (instead of waiting)."""
        for r in self.otps.rows:
            for field in ("created_at", "expires_at", "token_expires_at"):
                if getattr(r, field):
                    setattr(r, field, getattr(r, field) - timedelta(seconds=seconds))


@pytest.fixture
def w(monkeypatch):
    return World(monkeypatch)


def err(r):
    return r.json()["error"]["code"]


# register-public refusals (Mốc M3b): one code per reason. A token of another address or purpose
# is "not verified", never more specific (nothing is said about other addresses).
NOT_VERIFIED = (400, "EMAIL_NOT_VERIFIED")
USED = (400, "VERIFICATION_USED")
EXPIRED = (400, "VERIFICATION_EXPIRED")


# ----- R1: fail closed when no e-mail can be sent -----


def test_r1_without_smtp_the_otp_is_not_sent_and_the_route_says_so(monkeypatch, caplog):
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "OTP_DEV_SIMULATION", True)  # ignored without DEBUG
    caplog.set_level(logging.DEBUG)
    assert otp_service.send_otp_via_email(VICTIM, "123456") is False
    assert "123456" not in caplog.text


def test_r1_dev_simulation_only_with_debug_and_logged_without_the_code(monkeypatch, caplog):
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")
    monkeypatch.setattr(settings, "APP_ENV", "dev")  # dev only (Mốc M7)
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "OTP_DEV_SIMULATION", False)
    assert otp_service.send_otp_via_email(VICTIM, "123456") is False  # DEBUG alone is not enough
    monkeypatch.setattr(settings, "OTP_DEV_SIMULATION", True)
    caplog.set_level(logging.DEBUG)
    assert otp_service.send_otp_via_email(VICTIM, "123456") is True
    assert "DEV SIMULATION" in caplog.text and "123456" not in caplog.text and VICTIM not in caplog.text


def test_r1_route_answers_503_and_the_unsent_code_is_dead(w):
    w.mail_ok = False
    r = w.send()
    assert r.status_code == 503 and "đã được gửi" not in r.text
    [row] = w.otps.rows
    assert row.invalidated_at is not None  # nobody received it: it cannot be used


def test_r1_no_hmac_key_outside_debug_is_503(w, monkeypatch):
    monkeypatch.setattr(settings, "OTP_HMAC_KEY", "")
    assert w.send().status_code == 503 and w.otps.rows == []


# ----- R2: the account is created only with the token of the one who verified -----


def test_r2_register_public_without_a_token_is_refused_even_after_the_victim_verified(w):
    w.token_for(VICTIM)  # the victim verified on their own device
    r = w.register(VICTIM)  # the attacker: no token
    assert (r.status_code, err(r)) == NOT_VERIFIED
    r = w.register(VICTIM, token="guessed-or-made-up-token")
    assert (r.status_code, err(r)) == NOT_VERIFIED
    assert w.repo.users == {} and w.provider.provider_calls == []


def test_r2_a_token_of_another_email_is_refused(w):
    attacker_token = w.token_for(ATTACKER)
    r = w.register(VICTIM, token=attacker_token)
    assert (r.status_code, err(r)) == NOT_VERIFIED and w.repo.users == {}


def test_r2_the_old_otp_field_no_longer_opens_registration(w):
    w.send(VICTIM)
    r = w.register(VICTIM, otp=w.inbox[VICTIM][-1])  # the pre-M5-1 body
    assert (r.status_code, err(r)) == NOT_VERIFIED


def test_r2_the_token_works_once(w):
    token = w.token_for(VICTIM)
    assert w.register(VICTIM, token=token).status_code == 201
    w.repo.users.clear()  # even if the account were gone, the token stays used
    r = w.register(VICTIM, token=token)
    assert (r.status_code, err(r)) == USED


def test_r2_a_token_claimed_meanwhile_undoes_the_firebase_user(w, monkeypatch):
    """Two requests with one token: both pass the read, only one claim wins; the loser leaves no
    Firebase account behind."""
    token = w.token_for(VICTIM)
    real_claim = w.otps.claim_token

    async def lost_race(*a, **k):
        await real_claim(*a, **k)  # the other request claimed it first
        return False

    monkeypatch.setattr(w.otps, "claim_token", lost_race)
    r = w.register(VICTIM, token=token)
    assert (r.status_code, err(r)) == USED
    assert w.repo.users == {} and w.provider.provider_users == {}  # created, then deleted


async def test_r2_two_concurrent_claims_only_one_wins(w):
    token = w.token_for(VICTIM)
    results = await asyncio.gather(*[
        otp_service.claim_token(otps=w.otps, purpose=otp_service.PURPOSE_MEMBER, email=VICTIM, token=token)
        for _ in range(5)
    ])
    assert results.count(True) == 1


def test_r2_the_token_expires(w):
    token = w.token_for(VICTIM)
    w.age(settings.OTP_VERIFIED_TOKEN_TTL_SECONDS + 1)
    r = w.register(VICTIM, token=token)
    assert (r.status_code, err(r)) == EXPIRED
    assert r.json()["error"]["details"] == {"verification_ttl_seconds": settings.OTP_VERIFIED_TOKEN_TTL_SECONDS}


def test_r2_the_code_itself_works_once_and_expires(w):
    w.send(VICTIM)
    code = w.inbox[VICTIM][-1]
    assert w.verify(VICTIM, code).status_code == 200
    assert w.verify(VICTIM, code).status_code == 400  # used up
    w.age(61)
    w.send(VICTIM)
    w.age(settings.OTP_TTL_SECONDS + 1)
    assert w.verify(VICTIM).status_code == 400  # expired


def test_r2_a_code_only_works_for_its_own_email(w):
    w.send(VICTIM)
    w.send(ATTACKER)
    assert w.verify(ATTACKER, w.inbox[VICTIM][-1]).status_code == 400


# ----- R3: member registration and Business registration are separate -----


def test_r3_a_business_verification_does_not_open_member_registration(w):
    w.b_send(VICTIM)
    business_token = w.b_verify(VICTIM).json()["verification_token"]
    r = w.register(VICTIM, token=business_token)
    assert (r.status_code, err(r)) == NOT_VERIFIED  # not "used"/"expired": another purpose says nothing
    # and a Business code is not a member code
    w.age(61)
    w.b_send(VICTIM)
    assert w.verify(VICTIM, w.inbox[VICTIM][-1]).status_code == 400


async def test_r3_business_registration_needs_its_own_token(w):
    plan = w.family.add_plan("BASIC")
    w.send(VICTIM)
    member_token = w.verify(VICTIM).json()["verification_token"]
    w.b_send(VICTIM)
    business_token = w.b_verify(VICTIM).json()["verification_token"]

    def body(token):
        return BusinessRegistrationCreateRequest(
            representative_name="Người Đại Diện", representative_email=VICTIM, representative_phone="0912345678",
            clan_name="Họ Thử Nghiệm", origin_place="Kim Liên, Nghệ An",
            requested_plan_id=plan.plan_id, verification_token=token,
        )

    async def create(token):
        return await public_use_cases.create_registration(
            db=w.db, users=w.repo, family=w.family, body=body(token),
            client=type("C", (), {"ip_address": None, "user_agent": None})(), otps=w.otps,
        )

    for bad in (None, member_token, "made-up"):
        with pytest.raises(AppError) as caught:
            await create(bad)
        assert "chưa được xác thực" in caught.value.message
    assert w.family.registrations == []
    created = await create(business_token)
    assert created.status == "PENDING" and len(w.family.registrations) == 1
    with pytest.raises(AppError):  # used once
        await create(business_token)


def test_r3_business_routes_answer_a_token_and_never_the_code(w):
    r = w.b_send(VICTIM)
    code = w.inbox[VICTIM][-1]
    assert r.status_code == 200 and code not in r.text
    v = w.b_verify(VICTIM)
    assert v.status_code == 200 and code not in v.text and len(v.json()["verification_token"]) >= 40


# ----- R4: limits per code, per address and purpose -----


def test_r4_five_wrong_codes_end_the_code(w):
    w.send(VICTIM)
    code = w.inbox[VICTIM][-1]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(settings.OTP_MAX_FAILED_ATTEMPTS):
        assert w.verify(VICTIM, wrong).status_code == 400
    assert w.verify(VICTIM, code).status_code == 400  # the right code no longer works


def test_r4_a_new_code_ends_the_previous_one(w):
    w.send(VICTIM)
    first = w.inbox[VICTIM][-1]
    w.age(61)
    w.send(VICTIM)
    assert len(w.inbox[VICTIM]) == 2
    if first != w.inbox[VICTIM][-1]:
        assert w.verify(VICTIM, first).status_code == 400


def test_r4_resend_cooldown_and_per_address_send_cap(w):
    assert w.send(VICTIM).status_code == 200
    r = w.send(VICTIM)
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0
    for _ in range(settings.OTP_MAX_SENDS_PER_EMAIL - 1):
        w.age(61)
        assert w.send(VICTIM).status_code == 200
    w.age(61)
    r = w.send(VICTIM)
    assert (r.status_code, err(r)) == (429, "OTP_RATE_LIMITED") and int(r.headers["Retry-After"]) > 60
    assert len(w.inbox[VICTIM]) == settings.OTP_MAX_SENDS_PER_EMAIL


def test_r4_wrong_codes_add_up_across_codes_and_lock_the_address(w, monkeypatch):
    """The old service gave 5 fresh attempts with every new code, forever."""
    monkeypatch.setattr(settings, "OTP_MAX_SENDS_PER_EMAIL", 100)
    evaluated = 0
    for _ in range(10):
        w.age(61)
        if w.send(VICTIM).status_code != 200:
            break
        code = w.inbox[VICTIM][-1]
        for g in range(5):
            guess = f"{g:06d}"
            if guess == code:
                continue
            w.verify(VICTIM, guess)
            evaluated += 1
    assert evaluated <= settings.OTP_MAX_FAILURES_PER_EMAIL + 5
    # locked: even the right code is refused, and no new code is sent
    w.age(61)
    assert w.send(VICTIM).status_code == 429


# ----- R5: hashes keyed by a secret, in the database -----


def test_r5_stored_rows_hold_no_code_no_email_and_no_plain_sha256(w):
    token = w.token_for(VICTIM)
    [row] = w.otps.rows
    code = w.inbox[VICTIM][-1]
    stored = str(vars(row))
    for secret in (code, VICTIM, token):
        assert secret not in stored
    assert row.code_hash != hashlib.sha256(code.encode()).hexdigest()  # not reversible without the key
    assert row.email_hash != hashlib.sha256(VICTIM.encode()).hexdigest()
    assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()


def test_r5_the_same_code_under_another_key_does_not_match(w, monkeypatch):
    w.send(VICTIM)
    code = w.inbox[VICTIM][-1]
    monkeypatch.setattr(settings, "OTP_HMAC_KEY", "another-key-entirely-0123456789")
    assert w.verify(VICTIM, code).status_code == 400


# ----- R6 / R7: no code, no full address in answers and logs -----


def test_r6_r7_answers_and_logs_hold_no_code_and_no_full_address(w, caplog):
    caplog.set_level(logging.DEBUG)
    sent = w.send(VICTIM)
    code = w.inbox[VICTIM][-1]
    wrong = w.verify(VICTIM, "000000" if code != "000000" else "111111")
    ok = w.verify(VICTIM, code)
    token = ok.json()["verification_token"]
    reg = w.register(VICTIM, token=token)
    assert reg.status_code == 201
    for r in (sent, wrong, ok, reg):
        assert code not in r.text
    for secret in (code, VICTIM, token):
        assert secret not in caplog.text


def test_r7_the_console_otp_sender_is_gone():
    import importlib.util

    # In a fresh clone app/services/common does not exist at all (git keeps no empty directory):
    # find_spec of the submodule then raises instead of returning None. Both mean "gone".
    try:
        spec = importlib.util.find_spec("app.services.common.email_service")
    except ModuleNotFoundError:
        spec = None
    assert spec is None



def test_m3b_each_register_public_refusal_has_its_own_code_and_vietnamese_sentence(w):
    token = w.token_for(VICTIM)
    missing = w.register(VICTIM)
    assert (missing.status_code, err(missing)) == NOT_VERIFIED
    assert "chưa được xác thực" in missing.json()["error"]["message"]
    assert w.register(VICTIM, token=token).status_code == 201
    used = w.register(VICTIM, token=token)
    assert "đã được sử dụng" in used.json()["error"]["message"]
    for r in (missing, used):
        assert token not in r.text and VICTIM not in r.text


def test_m3b_a_used_token_of_another_address_still_says_only_not_verified(w):
    attacker_token = w.token_for(ATTACKER)
    assert w.register(ATTACKER, token=attacker_token).status_code == 201
    r = w.register(VICTIM, token=attacker_token)  # used, but not this address's: no detail leaks
    assert (r.status_code, err(r)) == NOT_VERIFIED
