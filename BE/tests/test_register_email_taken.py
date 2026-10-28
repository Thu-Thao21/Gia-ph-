"""Mốc M5-3: a Gmail that already has an account. Regression for the 503 on ProviderEmailTaken
(a Firebase account with no DB user, left by an earlier test or a Google sign-in).

The orphan Firebase account is never taken over, deleted or given a new password: the caller gets
409 EMAIL_ALREADY_REGISTERED, the same answer as for a DB user, and an audit row records why."""

from __future__ import annotations

import logging
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.integrations.firebase import ProviderUnavailable, ProviderUser, ProviderUserExists
from tests.fakes import _DbError, make_user
from tests.test_otp_security import VICTIM, World

TAKEN_MESSAGE = "Gmail này đã được đăng ký. Hãy đăng nhập hoặc dùng chức năng quên mật khẩu."
NEEDS_ADMIN_MESSAGE = (
    "Gmail này đã có tài khoản trên hệ thống nhưng chưa được kích hoạt. Vui lòng liên hệ quản trị viên."
)


@pytest.fixture
def w(monkeypatch):
    return World(monkeypatch)


def orphan(w, email=VICTIM) -> ProviderUser:
    """A Firebase account for `email`, no DB user (what the reported case had)."""
    uid = "googleUid1234567890abcdefXYZ"  # a non-app uid, as Google sign-in makes
    user = ProviderUser(uid=uid, email=email, display_name="Cũ", disabled=False)
    w.provider.provider_users[uid] = user
    return user


def taken_audits(w):
    return [a for a in w.repo.audit if a["action"] == "auth.register_public_email_taken"]


def test_firebase_orphan_is_409_not_503_and_the_orphan_is_untouched(w, caplog):
    caplog.set_level(logging.DEBUG)
    old = orphan(w)
    token = w.token_for(VICTIM)
    r = w.register(VICTIM, token=token)

    assert r.status_code == 409
    error = r.json()["error"]
    # Not "log in / reset the password": without a DB user neither works. Only an admin can help.
    assert error["code"] == "EMAIL_ACCOUNT_NEEDS_ADMIN" and error["message"] == NEEDS_ADMIN_MESSAGE
    assert set(error) == {"code", "message", "request_id"}  # nothing about the account
    assert old.uid not in r.text and VICTIM not in r.text
    # Not taken over, not deleted, no new password: the only Firebase call was the create attempt.
    assert w.provider.provider_users == {old.uid: old}
    assert [op for op, _ in w.provider.provider_calls] == ["create_user"]
    assert w.provider.password_changes == [] and w.repo.users == {}
    # Audited, masked.
    [audit] = taken_audits(w)
    assert audit["new_data"] == {"email": "v***@gmail.com", "source": "firebase"}
    assert VICTIM not in str(w.repo.audit) and VICTIM not in caplog.text
    assert "reason=firebase_email_taken" in caplog.text


def test_a_db_user_is_refused_before_firebase_is_called(w):
    token = w.token_for(VICTIM)  # verified while the account did not exist yet
    existing = w.repo.add_user(make_user())
    existing.email = VICTIM
    r = w.register(VICTIM, token=token)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ALREADY_REGISTERED")
    assert r.json()["error"]["message"] == TAKEN_MESSAGE
    assert w.provider.provider_calls == []  # early, no Firebase call
    [audit] = taken_audits(w)
    assert audit["new_data"] == {"email": "v***@gmail.com", "source": "db"}


def test_send_otp_for_a_registered_gmail_is_the_same_409_and_sends_nothing(w):
    existing = w.repo.add_user(make_user())
    existing.email = VICTIM
    r = w.send(VICTIM)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ALREADY_REGISTERED")
    assert VICTIM not in w.inbox and w.otps.rows == []


@pytest.mark.parametrize("fault", [ProviderUnavailable("timeout"), ProviderUserExists(), RuntimeError("bug")])
def test_other_firebase_failures_stay_503_with_a_support_id(w, fault):
    token = w.token_for(VICTIM)
    w.provider.faults["create_user"] = [fault]
    r = w.register(VICTIM, token=token)
    assert (r.status_code, r.json()["error"]["code"]) == (503, "PROVIDER_UNAVAILABLE")
    assert r.json()["error"]["request_id"] and r.headers["X-Request-ID"]
    assert taken_audits(w) == [] and w.repo.users == {}


def test_a_concurrent_registration_of_the_same_gmail_is_409_and_cleans_up_its_firebase_user(w, monkeypatch):
    token = w.token_for(VICTIM)

    async def lost_race(**kw):
        raise IntegrityError("INSERT users", {}, _DbError("uq_users_email_lower"))

    monkeypatch.setattr(w.repo, "create_user_account", lost_race)
    r = w.register(VICTIM, token=token)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ALREADY_REGISTERED")
    assert w.provider.provider_users == {}  # the Firebase user THIS request created is removed
    assert taken_audits(w)[0]["new_data"]["source"] == "db"


def test_a_failing_audit_write_does_not_change_the_answer(w, monkeypatch):
    from sqlalchemy.exc import OperationalError

    orphan(w)
    token = w.token_for(VICTIM)

    async def broken(**kw):
        raise OperationalError("INSERT audit_logs", {}, Exception("down"))

    monkeypatch.setattr(w.repo, "add_audit_log", broken)
    r = w.register(VICTIM, token=token)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "EMAIL_ACCOUNT_NEEDS_ADMIN")


def test_after_the_409_the_token_still_works_once_the_conflict_is_resolved(w):
    """The token is claimed only in the transaction that creates the account: a 409 does not burn it."""
    old = orphan(w)
    token = w.token_for(VICTIM)
    assert w.register(VICTIM, token=token).status_code == 409
    del w.provider.provider_users[old.uid]  # e.g. the team lead removes the orphan by hand
    assert w.register(VICTIM, token=token).status_code == 201


def test_the_db_source_keeps_the_login_or_reset_answer_and_the_firebase_source_does_not(w):
    """Side by side: a DB user -> EMAIL_ALREADY_REGISTERED; an orphan Firebase account -> NEEDS_ADMIN."""
    other = "other.test@gmail.com"
    db_token = w.token_for(VICTIM)
    existing = w.repo.add_user(make_user())
    existing.email = VICTIM
    orphan(w, other)
    fb_token = w.token_for(other)

    from_db = w.register(VICTIM, token=db_token).json()["error"]
    from_firebase = w.register(other, token=fb_token).json()["error"]
    assert (from_db["code"], from_db["message"]) == ("EMAIL_ALREADY_REGISTERED", TAKEN_MESSAGE)
    assert (from_firebase["code"], from_firebase["message"]) == ("EMAIL_ACCOUNT_NEEDS_ADMIN", NEEDS_ADMIN_MESSAGE)
    assert [a["new_data"]["source"] for a in taken_audits(w)] == ["db", "firebase"]
