"""generate_password_reset_link of the REAL Firebase adapter against the SDK's OWN exception
classes (firebase_admin 7.7.0), and the request use case on top of it (M3a bug).

The bug: with Email Enumeration Protection on, Firebase answers accounts:sendOobCode for an
e-mail without an account with HTTP 200 {"kind", "email"} and no oobLink; the SDK raises
UnexpectedResponseError, not EmailNotFoundError. The adapter mapped it to ProviderUnavailable, so
M3a never created the missing account and no e-mail was sent. Nothing here calls Firebase: the SDK
functions are replaced, the exceptions are the library's.
"""

from __future__ import annotations

import logging
import types
import uuid

import pytest
from firebase_admin import _auth_utils
from firebase_admin import auth as firebase_auth
from firebase_admin import exceptions as firebase_exceptions

from app.controllers.auth_access.use_cases import send_password_reset_mail
from app.core.integrations import firebase as firebase_module
from app.core.integrations.email_sender import EmailDeliveryResult
from app.core.integrations.firebase import (
    FirebaseIdentityProvider,
    ProviderUnavailable,
    ProviderUserNotFound,
)

EMAIL = "quankophaiwibu+auto00e038@gmail.com"
LINK = "https://example.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=oob-secret-123&apiKey=k"


def no_oob_link():
    """Exactly what the SDK raises for a 200 without oobLink (_user_mgt.generate_email_action_link)."""
    return _auth_utils.UnexpectedResponseError("Failed to generate email action link.")


class Sdk:
    """Stands in for firebase_admin.auth.* calls; records the calls, never the password."""

    def __init__(self, monkeypatch):
        self.users: dict[str, str] = {}  # e-mail -> uid
        self.generate_errors: list[Exception] = []
        self.lookup_error: Exception | None = None
        self.calls: list[str] = []
        monkeypatch.setattr(firebase_module.firebase_auth, "generate_password_reset_link", self.generate)
        monkeypatch.setattr(firebase_module.firebase_auth, "get_user_by_email", self.get_user_by_email)
        monkeypatch.setattr(firebase_module.firebase_auth, "create_user", self.create_user)

    def generate(self, email, app=None):
        self.calls.append("generate_password_reset_link")
        if self.generate_errors:
            raise self.generate_errors.pop(0)
        if email not in self.users:
            raise no_oob_link()  # Email Enumeration Protection: no account -> no link
        return LINK

    def get_user_by_email(self, email, app=None):
        self.calls.append("get_user_by_email")
        if self.lookup_error:
            raise self.lookup_error
        if email not in self.users:
            raise _auth_utils.UserNotFoundError("No user record found for the provided email.")
        return types.SimpleNamespace(uid=self.users[email], email=email, display_name=None, disabled=False)

    def create_user(self, *, uid, email, display_name, password, email_verified, disabled, app=None):
        self.calls.append("create_user")
        self.users[email] = uid
        return types.SimpleNamespace(uid=uid, email=email, display_name=display_name, disabled=disabled)


@pytest.fixture
def sdk(monkeypatch):
    return Sdk(monkeypatch)


@pytest.fixture
def adapter():
    provider = FirebaseIdentityProvider("demo-project", "service-account.json", call_timeout_seconds=5)
    provider._app = object()  # an initialised SDK app: nothing is read from disk
    return provider


# ----- the adapter -----


def test_the_library_raises_unexpected_response_error_not_a_not_found_error():
    """What the code must recognise: the class the SDK really raises, and why the old except missed it."""
    exc = no_oob_link()
    assert isinstance(exc, firebase_exceptions.UnknownError)
    assert not isinstance(exc, (firebase_auth.EmailNotFoundError, firebase_auth.UserNotFoundError))
    assert not isinstance(exc, firebase_exceptions.NotFoundError)
    assert exc.code == "UNKNOWN"


async def test_no_link_for_an_email_without_account_is_provider_user_not_found(sdk, adapter):
    with pytest.raises(ProviderUserNotFound):
        await adapter.generate_password_reset_link(EMAIL)
    assert sdk.calls == ["generate_password_reset_link", "get_user_by_email"]


@pytest.mark.parametrize("error", [
    _auth_utils.EmailNotFoundError("EMAIL_NOT_FOUND"),
    _auth_utils.UserNotFoundError("USER_NOT_FOUND"),
])
async def test_the_explicit_not_found_errors_still_mean_no_account(sdk, adapter, error):
    sdk.generate_errors = [error]
    with pytest.raises(ProviderUserNotFound):
        await adapter.generate_password_reset_link(EMAIL)
    assert "get_user_by_email" not in sdk.calls  # no second lookup needed


