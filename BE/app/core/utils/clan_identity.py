"""Which clan is which (Mốc M5c): the clan key, the soft "looks alike" warnings, and the clan code.

CLAN KEY = name_key + "|" + origin_key, held ONCE (table clan_identity_registry, migration 0010):
a clan that exists (any status but INACTIVE) or a Business registration PENDING / APPROVED /
NEED_SUPPLEMENT. A REJECTED / CANCELLED registration gives its key back.

name_key(clan_name):
  1. NFC, lower case, whitespace collapsed;
  2. ONE leading prefix dropped, matched WITH its diacritics, before they are removed, so the
     surname "Hồ" is never mistaken for the prefix "Họ": "dòng họ", "gia tộc", "họ tộc", "tộc",
     "họ"; typed without diacritics only the unambiguous "dong ho", "gia toc", "ho toc";
  3. diacritics removed (đ -> d), anything not a-z / 0-9 becomes a space, whitespace collapsed.
  "Dòng Họ Nguyễn Chi 1 Kim Liên" -> "nguyen chi 1 kim lien"; "Họ Hồ" -> "ho".
origin_key(origin_place): steps 1 and 3 (no prefix). "Làng Đông, Xã Kim Liên" -> "lang dong xa kim lien".

Soft warnings (shown to the System Admin, never blocking), against the other held keys:
  same_name_other_origin      the same name_key, a different origin_key;
  similar_name_shared_origin  the same name once spaces are removed (but not the same name_key)
                              and the origins share a significant word (3+ letters, not an
                              administrative word such as "xa", "huyen", "tinh").

CLAN CODE (new clans): name_key, a-z / 0-9 only, at most 30 characters ("dongho" if empty); when
taken (clans.clan_code, any letter case, or "<code>@giapha.com" in users.email) "-2", "-3", ...
OWNER LOGIN ID: "<clan_code lower case>@giapha.com", then "-2", "-3", ... on the local part if that
e-mail exists. Owners provisioned before keep their login ID.

Migration 0010 keeps a FROZEN copy of name_key / origin_key (tests check that both agree).
"""

from __future__ import annotations

import re
import unicodedata

NAME_PREFIXES = ("dòng họ", "gia tộc", "họ tộc", "tộc", "họ", "dong ho", "gia toc", "ho toc")
CODE_MAX_LENGTH = 30
LOGIN_DOMAIN = "giapha.com"
ADMIN_WORDS = frozenset({
    "xa", "huyen", "tinh", "thon", "lang", "xom", "ap", "phuong", "quan", "thi", "tran", "thanh",
    "pho", "tp", "khu", "to", "so", "duong", "pho", "chi", "nha", "tho", "the", "va", "cua",
})

REGISTRATION = "registration"  # registry row kinds
CLAN = "clan"


def _nfc_lower(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text or "")).strip().lower()


def strip_diacritics(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def _ascii_words(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", strip_diacritics(text).lower())).strip()


def name_key(clan_name: str) -> str:
    text = _nfc_lower(clan_name)
    for prefix in NAME_PREFIXES:
        if text.startswith(prefix + " ") and len(text) > len(prefix) + 1:
            text = text[len(prefix) + 1:]
            break
    return _ascii_words(text)


def origin_key(origin_place: str | None) -> str:
    return _ascii_words(_nfc_lower(origin_place or ""))


def clan_key(clan_name: str, origin_place: str | None) -> str:
    return f"{name_key(clan_name)}|{origin_key(origin_place)}"


def compact(key: str) -> str:
    return key.replace(" ", "")


def origin_words(key: str) -> set[str]:
    return {w for w in key.split() if len(w) >= 3 and w not in ADMIN_WORDS}


def similarity_reason(name_a: str, origin_a: str, name_b: str, origin_b: str) -> str | None:
    """Why two (name_key, origin_key) pairs look alike, or None (the same pair is a hard duplicate,
    not a warning)."""
    if name_a == name_b and origin_a == origin_b:
        return None
    if name_a == name_b:
        return "same_name_other_origin"
    if compact(name_a) == compact(name_b) and origin_words(origin_a) & origin_words(origin_b):
        return "similar_name_shared_origin"
    return None


def code_base(clan_name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name_key(clan_name))[:CODE_MAX_LENGTH] or "dongho"


def code_candidates(clan_name: str, attempts: int = 50):
    """The clan code, then the code with "-2", "-3", ... (deterministic)."""
    base = code_base(clan_name)
    yield base
    for n in range(2, attempts + 2):
        yield f"{base}-{n}"


def login_id_candidates(clan_code: str, attempts: int = 50):
    local = (clan_code or "").strip().lower()
    yield f"{local}@{LOGIN_DOMAIN}"
    for n in range(2, attempts + 2):
        yield f"{local}-{n}@{LOGIN_DOMAIN}"
