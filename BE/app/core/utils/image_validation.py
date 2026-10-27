"""Uploaded images (a clan logo, Mốc M5c): the type is decided by the CONTENT, never by the file name
or the Content-Type the client sends.

Accepted: PNG, JPEG, WebP only. SVG is REFUSED: it is a document that can carry scripts, event
handlers, <foreignObject>, external references and XML entities, and this project has no vetted
sanitizer (no defusedxml / bleach); a hand-written one would be a guess. Anything that merely LOOKS
like an image (a renamed SVG or HTML, a truncated header, a polyglot with markup in the header
region) is refused.

Checks: size <= MAX_BYTES, magic bytes, the image's own width / height from its header (no
decoding library needed) within MAX_SIDE, no markup ("<svg", "<script", "<?xml", "<html", "<!doctype")
in the first 1 KiB. The stored name is generated (never the user's), with the extension of the
detected type; serve with that Content-Type plus SAFE_SERVE_HEADERS.
"""

from __future__ import annotations

import secrets
import struct
from dataclasses import dataclass

MAX_BYTES = 2 * 1024 * 1024
MAX_SIDE = 4096
MIN_SIDE = 16

SAFE_SERVE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=86400",
}
_MARKUP = (b"<svg", b"<script", b"<?xml", b"<html", b"<!doctype", b"<!entity", b"<iframe")


class ImageRejected(ValueError):
    """`reason` is a code for the API answer: too_large, empty, svg_not_allowed, unknown_type,
    corrupt, bad_dimensions, markup."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class CheckedImage:
    mime_type: str
    extension: str
    width: int
    height: int
    stored_name: str  # generated: never derived from the uploaded file name


def check_image(data: bytes) -> CheckedImage:
    if not data:
        raise ImageRejected("empty")
    if len(data) > MAX_BYTES:
        raise ImageRejected("too_large")
    head = data[:1024].lower()
    stripped = data.lstrip()[:256].lower()
    if stripped.startswith((b"<svg", b"<?xml")) or b"<svg" in head:
        raise ImageRejected("svg_not_allowed")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        mime, ext, (w, h) = "image/png", "png", _png_size(data)
    elif data.startswith(b"\xff\xd8\xff"):
        mime, ext, (w, h) = "image/jpeg", "jpg", _jpeg_size(data)
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        mime, ext, (w, h) = "image/webp", "webp", _webp_size(data)
    else:
        raise ImageRejected("unknown_type")
    if any(tag in head for tag in _MARKUP):
        raise ImageRejected("markup")  # a polyglot: valid magic bytes, markup right behind them
    if not (MIN_SIDE <= w <= MAX_SIDE and MIN_SIDE <= h <= MAX_SIDE):
        raise ImageRejected("bad_dimensions")
    return CheckedImage(mime, ext, w, h, f"{secrets.token_hex(16)}.{ext}")


def _png_size(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or data[12:16] != b"IHDR":
        raise ImageRejected("corrupt")
    return struct.unpack(">II", data[16:24])


def _jpeg_size(data: bytes) -> tuple[int, int]:
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            raise ImageRejected("corrupt")
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:  # no length field
            i += 2
            continue
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        if length < 2:
            raise ImageRejected("corrupt")
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return w, h
        i += 2 + length
    raise ImageRejected("corrupt")


def _webp_size(data: bytes) -> tuple[int, int]:
    chunk = data[12:16]
    if chunk == b"VP8 " and len(data) >= 30 and data[23:26] == b"\x9d\x01\x2a":
        w, h = struct.unpack("<HH", data[26:30])
        return w & 0x3FFF, h & 0x3FFF
    if chunk == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
        bits = int.from_bytes(data[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if chunk == b"VP8X" and len(data) >= 30:
        w = int.from_bytes(data[24:27], "little") + 1
        h = int.from_bytes(data[27:30], "little") + 1
        return w, h
    raise ImageRejected("corrupt")