async def test_no_link_while_the_account_exists_is_a_provider_error_not_a_missing_account(sdk, adapter):
    sdk.users[EMAIL] = "own-existing"
    sdk.generate_errors = [no_oob_link()]
    with pytest.raises(ProviderUnavailable) as caught:
        await adapter.generate_password_reset_link(EMAIL)
    assert caught.value.reason == "generate_reset_link_failed"
    assert caught.value.error == "UnexpectedResponseError:UNKNOWN"


@pytest.mark.parametrize(("error", "name"), [
    # Other NotFoundError subclasses are setup problems, never "no account".
    (_auth_utils.ConfigurationNotFoundError("CONFIGURATION_NOT_FOUND"), "ConfigurationNotFoundError:NOT_FOUND"),
    (_auth_utils.ResetPasswordExceedLimitError("RESET_PASSWORD_EXCEED_LIMIT"), "ResetPasswordExceedLimitError:RESOURCE_EXHAUSTED"),
    (_auth_utils.InsufficientPermissionError("INSUFFICIENT_PERMISSION", None, None), "InsufficientPermissionError:PERMISSION_DENIED"),
])
async def test_other_sdk_errors_are_provider_unavailable_with_their_name(sdk, adapter, error, name):
    sdk.generate_errors = [error]
    with pytest.raises(ProviderUnavailable) as caught:
        await adapter.generate_password_reset_link(EMAIL)
    assert caught.value.error == name
    assert "create_user" not in sdk.calls


async def test_a_failing_lookup_after_no_link_is_provider_unavailable(sdk, adapter):
    sdk.lookup_error = firebase_exceptions.UnavailableError("backend down")
    with pytest.raises(ProviderUnavailable) as caught:
        await adapter.generate_password_reset_link(EMAIL)
    assert caught.value.reason == "get_user_by_email_failed"
    assert caught.value.error == "UnavailableError:UNAVAILABLE"


# ----- the request use case on the real adapter (the reported bug) -----


class Sender:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    async def send_password_reset_link(self, *, to_email, display_name, reset_link):
        self.sent.append((to_email, reset_link))
        return EmailDeliveryResult(status="SENT")


async def run_request(adapter, sender, audit_rows):
    async def audit(**row):
        audit_rows.append(row)

    return await send_password_reset_mail(
        provider=adapter, sender=sender, audit=audit, user_id=uuid.uuid4(),
        firebase_uid=f"own-{uuid.uuid4()}", email=EMAIL, display_name="Test",
        frontend_base_url="http://localhost:5173",
    )


async def test_deleted_firebase_account_is_recreated_and_the_link_mailed(sdk, adapter, caplog):
    """The reported case: ACTIVE in the DB, own-<job_id> uid, the Firebase account deleted."""
    caplog.set_level(logging.DEBUG)
    sender, rows = Sender(), []
    assert await run_request(adapter, sender, rows) == "sent"
    assert sdk.calls == ["generate_password_reset_link", "get_user_by_email", "create_user", "generate_password_reset_link"]
    [(to, link)] = sender.sent
    assert to == EMAIL and link == "http://localhost:5173/reset-password?mode=resetPassword&oobCode=oob-secret-123"
    assert [r["action"] for r in rows] == [
        "auth.password_reset_firebase_account_created", "auth.password_reset_email_sent",
    ]
    for secret in ("oob-secret-123", EMAIL):
        assert secret not in caplog.text and secret not in str(rows)


async def test_generate_link_failure_logs_and_audits_the_exception_name_only(sdk, adapter, caplog):
    caplog.set_level(logging.DEBUG)
    sdk.users[EMAIL] = "own-existing"
    sdk.generate_errors = [_auth_utils.ResetPasswordExceedLimitError(f"too many for {EMAIL}")]
    sender, rows = Sender(), []
    assert await run_request(adapter, sender, rows) == "failed:firebase_generate_reset_link_failed"
    assert sender.sent == []
    assert rows[-1]["action"] == "auth.password_reset_email_failed"
    assert rows[-1]["new_data"] == {
        "email": "q***@gmail.com",
        "reason": "firebase_generate_reset_link_failed",
        "error": "ResetPasswordExceedLimitError:RESOURCE_EXHAUSTED",
    }
    assert "error=ResetPasswordExceedLimitError:RESOURCE_EXHAUSTED" in caplog.text
    assert EMAIL not in caplog.text and EMAIL not in str(rows)
