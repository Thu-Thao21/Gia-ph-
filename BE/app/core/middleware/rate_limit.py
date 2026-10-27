"""In-memory sliding-window rate limiter for the public endpoints (Mốc E step E3, Mốc H2).

Eight limiters, each per caller address (settings RATE_LIMIT_<NAME>_MAX / _WINDOW_SECONDS):
  * "registration": POST /business-registrations (default 5 per hour);
  * "track": POST /business-registrations/track (default 20 per 10 minutes);
  * "login": POST /auth/login, the only login (default 10 per 10 minutes, KI-06, Moc M1). It runs
    before the user lookup and bcrypt, so refused calls cost nothing. The per-account lockout
    (5 wrong passwords) lives in the use case, not here.
  * "otp_send": POST /auth/register-send-otp and POST /business-registrations/send-otp, ONE
    shared counter (default 5 per 10 minutes, Mốc M2b). The per-e-mail cooldown of otp_service
    stops repeats to one address; this stops one caller mailing many addresses.
  * "otp_verify": POST /auth/register-verify-otp and POST /business-registrations/verify-otp,
    one shared counter (default 10 per 10 minutes): guessing codes across many addresses.
  * "register_public": POST /auth/register-public (default 5 per hour, Mốc M2c).
  * "password_reset": POST /auth/password-reset/confirm, every call (default 10 per 10 minutes).
  * "password_reset_failures": the same route, only calls whose reset code was WRONG or EXPIRED
    (default 5 per 15 minutes). Checked with peek() before the call and recorded with record()
    after a failure, so a caller with a valid code is never slowed down by it.
  * "password_reset_request": POST /auth/password-reset/request, per caller address (default 5 per
    15 minutes; Mốc M4b). Over it: 429.
  * "password_reset_request_email": the same route, per TARGET e-mail (key: SHA-256 of the lower-cased
    address; default 3 per hour). Over it: the SAME generic 200, nothing is sent (a 429 here would tell
    that the address was asked for). Checked in the route with check_key(), not as a dependency.
They count separately: using up one never affects the others. An unknown name is an error
(ValueError), never "no limit".

Exact sliding log: every key keeps the times of its allowed calls inside the window. A call is
refused when the window already holds `limit` calls; the refusal is not recorded, so waiting
frees the window by itself. Retry-After is the number of seconds (rounded up, at least 1)
until the oldest call leaves the window.

Keys are (limiter name, caller address). IPv4 as is; IPv6 grouped by its /64 so a client
cannot dodge the limit by rotating addresses inside its own network.

Memory is bounded:
  * expired calls are dropped whenever a key is touched;
  * every `sweep_interval` seconds the whole table is swept and empty keys are deleted;
  * the table never holds more than `max_keys` keys: when it is full it is swept first and,
    if that is not enough, the least recently used key is evicted. An attacker with very many
    addresses can use that to reset his own counters, at a cost to himself; the table itself
    cannot grow.

Safe for threads (a lock) and for the event loop (check() never awaits).

LIMITS (docs/known_issues.md KI-17), for all limiters: the counters live in ONE process.
N workers allow N times the limit, a restart resets everything, and behind a reverse proxy
without TRUST_PROXY_HEADERS all clients share one address (one busy client can then lock
everyone out of the login). Callers behind one NAT, or one IPv6 /64, share a bucket too. It slows
down simple spam and password-spraying through the login; it is not a defence against a
distributed attacker. A shared limiter (Redis, a table) or a limit at the proxy is the
follow-up.
"""

from __future__ import annotations

import ipaddress
import math
import threading
import time
from collections import OrderedDict, deque
from dataclasses import dataclass
from typing import Callable

from fastapi import Request

from app.core.middleware.client_ip import client_ip
from app.core.errors.errors import AppError
from app.schemas.errors import ErrorCode

UNKNOWN_CLIENT = "unknown"
DEFAULT_SWEEP_INTERVAL_SECONDS = 60.0
LIMITER_NAMES = (
    "registration", "track", "login", "otp_send", "otp_verify",
    "register_public", "password_reset", "password_reset_failures",
    "password_reset_request", "password_reset_request_email",
)


