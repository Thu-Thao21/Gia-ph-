"""Auth API (Mốc D, Mốc M1) over HTTP with the real router and fakes: no DB, no Firebase.

Sessions come from POST /auth/login (the only way in; its own rules are in test_login_api.py).
Hashes use bcrypt cost 4 so the suite stays fast.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.controllers.auth_access import router as router_module
from app.controllers.auth_access.router import get_audit_writer, router
from app.core.errors import register_exception_handlers
from app.core.integrations.firebase import ProviderUnavailable, ProviderUser, get_identity_provider
from app.core.middleware.request_id import RequestIdMiddleware
from app.core.utils import otp_service
from app.db.postgres import get_db
from app.dependencies.auth import get_user_access_repo
from app.dependencies.permissions import get_family_repo, owner_actions, system_admin_actions
from tests.fakes import (
    FakeDb,
    FakeFamilyRepo,
    FakeIdentityProvider,
    FakeEmailOtpRepo,
    FakeUserAccessRepo,
    disabled_rate_limiters,
    make_user,
)
from app.dependencies.auth import get_email_otp_repo

PASSWORD = "Mat-Khau-Cu-123"
NEW_PASSWORD = "Mat-Khau-Moi-456"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def quick_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(4)).decode()


class World:
    def __init__(self) -> None:
        self.repo = FakeUserAccessRepo()
        self.family = FakeFamilyRepo()
        self.provider = FakeIdentityProvider()
        self.db = FakeDb(repo=self.repo)
        self.otps = FakeEmailOtpRepo()
        app = FastAPI()
        app.add_middleware(RequestIdMiddleware)
        register_exception_handlers(app)
        app.include_router(router, prefix="/api/v1")
        app.state.rate_limiters = disabled_rate_limiters()
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_user_access_repo] = lambda: self.repo
        app.dependency_overrides[get_family_repo] = lambda: self.family
        app.dependency_overrides[get_identity_provider] = lambda: self.provider
        app.dependency_overrides[get_email_otp_repo] = lambda: self.otps
        self.after_commit_audit: list[dict] = []  # rows the after-commit Firebase sync wrote

        async def audit_writer(**row):
            self.after_commit_audit.append(row)

        app.dependency_overrides[get_audit_writer] = lambda: audit_writer
        self.client = TestClient(app)

    def user(self, status="ACTIVE", *, password=PASSWORD, firebase=False, **cred):
        """A user that can log in with `password` (password=None: no hash at all)."""
        user = self.repo.add_user(make_user(status, first_login_required=cred.pop("first_login", False)))
        self.repo.set_cred(user, password_hash=quick_hash(password) if password else None, **cred)
        if firebase:  # the Firebase account exists, so a password change is synced to it
            self.provider.provider_users[user.firebase_uid] = ProviderUser(
                uid=user.firebase_uid, email=user.email, display_name=user.display_name, disabled=False
            )
        return user

    def login(self, user, password=PASSWORD):
        return self.client.post("/api/v1/auth/login", json={"email": user.email, "password": password})

    def token_for(self, user, password=PASSWORD) -> str:
        r = self.login(user, password)
        assert r.status_code == 200, r.text
        return r.json()["access_token"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def code(r):
    return r.json()["error"]["code"]


@pytest.fixture
def w() -> World:
    return World()


def restricted_cred(**extra):
    return dict(must_change_password=True, temporary_password_expires_at=utcnow() + timedelta(days=1), **extra)


# ----- GET /auth/me -----


def test_session_token_works_on_auth_me_and_me_carries_email_and_name(w):
    user = w.user()
    r = w.client.get("/api/v1/auth/me", headers=bearer(w.token_for(user)))
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == str(user.user_id)
    assert body["email"] == user.email and body["display_name"] == user.display_name


def test_me_for_system_admin_business_owner_and_family_admin(w):
    sa, bo, fa = w.user(), w.user(), w.user()
    bo.email = "bo.test@giapha.com"  # an Owner logs in with a @giapha.com address
    w.repo.grant(sa, "SYSTEM_ADMIN")
    clan = w.family.add_clan("ACTIVE")
    w.repo.grant(bo, "BUSINESS_OWNER", clan.clan_id)
    w.family.add_owner(clan, bo)
    w.family.add_member(clan, bo)
    w.family.add_member(clan, fa)
    w.repo.grant(fa, "FAMILY_ADMIN", clan.clan_id)
    w.family.add_fa(clan, fa, "MEMBER_ACCOUNT_MANAGE")

    me_sa = w.client.get("/api/v1/auth/me", headers=bearer(w.token_for(sa))).json()
    assert me_sa["permissions"] == system_admin_actions() and me_sa["memberships"] == []

    me_bo = w.client.get("/api/v1/auth/me", headers=bearer(w.token_for(bo))).json()
    assert me_bo["permissions"] == []
    [m] = me_bo["memberships"]
    assert m["clan_id"] == str(clan.clan_id) and m["roles"] == ["BUSINESS_OWNER"]
    assert m["permissions"] == owner_actions()

    me_fa = w.client.get("/api/v1/auth/me", headers=bearer(w.token_for(fa))).json()
    [m] = me_fa["memberships"]
    assert m["roles"] == ["FAMILY_ADMIN"] and m["permissions"] == ["MEMBER_ACCOUNT_MANAGE"]


def test_me_lists_roles_but_no_permissions_when_clan_not_active(w):
    bo = w.user()
    bo.email = "bo.pending@giapha.com"
    clan = w.family.add_clan("PENDING")
    w.repo.grant(bo, "BUSINESS_OWNER", clan.clan_id)
    w.family.add_owner(clan, bo)
    w.family.add_member(clan, bo)
    [m] = w.client.get("/api/v1/auth/me", headers=bearer(w.token_for(bo))).json()["memberships"]
    assert m["clan_status"] == "PENDING" and m["roles"] == ["BUSINESS_OWNER"] and m["permissions"] == []


def test_me_works_for_restricted_session(w):
    user = w.user("PENDING", **restricted_cred())
    r = w.client.get("/api/v1/auth/me", headers=bearer(w.token_for(user)))
    assert r.status_code == 200 and r.json()["requires_password_change"] is True


# ----- POST /auth/logout -----


def test_logout_revokes_the_current_session_only(w):
    user = w.user()
    t1, t2 = w.token_for(user), w.token_for(user)
    r = w.client.post("/api/v1/auth/logout", headers=bearer(t1))
    assert r.status_code == 204 and r.content == b""
    again = w.client.get("/api/v1/auth/me", headers=bearer(t1))
    assert (again.status_code, code(again)) == (401, "SESSION_INVALID")
    assert w.client.get("/api/v1/auth/me", headers=bearer(t2)).status_code == 200


def test_logout_without_token_is_401(w):
    r = w.client.post("/api/v1/auth/logout")
    assert (r.status_code, code(r)) == (401, "UNAUTHENTICATED")


# ----- POST /auth/change-password (checked and written in the DB) -----


def change(w, access, current=PASSWORD, new=NEW_PASSWORD):
    return w.client.post(
        "/api/v1/auth/change-password",
        headers=bearer(access),
        json={"current_password": current, "new_password": new},
    )


def test_first_password_change_activates_account_and_returns_a_new_session(w):
    user = w.user("PENDING", first_login=True, firebase=True, **restricted_cred())
    access, other = w.token_for(user), w.token_for(user)
    assert w.client.get("/api/v1/auth/me", headers=bearer(access)).json()["requires_password_change"] is True

    r = change(w, access)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["requires_password_change"] is False and body["user"]["status"] == "ACTIVE"
    new_access = body["access_token"]

    cred = w.repo.creds[user.user_id]
    assert user.status == "ACTIVE" and user.first_login_required is False
    assert cred.must_change_password is False
    assert cred.temporary_password_expires_at is None and cred.temporary_password_issued_at is None
    assert cred.password_changed_at is not None
    assert bcrypt.checkpw(NEW_PASSWORD.encode(), cred.password_hash.encode())
    # Every OLD session is gone, the restricted one included...
    for token in (access, other):
        assert code(w.client.get("/api/v1/auth/me", headers=bearer(token))) == "SESSION_INVALID"
    # ...and the one returned works, no longer restricted.
    me = w.client.get("/api/v1/auth/me", headers=bearer(new_access))
    assert me.status_code == 200 and me.json()["requires_password_change"] is False
    # Login: old password refused, new one accepted.
    assert code(w.login(user, PASSWORD)) == "AUTHENTICATION_FAILED"
    assert w.login(user, NEW_PASSWORD).status_code == 200
    # Firebase kept in sync AFTER the DB commit.
    assert w.provider.password_changes == [user.firebase_uid]
    assert w.repo.audit[-1]["action"] == "auth.password_changed"
    assert w.repo.audit[-1]["old_data"] == {"status": "PENDING"}
    for secret in (PASSWORD, NEW_PASSWORD):
        assert secret not in str(w.repo.audit)


def test_wrong_current_password_changes_nothing_and_counts(w):
    user = w.user(firebase=True)
    access = w.token_for(user)
    before = w.repo.creds[user.user_id].password_hash
    r = change(w, access, current="Sai-Mat-Khau-999")
    assert (r.status_code, code(r)) == (401, "AUTHENTICATION_FAILED")
    assert r.json()["error"]["message"] == "Mật khẩu hiện tại không đúng."
    cred = w.repo.creds[user.user_id]
    assert cred.password_hash == before and cred.failed_login_count == 1
    assert w.provider.password_changes == []
    assert w.client.get("/api/v1/auth/me", headers=bearer(access)).status_code == 200


def test_five_wrong_current_passwords_lock_the_account_and_end_its_sessions(w):
    user = w.user()
    access = w.token_for(user)
    for _ in range(4):
        assert code(change(w, access, current="Sai-Mat-Khau-999")) == "AUTHENTICATION_FAILED"
    r = change(w, access, current="Sai-Mat-Khau-999")
    assert (r.status_code, code(r)) == (403, "ACCOUNT_LOCKED") and "Retry-After" in r.headers
    assert w.repo.creds[user.user_id].locked_until is not None
    assert code(w.client.get("/api/v1/auth/me", headers=bearer(access))) == "SESSION_INVALID"
    assert code(w.login(user)) == "ACCOUNT_LOCKED"  # even with the right password


def test_new_password_must_differ_from_the_current_one(w):
    user = w.user()
    r = change(w, w.token_for(user), new=PASSWORD)
    assert (r.status_code, code(r)) == (422, "VALIDATION_ERROR")
    assert PASSWORD not in r.text


@pytest.mark.parametrize("weak", ["12345", "alllower123", "ALLUPPER123", "NoDigitsHere", "Aa1" + "x" * 70])
def test_weak_new_password_is_422_and_never_reaches_firebase(w, weak):
    user = w.user(firebase=True)
    r = change(w, w.token_for(user), new=weak)
    assert (r.status_code, code(r)) == (422, "VALIDATION_ERROR")
    assert weak not in r.text and w.provider.provider_calls == []


def test_firebase_down_still_succeeds_db_is_the_source_of_truth(w, caplog):
    caplog.set_level(logging.WARNING)
    user = w.user(firebase=True)
    w.provider.faults["get_user"] = [ProviderUnavailable("timeout")]
    r = change(w, w.token_for(user))
    assert r.status_code == 200
    assert bcrypt.checkpw(NEW_PASSWORD.encode(), w.repo.creds[user.user_id].password_hash.encode())
    assert "firebase_sync_failed:timeout" in caplog.text
    assert NEW_PASSWORD not in caplog.text and PASSWORD not in caplog.text
    # ...and an audit row, written after the commit, with the reason code only.
    assert w.after_commit_audit == [{
        "action": "auth.firebase_password_sync_failed", "user_id": user.user_id,
        "new_data": {"reason": "timeout"},
    }]


def test_password_change_logs_step_timings_without_secrets(w, caplog):
    caplog.set_level(logging.INFO, logger="mfg.auth")
    user = w.user(firebase=True)
    access = w.token_for(user)
    assert change(w, access).status_code == 200
    lines = [r.getMessage() for r in caplog.records if " timing " in r.getMessage()]
    login_line = next(l for l in lines if l.startswith("auth.login timing"))
    change_line = next(l for l in lines if l.startswith("auth.change_password timing"))
    firebase_line = next(l for l in lines if l.startswith("auth.firebase_sync timing"))
    for step in ("lookup=", "lock=", "bcrypt=", "rules=", "write=", "total="):
        assert step in login_line, login_line
    for step in ("user=", "lock=", "bcrypt_verify=", "bcrypt_hash=", "db_write=", "firebase=scheduled"):
        assert step in change_line, change_line
    assert "outcome=updated" in firebase_line
    for secret in (PASSWORD, NEW_PASSWORD, access, user.email, user.firebase_uid):
        assert all(secret not in l for l in lines)


def test_firebase_sync_runs_after_the_response_is_built(w):
    """The sync is a background job: the DB change is complete before Firebase is asked."""
    user = w.user(firebase=True)
    access = w.token_for(user)
    seen_hash_when_firebase_called = []

    async def hook(uid):
        seen_hash_when_firebase_called.append(w.repo.creds[user.user_id].password_hash)

    w.provider.hooks["get_user"] = hook
    assert change(w, access).status_code == 200
    [stored] = seen_hash_when_firebase_called
    assert bcrypt.checkpw(NEW_PASSWORD.encode(), stored.encode()) and w.db.commits >= 2


def test_no_firebase_account_is_fine(w):
    user = w.user(firebase=False)
    assert change(w, w.token_for(user)).status_code == 200
    assert w.provider.password_changes == []


def test_db_failure_is_503_and_firebase_is_not_touched(w):
    user = w.user(firebase=True)
    access = w.token_for(user)
    w.db.fail_commit = True
    r = change(w, access)
    assert (r.status_code, code(r)) == (503, "DATABASE_UNAVAILABLE")
    assert r.json()["error"]["request_id"] == r.headers["X-Request-ID"]
    assert w.db.rollbacks == 1 and w.provider.password_changes == []


def test_old_body_with_recent_id_token_is_rejected(w):
    user = w.user()
    r = w.client.post(
        "/api/v1/auth/change-password",
        headers=bearer(w.token_for(user)),
        json={"new_password": NEW_PASSWORD, "recent_id_token": "x"},
    )
    assert (r.status_code, code(r)) == (422, "VALIDATION_ERROR")


def test_restricted_session_still_blocked_on_business_routes_by_dependency():
    """Covered in test_login_api.py; listed here so the Mốc D surface is complete."""
    from app.dependencies.auth import RESTRICTED_ALLOWED_PATHS

    # Compared after route_path() strips the API prefix: both mounts of the same three routes.
    assert RESTRICTED_ALLOWED_PATHS == {"/auth/me", "/auth/change-password", "/auth/logout"}


def test_the_firebase_session_exchange_is_gone(w):
    r = w.client.post("/api/v1/auth/session", json={"id_token": "anything"})
    assert r.status_code in (404, 405)


# ----- registration (OTP + register-public) -----


@pytest.fixture
def sent_otps(monkeypatch) -> dict[str, str]:
    """Captures the OTP the route would e-mail (the database only keeps its HMAC)."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "OTP_HMAC_KEY", "test-otp-hmac-key-0123456789abcdef")
    sent: dict[str, str] = {}

    def fake_send(to_email: str, otp: str) -> bool:
        sent[to_email] = otp
        return True

    monkeypatch.setattr(otp_service, "send_otp_via_email", fake_send)
    return sent


