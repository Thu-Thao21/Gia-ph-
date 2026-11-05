"""Script: Verify System Health & MVC Route Inventory.
Kiểm tra tính sẵn sàng của hệ thống MFGMS-AI:
- Kết nối PostgreSQL Neon DB
- Kiểm tra tính đầy đủ của 8 Controllers (C01 - C08)
- Kiểm tra cấu hình Gemini API Key
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Load .env
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.db.postgres import check_db
from app.main import app
from app.core.config import settings


async def main():
    print("=" * 60)
    print("MFGMS-AI SYSTEM HEALTH CHECK")
    print("=" * 60)

    # 1. DB Check
    print("[1/3] Kiểm tra kết nối Neon Database...")
    try:
        await check_db()
        print("  -> Neon DB: KẾT NỐI THÀNH CÔNG (OK)")
    except Exception as e:
        print(f"  -> Neon DB: LỖI KẾT NỐI ({e})")

    # 2. Controllers Check
    print("[2/3] Kiểm tra 8 Controllers (C01 - C08)...")
    routes = [r.path for r in app.routes]
    
    controllers = {
        "C01. Auth & Access": any("/auth" in r for r in routes),
        "C02. Family Management": any("/clans" in r or "/families" in r for r in routes),
        "C03. Genealogy": any("/members" in r or "/tree" in r for r in routes),
        "C04. Inter-Family": any("/inter-clan" in r or "/networks" in r for r in routes),
        "C05. Activity & Fund": any("/notifications" in r or "/activities" in r for r in routes),
        "C06. Worship Space": any("/locations" in r for r in routes),
        "C07. Archive & Media": any("/documents" in r for r in routes),
        "C08. AI Assistant": any("/ai/" in r for r in routes),
    }

    for name, is_present in controllers.items():
        status = "ĐÃ ĐĂNG KÝ (OK)" if is_present else "CHƯA ĐĂNG KÝ"
        print(f"  -> {name}: {status}")

    # 3. AI Gemini Configuration
    print("[3/3] Kiểm tra cấu hình Gemini AI...")
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        masked_key = gemini_key[:4] + "..." + gemini_key[-4:]
        print(f"  -> GEMINI_API_KEY: ĐÃ CẤU HÌNH ({masked_key})")
    else:
        print("  -> GEMINI_API_KEY: CHƯA CẤU HÌNH (Dùng Mock)")

    print("=" * 60)
    print("HOÀN TẤT KIỂM TRA HỆ THỐNG")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())

