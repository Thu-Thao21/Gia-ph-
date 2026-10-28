"""The Gmail registry rules (Mốc M5): one real Gmail registers ONCE, for any kind of account.

Table gmail_registry (migration 0008): one ACTIVE row per normalized address (partial unique index
uq_gmail_registry_active_email), written in the SAME transaction as the user / registration it
belongs to, so of two concurrent registrations only one wins.

owner_type:
  member                 a self-registered member account (users.user_id)
  business_registration  the representative of a Business registration not provisioned yet
  clan_owner_contact     the real Gmail of a clan Owner (users.contact_email); the registration's
                         row becomes this one when the Owner is provisioned (no second row)

Not in the registry: @giapha.com addresses (login identifiers issued by the system, not mailboxes).

Migration 0008 keeps a FROZEN copy of normalize_email (it must not change when this file does);
tests/test_gmail_registry.py checks that both agree.
"""

from __future__ import annotations

from app.core.config import settings

LOGIN_ID_DOMAIN = "giapha.com"
GMAIL_DOMAINS = ("gmail.com", "googlemail.com")

MEMBER = "member"
BUSINESS_REGISTRATION = "business_registration"
CLAN_OWNER_CONTACT = "clan_owner_contact"


def is_login_identifier(email: str) -> bool:
    """An Owner's login identifier issued by the system (@giapha.com): never a mailbox."""
    return (email or "").strip().lower().rstrip(".").endswith("@" + LOGIN_ID_DOMAIN)


def normalize_email(email: str, *, allow_plus_alias: bool | None = None) -> str:
    """The registry key of an address.

    Every address: trimmed, lower-cased. Gmail (gmail.com, googlemail.com -> gmail.com): dots of
    the local part removed and the "+tag" dropped, since Gmail delivers all of them to one inbox.
    ALLOW_GMAIL_PLUS_ALIAS=true (dev only) keeps the "+tag", so a developer can test with aliases."""
    if allow_plus_alias is None:
        # Mốc M7: dev only; outside APP_ENV=dev the flag is ignored here and refused at startup.
        allow_plus_alias = settings.ALLOW_GMAIL_PLUS_ALIAS and settings.APP_ENV == "dev"
    address = (email or "").strip().lower()
    local, sep, domain = address.rpartition("@")
    if not sep:
        return address
    if domain in GMAIL_DOMAINS:
        domain = "gmail.com"
        if not allow_plus_alias:
            local = local.split("+", 1)[0]
        local = local.replace(".", "")
    return f"{local}@{domain}"
