"""Outgoing e-mail over SMTP: the temporary password of an Owner (Mục E6) and the password-reset link
(Mốc M4b).

Mốc M5-0: no e-mail ever goes to a domain of BLOCKED_EMAIL_DOMAINS (default giapha.com, the Owners'
login identifiers, a domain the team does not own). Every sending function asks refuse_if_blocked()
/ refuse_if_blocked_sync() first: FAILED with error "blocked_domain", one audit row
email.blocked_domain (masked address), never an exception.

SMTP settings (BE/.env): SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 587, STARTTLS),
SMTP_USER (the sending address, also the login), SMTP_PASSWORD (for Gmail: an App Password).
Without SMTP_USER/SMTP_PASSWORD nothing is sent and the result is FAILED.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
import os
import smtplib
from typing import Awaitable, Callable, Literal, Protocol
from html import escape as html_escape

from app.core.config import settings

logger = logging.getLogger("mfg.email_sender")

DeliveryStatus = Literal["QUEUED", "SENT", "FAILED", "BOUNCED"]


@dataclass(frozen=True)
class EmailDeliveryResult:
    """status is None when nothing was sent (the Noop sender). error: on FAILED, a code that holds
    no address or content (the exception class name, or "smtp_not_configured")."""

    status: DeliveryStatus | None
    error: str | None = None


# ----- Mốc M5-0: domains no e-mail is sent to -----

BLOCKED_DOMAIN_AUDIT_ACTION = "email.blocked_domain"


def mask_email(email: str) -> str:
    """a***@gmail.com: the first character and the domain only (audit rows, never the address)."""
    local, _, domain = (email or "").strip().partition("@")
    return f"{local[:1]}***@{domain}" if local and domain else "***"


def blocked_domain(address: str) -> str | None:
    """The entry of BLOCKED_EMAIL_DOMAINS that `address` falls under (the domain itself or any
    sub-domain, any letter case), or None. "a@GiaPha.com", "a@mail.giapha.com." -> "giapha.com"."""
    address = (address or "").strip()
    if "@" not in address:
        return None
    domain = address.rsplit("@", 1)[1].strip().lower().rstrip(".")
    for blocked in settings.blocked_email_domains:
        if domain == blocked or domain.endswith("." + blocked):
            return blocked
    return None


async def _write_blocked_audit(*, email: str, domain: str, channel: str) -> None:
    """One audit row in its OWN session (the caller's transaction, if any, is not touched)."""
    from app.db.postgres import async_session_maker
    from app.models.user_access.repository import UserAccessRepository

    async with async_session_maker() as session:
        await UserAccessRepository(session).add_audit_log(
            actor_id=None,
            action=BLOCKED_DOMAIN_AUDIT_ACTION,
            entity_type="email",
            entity_id=None,
            old_data=None,
            new_data={"email": email, "domain": domain, "channel": channel},
            ip_address=None,
            occurred_at=datetime.now(timezone.utc),
        )
        await session.commit()


# Replaced in tests. Receives the MASKED address only.
blocked_audit_writer: Callable[..., Awaitable[None]] = _write_blocked_audit
_pending_audits: set[asyncio.Task] = set()


async def _audit_blocked_quietly(*, email: str, domain: str, channel: str) -> None:
    try:
        await blocked_audit_writer(email=mask_email(email), domain=domain, channel=channel)
    except Exception as exc:  # noqa: BLE001 - refusing the e-mail must never break the caller
        logger.error("[EMAIL SENDER] blocked_domain audit failed: %s", type(exc).__name__)


def _log_refused(domain: str, channel: str) -> None:
    logger.warning("[EMAIL SENDER] refused channel=%s reason=blocked_domain domain=%s", channel, domain)


async def refuse_if_blocked(to_email: str, *, channel: str) -> EmailDeliveryResult | None:
    """None when `to_email` may be mailed; otherwise FAILED/blocked_domain, after the audit row."""
    domain = blocked_domain(to_email)
    if domain is None:
        return None
    _log_refused(domain, channel)
    await _audit_blocked_quietly(email=to_email, domain=domain, channel=channel)
    return EmailDeliveryResult(status="FAILED", error="blocked_domain")


def refuse_if_blocked_sync(to_email: str, *, channel: str) -> bool:
    """For the synchronous senders (OTP): True when refused. They run inside async routes, so the
    audit row is written by a task on the running loop; without a loop it is logged only."""
    domain = blocked_domain(to_email)
    if domain is None:
        return False
    _log_refused(domain, channel)
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning("[EMAIL SENDER] blocked_domain audit skipped: no event loop (channel=%s)", channel)
        return True
    task = loop.create_task(_audit_blocked_quietly(email=to_email, domain=domain, channel=channel))
    _pending_audits.add(task)  # keep a reference until it is done
    task.add_done_callback(_pending_audits.discard)
    return True


class EmailSender(Protocol):
    async def send_password_reset_link(
        self, *, to_email: str, display_name: str, reset_link: str
    ) -> EmailDeliveryResult: ...

    async def send_owner_temporary_password(
        self,
        *,
        to_email: str,
        display_name: str,
        temporary_password: str,
        expires_at: datetime,
        clan_name: str | None = None,
        account_email: str | None = None,
    ) -> EmailDeliveryResult: ...


class SmtpEmailSender:
    """Sends the temporary password and login credentials to the Clan Owner via Firebase Auth
    and/or SMTP.
    """

    __slots__ = ()

    async def send_password_reset_link(
        self, *, to_email: str, display_name: str, reset_link: str
    ) -> EmailDeliveryResult:
        """The forgot-password e-mail (Mốc M4b). The link holds a live reset code: it is never
        logged; failures log the exception class only."""
        refused = await refuse_if_blocked(to_email, channel="password_reset_link")
        if refused is not None:
            return refused
        subject = "[Gia Phả Liên Họ] Đặt lại mật khẩu"
        html = f"""
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; color: #1e293b;">
            <h2 style="color: #b45309; margin-top: 0;">Đặt lại mật khẩu</h2>
            <p>Xin chào <strong>{html_escape(display_name)}</strong>,</p>
            <p>Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút dưới đây để tạo mật khẩu mới:</p>
            <p style="text-align: center; margin: 28px 0;">
                <a href="{html_escape(reset_link)}" style="background-color: #b45309; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; border-radius: 6px; display: inline-block;">Đặt lại mật khẩu</a>
            </p>
            <p style="font-size: 13px; color: #64748b;">Liên kết chỉ dùng được <strong>một lần</strong> và sẽ hết hạn sau một thời gian ngắn.
            Nếu bạn không yêu cầu, hãy bỏ qua email này: mật khẩu hiện tại vẫn giữ nguyên.</p>
        </div>
        """
        error = await asyncio.to_thread(_smtp_send, to_email=to_email, subject=subject, html=html)
        return EmailDeliveryResult(status="SENT", error=None) if error is None else EmailDeliveryResult(
            status="FAILED", error=error
        )

    async def send_owner_temporary_password(
        self,
        *,
        to_email: str,
        display_name: str,
        temporary_password: str,
        expires_at: datetime,
        clan_name: str | None = None,
        account_email: str | None = None,
    ) -> EmailDeliveryResult:
        refused = await refuse_if_blocked(to_email, channel="owner_temporary_password")
        if refused is not None:
            return refused
        return await asyncio.to_thread(
            self._send_sync,
            to_email=to_email,
            display_name=display_name,
            temporary_password=temporary_password,
            expires_at=expires_at,
            clan_name=clan_name,
            account_email=account_email,
        )

    def _send_sync(
        self,
        *,
        to_email: str,
        display_name: str,
        temporary_password: str,
        expires_at: datetime,
        clan_name: str | None = None,
        account_email: str | None = None,
    ) -> EmailDeliveryResult:
        # Check SMTP configuration
        smtp_user = (settings.SMTP_USER or os.getenv("SMTP_USER", "")).strip()
        smtp_password = (settings.SMTP_PASSWORD or os.getenv("SMTP_PASSWORD", "")).strip()
        smtp_host = (settings.SMTP_HOST or os.getenv("SMTP_HOST", "smtp.gmail.com")).strip()
        port_val = settings.SMTP_PORT or os.getenv("SMTP_PORT", 587)
        try:
            smtp_port = int(port_val)
        except (ValueError, TypeError):
            smtp_port = 587

        frontend_url = getattr(settings, "FRONTEND_URL", os.getenv("FRONTEND_URL", "http://localhost:5173"))
        login_url = f"{frontend_url}/login"

        smtp_sent = False
        if smtp_password and smtp_user:
            try:
                msg = MIMEMultipart("alternative")
                family_str = f" cho {clan_name}" if clan_name else ""
                msg["Subject"] = f"🏛️ [Gia Phả Liên Họ] Thông tin tài khoản Quản trị dòng họ{family_str}"
                msg["From"] = f"Hệ thống Gia Phả Liên Họ <{smtp_user}>"
                msg["To"] = to_email

                login_account = account_email or to_email
                expires_str = expires_at.strftime("%H:%M ngày %d/%m/%Y (UTC)")

                html_content = f"""
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 620px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
                    <div style="text-align: center; margin-bottom: 25px;">
                        <h1 style="color: #b45309; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">Hệ Thống Gia Phả Liên Họ</h1>
                        <p style="color: #64748b; font-size: 14px; margin-top: 5px;">Thông báo cấp tài khoản Quản trị không gian Dòng họ</p>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #d97706; padding: 15px 20px; border-radius: 6px; margin-bottom: 20px;">
                        <p style="margin: 0; font-size: 15px; color: #92400e;">
                            Kính gửi Trưởng tộc / Người đại diện: <strong>{display_name}</strong>,<br>
                            Hồ sơ mở không gian số hóa gia phả{family_str} đã được <strong>Phê duyệt thành công</strong>!
                        </p>
                    </div>

                    <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                        Dưới đây là thông tin tài khoản quản trị Trưởng tộc (Business Owner) được khởi tạo bởi ban quản trị hệ thống:
                    </p>

                    <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 18px 20px; margin: 20px 0;">
                        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 6px 0; color: #64748b; width: 160px;">Tài khoản đăng nhập:</td>
                                <td style="padding: 6px 0; font-weight: 600; color: #0f172a; font-size: 16px;">{login_account}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #64748b;">Mật khẩu tạm thời:</td>
                                <td style="padding: 6px 0; font-family: Consolas, monospace; font-size: 18px; font-weight: bold; color: #dc2626; letter-spacing: 1px;">
                                    {temporary_password}
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #64748b;">Thời hạn mật khẩu:</td>
                                <td style="padding: 6px 0; color: #d97706; font-size: 13px;">72 giờ (kết thúc lúc: {expires_str})</td>
                            </tr>
                        </table>
                    </div>

                    <div style="background-color: #eff6ff; border-radius: 6px; padding: 12px 16px; margin-bottom: 25px; font-size: 13px; color: #1e40af;">
                        ⚠️ <strong>Lưu ý bảo mật:</strong> Đây là mật khẩu tạm thời. Hệ thống sẽ yêu cầu bạn <strong>đổi mật khẩu mới</strong> ngay ở lần đăng nhập đầu tiên.
                    </div>

                    <div style="text-align: center; margin-bottom: 30px;">
                        <a href="{login_url}" style="background-color: #b45309; color: #ffffff; text-decoration: none; padding: 12px 30px; font-weight: 600; font-size: 15px; border-radius: 6px; display: inline-block;">
                            Đăng Nhập Quản Trị Dòng Họ →
                        </a>
                    </div>

                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
                        Email này được gửi tự động từ Ban quản trị Hệ thống Gia Phả Liên Họ.<br>
                        Nếu cần hỗ trợ kỹ thuật, vui lòng liên hệ ban quản trị hệ thống.
                    </p>
                </div>
                """

                msg.attach(MIMEText(html_content, "html", "utf-8"))

                with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_password)
                    server.sendmail(smtp_user, [to_email], msg.as_string())

                smtp_sent = True
                logger.info("[EMAIL SENDER] Owner credentials e-mail sent to %s", mask_email(to_email))
            except Exception as e:  # noqa: BLE001 - the class only: the message can echo addresses
                logger.error("[EMAIL SENDER ERROR] Owner credentials e-mail failed: %s", type(e).__name__)
                return EmailDeliveryResult(status="FAILED", error=type(e).__name__)

        if smtp_sent:
            return EmailDeliveryResult(status="SENT")

        # The temporary password is NEVER logged (it used to be printed here in clear text).
        logger.warning("[EMAIL SENDER] Owner credentials e-mail NOT sent (SMTP not configured)")
        return EmailDeliveryResult(status="FAILED", error="smtp_not_configured")


