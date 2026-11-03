"""Portrait uploads: storage, validation and clan/branch authorization, without a real DB."""

import base64
import struct
import uuid
import zlib
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.utils.image_validation import MAX_BYTES
from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.main import app
from app.models.genealogy.entities import Person
from app.models.user_access.entities import AuditLog, User
from app.services.auth_access import access_service

A, B, BRANCH = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()


def png():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 32, 40, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress((b'\x00' + b'\x80\x70\x60' * 32) * 40)) + chunk(b'IEND', b''))


class AccessRepo:
    roles = {}

    def __init__(self, db):
        pass

    async def get_active_roles(self, user_id, family_id):
        clan = uuid.UUID(str(family_id)) if family_id else None
        return {r for r in (self.roles.get((user_id, clan)), self.roles.get((user_id, None))) if r}

    async def get_active_membership(self, user_id, family_id):
        return SimpleNamespace(status='ACTIVE') if (user_id, uuid.UUID(str(family_id))) in self.roles else None

    async def get_granted_permission_codes(self, roles):
        return set()


class Session:
    def __init__(self, person):
        self.person = person
        self.assignments = []
        self.writes = []
        self.commits = 0

    async def execute(self, stmt):
        if 'FROM family_admin_assignments' in str(stmt):
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: self.assignments))
        assert 'FROM persons' in str(stmt)
        params = {str(v) for v in stmt.compile().params.values()}
        found = self.person if str(self.person.id) in params and str(self.person.family_id) in params else None
        return SimpleNamespace(scalar_one_or_none=lambda: found)

    def add(self, row):
        self.writes.append(row)

    async def commit(self):
        self.commits += 1


@pytest.fixture
def world(monkeypatch):
    owner, member, admin, system = [User(user_id=uuid.uuid4(), status='ACTIVE') for _ in range(4)]
    person = Person(id=uuid.uuid4(), family_id=A, full_name='Tiền nhân', branch_id=BRANCH,
                    is_alive=False, status='ACTIVE', avatar_url=None)
    db = Session(person)
    monkeypatch.setattr(access_service, 'AccessRepository', AccessRepo)
    monkeypatch.setattr(AccessRepo, 'roles', {
        (owner.id, A): 'BUSINESS_OWNER', (member.id, A): 'FAMILY_MEMBER',
        (admin.id, A): 'FAMILY_ADMIN', (system.id, None): 'SYSTEM_ADMIN',
    })
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app, raise_server_exceptions=False)

    def upload(who=owner, clan=A, person_id=None, data=None, filename='portrait.png', mime='image/png'):
        app.dependency_overrides[get_current_account] = lambda: who
        return client.put(f'/api/v1/families/{clan}/persons/{person_id or person.id}/portrait',
                          files={'file': (filename, png() if data is None else data, mime)})

    def remove(who=owner, clan=A, person_id=None):
        app.dependency_overrides[get_current_account] = lambda: who
        return client.delete(f'/api/v1/families/{clan}/persons/{person_id or person.id}/portrait')

    try:
        yield SimpleNamespace(upload=upload, remove=remove, db=db, person=person, owner=owner, member=member,
                              admin=admin, system=system)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved)
        client.close()


def test_upload_stores_actual_image_and_audits_without_binary(world):
    response = world.upload(filename='untrusted.txt', mime='text/plain')
    assert response.status_code == 200, response.text
    uri = response.json()['avatarUrl']
    assert uri.startswith('data:image/png;base64,')
    assert base64.b64decode(uri.split(',', 1)[1]) == png()
    assert world.person.avatar_url == uri
    assert world.db.commits == 1
    audit, = world.db.writes
    assert isinstance(audit, AuditLog)
    assert audit.actor_id == world.owner.id and audit.entity_id == world.person.id
    assert 'base64' not in str(audit.new_data)
    second = world.upload()
    assert second.status_code == 200 and world.db.commits == 2


@pytest.mark.parametrize('kind', ['member', 'other_clan', 'wrong_person', 'wrong_branch', 'revoked_admin'])
@pytest.mark.parametrize('operation', ['upload', 'remove'])
def test_unauthorized_changes_never_change_portrait(world, kind, operation):
    call = getattr(world, operation)
    original = world.person.avatar_url = 'data:image/png;base64,existing-portrait'
    if kind == 'member':
        response = call(who=world.member)
    elif kind == 'other_clan':
        response = call(clan=B)
    elif kind == 'wrong_person':
        response = call(person_id=uuid.uuid4())
    else:
        if kind == 'wrong_branch':
            world.db.assignments = [SimpleNamespace(branch_id=uuid.uuid4())]
        response = call(who=world.admin)
    assert response.status_code == (404 if kind == 'wrong_person' else 403)
    assert world.person.avatar_url == original and world.db.commits == 0 and not world.db.writes


def test_delete_clears_only_the_portrait_and_is_idempotent(world):
    assert world.upload().status_code == 200
    result = world.remove()
    assert result.status_code == 200
    assert result.json() == {'personId': str(world.person.id), 'avatarUrl': None}
    assert world.person.avatar_url is None
    assert world.person.full_name == 'Tiền nhân' and world.person.family_id == A
    assert world.person.status == 'ACTIVE'
    assert world.db.commits == 2
    assert world.db.writes[-1].action == 'person.portrait_deleted'
    assert world.remove().status_code == 200
    assert world.db.commits == 2 and len(world.db.writes) == 2


def test_branch_admin_in_assigned_branch_can_upload(world):
    world.db.assignments = [SimpleNamespace(branch_id=BRANCH)]
    assert world.upload(who=world.admin).status_code == 200


def test_system_admin_can_upload(world):
    assert world.upload(who=world.system).status_code == 200


@pytest.mark.parametrize(('data', 'status'), [
    (b'', 422), (b'<svg xmlns="http://www.w3.org/2000/svg"/>', 422),
    (b'<html>not an image</html>', 422), (b'\x89PNG\r\n\x1a\n', 422),
    (b'x' * (MAX_BYTES + 1), 413),
])
def test_invalid_image_is_not_saved(world, data, status):
    response = world.upload(data=data)
    assert response.status_code == status
    assert world.person.avatar_url is None and world.db.commits == 0


@pytest.mark.parametrize('operation', ['upload', 'remove'])
def test_living_person_cannot_change_memorial_portrait(world, operation):
    world.person.is_alive = True
    world.person.death_date = None
    assert getattr(world, operation)().status_code == 422
    assert world.db.commits == 0


@pytest.mark.parametrize('method', ['PUT', 'DELETE'])
def test_missing_session_is_rejected_before_database_access(method):
    class NoDatabase:
        async def execute(self, stmt):
            raise AssertionError('Database reached without a session')
    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = lambda: NoDatabase()
    client = TestClient(app)
    try:
        response = client.request(method, f'/api/v1/families/{A}/persons/{uuid.uuid4()}/portrait',
                                  **({'files': {'file': ('portrait.png', png(), 'image/png')}} if method == 'PUT' else {}))
        assert response.status_code == 401
    finally:
        client.close()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved)
