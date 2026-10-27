"""Firebase Auth REST: the password-reset code from the e-mail link (Mốc M4).

Endpoint (Identity Toolkit v1, "Firebase Auth REST API"):
    POST https://identitytoolkit.googleapis.com/v1/accounts:resetPassword
      {"oobCode": ...}                    -> verifies the code, returns {"email", "requestType"};
                                             the code is NOT used up
      {"oobCode": ..., "newPassword": ...} -> sets the Firebase password; the code is used up
Errors come back as {"error": {"message": "EXPIRED_OOB_CODE" | "INVALID_OOB_CODE" |
"USER_DISABLED" | "WEAK_PASSWORD : ..." | ...}}.

- The Web API key (settings.FIREBASE_API_KEY) goes in the X-Goog-Api-Key header, not in the URL,
  so it never shows up in a logged request line. No key -> ProviderUnavailable (fail closed).
- Every call is async (httpx) with an explicit timeout (FIREBASE_CALL_TIMEOUT_SECONDS).
- Nothing here logs or raises with the code, the password or the response body.
"""

from __future__ import annotations

import logging
from typing import Protocol

import httpx

from app.core.integrations.firebase import PasswordRejected, ProviderUnavailable

RESET_PASSWORD_URL = "https://identitytoolkit.googleapis.com/v1/accounts:resetPassword"

logger = logging.getLogger("mfg.firebase")


class ResetCodeInvalid(Exception):
    """Wrong, already used, or for a disabled / deleted Firebase user."""


class ResetCodeExpired(Exception):
    """The code is valid but too old."""


class PasswordResetProvider(Protocol):
    async def verify_reset_code(self, oob_code: str) -> str: ...

    async def confirm_reset(self, oob_code: str, new_password: str) -> None: ...


class FirebasePasswordReset:
    def __init__(
        self,
        api_key: str,
        timeout_seconds: float,
        *,
        transport: httpx.AsyncBaseTransport | None = None,  # tests: httpx.MockTransport
    ) -> None:
        self._api_key = (api_key or "").strip()
        self._timeout = float(timeout_seconds)
        self._transport = transport

    async def verify_reset_code(self, oob_code: str) -> str:
        """The e-mail address the code was issued for. The code stays usable."""
        data = await self._post({"oobCode": oob_code}, step="verify")
        if data.get("requestType") not in (None, "PASSWORD_RESET"):
            raise ResetCodeInvalid()  # an e-mail verification code etc.
        email = data.get("email")
        if not isinstance(email, str) or not email:
            raise ProviderUnavailable("reset_response_without_email")
        return email

    async def confirm_reset(self, oob_code: str, new_password: str) -> None:
        """Set the Firebase password with the code (uses it up)."""
        await self._post({"oobCode": oob_code, "newPassword": new_password}, step="confirm")

    async def _post(self, body: dict, *, step: str) -> dict:
        """One call. Logs ONE line: step, HTTP status, Firebase's error code (e.g. INVALID_OOB_CODE)
        or requestType, and the request id. Never the code, the password, the e-mail or the key."""
        from app.core.middleware.request_id import get_request_id

        def log(level: int, status: object, outcome: str) -> None:
            logger.log(
                level, "firebase.reset_password step=%s http_status=%s outcome=%s request_id=%s",
                step, status, outcome, get_request_id(),
            )

        if not self._api_key:
            log(logging.WARNING, "-", "api_key_not_configured")
            raise ProviderUnavailable("api_key_not_configured")
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                resp = await client.post(
                    RESET_PASSWORD_URL, json=body, headers={"X-Goog-Api-Key": self._api_key}
                )
        except httpx.TimeoutException:
            log(logging.WARNING, "-", "timeout")
            raise ProviderUnavailable("timeout") from None
        except httpx.HTTPError as exc:
            log(logging.WARNING, "-", f"network:{type(exc).__name__}")
            raise ProviderUnavailable("network") from None
        try:
            data = resp.json()
        except ValueError:
            log(logging.WARNING, resp.status_code, "bad_response")
            raise ProviderUnavailable("bad_response") from None
        if resp.status_code == 200 and isinstance(data, dict):
            log(logging.INFO, 200, f"ok requestType={data.get('requestType')}")
            return data

        message = ""
        if isinstance(data, dict) and isinstance(data.get("error"), dict):
            message = str(data["error"].get("message", ""))
        code = message.split(":")[0].strip()  # "WEAK_PASSWORD : Password should be ..."
        # Firebase's codes are UPPER_SNAKE words; anything else (free text) is not logged as is.
        safe = code if code.replace("_", "").isalnum() and code.isupper() else "unrecognized_error"
        log(logging.WARNING, resp.status_code, safe)
        if code == "EXPIRED_OOB_CODE":
            raise ResetCodeExpired()
        if code in ("INVALID_OOB_CODE", "USER_DISABLED", "USER_NOT_FOUND"):
            raise ResetCodeInvalid()
        if code == "WEAK_PASSWORD":
            raise PasswordRejected()
        # Bad API key, quota, 5xx...: our side or Firebase's, never the user's code.
        raise ProviderUnavailable(f"firebase_http_{resp.status_code}")


def get_password_reset_provider() -> PasswordResetProvider:
    """FastAPI dependency (tests replace it): reads the settings on every call."""
    from app.core.config import settings

    return FirebasePasswordReset(settings.FIREBASE_API_KEY, settings.FIREBASE_CALL_TIMEOUT_SECONDS)
