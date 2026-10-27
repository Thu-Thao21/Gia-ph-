from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_database_url(url: str) -> str:
    value = (url or "").strip()
    if not value:
        raise ValueError(
            "DATABASE_URL is required. Set it in the environment or BE/.env "
            "(postgresql+psycopg://user:password@host/dbname?sslmode=require)."
        )
    if value.startswith("sqlite"):
        raise ValueError(
            "SQLite is not supported. DATABASE_URL must use postgresql+psycopg:// "
            "against the assigned Neon/PostgreSQL branch."
        )
    if value.startswith("postgresql+psycopg://"):
        return value
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value.removeprefix("postgresql://")
    if value.startswith("postgres://"):
        return "postgresql+psycopg://" + value.removeprefix("postgres://")
    raise ValueError(
        "DATABASE_URL must start with postgresql+psycopg:// "
        "(postgresql:// and postgres:// are accepted and normalized)."
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("BE/.env", ".env"), env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str
    # Mốc M7: where this process runs. Only "dev" allows DEBUG=true and the dev-only shortcuts
    # (fixed OTP HMAC key, OTP_DEV_SIMULATION, ALLOW_GMAIL_PLUS_ALIAS). Default: the safest value.
    APP_ENV: Literal["dev", "test", "staging", "production"] = "production"
    # When true, unhandled-error logs include the traceback and the dev shortcuts above may be used.
    # Refused at startup unless APP_ENV=dev AND the DATABASE_URL host is in DEV_DATABASE_HOSTS.
    DEBUG: bool = False
    # Comma-separated database hosts (or host prefixes, e.g. a Neon endpoint id) a DEBUG process may
    # use. Anything else (production) makes DEBUG=true refuse to start.
    DEV_DATABASE_HOSTS: str = "localhost,127.0.0.1,::1"
    # Firebase project of the Admin API (Owner provisioning, password sync). No default on
    # purpose: when empty, those calls fail closed with 503. Login does NOT use Firebase.
    FIREBASE_PROJECT_ID: str = ""
    # Web API key of the Firebase project, for the Auth REST API (password reset confirm, owner
    # sign-up). No default (Mốc M4): set FIREBASE_API_KEY in BE/.env; empty = those calls 503.
    FIREBASE_API_KEY: str = ""
    # Service account JSON path, only for the Admin API (password change, token
    # revocation check). The file content is never read or logged by app code.
    FIREBASE_SERVICE_ACCOUNT_PATH: str = ""
    # Application session lifetime. RECENT_LOGIN_MAX_AGE_SECONDS is no longer read (change-password
    # checks the current password in the DB since Moc M1); kept so existing .env files still load.
    SESSION_TTL_HOURS: int = 8
    RECENT_LOGIN_MAX_AGE_SECONDS: int = 300
    FRONTEND_ORIGINS: str = "http://localhost:5173,http://localhost:8080"
    FRONTEND_URL: str = "http://localhost:5173"
    # Where the e-mailed password-reset link points (Mốc M4b): {FRONTEND_BASE_URL}/reset-password?...
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    # Level of the app's own loggers ("mfg.*") on the uvicorn console (app.main.configure_logging).
    LOG_LEVEL: str = "INFO"

    # Rate limiting of the public endpoints (M???c E, step E3): in memory, per process, per IP
    # (docs/known_issues.md KI-17). Defaults: registration 5 per hour, track 20 per 10 minutes.
    # Raise RATE_LIMIT_REGISTRATION_MAX for a demo on a shared network.
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REGISTRATION_MAX: int = 5
    RATE_LIMIT_REGISTRATION_WINDOW_SECONDS: int = 3600
    RATE_LIMIT_TRACK_MAX: int = 20
    RATE_LIMIT_TRACK_WINDOW_SECONDS: int = 600
    # POST /auth/login (DB password login, Moc M1): 10 per 10 minutes per caller address.
    RATE_LIMIT_LOGIN_MAX: int = 10
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: int = 600
    # OTP routes (Mốc M2b), per caller address, each counter shared by both flows and mounts:
    # sending (register-send-otp + business-registrations/send-otp) and verifying.
    RATE_LIMIT_OTP_SEND_MAX: int = 10
    RATE_LIMIT_OTP_SEND_WINDOW_SECONDS: int = 600
    RATE_LIMIT_OTP_VERIFY_MAX: int = 20
    RATE_LIMIT_OTP_VERIFY_WINDOW_SECONDS: int = 600
    # POST /auth/register-public (Mốc M2c), per caller address, both mounts.
    RATE_LIMIT_REGISTER_PUBLIC_MAX: int = 5
    RATE_LIMIT_REGISTER_PUBLIC_WINDOW_SECONDS: int = 3600
    # POST /auth/password-reset/confirm (Mốc M4): every call, and only the wrong/expired codes.
    RATE_LIMIT_PASSWORD_RESET_MAX: int = 10
    RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS: int = 600
    RATE_LIMIT_PASSWORD_RESET_FAILURES_MAX: int = 5
    RATE_LIMIT_PASSWORD_RESET_FAILURES_WINDOW_SECONDS: int = 900
    # POST /auth/password-reset/request (Mốc M4b): per caller address, and per target e-mail.
    RATE_LIMIT_PASSWORD_RESET_REQUEST_MAX: int = 5
    RATE_LIMIT_PASSWORD_RESET_REQUEST_WINDOW_SECONDS: int = 900
    RATE_LIMIT_PASSWORD_RESET_REQUEST_EMAIL_MAX: int = 3
    RATE_LIMIT_PASSWORD_RESET_REQUEST_EMAIL_WINDOW_SECONDS: int = 3600
    RATE_LIMIT_MAX_KEYS: int = 10_000
    # X-Forwarded-For is ignored unless this is true (the caller can write that header).
    # TRUSTED_PROXY_COUNT is how many proxies sit in front of the app; the address is the
    # Nth entry counted from the RIGHT of the header.
    TRUST_PROXY_HEADERS: bool = False
    TRUSTED_PROXY_COUNT: int = 1

    # Owner provisioning (M???c E6). Every Firebase Admin call is bounded by FIREBASE_CALL_TIMEOUT_SECONDS;
    # a RUNNING job holds its lease for PROVISIONING_LEASE_SECONDS. A run makes at most THREE
    # Firebase calls (get_user, create_user or set_password, delete_user), so the lease must outlast
    # three timeouts: 3 x timeout < lease (checked at start-up and by a test).
    FIREBASE_CALL_TIMEOUT_SECONDS: int = 10  # every firebase_admin call: to_thread + wait_for (Mốc M2)
    PROVISIONING_LEASE_SECONDS: int = 90
    # A job that has failed this many times can no longer be retried: it becomes FAILED.
    PROVISIONING_MAX_ATTEMPTS: int = 5
    # Temporary password of a new Owner: life, and whether it must hold a symbol (some Firebase
    # password policies require one; the default character set is letters and digits).
    OWNER_TEMP_PASSWORD_TTL_HOURS: int = 72
    OWNER_TEMP_PASSWORD_REQUIRE_SYMBOL: bool = False

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    # Mốc M5-0: domains NO e-mail is ever sent to (comma-separated; sub-domains included). giapha.com
    # holds the Owners' login identifiers and is not owned by the team: mail there could reach a
    # third party. app.core.integrations.email_sender.blocked_domain() applies it to every sender.
    BLOCKED_EMAIL_DOMAINS: str = "giapha.com"
    # Mốc M5, Gmail registry: DEV ONLY. True keeps the "+tag" of a Gmail address when normalizing,
    # so aliases like name+test1@gmail.com count as different addresses. Must stay false elsewhere
    # (a warning is logged at startup when it is true). Changing it after migration 0008 ran makes
    # the stored normalized_email values inconsistent: decide it before the migration.
    ALLOW_GMAIL_PLUS_ALIAS: bool = False
    # Mốc M5-1: e-mail OTP (registration). Codes live in email_otp_challenges as HMAC-SHA256 keyed
    # by OTP_HMAC_KEY (a random secret of at least 32 characters, in BE/.env only). Empty key:
    # the OTP routes answer 503 (fail closed), except with DEBUG=true where a fixed dev key is used.
    OTP_HMAC_KEY: str = ""
    # DEBUG only: when SMTP is not configured, pretend the OTP e-mail was sent (logged loudly; the
    # code itself is never logged). Ignored when DEBUG is false: no e-mail = the route fails.
    OTP_DEV_SIMULATION: bool = False
    OTP_TTL_SECONDS: int = 600  # 10 minutes: Gmail delivery is sometimes slow
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    OTP_MAX_FAILED_ATTEMPTS: int = 5  # wrong codes before one code is ended
    OTP_EMAIL_WINDOW_SECONDS: int = 3600
    OTP_MAX_SENDS_PER_EMAIL: int = 5  # codes sent to one address per window
    OTP_MAX_FAILURES_PER_EMAIL: int = 10  # wrong codes for one address per window, all codes
    OTP_VERIFIED_TOKEN_TTL_SECONDS: int = 1800  # time to submit the form after the right code

    # hide_input_in_errors: a validation error must never echo the offending value;
    # for DATABASE_URL that value is a connection string with the password.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def validate_database_url(cls, value: object) -> str:
        if value is None:
            raise ValueError(
                "DATABASE_URL is required. Set it in the environment or BE/.env "
                "(postgresql+psycopg://user:password@host/dbname?sslmode=require)."
            )
        return _normalize_database_url(str(value))

    @model_validator(mode="after")
    def validate_provisioning_timing(self) -> "Settings":
        # No value is echoed in these messages.
        for name in (
            "FIREBASE_CALL_TIMEOUT_SECONDS", "PROVISIONING_LEASE_SECONDS",
            "PROVISIONING_MAX_ATTEMPTS", "OWNER_TEMP_PASSWORD_TTL_HOURS",
        ):
            if getattr(self, name) < 1:
                raise ValueError(f"{name} must be a positive integer.")
        if 3 * self.FIREBASE_CALL_TIMEOUT_SECONDS >= self.PROVISIONING_LEASE_SECONDS:
            raise ValueError(
                "PROVISIONING_LEASE_SECONDS must be longer than three Firebase calls: "
                "3 x FIREBASE_CALL_TIMEOUT_SECONDS < PROVISIONING_LEASE_SECONDS."
            )
        return self

    @property
    def dev_mode(self) -> bool:
        """The dev-only shortcuts may run: DEBUG=true AND APP_ENV=dev (startup also checks the DB host)."""
        return bool(self.DEBUG) and self.APP_ENV == "dev"

    @property
    def dev_database_hosts(self) -> list[str]:
        return [h.strip().lower() for h in self.DEV_DATABASE_HOSTS.split(",") if h.strip()]

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.FRONTEND_ORIGINS.split(",") if origin.strip()]

    @property
    def blocked_email_domains(self) -> list[str]:
        """BLOCKED_EMAIL_DOMAINS lower-cased, without a leading "@" or "." or a trailing "."."""
        return [
            d.strip().lower().lstrip("@.").rstrip(".")
            for d in self.BLOCKED_EMAIL_DOMAINS.split(",")
            if d.strip().lstrip("@.").rstrip(".")
        ]


settings = Settings()
