"""E-mail OTP proving a real Gmail address (registration). Mốc M5-1.

State lives in the database (email_otp_challenges, migration 0007), never in process memory: it
survives a restart and is the same for every worker. Nothing secret is stored or logged:

- email_hash = HMAC-SHA256(OTP_HMAC_KEY, "email:" + normalized address)
- code_hash  = HMAC-SHA256(OTP_HMAC_KEY, "code:" + purpose + email_hash + code): the code only
  works for THAT address and THAT purpose, and cannot be brute-forced offline without the key.
- a right code is used up at once and yields a random one-time VERIFICATION TOKEN (only its SHA-256
  is stored), valid OTP_VERIFIED_TOKEN_TTL_SECONDS. The account / registration is created only by
  presenting that token, claimed atomically in the creating transaction: knowing that someone
  verified an address is worth nothing without the token they received.

Limits: per code (TTL, OTP_MAX_FAILED_ATTEMPTS), per address and purpose over OTP_EMAIL_WINDOW_SECONDS
(resend cooldown, OTP_MAX_SENDS_PER_EMAIL, OTP_MAX_FAILURES_PER_EMAIL), and per caller address by the
route rate limiters (otp_send, otp_verify). The code is never in an API answer or a log line.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import smtplib
import uuid
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger("mfg.otp_service")

PURPOSE_MEMBER = "MEMBER_REGISTRATION"
PURPOSE_BUSINESS = "BUSINESS_REGISTRATION"
# Used only when DEBUG=true and OTP_HMAC_KEY is empty. Never accepted with DEBUG=false.
_DEV_ONLY_KEY = b"mfg-dev-only-otp-hmac-key: never used with DEBUG=false"


class OtpUnavailable(Exception):
    """OTP_HMAC_KEY is not configured (and DEBUG is off): fail closed."""


class OtpRateLimited(Exception):
    def __init__(self, reason: str, retry_after: float) -> None:
        super().__init__(reason)
        self.reason = reason
        self.retry_after = max(1, int(-(-retry_after // 1)))  # whole seconds, rounded up


class OtpRejected(Exception):
    """verify_code refused the code. `code` is an ErrorCode name (Mốc M5-2): OTP_INVALID,
    OTP_EXPIRED, OTP_TOO_MANY_ATTEMPTS, OTP_SUPERSEDED or OTP_RATE_LIMITED; `details` holds
    numbers only (attempts left, seconds to wait)."""

    def __init__(self, code: str, details: dict[str, int] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


def _seconds_until_below(rows_newest_first, weight, limit: int, now: datetime) -> float:
    """How long until the rows still inside the window weigh less than `limit` (rows leave the
    window OTP_EMAIL_WINDOW_SECONDS after they were created, oldest first)."""
    window = timedelta(seconds=settings.OTP_EMAIL_WINDOW_SECONDS)
    total = sum(weight(r) for r in rows_newest_first)
    for row in reversed(rows_newest_first):  # oldest first
        if total < limit:
            break
        total -= weight(row)
        if total < limit:
            return (row.created_at + window - now).total_seconds()
    return 1.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _key() -> bytes:
    key = (settings.OTP_HMAC_KEY or "").strip()
    if key:
        return key.encode("utf-8")
    if settings.dev_mode:  # DEBUG=true AND APP_ENV=dev (Mốc M7)
        logger.warning("[OTP] OTP_HMAC_KEY is empty: using the DEV-ONLY key (DEBUG=true, APP_ENV=dev)")
        return _DEV_ONLY_KEY
    logger.error("[OTP] OTP_HMAC_KEY is not configured: OTP refused (fail closed)")
    raise OtpUnavailable()


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def email_hash(email: str) -> str:
    return hmac.new(_key(), b"email:" + normalize_email(email).encode("utf-8"), hashlib.sha256).hexdigest()


def code_hash(purpose: str, e_hash: str, code: str) -> str:
    message = f"code:{purpose}:{e_hash}:{(code or '').strip()}".encode("utf-8")
    return hmac.new(_key(), message, hashlib.sha256).hexdigest()


def token_hash(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def mask(email: str) -> str:
    from app.core.integrations.email_sender import mask_email

    return mask_email(email)


async def start_challenge(
    *, otps, db, purpose: str, email: str, now: datetime | None = None
) -> tuple[uuid.UUID, str]:
    """A new code for `email` (any older open code is ended), committed. Returns (challenge_id,
    code): the code goes into the e-mail and nowhere else. OtpRateLimited when this address may
    not get one now."""
    now = now or _now()
    e_hash = email_hash(email)
    recent = await otps.recent(purpose, e_hash, now - timedelta(seconds=settings.OTP_EMAIL_WINDOW_SECONDS))
    cooldown = timedelta(seconds=settings.OTP_RESEND_COOLDOWN_SECONDS)
    if recent and recent[0].created_at + cooldown > now:
        raise OtpRateLimited("cooldown", (recent[0].created_at + cooldown - now).total_seconds())
    if len(recent) >= settings.OTP_MAX_SENDS_PER_EMAIL:
        raise OtpRateLimited(
            "email_send_limit",
            _seconds_until_below(recent, lambda r: 1, settings.OTP_MAX_SENDS_PER_EMAIL, now),
        )
    if sum(r.failed_attempts for r in recent) >= settings.OTP_MAX_FAILURES_PER_EMAIL:
        raise OtpRateLimited(
            "email_failure_limit",
            _seconds_until_below(recent, lambda r: r.failed_attempts, settings.OTP_MAX_FAILURES_PER_EMAIL, now),
        )

    code = new_code()
    challenge_id = uuid.uuid4()
    await otps.invalidate_open(purpose, e_hash, now)
    await otps.add(
        challenge_id=challenge_id,
        purpose=purpose,
        email_hash=e_hash,
        code_hash=code_hash(purpose, e_hash, code),
        created_at=now,
        expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS),
        failed_attempts=0,
    )
    await db.commit()
    logger.info("[OTP] code issued purpose=%s email=%s", purpose, mask(email))
    return challenge_id, code


async def abandon_challenge(*, otps, db, challenge_id: uuid.UUID, now: datetime | None = None) -> None:
    """The e-mail could not be sent: end the code (nobody received it, it must not stay usable)."""
    await otps.invalidate(challenge_id, now or _now())
    await db.commit()


async def verify_code(
    *, otps, db, purpose: str, email: str, code: str, now: datetime | None = None
) -> str:
    """The one-time verification token when `code` is the open code of `email` for `purpose`.
    Otherwise OtpRejected with the reason (Mốc M5-2), so the user is told what to do:

      OTP_INVALID            wrong code, counted; details.remaining_attempts for THIS code
      OTP_TOO_MANY_ATTEMPTS  that wrong code was the last allowed one: the code is ended
      OTP_SUPERSEDED         the code of an older e-mail, replaced by a newer one (not counted)
      OTP_EXPIRED            too old, already used, or no code was requested
      OTP_RATE_LIMITED       too many wrong codes for this address; details.retry_after_seconds
    Committed (a wrong code is counted even though the request fails)."""
    now = now or _now()
    e_hash = email_hash(email)
    recent = await otps.recent(purpose, e_hash, now - timedelta(seconds=settings.OTP_EMAIL_WINDOW_SECONDS))
    max_failures = settings.OTP_MAX_FAILURES_PER_EMAIL
    if sum(r.failed_attempts for r in recent) >= max_failures:
        await db.rollback()
        logger.warning("[OTP] verify refused purpose=%s reason=email_failure_limit", purpose)
        wait = _seconds_until_below(recent, lambda r: r.failed_attempts, max_failures, now)
        raise OtpRejected("OTP_RATE_LIMITED", {"retry_after_seconds": max(1, int(-(-wait // 1)))})

    given = code_hash(purpose, e_hash, code)
    row = await otps.lock_open(purpose, e_hash, now)
    if row is not None and hmac.compare_digest(row.code_hash, given):
        token = secrets.token_urlsafe(32)
        row.verified_at = now
        row.token_hash = token_hash(token)
        row.token_expires_at = now + timedelta(seconds=settings.OTP_VERIFIED_TOKEN_TTL_SECONDS)
        await db.commit()
        logger.info("[OTP] code verified purpose=%s email=%s", purpose, mask(email))
        return token

    newest_id = recent[0].challenge_id if recent else None
    if any(
        r.challenge_id != newest_id
        and r.verified_at is None
        and r.failed_attempts < settings.OTP_MAX_FAILED_ATTEMPTS
        and hmac.compare_digest(r.code_hash, given)
        for r in recent
    ):
        # The code of an older e-mail: the user did nothing wrong but read the wrong message.
        await db.rollback()
        raise OtpRejected("OTP_SUPERSEDED")

    if row is not None:
        row.failed_attempts += 1
        remaining = max(0, settings.OTP_MAX_FAILED_ATTEMPTS - row.failed_attempts)
        if remaining == 0:
            row.invalidated_at = now
        await db.commit()
        logger.info("[OTP] wrong code purpose=%s remaining=%d", purpose, remaining)
        if remaining == 0:
            raise OtpRejected("OTP_TOO_MANY_ATTEMPTS", {"max_attempts": settings.OTP_MAX_FAILED_ATTEMPTS})
        raise OtpRejected("OTP_INVALID", {"remaining_attempts": remaining})

    # No open code: say why the newest one is not usable.
    await db.rollback()
    newest = recent[0] if recent else None
    if newest is not None and newest.failed_attempts >= settings.OTP_MAX_FAILED_ATTEMPTS:
        raise OtpRejected("OTP_TOO_MANY_ATTEMPTS", {"max_attempts": settings.OTP_MAX_FAILED_ATTEMPTS})
    raise OtpRejected("OTP_EXPIRED", {"code_ttl_seconds": settings.OTP_TTL_SECONDS})


async def token_usable(
    *, otps, purpose: str, email: str, token: str | None, now: datetime | None = None
) -> bool:
    """Read-only pre-check (before any side effect such as creating the Firebase user)."""
    if not token:
        return False
    return await otps.token_usable(purpose, email_hash(email), token_hash(token), now or _now())


async def verification_status(
    *, otps, purpose: str, email: str, token: str | None, now: datetime | None = None
) -> str:
    """Why a verification token can or cannot create the account (read only, Mốc M3b):
    "ok"; "not_verified" (no token, unknown, or a token of ANOTHER address or purpose: nothing is
    said about other addresses); "expired"; "used"."""
    if not token:
        return "not_verified"
    now = now or _now()
    row = await otps.by_token_hash(token_hash(token))
    if row is None or row.purpose != purpose or row.email_hash != email_hash(email):
        return "not_verified"
    if row.token_used_at is not None:
        return "used"
    if row.token_expires_at is None or row.token_expires_at <= now:
        return "expired"
    return "ok"


async def claim_token(
    *, otps, purpose: str, email: str, token: str | None, now: datetime | None = None
) -> bool:
    """Use the token up inside the CALLER's transaction (committed with the account or the
    registration, rolled back with it). Of two concurrent claims only one gets True."""
    if not token:
        return False
    return await otps.claim_token(purpose, email_hash(email), token_hash(token), now or _now())


def send_otp_via_email(to_email: str, code: str) -> bool:
    """Send the code by SMTP. FAIL CLOSED: False when SMTP is not configured or fails, so the
    route never says "sent" for an e-mail that was not. The only exception: DEBUG=true AND
    OTP_DEV_SIMULATION=true, logged loudly (the code itself is never logged)."""
    clean_email = normalize_email(to_email)
    from app.core.integrations.email_sender import refuse_if_blocked_sync

    if refuse_if_blocked_sync(clean_email, channel="otp"):
        return False

    smtp_user = (settings.SMTP_USER or os.getenv("SMTP_USER", "")).strip()
    smtp_password = (settings.SMTP_PASSWORD or os.getenv("SMTP_PASSWORD", "")).strip()
    smtp_host = (settings.SMTP_HOST or os.getenv("SMTP_HOST", "smtp.gmail.com")).strip()
    try:
        smtp_port = int(settings.SMTP_PORT or os.getenv("SMTP_PORT", 587))
    except (TypeError, ValueError):
        smtp_port = 587

    if not (smtp_user and smtp_password):
        if settings.dev_mode and settings.OTP_DEV_SIMULATION:
            logger.warning(
                "[OTP] DEV SIMULATION (DEBUG + OTP_DEV_SIMULATION): OTP e-mail NOT sent to %s; "
                "the code is not logged", mask(clean_email),
            )
            return True
        logger.error("[OTP] SMTP not configured (SMTP_USER / SMTP_PASSWORD): OTP e-mail NOT sent")
        return False

    ttl_minutes = max(1, -(-settings.OTP_TTL_SECONDS // 60))  # what the e-mail promises = the real TTL
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Mã xác thực đăng ký - Hệ thống Quản trị Gia phả MFGMS"  # no code in the subject
    msg["From"] = f"MFGMS System <{smtp_user}>"
    msg["To"] = clean_email
    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1e3a8a; text-align: center;">Xác Thực Địa Chỉ Gmail</h2>
        <p>Kính chào Quý khách,</p>
        <p>Bạn đang thực hiện thủ tục xác minh trên Hệ thống Quản trị Gia phả MFGMS. Mã xác thực OTP của bạn là:</p>
        <div style="background: #f0fdf4; border: 2px dashed #16a34a; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #15803d; margin: 20px 0; border-radius: 6px;">
            {code}
        </div>
        <p style="color: #64748b; font-size: 14px;">Mã xác thực có hiệu lực trong vòng <strong>{ttl_minutes} phút</strong> và chỉ dùng được một lần. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">Hệ thống Quản lý Gia phả Đa dòng họ MFGMS-AI</p>
    </div>
    """
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
    except Exception as exc:  # noqa: BLE001 - the class only: the message can echo addresses
        logger.error("[OTP] SMTP send failed: %s", type(exc).__name__)
        return False
    logger.info("[OTP] e-mail sent to %s", mask(clean_email))
    return True


