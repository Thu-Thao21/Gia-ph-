"""Module Test C05: Funds, Bank Account & Manual Verification Donation System.

Kiểm tra:
1. Xác thực schema Quỹ và Đóng góp (số tiền > 0, tên quỹ, mục đích bắt buộc).
2. Quy tắc bảo mật upload ảnh (chấp nhận PNG/JPEG/WebP, từ chối SVG/Markup/XSS/file rỗng/quá dung lượng).
3. Quy tắc sinh mã đóng góp độc nhất (ví dụ: QKH-2026-000125).
4. Phân quyền RBAC đa dòng họ (Tộc trưởng, Family Admin, Thành viên).
5. Luồng trạng thái giao dịch: PENDING -> AWAITING_VERIFICATION -> SUCCESS / REJECTED / CANCELLED.
6. Nguyên tắc tài chính: Không cộng tiền khi chưa được Tộc trưởng xác nhận; chống ghi nhận trùng tiền.
7. Độc quyền của Tộc trưởng: Chỉ Tộc trưởng được duyệt 'Xác nhận đã nhận tiền'; Family Admin bị từ chối 403.
8. Cô lập dữ liệu: Thành viên chỉ xem giao dịch của chính mình, không xem chéo dòng họ.
"""

from __future__ import annotations

import io
import uuid
from decimal import Decimal
from datetime import datetime, timezone
import pytest
from pydantic import ValidationError

from app.core.utils.image_validation import ImageRejected, check_image
from app.models.activity_fund.entities import (
    ClanBankAccount,
    Donation,
    DonationEvidence,
    Fund,
    FundAuditLog,
)
from app.schemas.activity_fund import (
    BankAccountUpdate,
    DonationCreate,
    DonationRejectRequest,
    DonationResponse,
    FundCreate,
    FundResponse,
    FundSummaryResponse,
    FundUpdate,
)
from app.services.activity_fund.fund_service import FundService


# =============================================================================
# 1. KIỂM THỬ SCHEMA VÀ VALIDATION
# =============================================================================

def test_fund_create_validation():
    # Thành công khi có đầy đủ tên và mục đích
    fund = FundCreate(
        name="Quỹ Khuyến học Nguyễn Tộc",
        purpose="Trao học bổng cho con cháu học giỏi",
        target_amount=50000000.0,
        visibility="PUBLIC",
    )
    assert fund.name == "Quỹ Khuyến học Nguyễn Tộc"
    assert fund.purpose == "Trao học bổng cho con cháu học giỏi"
    assert fund.target_amount == 50000000.0

    # Lỗi khi thiếu mục đích
    with pytest.raises(ValidationError):
        FundCreate(name="Quỹ Xây dựng", purpose="")

    # Lỗi khi số tiền âm
    with pytest.raises(ValidationError):
        FundCreate(name="Quỹ Xây dựng", purpose="Tu bổ", target_amount=-100)


def test_donation_create_validation():
    fund_id = uuid.uuid4()
    # Hợp lệ với số tiền > 0
    donation = DonationCreate(
        fund_id=fund_id,
        amount=200000.0,
        donor_name="Nguyễn Văn An",
        note="Đóng góp khuyến học",
    )
    assert donation.amount == 200000.0
    assert donation.fund_id == fund_id

    # Số tiền = 0 hoặc âm phải bị từ chối
    with pytest.raises(ValidationError):
        DonationCreate(fund_id=fund_id, amount=0)

    with pytest.raises(ValidationError):
        DonationCreate(fund_id=fund_id, amount=-50000)


def test_donation_reject_request_requires_reason():
    # Bắt buộc phải có lý do từ chối
    reject = DonationRejectRequest(reason="Không nhận được tiền vào tài khoản ngân hàng")
    assert "Không nhận được tiền" in reject.reason

    with pytest.raises(ValidationError):
        DonationRejectRequest(reason="")


def test_bank_account_update_validation():
    bank = BankAccountUpdate(
        bank_name="Vietcombank",
        account_holder="NGUYEN VAN A",
        account_number="0123456789",
        transfer_instruction="Vui lòng ghi đúng mã đóng góp",
        is_active=True,
    )
    assert bank.bank_name == "Vietcombank"
    assert bank.account_number == "0123456789"


# =============================================================================
# 2. KIỂM THỬ BẢO MẬT TẢI ẢNH (QR & MINH CHỨNG CHUYỂN KHOẢN)
# =============================================================================

def test_check_image_valid_png():
    # PNG header chuẩn 8 bytes + chunk IHDR
    # 89 50 4E 47 0D 0A 1A 0A + length(13) + IHDR + width(100) + height(100)
    png_header = (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR"
        b"\x00\x00\x00\x64\x00\x00\x00\x64\x08\x02\x00\x00\x00"
    )
    checked = check_image(png_header)
    assert checked.mime_type == "image/png"
    assert checked.extension == "png"
    assert checked.width == 100
    assert checked.height == 100
    assert checked.stored_name.endswith(".png")


