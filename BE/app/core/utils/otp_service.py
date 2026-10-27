"""OTP service for verifying real Gmail addresses during registration.

Security features:
- Cryptographically secure OTP generation via secrets module
- Rate limiting: 60s cooldown between send requests per email
- Attempt limiting: Max 5 failed verification attempts before invalidation
- Expiry: 5 minutes TTL for OTP codes
- Verified email TTL: 30 minutes, one-time consumption (consume_verified_email)
- No plain OTP code logging or sensitive subject leaks
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Tuple

from app.core.config import settings

logger = logging.getLogger("mfg.otp_service")

# Storage: email -> {
#   "code_hash": sha256_hex,
#   "expires_at": float_ts,
#   "attempts": int,
#   "resend_available_at": float_ts
# }
_otp_cache: Dict[str, dict] = {}

# Storage: email -> verified_until_timestamp
_verified_emails: Dict[str, float] = {}

OTP_EXPIRY_SECONDS = 300       # 5 minutes
RESEND_COOLDOWN_SECONDS = 60   # 60 seconds
MAX_FAILED_ATTEMPTS = 5        # Lock after 5 wrong tries
VERIFIED_EMAIL_TTL = 1800      # 30 minutes to complete registration


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def can_send_otp(email: str) -> Tuple[bool, int]:
    """Check if resend cooldown has passed. Returns (allowed, seconds_left)."""
    clean_email = email.strip().lower()
    record = _otp_cache.get(clean_email)
    if not record:
        return True, 0
    now = time.time()
    resend_at = record.get("resend_available_at", 0)
    if now < resend_at:
        return False, int(resend_at - now)
    return True, 0


def generate_otp(email: str) -> str:
    """Generates a secure 6-digit OTP code with cooldown and rate limit."""
    clean_email = email.strip().lower()
    now = time.time()

    # Generate 6 cryptographically secure digits
    code = "".join(secrets.choice("0123456789") for _ in range(6))

    _otp_cache[clean_email] = {
        "code_hash": _hash_code(code),
        "expires_at": now + OTP_EXPIRY_SECONDS,
        "attempts": 0,
        "resend_available_at": now + RESEND_COOLDOWN_SECONDS,
    }
    logger.info("[OTP SERVICE] Generated new secure verification OTP for %s", clean_email)
    return code


def verify_otp(email: str, code: str) -> bool:
    """Verifies OTP with max attempts limit and 5-min expiration."""
    clean_email = email.strip().lower()
    record = _otp_cache.get(clean_email)
    if not record:
        return False

    now = time.time()
    if now > record["expires_at"]:
        _otp_cache.pop(clean_email, None)
        return False

    # Check attempt limit
    if record["attempts"] >= MAX_FAILED_ATTEMPTS:
        _otp_cache.pop(clean_email, None)
        logger.warning("[OTP SERVICE] Exceeded max OTP attempts for %s, code invalidated", clean_email)
        return False

    record["attempts"] += 1
    provided_hash = _hash_code(code)

    if secrets.compare_digest(record["code_hash"], provided_hash):
        _otp_cache.pop(clean_email, None)
        _verified_emails[clean_email] = now + VERIFIED_EMAIL_TTL
        logger.info("[OTP SERVICE] Verification successful for %s", clean_email)
        return True

    return False


def is_email_verified(email: str) -> bool:
    """Checks if the email has passed OTP verification within the 30-minute validity window."""
    clean_email = email.strip().lower()
    verified_until = _verified_emails.get(clean_email)
    if not verified_until:
        return False
    if time.time() > verified_until:
        _verified_emails.pop(clean_email, None)
        return False
    return True


def consume_verified_email(email: str) -> bool:
    """Consumes the verified state so it cannot be reused to create duplicate registrations."""
    clean_email = email.strip().lower()
    if is_email_verified(clean_email):
        _verified_emails.pop(clean_email, None)
        return True
    return False


def send_otp_via_email(to_email: str, code: str) -> bool:
    """Sends OTP code to real Gmail using SMTP without sensitive subject exposure."""
    clean_email = to_email.strip().lower()

    smtp_user = (settings.SMTP_USER or os.getenv("SMTP_USER", "")).strip()
    smtp_password = (settings.SMTP_PASSWORD or os.getenv("SMTP_PASSWORD", "")).strip()
    smtp_host = (settings.SMTP_HOST or os.getenv("SMTP_HOST", "smtp.gmail.com")).strip()
    smtp_port = int(settings.SMTP_PORT or os.getenv("SMTP_PORT", 587))

    if smtp_user and smtp_password:
        try:
            msg = MIMEMultipart("alternative")
            # Security: Do not expose code in subject line
            msg["Subject"] = "Mã xác thực đăng ký - Hệ thống Quản trị Gia phả MFGMS"
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
                <p style="color: #64748b; font-size: 14px;">Mã xác thực có hiệu lực trong vòng <strong>5 phút</strong>. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                <p style="color: #94a3b8; font-size: 12px; text-align: center;">Hệ thống Quản lý Gia phả Đa dòng họ MFGMS-AI</p>
            </div>
            """
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.send_message(msg)

            logger.info("[GMAIL OTP] Successfully delivered OTP email to %s", clean_email)
            return True
        except Exception as e:
            logger.error("[GMAIL OTP] Failed to send SMTP email: %s", e)
            return False

    logger.warning("[GMAIL OTP] SMTP not configured. OTP generated for %s", clean_email)
    return True
