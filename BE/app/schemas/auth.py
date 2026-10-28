"""Auth API contracts (plan section 6). Types only, no endpoints yet.

Secrets (oob_code, passwords) are SecretStr: never
trimmed and masked in repr/logs. Call .get_secret_value() only at the adapter.
"""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import Field, SecretStr

from app.schemas.common import (
    Email,
    Password,
    RequestModel,
    ResponseModel,
    SecretToken,
    UtcDatetime,
)

UserStatus = Literal["PENDING", "ACTIVE", "LOCKED", "SUSPENDED", "DISABLED"]
ClanStatus = Literal["PENDING", "ACTIVE", "SUSPENDED", "EXPIRED", "LOCKED", "INACTIVE"]
MembershipStatus = Literal["INVITED", "ACTIVE", "SUSPENDED", "REVOKED"]


# ----- POST /auth/login (password checked against credential_metadata.password_hash) -----


class LoginRequest(RequestModel):
    # Named `email` for the FE; a username is accepted too. No password policy here: a login
    # must never answer "too weak" (422) for an existing password, only right or wrong.
    email: str = Field(min_length=1, max_length=255, description="E-mail or username.")
    password: SecretStr = Field(min_length=1, max_length=4096)


class SessionUser(ResponseModel):
    user_id: uuid.UUID
    display_name: str
    email: str
    status: UserStatus


class SessionCreateResponse(ResponseModel):
    """POST /auth/login and POST /auth/change-password (200). access_token is returned exactly
    once; only its SHA-256 is stored."""

    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_at: UtcDatetime
    user: SessionUser
    requires_password_change: bool


# ----- GET /auth/me -----


class MembershipSummary(ResponseModel):
    """One clan the user belongs to, with roles/permissions effective in that clan."""

    clan_id: uuid.UUID
    clan_name: str
    clan_status: ClanStatus
    membership_status: MembershipStatus
    roles: list[str] = Field(default_factory=list, description="Role codes in this clan.")
    permissions: list[str] = Field(
        default_factory=list, description="Permission codes effective in this clan."
    )


class MeResponse(ResponseModel):
    """200. Works for restricted (password-change) sessions too."""

    user_id: uuid.UUID
    display_name: str
    email: str
    username: str | None = None
    status: UserStatus
    memberships: list[MembershipSummary]
    permissions: list[str] = Field(
        description="System-scope permission codes (roles with clan_id = NULL)."
    )
    requires_password_change: bool


# ----- POST /auth/logout -> 204, no body -----


# ----- POST /auth/password-reset/request -----


class PasswordResetRequest(RequestModel):
    email: Email


class PasswordResetRequestAccepted(ResponseModel):
    """202. Same message whether or not the email exists."""

    message: str = "If the account exists, a password reset link has been sent."


# ----- POST /auth/password-reset/confirm -> 204 -----


class PasswordResetConfirmRequest(RequestModel):
    oob_code: SecretToken = Field(description="Firebase action code from the reset link.")
    new_password: Password


# ----- POST /auth/change-password -> 200 SessionCreateResponse (a new session) -----


class ChangePasswordRequest(RequestModel):
    # Checked against password_hash with bcrypt; no policy on it (it is an existing password).
    current_password: SecretStr = Field(min_length=1, max_length=4096)
    # The shared policy (app.core.security.password_hash.check_password_policy) runs here.
    new_password: Password
