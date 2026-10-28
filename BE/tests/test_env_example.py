"""Mốc M7: configuration safety. DEBUG / dev shortcuts only in dev (B1), the health probes (B3), and
BE/.env.example in sync with Settings (B4)."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config.config import Settings
from app.core.config.startup_checks import find_config_problems, host_allowed

BE_DIR = Path(__file__).resolve().parents[1]
LOCAL_DB = "postgresql+psycopg://u:p@localhost:5432/db"
NEON_DEV = "postgresql+psycopg://u:p@ep-dev-branch-abc12345-pooler.ap-southeast-1.aws.neon.tech/db"
NEON_OTHER = "postgresql+psycopg://u:p@ep-prod-branch-zzz99999-pooler.ap-southeast-1.aws.neon.tech/db"


def settings(**values) -> Settings:
    return Settings(_env_file=None, **{"DATABASE_URL": LOCAL_DB, "FIREBASE_PROJECT_ID": "p", **values})


def dev_problems(s: Settings) -> list[str]:
    return [p for p in find_config_problems(s, environ={}) if "DEBUG" in p or "APP_ENV" in p]


# ----- B1: DEBUG and the dev shortcuts only in dev -----


def test_the_defaults_are_the_safe_ones():
    s = settings()
    assert (s.APP_ENV, s.DEBUG, s.OTP_DEV_SIMULATION, s.ALLOW_GMAIL_PLUS_ALIAS) == ("production", False, False, False)
    assert s.dev_mode is False and dev_problems(s) == []


@pytest.mark.parametrize("env", ["production", "staging", "test"])
def test_debug_outside_dev_refuses_to_start(env):
    problems = dev_problems(settings(DEBUG=True, APP_ENV=env))
    assert any("DEBUG=true is only allowed with APP_ENV=dev" in p for p in problems)


def test_debug_against_a_non_dev_database_refuses_to_start():
    s = settings(DEBUG=True, APP_ENV="dev", DATABASE_URL=NEON_OTHER, DEV_DATABASE_HOSTS="localhost,ep-dev-branch-abc12345")
    problems = dev_problems(s)
    assert any("not in DEV_DATABASE_HOSTS" in p for p in problems)
    assert not any("ep-prod" in p or "neon.tech" in p for p in problems)  # never the host itself


def test_debug_in_dev_against_a_listed_host_is_allowed():
    assert dev_problems(settings(DEBUG=True, APP_ENV="dev")) == []
    s = settings(DEBUG=True, APP_ENV="dev", DATABASE_URL=NEON_DEV, DEV_DATABASE_HOSTS="localhost,ep-dev-branch-abc12345")
    assert dev_problems(s) == [] and s.dev_mode is True


@pytest.mark.parametrize("flag", ["OTP_DEV_SIMULATION", "ALLOW_GMAIL_PLUS_ALIAS"])
def test_dev_only_switches_outside_dev_refuse_to_start(flag):
    assert any(f"{flag}=true is only allowed with APP_ENV=dev" in p for p in dev_problems(settings(**{flag: True})))
    assert dev_problems(settings(APP_ENV="dev", **{flag: True})) == []


def test_host_matching():
    allowed = ["localhost", "ep-dev-branch-abc12345"]
    assert host_allowed("localhost", allowed)
    assert host_allowed("ep-dev-branch-abc12345-pooler.ap-southeast-1.aws.neon.tech", allowed)
    assert host_allowed("ep-dev-branch-abc12345.ap-southeast-1.aws.neon.tech", allowed)
    assert not host_allowed("ep-dev-branch-abc123456.neon.tech", allowed)  # a longer id is another host
    assert not host_allowed("evil-localhost.example", allowed)
    assert not host_allowed("", allowed)


def test_the_dev_shortcuts_are_off_at_runtime_outside_dev(monkeypatch):
    """Even if a process skipped the startup check (a test client, a script): no dev key, no
    simulated e-mail, no +tag aliases unless APP_ENV=dev."""
    from app.core.config import settings as live
    from app.core.utils import gmail_registry, otp_service

    monkeypatch.setattr(live, "DEBUG", True)
    monkeypatch.setattr(live, "APP_ENV", "production")
    monkeypatch.setattr(live, "OTP_HMAC_KEY", "")
    monkeypatch.setattr(live, "OTP_DEV_SIMULATION", True)
    monkeypatch.setattr(live, "ALLOW_GMAIL_PLUS_ALIAS", True)
    monkeypatch.setattr(live, "SMTP_USER", "")
    monkeypatch.setattr(live, "SMTP_PASSWORD", "")
    with pytest.raises(otp_service.OtpUnavailable):
        otp_service.email_hash("a@gmail.com")
    assert otp_service.send_otp_via_email("a@gmail.com", "123456") is False
    assert gmail_registry.normalize_email("a+test@gmail.com") == "a@gmail.com"

    monkeypatch.setattr(live, "APP_ENV", "dev")
    assert otp_service.email_hash("a@gmail.com")  # the dev key
    assert otp_service.send_otp_via_email("a@gmail.com", "123456") is True
    assert gmail_registry.normalize_email("a+test@gmail.com") == "a+test@gmail.com"


# ----- B3: health probes -----


@pytest.fixture
def health_client():
    from app.controllers import health

    app = FastAPI()
    app.include_router(health.router, prefix="/api")
    calls = {"n": 0}

    async def ok():
        calls["n"] += 1

    app.dependency_overrides[health.get_db_probe] = lambda: ok
    client = TestClient(app)
    client.calls = calls
    client.app_ = app
    return client


def test_liveness_never_touches_the_database(health_client):
    r = health_client.get("/api/health")
    assert (r.status_code, r.json()) == (200, {"status": "ok"})
    assert health_client.calls["n"] == 0 and r.headers["Cache-Control"] == "no-store"


def test_readiness_ok(health_client):
    r = health_client.get("/api/health/ready")
    assert (r.status_code, r.json()) == (200, {"status": "ready"}) and health_client.calls["n"] == 1
    assert r.headers["Cache-Control"] == "no-store"


def test_readiness_failure_says_nothing_sensitive(health_client, caplog):
    from app.controllers import health

    async def down():
        raise ConnectionError("could not connect to ep-secret-host.neon.tech as user owner, password=xyz")

    health_client.app_.dependency_overrides[health.get_db_probe] = lambda: down
    r = health_client.get("/api/health/ready")
    assert (r.status_code, r.json()) == (503, {"status": "not_ready"})
    for leak in ("ep-secret-host", "neon", "owner", "xyz", "password"):
        assert leak not in r.text and leak not in caplog.text


def test_readiness_is_bounded_in_time(health_client, monkeypatch):
    import time

    from app.controllers import health

    async def hangs():
        await asyncio.sleep(30)

    monkeypatch.setattr(health, "READY_TIMEOUT_SECONDS", 0.2)
    health_client.app_.dependency_overrides[health.get_db_probe] = lambda: hangs
    started = time.perf_counter()
    r = health_client.get("/api/health/ready")
    assert r.status_code == 503 and time.perf_counter() - started < 5


def test_both_probes_are_public_routes():
    from app.core.public_routes import is_public

    assert is_public("GET", "/api/health") and is_public("GET", "/api/health/ready")


# ----- B4: BE/.env.example lists every setting, and only example values -----


def example_keys() -> dict[str, str]:
    text = (BE_DIR / ".env.example").read_text(encoding="utf-8")
    return dict(re.findall(r"^([A-Z][A-Z0-9_]+)=(.*)$", text, re.M))


def test_every_setting_is_in_env_example_and_nothing_else():
    keys = example_keys()
    assert sorted(set(Settings.model_fields) - set(keys)) == []
    assert sorted(set(keys) - set(Settings.model_fields)) == []


def test_env_example_holds_no_real_secret():
    keys = example_keys()
    for name, value in keys.items():
        assert not re.search(r"AIza[0-9A-Za-z_-]{20,}|-----BEGIN|npg_[A-Za-z0-9]{8,}|neon\.tech", value), name
    assert keys["DATABASE_URL"].startswith("postgresql+psycopg://USER:PASSWORD@HOST")
    assert keys["OTP_HMAC_KEY"] == "" and keys["DEBUG"] == "false" and keys["APP_ENV"] == "production"
    assert keys["ALLOW_GMAIL_PLUS_ALIAS"] == "false" and keys["OTP_DEV_SIMULATION"] == "false"


def test_env_example_values_parse_as_settings():
    """Every example value is accepted by Settings (types, literals)."""
    values = {k: v for k, v in example_keys().items() if v != ""}
    s = Settings(_env_file=None, **values)
    assert s.APP_ENV == "production" and s.DEBUG is False