def smtp_settings() -> tuple[str, int, str, str]:
    """(host, port, user, password) from settings / environment, defaults as before."""
    user = (settings.SMTP_USER or os.getenv("SMTP_USER", "")).strip()
    password = (settings.SMTP_PASSWORD or os.getenv("SMTP_PASSWORD", "")).strip()
    host = (settings.SMTP_HOST or os.getenv("SMTP_HOST", "smtp.gmail.com")).strip()
    try:
        port = int(settings.SMTP_PORT or os.getenv("SMTP_PORT", 587))
    except (ValueError, TypeError):
        port = 587
    return host, port, user, password


def _smtp_send(*, to_email: str, subject: str, html: str) -> str | None:
    """One HTML e-mail over SMTP + STARTTLS. None when sent; otherwise "smtp_not_configured" or the
    exception class name. Logs no address, no content: only whether it worked and that class."""
    host, port, user, password = smtp_settings()
    if not (user and password):
        logger.warning("[EMAIL SENDER] SMTP not configured (SMTP_USER / SMTP_PASSWORD): e-mail not sent")
        return "smtp_not_configured"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Hệ thống Gia Phả Liên Họ <{user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html", "utf-8"))
    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(user, [to_email], msg.as_string())
    except Exception as exc:  # noqa: BLE001 - the caller decides; the message may hold addresses
        logger.error("[EMAIL SENDER] SMTP send failed: %s", type(exc).__name__)
        return type(exc).__name__
    return None


class NoopEmailSender:
    """Sends nothing. Holds no state, so the password cannot be kept by accident."""

    __slots__ = ()

    async def send_password_reset_link(
        self, *, to_email: str, display_name: str, reset_link: str
    ) -> EmailDeliveryResult:
        refused = await refuse_if_blocked(to_email, channel="password_reset_link")
        return refused or EmailDeliveryResult(status=None)

    async def send_owner_temporary_password(
        self,
        *,
        to_email: str,
        display_name: str,
        temporary_password: str,
        expires_at: datetime,
        clan_name: str | None = None,
        account_email: str | None = None,
    ) -> EmailDeliveryResult:
        refused = await refuse_if_blocked(to_email, channel="owner_temporary_password")
        return refused or EmailDeliveryResult(status=None)



_sender: EmailSender = SmtpEmailSender()


def get_email_sender() -> EmailSender:
    """FastAPI dependency. Tests override it."""
    return _sender
