"""Restricted (must-change-password) sessions on BOTH mounts of the routers (Mốc M1c, L-16).

main.py mounts every router at /api/v1 AND at the root, and the FE calls the root form
(VITE_API_BASE_URL has no prefix). The restricted-path check must treat /auth/me and
/api/v1/auth/me as the same route, and open nothing else. Uses the real app.main.app (so the
real double mount) with fakes: no DB, no Firebase.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from app.core.integrations.firebase import get_identity_provider
from app.db.postgres import get_db
from app.dependencies.auth import get_user_access_repo, route_path
from app.dependencies.permissions import get_family_repo
from app.models.user_access.repository import UserAccessRepository
from tests.fakes import (
    FakeDb,
    FakeFamilyRepo,
    FakeIdentityProvider,
    FakeUserAccessRepo,
    disabled_rate_limiters,
    make_user,
)

PASSWORD = "Mat-Khau-Tam-123"


@pytest.fixture
def w():
    from app.main import app

    repo = FakeUserAccessRepo()
    db = FakeDb(repo=repo)
    saved_overrides, saved_limiters = dict(app.dependency_overrides), app.state.rate_limiters
    app.dependency_overrides.update({
        get_db: lambda: db,
        get_user_access_repo: lambda: repo,
        get_family_repo: lambda: FakeFamilyRepo(users=repo.users),
        get_identity_provider: lambda: FakeIdentityProvider(),
    })
    app.state.rate_limiters = disabled_rate_limiters()
    try:
        yield TestClient(app), repo
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved_overrides)
        app.state.rate_limiters = saved_limiters


def restricted_token(client, repo, prefix: str) -> str:
    user = repo.add_user(make_user("ACTIVE"))
    repo.set_cred(
        user,
        password_hash=bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(4)).decode(),
        must_change_password=True,
        temporary_password_expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    r = client.post(f"{prefix}/auth/login", json={"email": user.email, "password": PASSWORD})
    assert r.status_code == 200 and r.json()["requires_password_change"] is True, r.text
    return r.json()["access_token"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("prefix", ["", "/api/v1"])
def test_restricted_session_reaches_me_on_both_mounts(w, prefix):
    client, repo = w
    token = restricted_token(client, repo, prefix)
    for form in ("", "/api/v1"):
        r = client.get(f"{form}/auth/me", headers=bearer(token))
        assert r.status_code == 200, (form, r.text)
        assert r.json()["requires_password_change"] is True


@pytest.mark.parametrize("prefix", ["", "/api/v1"])
def test_restricted_session_can_change_password_on_both_mounts(w, prefix):
    client, repo = w
    token = restricted_token(client, repo, "")
    r = client.post(
        f"{prefix}/auth/change-password",
        headers=bearer(token),
        json={"current_password": PASSWORD, "new_password": "Mat-Khau-Moi-456"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["requires_password_change"] is False


@pytest.mark.parametrize("prefix", ["", "/api/v1"])
def test_restricted_session_can_log_out_on_both_mounts(w, prefix):
    client, repo = w
    token = restricted_token(client, repo, "")
    assert client.post(f"{prefix}/auth/logout", headers=bearer(token)).status_code == 204


@pytest.mark.parametrize("path", ["/admin/users", "/api/v1/admin/users"])
def test_every_other_route_stays_closed_on_both_mounts(w, path):
    client, repo = w
    token = restricted_token(client, repo, "")
    r = client.get(path, headers=bearer(token))
    assert (r.status_code, r.json()["error"]["code"]) == (403, "PASSWORD_CHANGE_REQUIRED")


@pytest.mark.parametrize(
    ("raw", "route"),
    [
        ("/auth/me", "/auth/me"),
        ("/api/v1/auth/me", "/auth/me"),
        ("/api/v1/auth/me/", "/auth/me"),
        ("/auth/logout/", "/auth/logout"),
        ("/api/v1", "/"),
        ("/", "/"),
        # Only a WHOLE leading /api/v1 segment is removed.
        ("/api/v1x/auth/me", "/api/v1x/auth/me"),
        ("/api/v2/auth/me", "/api/v2/auth/me"),
        ("/x/api/v1/auth/me", "/x/api/v1/auth/me"),
    ],
)
def test_route_path_strips_only_the_api_prefix(raw, route):
    assert route_path(raw) == route


async def test_lock_or_create_credential_inserts_on_conflict_then_locks():
    """The real repository SQL (compiled for PostgreSQL), without a database."""

    class Result:
        def scalar_one_or_none(self):
            return object()

    class RecordingSession:
        def __init__(self):
            self.statements = []

        async def execute(self, stmt):
            self.statements.append(str(stmt.compile(dialect=postgresql.dialect())))
            return Result()

    session = RecordingSession()
    await UserAccessRepository(session).lock_or_create_credential_metadata(
        make_user().user_id, now=datetime.now(timezone.utc)
    )
    insert, lock = session.statements
    assert insert.startswith("INSERT INTO credential_metadata")
    assert "ON CONFLICT (user_id) DO NOTHING" in insert
    assert "password_hash" not in insert  # a created row never carries a hash
    assert lock.startswith("SELECT") and lock.endswith("FOR NO KEY UPDATE")
