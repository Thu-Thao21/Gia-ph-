"""Test-wide environment. Loaded before any test module imports app code.

Firebase and CORS settings are forced here so no test depends on BE/.env and no test can
reach the real Firebase project or service account.
"""

import os
from pathlib import Path

# Load BE/.env if present, otherwise set mock DATABASE_URL for isolated testing
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@localhost:5432/test_db")
os.environ["FIREBASE_PROJECT_ID"] = "test-project"
os.environ["FRONTEND_ORIGINS"] = "http://localhost:5173,http://localhost:8080"
os.environ["FIREBASE_SERVICE_ACCOUNT_PATH"] = ""
os.environ.pop("FIREBASE_AUTH_EMULATOR_HOST", None)
os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _no_real_firebase(monkeypatch):
    """No test may reach the real Firebase (E6): the SDK's Admin functions fail the test instead."""
    from firebase_admin import auth

    def refuse(name):
        def guard(*args, **kwargs):
            raise AssertionError(f"REAL FIREBASE CALLED: auth.{name}")

        return guard

    for name in ("create_user", "get_user", "delete_user", "update_user", "revoke_refresh_tokens",
                 "get_user_by_email", "delete_users", "list_users"):
        monkeypatch.setattr(auth, name, refuse(name))