def limiter_key(ip: str | None) -> str:
    """Bucket for a caller address: IPv4 exact, IPv6 by /64, unknown callers share one bucket."""
    if not ip:
        return UNKNOWN_CLIENT
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return UNKNOWN_CLIENT
    if address.version == 6:
        if address.ipv4_mapped is not None:
            return f"v4:{address.ipv4_mapped}"
        return f"v6:{ipaddress.ip_network(f'{address}/64', strict=False).network_address}"
    return f"v4:{address}"


@dataclass(frozen=True)
class Decision:
    allowed: bool
    retry_after: int = 0  # seconds, only meaningful when not allowed


class SlidingWindowLimiter:
    def __init__(
        self,
        limit: int,
        window_seconds: float,
        *,
        max_keys: int = 10_000,
        sweep_interval: float = DEFAULT_SWEEP_INTERVAL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if limit < 1 or window_seconds <= 0 or max_keys < 1:
            raise ValueError("limit, window_seconds and max_keys must be positive")
        self.limit = limit
        self.window = float(window_seconds)
        self.max_keys = max_keys
        self.sweep_interval = float(sweep_interval)
        self._clock = clock
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()
        self._last_sweep = clock()
        self._lock = threading.Lock()

    def __len__(self) -> int:
        return len(self._hits)

    def check(self, key: str) -> Decision:
        with self._lock:
            now = self._clock()
            if now - self._last_sweep >= self.sweep_interval:
                self._sweep(now)
            hits = self._hits.get(key)
            if hits is None:
                if len(self._hits) >= self.max_keys:
                    self._sweep(now)
                while len(self._hits) >= self.max_keys:
                    self._hits.popitem(last=False)  # least recently used
                hits = self._hits[key] = deque()
            self._drop_expired(hits, now)
            self._hits.move_to_end(key)
            if len(hits) >= self.limit:
                retry_after = max(1, math.ceil(hits[0] + self.window - now))
                return Decision(False, retry_after)
            hits.append(now)
            return Decision(True)

    def peek(self, key: str) -> Decision:
        """Like check() but records nothing: is `key` already at the limit?"""
        with self._lock:
            now = self._clock()
            hits = self._hits.get(key)
            if hits is None:
                return Decision(True)
            self._drop_expired(hits, now)
            if len(hits) >= self.limit:
                return Decision(False, max(1, math.ceil(hits[0] + self.window - now)))
            return Decision(True)

    def _drop_expired(self, hits: deque[float], now: float) -> None:
        horizon = now - self.window
        while hits and hits[0] <= horizon:
            hits.popleft()

    def _sweep(self, now: float) -> None:
        for key in list(self._hits):
            hits = self._hits[key]
            self._drop_expired(hits, now)
            if not hits:
                del self._hits[key]
        self._last_sweep = now


class RateLimiters:
    """The limiters of the app plus the settings that decide the caller address."""

    def __init__(
        self,
        *,
        enabled: bool,
        registration: SlidingWindowLimiter,
        track: SlidingWindowLimiter,
        login: SlidingWindowLimiter,
        otp_send: SlidingWindowLimiter,
        otp_verify: SlidingWindowLimiter,
        register_public: SlidingWindowLimiter,
        password_reset: SlidingWindowLimiter,
        password_reset_failures: SlidingWindowLimiter,
        password_reset_request: SlidingWindowLimiter,
        password_reset_request_email: SlidingWindowLimiter,
        trust_proxy_headers: bool = False,
        trusted_proxy_count: int = 1,
    ) -> None:
        self.enabled = enabled
        self.registration = registration
        self.track = track
        self.login = login
        self.otp_send = otp_send
        self.otp_verify = otp_verify
        self.register_public = register_public
        self.password_reset = password_reset
        self.password_reset_failures = password_reset_failures
        self.password_reset_request = password_reset_request
        self.password_reset_request_email = password_reset_request_email
        self.trust_proxy_headers = trust_proxy_headers
        self.trusted_proxy_count = trusted_proxy_count

    def limiter(self, which: str) -> SlidingWindowLimiter:
        """The limiter called `which`; ValueError for any other name (never silently unlimited)."""
        if which not in LIMITER_NAMES:
            raise ValueError(f"unknown rate limiter {which!r}; expected one of {LIMITER_NAMES}")
        return getattr(self, which)

    def enforce(self, which: str, request: Request) -> None:
        """Raise 429 (with Retry-After) when the caller is over the limit; do nothing when disabled.

        The name is checked first, so a typo fails even while rate limiting is disabled."""
        limiter = self.limiter(which)
        if not self.enabled:
            return
        _raise_if_refused(limiter.check(self.key_for(request)))

    def key_for(self, request: Request) -> str:
        return limiter_key(
            client_ip(
                request,
                trust_proxy_headers=self.trust_proxy_headers,
                trusted_proxy_count=self.trusted_proxy_count,
            )
        )

    def peek(self, which: str, request: Request) -> None:
        """429 when the caller is already at the limit; records nothing (failure-only limiters)."""
        limiter = self.limiter(which)
        if self.enabled:
            _raise_if_refused(limiter.peek(self.key_for(request)))

    def allow_key(self, which: str, key: str) -> bool:
        """Count one call under an explicit key (not the caller address); False when over the
        limit. Always True while rate limiting is disabled."""
        limiter = self.limiter(which)
        return True if not self.enabled else limiter.check(key).allowed

    def record(self, which: str, request: Request) -> None:
        """Count one event (e.g. a failed attempt) without refusing anything now."""
        limiter = self.limiter(which)
        if self.enabled:
            limiter.check(self.key_for(request))


def _raise_if_refused(decision: Decision) -> None:
    if not decision.allowed:
        raise AppError(
            ErrorCode.RATE_LIMITED,
            "Too many requests. Try again later.",
            headers={"Retry-After": str(decision.retry_after)},
        )


def build_rate_limiters(settings, clock: Callable[[], float] = time.monotonic) -> RateLimiters:
    return RateLimiters(
        enabled=settings.RATE_LIMIT_ENABLED,
        registration=SlidingWindowLimiter(
            settings.RATE_LIMIT_REGISTRATION_MAX,
            settings.RATE_LIMIT_REGISTRATION_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        track=SlidingWindowLimiter(
            settings.RATE_LIMIT_TRACK_MAX,
            settings.RATE_LIMIT_TRACK_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        login=SlidingWindowLimiter(
            settings.RATE_LIMIT_LOGIN_MAX,
            settings.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        otp_send=SlidingWindowLimiter(
            settings.RATE_LIMIT_OTP_SEND_MAX,
            settings.RATE_LIMIT_OTP_SEND_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        otp_verify=SlidingWindowLimiter(
            settings.RATE_LIMIT_OTP_VERIFY_MAX,
            settings.RATE_LIMIT_OTP_VERIFY_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        register_public=SlidingWindowLimiter(
            settings.RATE_LIMIT_REGISTER_PUBLIC_MAX,
            settings.RATE_LIMIT_REGISTER_PUBLIC_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        password_reset=SlidingWindowLimiter(
            settings.RATE_LIMIT_PASSWORD_RESET_MAX,
            settings.RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        password_reset_failures=SlidingWindowLimiter(
            settings.RATE_LIMIT_PASSWORD_RESET_FAILURES_MAX,
            settings.RATE_LIMIT_PASSWORD_RESET_FAILURES_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        password_reset_request=SlidingWindowLimiter(
            settings.RATE_LIMIT_PASSWORD_RESET_REQUEST_MAX,
            settings.RATE_LIMIT_PASSWORD_RESET_REQUEST_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        password_reset_request_email=SlidingWindowLimiter(
            settings.RATE_LIMIT_PASSWORD_RESET_REQUEST_EMAIL_MAX,
            settings.RATE_LIMIT_PASSWORD_RESET_REQUEST_EMAIL_WINDOW_SECONDS,
            max_keys=settings.RATE_LIMIT_MAX_KEYS,
            clock=clock,
        ),
        trust_proxy_headers=settings.TRUST_PROXY_HEADERS,
        trusted_proxy_count=settings.TRUSTED_PROXY_COUNT,
    )


def rate_limited(which: str):
    """Route dependency. Runs before the body is validated, so invalid bodies count too.

    An unknown name fails here, when the route is declared, not on the first request."""
    if which not in LIMITER_NAMES:
        raise ValueError(f"unknown rate limiter {which!r}; expected one of {LIMITER_NAMES}")

    async def dependency(request: Request) -> None:
        limiters = getattr(request.app.state, "rate_limiters", None)
        if limiters is None:  # a deployment bug: fail loudly, never silently unlimited
            raise RuntimeError("app.state.rate_limiters is not configured")
        limiters.enforce(which, request)

    dependency.rate_limiter = which  # read by scripts/route_inventory.py
    return dependency