def test_register_send_otp_rejects_non_gmail(w):
    r = w.client.post("/api/v1/auth/register-send-otp", json={"email": "user@yahoo.com"})
    assert r.status_code == 422


def test_register_send_otp_and_verify(w, sent_otps):
    email = "testuser123@gmail.com"
    r = w.client.post("/api/v1/auth/register-send-otp", json={"email": email})
    assert r.status_code == 200
    otp = sent_otps[email]

    # Verify wrong OTP
    wrong = "000000" if otp != "000000" else "111111"
    r_bad = w.client.post("/api/v1/auth/register-verify-otp", json={"email": email, "otp": wrong})
    assert r_bad.status_code == 400

    # Verify correct OTP: a one-time verification token, never the code
    r_ok = w.client.post("/api/v1/auth/register-verify-otp", json={"email": email, "otp": otp})
    assert r_ok.status_code == 200
    assert len(r_ok.json()["verification_token"]) >= 40 and otp not in r_ok.text


def register(w, sent_otps, email="newmember@gmail.com", password="Password123!"):
    w.client.post("/api/v1/auth/register-send-otp", json={"email": email})
    otp = sent_otps[email]
    verified = w.client.post("/api/v1/auth/register-verify-otp", json={"email": email, "otp": otp})
    return w.client.post(
        "/api/v1/auth/register-public",
        json={
            "email": email,
            "password": password,
            "display_name": "Thành viên Mới",
            "username": "newmember",
            "verification_token": verified.json()["verification_token"],
        },
    )


