"""
Script: Xóa toàn bộ dữ liệu thành viên gia phả (Persons, Relationships, Closures)
thuộc các dòng họ được chỉ định.
Bảo toàn hoàn toàn:
- Tài khoản người dùng (users, user_roles, roles)
- Hồ sơ dòng họ (clans, clan_profiles, subscription, clan_memberships)
- Toàn bộ Schema hệ thống
"""

import asyncio
import os
import sys
from dotenv import load_dotenv

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

be_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, be_dir)
load_dotenv(os.path.join(be_dir, ".env"))

from app.db.postgres import async_session_maker
from sqlalchemy import text

TARGET_CLAN_IDS = [
    "c0000000-0000-0000-0000-000000000001",  # Võ Đại Tộc (Gò Nổi - Quảng Nam)
    "c0000000-0000-0000-0000-000000000002",  # Mai Thế Tộc (Phong Điền - Thừa Thiên Huế)
]


async def delete_members():
    async with async_session_maker() as db:
        print("=== BẮT ĐẦU XÓA DỮ LIỆU THÀNH VIÊN GIA PHẢ ===")
        
        # 1. Kiểm tra trước khi xóa
        clans_query = text(
            "SELECT clan_id, name FROM clans WHERE clan_id::text = ANY(:clan_ids)"
        )
        clans = (await db.execute(clans_query, {"clan_ids": TARGET_CLAN_IDS})).all()
        print("Dòng họ mục tiêu:")
        for c in clans:
            print(f" - {c[1]} ({c[0]})")

        persons_before = (await db.execute(
            text("SELECT count(*) FROM persons WHERE clan_id::text = ANY(:clan_ids)"),
            {"clan_ids": TARGET_CLAN_IDS}
        )).scalar()
        print(f"Số lượng thành viên (persons) trước khi xóa: {persons_before}")

        rels_before = (await db.execute(
            text("SELECT count(*) FROM relationships WHERE clan_id::text = ANY(:clan_ids)"),
            {"clan_ids": TARGET_CLAN_IDS}
        )).scalar()
        print(f"Số lượng quan hệ (relationships) trước khi xóa: {rels_before}")

        # 2. Xóa các quan hệ gia phả trước (cho chắc chắn)
        del_rels = (await db.execute(
            text("DELETE FROM relationships WHERE clan_id::text = ANY(:clan_ids)"),
            {"clan_ids": TARGET_CLAN_IDS}
        )).rowcount
        print(f"-> Đã xóa {del_rels} quan hệ trong relationships.")

        # 3. Xóa các thành viên gia phả (các bảng cascaded như person_closure, person_account_links, inter_clan_person_mappings, lineage_access sẽ tự cascade)
        del_persons = (await db.execute(
            text("DELETE FROM persons WHERE clan_id::text = ANY(:clan_ids)"),
            {"clan_ids": TARGET_CLAN_IDS}
        )).rowcount
        print(f"-> Đã xóa {del_persons} thành viên trong persons.")

        # 4. Đảm bảo founder_person_id trong clan_profiles được set NULL
        await db.execute(
            text("UPDATE clan_profiles SET founder_person_id = NULL WHERE clan_id::text = ANY(:clan_ids)"),
            {"clan_ids": TARGET_CLAN_IDS}
        )

        await db.commit()
        print("Commit thành công vào Database!")

        # 5. Kiểm tra lại sau khi xóa
        persons_after = (await db.execute(text("SELECT count(*) FROM persons"))).scalar()
        rels_after = (await db.execute(text("SELECT count(*) FROM relationships"))).scalar()
        closure_after = (await db.execute(text("SELECT count(*) FROM person_closure"))).scalar()
        pal_after = (await db.execute(text("SELECT count(*) FROM person_account_links"))).scalar()
        clans_count = (await db.execute(text("SELECT count(*) FROM clans"))).scalar()

        print("\n=== KẾT QUẢ SAU KHI XÓA ===")
        print(f"Tổng thành viên còn lại trong toàn DB: {persons_after}")
        print(f"Tổng quan hệ còn lại trong toàn DB: {rels_after}")
        print(f"Tổng closure rows còn lại: {closure_after}")
        print(f"Tổng person_account_links còn lại: {pal_after}")
        print(f"Tổng dòng họ vẫn được giữ nguyên: {clans_count}")
        print("=== HOÀN TẤT XÓA DỮ LIỆU THÀNH VIÊN GIA PHẢ ===")


if __name__ == "__main__":
    asyncio.run(delete_members())
