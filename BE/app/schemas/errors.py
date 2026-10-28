"""Error envelope and error codes (plan section 6, "Quy ?????c validation v?? l???i").

Envelope: {"error": {"code": "...", "message": "...", "request_id": "...", "details": {...}?}}
"details" is present only when the error carries numbers the FE needs (Mốc M5-2: OTP attempts
left, seconds to wait); never user data.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class ErrorCode(StrEnum):
    # 400 - malformed request outside schema validation
    BAD_REQUEST = "BAD_REQUEST"
    # 400 - password reset oob_code (plan section 6: wrong/expired code -> 400)
    RESET_CODE_INVALID = "RESET_CODE_INVALID"
    RESET_CODE_EXPIRED = "RESET_CODE_EXPIRED"
    # 400 - e-mail OTP of the registrations (Mốc M5-2), one code per situation
    OTP_INVALID = "OTP_INVALID"  # wrong code; details.remaining_attempts for THIS code
    OTP_EXPIRED = "OTP_EXPIRED"  # too old, already used, or no code was requested
    OTP_TOO_MANY_ATTEMPTS = "OTP_TOO_MANY_ATTEMPTS"  # ended after too many wrong codes
    OTP_SUPERSEDED = "OTP_SUPERSEDED"  # a newer code was sent; this one no longer works
    # 400 - POST /auth/register-public: the one-time verification token (Mốc M3b)
    EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED"  # no token, or not one for this Gmail
    VERIFICATION_EXPIRED = "VERIFICATION_EXPIRED"  # verified too long ago; details.verification_ttl_seconds
    VERIFICATION_USED = "VERIFICATION_USED"  # the token already created an account

    # 401 - not authenticated
    UNAUTHENTICATED = "UNAUTHENTICATED"
    INVALID_ID_TOKEN = "INVALID_ID_TOKEN"
    SESSION_INVALID = "SESSION_INVALID"
    RECENT_LOGIN_REQUIRED = "RECENT_LOGIN_REQUIRED"
    # POST /auth/login: one answer for unknown identifier, wrong password and missing hash
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"

    # 403 - authenticated but not allowed
    FORBIDDEN = "FORBIDDEN"
    ACCOUNT_BLOCKED = "ACCOUNT_BLOCKED"
    # POST /auth/login: too many wrong passwords in a row, locked for a while
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED"
    TEMPORARY_PASSWORD_EXPIRED = "TEMPORARY_PASSWORD_EXPIRED"

    # 404 - resource does not exist or is not visible to the caller
    NOT_FOUND = "NOT_FOUND"

    # 405
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"

    # 409 - state conflict
    STATE_CONFLICT = "STATE_CONFLICT"
    DUPLICATE_RESOURCE = "DUPLICATE_RESOURCE"
    # Public Business registration: this clan (same name + origin, normalized) is already held by
    # a clan or a registration in progress. Nothing about the other clan is returned (Mốc M5c).
    DUPLICATE_CLAN = "DUPLICATE_CLAN"
    # Self-registration: the Gmail already has an account (in the DB, or at Firebase). One answer
    # for both, nothing else about the account (Mốc M5-3).
    EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED"
    # Self-registration: Firebase already has this Gmail but the DB has no user (an orphan account).
    # Neither login nor password reset can help: only an administrator can.
    EMAIL_ACCOUNT_NEEDS_ADMIN = "EMAIL_ACCOUNT_NEEDS_ADMIN"
    IDEMPOTENCY_KEY_CONFLICT = "IDEMPOTENCY_KEY_CONFLICT"

    # 422 - input validation
    VALIDATION_ERROR = "VALIDATION_ERROR"

    # 429 - rate limit
    RATE_LIMITED = "RATE_LIMITED"
    # e-mail OTP: too many codes or wrong codes for this address; details.retry_after_seconds
    OTP_RATE_LIMITED = "OTP_RATE_LIMITED"

    # 500 - unexpected
    INTERNAL_ERROR = "INTERNAL_ERROR"

    # 503 - dependency down (Firebase, DB, email provider)
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE"


ERROR_HTTP_STATUS: dict[ErrorCode, int] = {
    ErrorCode.BAD_REQUEST: 400,
    ErrorCode.RESET_CODE_INVALID: 400,
    ErrorCode.RESET_CODE_EXPIRED: 400,
    ErrorCode.OTP_INVALID: 400,
    ErrorCode.OTP_EXPIRED: 400,
    ErrorCode.OTP_TOO_MANY_ATTEMPTS: 400,
    ErrorCode.OTP_SUPERSEDED: 400,
    ErrorCode.EMAIL_NOT_VERIFIED: 400,
    ErrorCode.VERIFICATION_EXPIRED: 400,
    ErrorCode.VERIFICATION_USED: 400,
    ErrorCode.UNAUTHENTICATED: 401,
    ErrorCode.INVALID_ID_TOKEN: 401,
    ErrorCode.SESSION_INVALID: 401,
    ErrorCode.RECENT_LOGIN_REQUIRED: 401,
    ErrorCode.AUTHENTICATION_FAILED: 401,
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.ACCOUNT_BLOCKED: 403,
    ErrorCode.ACCOUNT_LOCKED: 403,
    ErrorCode.PASSWORD_CHANGE_REQUIRED: 403,
    ErrorCode.TEMPORARY_PASSWORD_EXPIRED: 403,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.METHOD_NOT_ALLOWED: 405,
    ErrorCode.STATE_CONFLICT: 409,
    ErrorCode.DUPLICATE_RESOURCE: 409,
    ErrorCode.DUPLICATE_CLAN: 409,
    ErrorCode.EMAIL_ALREADY_REGISTERED: 409,
    ErrorCode.EMAIL_ACCOUNT_NEEDS_ADMIN: 409,
    ErrorCode.IDEMPOTENCY_KEY_CONFLICT: 409,
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.RATE_LIMITED: 429,
    ErrorCode.OTP_RATE_LIMITED: 429,
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.PROVIDER_UNAVAILABLE: 503,
    ErrorCode.DATABASE_UNAVAILABLE: 503,
}

# Generic, non-revealing default messages. FE should branch on `code`, not `message`.
DEFAULT_ERROR_MESSAGE: dict[ErrorCode, str] = {
    ErrorCode.BAD_REQUEST: "Bad request.",
    ErrorCode.RESET_CODE_INVALID: "The password reset code is invalid.",
    ErrorCode.RESET_CODE_EXPIRED: "The password reset code has expired.",
    ErrorCode.OTP_INVALID: "Mã xác thực chưa đúng.",
    ErrorCode.OTP_EXPIRED: "Mã xác thực đã hết hạn. Vui lòng gửi mã mới.",
    ErrorCode.OTP_TOO_MANY_ATTEMPTS: "Bạn đã nhập sai quá nhiều lần. Vui lòng gửi mã mới.",
    ErrorCode.OTP_SUPERSEDED: "Mã này đã được thay bằng mã mới hơn. Vui lòng dùng mã trong thư mới nhất.",
    ErrorCode.EMAIL_NOT_VERIFIED: (
        "Gmail chưa được xác thực bằng mã OTP. Vui lòng gửi mã và xác thực trước khi tạo tài khoản."
    ),
    ErrorCode.VERIFICATION_EXPIRED: "Phiên xác thực Gmail đã hết hạn. Vui lòng xác thực lại bằng mã mới.",
    ErrorCode.VERIFICATION_USED: "Phiên xác thực Gmail này đã được sử dụng. Vui lòng xác thực lại bằng mã mới.",
    ErrorCode.UNAUTHENTICATED: "Authentication is required.",
    ErrorCode.INVALID_ID_TOKEN: "The identity token is invalid or revoked.",
    ErrorCode.SESSION_INVALID: "The session is invalid, expired or revoked.",
    ErrorCode.RECENT_LOGIN_REQUIRED: "Please sign in again to continue.",
    ErrorCode.AUTHENTICATION_FAILED: "Email/tên đăng nhập hoặc mật khẩu không đúng.",
    ErrorCode.FORBIDDEN: "You do not have permission to perform this action.",
    ErrorCode.ACCOUNT_BLOCKED: "This account cannot be used.",
    ErrorCode.ACCOUNT_LOCKED: "Tài khoản tạm thời bị khóa do đăng nhập sai nhiều lần.",
    ErrorCode.PASSWORD_CHANGE_REQUIRED: "You must change your password first.",
    ErrorCode.TEMPORARY_PASSWORD_EXPIRED: "The temporary password has expired.",
    ErrorCode.NOT_FOUND: "Resource not found.",
    ErrorCode.METHOD_NOT_ALLOWED: "Method not allowed.",
    ErrorCode.STATE_CONFLICT: "The resource state has changed.",
    ErrorCode.DUPLICATE_RESOURCE: "The resource already exists.",
    ErrorCode.DUPLICATE_CLAN: (
        "Dòng họ này (cùng tên và quê gốc) đã được đăng ký trên hệ thống. Nếu bạn thuộc dòng họ này, "
        "vui lòng liên hệ Trưởng tộc hoặc quản trị viên."
    ),
    ErrorCode.EMAIL_ALREADY_REGISTERED: (
        "Gmail này đã được đăng ký. Hãy đăng nhập hoặc dùng chức năng quên mật khẩu."
    ),
    ErrorCode.EMAIL_ACCOUNT_NEEDS_ADMIN: (
        "Gmail này đã có tài khoản trên hệ thống nhưng chưa được kích hoạt. Vui lòng liên hệ quản trị viên."
    ),
    ErrorCode.IDEMPOTENCY_KEY_CONFLICT: "Idempotency-Key was reused with a different payload.",
    ErrorCode.VALIDATION_ERROR: "Invalid input.",
    ErrorCode.RATE_LIMITED: "Too many requests. Please try again later.",
    ErrorCode.OTP_RATE_LIMITED: "Địa chỉ email này tạm thời không thể nhận hoặc xác thực mã. Vui lòng thử lại sau.",
    ErrorCode.INTERNAL_ERROR: "An unexpected error occurred.",
    ErrorCode.PROVIDER_UNAVAILABLE: "An external service is temporarily unavailable.",
    ErrorCode.DATABASE_UNAVAILABLE: "The database is temporarily unavailable.",
}

# Fallback code when a plain HTTPException (no ErrorCode) is raised.
STATUS_DEFAULT_CODE: dict[int, ErrorCode] = {
    400: ErrorCode.BAD_REQUEST,
    401: ErrorCode.UNAUTHENTICATED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.METHOD_NOT_ALLOWED,
    409: ErrorCode.STATE_CONFLICT,
    422: ErrorCode.VALIDATION_ERROR,
    429: ErrorCode.RATE_LIMITED,
    500: ErrorCode.INTERNAL_ERROR,
    503: ErrorCode.PROVIDER_UNAVAILABLE,
}


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str
    request_id: str
    # Omitted from the JSON when None (error_response dumps with exclude_none). Numbers (OTP),
    # or "fields": the request fields that failed validation (VALIDATION_ERROR, Mốc M5c).
    details: dict[str, int | list[str]] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
