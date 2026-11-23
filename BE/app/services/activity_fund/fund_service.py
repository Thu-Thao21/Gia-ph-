"""Fund, Bank Account, Donation and Manual Verification Service (Module C05).

Triển khai nghiệp vụ Quản lý Quỹ, Tài khoản ngân hàng / QR, Đóng góp và Xác nhận thủ công
theo đúng chuẩn RBAC đa dòng họ (MULTI-FAMILY-GENEALOGY).
"""

from __future__ import annotations

import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.image_validation import ImageRejected, check_image
from app.models.activity_fund.entities import (
    ClanBankAccount,
    Donation,
    DonationEvidence,
    Fund,
    FundAuditLog,
)
from app.models.family.entities import Clan, ClanMembership
from app.models.postgres import Account
from app.schemas.activity_fund import (
    BankAccountResponse,
    BankAccountUpdate,
    DonationCreate,
    DonationResponse,
    EvidenceItem,
    FundCreate,
    FundResponse,
    FundSummaryResponse,
    FundUpdate,
)
from app.services.auth_access.access_service import AccessService

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads"))
QR_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "qr_codes")
EVIDENCE_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "donation_evidence")

os.makedirs(QR_UPLOAD_DIR, exist_ok=True)
os.makedirs(EVIDENCE_UPLOAD_DIR, exist_ok=True)


