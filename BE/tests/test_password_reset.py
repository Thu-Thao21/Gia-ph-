"""Forgot password (Mốc M4/M4b): POST /auth/password-reset/request and /confirm, and the
Firebase REST adapter.

The route runs on the real router with fakes (no DB, no Firebase). The adapter runs for real
against httpx.MockTransport, so the request it builds and the Firebase error mapping are tested.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

import bcrypt
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.controllers.auth_access.router import get_audit_writer, router
from app.core.errors import register_exception_handlers
from app.controllers.auth_access import use_cases
from app.core.integrations.email_sender import EmailDeliveryResult, get_email_sender
from app.core.integrations.firebase import (
    PasswordRejected,
    ProviderEmailTaken,
    ProviderUnavailable,
    ProviderUser,
    ProviderUserExists,
    get_identity_provider,
)
from app.core.integrations.firebase_password_reset import (
    RESET_PASSWORD_URL,
    FirebasePasswordReset,
    ResetCodeExpired,
    ResetCodeInvalid,
    get_password_reset_provider,
)
from app.core.middleware.request_id import RequestIdMiddleware
from app.db.postgres import get_db
from app.dependencies.auth import get_user_access_repo
from app.dependencies.permissions import get_family_repo
from tests.fakes import (
    FakeDb,
    FakeFamilyRepo,
    FakeIdentityProvider,
    FakeUserAccessRepo,
    disabled_rate_limiters,
    make_user,
)

OLD, NEW = "Mat-Khau-Cu-123", "Mat-Khau-Moi-456"
GOOD_CODE, EXPIRED_CODE = "oob-good-code-1234", "oob-expired-code-5678"


class FakeReset:
    """Firebase's resetPassword: verify (keeps the code) and confirm (uses it up)."""

    def __init__(self) -> None:
        self.codes: dict[str, str] = {}  # code -> e-mail
        self.used: set[str] = set()
        self.confirmed: list[tuple[str, str]] = []  # (code, password) given to confirm
        self.verify_error: Exception | None = None
        self.confirm_error: Exception | None = None
        self.verify_calls = 0
        # False reproduces the M4b report: Firebase changes its password but the code stays valid.
        self.consume_on_confirm = True

    async def verify_reset_code(self, oob_code):
        self.verify_calls += 1
        if self.verify_error:
            raise self.verify_error
        if oob_code == EXPIRED_CODE:
            raise ResetCodeExpired()
        if oob_code not in self.codes or oob_code in self.used:
            raise ResetCodeInvalid()
        return self.codes[oob_code]

    async def confirm_reset(self, oob_code, new_password):
        if self.confirm_error:
            raise self.confirm_error
        if self.consume_on_confirm:
            self.used.add(oob_code)
        self.confirmed.append((oob_code, new_password))