# ----- shared by the two send/verify route pairs (member registration, Business registration) -----

OTP_UNAVAILABLE_MESSAGE = "Hệ thống gửi email OTP đang bận hoặc gặp lỗi. Vui lòng thử lại sau."


def _rate_limited_error(seconds: int):
    from app.core.errors import AppError
    from app.schemas.errors import ErrorCode

    return AppError(
        ErrorCode.OTP_RATE_LIMITED,
        f"Vui lòng thử lại sau {seconds} giây.",
        headers={"Retry-After": str(seconds)},
        details={"retry_after_seconds": seconds},
    )


async def send_code_or_raise(*, otps, db, purpose: str, email: str) -> None:
    """start_challenge + the e-mail (in a worker thread: SMTP blocks). AppError OTP_RATE_LIMITED
    (Retry-After + details.retry_after_seconds) when the address may not get a code now;
    PROVIDER_UNAVAILABLE when OTP or the e-mail is unavailable, and then the code is ended at once
    (nobody received it)."""
    import asyncio

    from app.core.errors import AppError
    from app.schemas.errors import ErrorCode

    try:
        challenge_id, code = await start_challenge(otps=otps, db=db, purpose=purpose, email=email)
    except OtpUnavailable:
        raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, OTP_UNAVAILABLE_MESSAGE) from None
    except OtpRateLimited as exc:
        raise _rate_limited_error(exc.retry_after) from None
    delivered = await asyncio.to_thread(send_otp_via_email, email, code)
    if not delivered:
        await abandon_challenge(otps=otps, db=db, challenge_id=challenge_id)
        raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, OTP_UNAVAILABLE_MESSAGE)


async def verify_code_or_raise(*, otps, db, purpose: str, email: str, code: str) -> str:
    """verify_code, or AppError with the specific OTP_* code and its numbers (Mốc M5-2)."""
    from app.core.errors import AppError
    from app.schemas.errors import ErrorCode

    try:
        return await verify_code(otps=otps, db=db, purpose=purpose, email=email, code=code)
    except OtpUnavailable:
        raise AppError(ErrorCode.PROVIDER_UNAVAILABLE, OTP_UNAVAILABLE_MESSAGE) from None
    except OtpRejected as exc:
        if exc.code == "OTP_RATE_LIMITED":
            raise _rate_limited_error(exc.details["retry_after_seconds"]) from None
        message = None
        if exc.code == "OTP_INVALID":
            message = f"Mã chưa đúng. Bạn còn {exc.details['remaining_attempts']} lần thử."
        raise AppError(ErrorCode(exc.code), message, details=exc.details or None) from None
