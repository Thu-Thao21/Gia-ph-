"""Every entry point must import on its own, in a FRESH interpreter (Mốc M1 regression).

Inside one pytest process the modules are already imported in a lucky order, so a circular
import (app.core.errors -> app.schemas.common -> app.core.security -> security_headers ->
app.core.errors) stays hidden while `python -c "import app.main"` - and so the server - fails.
Each check therefore runs `python` in a new subprocess with cwd = BE.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

BE_DIR = Path(__file__).resolve().parents[1]
FAKE_URL = "postgresql+psycopg://fake_user:fake_pw@db.example.invalid/mfgms_fake"


def run(*args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    # Importing app code needs a syntactically valid DATABASE_URL; nothing here connects.
    env.setdefault("DATABASE_URL", FAKE_URL)
    return subprocess.run(
        [sys.executable, *args], cwd=BE_DIR, env=env, capture_output=True, text=True, timeout=120
    )


@pytest.mark.parametrize(
    "module",
    [
        "app.main",
        "app.controllers.auth_access.use_cases",
        "app.schemas.common",
        "app.core.security.password_hash",
        "app.core.errors",
        # M1c: firebase -> app.core.config -> startup_checks -> firebase (when loaded first)
        "app.core.integrations.firebase",
        "app.core.config",
        "app.core.security.security_headers",
        "app.dependencies.auth",
        "app.models.user_access.repository",
        "app.db.postgres",
    ],
)
def test_module_imports_alone_in_a_fresh_interpreter(module):
    proc = run("-c", f"import {module}")
    assert proc.returncode == 0, proc.stderr[-1500:]


def test_set_password_script_help_runs():
    proc = run("scripts/set_password.py", "--help")
    assert proc.returncode == 0, proc.stderr[-1500:]
    assert "--must-change" in proc.stdout


def test_password_hash_depends_on_stdlib_and_bcrypt_only():
    """It sits under app.schemas.common, so it must never import app code (the cycle's root)."""
    source = (BE_DIR / "app" / "core" / "security" / "password_hash.py").read_text(encoding="utf-8")
    imports = [line.strip() for line in source.splitlines() if line.startswith(("import ", "from "))]
    assert imports and all(not line.split()[1].startswith("app") for line in imports), imports