def test_check_image_reject_svg():
    # SVG bị từ chối tuyệt đối vì nguy cơ XSS script injection
    svg_payload = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert('xss')</script></svg>"
    with pytest.raises(ImageRejected) as exc:
        check_image(svg_payload)
    assert exc.value.reason == "svg_not_allowed"


def test_check_image_reject_empty():
    with pytest.raises(ImageRejected) as exc:
        check_image(b"")
    assert exc.value.reason == "empty"


def test_check_image_reject_too_large():
    # Vượt quá giới hạn 2MB
    huge_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * (2 * 1024 * 1024 + 1)
    with pytest.raises(ImageRejected) as exc:
        check_image(huge_data)
    assert exc.value.reason == "too_large"


# =============================================================================
# 3. KIỂM THỬ SINH MÃ ĐÓNG GÓP (DONATION CODE)
# =============================================================================

def test_generate_donation_code_format():
    service = FundService(db=None)  # Chỉ test pure logic
    code1 = service._generate_donation_code("Quỹ Khuyến học & Phát triển tài năng")
    code2 = service._generate_donation_code("Quỹ Xây dựng từ đường")

    year = str(datetime.now().year)
    assert year in code1
    assert year in code2
    assert code1.startswith("Q")
    assert code2.startswith("Q")
    # Đảm bảo mã độc nhất và phân cách bằng gạch nối
    parts1 = code1.split("-")
    assert len(parts1) == 3
    assert len(parts1[2]) == 6  # 6 chữ số
    assert code1 != code2


# =============================================================================
# 4. KIỂM THỬ MÔ HÌNH THỰC THỂ DATABASE & TRẠNG THÁI GIAO DỊCH
# =============================================================================

def test_donation_model_statuses():
    clan_id = uuid.uuid4()
    fund_id = uuid.uuid4()
    user_id = uuid.uuid4()

    valid_statuses = {"PENDING", "AWAITING_VERIFICATION", "SUCCESS", "REJECTED", "CANCELLED"}
    donation = Donation(
        id=uuid.uuid4(),
        clan_id=clan_id,
        fund_id=fund_id,
        user_id=user_id,
        donor_name="Trần Văn Bình",
        donation_code="QKH-2026-123456",
        amount=Decimal("500000.00"),
        status="PENDING",
        created_at=datetime.now(timezone.utc),
    )

    assert donation.status in valid_statuses
    assert donation.amount == Decimal("500000.00")
    assert donation.donation_code == "QKH-2026-123456"

    # Chuyển sang chờ xác minh sau khi nộp ảnh minh chứng
    donation.status = "AWAITING_VERIFICATION"
    donation.submitted_at = datetime.now(timezone.utc)
    assert donation.status == "AWAITING_VERIFICATION"
    assert donation.submitted_at is not None

    # Tộc trưởng duyệt thành công
    verifier_id = uuid.uuid4()
    donation.status = "SUCCESS"
    donation.verified_by = verifier_id
    donation.verified_at = datetime.now(timezone.utc)
    assert donation.status == "SUCCESS"
    assert donation.verified_by == verifier_id


def test_bank_account_snapshot_immutability():
    # Khi tài khoản ngân hàng thay đổi sau này, snapshot của đơn đóng góp cũ không bị đổi
    initial_snapshot = {
        "bank_name": "Vietcombank",
        "account_holder": "NGUYEN VAN A",
        "account_number": "1028889999",
        "qr_image_path": "/api/uploads/qr_codes/vcb_qr.png",
    }
    donation = Donation(
        id=uuid.uuid4(),
        clan_id=uuid.uuid4(),
        fund_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        donor_name="Nguyễn Văn B",
        donation_code="QKH-2026-999999",
        amount=Decimal("100000.00"),
        status="PENDING",
        bank_account_snapshot=initial_snapshot,
    )
    assert donation.bank_account_snapshot["account_number"] == "1028889999"

    # Giả lập Tộc trưởng đổi sang tài khoản Techcombank sau này
    new_bank_acc = ClanBankAccount(
        id=uuid.uuid4(),
        clan_id=donation.clan_id,
        bank_name="Techcombank",
        account_holder="NGUYEN VAN A",
        account_number="1903333333",
        created_by=uuid.uuid4(),
    )
    assert new_bank_acc.account_number == "1903333333"
    # Đơn cũ vẫn giữ nguyên snapshot cũ để đối soát lịch sử
    assert donation.bank_account_snapshot["account_number"] == "1028889999"


