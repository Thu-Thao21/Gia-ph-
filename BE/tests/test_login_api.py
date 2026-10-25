"""POST /auth/login (Moc M1): the DB password login, over HTTP with the real router and fakes.

No DB, no Firebase. Hashes use bcrypt cost 4 so the suite stays fast (verification cost comes
from the stored hash); the dummy hash of the "no user / no hash" path keeps cost 12.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.controllers.auth_access import use_cases
from app.controllers.auth_access.router import router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.middleware.rate_limit import build_rate_limiters
from app.core.middleware.request_id import RequestIdMiddleware
from app.db.postgres import get_db
from app.dependencies.auth import Principal, get_principal, get_user_access_repo
from app.dependencies.permissions import get_family_repo
from tests.fakes import FakeDb, FakeFamilyRepo, FakeUserAccessRepo, disabled_rate_limiters, make_user

PASSWORD = "Dung-Mat-Khau-123"
GENERIC_MESSAGE = "Email/tên đăng nhập hoặc mật khẩu không đúng."
T0 = datetime(2026, 10, 25, 8, 0, tzinfo=timezone.utc)


def quick_hash(password: str = PASSWORD) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(4)).decode()


class Clock:
    """Wall clock of the use case (lockout) and monotonic clock of the rate limiter."""

    def __init__(self) -> None:
        self.now = T0

    def advance(self, **delta) -> None:
        self.now += timedelta(**delta)

    def monotonic(self) -> float:
        return (self.now - T0).total_seconds()


class World:
    def __init__(self, monkeypatch, *, rate_limited: bool = False) -> None:
        self.clock = Clock()
        monkeypatch.setattr(use_cases, "_now", lambda: self.clock.now)
        self.verified: list[str | None] = []  # the stored hash given to each bcrypt check
        real_verify = use_cases.verify_password

        def spy(raw, stored_hash):
            self.verified.append(stored_hash)
            return real_verify(raw, stored_hash)

        monkeypatch.setattr(use_cases, "verify_password", spy)

        self.repo = FakeUserAccessRepo()
        self.db = FakeDb(repo=self.repo)
        app = FastAPI()
        app.add_middleware(RequestIdMiddleware)
        register_exception_handlers(app)
        app.include_router(router, prefix="/api/v1")

        @app.get("/api/v1/business-route")
        async def business_route(principal: Principal = Depends(get_principal)):
            return {"ok": True}

        app.state.rate_limiters = (
            build_rate_limiters(settings, clock=self.clock.monotonic) if rate_limited else disabled_rate_limiters()
        )
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_user_access_repo] = lambda: self.repo
        app.dependency_overrides[get_family_repo] = lambda: FakeFamilyRepo()
        self.client = TestClient(app)

    def user(self, status="ACTIVE", *, username=None, first_login=False, **cred):
        user = self.repo.add_user(make_user(status, first_login_required=first_login))
        user.username = username
        if cred:
            self.repo.set_cred(user, **cred)
        return user

    def login(self, ident, password=PASSWORD):
        return self.client.post("/api/v1/auth/login", json={"email": ident, "password": password})

    def cred(self, user):
        return self.repo.creds[user.user_id]

    def reasons(self):
        return [h.failure_reason for h in self.db.committed_login_history]


def err(r):
    return r.status_code, r.json()["error"]["code"]


@pytest.fixture
def w(monkeypatch) -> World:
    return World(monkeypatch)


# ----- one generic answer -----


def test_account_without_hash_is_refused_never_let_in(w):
    user = w.user(password_hash=None, must_change_password=True)
    r = w.login(user.email)
    assert err(r) == (401, "AUTHENTICATION_FAILED")
    assert r.json()["error"]["message"] == GENERIC_MESSAGE
    assert w.repo.sessions == {}
    assert w.reasons() == ["NO_PASSWORD_HASH"]
    assert w.verified == [None]  # bcrypt still ran (dummy hash): same timing as a wrong password


def test_account_without_credential_row_is_refused(w):
    user = w.user()
    assert err(w.login(user.email)) == (401, "AUTHENTICATION_FAILED")
    assert w.repo.sessions == {} and w.reasons() == ["NO_PASSWORD_HASH"]


def test_wrong_password_and_unknown_email_get_the_same_answer(w):
    user = w.user(password_hash=quick_hash())
    wrong = w.login(user.email, "Sai-Mat-Khau-999")
    unknown = w.login("nobody@example.test")
    assert err(wrong) == err(unknown) == (401, "AUTHENTICATION_FAILED")
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"] == GENERIC_MESSAGE
    assert wrong.headers.get("WWW-Authenticate") == unknown.headers.get("WWW-Authenticate")
    # Both ran exactly one bcrypt check; precise reasons stay in the DB only.
    assert len(w.verified) == 2 and w.verified[1] is None
    assert w.reasons() == ["WRONG_PASSWORD", "UNKNOWN_IDENTIFIER"]
    assert w.db.committed_login_history[1].user_id is None


def test_malformed_hash_is_a_wrong_password_not_a_500(w):
    user = w.user(password_hash="not-a-bcrypt-hash")
    assert err(w.login(user.email)) == (401, "AUTHENTICATION_FAILED")


# ----- success -----


def test_right_password_logs_in_and_resets_the_counter(w):
    user = w.user(password_hash=quick_hash(), failed_login_count=3)
    r = w.login(user.email.upper())  # e-mail in any letter case
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token_type"] == "Bearer" and body["requires_password_change"] is False
    assert body["user"]["user_id"] == str(user.user_id)
    assert w.cred(user).failed_login_count == 0 and w.cred(user).locked_until is None
    assert user.last_login_at == T0
    assert [(h.success, h.failure_reason) for h in w.db.committed_login_history] == [(True, None)]
    assert len(w.repo.sessions) == 1
    assert w.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}).status_code == 200


def test_login_by_username(w):
    user = w.user(username="GiaHuy", password_hash=quick_hash())
    assert w.login("giahuy").status_code == 200
    assert w.login("GIAHUY").status_code == 200
    assert user.last_login_at is not None


def test_responses_are_never_cached(w):
    user = w.user(password_hash=quick_hash())
    for r in (w.login(user.email), w.login(user.email, "Sai-Mat-Khau-999"), w.login("x@example.test")):
        assert r.headers["Cache-Control"] == "no-store", r.status_code


# ----- lockout per account -----


def test_five_wrong_passwords_lock_the_account_for_15_minutes(w):
    user = w.user(password_hash=quick_hash())
    for _ in range(4):
        assert err(w.login(user.email, "Sai-Mat-Khau-999")) == (401, "AUTHENTICATION_FAILED")
    assert w.cred(user).locked_until is None and w.cred(user).failed_login_count == 4

    fifth = w.login(user.email, "Sai-Mat-Khau-999")
    assert err(fifth) == (401, "AUTHENTICATION_FAILED")
    assert w.cred(user).locked_until == T0 + timedelta(minutes=15)

    # Locked: even the RIGHT password is refused, and the answer does not say whether it was right.
    w.clock.advance(minutes=5)
    right, wrong = w.login(user.email), w.login(user.email, "Sai-Mat-Khau-999")
    assert err(right) == err(wrong) == (403, "ACCOUNT_LOCKED")
    assert right.json()["error"]["message"] == wrong.json()["error"]["message"]
    assert "10 phút" in right.json()["error"]["message"]
    assert right.headers["Retry-After"] == str(10 * 60)
    assert w.repo.sessions == {}
    checks_while_locked = len(w.verified)

    # 15 minutes after the lock it opens again; the right password works and resets everything.
    w.clock.advance(minutes=10, seconds=1)
    assert w.login(user.email).status_code == 200
    assert len(w.verified) == checks_while_locked + 1  # no bcrypt check ran while locked
    assert w.cred(user).failed_login_count == 0 and w.cred(user).locked_until is None
    assert w.reasons()[:6] == ["WRONG_PASSWORD"] * 4 + ["WRONG_PASSWORD_LOCKED_NOW", "ACCOUNT_LOCKED"]


@pytest.mark.parametrize("has_cred_row", [True, False], ids=["hash-null", "no-credential-row"])
def test_account_without_hash_locks_exactly_like_a_wrong_password(w, has_cred_row):
    """M1c: an existing account with no password must not stand out by never locking."""
    user = w.user(password_hash=None) if has_cred_row else w.user()
    hashed = w.user(password_hash=quick_hash())
    answers = {}
    for target in (user, hashed):
        answers[target.user_id] = [w.login(target.email, "Sai-Mat-Khau-999") for _ in range(6)]
    first_five_no_hash, sixth_no_hash = answers[user.user_id][:5], answers[user.user_id][5]
    first_five_hash, sixth_hash = answers[hashed.user_id][:5], answers[hashed.user_id][5]

    assert [err(r) for r in first_five_no_hash] == [(401, "AUTHENTICATION_FAILED")] * 5
    assert err(sixth_no_hash) == (403, "ACCOUNT_LOCKED")
    assert w.cred(user).failed_login_count == 5
    assert w.cred(user).locked_until == T0 + timedelta(minutes=15)
    # Same codes, messages and lock as the account WITH a hash: nothing tells them apart.
    for a, b in zip(first_five_no_hash + [sixth_no_hash], first_five_hash + [sixth_hash]):
        assert err(a) == err(b) and a.json()["error"]["message"] == b.json()["error"]["message"]
        assert a.headers.get("Retry-After") == b.headers.get("Retry-After")
    assert w.cred(user).password_hash is None  # and it still cannot log in


def test_after_the_lock_the_count_starts_again_from_zero(w):
    user = w.user(password_hash=quick_hash())
    for _ in range(5):
        w.login(user.email, "Sai-Mat-Khau-999")
    w.clock.advance(minutes=16)
    assert err(w.login(user.email, "Sai-Mat-Khau-999")) == (401, "AUTHENTICATION_FAILED")
    assert w.cred(user).failed_login_count == 1 and w.cred(user).locked_until is None


def test_a_right_password_between_wrong_ones_resets_the_streak(w):
    user = w.user(password_hash=quick_hash())
    for _ in range(4):
        w.login(user.email, "Sai-Mat-Khau-999")
    assert w.login(user.email).status_code == 200
    for _ in range(4):
        w.login(user.email, "Sai-Mat-Khau-999")
    assert w.cred(user).locked_until is None and w.cred(user).failed_login_count == 4


# ----- rate limit per caller address -----


def test_eleventh_request_in_ten_minutes_is_429_with_retry_after(monkeypatch):
    w = World(monkeypatch, rate_limited=True)
    for _ in range(10):
        assert w.login("nobody@example.test").status_code == 401
    r = w.login("nobody@example.test")
    assert err(r) == (429, "RATE_LIMITED")
    assert r.headers["Retry-After"] == "600"
    assert len(w.verified) == 10  # the refused call never reached the lookup or bcrypt
    w.clock.advance(minutes=10, seconds=1)
    assert w.login("nobody@example.test").status_code == 401


# ----- account rules after the password -----


def test_must_change_password_gives_a_restricted_session(w):
    user = w.user(password_hash=quick_hash(), must_change_password=True)
    r = w.login(user.email)
    assert r.status_code == 200 and r.json()["requires_password_change"] is True
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = w.client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200 and me.json()["requires_password_change"] is True
    assert err(w.client.get("/api/v1/business-route", headers=headers)) == (403, "PASSWORD_CHANGE_REQUIRED")


@pytest.mark.parametrize("status", ["LOCKED", "SUSPENDED", "DISABLED", "INACTIVE"])
def test_blocked_accounts_are_refused_even_with_the_right_password(w, status):
    user = w.user(status, password_hash=quick_hash())
    assert err(w.login(user.email)) == (403, "ACCOUNT_BLOCKED")
    assert w.repo.sessions == {} and w.reasons() == ["ACCOUNT_BLOCKED"]
    # The status is checked AFTER the password: a wrong one says nothing about the account.
    assert err(w.login(user.email, "Sai-Mat-Khau-999")) == (401, "AUTHENTICATION_FAILED")


def test_expired_temporary_password_is_refused(w):
    user = w.user(
        "PENDING", password_hash=quick_hash(), must_change_password=True,
        temporary_password_expires_at=T0 - timedelta(minutes=1),
    )
    assert err(w.login(user.email)) == (403, "TEMPORARY_PASSWORD_EXPIRED")
    assert w.reasons() == ["TEMPORARY_PASSWORD_EXPIRED"]


def test_business_owner_must_use_a_giapha_address(w):
    gmail = w.user(password_hash=quick_hash())
    w.repo.grant(gmail, "BUSINESS_OWNER")
    r = w.login(gmail.email)
    assert err(r) == (403, "FORBIDDEN") and "@giapha.com" in r.json()["error"]["message"]
    assert w.reasons() == ["OWNER_EMAIL_DOMAIN_REQUIRED"]

    owner = w.user(password_hash=quick_hash())
    owner.email = "vo.test@giapha.com"
    w.repo.grant(owner, "BUSINESS_OWNER")
    assert w.login(owner.email).status_code == 200


@pytest.mark.parametrize("body", [{}, {"email": "a@b.test"}, {"email": "", "password": "x"},
                                  {"email": "a@b.test", "password": ""}, {"email": "a@b.test", "password": "x", "x": 1}])
def test_body_validation_never_echoes_the_password(w, body):
    r = w.client.post("/api/v1/auth/login", json=body)
    assert err(r) == (422, "VALIDATION_ERROR")
    assert PASSWORD not in r.text


def test_password_is_never_logged_or_stored(w, caplog):
    caplog.set_level(logging.DEBUG)
    user = w.user(password_hash=quick_hash())
    w.login(user.email, "Sai-Mat-Khau-999")
    w.login(user.email)
    stored = repr([vars(h) for h in w.repo.login_history])
    for secret in (PASSWORD, "Sai-Mat-Khau-999"):
        assert secret not in caplog.text and secret not in stored
    assert user.email not in caplog.text
