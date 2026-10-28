"""Kiểm tra cấu hình BE cho tester (CHỈ ĐỌC). Không bao giờ in mật khẩu, khóa, token hay email đầy đủ.

    cd BE
    .venv\\Scripts\\python.exe scripts\\check_env.py [--skip-db] [--skip-smtp]

Kiểm tra: BE/.env có đủ biến bắt buộc và không còn giá trị mẫu; APP_ENV=dev; DATABASE_URL đúng định
dạng và trỏ nhánh dev_minhquan (DỪNG nếu là production); tệp Firebase service account tồn tại và đúng
project; cấu hình qua được kiểm tra lúc khởi động của BE; kết nối DB (SELECT 1, transaction chỉ đọc) và
alembic_version là head; đăng nhập SMTP (không gửi thư).

Mã thoát: 0 = ổn (có thể có cảnh báo), 1 = có lỗi cần sửa, 2 = DATABASE_URL trỏ production (dừng ngay).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BE_DIR / ".env"
DEV_ENDPOINT = "ep-patient-term-b4dlkr06"  # Neon, nhánh dev_minhquan (dùng chung với tester)
PROD_ENDPOINT = "ep-green-mode-b4ugmgu4"   # Neon, PRODUCTION: không bao giờ dùng để test
# Giá trị mẫu của .env.example / gói bí mật mẫu (không đoán theo từ chung như "example").
PLACEHOLDER = re.compile(r"(?i)^$|your[_-]|change-me|/path/to/|USER:PASSWORD@HOST|<[^>]+>")

ok_count = warn_count = err_count = 0


def ok(msg: str) -> None:
    global ok_count
    ok_count += 1
    print(f"  [OK]   {msg}")


def warn(msg: str, fix: str = "") -> None:
    global warn_count
    warn_count += 1
    print(f"  [CẢNH BÁO] {msg}" + (f"\n         -> {fix}" if fix else ""))


def err(msg: str, fix: str = "") -> None:
    global err_count
    err_count += 1
    print(f"  [LỖI]  {msg}" + (f"\n         -> {fix}" if fix else ""))


def mask(value: str, keep: int = 3) -> str:
    value = value or ""
    return (value[:keep] + "…") if len(value) > keep else "…"


def mask_email(value: str) -> str:
    local, _, domain = (value or "").partition("@")
    return f"{local[:1]}***@{domain}" if domain else mask(value)


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def endpoint_of(host: str) -> str:
    return (host or "").split(".")[0].removesuffix("-pooler")


def check_database_url(env: dict[str, str]) -> str | None:
    """Trả về host (không có mật khẩu), hoặc None nếu URL hỏng. Thoát 2 nếu là production."""
    from sqlalchemy.engine import make_url

    raw = env.get("DATABASE_URL", "")
    if PLACEHOLDER.search(raw):
        err("DATABASE_URL chưa được điền (vẫn là giá trị mẫu hoặc trống).",
            "Dán DATABASE_URL trong gói bí mật Minh gửi vào BE\\.env (hoặc đặt secrets\\be.env rồi chạy lại setup).")
        return None
    try:
        url = make_url(raw)
    except Exception:  # noqa: BLE001 - never echo the URL: it holds the password
        err("DATABASE_URL không đúng định dạng.", "Dạng đúng: postgresql+psycopg://user:mật_khẩu@host/tên_db?sslmode=require")
        return None
    host = (url.host or "").lower()
    if not url.drivername.startswith("postgresql"):
        err("DATABASE_URL phải là PostgreSQL (postgresql+psycopg://...).")
    if not url.password:
        err("DATABASE_URL thiếu mật khẩu.")
    print(f"         Host DB: {host or '(trống)'}   database: {url.database or '(trống)'}   user: {mask(url.username or '', 2)}")
    if endpoint_of(host) == PROD_ENDPOINT or host.startswith(PROD_ENDPOINT):
        print("\n  [DỪNG] DATABASE_URL đang trỏ PRODUCTION (ep-green-mode-b4ugmgu4). TUYỆT ĐỐI không dùng để test.")
        print("         -> Thay bằng DATABASE_URL của dev_minhquan (ep-patient-term-b4dlkr06) trong gói bí mật.")
        sys.exit(2)
    if endpoint_of(host) != DEV_ENDPOINT:
        warn(f"DATABASE_URL không trỏ nhánh dev_minhquan ({DEV_ENDPOINT}).",
             "Tester dùng chung DB dev_minhquan; nếu đây không phải chủ ý, dán lại DATABASE_URL trong gói bí mật.")
    else:
        ok("DATABASE_URL trỏ nhánh dev_minhquan (dùng chung: KHÔNG xóa dữ liệu, KHÔNG chạy alembic).")
    if "sslmode=require" not in raw and host not in ("localhost", "127.0.0.1"):
        warn("DATABASE_URL không có sslmode=require.", "Thêm ?sslmode=require vào cuối DATABASE_URL.")
    return host


def check_vars(env: dict[str, str]) -> None:
    if env.get("APP_ENV") != "dev":
        err("APP_ENV phải là dev trên máy tester.", "Sửa trong BE\\.env: APP_ENV=dev")
    else:
        ok("APP_ENV=dev")
    for name, why in (
        ("FIREBASE_PROJECT_ID", "cấp tài khoản Trưởng tộc, đồng bộ mật khẩu"),
        ("FIREBASE_API_KEY", "xác nhận đặt lại mật khẩu (quên mật khẩu)"),
        ("SMTP_USER", "gửi OTP và thư"),
        ("SMTP_PASSWORD", "gửi OTP và thư (App Password của Gmail)"),
    ):
        value = env.get(name, "")
        if PLACEHOLDER.search(value):
            err(f"{name} chưa được điền ({why}).", "Lấy trong gói bí mật Minh gửi riêng.")
        else:
            shown = mask_email(value) if name == "SMTP_USER" else mask(value, 2) if "PASSWORD" in name or "KEY" in name else value
            ok(f"{name} đã có ({shown})")
    key = env.get("OTP_HMAC_KEY", "")
    if len(key) < 32:
        err("OTP_HMAC_KEY trống hoặc ngắn hơn 32 ký tự (route OTP sẽ trả 503).",
            "Chạy lại scripts\\setup_tester.ps1 (tự sinh khóa) hoặc điền chuỗi ngẫu nhiên 32+ ký tự.")
    else:
        ok(f"OTP_HMAC_KEY đã có ({len(key)} ký tự)")
    if env.get("ALLOW_GMAIL_PLUS_ALIAS", "").lower() == "true":
        ok("ALLOW_GMAIL_PLUS_ALIAS=true (đăng ký được nhiều alias +tag cùng một Gmail)")
    else:
        warn("ALLOW_GMAIL_PLUS_ALIAS khác true: các alias +tag bị coi là cùng một Gmail.",
             "Tester nên đặt ALLOW_GMAIL_PLUS_ALIAS=true (DB dev_minhquan đã backfill với giá trị true).")
    if env.get("DEBUG", "false").lower() == "true":
        warn("DEBUG=true: chỉ nên bật khi cần xem traceback.")


def check_firebase_file(env: dict[str, str]) -> None:
    raw = env.get("FIREBASE_SERVICE_ACCOUNT_PATH", "")
    if PLACEHOLDER.search(raw):
        err("FIREBASE_SERVICE_ACCOUNT_PATH chưa được điền.",
            "Đặt tệp service account vào secrets\\ rồi chạy lại setup (tự điền đường dẫn).")
        return
    path = Path(raw) if Path(raw).is_absolute() else (BE_DIR / raw)
    if not path.is_file():
        err(f"Không thấy tệp Firebase service account tại {raw}.",
            "Đường dẫn tính từ thư mục BE. Đặt tệp vào secrets\\ rồi chạy lại setup.")
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        err("Tệp Firebase service account không phải JSON hợp lệ.")
        return
    if data.get("type") != "service_account" or "private_key" not in data:
        err("Tệp Firebase không phải service account (thiếu type=service_account / private_key).")
        return
    if data.get("project_id") != env.get("FIREBASE_PROJECT_ID"):
        err("project_id trong tệp service account khác FIREBASE_PROJECT_ID.",
            "Kiểm tra lại gói bí mật: hai giá trị phải cùng một project Firebase.")
        return
    ok(f"Tệp Firebase service account hợp lệ (project {data.get('project_id')})")


def check_startup_rules() -> object | None:
    """Đúng các kiểm tra BE chạy lúc khởi động (tên biến, không giá trị)."""
    os.chdir(BE_DIR)  # FIREBASE_SERVICE_ACCOUNT_PATH is relative to BE, like when the BE runs
    sys.path.insert(0, str(BE_DIR))
    try:
        from app.core.config.config import Settings
        from app.core.config.startup_checks import find_config_problems

        settings = Settings(_env_file=str(ENV_FILE))
    except Exception as exc:  # noqa: BLE001 - pydantic's message may echo values: the class only
        err(f"BE không đọc được cấu hình ({type(exc).__name__}).", "Kiểm tra định dạng các biến trong BE\\.env.")
        return None
    problems = find_config_problems(settings)
    if problems:
        for p in problems:
            err(f"BE sẽ từ chối khởi động: {p}")
    else:
        ok("Cấu hình qua được kiểm tra lúc khởi động của BE")
    return settings


def check_database(settings) -> None:
    import asyncio
    import selectors

    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    head = ScriptDirectory.from_config(Config(str(BE_DIR / "alembic.ini"))).get_current_head()

    async def probe():
        engine = create_async_engine(settings.DATABASE_URL, connect_args={"connect_timeout": 10})
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SET TRANSACTION READ ONLY"))
                await conn.execute(text("SELECT 1"))
                version = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar()
                await conn.rollback()
                return version
        finally:
            await engine.dispose()

    try:
        version = asyncio.run(probe(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
    except Exception as exc:  # noqa: BLE001 - a connection error text can hold the host / user
        err(f"Không kết nối được DB ({type(exc).__name__}).",
            "Kiểm tra mạng, DATABASE_URL và mật khẩu trong gói bí mật.")
        return
    ok("Kết nối DB được (SELECT 1, chỉ đọc)")
    if version == head:
        ok(f"alembic_version = {version} (đúng head)")
    else:
        err(f"alembic_version của DB là {version}, code cần {head}.",
            "KHÔNG tự chạy alembic trên DB dùng chung: báo Minh để Minh chạy migration.")


def check_smtp(settings) -> None:
    import smtplib

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
    except smtplib.SMTPAuthenticationError:
        err("SMTP từ chối đăng nhập (SMTPAuthenticationError).",
            "SMTP_PASSWORD phải là App Password 16 ký tự của Gmail (không phải mật khẩu Gmail).")
        return
    except Exception as exc:  # noqa: BLE001
        err(f"Không kết nối được SMTP ({type(exc).__name__}).", "Kiểm tra mạng / SMTP_HOST / SMTP_PORT.")
        return
    ok(f"Đăng nhập SMTP được ({mask_email(settings.SMTP_USER)}), không gửi thư nào")


def main() -> int:
    parser = argparse.ArgumentParser(description="Kiểm tra BE/.env cho tester (chỉ đọc).")
    parser.add_argument("--skip-db", action="store_true", help="không kết nối DB (kiểm tra offline)")
    parser.add_argument("--skip-smtp", action="store_true", help="không thử đăng nhập SMTP")
    args = parser.parse_args()

    print("=== Kiểm tra cấu hình BE (BE\\.env) ===")
    if not ENV_FILE.is_file():
        err("Chưa có BE\\.env.", "Chạy scripts\\setup_tester.ps1 từ thư mục gốc repo.")
        return 1
    env = read_env(ENV_FILE)
    print("\n[1] Biến môi trường")
    check_vars(env)
    print("\n[2] Database")
    check_database_url(env)
    print("\n[3] Firebase")
    check_firebase_file(env)
    print("\n[4] Quy tắc khởi động của BE")
    settings = check_startup_rules()
    print("\n[5] Kết nối thử")
    if settings is None:
        warn("Bỏ qua thử kết nối vì cấu hình chưa đọc được.")
    else:
        if args.skip_db:
            warn("Bỏ qua kiểm tra DB (--skip-db).")
        elif not PLACEHOLDER.search(env.get("DATABASE_URL", "")):
            check_database(settings)
        if args.skip_smtp:
            warn("Bỏ qua kiểm tra SMTP (--skip-smtp).")
        elif not PLACEHOLDER.search(env.get("SMTP_PASSWORD", "")):
            check_smtp(settings)
    print(f"\n=== Kết quả: {ok_count} OK, {warn_count} cảnh báo, {err_count} lỗi ===")
    if err_count:
        print("Sửa các mục [LỖI] ở trên rồi chạy lại: .venv\\Scripts\\python.exe scripts\\check_env.py")
    return 1 if err_count else 0


if __name__ == "__main__":
    sys.exit(main())
