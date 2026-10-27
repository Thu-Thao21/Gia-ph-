"""The ONLY routes that answer without a session (Mốc M2, N-3).

Every other route must authenticate (get_principal / get_principal_allow_restricted /
get_current_account somewhere in its dependency tree). tests/test_route_auth.py calls EVERY
route of app.main.app on BOTH mounts without a token and fails unless it gets 401, so a new
route without authentication breaks the build until it is added here, with a reason, on
purpose. scripts/route_inventory.py prints the table from the same data.

Paths are written WITHOUT the API prefix: main.py mounts the routers at /api/v1 and at the
root, and route_path() (app.dependencies.auth) maps both spellings to one route.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.dependencies.auth import route_path


@dataclass(frozen=True)
class PublicRoute:
    method: str
    path: str  # without /api/v1
    reason: str


ALLOWLIST_PUBLIC: tuple[PublicRoute, ...] = (
    PublicRoute("GET", "/api/health", "liveness probe, no data"),
    PublicRoute("GET", "/api/health/ready", "readiness probe (SELECT 1), no data"),
    # The one way in, and public self-registration (OTP to the Gmail address first).
    PublicRoute("POST", "/auth/login", "login itself; rate limit 'login' + per-account lockout"),
    PublicRoute("POST", "/auth/register-send-otp", "self-registration step 1 (OTP cooldown)"),
    PublicRoute("POST", "/auth/register-verify-otp", "self-registration step 2"),
    PublicRoute("POST", "/auth/register-public", "self-registration step 3 (needs the verified OTP); rate limit 'register_public'"),
    PublicRoute(
        "POST",
        "/auth/password-reset/request",
        "forgot password step 1: no session by definition; always the same 200 (no enumeration); "
        "rate limits 'password_reset_request' (IP) + 'password_reset_request_email' (silent)",
    ),
    PublicRoute(
        "POST",
        "/auth/password-reset/confirm",
        "forgot password: the caller has no session, the secret is the e-mailed reset code; "
        "rate limits 'password_reset' + 'password_reset_failures'",
    ),
    # Guest business registration wizard (FE /public/business-register).
    PublicRoute("POST", "/business-registrations", "guest registers a clan; rate limit 'registration'"),
    PublicRoute("POST", "/business-registrations/send-otp", "guest wizard OTP (cooldown)"),
    PublicRoute("POST", "/business-registrations/verify-otp", "guest wizard OTP check"),
    PublicRoute("POST", "/business-registrations/track", "guest tracks by secret tracking code; rate limit 'track'"),
    # Public catalogue pages.
    PublicRoute("GET", "/service-plans", "price list of the plans on sale (FE /public/business-plans)"),
    PublicRoute("GET", "/families", "directory of ACTIVE clans: id, name, code only"),
    PublicRoute("GET", "/public/families", "same directory (FE /public/families)"),
    PublicRoute(
        "GET",
        "/families/{family_id}/public-tree",
        "guest tree of an ACTIVE clan: living persons masked (FR-GU-04, FR-GU-10)",
    ),
)

_INDEX = {(r.method, r.path) for r in ALLOWLIST_PUBLIC}


def is_public(method: str, path: str) -> bool:
    """`path` as declared on the route (with {params}), either mount."""
    return (method.upper(), route_path(path)) in _INDEX


@dataclass(frozen=True)
class EffectiveRoute:
    """One route as the app serves it: the FULL path (mount prefix included)."""

    path: str
    methods: frozenset[str]
    dependant: object
    endpoint: object


def iter_routes(app) -> list[EffectiveRoute]:
    """Every API route of `app`, each mount separately, first match wins (like the router).

    FastAPI 0.162 keeps include_router() as lazy _IncludedRouter entries in app.routes (they are
    not APIRoute there), so this walks their effective_candidates() recursively; each
    _EffectiveRouteContext carries the full path, the methods and the dependant."""
    found: dict[tuple[str, frozenset[str]], EffectiveRoute] = {}

    def visit(route) -> None:
        if hasattr(route, "effective_candidates"):  # _IncludedRouter
            for child in route.effective_candidates():
                visit(child)
            for child in route.effective_low_priority_routes():
                visit(child)
            return
        dependant = getattr(route, "dependant", None)
        endpoint = getattr(route, "endpoint", None)
        if dependant is None or endpoint is None:  # /docs, /openapi.json, static mounts
            return
        methods = frozenset((getattr(route, "methods", None) or set()) - {"HEAD"})
        found.setdefault((route.path, methods), EffectiveRoute(route.path, methods, dependant, endpoint))

    for route in app.routes:
        visit(route)
    return list(found.values())