def test_register_public_success(w, sent_otps):
    r = register(w, sent_otps)
    assert r.status_code == 201, r.text
    body = r.json()
    assert "access_token" in body
    assert body["user"]["email"] == "newmember@gmail.com"
    [user] = w.repo.users.values()
    # Firebase account created first, with an own-<uuid> uid, then the DB user with a bcrypt hash.
    assert user.firebase_uid == f"own-{user.user_id}" and user.firebase_uid in w.provider.provider_users
    assert bcrypt.checkpw(b"Password123!", w.repo.creds[user.user_id].password_hash.encode())
    # The new account logs in through the one door.
    assert w.client.post(
        "/api/v1/auth/login", json={"email": "newmember@gmail.com", "password": "Password123!"}
    ).status_code == 200


def test_register_public_firebase_failure_creates_no_db_user(w, sent_otps):
    w.provider.faults["create_user"] = [ProviderUnavailable("down")]
    r = register(w, sent_otps)
    assert (r.status_code, code(r)) == (503, "PROVIDER_UNAVAILABLE")
    assert w.repo.users == {} and w.repo.creds == {} and w.repo.sessions == {}
    assert "Password123!" not in r.text


def test_register_public_weak_password_is_422_before_firebase(w, sent_otps):
    r = register(w, sent_otps, password="weakpass")
    assert (r.status_code, code(r)) == (422, "VALIDATION_ERROR")
    assert w.repo.users == {} and w.provider.provider_calls == []
