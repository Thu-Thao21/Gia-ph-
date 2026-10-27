"""Route inventory of app.main.app (Mốc M2): every mount, with its authentication and checks.

    cd BE
    .venv\\Scripts\\python scripts\\route_inventory.py            # Markdown table on stdout
    .venv\\Scripts\\python scripts\\route_inventory.py --unauth   # only routes WITHOUT authentication

Authentication is read from the real FastAPI dependency tree (never guessed from names in the
path): a route is authenticated when get_principal, get_principal_allow_restricted or
get_current_account is somewhere in it.

Authorization is reported as found:
  * "require_action(<action>)"  the RBAC dependency of app.dependencies.permissions;
  * "authorize()"/"family-permission"/"genealogy-service"/"inter-family"  a call in the handler
    source (the check runs in the body, so it cannot be seen in the dependency tree);
  * "-" none found. An authenticated route with "-" lets ANY logged-in user in.
Public routes are those of app/core/public_routes.py (ALLOWLIST_PUBLIC).
"""

from __future__ import annotations

import argparse
import inspect
import sys
from dataclasses import dataclass
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
BE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BE_DIR))


AUTH_DEPENDENCIES = {"get_principal", "get_principal_allow_restricted", "get_current_account"}
# Checks that run inside the handler (or the service it calls) and decide per clan/role.
BODY_CHECKS = (
    ("authorize(", "authorize()"),
    ("require_family_permission", "family-permission"),
    ("await _require(db, account", "family-permission"),
    ("export_persons_csv(", "family-permission"),
    ("require_system_admin", "system-admin"),
    ("require_clan_member", "clan-member"),
    ("controller(db, account)", "genealogy-service"),
    ("GenealogyService(db)", "genealogy-service"),
    ("_require_", "inter-family"),
)


@dataclass(frozen=True)
class RouteInfo:
    methods: str
    path: str
    endpoint: str
    authenticated: bool
    checks: str


def _walk(dependant):
    yield dependant
    for sub in dependant.dependencies:
        yield from _walk(sub)


def _dependency_names(route) -> list[str]:
    names = []
    for dep in _walk(route.dependant):
        call = dep.call
        if call is None:
            continue
        names.append(getattr(call, "__qualname__", getattr(call, "__name__", repr(call))))
    return names


def _checks(route, names: list[str]) -> str:
    found = []
    for dep in _walk(route.dependant):
        action = getattr(dep.call, "required_action", None)
        if action is not None:
            found.append(f"require_action({action})")
        clan_check = getattr(dep.call, "clan_permission", None)
        if clan_check is not None:
            found.append(f"clan-permission({clan_check})")
        limiter = getattr(dep.call, "rate_limiter", None)
        if limiter is not None:
            found.append(f"rate_limited({limiter})")
    try:
        source = inspect.getsource(route.endpoint)
    except (OSError, TypeError):
        source = ""
    for needle, label in BODY_CHECKS:
        if needle in source and label not in found:
            found.append(label)
    return ", ".join(found) or "-"


def inventory(app=None) -> list[RouteInfo]:
    if app is None:
        from app.main import app
    from app.core.public_routes import iter_routes

    rows = []
    for route in iter_routes(app):
        names = _dependency_names(route)
        rows.append(
            RouteInfo(
                methods=",".join(sorted(route.methods - {"HEAD"})),
                path=route.path,
                endpoint=f"{route.endpoint.__module__.removeprefix('app.')}.{route.endpoint.__name__}",
                authenticated=any(n.split(".")[-1] in AUTH_DEPENDENCIES for n in names),
                checks=_checks(route, names),
            )
        )
    return sorted(rows, key=lambda r: (r.path, r.methods))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--unauth", action="store_true", help="only routes without authentication")
    args = parser.parse_args(argv)
    from app.core.public_routes import is_public

    rows = inventory()
    print("| Method | Path | Auth | Phân quyền | Public (allowlist) | Handler |")
    print("|---|---|---|---|---|---|")
    for r in rows:
        if args.unauth and r.authenticated:
            continue
        public = "public" if any(is_public(m, r.path) for m in r.methods.split(",")) else ""
        print(f"| {r.methods} | `{r.path}` | {'yes' if r.authenticated else '**NO**'} | {r.checks} | {public} | {r.endpoint} |")
    total = len(rows)
    unauth = sum(not r.authenticated for r in rows)
    print(f"\n{total} routes, {total - unauth} authenticated, {unauth} without authentication.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