class FundService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -------------------------------------------------------------------------
    # RBAC & Scope Helpers
    # -------------------------------------------------------------------------
    async def get_user_clan_roles(self, user_id: uuid.UUID, clan_id: uuid.UUID) -> Tuple[bool, bool, bool]:
        """Trả về tuple: (is_clan_leader, is_family_admin, is_member).

        Tộc trưởng (Clan Leader): business_owner, owner, family_head, clan_admin hoặc System Admin.
        Family Admin: family_admin.
        Thành viên: có tư cách thành viên ACTIVE trong dòng họ hoặc có bất kỳ vai trò nào.
        """
        # Kiểm tra System Admin
        account_res = await self.db.execute(select(Account).where(Account.user_id == user_id))
        account = account_res.scalar_one_or_none()
        primary_role = getattr(account, "primary_role", "").lower() if account else ""
        if primary_role in ("admin", "system_admin"):
            return True, True, True

        roles = await AccessService(self.db).repo.get_active_roles(user_id, str(clan_id))
        role_set = {r.lower() for r in roles}

        is_clan_leader = bool(role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}))
        is_family_admin = "family_admin" in role_set

        # Kiểm tra tư cách thành viên
        m_stmt = select(ClanMembership).where(
            ClanMembership.clan_id == clan_id,
            ClanMembership.user_id == user_id,
            ClanMembership.status == "ACTIVE",
            ClanMembership.revoked_at.is_(None),
        )
        m_res = await self.db.execute(m_stmt)
        is_member = is_clan_leader or is_family_admin or (m_res.scalar_one_or_none() is not None)

        return is_clan_leader, is_family_admin, is_member

    async def log_audit(
        self,
        clan_id: uuid.UUID,
        actor_id: uuid.UUID,
        action: str,
        entity_type: str,
        entity_id: uuid.UUID,
        old_value: Optional[Dict[str, Any]] = None,
        new_value: Optional[Dict[str, Any]] = None,
    ) -> None:
        audit = FundAuditLog(
            clan_id=clan_id,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(audit)

    def _generate_donation_code(self, fund_name: str) -> str:
        """Tạo mã đóng góp độc nhất, dễ nhớ. Ví dụ: QKH-2026-000125"""
        words = re.findall(r"\w+", fund_name.upper())
        if words:
            prefix = "".join(w[0] for w in words)[:4]
        else:
            prefix = "QUY"
        if not prefix.startswith("Q"):
            prefix = f"Q{prefix}"[:4]

        year = datetime.now().year
        rand_num = secrets.randbelow(900000) + 100000  # 6 số ngẫu nhiên
        return f"{prefix}-{year}-{rand_num}"

    # -------------------------------------------------------------------------
    # Funds Management (Tộc trưởng & Family Admin)
    # -------------------------------------------------------------------------
    async def create_fund(self, clan_id: uuid.UUID, actor: Account, data: FundCreate) -> FundResponse:
        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if not (is_leader or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Tộc trưởng hoặc Family Admin mới có quyền tạo quỹ dòng họ.",
            )

        fund = Fund(
            fund_id=uuid.uuid4(),
            clan_id=clan_id,
            name=data.name.strip(),
            purpose=data.purpose.strip(),
            description=data.description.strip() if data.description else None,
            target_amount=Decimal(str(data.target_amount)) if data.target_amount is not None else None,
            visibility=data.visibility.upper() if data.visibility else "PUBLIC",
            status=data.status.upper() if data.status else "ACTIVE",
            created_by=actor.id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(fund)
        await self.db.flush()

        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="CREATE_FUND",
            entity_type="FUND",
            entity_id=fund.fund_id,
            new_value={"name": fund.name, "target_amount": float(fund.target_amount) if fund.target_amount else None},
        )
        await self.db.commit()

        return FundResponse(
            id=fund.fund_id,
            clan_id=fund.clan_id,
            name=fund.name,
            purpose=fund.purpose,
            description=fund.description,
            target_amount=float(fund.target_amount) if fund.target_amount else None,
            current_amount=0.0,
            confirmed_donations_count=0,
            status=fund.status,
            visibility=fund.visibility,
            created_by=fund.created_by,
            created_at=fund.created_at,
            updated_at=fund.updated_at,
        )

    async def list_funds(self, clan_id: uuid.UUID, actor: Account) -> List[FundResponse]:
        is_leader, is_admin, is_member = await self.get_user_clan_roles(actor.id, clan_id)
        if not is_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập dữ liệu quỹ của dòng họ này.",
            )

        stmt = select(Fund).where(Fund.clan_id == clan_id).order_by(Fund.created_at.desc())
        if not (is_leader or is_admin):
            # Thành viên chỉ xem các quỹ PUBLIC và đang ACTIVE hoặc CLOSED
            stmt = stmt.where(Fund.visibility == "PUBLIC")

        res = await self.db.execute(stmt)
        funds = res.scalars().all()

        results: List[FundResponse] = []
        for f in funds:
            # Tính tổng tiền và số lượt đóng góp SUCCESS của từng quỹ
            sum_stmt = select(
                func.coalesce(func.sum(Donation.amount), 0),
                func.count(Donation.id),
            ).where(
                Donation.fund_id == f.fund_id,
                Donation.status == "SUCCESS",
            )
            stats_res = await self.db.execute(sum_stmt)
            collected_sum, confirmed_cnt = stats_res.first() or (0, 0)

            results.append(
                FundResponse(
                    id=f.fund_id,
                    clan_id=f.clan_id,
                    name=f.name,
                    purpose=f.purpose,
                    description=f.description,
                    target_amount=float(f.target_amount) if f.target_amount else None,
                    current_amount=float(collected_sum),
                    confirmed_donations_count=confirmed_cnt,
                    status=f.status,
                    visibility=f.visibility,
                    created_by=f.created_by,
                    created_at=f.created_at,
                    updated_at=f.updated_at,
                )
            )

        return results

    async def update_fund(
        self, clan_id: uuid.UUID, fund_id: uuid.UUID, actor: Account, data: FundUpdate
    ) -> FundResponse:
        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if not (is_leader or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Tộc trưởng hoặc Family Admin mới có quyền cập nhật quỹ.",
            )

        stmt = select(Fund).where(Fund.fund_id == fund_id, Fund.clan_id == clan_id)
        res = await self.db.execute(stmt)
        fund = res.scalar_one_or_none()
        if not fund:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy quỹ dòng họ.")

        old_val = {"name": fund.name, "status": fund.status, "target_amount": float(fund.target_amount) if fund.target_amount else None}

        if data.name is not None:
            fund.name = data.name.strip()
        if data.purpose is not None:
            fund.purpose = data.purpose.strip()
        if data.description is not None:
            fund.description = data.description.strip()
        if data.target_amount is not None:
            fund.target_amount = Decimal(str(data.target_amount))
        if data.visibility is not None:
            fund.visibility = data.visibility.upper()
        if data.status is not None:
            fund.status = data.status.upper()
        fund.updated_at = datetime.now(timezone.utc)

        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="UPDATE_FUND",
            entity_type="FUND",
            entity_id=fund.fund_id,
            old_value=old_val,
            new_value={"name": fund.name, "status": fund.status, "target_amount": float(fund.target_amount) if fund.target_amount else None},
        )
        await self.db.commit()

        # Tính tổng tiền
        sum_stmt = select(
            func.coalesce(func.sum(Donation.amount), 0),
            func.count(Donation.id),
        ).where(Donation.fund_id == fund.fund_id, Donation.status == "SUCCESS")
        collected_sum, confirmed_cnt = (await self.db.execute(sum_stmt)).first() or (0, 0)

        return FundResponse(
            id=fund.fund_id,
            clan_id=fund.clan_id,
            name=fund.name,
            purpose=fund.purpose,
            description=fund.description,
            target_amount=float(fund.target_amount) if fund.target_amount else None,
            current_amount=float(collected_sum),
            confirmed_donations_count=confirmed_cnt,
            status=fund.status,
            visibility=fund.visibility,
            created_by=fund.created_by,
            created_at=fund.created_at,
            updated_at=fund.updated_at,
        )

    async def delete_fund(self, clan_id: uuid.UUID, fund_id: uuid.UUID, actor: Account) -> dict:
        """Xóa quỹ dòng họ (Chỉ Tộc trưởng hoặc Family Admin)."""
        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if not (is_leader or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Tộc trưởng hoặc Family Admin mới có quyền xóa quỹ dòng họ.",
            )

        stmt = select(Fund).where(Fund.fund_id == fund_id, Fund.clan_id == clan_id)
        res = await self.db.execute(stmt)
        fund = res.scalar_one_or_none()
        if not fund:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy quỹ dòng họ cần xóa.")

        old_val = {
            "name": fund.name,
            "purpose": fund.purpose,
            "status": fund.status,
            "target_amount": float(fund.target_amount) if fund.target_amount else None,
        }

        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="DELETE_FUND",
            entity_type="FUND",
            entity_id=fund.fund_id,
            old_value=old_val,
            new_value=None,
        )
        await self.db.delete(fund)
        await self.db.commit()

        return {"status": "ok", "message": f"Đã xóa quỹ '{fund.name}' thành công."}

    # -------------------------------------------------------------------------
    # Bank Account & QR Management (Tộc trưởng & Family Admin)
    # -------------------------------------------------------------------------
    async def get_bank_account(self, clan_id: uuid.UUID, actor: Account) -> Optional[BankAccountResponse]:
        _, _, is_member = await self.get_user_clan_roles(actor.id, clan_id)
        if not is_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập thông tin tài khoản dòng họ này.",
            )

        stmt = select(ClanBankAccount).where(
            ClanBankAccount.clan_id == clan_id, ClanBankAccount.is_active.is_(True)
        ).order_by(ClanBankAccount.updated_at.desc())
        res = await self.db.execute(stmt)
        bank_acc = res.scalars().first()
        if not bank_acc:
            return None

        return BankAccountResponse(
            id=bank_acc.id,
            clan_id=bank_acc.clan_id,
            bank_name=bank_acc.bank_name,
            account_holder=bank_acc.account_holder,
            account_number=bank_acc.account_number,
            qr_image_path=bank_acc.qr_image_path,
            transfer_instruction=bank_acc.transfer_instruction,
            is_active=bank_acc.is_active,
            created_by=bank_acc.created_by,
            updated_at=bank_acc.updated_at,
        )

    async def update_bank_account(
        self, clan_id: uuid.UUID, actor: Account, data: BankAccountUpdate
    ) -> BankAccountResponse:
        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if not (is_leader or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Tộc trưởng hoặc Family Admin mới có quyền cấu hình tài khoản nhận tiền.",
            )

        stmt = select(ClanBankAccount).where(ClanBankAccount.clan_id == clan_id).order_by(ClanBankAccount.updated_at.desc())
        res = await self.db.execute(stmt)
        bank_acc = res.scalars().first()

        old_val = (
            {
                "bank_name": bank_acc.bank_name,
                "account_holder": bank_acc.account_holder,
                "account_number": bank_acc.account_number,
            }
            if bank_acc
            else None
        )

        now = datetime.now(timezone.utc)
        if not bank_acc:
            bank_acc = ClanBankAccount(
                id=uuid.uuid4(),
                clan_id=clan_id,
                bank_name=data.bank_name.strip(),
                account_holder=data.account_holder.strip().upper(),
                account_number=data.account_number.strip(),
                qr_image_path=data.qr_image_path,
                transfer_instruction=data.transfer_instruction.strip() if data.transfer_instruction else None,
                is_active=data.is_active,
                created_by=actor.id,
                created_at=now,
                updated_at=now,
            )
            self.db.add(bank_acc)
        else:
            bank_acc.bank_name = data.bank_name.strip()
            bank_acc.account_holder = data.account_holder.strip().upper()
            bank_acc.account_number = data.account_number.strip()
            if data.qr_image_path is not None:
                bank_acc.qr_image_path = data.qr_image_path
            bank_acc.transfer_instruction = data.transfer_instruction.strip() if data.transfer_instruction else None
            bank_acc.is_active = data.is_active
            bank_acc.updated_at = now

        await self.db.flush()
        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="UPDATE_BANK_ACCOUNT",
            entity_type="BANK_ACCOUNT",
            entity_id=bank_acc.id,
            old_value=old_val,
            new_value={
                "bank_name": bank_acc.bank_name,
                "account_holder": bank_acc.account_holder,
                "account_number": bank_acc.account_number,
            },
        )
        await self.db.commit()

        return BankAccountResponse(
            id=bank_acc.id,
            clan_id=bank_acc.clan_id,
            bank_name=bank_acc.bank_name,
            account_holder=bank_acc.account_holder,
            account_number=bank_acc.account_number,
            qr_image_path=bank_acc.qr_image_path,
            transfer_instruction=bank_acc.transfer_instruction,
            is_active=bank_acc.is_active,
            created_by=bank_acc.created_by,
            updated_at=bank_acc.updated_at,
        )

    async def upload_bank_qr_image(
        self, clan_id: uuid.UUID, actor: Account, file: UploadFile
    ) -> Dict[str, str]:
        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if not (is_leader or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Tộc trưởng hoặc Family Admin mới có quyền tải lên ảnh QR tài khoản.",
            )

        content = await file.read()
        try:
            checked = check_image(content)
        except ImageRejected as exc:
            reasons = {
                "too_large": "Ảnh vượt quá dung lượng tối đa 2MB",
                "empty": "Tệp tin rỗng",
                "svg_not_allowed": "Định dạng SVG không được chấp nhận vì lý do an toàn",
                "unknown_type": "Chỉ chấp nhận định dạng ảnh PNG, JPEG hoặc WebP",
                "corrupt": "Tệp tin hình ảnh bị hỏng hoặc không đúng định dạng",
                "markup": "Phát hiện nội dung không an toàn trong tệp ảnh",
                "bad_dimensions": "Kích thước ảnh không hợp lệ (tối thiểu 16px, tối đa 4096px)",
            }
            detail = reasons.get(exc.reason, "Tệp ảnh không hợp lệ")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

        dest_path = os.path.join(QR_UPLOAD_DIR, checked.stored_name)
        with open(dest_path, "wb") as f:
            f.write(content)

        relative_url = f"/api/uploads/qr_codes/{checked.stored_name}"
        return {"qr_image_path": relative_url, "file_name": checked.stored_name}

    # -------------------------------------------------------------------------
    # Member Donations Workflow
    # -------------------------------------------------------------------------
    async def create_donation(
        self, clan_id: uuid.UUID, actor: Account, data: DonationCreate
    ) -> DonationResponse:
        _, _, is_member = await self.get_user_clan_roles(actor.id, clan_id)
        if not is_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền đóng góp cho dòng họ này.",
            )

        if data.amount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Số tiền đóng góp phải lớn hơn 0 VNĐ.")

        fund_stmt = select(Fund).where(Fund.fund_id == data.fund_id, Fund.clan_id == clan_id)
        fund = (await self.db.execute(fund_stmt)).scalar_one_or_none()
        if not fund:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy quỹ đóng góp.")
        if fund.status != "ACTIVE":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quỹ này hiện không mở tiếp nhận đóng góp.")

        # Lấy thông tin tài khoản ngân hàng của dòng họ
        b_stmt = select(ClanBankAccount).where(
            ClanBankAccount.clan_id == clan_id, ClanBankAccount.is_active.is_(True)
        ).order_by(ClanBankAccount.updated_at.desc())
        bank_acc = (await self.db.execute(b_stmt)).scalars().first()
        if not bank_acc or not bank_acc.account_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dòng họ chưa thiết lập tài khoản ngân hàng nhận đóng góp. Vui lòng liên hệ Tộc trưởng.",
            )

        # Snapshot tài khoản nhận tiền tại thời điểm tạo yêu cầu để đối soát
        bank_snapshot = {
            "bank_name": bank_acc.bank_name,
            "account_holder": bank_acc.account_holder,
            "account_number": bank_acc.account_number,
            "qr_image_path": bank_acc.qr_image_path,
            "transfer_instruction": bank_acc.transfer_instruction,
            "snapshot_at": datetime.now(timezone.utc).isoformat(),
        }

        # Sinh mã đóng góp độc nhất
        donation_code = self._generate_donation_code(fund.name)
        # Đảm bảo không trùng mã
        while (await self.db.execute(select(Donation.id).where(Donation.donation_code == donation_code))).scalar_one_or_none():
            donation_code = self._generate_donation_code(fund.name)

        donor_name = data.donor_name.strip() if data.donor_name else (
            getattr(actor, "display_name", None) or getattr(actor, "full_name", None) or actor.email.split("@")[0]
        )

        donation = Donation(
            id=uuid.uuid4(),
            clan_id=clan_id,
            fund_id=fund.fund_id,
            user_id=actor.id,
            donor_name=donor_name,
            donation_code=donation_code,
            amount=Decimal(str(data.amount)),
            status="PENDING",
            bank_account_snapshot=bank_snapshot,
            note=data.note.strip() if data.note else None,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(donation)
        await self.db.flush()

        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="CREATE_DONATION",
            entity_type="DONATION",
            entity_id=donation.id,
            new_value={"code": donation.donation_code, "amount": float(donation.amount), "fund": fund.name},
        )
        await self.db.commit()

        return DonationResponse(
            id=donation.id,
            clan_id=donation.clan_id,
            fund_id=donation.fund_id,
            fund_name=fund.name,
            user_id=donation.user_id,
            donor_name=donation.donor_name,
            donation_code=donation.donation_code,
            amount=float(donation.amount),
            status=donation.status,
            bank_account_snapshot=donation.bank_account_snapshot,
            note=donation.note,
            created_at=donation.created_at,
            evidence_items=[],
        )

    async def create_donation_with_evidence(
        self,
        clan_id: uuid.UUID,
        actor: Account,
        fund_id: uuid.UUID,
        amount: Decimal,
        file: UploadFile,
        donor_name: Optional[str] = None,
        donation_code: Optional[str] = None,
        note: Optional[str] = None,
        bank_transaction_reference: Optional[str] = None,
    ) -> DonationResponse:
        """Tạo yêu cầu đóng góp KÈM ẢNH MINH CHỨNG bắt buộc.
        
        Quy tắc nghiệp vụ:
        - Tuyệt đối không tạo bản ghi đóng góp vào DB nếu chưa có ảnh minh chứng hợp lệ.
        - Trạng thái được tạo trực tiếp là AWAITING_VERIFICATION (Đang chờ duyệt).
        - Lưu tệp minh chứng và bản ghi DonationEvidence trong cùng một transaction an toàn.
        """
        _, _, is_member = await self.get_user_clan_roles(actor.id, clan_id)
        if not is_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền đóng góp cho dòng họ này.",
            )

        if amount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Số tiền đóng góp phải lớn hơn 0 VNĐ.")

        fund_stmt = select(Fund).where(Fund.fund_id == fund_id, Fund.clan_id == clan_id)
        fund = (await self.db.execute(fund_stmt)).scalar_one_or_none()
        if not fund:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy quỹ đóng góp.")
        if fund.status != "ACTIVE":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quỹ này hiện đã ngưng nhận đóng góp.")

        # Lấy thông tin tài khoản ngân hàng của dòng họ
        b_stmt = select(ClanBankAccount).where(
            ClanBankAccount.clan_id == clan_id, ClanBankAccount.is_active.is_(True)
        ).order_by(ClanBankAccount.updated_at.desc())
        bank_acc = (await self.db.execute(b_stmt)).scalars().first()
        if not bank_acc or not bank_acc.account_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dòng họ chưa thiết lập tài khoản ngân hàng nhận đóng góp. Vui lòng liên hệ Tộc trưởng.",
            )

        # Snapshot tài khoản nhận tiền tại thời điểm tạo yêu cầu để đối soát
        bank_snapshot = {
            "bank_name": bank_acc.bank_name,
            "account_holder": bank_acc.account_holder,
            "account_number": bank_acc.account_number,
            "qr_image_path": bank_acc.qr_image_path,
            "transfer_instruction": bank_acc.transfer_instruction,
            "snapshot_at": datetime.now(timezone.utc).isoformat(),
        }

        # BẮT BUỘC: Kiểm tra ảnh minh chứng trước khi tạo bất kỳ bản ghi nào
        content = await file.read()
        try:
            checked = check_image(content)
        except ImageRejected as exc:
            reasons = {
                "too_large": "Ảnh minh chứng vượt quá 2MB",
                "empty": "Tệp tin rỗng",
                "svg_not_allowed": "Định dạng SVG không được chấp nhận",
                "unknown_type": "Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP",
                "corrupt": "Tệp tin hình ảnh bị hỏng",
                "markup": "Phát hiện nội dung không hợp lệ trong tệp ảnh",
                "bad_dimensions": "Kích thước ảnh không hợp lệ",
            }
            detail = reasons.get(exc.reason, "Tệp ảnh không hợp lệ")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

        # Lưu ảnh minh chứng vào thư mục
        dest_path = os.path.join(EVIDENCE_UPLOAD_DIR, checked.stored_name)
        with open(dest_path, "wb") as f:
            f.write(content)
        relative_url = f"/api/uploads/donation_evidence/{checked.stored_name}"

        # Kiểm tra / sinh mã đóng góp duy nhất
        code = donation_code.strip().upper() if donation_code and donation_code.strip() else None
        if not code or (await self.db.execute(select(Donation.id).where(Donation.donation_code == code))).scalar_one_or_none():
            code = self._generate_donation_code(fund.name)
            while (await self.db.execute(select(Donation.id).where(Donation.donation_code == code))).scalar_one_or_none():
                code = self._generate_donation_code(fund.name)

        donor = donor_name.strip() if donor_name and donor_name.strip() else (
            getattr(actor, "display_name", None) or getattr(actor, "full_name", None) or actor.email.split("@")[0]
        )

        now = datetime.now(timezone.utc)
        # Tạo trực tiếp Donation ở trạng thái AWAITING_VERIFICATION
        donation = Donation(
            id=uuid.uuid4(),
            clan_id=clan_id,
            fund_id=fund.fund_id,
            user_id=actor.id,
            donor_name=donor,
            donation_code=code,
            amount=Decimal(str(amount)),
            status="AWAITING_VERIFICATION",
            bank_account_snapshot=bank_snapshot,
            bank_transaction_reference=bank_transaction_reference.strip() if bank_transaction_reference else None,
            note=note.strip() if note else None,
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        self.db.add(donation)
        await self.db.flush()

        evidence = DonationEvidence(
            id=uuid.uuid4(),
            donation_id=donation.id,
            image_path=relative_url,
            file_name=file.filename or checked.stored_name,
            mime_type=checked.mime_type,
            created_at=now,
        )
        self.db.add(evidence)
        await self.db.flush()

        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="CREATE_DONATION_WITH_EVIDENCE",
            entity_type="DONATION",
            entity_id=donation.id,
            new_value={"code": donation.donation_code, "amount": float(donation.amount), "fund": fund.name},
        )
        await self.db.commit()

        return DonationResponse(
            id=donation.id,
            clan_id=donation.clan_id,
            fund_id=donation.fund_id,
            fund_name=fund.name,
            user_id=donation.user_id,
            donor_name=donation.donor_name,
            donation_code=donation.donation_code,
            amount=float(donation.amount),
            status=donation.status,
            bank_account_snapshot=donation.bank_account_snapshot,
            bank_transaction_reference=donation.bank_transaction_reference,
            note=donation.note,
            submitted_at=donation.submitted_at,
            created_at=donation.created_at,
            evidence_items=[
                EvidenceItem(
                    id=evidence.id,
                    image_path=evidence.image_path,
                    file_name=evidence.file_name,
                    created_at=evidence.created_at,
                )
            ],
        )

    async def upload_donation_evidence(
        self, clan_id: uuid.UUID, donation_id: uuid.UUID, actor: Account, file: UploadFile
    ) -> EvidenceItem:
        stmt = select(Donation).where(Donation.id == donation_id, Donation.clan_id == clan_id)
        donation = (await self.db.execute(stmt)).scalar_one_or_none()
        if not donation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu đóng góp.")

        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if donation.user_id != actor.id and not (is_leader or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền tải ảnh minh chứng cho yêu cầu đóng góp này.",
            )

        if donation.status not in ("PENDING", "AWAITING_VERIFICATION"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể bổ sung minh chứng cho giao dịch ở trạng thái {donation.status}.",
            )

        content = await file.read()
        try:
            checked = check_image(content)
        except ImageRejected as exc:
            reasons = {
                "too_large": "Ảnh minh chứng vượt quá 2MB",
                "empty": "Tệp tin rỗng",
                "svg_not_allowed": "Định dạng SVG không được chấp nhận",
                "unknown_type": "Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP",
                "corrupt": "Tệp tin hình ảnh bị hỏng",
                "markup": "Phát hiện nội dung không hợp lệ trong tệp ảnh",
                "bad_dimensions": "Kích thước ảnh không hợp lệ",
            }
            detail = reasons.get(exc.reason, "Tệp ảnh không hợp lệ")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

        dest_path = os.path.join(EVIDENCE_UPLOAD_DIR, checked.stored_name)
        with open(dest_path, "wb") as f:
            f.write(content)

        relative_url = f"/api/uploads/donation_evidence/{checked.stored_name}"
        evidence = DonationEvidence(
            id=uuid.uuid4(),
            donation_id=donation.id,
            image_path=relative_url,
            file_name=file.filename or checked.stored_name,
            mime_type=checked.mime_type,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(evidence)
        await self.db.commit()

        return EvidenceItem(
            id=evidence.id,
            image_path=evidence.image_path,
            file_name=evidence.file_name,
            created_at=evidence.created_at,
        )

    async def submit_donation_verification(
        self,
        clan_id: uuid.UUID,
        donation_id: uuid.UUID,
        actor: Account,
        bank_transaction_reference: Optional[str] = None,
        note: Optional[str] = None,
    ) -> DonationResponse:
        """Thành viên bấm 'Tôi đã chuyển khoản' / 'Gửi minh chứng đóng góp'.

        Chuyển trạng thái sang AWAITING_VERIFICATION.
        QUAN TRỌNG: KHÔNG cộng tiền vào quỹ ở bước này!
        """
        stmt = select(Donation).where(Donation.id == donation_id, Donation.clan_id == clan_id)
        donation = (await self.db.execute(stmt)).scalar_one_or_none()
        if not donation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu đóng góp.")

        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if donation.user_id != actor.id and not (is_leader or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền gửi xác nhận cho yêu cầu này.",
            )

        # Kiểm tra bắt buộc phải có ít nhất 1 ảnh minh chứng
        ev_stmt = select(func.count(DonationEvidence.id)).where(DonationEvidence.donation_id == donation.id)
        ev_count = (await self.db.execute(ev_stmt)).scalar() or 0
        if ev_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vui lòng tải lên ảnh chụp giao dịch / biên lai chuyển khoản trước khi gửi minh chứng.",
            )

        donation.status = "AWAITING_VERIFICATION"
        donation.submitted_at = datetime.now(timezone.utc)
        donation.updated_at = datetime.now(timezone.utc)
        if bank_transaction_reference:
            donation.bank_transaction_reference = bank_transaction_reference.strip()
        if note:
            donation.note = note.strip()

        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="SUBMIT_EVIDENCE",
            entity_type="DONATION",
            entity_id=donation.id,
            new_value={"code": donation.donation_code, "reference": donation.bank_transaction_reference},
        )
        await self.db.commit()

        return await self.get_donation_detail(clan_id, donation.id, actor)

    # -------------------------------------------------------------------------
    # Verification & Rejection (ĐỘC QUYỀN TỘC TRƯỞNG)
    # -------------------------------------------------------------------------
    async def verify_donation(
        self, clan_id: uuid.UUID, donation_id: uuid.UUID, actor: Account, note: Optional[str] = None
    ) -> DonationResponse:
        """Tộc trưởng đối soát tài khoản ngân hàng và bấm 'Xác nhận đã nhận tiền'.

        BẮT BUỘC: Chỉ Tộc trưởng (Clan Leader) mới có quyền xác nhận tiền đã nhận.
        Family Admin bị từ chối với mã 403.
        Sử dụng SELECT FOR UPDATE để chống race condition và không bao giờ tính trùng tiền.
        """
        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if not is_leader:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Tộc trưởng mới có thẩm quyền xác nhận đã nhận tiền đóng góp vào quỹ.",
            )

        # Row-level lock
        stmt = (
            select(Donation)
            .where(Donation.id == donation_id, Donation.clan_id == clan_id)
            .with_for_update()
        )
        res = await self.db.execute(stmt)
        donation = res.scalar_one_or_none()
        if not donation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu đóng góp.")

        # Xử lý idempotent: nếu đã duyệt thành công trước đó thì trả về kết quả
        if donation.status == "SUCCESS":
            return await self.get_donation_detail(clan_id, donation.id, actor)

        if donation.status != "AWAITING_VERIFICATION":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Chỉ có thể xác nhận giao dịch đã nộp ảnh minh chứng (chờ xác nhận). Hiện tại: {donation.status}.",
            )

        # Kiểm tra bắt buộc phải có ít nhất 1 ảnh minh chứng
        ev_stmt = select(func.count(DonationEvidence.id)).where(DonationEvidence.donation_id == donation.id)
        ev_count = (await self.db.execute(ev_stmt)).scalar() or 0
        if ev_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Giao dịch chưa có ảnh minh chứng chuyển khoản, không thể xác nhận.",
            )

        now = datetime.now(timezone.utc)
        old_status = donation.status
        donation.status = "SUCCESS"
        donation.verified_at = now
        donation.verified_by = actor.id
        donation.updated_at = now

        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="VERIFY_DONATION",
            entity_type="DONATION",
            entity_id=donation.id,
            old_value={"status": old_status},
            new_value={"status": "SUCCESS", "amount": float(donation.amount), "verifier": str(actor.id)},
        )
        await self.db.commit()

        return await self.get_donation_detail(clan_id, donation.id, actor)

    async def reject_donation(
        self, clan_id: uuid.UUID, donation_id: uuid.UUID, actor: Account, reason: str
    ) -> DonationResponse:
        """Tộc trưởng từ chối giao dịch sau khi đối soát (bắt buộc có lý do)."""
        is_leader, _, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if not is_leader:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Tộc trưởng mới có quyền từ chối giao dịch đóng góp.",
            )

        if not reason or not reason.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bắt buộc phải nhập lý do từ chối giao dịch.",
            )

        stmt = (
            select(Donation)
            .where(Donation.id == donation_id, Donation.clan_id == clan_id)
            .with_for_update()
        )
        res = await self.db.execute(stmt)
        donation = res.scalar_one_or_none()
        if not donation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu đóng góp.")

        if donation.status == "SUCCESS":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể từ chối giao dịch đã được xác nhận thành công.",
            )

        if donation.status != "AWAITING_VERIFICATION":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Chỉ có thể từ chối giao dịch đang ở trạng thái chờ xác nhận. Hiện tại: {donation.status}.",
            )

        now = datetime.now(timezone.utc)
        old_status = donation.status
        donation.status = "REJECTED"
        donation.rejection_reason = reason.strip()
        donation.verified_at = now
        donation.verified_by = actor.id
        donation.updated_at = now

        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="REJECT_DONATION",
            entity_type="DONATION",
            entity_id=donation.id,
            old_value={"status": old_status},
            new_value={"status": "REJECTED", "reason": donation.rejection_reason},
        )
        await self.db.commit()

        return await self.get_donation_detail(clan_id, donation.id, actor)

    async def cancel_donation(
        self, clan_id: uuid.UUID, donation_id: uuid.UUID, actor: Account, reason: Optional[str] = None
    ) -> DonationResponse:
        """Thành viên tự hủy yêu cầu đóng góp khi chưa được duyệt."""
        stmt = (
            select(Donation)
            .where(Donation.id == donation_id, Donation.clan_id == clan_id)
            .with_for_update()
        )
        res = await self.db.execute(stmt)
        donation = res.scalar_one_or_none()
        if not donation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy yêu cầu đóng góp.")

        if donation.user_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn chỉ có thể hủy yêu cầu đóng góp của chính mình.",
            )

        if donation.status not in ("PENDING", "AWAITING_VERIFICATION"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Không thể hủy yêu cầu đang ở trạng thái {donation.status}.",
            )

        now = datetime.now(timezone.utc)
        donation.status = "CANCELLED"
        donation.rejection_reason = reason.strip() if reason else "Thành viên đã hủy yêu cầu"
        donation.updated_at = now

        await self.log_audit(
            clan_id=clan_id,
            actor_id=actor.id,
            action="CANCEL_DONATION",
            entity_type="DONATION",
            entity_id=donation.id,
            new_value={"status": "CANCELLED"},
        )
        await self.db.commit()

        return await self.get_donation_detail(clan_id, donation.id, actor)

    # -------------------------------------------------------------------------
    # Donation Queries (Isolation per user & clan)
    # -------------------------------------------------------------------------
    async def list_clan_donations(
        self,
        clan_id: uuid.UUID,
        actor: Account,
        fund_id: Optional[uuid.UUID] = None,
        status_filter: Optional[str] = None,
    ) -> List[DonationResponse]:
        """Dành cho Tộc trưởng và Family Admin: xem danh sách giao dịch của dòng họ."""
        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if not (is_leader or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Tộc trưởng và Family Admin mới có quyền xem toàn bộ giao dịch dòng họ.",
            )

        stmt = (
            select(Donation, Fund.name.label("fund_name"), Account.display_name.label("verifier_name"))
            .join(Fund, Fund.fund_id == Donation.fund_id)
            .outerjoin(Account, Account.user_id == Donation.verified_by)
            .where(Donation.clan_id == clan_id)
            .order_by(Donation.created_at.desc())
        )
        if fund_id:
            stmt = stmt.where(Donation.fund_id == fund_id)
        if status_filter and status_filter.upper() != "ALL":
            stmt = stmt.where(Donation.status == status_filter.upper())
        else:
            # Sổ cái mặc định chỉ hiển thị các đơn hợp lệ đã nộp minh chứng (AWAITING_VERIFICATION, SUCCESS, REJECTED)
            stmt = stmt.where(Donation.status.in_(["AWAITING_VERIFICATION", "SUCCESS", "REJECTED"]))

        rows = (await self.db.execute(stmt)).all()

        results: List[DonationResponse] = []
        for d, f_name, v_name in rows:
            ev_stmt = select(DonationEvidence).where(DonationEvidence.donation_id == d.id).order_by(DonationEvidence.created_at.asc())
            ev_rows = (await self.db.execute(ev_stmt)).scalars().all()
            ev_items = [
                EvidenceItem(id=ev.id, image_path=ev.image_path, file_name=ev.file_name, created_at=ev.created_at)
                for ev in ev_rows
            ]

            results.append(
                DonationResponse(
                    id=d.id,
                    clan_id=d.clan_id,
                    fund_id=d.fund_id,
                    fund_name=f_name,
                    user_id=d.user_id,
                    donor_name=d.donor_name,
                    donation_code=d.donation_code,
                    amount=float(d.amount),
                    status=d.status,
                    bank_account_snapshot=d.bank_account_snapshot,
                    bank_transaction_reference=d.bank_transaction_reference,
                    note=d.note,
                    rejection_reason=d.rejection_reason,
                    created_at=d.created_at,
                    submitted_at=d.submitted_at,
                    verified_at=d.verified_at,
                    verified_by=d.verified_by,
                    verifier_name=v_name,
                    evidence_items=ev_items,
                )
            )

        return results

    async def list_my_donations(
        self, clan_id: uuid.UUID, actor: Account
    ) -> List[DonationResponse]:
        """Dành cho Thành viên: CHỈ xem các khoản đóng góp của chính tài khoản đăng nhập.
        
        RÀNG BUỘC NGHIỆP VỤ:
        - Chỉ hiển thị 3 trạng thái hợp lệ: AWAITING_VERIFICATION, SUCCESS, REJECTED.
        - Tuyệt đối không hiển thị các đơn chưa nộp minh chứng (PENDING) hoặc đã hủy (CANCELLED).
        """
        _, _, is_member = await self.get_user_clan_roles(actor.id, clan_id)
        if not is_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập dữ liệu dòng họ này.",
            )

        stmt = (
            select(Donation, Fund.name.label("fund_name"), Account.display_name.label("verifier_name"))
            .join(Fund, Fund.fund_id == Donation.fund_id)
            .outerjoin(Account, Account.user_id == Donation.verified_by)
            .where(
                Donation.clan_id == clan_id,
                Donation.user_id == actor.id,
                Donation.status.in_(["AWAITING_VERIFICATION", "SUCCESS", "REJECTED"]),
            )
            .order_by(Donation.created_at.desc())
        )
        rows = (await self.db.execute(stmt)).all()

        results: List[DonationResponse] = []
        for d, f_name, v_name in rows:
            ev_stmt = select(DonationEvidence).where(DonationEvidence.donation_id == d.id).order_by(DonationEvidence.created_at.asc())
            ev_rows = (await self.db.execute(ev_stmt)).scalars().all()
            ev_items = [
                EvidenceItem(id=ev.id, image_path=ev.image_path, file_name=ev.file_name, created_at=ev.created_at)
                for ev in ev_rows
            ]

            results.append(
                DonationResponse(
                    id=d.id,
                    clan_id=d.clan_id,
                    fund_id=d.fund_id,
                    fund_name=f_name,
                    user_id=d.user_id,
                    donor_name=d.donor_name,
                    donation_code=d.donation_code,
                    amount=float(d.amount),
                    status=d.status,
                    bank_account_snapshot=d.bank_account_snapshot,
                    bank_transaction_reference=d.bank_transaction_reference,
                    note=d.note,
                    rejection_reason=d.rejection_reason,
                    created_at=d.created_at,
                    submitted_at=d.submitted_at,
                    verified_at=d.verified_at,
                    verified_by=d.verified_by,
                    verifier_name=v_name,
                    evidence_items=ev_items,
                )
            )

        return results

    async def get_donation_detail(
        self, clan_id: uuid.UUID, donation_id: uuid.UUID, actor: Account
    ) -> DonationResponse:
        stmt = (
            select(Donation, Fund.name.label("fund_name"), Account.display_name.label("verifier_name"))
            .join(Fund, Fund.fund_id == Donation.fund_id)
            .outerjoin(Account, Account.user_id == Donation.verified_by)
            .where(Donation.id == donation_id, Donation.clan_id == clan_id)
        )
        row = (await self.db.execute(stmt)).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy giao dịch.")

        d, f_name, v_name = row
        is_leader, is_admin, _ = await self.get_user_clan_roles(actor.id, clan_id)
        if d.user_id != actor.id and not (is_leader or is_admin):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền xem thông tin giao dịch này.",
            )

        ev_stmt = select(DonationEvidence).where(DonationEvidence.donation_id == d.id).order_by(DonationEvidence.created_at.asc())
        ev_rows = (await self.db.execute(ev_stmt)).scalars().all()
        ev_items = [
            EvidenceItem(id=ev.id, image_path=ev.image_path, file_name=ev.file_name, created_at=ev.created_at)
            for ev in ev_rows
        ]

        return DonationResponse(
            id=d.id,
            clan_id=d.clan_id,
            fund_id=d.fund_id,
            fund_name=f_name,
            user_id=d.user_id,
            donor_name=d.donor_name,
            donation_code=d.donation_code,
            amount=float(d.amount),
            status=d.status,
            bank_account_snapshot=d.bank_account_snapshot,
            bank_transaction_reference=d.bank_transaction_reference,
            note=d.note,
            rejection_reason=d.rejection_reason,
            created_at=d.created_at,
            submitted_at=d.submitted_at,
            verified_at=d.verified_at,
            verified_by=d.verified_by,
            verifier_name=v_name,
            evidence_items=ev_items,
        )

    async def get_funds_summary(self, clan_id: uuid.UUID, actor: Account) -> FundSummaryResponse:
        _, _, is_member = await self.get_user_clan_roles(actor.id, clan_id)
        if not is_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền truy cập dữ liệu dòng họ này.",
            )

        # Tổng số quỹ và tổng target
        f_stmt = select(
            func.count(Fund.fund_id),
            func.coalesce(func.sum(Fund.target_amount), 0),
        ).where(Fund.clan_id == clan_id, Fund.status == "ACTIVE")
        f_res = await self.db.execute(f_stmt)
        total_funds, total_target = f_res.first() or (0, 0)

        # Tổng tiền đã xác nhận SUCCESS
        d_stmt = select(
            func.coalesce(func.sum(Donation.amount), 0),
            func.count(Donation.id),
        ).where(Donation.clan_id == clan_id, Donation.status == "SUCCESS")
        d_res = await self.db.execute(d_stmt)
        total_collected, confirmed_cnt = d_res.first() or (0, 0)

        # Số khoản PENDING và AWAITING_VERIFICATION
        pending_cnt = (
            await self.db.execute(
                select(func.count(Donation.id)).where(Donation.clan_id == clan_id, Donation.status == "PENDING")
            )
        ).scalar() or 0

        awaiting_cnt = (
            await self.db.execute(
                select(func.count(Donation.id)).where(
                    Donation.clan_id == clan_id, Donation.status == "AWAITING_VERIFICATION"
                )
            )
        ).scalar() or 0

        return FundSummaryResponse(
            total_funds_count=total_funds,
            total_target_amount=float(total_target),
            total_collected_amount=float(total_collected),
            pending_donations_count=pending_cnt,
            confirmed_donations_count=confirmed_cnt,
            awaiting_verification_count=awaiting_cnt,
        )
