"""Mốc M5-2: one error code per OTP situation, with the numbers the FE shows, on both flows
(member /auth/register-*, Business /business-registrations/*). Reuses the M5-1 test world."""

from __future__ import annotations

import pytest

from app.core.config import settings
from tests.test_otp_security import ATTACKER, VICTIM, World


@pytest.fixture
def w(monkeypatch):
    return World(monkeypatch)


def error(r):
    return r.json()["error"]


def wrong_for(code: str, n: int = 0) -> str:
    """A code that is not `code` (the n-th such)."""
    candidates = [f"{i:06d}" for i in range(n + 2) if f"{i:06d}" != code]
    return candidates[n]


FLOWS = ["member", "business"]


def send(w, flow, email=VICTIM):
    return w.send(email) if flow == "member" else w.b_send(email)


def verify(w, flow, code, email=VICTIM):
    return w.verify(email, code) if flow == "member" else w.b_verify(email, code)


# ----- the exact limits -----


@pytest.mark.parametrize("flow", FLOWS)
def test_one_wrong_code_tells_the_attempts_left_and_the_right_code_still_works(w, flow):
    send(w, flow)
    code = w.inbox[VICTIM][-1]
    r = verify(w, flow, wrong_for(code))
    assert r.status_code == 400
    body = error(r)
    assert body["code"] == "OTP_INVALID"
    assert body["details"] == {"remaining_attempts": settings.OTP_MAX_FAILED_ATTEMPTS - 1}
    assert body["message"] == f"Mã chưa đúng. Bạn còn {settings.OTP_MAX_FAILED_ATTEMPTS - 1} lần thử."
    ok = verify(w, flow, code)
    assert ok.status_code == 200 and ok.json()["verification_token"]


@pytest.mark.parametrize("flow", FLOWS)
def test_the_last_allowed_wrong_code_ends_the_code_and_the_right_one_is_refused(w, flow):
    send(w, flow)
    code = w.inbox[VICTIM][-1]
    remaining = []
    for i in range(settings.OTP_MAX_FAILED_ATTEMPTS):
        body = error(verify(w, flow, wrong_for(code, i)))
        remaining.append(body.get("details", {}).get("remaining_attempts"))
        last = body
    assert remaining[:-1] == list(range(settings.OTP_MAX_FAILED_ATTEMPTS - 1, 0, -1))  # 4,3,2,1
    assert last["code"] == "OTP_TOO_MANY_ATTEMPTS"
    assert last["details"] == {"max_attempts": settings.OTP_MAX_FAILED_ATTEMPTS}
    after = verify(w, flow, code)  # the RIGHT code, too late
    assert (after.status_code, error(after)["code"]) == (400, "OTP_TOO_MANY_ATTEMPTS")


# ----- the other situations -----


@pytest.mark.parametrize("flow", FLOWS)
def test_an_expired_code(w, flow):
    send(w, flow)
    code = w.inbox[VICTIM][-1]
    w.age(settings.OTP_TTL_SECONDS + 1)
    body = error(verify(w, flow, code))
    assert body["code"] == "OTP_EXPIRED" and body["details"] == {"code_ttl_seconds": settings.OTP_TTL_SECONDS}


def test_no_code_requested_and_a_used_code_are_expired(w):
    assert error(w.verify(VICTIM, "123456"))["code"] == "OTP_EXPIRED"
    w.send(VICTIM)
    code = w.inbox[VICTIM][-1]
    assert w.verify(VICTIM, code).status_code == 200
    assert error(w.verify(VICTIM, code))["code"] == "OTP_EXPIRED"


@pytest.mark.parametrize("flow", FLOWS)
def test_the_code_of_an_older_email_is_superseded_and_not_counted(w, flow):
    send(w, flow)
    old = w.inbox[VICTIM][-1]
    w.age(61)
    send(w, flow)
    new = w.inbox[VICTIM][-1]
    if old == new:
        pytest.skip("both random codes were equal (1 in a million)")
    r = verify(w, flow, old)
    assert (r.status_code, error(r)["code"]) == (400, "OTP_SUPERSEDED")
    assert "details" not in error(r)
    assert sum(row.failed_attempts for row in w.otps.rows) == 0  # not a wrong guess
    assert verify(w, flow, new).status_code == 200


