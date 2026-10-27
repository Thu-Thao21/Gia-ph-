import asyncio
import httpx
import uuid

BASE_URL = "http://localhost:8001"

async def test_full_flow():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        print("=== BƯỚC 1: ĐĂNG NHẬP TÀI KHOẢN QUÂN (ĐANG THAM GIA 2 DÒNG TỘC) ===")
        login_res = await client.post("/auth/login", json={
            "email": "quankophaiwibu@gmail.com",
            "password": "Admin@123"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("-> Đăng nhập thành công, nhận Bearer token.")

        from app.db.postgres import async_session_maker
        from app.models.genealogy.entities import Relationship, Person
        from sqlalchemy import select, delete

        # Reset Quan's relationship to test unconnected state
        quan_id = uuid.UUID("4ecdf217-e28b-4c40-9056-71c7da446047")
        async with async_session_maker() as db:
            await db.execute(delete(Relationship).where(Relationship.to_member_id == quan_id))
            await db.commit()

        print("\n=== BƯỚC 2: KIỂM TRA HIỆN DIỆN THÀNH VIÊN TRONG CÂY VÀ TRẠNG THÁI CHƯA NỐI PHẢ HỆ ===")
        # Mai Clan ID: c0000000-0000-0000-0000-000000000002
        mai_clan_id = "c0000000-0000-0000-0000-000000000002"
        members_res = await client.get(f"/members?family_id={mai_clan_id}&limit=100", headers=headers)
        assert members_res.status_code == 200, f"Get members failed: {members_res.text}"
        items = members_res.json()["items"]
        
        quan_in_mai = next((m for m in items if m["fullName"] == "Trần Văn Quân"), None)
        assert quan_in_mai is not None, "Không tìm thấy Trần Văn Quân trong cây gia phả Mai Thế Tộc!"
        print(f"-> Tìm thấy hồ sơ trong cây: {quan_in_mai['fullName']} (ID: {quan_in_mai['id']})")
        print(f"-> Trạng thái isUnconnected: {quan_in_mai.get('isUnconnected')} (Chưa nối phả hệ)")
        print(f"-> Cha: {quan_in_mai.get('fatherId')}, Mẹ: {quan_in_mai.get('motherId')}, Vợ/Chồng: {quan_in_mai.get('spouseId')}")
        assert quan_in_mai.get("isUnconnected") is True, "Hồ sơ mới phải có isUnconnected=True vì chưa xác nhận quan hệ!"

        print("\n=== BƯỚC 3: THỬ NGHIỆM XÁC NHẬN MỐI QUAN HỆ (NỐI VÀO PHẢ HỆ) ===")
        # Tìm một người lớn tuổi hơn trong họ Mai để làm cha/mẹ (ví dụ Mai Phúc Hậu)
        mai_phuc_hau = next((m for m in items if "Mai" in m["fullName"] and m["id"] != quan_in_mai["id"]), None)
        assert mai_phuc_hau is not None, "Không tìm thấy thành viên họ Mai để kết nối quan hệ!"
        print(f"-> Chọn thành viên trong họ: {mai_phuc_hau['fullName']} (ID: {mai_phuc_hau['id']}, Đời: {mai_phuc_hau.get('generation')})")

        # Thực hiện kết nối qua relocate
        relocate_res = await client.post(
            f"/members/{quan_in_mai['id']}/relocate",
            json={"newParentId": mai_phuc_hau["id"]},
            headers=headers
        )
        assert relocate_res.status_code == 200, f"Relocate failed: {relocate_res.text}"
        print(f"-> Phản hồi sau khi nối quan hệ: {relocate_res.json()['message']}")

        # Kiểm tra lại danh sách thành viên: isUnconnected phải chuyển thành False và fatherId được gán!
        members_after_res = await client.get(f"/members?family_id={mai_clan_id}&limit=100", headers=headers)
        items_after = members_after_res.json()["items"]
        quan_updated = next((m for m in items_after if m["id"] == quan_in_mai["id"]), None)
        assert quan_updated is not None
        print(f"-> Sau khi xác nhận quan hệ:")
        print(f"   + Cha (fatherId): {quan_updated.get('fatherId')}")
        print(f"   + Thế hệ: {quan_updated.get('generation')}")
        print(f"   + isUnconnected: {quan_updated.get('isUnconnected')} (Đã nối phả hệ -> đường nối trên cây sẽ xuất hiện!)")
        assert quan_updated.get("isUnconnected") is False, "isUnconnected phải là False sau khi đã kết nối quan hệ!"
        assert quan_updated.get("fatherId") == mai_phuc_hau["id"]

        # Sau khi test xong, reset lại relationship để giữ đúng trạng thái CHƯA NỐI PHẢ HỆ cho người dùng xem trên UI:
        async with async_session_maker() as db:
            await db.execute(delete(Relationship).where(Relationship.to_member_id == quan_id))
            await db.commit()
        print("-> Đã đưa tài khoản Trần Văn Quân về trạng thái gốc chưa nối quan hệ để người dùng trải nghiệm trên giao diện.")

        print("\n=== BƯỚC 4: THỬ NGHIỆM CHỨC NĂNG 'RỜI DÒNG HỌ' (LEAVE CLAN) ===")
        # 1. Thử rời một dòng họ mà tài khoản không tham gia
        fake_clan_id = str(uuid.uuid4())
        try_leave_fake = await client.post(f"/api/v1/my-clans/{fake_clan_id}/leave", headers=headers)
        assert try_leave_fake.status_code == 404
        print(f"-> Thử rời dòng họ không tham gia: Bị từ chối chính xác HTTP {try_leave_fake.status_code} ({try_leave_fake.json()})")

        # 2. Tạo một tài khoản test tham gia dòng họ, sau đó tài khoản này tự rời dòng họ (vào nhầm)
        test_email = f"test.vaonham.{uuid.uuid4().hex[:6]}@gmail.com"
        # Đăng ký tài khoản mới trực tiếp qua DB hoặc test login
        print(f"\n-> Tạo tài khoản kiểm thử rời dòng họ: {test_email}")
        from app.db.postgres import async_session_maker
        from app.models.user_access.entities import User, Role, UserRole
        from app.models.family.entities import ClanMembership, PersonAccountLink
        from app.models.genealogy.entities import Person
        import bcrypt
        import datetime

        pw_hash = bcrypt.hashpw(b"Test@123456", bcrypt.gensalt()).decode("utf-8")

        async with async_session_maker() as db:
            test_user = User(
                email=test_email,
                display_name="Người Dùng Vào Nhầm",
                status="ACTIVE",
                email_verified=True,
            )
            db.add(test_user)
            await db.flush()

            from app.models.user_access.entities import CredentialMetadata
            cred = CredentialMetadata(
                user_id=test_user.user_id,
                auth_provider="LOCAL",
                password_hash=pw_hash,
                must_change_password=False,
            )
            db.add(cred)

            # Gán membership vào Mai Thế Tộc
            mem = ClanMembership(
                clan_id=uuid.UUID(mai_clan_id),
                user_id=test_user.user_id,
                status="ACTIVE",
                lineage_type="MATERNAL",
                joined_at=datetime.datetime.now(datetime.timezone.utc),
            )
            db.add(mem)

            # Role FAMILY_MEMBER
            r_stmt = await db.execute(Role.__table__.select().where(Role.code == "FAMILY_MEMBER"))
            r_row = r_stmt.first()
            if r_row:
                db.add(UserRole(
                    user_id=test_user.user_id,
                    role_id=r_row.role_id,
                    clan_id=uuid.UUID(mai_clan_id),
                ))

            await db.commit()
            test_uid = test_user.user_id

        # Đăng nhập bằng tài khoản test này
        test_login = await client.post("/auth/login", json={
            "email": test_email,
            "password": "Test@123456"
        })
        assert test_login.status_code == 200, f"Test login failed: {test_login.text}"
        test_token = test_login.json()["access_token"]
        test_headers = {"Authorization": f"Bearer {test_token}"}

        # Kiểm tra danh sách dòng họ đã tham gia
        summary_res = await client.get("/api/v1/my-clans/summary", headers=test_headers)
        assert summary_res.status_code == 200
        joined = summary_res.json()["joined_clans"]
        assert any(c["clan_id"] == mai_clan_id for c in joined), "Tài khoản test phải có trong dòng họ Mai!"
        print(f"-> Tài khoản test đã gia nhập dòng họ Mai Thế Tộc thành công.")

        # Bây giờ tài khoản test thực hiện RỜI DÒNG HỌ NÀY
        leave_res = await client.post(f"/api/v1/my-clans/{mai_clan_id}/leave", headers=test_headers)
        assert leave_res.status_code == 200, f"Leave clan failed: {leave_res.text}"
        print(f"-> Rời dòng họ thành công: {leave_res.json()['message']}")

        # Kiểm tra lại danh sách dòng họ đã tham gia: phải trống!
        summary_after = await client.get("/api/v1/my-clans/summary", headers=test_headers)
        joined_after = summary_after.json()["joined_clans"]
        assert not any(c["clan_id"] == mai_clan_id for c in joined_after), "Dòng họ Mai không còn xuất hiện trong danh sách dòng họ đã tham gia!"
        print("-> Xác minh: Dòng họ đã bị loại bỏ khỏi danh sách thành viên thành công!")

        # Kiểm tra trạng thái trong DB
        async with async_session_maker() as db:
            from sqlalchemy import select
            m_chk = (await db.execute(select(ClanMembership).where(
                ClanMembership.user_id == test_uid,
                ClanMembership.clan_id == uuid.UUID(mai_clan_id)
            ))).scalar_one_or_none()
            assert m_chk is not None
            assert m_chk.status == "REVOKED", f"Membership status phải là REVOKED, thực tế là: {m_chk.status}"
            print(f"-> Trạng thái ClanMembership trong database: {m_chk.status}")

        print("\n=== TẤT CẢ CÁC BƯỚC KIỂM THỬ TÍCH HỢP HOÀN TOÀN THÀNH CÔNG ===")

if __name__ == "__main__":
    asyncio.run(test_full_flow())
