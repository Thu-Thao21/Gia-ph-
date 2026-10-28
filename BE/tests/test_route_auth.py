"""Every route needs a session unless app/core/public_routes.py says otherwise (Mốc M2, N-3).

The real app.main.app (both mounts: root and /api/v1), no token, every route: anything not in
ALLOWLIST_PUBLIC must answer 401 (never 200, 403, 404, 422 or 500). A route added without
authentication makes this test fail until it is listed in ALLOWLIST_PUBLIC with a reason.
No DB: get_db is replaced by a fake that fails the test if it is ever used.
"""

from __future__ import annotations

import re
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.public_routes import ALLOWLIST_PUBLIC, is_public, iter_routes
from app.db.postgres import get_db
from app.dependencies.auth import API_PREFIX, route_path
from app.main import app
from tests.fakes import disabled_rate_limiters

PARAM = re.compile(r"{[^}]+}")


class NoDatabase:
    """Any use means the route reached the database before checking the session."""

    def __getattr__(self, name):
        raise AssertionError(f"DB used before authentication: db.{name}")


def concrete(path: str) -> str:
    return PARAM.sub(str(uuid.UUID(int=1)), path)


ROUTES = sorted(
    ((method, r.path) for r in iter_routes(app) for method in r.methods),
    key=lambda mp: (mp[1], mp[0]),
)
PROTECTED = [(m, p) for m, p in ROUTES if not is_public(m, p)]


@pytest.fixture(scope="module")
def client():
    saved_overrides, saved_limiters = dict(app.dependency_overrides), app.state.rate_limiters
    app.dependency_overrides[get_db] = lambda: NoDatabase()
    app.state.rate_limiters = disabled_rate_limiters()
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved_overrides)
        app.state.rate_limiters = saved_limiters


def test_the_inventory_sees_both_mounts_and_enough_routes():
    paths = {p for _, p in ROUTES}
    assert len(ROUTES) > 100
    assert "/auth/me" in paths and f"{API_PREFIX}/auth/me" in paths
    assert "/members" in paths and f"{API_PREFIX}/members" in paths


@pytest.mark.parametrize(("method", "path"), PROTECTED, ids=[f"{m} {p}" for m, p in PROTECTED])
def test_every_non_public_route_answers_401_without_a_token(client, method, path):
    kwargs = {"json": {}} if method in ("POST", "PUT", "PATCH") else {}
    r = client.request(method, concrete(path), **kwargs)
    assert r.status_code == 401, f"{method} {path} -> {r.status_code} {r.text[:200]}"
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_every_allowlist_entry_is_a_real_route():
    """No stale or misspelled entries: each one matches a route the app serves."""
    served = {(m, route_path(p)) for m, p in ROUTES}
    for entry in ALLOWLIST_PUBLIC:
        assert (entry.method, entry.path) in served, entry
        assert entry.reason.strip(), entry


def test_public_routes_are_exactly_the_allowlist():
    public = sorted({(m, route_path(p)) for m, p in ROUTES if is_public(m, p)})
    assert public == sorted((e.method, e.path) for e in ALLOWLIST_PUBLIC)


def test_both_mounts_of_a_route_have_the_same_authentication():
    """main.py mounts every router twice; a guard must never exist on only one of them."""
    from scripts.route_inventory import inventory

    by_route: dict[tuple[str, str], set[bool]] = {}
    for row in inventory(app):
        for method in row.methods.split(","):
            by_route.setdefault((method, route_path(row.path)), set()).add(row.authenticated)
    mixed = {k: v for k, v in by_route.items() if len(v) > 1}
    assert mixed == {}, mixed


