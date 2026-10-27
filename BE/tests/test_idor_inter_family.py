"""IDOR on the inter-family network (Mốc M2b): every /networks route, both mounts.

World: clans A, B, C, D (ACTIVE); link A-B and link C-D (ACTIVE, one policy per clan); pending
requests A->B and C->D. Users: admin_a / member_a (clan A), admin_b, admin_c, sa (system admin).
Rules under test (controllers/inter_family/router.py): nothing of another clan is visible (404,
like a missing id); in the clan without family.update -> 403; SA sees and does everything.
Every refusal has an allowed twin. Real app.main.app; storage is faked (no DB).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.controllers.inter_family.router import MASKED_NAME, get_inter_family_repo, shared_tree_node
from app.db.postgres import get_db
from app.dependencies.auth import get_user_access_repo
from app.models.genealogy.entities import Person
from app.models.inter_family import InterClanLink, InterClanRequest, InterClanSharedPolicy
from app.services.auth_access import access_service
from tests.fakes import FakeUserAccessRepo, disabled_rate_limiters, make_user

NOW = datetime.now(timezone.utc)
A, B, C, D = (uuid.uuid4() for _ in range(4))
NAMES = {A: "Ho A", B: "Ho B", C: "Ho C", D: "Ho D"}


class FakeAccessRepository:
    roles: dict[tuple[uuid.UUID, uuid.UUID | None], str] = {}

    def __init__(self, _db=None) -> None:
        pass

    async def get_active_roles(self, account_id, family_id):
        cid = uuid.UUID(str(family_id)) if family_id else None
        return {r for r in (self.roles.get((account_id, cid)), self.roles.get((account_id, None))) if r}

    async def get_active_membership(self, account_id, family_id):
        cid = uuid.UUID(str(family_id)) if family_id else None
        return SimpleNamespace(status="ACTIVE") if cid and (account_id, cid) in self.roles else None

    async def get_granted_permission_codes(self, role_names):
        return set()

    async def get_active_clan_ids(self, account_id):
        return {cid for (uid, cid) in self.roles if uid == account_id and cid is not None}


class FakeInterRepo:
    """In-memory InterFamilyRepository with the same method contract."""

    def __init__(self) -> None:
        self.clans = {c: SimpleNamespace(clan_id=c, name=NAMES[c], clan_code=NAMES[c], status="ACTIVE") for c in NAMES}
        self.links = {}
        self.policies = []
        self.requests = {}
        self.persons = {
            c: [Person(id=uuid.uuid4(), family_id=c, full_name=f"Nguoi {NAMES[c]}", gender="MALE",
                       generation=1, is_alive=True, status="ACTIVE", branch_id=None, avatar_url=None)]
            for c in NAMES
        }
        self.commits = 0
        self.link_ab = self._link(A, B)
        self.link_cd = self._link(C, D)
        self.req_ab = self._request(A, B)
        self.req_cd = self._request(C, D)

    def _link(self, a, b):
        link = InterClanLink(id=uuid.uuid4(), request_id=uuid.uuid4(), clan_a_id=a, clan_b_id=b,
                             status="ACTIVE", linked_at=NOW - timedelta(days=1))
        self.links[link.id] = link
        for owner in (a, b):
            self.policies.append(InterClanSharedPolicy(
                id=uuid.uuid4(), link_id=link.id, owner_clan_id=owner, data_scope="BASIC",
                allowed_fields={"full_name": True, "avatar_url": True}, visibility="INTER_FAMILY",
                can_export=False, updated_at=NOW,
            ))
        return link

    def _request(self, s, t):
        req = InterClanRequest(id=uuid.uuid4(), source_clan_id=s, target_clan_id=t, requester_id=uuid.uuid4(),
                               status="PENDING", message=None, created_at=NOW)
        self.requests[req.id] = req
        return req

    # --- InterFamilyRepository contract ---
    async def get_clan(self, clan_id):
        return self.clans.get(clan_id)

    async def list_active_clans(self):
        return [c for c in self.clans.values() if c.status == "ACTIVE"]

    async def clan_names(self, clan_ids):
        return {str(c): NAMES[c] for c in set(clan_ids) if c in NAMES}

    async def get_link(self, link_id):
        return self.links.get(link_id)

    async def list_links(self, *, clan_ids, status=None):
        return [l for l in self.links.values()
                if (status is None or l.status == status)
                and (clan_ids is None or l.clan_a_id in clan_ids or l.clan_b_id in clan_ids)]

    async def active_links_between(self, target, *, clan_ids):
        out = []
        for l in self.links.values():
            if l.status != "ACTIVE" or target not in (l.clan_a_id, l.clan_b_id):
                continue
            other = l.clan_b_id if l.clan_a_id == target else l.clan_a_id
            if clan_ids is None or other in clan_ids:
                out.append(l)
        return out

    async def list_policies(self, link_id):
        return [p for p in self.policies if p.link_id == link_id]

    async def get_policy(self, link_id, owner):
        return next((p for p in self.policies if p.link_id == link_id and p.owner_clan_id == owner), None)

    async def get_request(self, request_id):
        return self.requests.get(request_id)

    async def list_requests(self, *, clan_ids, limit=100):
        return [r for r in self.requests.values()
                if clan_ids is None or r.source_clan_id in clan_ids or r.target_clan_id in clan_ids]

    async def get_person(self, person_id):
        return next((p for ps in self.persons.values() for p in ps if p.id == person_id), None)

    async def persons_of(self, clan_id):
        return list(self.persons.get(clan_id, []))

    async def relationships_of(self, clan_id):
        return []

    def add(self, row):
        if isinstance(row, InterClanRequest):
            self.requests[row.id] = row
        elif isinstance(row, InterClanLink):
            self.links[row.id] = row
        elif isinstance(row, InterClanSharedPolicy):
            self.policies.append(row)

    async def flush(self):
        pass

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass


@pytest.fixture
def w(monkeypatch):
    from app.main import app

    users = FakeUserAccessRepo()
    people = {name: users.add_user(make_user()) for name in ("admin_a", "member_a", "admin_b", "admin_c", "sa")}
    monkeypatch.setattr(access_service, "AccessRepository", FakeAccessRepository)
    monkeypatch.setattr(FakeAccessRepository, "roles", {
        (people["admin_a"].user_id, A): "FAMILY_ADMIN",
        (people["member_a"].user_id, A): "FAMILY_MEMBER",
        (people["admin_b"].user_id, B): "FAMILY_ADMIN",
        (people["admin_c"].user_id, C): "FAMILY_ADMIN",
        (people["sa"].user_id, None): "SYSTEM_ADMIN",
    })
    tokens = {
        name: users.seed_session(u, f"tok-net-{name}", created_at=NOW - timedelta(minutes=1),
                                 expires_at=NOW + timedelta(hours=1))
        for name, u in people.items()
    }
    repo = FakeInterRepo()
    saved_overrides, saved_limiters = dict(app.dependency_overrides), app.state.rate_limiters
    app.dependency_overrides.update({
        get_db: lambda: SimpleNamespace(),
        get_user_access_repo: lambda: users,
        get_inter_family_repo: lambda: repo,
    })
    app.state.rate_limiters = disabled_rate_limiters()
    client = TestClient(app, raise_server_exceptions=False)

    def call(who, method, path, **kw):
        return client.request(method, path, headers={"Authorization": f"Bearer {tokens[who]}"}, **kw)

    call.repo = repo
    try:
        yield call
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved_overrides)
        app.state.rate_limiters = saved_limiters


MOUNTS = ["", "/api/v1"]


def ids_of(r, key="id"):
    return {item[key] for item in r.json()}


# ----- lists: only rows of the caller's clans -----


@pytest.mark.parametrize("p", MOUNTS)
def test_links_list_holds_only_the_callers_links(w, p):
    assert ids_of(w("member_a", "GET", f"{p}/networks/links")) == {str(w.repo.link_ab.id)}
    assert ids_of(w("admin_c", "GET", f"{p}/networks/links")) == {str(w.repo.link_cd.id)}
    assert ids_of(w("sa", "GET", f"{p}/networks/links")) == {str(w.repo.link_ab.id), str(w.repo.link_cd.id)}


@pytest.mark.parametrize("p", MOUNTS)
def test_request_list_holds_only_requests_of_the_callers_clans(w, p):
    assert ids_of(w("member_a", "GET", f"{p}/networks/link-requests")) == {str(w.repo.req_ab.id)}
    assert ids_of(w("admin_b", "GET", f"{p}/networks/link-requests")) == {str(w.repo.req_ab.id)}
    assert ids_of(w("sa", "GET", f"{p}/networks/link-requests")) == {str(w.repo.req_ab.id), str(w.repo.req_cd.id)}


@pytest.mark.parametrize("p", MOUNTS)
def test_diagram_edges_and_connected_status_only_for_the_callers_links(w, p):
    diagram = w("member_a", "GET", f"{p}/networks/diagram").json()
    assert {e["id"] for e in diagram["edges"]} == {str(w.repo.link_ab.id)}
    assert len(diagram["nodes"]) == 4  # the clan directory itself is public data
    assert len(w("sa", "GET", f"{p}/networks/diagram").json()["edges"]) == 2

    status = {i["id"]: i["status"] for i in w("member_a", "GET", f"{p}/networks/families").json()}
    assert status[str(B)] == "connected" and status[str(C)] == status[str(D)] == "available"
    sa_status = {i["id"]: i["status"] for i in w("sa", "GET", f"{p}/networks/families").json()}
    assert set(sa_status.values()) == {"connected"}


# ----- policies -----


@pytest.mark.parametrize("p", MOUNTS)
def test_policies_of_another_clans_link_are_404(w, p):
    own = w("member_a", "GET", f"{p}/networks/links/{w.repo.link_ab.id}/policies")
    assert own.status_code == 200 and len(own.json()) == 2
    other = w("member_a", "GET", f"{p}/networks/links/{w.repo.link_cd.id}/policies")
    missing = w("member_a", "GET", f"{p}/networks/links/{uuid.uuid4()}/policies")
    assert other.status_code == missing.status_code == 404


@pytest.mark.parametrize("p", MOUNTS)
def test_policy_update_only_for_the_policy_owner_clan(w, p):
    url = f"{p}/networks/links/{w.repo.link_ab.id}/policies"
    # Allowed: admin of A changes A's OWN policy (owner inferred: A is the only clan they manage).
    r = w("admin_a", "PUT", url, json={"canExport": True})
    assert r.status_code == 200, r.text
    a_policy = next(x for x in w.repo.policies if x.link_id == w.repo.link_ab.id and x.owner_clan_id == A)
    b_policy = next(x for x in w.repo.policies if x.link_id == w.repo.link_ab.id and x.owner_clan_id == B)
    assert a_policy.can_export is True and b_policy.can_export is False
    # B's policy on the same link: in the link, but does not manage B -> 403; nothing changed.
    assert w("admin_a", "PUT", url, json={"canExport": True, "ownerClanId": str(B)}).status_code == 403
    assert b_policy.can_export is False
    # A member of A (no family.update) -> 403; another clan's link -> 404.
    assert w("member_a", "PUT", url, json={"canExport": False}).status_code == 403
    assert w("admin_a", "PUT", f"{p}/networks/links/{w.repo.link_cd.id}/policies", json={"canExport": True}).status_code == 404


# ----- terminate (both routes) -----


@pytest.mark.parametrize("p", MOUNTS)
@pytest.mark.parametrize("how", ["DELETE", "POST"])
def test_terminating_a_link_needs_managing_one_of_its_clans(w, p, how):
    def url(link):
        return f"{p}/networks/links/{link.id}" + ("/terminate" if how == "POST" else "")

    assert w("admin_a", how, url(w.repo.link_cd)).status_code == 404  # not their link
    assert w("member_a", how, url(w.repo.link_ab)).status_code == 403  # their link, no family.update
    assert w.repo.link_ab.status == w.repo.link_cd.status == "ACTIVE"
    r = w("admin_a", how, url(w.repo.link_ab))
    assert r.status_code == 200 and w.repo.link_ab.status == "TERMINATED"
    assert w("sa", how, url(w.repo.link_cd)).status_code == 200


# ----- create a request: only FROM a clan the caller manages -----


@pytest.mark.parametrize("p", MOUNTS)
def test_request_source_must_be_a_clan_the_caller_manages(w, p):
    url = f"{p}/networks/link-requests"
    before = len(w.repo.requests)
    # Another clan as source -> 404; own clan without family.update -> 403.
    assert w("admin_a", "POST", url, json={"targetFamilyId": str(D), "sourceFamilyId": str(C)}).status_code == 404
    assert w("member_a", "POST", url, json={"targetFamilyId": str(D), "sourceFamilyId": str(A)}).status_code == 403
    assert w("member_a", "POST", url, json={"targetFamilyId": str(D)}).status_code == 422  # manages nothing
    assert len(w.repo.requests) == before and w.repo.commits == 0  # refused: nothing written
    # Allowed: explicit source A, and inferred source (admin_a manages only A); FE snake_case body.
    r = w("admin_a", "POST", url, json={"targetFamilyId": str(C), "sourceFamilyId": str(A)})
    assert r.status_code == 201 and r.json()["sourceFamilyId"] == str(A)
    r = w("admin_a", "POST", url, json={"target_family_id": str(D), "message": "Xin ket noi"})
    assert r.status_code == 201 and r.json()["sourceFamilyId"] == str(A) and r.json()["targetFamilyId"] == str(D)


@pytest.mark.parametrize("p", MOUNTS)
def test_request_persons_must_belong_to_their_side(w, p):
    url = f"{p}/networks/link-requests"
    person_a, person_c = w.repo.persons[A][0].id, w.repo.persons[C][0].id
    wrong = w("admin_a", "POST", url, json={"targetFamilyId": str(C), "sourcePersonId": str(person_c)})
    assert wrong.status_code == 422
    ok = w("admin_a", "POST", url, json={"targetFamilyId": str(C), "sourcePersonId": str(person_a),
                                          "targetPersonId": str(person_c)})
    assert ok.status_code == 201


# ----- review: manage the TARGET clan -----


@pytest.mark.parametrize("p", MOUNTS)
def test_reviewing_a_request_needs_managing_its_target_clan(w, p):
    url = f"{p}/networks/link-requests/{w.repo.req_ab.id}/review"
    assert w("admin_c", "POST", url, json={"action": "APPROVE"}).status_code == 404  # not involved
    assert w("admin_a", "POST", url, json={"action": "APPROVE"}).status_code == 403  # source side
    assert w.repo.req_ab.status == "PENDING"
    r = w("admin_b", "POST", url, json={"action": "APPROVE"})
    assert r.status_code == 200 and r.json()["status"] == "APPROVED" and w.repo.req_ab.status == "APPROVED"
    # SA may review any request.
    assert w("sa", "POST", f"{p}/networks/link-requests/{w.repo.req_cd.id}/review",
             json={"action": "REJECT"}).json()["status"] == "REJECTED"


# ----- shared tree (both routes) -----


@pytest.mark.parametrize("p", MOUNTS)
@pytest.mark.parametrize("form", ["/networks/shared-tree/{c}", "/networks/families/{c}/shared-tree"])
def test_shared_tree_only_of_a_clan_linked_to_the_callers(w, p, form):
    linked = w("member_a", "GET", p + form.format(c=B))
    # Allowed, but B's only person is LIVING and B's policy has no "living_persons": masked (M2c).
    assert linked.status_code == 200 and [n["fullName"] for n in linked.json()["nodes"]] == [MASKED_NAME]
    assert "Nguoi Ho B" not in linked.text
    other = w("member_a", "GET", p + form.format(c=C))  # C is linked, but not to A
    missing = w("member_a", "GET", p + form.format(c=uuid.uuid4()))
    assert other.status_code == missing.status_code == 404 and "Nguoi Ho C" not in other.text
    assert w("member_a", "GET", p + form.format(c=A)).status_code == 404  # own clan is not "linked"
    assert w("sa", "GET", p + form.format(c=C)).status_code == 200
    assert w("sa", "GET", p + form.format(c=uuid.uuid4())).status_code == 404


# ----- shared-tree privacy: the owner clan's policy decides every field (Mốc M2c) -----

ALL_KEYS = {"full_name": True, "gender": True, "avatar_url": True, "generation": True, "branch_id": True}


def _person(alive):
    return Person(id=uuid.uuid4(), family_id=B, full_name="Tran Van Song", gender="MALE", generation=4,
                  is_alive=alive, status="ACTIVE", branch_id=uuid.uuid4(), avatar_url="https://img/x.png",
                  bio="tieu su rieng tu")


@pytest.mark.parametrize("alive", [True, None], ids=["living", "unknown-is-living"])
def test_living_person_is_masked_even_when_every_field_is_allowed(alive):
    node = shared_tree_node(_person(alive), dict(ALL_KEYS)).model_dump(by_alias=True)
    assert node["fullName"] == MASKED_NAME and node["gender"] == "unknown" and node["avatarUrl"] is None
    assert node["isLiving"] is True
    # Position in the clan is not identity: shown when the policy allows it.
    assert node["generation"] == 4 and node["branchId"] is not None


def test_living_person_is_shown_only_when_the_policy_allows_living_persons():
    p = _person(True)
    node = shared_tree_node(p, {**ALL_KEYS, "living_persons": True}).model_dump(by_alias=True)
    assert node["fullName"] == "Tran Van Song" and node["gender"] == "MALE" and node["avatarUrl"] == p.avatar_url


@pytest.mark.parametrize("key", ["full_name", "gender", "avatar_url", "generation", "branch_id"])
def test_each_field_of_a_deceased_person_follows_its_own_key(key):
    p = _person(False)
    shown = shared_tree_node(p, dict(ALL_KEYS)).model_dump(by_alias=True)
    hidden = shared_tree_node(p, {k: v for k, v in ALL_KEYS.items() if k != key}).model_dump(by_alias=True)
    field = {"full_name": "fullName", "gender": "gender", "avatar_url": "avatarUrl",
             "generation": "generation", "branch_id": "branchId"}[key]
    masked = {"fullName": MASKED_NAME, "gender": "unknown", "avatarUrl": None, "generation": 0, "branchId": None}
    assert shown[field] != masked[field] and hidden[field] == masked[field]
    # Every OTHER field is unchanged by removing this key.
    assert {k: v for k, v in hidden.items() if k != field} == {k: v for k, v in shown.items() if k != field}


@pytest.mark.parametrize("value", [False, "true", 1, None])
def test_only_an_explicit_true_shares_a_field(value):
    node = shared_tree_node(_person(False), {"full_name": value}).model_dump(by_alias=True)
    assert node["fullName"] == MASKED_NAME


def test_never_sent_fields_are_not_in_the_node_at_all():
    node = shared_tree_node(_person(False), {**ALL_KEYS, "living_persons": True}).model_dump(by_alias=True)
    assert set(node) == {"id", "fullName", "gender", "generation", "branchId", "avatarUrl", "isLiving", "status"}
    assert "tieu su" not in str(node)


@pytest.mark.parametrize("p", MOUNTS)
def test_shared_tree_applies_the_target_clans_policy_on_the_callers_link(w, p):
    """An empty policy ({}) shares nothing; the owner's own policy is the one applied."""
    dead = w.repo.persons[B][0]
    dead.is_alive = False
    policy_b = next(x for x in w.repo.policies if x.link_id == w.repo.link_ab.id and x.owner_clan_id == B)
    policy_b.allowed_fields = {"full_name": True}
    [node] = w("member_a", "GET", f"{p}/networks/shared-tree/{B}").json()["nodes"]
    assert node["fullName"] == "Nguoi Ho B" and node["avatarUrl"] is None and node["gender"] == "unknown"
    policy_b.allowed_fields = {}
    [node] = w("member_a", "GET", f"{p}/networks/shared-tree/{B}").json()["nodes"]
    assert node["fullName"] == MASKED_NAME
