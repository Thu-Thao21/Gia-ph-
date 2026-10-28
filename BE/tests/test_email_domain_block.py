"""Mốc M5-0: no e-mail to a domain the team does not own (BLOCKED_EMAIL_DOMAINS, default
giapha.com), and an Owner's temporary password goes to ONE place: the registration's real Gmail.

Nothing here opens SMTP or a database: smtplib.SMTP and the audit writer are replaced.
"""

from __future__ import annotations

import logging
import smtplib
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.controllers.family_management import owner_password_reset_use_cases as reset_uc
from app.controllers.family_management import owner_provisioning_use_cases as prov_uc
from app.core.config import settings
from app.core.integrations import email_sender
from app.core.integrations.email_sender import (
    EmailDeliveryResult,
    NoopEmailSender,
    SmtpEmailSender,
    blocked_domain,
)
from app.core.utils import otp_service
from tests.fakes import FakeDb, FakeFamilyRepo, FakeUserAccessRepo, make_user

EXPIRES = datetime(2026, 10, 30, 8, 0, tzinfo=timezone.utc)
REP_GMAIL = "nguoidaidien.test@gmail.com"
LOGIN_ID = "nguyen.hanoi@giapha.com"


class Smtp:
    """Stands in for smtplib.SMTP: records the recipients, sends nothing."""

    sent: list[list[str]] = []

    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        pass

    def login(self, *a):
        pass

    def sendmail(self, sender, to, msg):
        Smtp.sent.append(list(to))

    def send_message(self, msg):
        Smtp.sent.append([msg["To"]])


