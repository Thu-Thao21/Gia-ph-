"""IDOR (Mốc M2, item 6): a user of clan A can neither read nor change data of clan B.

Real app.main.app (both mounts), the real AccessService / GenealogyService / member router;
fakes for storage only: the family roles (AccessRepository) and a session that serves Person
rows by id or family. Every "denied" case has an "allowed" twin on the caller's own clan, so a
broken route can never pass as a refusal.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.db.postgres import get_db
from app.dependencies.auth import get_user_access_repo
from app.models.genealogy.entities import Person
from app.services.auth_access import access_service
from tests.fakes import FakeUserAccessRepo, disabled_rate_limiters, make_user

CLAN_A, CLAN_B = uuid.uuid4(), uuid.uuid4()
NOW = datetime.now(timezone.utc)


def person(clan: uuid.UUID, name: str) -> Person:
    return Person(
        id=uuid.uuid4(), family_id=clan, full_name=name, gender="MALE", generation=1,
        is_alive=True, status="ACTIVE", branch_id=None, bio=None, avatar_url=None,
    )


P_A, P_B = person(CLAN_A, "Nguoi Ho A"), person(CLAN_B, "Nguoi Ho B")


class FakeAccessRepository:
    """roles[(user_id, clan_id)] = role code; a role there means an ACTIVE membership too."""

    roles: dict[tuple[uuid.UUID, uuid.UUID | None], str] = {}

    def __init__(self, _db=None) -> None:
        pass

    async def get_active_roles(self, account_id, family_id):
        cid = uuid.UUID(str(family_id)) if family_id else None
        found = {self.roles.get((account_id, cid)), self.roles.get((account_id, None))}
        return {r for r in found if r}

    async def get_active_membership(self, account_id, family_id):
        cid = uuid.UUID(str(family_id)) if family_id else None
        return SimpleNamespace(status="ACTIVE") if (account_id, cid) in self.roles else None

    async def get_granted_permission_codes(self, role_names):
        return set()


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._rows))

    def all(self):
        return []


class PersonsSession:
    """Answers SELECTs on persons by the ids / family ids bound in the statement. Anything else
    returns no rows. Writes fail the test: no denied request may get that far."""

    async def execute(self, stmt):
        sql = str(stmt)
        if "FROM persons" not in sql or "count(" in sql:
            return _Result([])
        bound = {str(v) for v in stmt.compile().params.values()}
        return _Result([p for p in (P_A, P_B) if str(p.id) in bound or str(p.family_id) in bound])

    def add(self, _obj):
        raise AssertionError("write reached the database")

    async def commit(self):
        raise AssertionError("commit reached the database")

    async def rollback(self):
        pass


@pytest.fixture
def world(monkeypatch):
    from app.main import app

    repo = FakeUserAccessRepo()
    member, admin = repo.add_user(make_user()), repo.add_user(make_user())
    monkeypatch.setattr(access_service, "AccessRepository", FakeAccessRepository)
    monkeypatch.setattr(FakeAccessRepository, "roles", {
        (member.user_id, CLAN_A): "FAMILY_MEMBER",
        (admin.user_id, CLAN_A): "FAMILY_ADMIN",
    })
    tokens = {
        "member": repo.seed_session(member, "tok-idor-member", created_at=NOW - timedelta(minutes=1),
                                    expires_at=NOW + timedelta(hours=1)),
        "admin": repo.seed_session(admin, "tok-idor-admin", created_at=NOW - timedelta(minutes=1),
                                   expires_at=NOW + timedelta(hours=1)),
    }
    saved_overrides, saved_limiters = dict(app.dependency_overrides), app.state.rate_limiters
    app.dependency_overrides[get_db] = lambda: PersonsSession()
    app.dependency_overrides[get_user_access_repo] = lambda: repo
    app.state.rate_limiters = disabled_rate_limiters()
    client = TestClient(app, raise_server_exceptions=False)

    def call(who, method, path, **kw):
        return client.request(method, path, headers={"Authorization": f"Bearer {tokens[who]}"}, **kw)

    try:
        yield call
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved_overrides)
        app.state.rate_limiters = saved_limiters


def code(r):
    return r.status_code, r.json()["error"]["code"]


MOUNTS = ["", "/api/v1"]

# ----- person (genealogy, /api/v1 only) -----


def test_person_of_clan_b_cannot_be_read(world):
    assert world("member", "GET", f"/api/v1/families/{CLAN_A}/persons/{P_A.id}").status_code == 200
    # B in the URL: no permission in B.
    assert code(world("member", "GET", f"/api/v1/families/{CLAN_B}/persons/{P_B.id}")) == (403, "FORBIDDEN")
    # A in the URL, B's person id: answered like a missing person (no existence leak).
    smuggled = world("member", "GET", f"/api/v1/families/{CLAN_A}/persons/{P_B.id}")
    missing = world("member", "GET", f"/api/v1/families/{CLAN_A}/persons/{uuid.uuid4()}")
    assert code(smuggled) == code(missing) == (404, "NOT_FOUND")
    assert "Nguoi Ho B" not in smuggled.text


def test_person_of_clan_b_cannot_be_changed(world):
    body = {"fullName": "Doi Ten"}
    assert code(world("admin", "PATCH", f"/api/v1/families/{CLAN_B}/persons/{P_B.id}", json=body)) == (403, "FORBIDDEN")
    assert code(world("admin", "PATCH", f"/api/v1/families/{CLAN_A}/persons/{P_B.id}", json=body)) == (404, "NOT_FOUND")
    assert P_B.full_name == "Nguoi Ho B"


# ----- members (member_api_router, both mounts) -----


@pytest.mark.parametrize("prefix", MOUNTS)
def test_member_detail_of_clan_b_is_404_like_a_missing_one(world, prefix):
    own = world("member", "GET", f"{prefix}/members/{P_A.id}")
    assert own.status_code == 200 and own.json()["fullName"] == "Nguoi Ho A"
    other = world("member", "GET", f"{prefix}/members/{P_B.id}")
    missing = world("member", "GET", f"{prefix}/members/{uuid.uuid4()}")
    assert other.status_code == missing.status_code == 404
    assert "Nguoi Ho B" not in other.text


@pytest.mark.parametrize("prefix", MOUNTS)
def test_member_list_of_clan_b_and_of_every_clan_are_refused(world, prefix):
    own = world("member", "GET", f"{prefix}/members", params={"family_id": str(CLAN_A)})
    assert own.status_code == 200 and [i["fullName"] for i in own.json()["items"]] == ["Nguoi Ho A"]
    assert code(world("member", "GET", f"{prefix}/members", params={"family_id": str(CLAN_B)})) == (403, "FORBIDDEN")
    # No family_id = persons of EVERY clan: system admin only.
    assert code(world("admin", "GET", f"{prefix}/members")) == (403, "FORBIDDEN")


# ----- family (clan profile) -----


@pytest.mark.parametrize("prefix", MOUNTS)
def test_family_profile_of_clan_b_cannot_be_read_or_changed(world, prefix):
    assert code(world("member", "GET", f"{prefix}/families/{CLAN_B}/profile")) == (403, "FORBIDDEN")
    assert code(world("admin", "PUT", f"{prefix}/families/{CLAN_B}/profile", json={"name": "X"})) == (403, "FORBIDDEN")
    # A plain member may read but not change their own clan's profile.
    assert code(world("member", "PUT", f"{prefix}/families/{CLAN_A}/profile", json={"name": "X"})) == (403, "FORBIDDEN")


# ----- branch -----


@pytest.mark.parametrize("prefix", MOUNTS)
def test_branches_of_clan_b_cannot_be_listed_created_or_deleted(world, prefix):
    assert world("member", "GET", f"{prefix}/families/{CLAN_A}/branches").status_code == 200
    assert code(world("member", "GET", f"{prefix}/families/{CLAN_B}/branches")) == (403, "FORBIDDEN")
    assert code(world("admin", "POST", f"{prefix}/families/{CLAN_B}/branches", json={"name": "Chi X"})) == (403, "FORBIDDEN")
    assert code(world("admin", "DELETE", f"{prefix}/families/{CLAN_B}/branches/{uuid.uuid4()}")) == (403, "FORBIDDEN")
    # branch.manage is not a member's permission, even in their own clan.
    assert code(world("member", "POST", f"{prefix}/families/{CLAN_A}/branches", json={"name": "Chi X"})) == (403, "FORBIDDEN")


# ----- export (every export route) -----


EXPORT_URLS = [
    "/families/{clan}/persons/export",
    "/api/v1/families/{clan}/persons/export",
    "/persons/export?family_id={clan}",
    "/api/v1/persons/export?family_id={clan}",
]


@pytest.mark.parametrize("url", EXPORT_URLS)
def test_export_of_clan_b_is_refused_and_own_export_holds_only_own_people(world, url):
    """Export needs person.update (Mốc M2b): a clan manager, never another clan."""
    denied = world("admin", "GET", url.format(clan=CLAN_B))
    assert code(denied) == (403, "FORBIDDEN") and "Nguoi Ho B" not in denied.text
    own = world("admin", "GET", url.format(clan=CLAN_A))
    assert own.status_code == 200 and own.headers["content-type"].startswith("text/csv")
    assert "Nguoi Ho A" in own.text and "Nguoi Ho B" not in own.text


@pytest.mark.parametrize("url", EXPORT_URLS)
def test_a_plain_member_cannot_export_even_their_own_clan(world, url):
    """person.view (FAMILY_MEMBER) reads members one by one but may not export the clan."""
    assert world("member", "GET", f"/members/{P_A.id}").status_code == 200  # can read...
    r = world("member", "GET", url.format(clan=CLAN_A))  # ...cannot export
    assert code(r) == (403, "FORBIDDEN") and "Nguoi Ho A" not in r.text
