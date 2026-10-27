"""bcrypt hash of the DB login password: credential_metadata.password_hash (Moc M1).

- check_password_policy: THE password policy of the app (Password request type, change-password,
  register-public, scripts/set_password.py): at least 8 characters, an upper-case letter, a
  lower-case letter, a digit, and at most 72 bytes.
- hash_password: bcrypt, cost 12. bcrypt only reads 72 bytes and the library refuses longer
  input, so a longer password is refused (ValueError) instead of being silently cut.
- verify_password NEVER raises and is False for a missing or malformed hash. When there is no
  hash it still runs one bcrypt check against a dummy hash, so "no such user" / "no hash" take
  as long as a wrong password (no account enumeration by timing).
- Both are CPU bound (about 0.25 s at cost 12): async callers run them in a worker thread.
The password is never logged, stored or put in an exception message here.
"""

from __future__ import annotations

import functools
import re
import secrets

import bcrypt

BCRYPT_ROUNDS = 12
BCRYPT_MAX_BYTES = 72
MIN_PASSWORD_LENGTH = 8


def check_password_policy(raw: str) -> None:
    """Raise ValueError naming the first rule the password breaks (the message never holds the
    password)."""
    if len(raw) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if not re.search(r"[A-Z]", raw):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", raw):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[0-9]", raw):
        raise ValueError("Password must contain at least one digit")
    if len(raw.encode("utf-8")) > BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")


def hash_password(raw: str) -> str:
    data = raw.encode("utf-8")
    if len(data) > BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")
    return bcrypt.hashpw(data, bcrypt.gensalt(BCRYPT_ROUNDS)).decode("ascii")


@functools.lru_cache(maxsize=1)
def _dummy_hash() -> bytes:
    # A hash of a random value nobody knows, made once per process with the same cost.
    return bcrypt.hashpw(secrets.token_bytes(32), bcrypt.gensalt(BCRYPT_ROUNDS))


def warm_up() -> None:
    """Build the dummy hash now (app startup), not inside the first login that needs it."""
    _dummy_hash()


def verify_password(raw: str, stored_hash: str | None) -> bool:
    data = raw.encode("utf-8")
    if not stored_hash:
        _safe_checkpw(data, _dummy_hash())
        return False
    try:
        expected = stored_hash.encode("ascii")
    except UnicodeEncodeError:
        _safe_checkpw(data, _dummy_hash())
        return False
    return _safe_checkpw(data, expected)


def _safe_checkpw(data: bytes, expected: bytes) -> bool:
    try:
        return bcrypt.checkpw(data, expected)
    except ValueError:  # malformed hash, or a password over 72 bytes
        return False
