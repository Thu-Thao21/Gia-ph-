"""Script kiểm thử toàn diện 10 bước: Liên kết hôn nhân và Mạng lưới liên họ hai chiều (MFGMS-AI).

Kịch bản:
- Cặp đôi: Mai Phúc Hậu (Mai Thế Tộc) & Dương Thị Thu Thảo (Dòng Họ Dương).
- Hai chiều phê duyệt độc lập:
  * Chiều 1: Hậu gửi Trưởng tộc họ Mai xin cấp quyền cho Thảo xem họ Mai.
  * Chiều 2: Thảo gửi Trưởng tộc họ Dương xin cấp quyền cho Hậu xem họ Dương.
- Bảo mật 4 đời, chống rò rỉ dữ liệu, thu hồi quyền tức thì và cascade khi ly hôn.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv

be_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, be_dir)
load_dotenv(os.path.join(be_dir, ".env"))

from app.db.postgres import async_session_maker
from sqlalchemy import select, and_, or_
from app.models.user_access.entities import User, Role, UserRole, AuditLog
from app.models.family.entities import Clan, PersonAccountLink, ClanMembership
from app.models.genealogy.entities import Person, Relationship
from app.models.inter_family.entities import (
    InterClanLink,
    InterClanPersonMapping,
    LineageAccessRequest,
    LineageAccessGrant,
    InterClanSharedPolicy,
)
from app.schemas.inter_family import (
    MarriageInvitationCreate,
    MarriageInvitationRespond,
    LineageAccessRequestCreate,
    LineageAccessReviewRequest,
    LineageAccessRevokeRequest,
)
from app.services.auth_access.access_service import AccessService
from app.models.inter_family.repository import InterFamilyRepository
from app.controllers.inter_family.router import (
    Caller,
    PersonMappingReview,
    PersonMappingRevoke,
    create_marriage_invitation,
    respond_marriage_invitation,
    review_person_mapping,
    revoke_person_mapping,
    create_lineage_access_request,
    review_lineage_access_request,
    revoke_lineage_access_grant,
    get_my_family_network,
    get_dual_lineage,
)
from fastapi import HTTPException


async def run_verification():
    print("=" * 80)
    print("BẮT ĐẦU KIỂM THỬ TOÀN DIỆN 10 BƯỚC: LIÊN HỌ & HÔN PHỐI HAI CHIỀU ĐỘC LẬP")
    print("=" * 80)

    async with async_session_maker() as db:
        # 0. Chuẩn bị tài khoản và hồ sơ
        # 0.1 Thảo (Dòng Họ Dương)
        stmt_thao = (
            select(User, PersonAccountLink, Person, Clan)
            .join(PersonAccountLink, PersonAccountLink.user_id == User.user_id)
            .join(Person, Person.id == PersonAccountLink.person_id)
            .join(Clan, Clan.clan_id == Person.family_id)
            .where(User.email == "thaoduong.07082005@gmail.com")
        )
        res_thao = (await db.execute(stmt_thao)).first()
        assert res_thao, "Không tìm thấy tài khoản Dương Thị Thu Thảo"
        user_thao, link_thao, person_thao, clan_duong = res_thao

        # 0.2 Hậu (Mai Thế Tộc)
        user_hau = (
            await db.execute(
                select(User).where(User.email == "maiphuchau144@gmail.com")
            )
        ).scalar_one_or_none()
        assert user_hau, "Không tìm thấy user Mai Phúc Hậu"

        # Lấy person Mai Phúc Hậu liên kết với user_hau
        stmt_hau = (
            select(Person, Clan)
            .join(PersonAccountLink, PersonAccountLink.person_id == Person.id)
            .join(Clan, Clan.clan_id == Person.family_id)
            .where(
                PersonAccountLink.user_id == user_hau.user_id,
                PersonAccountLink.status == "ACTIVE",
            )
        )
        res_hau = (await db.execute(stmt_hau)).first()
        assert res_hau, "Không tìm thấy hồ sơ Person liên kết với Mai Phúc Hậu"
        person_hau, clan_mai = res_hau

        # Đảm bảo ClanMembership cho Hậu trong Mai Thế Tộc
        cm_hau = (
            await db.execute(
                select(ClanMembership).where(
                    ClanMembership.user_id == user_hau.user_id,
                    ClanMembership.clan_id == clan_mai.clan_id,
                )
            )
        ).scalar_one_or_none()
        if not cm_hau:
            cm_hau = ClanMembership(
                membership_id=uuid.uuid4(),
                clan_id=clan_mai.clan_id,
                user_id=user_hau.user_id,
                status="ACTIVE",
            )
            db.add(cm_hau)
            await db.flush()

        # 0.3 Trưởng tộc họ Mai và Trưởng tộc họ Dương
        admin_mai_user = (
            await db.execute(
                select(User).where(User.email == "mai.phongdien@giapha.com")
            )
        ).scalar_one()
        admin_duong_user = (
            await db.execute(
                select(User).where(User.email == "duong@giapha.com")
            )
        ).scalar_one()

        # Đảm bảo InterClanLink giữa Họ Dương và Họ Mai
        stmt_link = select(InterClanLink).where(
            (
                (InterClanLink.clan_a_id == clan_duong.clan_id)
                & (InterClanLink.clan_b_id == clan_mai.clan_id)
            )
            | (
                (InterClanLink.clan_b_id == clan_duong.clan_id)
                & (InterClanLink.clan_a_id == clan_mai.clan_id)
            )
        )
        clan_link = (await db.execute(stmt_link)).scalar_one_or_none()
        if not clan_link:
            clan_link = InterClanLink(
                id=uuid.uuid4(),
                clan_a_id=clan_duong.clan_id,
                clan_b_id=clan_mai.clan_id,
                connection_type="IN_LAW",
                status="ACTIVE",
                linked_at=datetime.now(timezone.utc),
            )
            db.add(clan_link)
            await db.flush()

        # Dọn dẹp dữ liệu cũ để test sạch từ đầu
        await db.execute(
            select(InterClanPersonMapping).where(
                (
                    (InterClanPersonMapping.person_a_id == person_thao.id)
                    & (InterClanPersonMapping.person_b_id == person_hau.id)
                )
                | (
                    (InterClanPersonMapping.person_b_id == person_thao.id)
                    & (InterClanPersonMapping.person_a_id == person_hau.id)
                )
            )
        )
        # Xóa grants và requests cũ của cặp đôi
        existing_grants = (
            await db.execute(
                select(LineageAccessGrant).where(
                    LineageAccessGrant.grantee_user_id.in_([
                        user_thao.user_id,
                        user_hau.user_id,
                    ])
                )
            )
        ).scalars().all()
        for g in existing_grants:
            await db.delete(g)

        existing_reqs = (
            await db.execute(
                select(LineageAccessRequest).where(
                    LineageAccessRequest.grantee_user_id.in_([
                        user_thao.user_id,
                        user_hau.user_id,
                    ])
                )
            )
        ).scalars().all()
        for r in existing_reqs:
            await db.delete(r)

        existing_maps = (
            await db.execute(
                select(InterClanPersonMapping).where(
                    (
                        (InterClanPersonMapping.person_a_id == person_thao.id)
                        & (InterClanPersonMapping.person_b_id == person_hau.id)
                    )
                    | (
                        (InterClanPersonMapping.person_b_id == person_thao.id)
                        & (InterClanPersonMapping.person_a_id == person_hau.id)
                    )
                )
            )
        ).scalars().all()
        for m in existing_maps:
            await db.delete(m)

        await db.commit()

        # Tạo Callers
        access = AccessService(db)
        caller_hau = Caller(
            account=user_hau,
            access=access,
            is_sa=False,
            clans={clan_mai.clan_id},
        )
        caller_thao = Caller(
            account=user_thao,
            access=access,
            is_sa=False,
            clans={clan_duong.clan_id},
        )
        caller_admin_mai = Caller(
            account=admin_mai_user,
            access=access,
            is_sa=False,
            clans={clan_mai.clan_id},
        )
        caller_admin_duong = Caller(
            account=admin_duong_user,
            access=access,
            is_sa=False,
            clans={clan_duong.clan_id},
        )

        print(f"  ✓ Chuẩn bị môi trường sạch:")
        print(f"    - Thảo: {person_thao.full_name} ({clan_duong.name})")
        print(f"    - Hậu:  {person_hau.full_name} ({clan_mai.name})")

        # ----------------------------------------------------------------------
        # BƯỚC 1: Hậu gửi lời mời kết nối hôn phối liên họ đến Thảo
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 1: HẬU GỬI LỜI MỜI KẾT NỐI HÔN PHỐI ĐẾN THẢO ---")
        inv_res = await create_marriage_invitation(
            data=MarriageInvitationCreate(
                target_person_id=person_thao.id,
                notes="Mai Phúc Hậu gửi lời mời kết nối hôn phối với Dương Thị Thu Thảo.",
            ),
            caller=caller_hau,
            db=db,
        )
        mapping_id = inv_res.id
        print(f"  ✓ Lời mời khởi tạo thành công:")
        print(f"    - Mapping ID: {mapping_id}")
        print(f"    - Status: {inv_res.status} (Chờ đối phương xác nhận)")
        assert inv_res.status == "AWAITING_SPOUSE"

        # ----------------------------------------------------------------------
        # BƯỚC 2: Thảo nhận và chấp nhận (ACCEPT) lời mời hôn phối
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 2: THẢO XÁC NHẬN LỜI MỜI HÔN PHỐI ---")
        resp_res = await respond_marriage_invitation(
            mapping_id=mapping_id,
            data=MarriageInvitationRespond(
                action="ACCEPT",
                notes="Dương Thị Thu Thảo đồng ý xác nhận quan hệ hôn phối.",
            ),
            caller=caller_thao,
            db=db,
        )
        print(f"  ✓ Thảo đã chấp nhận lời mời:")
        print(f"    - Status chuyển thành: {resp_res.status} (Chờ Quản trị viên 2 họ xác minh)")
        assert resp_res.status == "PENDING"

        # Thử gửi xin xem gia phả khi chưa xác minh -> Phải bị chặn 400
        print("  ✓ Kiểm tra bảo mật: Chặn xin quyền xem gia phả khi hôn nhân chưa VERIFIED...")
        try:
            await create_lineage_access_request(
                data=LineageAccessRequestCreate(
                    anchor_person_id=person_thao.id,
                    reason="Hậu xin cấp quyền trước khi xác minh",
                ),
                caller=caller_hau,
                db=db,
            )
            assert False, "Lẽ ra phải chặn vì hôn nhân chưa VERIFIED!"
        except HTTPException as ex:
            print(f"    => Chặn thành công [HTTP {ex.status_code}]: {ex.detail}")
            assert ex.status_code == 400

        # ----------------------------------------------------------------------
        # BƯỚC 3: Quản trị viên (Trưởng tộc) xác minh quan hệ hôn phối chính danh
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 3: TRƯỞNG TỘC XÁC MINH QUAN HỆ HÔN PHỐI ---")
        repo = InterFamilyRepository(db)
        verified_map = await review_person_mapping(
            mapping_id=str(mapping_id),
            data=PersonMappingReview(action="VERIFY"),
            caller=caller_admin_duong,
            repo=repo,
            db=db,
        )
        print(f"  ✓ Trưởng tộc họ Dương đã xác minh:")
        print(f"    - Mapping Status: {verified_map.status}")
        assert verified_map.status == "VERIFIED"

        # Xác minh: Person Thảo vẫn thuộc Họ Dương, Person Hậu vẫn thuộc Họ Mai (Không gộp bảng, không trùng lặp)
        p_thao_check = (await db.execute(select(Person).where(Person.id == person_thao.id))).scalar_one()
        p_hau_check = (await db.execute(select(Person).where(Person.id == person_hau.id))).scalar_one()
        assert p_thao_check.family_id == clan_duong.clan_id
        assert p_hau_check.family_id == clan_mai.clan_id
        print("  ✓ Độc lập dữ liệu: Mỗi Person giữ nguyên dòng họ gốc, không trùng lặp hồ sơ.")

        # ----------------------------------------------------------------------
        # BƯỚC 4: Chiều 1 - Hậu gửi yêu cầu lên Trưởng tộc họ Mai xin cấp quyền cho Thảo
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 4: CHIỀU 1 - HẬU GỬI TRƯỞNG TỘC HỌ MAI XIN CẤP QUYỀN CHO THẢO ---")
        req_mai = await create_lineage_access_request(
            data=LineageAccessRequestCreate(
                anchor_person_id=person_thao.id,
                reason="Hậu kính gửi Trưởng tộc họ Mai xin cấp quyền cho vợ (Dương Thị Thu Thảo) xem gia phả họ Mai.",
            ),
            caller=caller_hau,
            db=db,
        )
        print(f"  ✓ Yêu cầu gửi Trưởng tộc họ Mai thành công:")
        print(f"    - Request ID: {req_mai.id}")
        print(f"    - Owner Clan ID (Họ Mai): {req_mai.owner_clan_id}")
        print(f"    - Requester (Hậu): {req_mai.requester_user_id}")
        print(f"    - Grantee (Thảo): {req_mai.grantee_user_id}")
        print(f"    - Status: {req_mai.status}")
        assert req_mai.owner_clan_id == clan_mai.clan_id
        assert req_mai.grantee_user_id == user_thao.user_id
        assert req_mai.status == "PENDING"

        # Trưởng tộc họ Mai duyệt yêu cầu
        print("  ✓ Trưởng tộc họ Mai xem xét và phê duyệt...")
        grant_mai_req = await review_lineage_access_request(
            request_id=req_mai.id,
            data=LineageAccessReviewRequest(action="APPROVE"),
            caller=caller_admin_mai,
            db=db,
        )
        print(f"    => Trưởng tộc họ Mai đã PHÊ DUYỆT! Request ID: {grant_mai_req.id}, Status: {grant_mai_req.status}")
        assert grant_mai_req.status == "APPROVED"

        grant_mai = (
            await db.execute(
                select(LineageAccessGrant).where(
                    LineageAccessGrant.request_id == req_mai.id,
                    LineageAccessGrant.status == "ACTIVE",
                )
            )
        ).scalar_one()
        assert grant_mai.status == "ACTIVE"

        # ----------------------------------------------------------------------
        # BƯỚC 5: Kiểm tra độc lập hai chiều (Bilateral Independence)
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 5: KIỂM TRA ĐỘC LẬP HAI CHIỀU (BILATERAL INDEPENDENCE) ---")
        # Thảo xem My Family Network -> Nhánh họ Mai được mở rộng 4 đời
        net_thao = await get_my_family_network(
            clan_id=clan_duong.clan_id,
            caller=caller_thao,
            db=db,
        )
        spouse_clan_thao = net_thao.get("spouseClan")
        print(f"  ✓ Thảo xem sơ đồ mạng lưới:")
        print(f"    - Dòng họ gốc (Natal): {net_thao['natalClan']['name']}")
        print(f"    - Dòng họ bên chồng (Spouse Clan): {spouse_clan_thao['name'] if spouse_clan_thao else 'None'}")
        print(f"    - Quyền truy cập bên chồng (isSharingAllowed): {spouse_clan_thao['isSharingAllowed']}")
        print(f"    - Trạng thái Grant (grantStatus): {spouse_clan_thao['grantStatus']}")
        assert spouse_clan_thao["isSharingAllowed"] is True
        assert spouse_clan_thao["grantStatus"] == "APPROVED"

        # Kiểm tra Hậu xem My Family Network -> Nhánh họ Dương CHƯA được mở rộng!
        net_hau = await get_my_family_network(
            clan_id=clan_mai.clan_id,
            caller=caller_hau,
            db=db,
        )
        spouse_clan_hau = net_hau.get("spouseClan")
        print(f"  ✓ Hậu xem sơ đồ mạng lưới:")
        print(f"    - Dòng họ gốc (Natal): {net_hau['natalClan']['name']}")
        print(f"    - Dòng họ bên vợ (Spouse Clan): {spouse_clan_hau['name'] if spouse_clan_hau else 'None'}")
        print(f"    - Quyền truy cập bên vợ (isSharingAllowed): {spouse_clan_hau['isSharingAllowed']}")
        print(f"    - Trạng thái Grant (grantStatus): {spouse_clan_hau['grantStatus']}")
        assert spouse_clan_hau["isSharingAllowed"] is False
        assert spouse_clan_hau["grantStatus"] == "NONE"
        print("  ✓ ĐỘC LẬP HAI CHIỀU ĐÃ ĐƯỢC CHỨNG MINH TUYỆT ĐỐI!")

        # ----------------------------------------------------------------------
        # BƯỚC 6: Chiều 2 - Thảo gửi yêu cầu lên Trưởng tộc họ Dương xin cấp quyền cho Hậu
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 6: CHIỀU 2 - THẢO GỬI TRƯỞNG TỘC HỌ DƯƠNG XIN CẤP QUYỀN CHO HẬU ---")
        req_duong = await create_lineage_access_request(
            data=LineageAccessRequestCreate(
                anchor_person_id=person_hau.id,
                reason="Thảo kính gửi Trưởng tộc họ Dương xin cấp quyền cho chồng (Mai Phúc Hậu) xem gia phả họ Dương.",
            ),
            caller=caller_thao,
            db=db,
        )
        print(f"  ✓ Yêu cầu gửi Trưởng tộc họ Dương thành công:")
        print(f"    - Request ID: {req_duong.id}")
        print(f"    - Owner Clan ID (Họ Dương): {req_duong.owner_clan_id}")
        print(f"    - Requester (Thảo): {req_duong.requester_user_id}")
        print(f"    - Grantee (Hậu): {req_duong.grantee_user_id}")
        assert req_duong.owner_clan_id == clan_duong.clan_id
        assert req_duong.grantee_user_id == user_hau.user_id

        # Trưởng tộc họ Dương phê duyệt
        print("  ✓ Trưởng tộc họ Dương xem xét và phê duyệt...")
        grant_duong_req = await review_lineage_access_request(
            request_id=req_duong.id,
            data=LineageAccessReviewRequest(action="APPROVE"),
            caller=caller_admin_duong,
            db=db,
        )
        print(f"    => Trưởng tộc họ Dương đã PHÊ DUYỆT! Request ID: {grant_duong_req.id}, Status: {grant_duong_req.status}")
        assert grant_duong_req.status == "APPROVED"

        grant_duong = (
            await db.execute(
                select(LineageAccessGrant).where(
                    LineageAccessGrant.request_id == req_duong.id,
                    LineageAccessGrant.status == "ACTIVE",
                )
            )
        ).scalar_one()
        assert grant_duong.status == "ACTIVE"

        # ----------------------------------------------------------------------
        # BƯỚC 7: Kiểm tra cả 2 chiều đều mở rộng thành công và tuân thủ 4 thế hệ
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 7: KIỂM TRA CẢ 2 CHIỀU ĐÃ MỞ RỘNG ĐẦY ĐỦ VÀ PHẠM VI 4 ĐỜI ---")
        net_hau_after = await get_my_family_network(
            clan_id=clan_mai.clan_id,
            caller=caller_hau,
            db=db,
        )
        spouse_clan_hau_after = net_hau_after.get("spouseClan")
        print(f"  ✓ Hậu xem sơ đồ sau khi họ Dương duyệt:")
        print(f"    - isSharingAllowed: {spouse_clan_hau_after['isSharingAllowed']}")
        print(f"    - grantStatus: {spouse_clan_hau_after['grantStatus']}")
        assert spouse_clan_hau_after["isSharingAllowed"] is True
        assert spouse_clan_hau_after["grantStatus"] == "APPROVED"

        # Kiểm tra các thế hệ trên canvas (Tối đa 4 thế hệ: Level -2 đến Level +1)
        nodes_levels = [n["relativeLevel"] for n in net_hau_after["nodes"]]
        min_lvl, max_lvl = min(nodes_levels), max(nodes_levels)
        print(f"    - Giới hạn thế hệ hiển thị trên Canvas: Min={min_lvl} (Ông bà), Max={max_lvl} (Con cái)")
        assert min_lvl >= -2, f"Vượt quá giới hạn ông bà: {min_lvl}"
        assert max_lvl <= 1, f"Vượt quá giới hạn con cái: {max_lvl}"

        # ----------------------------------------------------------------------
        # BƯỚC 8: Trưởng tộc họ Mai thu hồi quyền (REVOKE) -> Khóa dữ liệu tức thì
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 8: THU HỒI QUYỀN TRUY CẬP (REVOCATION) & BẢO VỆ TỨC THÌ ---")
        revoked_grant = await revoke_lineage_access_grant(
            grant_id=grant_mai.id,
            data=LineageAccessRevokeRequest(
                revocation_reason="Thu hồi quyền xem gia phả theo quyết định của Hội đồng Trưởng tộc họ Mai."
            ),
            caller=caller_admin_mai,
            db=db,
        )
        print(f"  ✓ Trưởng tộc họ Mai đã thu hồi quyền xem của Thảo:")
        print(f"    - Grant Status: {revoked_grant.status}")
        print(f"    - Reason: {revoked_grant.revocation_reason}")
        assert revoked_grant.status == "REVOKED"

        # Thảo tải lại My Family Network -> Nhánh họ Mai biến mất ngay lập tức!
        net_thao_revoked = await get_my_family_network(
            clan_id=clan_duong.clan_id,
            caller=caller_thao,
            db=db,
        )
        spouse_clan_revoked = net_thao_revoked.get("spouseClan")
        print(f"  ✓ Thảo xem lại mạng lưới sau khi bị thu hồi:")
        print(f"    - isSharingAllowed: {spouse_clan_revoked['isSharingAllowed']}")
        print(f"    - grantStatus: {spouse_clan_revoked['grantStatus']}")
        print(f"    - revocationReason: {spouse_clan_revoked['revocationReason']}")
        assert spouse_clan_revoked["isSharingAllowed"] is False
        assert spouse_clan_revoked["grantStatus"] == "REVOKED"

        # Kiểm tra quyền xem của Hậu đối với họ Dương VẪN HOẠT ĐỘNG (không bị ảnh hưởng)
        net_hau_unaffected = await get_my_family_network(
            clan_id=clan_mai.clan_id,
            caller=caller_hau,
            db=db,
        )
        assert net_hau_unaffected["spouseClan"]["isSharingAllowed"] is True
        print("  ✓ Quyền của Hậu đối với họ Dương vẫn nguyên vẹn (Độc lập thu hồi).")

        # ----------------------------------------------------------------------
        # BƯỚC 9: Cho phép gửi lại yêu cầu xin cấp lại quyền sau khi bị thu hồi
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 9: GỬI LẠI YÊU CẦU XIN CẤP LẠI QUYỀN XEM GIA PHẢ ---")
        re_req = await create_lineage_access_request(
            data=LineageAccessRequestCreate(
                anchor_person_id=person_thao.id,
                reason="Hậu gửi đơn giải trình kính mong Trưởng tộc họ Mai xem xét cấp lại quyền cho Thảo.",
            ),
            caller=caller_hau,
            db=db,
        )
        print(f"  ✓ Gửi lại yêu cầu thành công: Request ID: {re_req.id}, Status: {re_req.status}")
        assert re_req.status == "PENDING"

        # Trưởng tộc họ Mai duyệt lại
        re_grant = await review_lineage_access_request(
            request_id=re_req.id,
            data=LineageAccessReviewRequest(action="APPROVE"),
            caller=caller_admin_mai,
            db=db,
        )
        print(f"  ✓ Trưởng tộc họ Mai phê duyệt cấp lại quyền: Request ID: {re_grant.id}, Status: {re_grant.status}")
        assert re_grant.status == "APPROVED"

        # ----------------------------------------------------------------------
        # BƯỚC 10: Xử lý ly hôn / Hủy kết nối hôn phối -> Tự động Cascade thu hồi tất cả
        # ----------------------------------------------------------------------
        print("\n--- BƯỚC 10: XỬ LÝ LY HÔN / HỦY KẾT NỐI HÔN PHỐI (CASCADE REVOKE) ---")
        rev_mapping = await revoke_person_mapping(
            mapping_id=str(mapping_id),
            data=PersonMappingRevoke(reason="Cặp đôi đã ly hôn và chấm dứt quan hệ hôn phối."),
            caller=caller_admin_mai,
            repo=repo,
            db=db,
        )
        rev_status = rev_mapping.get("status") if isinstance(rev_mapping, dict) else rev_mapping.status
        print(f"  ✓ Đã cập nhật trạng thái hôn phối: Status: {rev_status}")
        assert rev_status == "REVOKED"

        # Kiểm tra tự động cascade thu hồi tất cả Grants liên quan
        grants_after_divorce = (
            await db.execute(
                select(LineageAccessGrant).where(
                    LineageAccessGrant.anchor_person_id.in_([person_thao.id, person_hau.id]),
                    LineageAccessGrant.status == "ACTIVE",
                )
            )
        ).scalars().all()
        print(f"  ✓ Số quyền xem còn ACTIVE sau khi ly hôn: {len(grants_after_divorce)}")
        assert len(grants_after_divorce) == 0, "Khi ly hôn, tất cả các quyền chia sẻ gia phả phải tự động thu hồi!"

        # Kiểm tra AuditLog ghi nhận đầy đủ các sự kiện
        print("\n--- KIỂM TRA NHẬT KÝ KIỂM TOÁN (AUDIT LOGS) ---")
        audit_records = (
            await db.execute(
                select(AuditLog)
                .where(
                    AuditLog.action.in_([
                        "marriage_invitation.create",
                        "marriage_invitation.respond",
                        "person_mapping.review",
                        "lineage_access.request",
                        "lineage_access.review",
                        "lineage_access.revoke",
                    ])
                )
                .order_by(AuditLog.occurred_at.desc())
                .limit(10)
            )
        ).scalars().all()
        print(f"  ✓ Đã ghi nhận {len(audit_records)} bản ghi nhật ký kiểm toán trong phiên thử nghiệm.")
        for a in audit_records[:5]:
            print(f"    - Action: {a.action:28} | Entity: {a.entity_type} | Time: {a.occurred_at}")

        # Khôi phục lại trạng thái VERIFIED và APPROVED để người dùng trải nghiệm trực tiếp trên web
        print("\n--- KHÔI PHỤC DỮ LIỆU ĐỂ NGƯỜI DÙNG TRẢI NGHIỆM TRÊN TRÌNH DUYỆT ---")
        restored_mapping = (await db.execute(select(InterClanPersonMapping).where(InterClanPersonMapping.id == mapping_id))).scalar_one()
        restored_mapping.status = "VERIFIED"
        restored_mapping.notes = "Kết nối hôn nhân liên họ Dương Thị Thu Thảo - Mai Phúc Hậu"

        # Cấp lại Grant cho cả Thảo và Hậu
        grant_thao_live = LineageAccessGrant(
            id=uuid.uuid4(),
            request_id=req_mai.id,
            owner_clan_id=clan_mai.clan_id,
            grantee_user_id=user_thao.user_id,
            anchor_person_id=person_hau.id,
            scope_type="FOUR_GENERATIONS",
            permission="VIEW_ONLY",
            status="ACTIVE",
            approved_by=admin_mai_user.user_id,
            approved_at=datetime.now(timezone.utc),
        )
        db.add(grant_thao_live)

        grant_hau_live = LineageAccessGrant(
            id=uuid.uuid4(),
            request_id=req_duong.id,
            owner_clan_id=clan_duong.clan_id,
            grantee_user_id=user_hau.user_id,
            anchor_person_id=person_thao.id,
            scope_type="FOUR_GENERATIONS",
            permission="VIEW_ONLY",
            status="ACTIVE",
            approved_by=admin_duong_user.user_id,
            approved_at=datetime.now(timezone.utc),
        )
        db.add(grant_hau_live)
        await db.commit()
        print("  ✓ Đã thiết lập trạng thái VERIFIED & APPROVED cho cả hai bên để trải nghiệm trực quan trên UI!")

    print("\n" + "=" * 80)
    print("HOÀN THÀNH XUẤT SẮC TOÀN BỘ 10 BƯỚC KIỂM THỬ BẢO MẬT VÀ NGHIỆP VỤ LIÊN HỌ!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_verification())
