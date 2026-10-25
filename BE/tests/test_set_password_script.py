"""scripts/set_password.py (Moc M1) with fakes: no DB, no Firebase, no terminal."""

from __future__ import annotations

import importlib.util
import sys
from datetime import timedelta
from pathlib import Path

import bcrypt
import pytest

from app.core.integrations.firebase import ProviderUnavailable, ProviderUser
from tests.fakes import NOW, FakeDb, FakeIdentityProvider, FakeUserAccessRepo, make_user

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "set_password.py"
GOOD = "Mat-Khau-Moi-2026"


def load_script():
    spec = importlib.util.spec_from_file_location("set_password_script", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses look their module up there
    spec.loader.exec_module(module)
    return module


sp = load_script()


class World:
    def __init__(self) -> None:
        self.repo = FakeUserAccessRepo()
        self.db = FakeDb(repo=self.repo)
        self.provider = FakeIdentityProvider()
        self.user = self.repo.add_user(make_user())

    async def run(self, *, email=None, password=GOOD, must_change=False):
        return await sp.set_password(
            db=self.db, users=self.repo, provider=self.provider,
            email=email or self.user.email.upper(), password=password, must_change=must_change, now=NOW,
        )


@pytest.fixture
def w() -> World:
    return World()


@pytest.mark.parametrize("weak", ["Ab1", "alllower123", "ALLUPPER123", "NoDigitsHere", "Aa1" + "x" * 70])
def test_weak_passwords_are_refused_before_anything_runs(weak, capsys):
    ran = []
    code = sp.main(["someone@example.test"], ask=lambda _prompt: weak, run=lambda *a: ran.append(a))
    assert code == sp.EXIT_REFUSED and ran == []
    out = capsys.readouterr()
    assert weak not in out.out + out.err


def test_mismatched_confirmation_is_refused(capsys):
    answers = iter([GOOD, GOOD + "x"])
    ran = []
    code = sp.main(["someone@example.test"], ask=lambda _p: next(answers), run=lambda *a: ran.append(a))
    assert code == sp.EXIT_REFUSED and ran == []
    assert GOOD not in capsys.readouterr().err


async def test_weak_password_is_refused_by_the_core_too(w):
    with pytest.raises(sp.Refused):
        await w.run(password="weakpass")
    assert w.db.commits == 0 and w.user.user_id not in w.repo.creds


async def test_unknown_email_changes_nothing(w):
    with pytest.raises(sp.Refused):
        await w.run(email="nobody@example.test")
    assert w.db.commits == 0 and w.provider.provider_calls == []


async def test_saves_a_bcrypt_hash_and_updates_firebase_when_the_account_exists(w):
    w.provider.provider_users[w.user.firebase_uid] = ProviderUser(
        uid=w.user.firebase_uid, email=w.user.email, display_name="x", disabled=False
    )
    w.repo.set_cred(w.user, failed_login_count=4, locked_until=NOW + timedelta(minutes=10))
    token = w.repo.seed_session(w.user)
    outcome = await w.run(must_change=True)

    cred = w.repo.creds[w.user.user_id]
    assert cred.password_hash.startswith("$2b$12$")  # cost 12
    assert bcrypt.checkpw(GOOD.encode(), cred.password_hash.encode())
    assert GOOD not in cred.password_hash
    assert cred.password_changed_at == NOW and cred.must_change_password is True
    assert cred.failed_login_count == 0 and cred.locked_until is None
    assert w.repo.sessions[sp_hash(token)].revoked_at == NOW  # old sessions are gone
    assert w.db.commits == 1
    # Firebase: update_user (set_password) on users.firebase_uid, AFTER the DB commit.
    assert outcome.firebase == "updated"
    assert w.provider.password_changes == [w.user.firebase_uid]
    assert GOOD not in repr(w.repo.audit)


async def test_no_firebase_account_warns_and_still_saves_the_db(w, capsys):
    outcome = await w.run()
    assert outcome.firebase == "no_account" and w.provider.password_changes == []
    assert w.repo.creds[w.user.user_id].password_hash and w.db.commits == 1
    assert w.repo.creds[w.user.user_id].must_change_password is False


async def test_firebase_down_still_saves_the_db_and_reports_it(w):
    w.provider.faults["get_user"] = [ProviderUnavailable("timeout")]
    outcome = await w.run()
    assert outcome.firebase == "failed:timeout" and w.db.commits == 1


def test_main_prints_the_firebase_warning_and_never_the_password(capsys):
    async def fake_run(args, password):
        return sp.Outcome(user_id=make_user().user_id, firebase="no_account")

    code = sp.main(["a@example.test", "--must-change"], ask=lambda _p: GOOD, run=fake_run)
    out = capsys.readouterr()
    assert code == sp.EXIT_OK
    assert sp.NO_FIREBASE_ACCOUNT_WARNING in out.err
    assert GOOD not in out.out + out.err


def sp_hash(token):
    from app.core.security.tokens import hash_session_token

    return hash_session_token(token)