def test_the_login_rate_limit_is_shared_by_both_mounts():
    """One limiter per name and caller address, whatever mount the call came in on."""
    from app.core.middleware.rate_limit import build_rate_limiters
    from app.core.config import settings

    saved = app.state.rate_limiters
    app.state.rate_limiters = build_rate_limiters(settings)
    app.dependency_overrides[get_db] = lambda: NoDatabase()
    try:
        c = TestClient(app, raise_server_exceptions=False)
        # The body is invalid on purpose (422): the limiter runs first and still counts the call.
        codes = [c.post(f"{prefix}/auth/login", json={}).status_code
                 for prefix in ["", API_PREFIX] * (settings.RATE_LIMIT_LOGIN_MAX // 2)]
        assert set(codes) == {422}
        r = c.post(f"{API_PREFIX}/auth/login", json={})
        assert r.status_code == 429 and r.headers["Retry-After"]
        assert c.post("/auth/login", json={}).status_code == 429
    finally:
        app.state.rate_limiters = saved
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.parametrize(
    ("limiter", "paths"),
    [
        ("OTP_SEND", ["/auth/register-send-otp", "/business-registrations/send-otp"]),
        ("OTP_VERIFY", ["/auth/register-verify-otp", "/business-registrations/verify-otp"]),
    ],
)
def test_otp_limiters_are_per_caller_and_shared_by_both_flows_and_mounts(limiter, paths):
    """Mốc M2b: RATE_LIMIT_<OTP_SEND|OTP_VERIFY>_MAX calls per window per address, counted
    together for the two OTP flows and both mounts; the next one is 429 with Retry-After.
    Bodies are invalid on purpose (422): the limiter runs first, no e-mail is ever sent."""
    from app.core.config import settings
    from app.core.middleware.rate_limit import build_rate_limiters

    limit = getattr(settings, f"RATE_LIMIT_{limiter}_MAX")
    window = getattr(settings, f"RATE_LIMIT_{limiter}_WINDOW_SECONDS")
    urls = [prefix + path for path in paths for prefix in ("", API_PREFIX)]  # 4 spellings

    saved = app.state.rate_limiters
    app.state.rate_limiters = build_rate_limiters(settings)
    app.dependency_overrides[get_db] = lambda: NoDatabase()
    try:
        c = TestClient(app, raise_server_exceptions=False)
        codes = [c.post(urls[i % len(urls)], json={}).status_code for i in range(limit)]
        assert set(codes) == {422}, codes
        for url in urls:  # every flow and mount is now over the shared limit
            r = c.post(url, json={})
            assert r.status_code == 429, (url, r.status_code)
            assert r.json()["error"]["code"] == "RATE_LIMITED"
            assert 1 <= int(r.headers["Retry-After"]) <= window
        # The OTHER OTP limiter and the login limiter are untouched.
        other = "/auth/register-verify-otp" if limiter == "OTP_SEND" else "/auth/register-send-otp"
        assert c.post(other, json={}).status_code == 422
        assert c.post("/auth/login", json={}).status_code == 422
    finally:
        app.state.rate_limiters = saved
        app.dependency_overrides.pop(get_db, None)


def _real_limiters():
    from app.core.config import settings
    from app.core.middleware.rate_limit import build_rate_limiters

    return settings, build_rate_limiters(settings)


def test_register_public_limiter_is_per_caller_and_shared_by_both_mounts():
    """Mốc M2c: RATE_LIMIT_REGISTER_PUBLIC_MAX per window, then 429 + Retry-After on both mounts.
    Invalid bodies (422): the limiter runs first, nothing is ever created."""
    settings, limiters = _real_limiters()
    saved = app.state.rate_limiters
    app.state.rate_limiters = limiters
    app.dependency_overrides[get_db] = lambda: NoDatabase()
    try:
        c = TestClient(app, raise_server_exceptions=False)
        urls = ["/auth/register-public", f"{API_PREFIX}/auth/register-public"]
        codes = [c.post(urls[i % 2], json={}).status_code for i in range(settings.RATE_LIMIT_REGISTER_PUBLIC_MAX)]
        assert set(codes) == {422}
        for url in urls:
            r = c.post(url, json={})
            assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED"
            assert 1 <= int(r.headers["Retry-After"]) <= settings.RATE_LIMIT_REGISTER_PUBLIC_WINDOW_SECONDS
    finally:
        app.state.rate_limiters = saved
        app.dependency_overrides.pop(get_db, None)


def test_password_reset_limits_every_call_and_the_wrong_codes_on_both_mounts():
    """Mốc M4: 'password_reset' counts every call; 'password_reset_failures' only wrong or expired
    codes, and once it is full even a VALID code is refused (429) until the window moves on."""
    from app.core.integrations.firebase_password_reset import ResetCodeInvalid, get_password_reset_provider

    class AlwaysWrong:
        async def verify_reset_code(self, oob_code):
            raise ResetCodeInvalid()

        async def confirm_reset(self, oob_code, new_password):
            raise AssertionError("never reached")

    settings, limiters = _real_limiters()
    saved = app.state.rate_limiters
    app.state.rate_limiters = limiters
    app.dependency_overrides[get_db] = lambda: NoDatabase()
    app.dependency_overrides[get_password_reset_provider] = lambda: AlwaysWrong()
    # M4b: the used-code check reads the users repository before Firebase is asked.
    from app.dependencies.auth import get_user_access_repo
    from tests.fakes import FakeUserAccessRepo

    users = FakeUserAccessRepo()
    app.dependency_overrides[get_user_access_repo] = lambda: users
    body = {"oob_code": "oob-wrong", "new_password": "Mat-Khau-Moi-456"}
    urls = ["/auth/password-reset/confirm", f"{API_PREFIX}/auth/password-reset/confirm"]
    try:
        c = TestClient(app, raise_server_exceptions=False)
        fails = settings.RATE_LIMIT_PASSWORD_RESET_FAILURES_MAX
        codes = [c.post(urls[i % 2], json=body).status_code for i in range(fails)]
        assert codes == [400] * fails
        r = c.post(urls[1], json=body)
        assert r.status_code == 429 and r.headers["Retry-After"]
        assert c.post(urls[0], json=body).status_code == 429

        # The per-call limit on its own: valid-looking but invalid bodies (422) are not "wrong
        # codes", so only 'password_reset' fills up.
        app.state.rate_limiters = build = _real_limiters()[1]
        total = settings.RATE_LIMIT_PASSWORD_RESET_MAX
        assert {c.post(urls[i % 2], json={}).status_code for i in range(total)} == {422}
        assert c.post(urls[0], json={}).status_code == 429
        assert build.password_reset_failures.peek("unknown").allowed  # nothing counted as a failure
    finally:
        app.state.rate_limiters = saved
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_password_reset_provider, None)
        app.dependency_overrides.pop(get_user_access_repo, None)
