import asyncio
import uuid
import sys
import os

sys.path.append("/app")

from sqlalchemy import select, and_
from app.db.postgres import async_session_maker
from app.models.family.entities import Clan, ClanMembership, ClanJoinRequest, PersonAccountLink
from app.models.genealogy.entities import Person, Relationship
from app.models.user_access.entities import User
from app.controllers.family_management.clan_join_use_cases import (
    review_clan_join_request,
    create_clan_join_request,
    leave_clan,
)
from app.schemas.clan_join import ClanJoinRequestCreate, ClanJoinReviewAction
from app.dependencies.auth import Principal

async def test_approval_and_parent_linking():
    async with async_session_maker() as db:
        print("=== TEST 1: KIỂM TRA PHÊ DUYỆT GIA NHẬP VỚI TÙY CHỌN NỐI PHẢ HỆ ===")
        # Get Mai clan
        clan_stmt = select(Clan).where(Clan.clan_code == "CLAN-MAI-02")
        clan = (await db.execute(clan_stmt)).scalar_one_or_none()
        assert clan is not None, "Mai clan not found"
        print(f"-> Dòng họ: {clan.name} ({clan.clan_id})")

        # Get reviewer from clan.created_by
        admin_stmt = select(User).where(User.user_id == clan.created_by)
        admin = (await db.execute(admin_stmt)).scalar_one_or_none()
        assert admin is not None, "No clan owner found!"
        print(f"-> Người duyệt có thẩm quyền: {admin.display_name} ({admin.email})")

        # Find or create a test applicant user
        applicant_email = f"applicant.{uuid.uuid4().hex[:6]}@gmail.com"
        applicant = User(
            email=applicant_email,
            display_name="Người Thử Nghiệm",
            status="ACTIVE",
        )
        db.add(applicant)
        await db.flush()

        # Create join request
        req_body = ClanJoinRequestCreate(
            clan_id=clan.clan_id,
            lineage_type="MATERNAL",
            full_name="Người Thử Nghiệm",
            birth_date="1995-05-15",
            relative_name="Cụ Mai Thế Hùng",
            relative_relation="Con",
            verification_notes="Là con trai của cụ Mai Thế Hùng",
            consent_given=True,
        )
        applicant_principal = Principal(
            user_id=applicant.user_id,
            session_id=uuid.uuid4(),
            status="ACTIVE",
            requires_password_change=False,
        )
        req = await create_clan_join_request(db, applicant_principal, req_body)
        print(f"-> Tạo yêu cầu gia nhập thành công: {req.request_id} (Trạng thái: {req.status})")

        # Find parent Cụ Mai Thế Hùng
        parent_stmt = select(Person).where(Person.family_id == clan.clan_id, Person.full_name.ilike("%Hùng%"))
        parent = (await db.execute(parent_stmt)).scalars().first()
        assert parent is not None
        print(f"-> Người thân làm phụ mẫu: {parent.full_name} (Đời: {parent.generation})")

        # Admin approves join request with parent_id
        admin_principal = Principal(
            user_id=admin.user_id,
            session_id=uuid.uuid4(),
            status="ACTIVE",
            requires_password_change=False,
        )
        review_body = ClanJoinReviewAction(
            action="APPROVE",
            new_person={
                "full_name": "Người Thử Nghiệm",
                "gender": "male",
                "birth_date": "1995-05-15",
                "parent_id": str(parent.id),
            },
            review_note="Đã xác minh đúng là con cụ Hùng",
        )
        approved_res = await review_clan_join_request(db, admin_principal, clan.clan_id, req.request_id, review_body)
        print(f"-> Phê duyệt thành công! Trạng thái yêu cầu: {approved_res.status}")
        print(f"-> Person được tạo và liên kết: {approved_res.linked_person_name} ({approved_res.linked_person_id})")

        # Verify Relationship in database
        rel_stmt = select(Relationship).where(
            Relationship.family_id == clan.clan_id,
            Relationship.from_member_id == parent.id,
            Relationship.to_member_id == approved_res.linked_person_id,
        )
        rel = (await db.execute(rel_stmt)).scalar_one_or_none()
        assert rel is not None, "Relationship was not created!"
        print(f"-> Quan hệ phụ mẫu ({rel.relationship_type} - {rel.parent_type}) đã được tạo tự động thành công!")

        # Verify Person generation
        person_stmt = select(Person).where(Person.id == approved_res.linked_person_id)
        created_p = (await db.execute(person_stmt)).scalar_one_or_none()
        assert created_p.generation == (parent.generation or 1) + 1
        print(f"-> Thế hệ Person tự động tính đúng: Đời {created_p.generation}")

        print("\n=== TEST 2: KIỂM TRA RỜI DÒNG HỌ VỪA THAM GIA ===")
        leave_res = await leave_clan(db, applicant_principal, clan.clan_id)
        print(f"-> Rời dòng họ: {leave_res['message']}")
        
        # Verify status is REVOKED
        mem_stmt = select(ClanMembership).where(
            ClanMembership.clan_id == clan.clan_id,
            ClanMembership.user_id == applicant.user_id,
        )
        mem = (await db.execute(mem_stmt)).scalar_one_or_none()
        assert mem.status == "REVOKED"
        print("-> Trạng thái thành viên trong database đã cập nhật thành REVOKED!")

        print("\n=== TẤT CẢ CÁC BƯỚC TEST HOÀN TOÀN THÀNH CÔNG! ===")

if __name__ == "__main__":
    asyncio.run(test_approval_and_parent_linking())