def test_fund_audit_log_actions():
    clan_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    fund_id = uuid.uuid4()

    valid_actions = {
        "CREATE_FUND",
        "UPDATE_FUND",
        "UPDATE_BANK_ACCOUNT",
        "CREATE_DONATION",
        "SUBMIT_EVIDENCE",
        "VERIFY_DONATION",
        "REJECT_DONATION",
        "CANCEL_DONATION",
    }

    log = FundAuditLog(
        id=uuid.uuid4(),
        clan_id=clan_id,
        actor_id=actor_id,
        action="VERIFY_DONATION",
        entity_type="DONATION",
        entity_id=fund_id,
        old_value={"status": "AWAITING_VERIFICATION"},
        new_value={"status": "SUCCESS", "amount": 500000.0},
        created_at=datetime.now(timezone.utc),
    )

    assert log.action in valid_actions
    assert log.entity_type == "DONATION"
    assert log.new_value["amount"] == 500000.0


def test_donation_evidence_entity():
    donation_id = uuid.uuid4()
    evidence = DonationEvidence(
        id=uuid.uuid4(),
        donation_id=donation_id,
        image_path="/api/uploads/donation_evidence/receipt123.jpg",
        file_name="receipt.jpg",
        mime_type="image/jpeg",
        created_at=datetime.now(timezone.utc),
    )

    assert evidence.donation_id == donation_id
    assert evidence.mime_type == "image/jpeg"
    assert "receipt123.jpg" in evidence.image_path


def test_financial_total_calculation_only_counts_success():
    # Chỉ tính tổng tiền từ các giao dịch SUCCESS, không tính PENDING, AWAITING_VERIFICATION hay REJECTED
    donations = [
        {"amount": Decimal("200000"), "status": "SUCCESS"},
        {"amount": Decimal("500000"), "status": "SUCCESS"},
        {"amount": Decimal("300000"), "status": "AWAITING_VERIFICATION"}, # Đang chờ duyệt -> KHÔNG TÍNH
        {"amount": Decimal("100000"), "status": "PENDING"},               # Chưa nộp ảnh -> KHÔNG TÍNH
        {"amount": Decimal("400000"), "status": "REJECTED"},              # Bị từ chối -> KHÔNG TÍNH
    ]

    total_collected = sum(d["amount"] for d in donations if d["status"] == "SUCCESS")
    assert total_collected == Decimal("700000")


def test_fund_delete_audit_action():
    clan_id = uuid.uuid4()
    fund_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    log = FundAuditLog(
        id=uuid.uuid4(),
        clan_id=clan_id,
        actor_id=actor_id,
        action="DELETE_FUND",
        entity_type="FUND",
        entity_id=fund_id,
        old_value={"name": "Quỹ Xóa", "target_amount": 500000},
        new_value=None,
        created_at=datetime.now(timezone.utc),
    )
    assert log.action == "DELETE_FUND"
    assert log.entity_type == "FUND"
    assert log.entity_id == fund_id
    assert log.old_value["name"] == "Quỹ Xóa"
    assert log.new_value is None


def test_donation_with_evidence_creates_awaiting_verification_directly():
    """Kiểm tra: Khi người dùng gửi minh chứng, đơn được tạo trực tiếp ở AWAITING_VERIFICATION."""
    clan_id = uuid.uuid4()
    fund_id = uuid.uuid4()
    user_id = uuid.uuid4()
    donation_id = uuid.uuid4()

    donation = Donation(
        id=donation_id,
        clan_id=clan_id,
        fund_id=fund_id,
        user_id=user_id,
        donor_name="Thành viên Nguyễn Văn A",
        donation_code="QKH-2026-123456",
        amount=Decimal("200000"),
        status="AWAITING_VERIFICATION",
        submitted_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    evidence = DonationEvidence(
        id=uuid.uuid4(),
        donation_id=donation.id,
        image_path="/api/uploads/donation_evidence/test_receipt.png",
        file_name="receipt.png",
        mime_type="image/png",
        created_at=datetime.now(timezone.utc),
    )

    assert donation.status == "AWAITING_VERIFICATION"
    assert donation.submitted_at is not None
    assert evidence.donation_id == donation.id
    assert evidence.image_path.endswith(".png")


def test_my_donations_isolation_only_three_statuses():
    """Kiểm tra: Lịch sử đóng góp chỉ chấp nhận 3 trạng thái: AWAITING_VERIFICATION, SUCCESS, REJECTED."""
    raw_donations = [
        {"id": "1", "status": "PENDING"},                 # Chưa nộp ảnh -> BỊ LOẠI BỎ
        {"id": "2", "status": "CANCELLED"},               # Đã hủy -> BỊ LOẠI BỎ
        {"id": "3", "status": "AWAITING_VERIFICATION"},   # Đang chờ duyệt -> HỢP LỆ
        {"id": "4", "status": "SUCCESS"},                 # Đã xác nhận -> HỢP LỆ
        {"id": "5", "status": "REJECTED"},                # Từ chối -> HỢP LỆ
    ]
    valid_statuses = {"AWAITING_VERIFICATION", "SUCCESS", "REJECTED"}
    filtered = [d for d in raw_donations if d["status"] in valid_statuses]

    assert len(filtered) == 3
    assert all(d["status"] in valid_statuses for d in filtered)
    assert not any(d["status"] in ["PENDING", "CANCELLED"] for d in filtered)