class FakeSender:
    """Records the reset e-mails (address + link) instead of sending them."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []
        self.status = "SENT"
        self.error: str | None = None

    async def send_password_reset_link(self, *, to_email, display_name, reset_link):
        if self.status == "SENT":
            self.sent.append((to_email, reset_link))
        return EmailDeliveryResult(status=self.status, error=self.error)


class World:
    def __init__(self) -> None:
        self.repo = FakeUserAccessRepo()
        self.db = FakeDb(repo=self.repo)
        self.reset = FakeReset()
        self.provider = FakeIdentityProvider()
        self.sender = FakeSender()
        self.after_commit_audit: list[dict] = []
        self.app = app = FastAPI()
        app.add_middleware(RequestIdMiddleware)
        register_exception_handlers(app)
        app.include_router(router, prefix="/api/v1")
        app.state.rate_limiters = disabled_rate_limiters()

        async def audit_writer(**row):
            self.after_commit_audit.append(row)

        app.dependency_overrides.update({
            get_db: lambda: self.db,
            get_user_access_repo: lambda: self.repo,
            get_family_repo: lambda: FakeFamilyRepo(),
            get_password_reset_provider: lambda: self.reset,
            get_identity_provider: lambda: self.provider,
            get_email_sender: lambda: self.sender,
            get_audit_writer: lambda: audit_writer,
        })
        self.client = TestClient(app)

    def user(self, **cred):
        user = self.repo.add_user(make_user())
        self.repo.set_cred(user, password_hash=bcrypt.hashpw(OLD.encode(), bcrypt.gensalt(4)).decode(), **cred)
        self.reset.codes[GOOD_CODE] = user.email.upper()  # Firebase may answer in another case
        return user

    def login(self, user, password):
        return self.client.post("/api/v1/auth/login", json={"email": user.email, "password": password})

    def with_firebase_account(self, user):
        user.email = f"{user.user_id.hex[:10]}@gmail.com"  # the Email type takes Gmail / giapha.com only
        self.provider.provider_users[user.firebase_uid] = ProviderUser(
            uid=user.firebase_uid, email=user.email, display_name=user.display_name, disabled=False
        )
        return user

    def gmail_user(self, *, status="ACTIVE", firebase_uid=None):
        user = self.repo.add_user(make_user(status, firebase_uid=firebase_uid))
        user.email = f"{user.user_id.hex[:10]}@gmail.com"
        return user

    def request_reset(self, email):
        return self.client.post("/api/v1/auth/password-reset/request", json={"email": email})

    def confirm(self, code=GOOD_CODE, password=NEW):
        return self.client.post("/api/v1/auth/password-reset/confirm", json={"oob_code": code, "new_password": password})


def code(r):
    return r.status_code, r.json()["error"]["code"]


@pytest.fixture
def w(monkeypatch) -> World:
    monkeypatch.setattr(use_cases, "RESET_SYNC_BACKOFF_SECONDS", (0, 0))  # no real waits
    return World()


# ----- the happy path -----


def test_valid_code_changes_db_and_firebase_and_ends_every_session(w):
    user = w.user(failed_login_count=4, locked_until=datetime.now(timezone.utc) - timedelta(minutes=1),
                  must_change_password=True)
    old_token = w.login(user, OLD).json()["access_token"]
    assert w.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 200

    r = w.confirm()
    assert r.status_code == 204 and r.content == b""

    cred = w.repo.creds[user.user_id]
    assert bcrypt.checkpw(NEW.encode(), cred.password_hash.encode())
    assert cred.must_change_password is False and cred.failed_login_count == 0 and cred.locked_until is None
    assert cred.password_changed_at is not None
    # Firebase got the same password with the same code, after the DB commit.
    assert w.reset.confirmed == [(GOOD_CODE, NEW)] and w.db.commits >= 2
    # Old session revoked; old password refused; new password works.
    me = w.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_token}"})
    assert code(me) == (401, "SESSION_INVALID")
    assert code(w.login(user, OLD)) == (401, "AUTHENTICATION_FAILED")
    assert w.login(user, NEW).status_code == 200
    assert w.repo.audit[-1]["action"] == "auth.password_reset_confirm"
    assert NEW not in str(w.repo.audit) and GOOD_CODE not in str(w.repo.audit)
    assert w.after_commit_audit == []
    # The code is used up: a second use is refused.
    assert code(w.confirm(password="Mat-Khau-Khac-789")) == (400, "RESET_CODE_INVALID")


# ----- refused codes and passwords -----


def test_wrong_and_expired_codes_change_nothing(w):
    user = w.user()
    before = w.repo.creds[user.user_id].password_hash
    wrong = w.confirm(code="oob-not-a-real-code")
    expired = w.confirm(code=EXPIRED_CODE)
    assert code(wrong) == (400, "RESET_CODE_INVALID") and "không hợp lệ" in wrong.json()["error"]["message"]
    assert code(expired) == (400, "RESET_CODE_EXPIRED") and "hết hạn" in expired.json()["error"]["message"]
    assert w.repo.creds[user.user_id].password_hash == before and w.reset.confirmed == []
    assert w.login(user, OLD).status_code == 200


@pytest.mark.parametrize("weak", ["short1A", "alllower123", "ALLUPPER123", "NoDigitsHere", "Aa1" + "x" * 70])
def test_weak_password_is_422_before_firebase_is_asked(w, weak):
    w.user()
    r = w.confirm(password=weak)
    assert code(r) == (422, "VALIDATION_ERROR") and weak not in r.text
    assert w.reset.confirmed == []


def test_unknown_email_answers_exactly_like_a_bad_code(w):
    w.reset.codes["oob-code-for-a-stranger"] = "nobody-here@gmail.com"
    stranger = w.confirm(code="oob-code-for-a-stranger")
    bad = w.confirm(code="oob-not-a-real-code")
    assert code(stranger) == code(bad) == (400, "RESET_CODE_INVALID")
    assert stranger.json()["error"]["message"] == bad.json()["error"]["message"]
    assert w.reset.confirmed == []  # Firebase's password is not changed for a non-account


# ----- Firebase down -----


def test_firebase_down_when_verifying_is_503_and_changes_nothing(w):
    user = w.user()
    w.reset.verify_error = ProviderUnavailable("timeout")
    assert code(w.confirm()) == (503, "PROVIDER_UNAVAILABLE")
    assert w.login(user, OLD).status_code == 200


@pytest.mark.parametrize(("error", "reason", "attempts"), [
    (ProviderUnavailable("timeout"), "timeout", 3),  # transient: retried with backoff
    (PasswordRejected(), "password_rejected", 1),  # final: not retried
    (ResetCodeInvalid(), "code_rejected_on_confirm", 1),
])
def test_firebase_failing_after_the_commit_keeps_the_reset_and_records_the_mismatch(w, caplog, error, reason, attempts):
    caplog.set_level(logging.INFO)
    user = w.user()
    w.reset.confirm_error = error
    assert w.confirm().status_code == 204
    assert w.login(user, NEW).status_code == 200 and code(w.login(user, OLD))[0] == 401
    assert w.after_commit_audit == [{
        "action": "auth.password_reset_firebase_sync_failed", "user_id": user.user_id,
        "new_data": {"reason": reason, "attempts": attempts},
    }]
    assert f"firebase_sync_failed:{reason}" in caplog.text
    for secret in (NEW, OLD, GOOD_CODE, user.email, user.email.upper()):
        assert secret not in caplog.text


# ----- the REST adapter (real code, mocked HTTP) -----


def adapter(handler, key="test-api-key"):
    return FirebasePasswordReset(key, 3, transport=httpx.MockTransport(handler))


async def test_adapter_verify_sends_the_code_in_the_body_and_the_key_in_a_header():
    seen = []

    def handler(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, json={"email": "a@b.test", "requestType": "PASSWORD_RESET"})

    assert await adapter(handler).verify_reset_code("CODE-1") == "a@b.test"
    [req] = seen
    assert str(req.url) == RESET_PASSWORD_URL  # no key, no code in the URL
    assert req.headers["X-Goog-Api-Key"] == "test-api-key"
    assert json.loads(req.content) == {"oobCode": "CODE-1"}


async def test_adapter_confirm_sends_the_new_password():
    bodies = []

    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"email": "a@b.test", "requestType": "PASSWORD_RESET"})

    await adapter(handler).confirm_reset("CODE-1", NEW)
    assert bodies == [{"oobCode": "CODE-1", "newPassword": NEW}]


@pytest.mark.parametrize(("message", "expected"), [
    ("EXPIRED_OOB_CODE", ResetCodeExpired),
    ("INVALID_OOB_CODE", ResetCodeInvalid),
    ("USER_DISABLED", ResetCodeInvalid),
    ("WEAK_PASSWORD : Password should be at least 6 characters", PasswordRejected),
    ("API key not valid. Please pass a valid API key.", ProviderUnavailable),
])
async def test_adapter_maps_firebase_errors(message, expected):
    def handler(request):
        return httpx.Response(400, json={"error": {"code": 400, "message": message}})

    with pytest.raises(expected):
        await adapter(handler).verify_reset_code("CODE-1")


async def test_adapter_timeout_and_5xx_and_missing_key_are_provider_unavailable():
    def slow(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(ProviderUnavailable) as exc:
        await adapter(slow).verify_reset_code("CODE-1")
    assert exc.value.reason == "timeout"

    with pytest.raises(ProviderUnavailable):
        await adapter(lambda r: httpx.Response(503, json={})).verify_reset_code("CODE-1")

    calls = []
    with pytest.raises(ProviderUnavailable) as exc:
        await adapter(lambda r: calls.append(r) or httpx.Response(200, json={}), key="").verify_reset_code("C")
    assert exc.value.reason == "api_key_not_configured" and calls == []


async def test_adapter_refuses_a_code_of_another_kind():
    def handler(request):
        return httpx.Response(200, json={"email": "a@b.test", "requestType": "VERIFY_EMAIL"})

    with pytest.raises(ResetCodeInvalid):
        await adapter(handler).verify_reset_code("CODE-1")


# ----- M4b: a reset code works ONCE, whatever Firebase does with it -----


@pytest.mark.parametrize("firebase", ["keeps_the_code_valid", "times_out_after_the_commit"])
def test_a_used_code_is_refused_even_when_firebase_still_accepts_it(w, firebase):
    """The reported bug: same oobCode, page reopened, submitted again. Firebase may still call the
    code valid (it did not consume it, or its confirm call failed); the DB record refuses it."""
    user = w.user()
    if firebase == "keeps_the_code_valid":
        w.reset.consume_on_confirm = False
    else:
        w.reset.confirm_error = ProviderUnavailable("timeout")
    assert w.confirm(password=NEW).status_code == 204
    first_hash = w.repo.creds[user.user_id].password_hash
    verify_calls = w.reset.verify_calls
    token = w.login(user, NEW).json()["access_token"]

    again = w.confirm(password="Mat-Khau-Lan-Hai-789")
    assert code(again) == (400, "RESET_CODE_INVALID")
    assert "đã được sử dụng" in again.json()["error"]["message"]
    assert w.reset.verify_calls == verify_calls  # refused before Firebase was even asked
    assert w.repo.creds[user.user_id].password_hash == first_hash
    assert w.login(user, NEW).status_code == 200
    assert code(w.login(user, "Mat-Khau-Lan-Hai-789")) == (401, "AUTHENTICATION_FAILED")
    me = w.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200  # the refused retry revoked nothing
    assert [a["action"] for a in w.repo.audit].count("auth.password_reset_confirm") == 1


def test_two_racing_requests_with_one_code_change_the_password_once(w, monkeypatch):
    """Both pass the early check; the claim in the write transaction lets only one through."""
    user = w.user()
    w.reset.consume_on_confirm = False
    w.confirm(password=NEW)
    first_hash = w.repo.creds[user.user_id].password_hash

    async def not_used_yet(code_hash):  # the race: the early check saw no row
        return False

    monkeypatch.setattr(w.repo, "reset_code_used", not_used_yet)
    r = w.confirm(password="Mat-Khau-Lan-Hai-789")
    assert code(r) == (400, "RESET_CODE_INVALID")
    assert w.repo.creds[user.user_id].password_hash == first_hash and w.db.rollbacks >= 1


def test_the_db_stores_only_a_hash_of_the_code(w):
    from app.controllers.auth_access.use_cases import reset_code_hash

    w.user()
    w.confirm()
    [stored] = w.repo.used_reset_codes
    assert stored == reset_code_hash(GOOD_CODE) and GOOD_CODE not in stored
    assert len(stored) == 64 and all(c in "0123456789abcdef" for c in stored)  # the 0006 CHECK


async def test_the_claim_is_one_atomic_insert_on_used_password_reset_codes():
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz

    from sqlalchemy.dialects import postgresql

    from app.models.user_access.repository import UserAccessRepository

    class Recording:
        def __init__(self):
            self.sql = []

        async def execute(self, stmt):
            self.sql.append(str(stmt.compile(dialect=postgresql.dialect())))

            class R:
                def first(self):
                    return None

            return R()

    session = Recording()
    assert await UserAccessRepository(session).claim_reset_code(_uuid.uuid4(), "ab" * 32, now=_dt.now(_tz.utc)) is False
    [sql] = session.sql
    assert sql.startswith("INSERT INTO used_password_reset_codes")
    assert "ON CONFLICT (code_hash) DO NOTHING" in sql
    assert "RETURNING used_password_reset_codes.code_hash" in sql


async def test_adapter_logs_firebase_code_and_status_but_no_secret(caplog):
    caplog.set_level(logging.INFO, logger="mfg.firebase")

    def handler(request):
        body = json.loads(request.content)
        if "newPassword" in body:
            return httpx.Response(400, json={"error": {"code": 400, "message": "INVALID_OOB_CODE"}})
        return httpx.Response(200, json={"email": "secret.person@example.test", "requestType": "PASSWORD_RESET"})

    a = adapter(handler, key="KEY-SHOULD-NOT-APPEAR")
    assert await a.verify_reset_code("OOB-SHOULD-NOT-APPEAR") == "secret.person@example.test"
    with pytest.raises(ResetCodeInvalid):
        await a.confirm_reset("OOB-SHOULD-NOT-APPEAR", NEW)
    text = caplog.text
    assert "step=verify http_status=200 outcome=ok requestType=PASSWORD_RESET" in text
    assert "step=confirm http_status=400 outcome=INVALID_OOB_CODE" in text
    for secret in ("OOB-SHOULD-NOT-APPEAR", NEW, "secret.person@example.test", "KEY-SHOULD-NOT-APPEAR"):
        assert secret not in text


async def test_two_concurrent_confirms_with_one_code_only_one_succeeds():
    """Real interleaving (asyncio.gather): both requests pass the early check while the other is
    still at Firebase / bcrypt; the claim in the write transaction lets exactly one through."""
    import asyncio

    from app.controllers.auth_access.use_cases import ClientInfo, confirm_password_reset
    from app.core.errors import AppError

    repo = FakeUserAccessRepo()
    db = FakeDb(repo=repo)
    reset = FakeReset()
    reset.consume_on_confirm = False  # Firebase alone would let both through
    original_verify = reset.verify_reset_code

    async def slow_verify(oob_code):
        await asyncio.sleep(0.01)  # hand over to the other request after its early check
        return await original_verify(oob_code)

    reset.verify_reset_code = slow_verify
    user = repo.add_user(make_user())
    repo.set_cred(user, password_hash=bcrypt.hashpw(OLD.encode(), bcrypt.gensalt(4)).decode())
    reset.codes[GOOD_CODE] = user.email

    async def attempt(password):
        try:
            await confirm_password_reset(
                db=db, users=repo, reset=reset, oob_code=GOOD_CODE, new_password=password,
                client=ClientInfo(ip_address=None, user_agent=None),
            )
            return password
        except AppError as exc:
            return exc.code

    results = await asyncio.gather(attempt(NEW), attempt("Mat-Khau-Lan-Hai-789"))
    winners = [r for r in results if isinstance(r, str) and r.startswith("Mat-Khau")]
    assert len(winners) == 1
    assert [r for r in results if r not in winners] == ["RESET_CODE_INVALID"]
    assert reset.verify_calls == 2  # both really passed the early check
    assert bcrypt.checkpw(winners[0].encode(), repo.creds[user.user_id].password_hash.encode())
    assert len(repo.used_reset_codes) == 1 and db.rollbacks == 1
    assert [a["action"] for a in repo.audit].count("auth.password_reset_confirm") == 1


def test_a_transient_firebase_failure_is_retried_and_then_not_audited(w):
    user = w.user()
    failures = [ProviderUnavailable("timeout")]
    original = w.reset.confirm_reset

    async def flaky(oob_code, new_password):
        if failures:
            raise failures.pop()
        await original(oob_code, new_password)

    w.reset.confirm_reset = flaky
    assert w.confirm().status_code == 204
    assert w.reset.confirmed == [(GOOD_CODE, NEW)] and w.after_commit_audit == []
    assert w.login(user, NEW).status_code == 200


# ----- POST /auth/password-reset/request (Mốc M4b: the app mails its own link; M3a) -----


def masked(email):
    return email[0] + "***@gmail.com"


def actions(w):
    return [a["action"] for a in w.after_commit_audit]


def own():
    import uuid as _uuid

    return f"own-{_uuid.uuid4()}"


def test_request_always_answers_the_same_200(w):
    active = w.with_firebase_account(w.user())
    no_firebase = w.gmail_user()
    disabled = w.gmail_user(status="DISABLED")
    answers = [
        w.request_reset(email)
        for email in (active.email, no_firebase.email, disabled.email, "nobody-here@gmail.com")
    ]
    assert {r.status_code for r in answers} == {200}
    assert len({r.content for r in answers}) == 1  # byte-for-byte the same body
    assert "Nếu địa chỉ email này có tài khoản" in answers[0].json()["message"]


def test_request_mails_the_app_link_to_an_active_user(w, caplog):
    caplog.set_level(logging.DEBUG)
    user = w.with_firebase_account(w.user())
    assert w.request_reset(user.email.upper()).status_code == 200

    [(to, link)] = w.sender.sent
    [oob] = w.provider.issued_reset_codes
    assert to == user.email
    assert link == f"http://localhost:5173/reset-password?mode=resetPassword&oobCode={oob}"
    assert "firebaseapp.com" not in link and "apiKey" not in link
    assert oob not in caplog.text and link not in caplog.text and user.email not in caplog.text
    assert w.after_commit_audit == [{
        "action": "auth.password_reset_email_sent", "user_id": user.user_id,
        "new_data": {"email": masked(user.email)},
    }]
    assert [op for op, _ in w.provider.provider_calls if op == "create_user"] == []


def test_request_uses_frontend_base_url(w, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "https://giapha.example/")
    user = w.with_firebase_account(w.user())
    w.request_reset(user.email)
    [(_, link)] = w.sender.sent
    assert link.startswith("https://giapha.example/reset-password?mode=resetPassword&oobCode=oob-")


def test_request_for_an_unknown_email_is_audited_masked_and_sends_nothing(w):
    w.request_reset("nobody-here@gmail.com")
    assert w.sender.sent == [] and w.provider.provider_calls == []
    assert w.after_commit_audit == [{
        "action": "auth.password_reset_no_db_user", "user_id": None,
        "new_data": {"email": "n***@gmail.com"},
    }]


@pytest.mark.parametrize("status", ["DISABLED", "LOCKED", "PENDING", "SUSPENDED"])
def test_request_for_an_inactive_account_creates_nothing_and_sends_nothing(w, status):
    user = w.gmail_user(status=status, firebase_uid=own())
    w.request_reset(user.email)
    assert w.sender.sent == [] and w.provider.provider_calls == []  # no Firebase account created
    assert w.after_commit_audit == [{
        "action": "auth.password_reset_account_not_active", "user_id": user.user_id,
        "new_data": {"email": masked(user.email)},
    }]


def test_request_creates_the_missing_firebase_account_then_mails_the_link(w, caplog):
    """Mốc M3a: ACTIVE in the DB, no Firebase account -> created with the DB uid and e-mail and a
    random password nobody receives, then the link is mailed as usual."""
    caplog.set_level(logging.DEBUG)
    user = w.gmail_user(firebase_uid=own())
    assert w.request_reset(user.email).status_code == 200

    created = w.provider.provider_users[user.firebase_uid]
    assert created.email == user.email and created.display_name == user.display_name
    # The password: strong (token_urlsafe(32) = 43 chars); the fake keeps only its shape.
    [shape] = [s for s in w.provider.password_shapes if s[0] == "create_user"]
    assert shape[1] >= 40
    [(to, link)] = w.sender.sent
    assert to == user.email and "oobCode=oob-" in link
    assert actions(w) == ["auth.password_reset_firebase_account_created", "auth.password_reset_email_sent"]
    assert w.after_commit_audit[0]["new_data"] == {"email": masked(user.email)}
    assert user.email not in str(w.after_commit_audit) and user.email not in caplog.text


def test_request_does_not_create_an_account_for_a_uid_the_app_does_not_manage(w):
    user = w.gmail_user()  # firebase_uid "fake-uid-...", not own-<uuid>
    assert w.request_reset(user.email).status_code == 200
    assert w.sender.sent == [] and user.firebase_uid not in w.provider.provider_users
    assert w.after_commit_audit == [{
        "action": "auth.password_reset_firebase_account_create_failed", "user_id": user.user_id,
        "new_data": {"email": masked(user.email), "reason": "uid_not_app_managed"},
    }]


@pytest.mark.parametrize(("fault", "reason"), [
    (ProviderUnavailable("create_user_failed"), "create_user_failed"),
    (ProviderUserExists(), "uid_taken_by_other_email"),
])
def test_request_firebase_create_failure_is_audited_sends_nothing_and_still_200(w, fault, reason):
    user = w.gmail_user(firebase_uid=own())
    w.provider.faults["create_user"] = [fault]
    r = w.request_reset(user.email)
    assert r.status_code == 200 and "Nếu địa chỉ email này có tài khoản" in r.json()["message"]
    assert w.sender.sent == []
    assert w.after_commit_audit == [{
        "action": "auth.password_reset_firebase_account_create_failed", "user_id": user.user_id,
        "new_data": {"email": masked(user.email), "reason": reason},
    }]


def test_request_when_a_concurrent_request_created_the_account_first_still_mails(w):
    user = w.gmail_user(firebase_uid=own())
    w.provider.faults["create_user"] = [ProviderEmailTaken()]
    original = w.provider.generate_password_reset_link
    calls = []

    async def link_after_race(email):
        calls.append(email)
        if len(calls) == 2:  # the other request's account exists by now
            w.provider.provider_users[user.firebase_uid] = ProviderUser(
                uid=user.firebase_uid, email=user.email, display_name=user.display_name, disabled=False
            )
        return await original(email)

    w.provider.generate_password_reset_link = link_after_race
    w.request_reset(user.email)
    assert len(w.sender.sent) == 1
    assert actions(w) == ["auth.password_reset_email_sent"]  # not "created": the other one did


@pytest.mark.parametrize(("error", "expected"), [
    ("SMTPAuthenticationError", "SMTPAuthenticationError"),
    ("smtp_not_configured", "smtp_not_configured"),
    (None, "unknown"),
])
def test_request_smtp_failure_is_audited_with_the_exception_name_and_still_200(w, error, expected):
    user = w.with_firebase_account(w.user())
    w.sender.status, w.sender.error = "FAILED", error
    assert w.request_reset(user.email).status_code == 200
    assert w.after_commit_audit == [{
        "action": "auth.password_reset_email_failed", "user_id": user.user_id,
        "new_data": {"email": masked(user.email), "reason": "email_not_sent", "error": expected},
    }]


def test_request_sender_crash_is_audited_too(w):
    user = w.with_firebase_account(w.user())

    async def boom(**_):
        raise TimeoutError("smtp.example:587 user@x")

    w.sender.send_password_reset_link = boom
    assert w.request_reset(user.email).status_code == 200
    assert w.after_commit_audit[-1]["new_data"]["error"] == "TimeoutError"
    assert "smtp.example" not in str(w.after_commit_audit)


def test_request_rate_limits_per_email_silently_and_per_ip_with_429(w):
    limiters = disabled_rate_limiters()  # request: 5 per IP; request_email: 3 per e-mail
    limiters.enabled = True
    w.app.state.rate_limiters = limiters
    user = w.with_firebase_account(w.user())

    answers = [w.request_reset(user.email) for _ in range(4)]
    assert [r.status_code for r in answers] == [200] * 4
    assert len(w.sender.sent) == 3  # the 4th is silently not sent: same 200, no e-mail
    assert actions(w)[-1] == "auth.password_reset_email_rate_limited"
    assert w.after_commit_audit[-1]["new_data"] == {"email": masked(user.email)}
    assert w.request_reset("nobody-here@gmail.com").status_code == 200
    assert code(w.request_reset(user.email)) == (429, "RATE_LIMITED")  # 6th from this address


async def test_smtp_sender_reports_the_exception_class_and_logs_no_address(monkeypatch, caplog):
    import smtplib

    from app.core.integrations import email_sender

    class FailingSMTP:
        def __init__(self, *a, **k):
            raise smtplib.SMTPAuthenticationError(535, b"bad creds for sender@gmail.com")

    monkeypatch.setattr(email_sender, "smtp_settings", lambda: ("smtp.test", 587, "sender@gmail.com", "pw-not-real"))
    monkeypatch.setattr(email_sender.smtplib, "SMTP", FailingSMTP)
    caplog.set_level(logging.DEBUG)
    result = await email_sender.SmtpEmailSender().send_password_reset_link(
        to_email="target@gmail.com", display_name="X",
        reset_link="http://localhost:5173/reset-password?oobCode=secret-code",
    )
    assert result.status == "FAILED" and result.error == "SMTPAuthenticationError"
    for secret in ("target@gmail.com", "sender@gmail.com", "pw-not-real", "secret-code"):
        assert secret not in caplog.text

    monkeypatch.setattr(email_sender, "smtp_settings", lambda: ("smtp.test", 587, "", ""))
    result = await email_sender.SmtpEmailSender().send_password_reset_link(
        to_email="t@gmail.com", display_name="X", reset_link="x"
    )
    assert result.error == "smtp_not_configured"


def test_app_loggers_print_info_on_the_console():
    from app.main import configure_logging

    configure_logging()
    configure_logging()  # idempotent: one console handler
    app_logger = logging.getLogger("mfg")
    consoles = [h for h in app_logger.handlers if getattr(h, "_mfg_console", False)]
    assert len(consoles) == 1 and app_logger.level == logging.INFO
    assert logging.getLogger("mfg.auth").getEffectiveLevel() == logging.INFO