@pytest.mark.parametrize("flow", FLOWS)
def test_resend_too_soon_is_otp_rate_limited_with_the_exact_wait(w, flow):
    send(w, flow)
    w.age(20)
    r = send(w, flow)
    assert r.status_code == 429
    body = error(r)
    wait = settings.OTP_RESEND_COOLDOWN_SECONDS - 20
    assert body["code"] == "OTP_RATE_LIMITED" and body["details"] == {"retry_after_seconds": wait}
    assert r.headers["Retry-After"] == str(wait)


def test_too_many_wrong_codes_for_the_address_is_otp_rate_limited_on_verify_too(w, monkeypatch):
    monkeypatch.setattr(settings, "OTP_MAX_SENDS_PER_EMAIL", 100)
    for _ in range(3):
        w.age(61)
        w.send(VICTIM)
        code = w.inbox[VICTIM][-1]
        for i in range(4):
            w.verify(VICTIM, wrong_for(code, i))  # 3 codes x 4 wrong = 12 >= OTP_MAX_FAILURES_PER_EMAIL
    r = w.verify(VICTIM, "000000")
    assert r.status_code == 429
    body = error(r)
    assert body["code"] == "OTP_RATE_LIMITED" and 0 < body["details"]["retry_after_seconds"] <= 3600
    assert r.headers["Retry-After"] == str(body["details"]["retry_after_seconds"])


def test_another_address_is_not_affected(w):
    w.send(VICTIM)
    code = w.inbox[VICTIM][-1]
    for i in range(settings.OTP_MAX_FAILED_ATTEMPTS):
        w.verify(VICTIM, wrong_for(code, i))
    w.send(ATTACKER)
    assert w.verify(ATTACKER, w.inbox[ATTACKER][-1]).status_code == 200


def test_errors_hold_no_code_no_address_and_no_hash(w):
    w.send(VICTIM)
    code = w.inbox[VICTIM][-1]
    r = w.verify(VICTIM, wrong_for(code))
    for secret in (code, VICTIM, w.otps.rows[0].code_hash, w.otps.rows[0].email_hash):
        assert secret not in r.text
    assert set(error(r)) == {"code", "message", "request_id", "details"}


def test_other_errors_keep_the_old_envelope_without_details(w):
    r = w.client.post("/api/v1/auth/register-send-otp", json={"email": "x@yahoo.com"})
    assert "details" not in r.json().get("error", {})


def test_m3b_otp_defaults():
    """Defaults of the class (not of BE/.env): per caller address 10 sends and 20 verifications
    per 10 minutes, a code lives 10 minutes; .env.example says the same."""
    from pathlib import Path

    from app.core.config.config import Settings

    fields = Settings.model_fields
    expected = {
        "RATE_LIMIT_OTP_SEND_MAX": 10,
        "RATE_LIMIT_OTP_SEND_WINDOW_SECONDS": 600,
        "RATE_LIMIT_OTP_VERIFY_MAX": 20,
        "RATE_LIMIT_OTP_VERIFY_WINDOW_SECONDS": 600,
        "OTP_TTL_SECONDS": 600,
    }
    assert {name: fields[name].default for name in expected} == expected
    example = (Path(__file__).resolve().parents[1] / ".env.example").read_text(encoding="utf-8")
    for name, value in expected.items():
        assert f"\n{name}={value}\n" in example, name


def test_m3b_the_email_promises_the_real_ttl(monkeypatch):
    import smtplib

    from app.core.utils import otp_service as svc

    sent = []

    class Smtp:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *e):
            return False

        def starttls(self):
            pass

        def login(self, *a):
            pass

        def send_message(self, msg):
            sent.append(msg.get_payload()[0].get_payload(decode=True).decode("utf-8"))

    monkeypatch.setattr(smtplib, "SMTP", Smtp)
    monkeypatch.setattr(settings, "SMTP_USER", "sender.test@gmail.com")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "not-a-real-password")
    monkeypatch.setattr(settings, "OTP_TTL_SECONDS", 600)
    assert svc.send_otp_via_email(VICTIM, "123456") is True
    assert "<strong>10 phút</strong>" in sent[0]
