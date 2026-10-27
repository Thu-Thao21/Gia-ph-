"""Runtime configuration checks (fail closed). Run from the app startup event ONLY.

Not run at import time on purpose: importing app.main, running alembic or starting a
TestClient without a startup context must keep working without Firebase settings.

Messages name the variable and the problem, never the value (a value can be a secret
or a file path).
"""

from __future__ import annotations

import os
from typing import Mapping

from app.core.config.config import Settings

# NOT imported from app.core.integrations.firebase at module level: that module imports
# app.core.config, whose __init__ imports this file, so a top-level import is a circular import
# whenever firebase is the first app module loaded (tests/test_import_cycles.py).


class ConfigurationError(RuntimeError):
    """Startup must stop. str(exc) lists variable names and problems only."""

    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        super().__init__("Invalid configuration: " + "; ".join(problems))


def find_config_problems(
    settings: Settings, environ: Mapping[str, str] | None = None
) -> list[str]:
    from app.core.integrations.firebase import EMULATOR_ENV  # see the note on the imports

    environ = os.environ if environ is None else environ
    problems: list[str] = []

    if not (settings.FIREBASE_PROJECT_ID or "").strip():
        problems.append(
            "FIREBASE_PROJECT_ID is not set (Firebase Admin calls: Owner provisioning and password sync would fail)"
        )

    if environ.get(EMULATOR_ENV):
        problems.append(
            f"{EMULATOR_ENV} is set (the Firebase emulator mode accepts unsigned ID tokens; "
            "unset it)"
        )

    path = (settings.FIREBASE_SERVICE_ACCOUNT_PATH or "").strip()
    if path and not os.path.isfile(path):
        # Only existence is checked; the file is never opened by this code.
        problems.append(
            "FIREBASE_SERVICE_ACCOUNT_PATH is set but does not point to an existing file"
        )

    problems.extend(_dev_only_problems(settings))

    if "*" in settings.cors_origins:
        problems.append(
            "FRONTEND_ORIGINS contains '*' (a wildcard origin with credentials is not allowed; "
            "list the exact origins)"
        )

    for name in (
        "RATE_LIMIT_REGISTRATION_MAX",
        "RATE_LIMIT_REGISTRATION_WINDOW_SECONDS",
        "RATE_LIMIT_TRACK_MAX",
        "RATE_LIMIT_TRACK_WINDOW_SECONDS",
        "RATE_LIMIT_LOGIN_MAX",
        "RATE_LIMIT_LOGIN_WINDOW_SECONDS",
        "RATE_LIMIT_OTP_SEND_MAX",
        "RATE_LIMIT_OTP_SEND_WINDOW_SECONDS",
        "RATE_LIMIT_OTP_VERIFY_MAX",
        "RATE_LIMIT_OTP_VERIFY_WINDOW_SECONDS",
        "RATE_LIMIT_REGISTER_PUBLIC_MAX",
        "RATE_LIMIT_REGISTER_PUBLIC_WINDOW_SECONDS",
        "RATE_LIMIT_PASSWORD_RESET_MAX",
        "RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS",
        "RATE_LIMIT_PASSWORD_RESET_FAILURES_MAX",
        "RATE_LIMIT_PASSWORD_RESET_FAILURES_WINDOW_SECONDS",
        "RATE_LIMIT_PASSWORD_RESET_REQUEST_MAX",
        "RATE_LIMIT_PASSWORD_RESET_REQUEST_WINDOW_SECONDS",
        "RATE_LIMIT_PASSWORD_RESET_REQUEST_EMAIL_MAX",
        "RATE_LIMIT_PASSWORD_RESET_REQUEST_EMAIL_WINDOW_SECONDS",
        "RATE_LIMIT_MAX_KEYS",
        "TRUSTED_PROXY_COUNT",
    ):
        if getattr(settings, name) < 1:
            problems.append(f"{name} must be a positive integer")

    return problems


def database_host(url: str) -> str:
    from sqlalchemy.engine import make_url

    try:
        return (make_url(url).host or "").lower()
    except Exception:  # noqa: BLE001 - an unparsable URL is reported by the caller as not allowed
        return ""


def host_allowed(host: str, allowed: list[str]) -> bool:
    """`host` is one of `allowed`, or starts with an entry followed by "." or "-" (a Neon endpoint
    id matches its "-pooler" host and its full domain)."""
    return any(host == a or host.startswith(a + ".") or host.startswith(a + "-") for a in allowed)


def _dev_only_problems(settings: Settings) -> list[str]:
    """Mốc M7: DEBUG and the dev-only shortcuts outside dev. Names only, never a value or a host."""
    problems: list[str] = []
    if settings.DEBUG:
        if settings.APP_ENV != "dev":
            problems.append(f"DEBUG=true is only allowed with APP_ENV=dev (APP_ENV={settings.APP_ENV})")
        if not host_allowed(database_host(settings.DATABASE_URL), settings.dev_database_hosts):
            problems.append(
                "DEBUG=true but the DATABASE_URL host is not in DEV_DATABASE_HOSTS "
                "(a debug process must never run against a non-dev database)"
            )
    for flag in ("OTP_DEV_SIMULATION", "ALLOW_GMAIL_PLUS_ALIAS"):
        if getattr(settings, flag) and settings.APP_ENV != "dev":
            problems.append(f"{flag}=true is only allowed with APP_ENV=dev")
    return problems


def validate_runtime_config(
    settings: Settings, environ: Mapping[str, str] | None = None
) -> None:
    problems = find_config_problems(settings, environ)
    if problems:
        raise ConfigurationError(problems)
    if settings.ALLOW_GMAIL_PLUS_ALIAS:
        import logging

        logging.getLogger("mfg.config").warning(
            "ALLOW_GMAIL_PLUS_ALIAS=true: Gmail +tag aliases count as different addresses in the "
            "Gmail registry. DEV ONLY: never in production."
        )