@pytest.fixture
def smtp(monkeypatch):
    Smtp.sent = []
    monkeypatch.setattr(smtplib, "SMTP", Smtp)
    monkeypatch.setattr(settings, "SMTP_USER", "sender.test@gmail.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "not-a-real-password")
    return Smtp


@pytest.fixture
def audits(monkeypatch):
    rows: list[dict] = []

    async def writer(**row):
        rows.append(row)

    monkeypatch.setattr(email_sender, "blocked_audit_writer", writer)
    return rows


# ----- the domain rule -----


@pytest.mark.parametrize("address", [
    "a@giapha.com", "A@GiaPha.COM", " a@giapha.com ", "a@giapha.com.", "a@mail.giapha.com",
    "a@x.y.GIAPHA.com",
])
def test_giapha_and_its_subdomains_are_blocked_in_any_case(address):
    assert blocked_domain(address) == "giapha.com"


@pytest.mark.parametrize("address", [
    "a@gmail.com", "a@notgiapha.com", "a@giapha.com.vn", "giapha.com@gmail.com", "no-at-sign", "",
])
def test_other_domains_are_not_blocked(address):
    assert blocked_domain(address) is None


def test_the_list_comes_from_config(monkeypatch):
    monkeypatch.setattr(settings, "BLOCKED_EMAIL_DOMAINS", " @Example.org , giapha.com., ,")
    assert settings.blocked_email_domains == ["example.org", "giapha.com"]
    assert blocked_domain("x@sub.example.org") == "example.org"
    monkeypatch.setattr(settings, "BLOCKED_EMAIL_DOMAINS", "")
    assert blocked_domain("x@giapha.com") is None


# ----- every sending function -----


async def test_temporary_password_to_giapha_is_refused_audited_and_not_sent(smtp, audits, caplog):
    caplog.set_level(logging.DEBUG)
    result = await SmtpEmailSender().send_owner_temporary_password(
        to_email=LOGIN_ID, display_name="X", temporary_password="Tmp-Pass-123!", expires_at=EXPIRES,
    )
    assert result == EmailDeliveryResult(status="FAILED", error="blocked_domain")
    assert smtp.sent == []
    assert audits == [{"email": "n***@giapha.com", "domain": "giapha.com", "channel": "owner_temporary_password"}]
    assert LOGIN_ID not in caplog.text and "Tmp-Pass-123!" not in caplog.text


async def test_reset_link_to_giapha_is_refused(smtp, audits):
    result = await SmtpEmailSender().send_password_reset_link(
        to_email="X@Mail.GiaPha.com", display_name="X", reset_link="http://localhost/reset?oobCode=c",
    )
    assert result.error == "blocked_domain" and smtp.sent == []
    assert audits[0]["channel"] == "password_reset_link" and audits[0]["email"] == "X***@Mail.GiaPha.com"


async def test_gmail_is_still_sent(smtp, audits):
    owner = await SmtpEmailSender().send_owner_temporary_password(
        to_email=REP_GMAIL, display_name="X", temporary_password="Tmp-Pass-123!", expires_at=EXPIRES,
        account_email=LOGIN_ID,
    )
    link = await SmtpEmailSender().send_password_reset_link(
        to_email=REP_GMAIL, display_name="X", reset_link="http://localhost/reset?oobCode=c",
    )
    assert owner.status == "SENT" and link.status == "SENT"
    assert smtp.sent == [[REP_GMAIL], [REP_GMAIL]] and audits == []


async def test_the_noop_sender_refuses_too(audits):
    result = await NoopEmailSender().send_owner_temporary_password(
        to_email=LOGIN_ID, display_name="X", temporary_password="p", expires_at=EXPIRES,
    )
    assert result.error == "blocked_domain" and len(audits) == 1
    assert (await NoopEmailSender().send_password_reset_link(
        to_email=REP_GMAIL, display_name="X", reset_link="l"
    )).status is None


async def test_otp_to_giapha_is_refused_with_an_audit_task(smtp, audits):
    import asyncio

    assert otp_service.send_otp_via_email(LOGIN_ID, "123456") is False
    await asyncio.sleep(0)  # let the audit task run
    assert smtp.sent == []
    assert audits == [{"email": "n***@giapha.com", "domain": "giapha.com", "channel": "otp"}]
    assert otp_service.send_otp_via_email(REP_GMAIL, "123456") is True and smtp.sent == [[REP_GMAIL]]


async def test_a_failing_audit_never_breaks_the_caller(smtp, monkeypatch):
    async def broken(**row):
        raise RuntimeError("db down")

    monkeypatch.setattr(email_sender, "blocked_audit_writer", broken)
    result = await SmtpEmailSender().send_password_reset_link(to_email=LOGIN_ID, display_name="X", reset_link="l")
    assert result.error == "blocked_domain"


async def test_the_owner_mail_has_no_firebase_side_channel(smtp, monkeypatch):
    """The old sender also asked Firebase to mail a reset link to the same address."""
    import urllib.request

    def no_http(*a, **k):
        raise AssertionError("no HTTP call may be made")

    monkeypatch.setattr(urllib.request, "urlopen", no_http)
    monkeypatch.setattr(settings, "FIREBASE_API_KEY", "fake-key-for-test")
    result = await SmtpEmailSender().send_owner_temporary_password(
        to_email=REP_GMAIL, display_name="X", temporary_password="p", expires_at=EXPIRES,
    )
    assert result.status == "SENT" and smtp.sent == [[REP_GMAIL]]


# ----- the temporary password goes to ONE place: the registration's Gmail -----


class RecordingSender:
    def __init__(self):
        self.calls: list[dict] = []

    async def send_owner_temporary_password(self, **kw):
        self.calls.append(kw)
        return EmailDeliveryResult(status="SENT")


def clan_from_registration(family=None):
    family = family or FakeFamilyRepo()
    plan = family.add_plan("BASIC")
    registration = family.add_registration(plan, email=REP_GMAIL, status="APPROVED")
    clan = family.add_clan()
    clan.registration_id = registration.registration_id
    clan.name = "Ho Nguyen"
    return family, clan, registration


def run_for(clan):
    return prov_uc.JobRun(
        job_id=uuid.uuid4(), clan_id=clan.clan_id, attempt=1, email=LOGIN_ID, display_name="Nguyen Van A",
        uid=f"own-{uuid.uuid4()}", actor_id=uuid.uuid4(), ip_address=None,
    )


def owner_with_contact(users, contact=REP_GMAIL):
    """An Owner as provisioning leaves it (Mốc M5): login @giapha.com, real Gmail in contact_email."""
    owner = users.add_user(make_user("PENDING", firebase_uid=f"own-{uuid.uuid4()}"))
    owner.email = LOGIN_ID
    owner.contact_email = contact
    return owner


async def test_provision_mails_the_contact_gmail_once_with_the_login_id():
    family, clan, _ = clan_from_registration()
    users = FakeUserAccessRepo()
    owner = owner_with_contact(users)
    db = FakeDb()
    contact = await prov_uc.owner_contact(db, users, family, clan.clan_id, owner.user_id)
    assert contact == prov_uc.OwnerContact(email=REP_GMAIL, clan_name="Ho Nguyen")
    assert db.rollbacks == 1  # the read is ended before the mail

    sender = RecordingSender()
    result = await prov_uc._send(sender, contact, run_for(clan), "Tmp-Pass-123!", EXPIRES)
    assert result.status == "SENT"
    [call] = sender.calls
    assert call["to_email"] == REP_GMAIL and call["account_email"] == LOGIN_ID
    assert call["clan_name"] == "Ho Nguyen"


async def test_provision_without_a_contact_email_sends_nothing():
    family = FakeFamilyRepo()
    clan = family.add_clan()  # made by hand: no registration, so no real Gmail
    users = FakeUserAccessRepo()
    owner = owner_with_contact(users, contact=None)
    contact = await prov_uc.owner_contact(FakeDb(), users, family, clan.clan_id, owner.user_id)
    assert contact.email is None
    sender = RecordingSender()
    result = await prov_uc._send(sender, contact, run_for(clan), "p", EXPIRES)
    assert result == EmailDeliveryResult(status="FAILED", error="no_contact_email") and sender.calls == []


async def test_sa_new_temporary_password_goes_to_the_contact_gmail_not_the_login_id():
    family, clan, _ = clan_from_registration()
    users = FakeUserAccessRepo()
    owner = owner_with_contact(users)
    users.set_cred(owner, must_change_password=True)
    family.add_owner(clan, owner)

    seen = await reset_uc._check(db=FakeDb(), users=users, family=family, clan_id=clan.clan_id)
    assert seen.contact.email == REP_GMAIL and seen.email == LOGIN_ID

    sender = RecordingSender()
    await reset_uc._send(sender, seen, "Tmp-Pass-123!", EXPIRES)
    [call] = sender.calls
    assert call["to_email"] == REP_GMAIL and call["account_email"] == LOGIN_ID


async def test_sa_reset_without_a_registration_sends_nothing():
    seen = reset_uc._Seen(
        user_id=uuid.uuid4(), firebase_uid="own-x", email=LOGIN_ID, display_name="X", issued_at=None,
        updated_at=None, contact=prov_uc.OwnerContact(email=None, clan_name="C"),
    )
    sender = RecordingSender()
    result = await reset_uc._send(sender, seen, "p", EXPIRES)
    assert result.error == "no_contact_email" and sender.calls == []


async def test_approval_does_not_mail_the_temporary_password_a_second_time(monkeypatch):
    """approve-and-provision used to mail rep_email itself AFTER provision_owner had mailed it."""
    from app.controllers.family_management import registration_admin_use_cases as reg_uc

    family, clan, registration = clan_from_registration()
    clan.status = "ACTIVE"
    sender = RecordingSender()

    async def fake_provision_owner(**kw):
        assert kw["body"].email.endswith("@giapha.com")  # the login identifier only
        owner = owner_with_contact(kw["users"])
        contact = await prov_uc.owner_contact(kw["db"], kw["users"], kw["family"], kw["clan_id"], owner.user_id)
        delivery = await prov_uc._send(kw["sender"], contact, run_for(clan), "Tmp-Pass-123!", EXPIRES)
        return SimpleNamespace(response=SimpleNamespace(
            temporary_password="Tmp-Pass-123!", temporary_password_expires_at=EXPIRES,
            email_delivery_status=delivery.status, owner_email=kw["body"].email, owner_display_name="A",
        ))

    monkeypatch.setattr(prov_uc, "provision_owner", fake_provision_owner)
    response = await reg_uc.approve_and_provision_registration(
        db=FakeDb(), users=FakeUserAccessRepo(), family=family, jobs=None, idempotency=None,
        provider=SimpleNamespace(admin_api_enabled=True), sender=sender,
        principal=SimpleNamespace(user_id=uuid.uuid4()), registration_id=registration.registration_id,
        client=SimpleNamespace(ip_address=None, user_agent=None),
    )
    assert [c["to_email"] for c in sender.calls] == [REP_GMAIL]  # ONE mail, to the Gmail
    assert response.email_delivery_status == "SENT" and response.owner_email.endswith("@giapha.com")
