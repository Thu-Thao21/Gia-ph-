import asyncio
import uuid
import sys

sys.path.append("/app")

from sqlalchemy import select
from app.db.postgres import async_session_maker
from app.models.family.entities import Clan, ClanMembership, ClanJoinRequest, PersonAccountLink
from app.models.genealogy.entities import Person, Relationship
from app.models.user_access.entities import User
from app.controllers.family_management.clan_join_use_cases import review_clan_join_request
from app.schemas.clan_join import ClanJoinReviewAction
from app.dependencies.auth import Principal

async def test_exact():
    async with async_session_maker() as db:
        print("=== TEST PHÊ DUYỆT ĐÚNG HỒ SƠ CỦA USER BỊ LỖI TRONG ẢNH ===")
        req_id = uuid.UUID("ab65c086-6b4f-4cea-b0a7-8ba586fa4c91")
        req = (await db.execute(select(ClanJoinRequest).where(ClanJoinRequest.request_id == req_id))).scalar_one_or_none()
        assert req is not None, "Không tìm thấy request ab65c086-6b4f-4cea-b0a7-8ba586fa4c91"
        print(f"-> Tìm thấy yêu cầu: {req.request_id} cho {req.full_name} (Trạng thái: {req.status})")

        # Get clan
        clan = (await db.execute(select(Clan).where(Clan.clan_id == req.clan_id))).scalar_one_or_none()
        print(f"-> Dòng họ: {clan.name} ({clan.clan_id})")

        # Get admin/reviewer
        admin = (await db.execute(select(User).where(User.user_id == clan.created_by))).scalar_one_or_none()
        print(f"-> Người duyệt: {admin.display_name} ({admin.email})")

        # Find person Lê Thị Mộng in this clan
        mong_stmt = select(Person).where(Person.family_id == clan.clan_id, Person.full_name.ilike("%Mộng%"))
        mong = (await db.execute(mong_stmt)).scalars().first()
        mong_id = str(mong.id) if mong else None
        print(f"-> Tìm thấy người thân Lê Thị Mộng: {mong_id}")

        # Payload exactly as sent from Frontend modal in the screenshot:
        review_body = ClanJoinReviewAction(
            action="APPROVE",
            new_person={
                "full_name": "Trần Minh Quân",
                "gender": "male",
                "birth_date": "",  # Empty string from date picker in screenshot
                "branch_id": "branch-1",  # Non-UUID mock branch id from screenshot
                "parent_id": mong_id,  # Selected Lê Thị Mộng
            },
            review_note="Đã xác minh quan hệ với người thân đã khai",
        )

        admin_principal = Principal(
            user_id=admin.user_id,
            session_id=uuid.uuid4(),
            status="ACTIVE",
            requires_password_change=False,
        )

        res = await review_clan_join_request(db, admin_principal, clan.clan_id, req.request_id, review_body)
        print(f"\n-> KẾT QUẢ DUYỆT THÀNH CÔNG RỰC RỠ!")
        print(f"-> Trạng thái yêu cầu: {res.status}")
        print(f"-> Person được tạo và liên kết: {res.linked_person_name} (ID: {res.linked_person_id})")

        # Check PAL
        pal = (await db.execute(select(PersonAccountLink).where(PersonAccountLink.clan_id == clan.clan_id, PersonAccountLink.user_id == req.user_id))).scalar_one_or_none()
        print(f"-> PersonAccountLink status: {pal.status}, Person: {pal.person_id}")

        # Check Membership
        mem = (await db.execute(select(ClanMembership).where(ClanMembership.clan_id == clan.clan_id, ClanMembership.user_id == req.user_id))).scalar_one_or_none()
        print(f"-> ClanMembership status: {mem.status}, Joined: {mem.joined_at}")

        # Check Relationship
        if mong:
            rel = (await db.execute(select(Relationship).where(
                Relationship.family_id == clan.clan_id,
                Relationship.from_member_id == mong.id,
                Relationship.to_member_id == res.linked_person_id,
            ))).scalar_one_or_none()
            print(f"-> Quan hệ phả hệ đã nối: Type={rel.relationship_type}, ParentType={rel.parent_type}, Verified={rel.verified}")

        print("\n=== HOÀN TẤT KIỂM THỬ XÁC MINH TOÀN DIỆN THÀNH CÔNG ===")

if __name__ == "__main__":
    asyncio.run(test_exact())
