"""C05. Activity & Fund Controller.

Handles family activities, announcements, events, funds, donations, and member notifications.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.activity_fund.entities import Notification, UserNotification
from app.models.family.entities import Clan, ClanMembership
from app.models.postgres import Account
from app.models.user_access.entities import AuditLog
from app.services.auth_access.access_service import AccessService
from app.dependencies.auth import get_current_account

router = APIRouter(tags=["C05. Activity & Fund Controller"])


def _family_uuid(val: str) -> uuid.UUID:
    try:
        return uuid.UUID(val)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid family_id format")


async def _require_branch_scope(
    db: AsyncSession,
    account: Account,
    clan_id: uuid.UUID,
    branch_id: Optional[uuid.UUID],
    action: str,
) -> None:
    role = getattr(account, "primary_role", "").lower()
    if role in ("admin", "system_admin"):
        return
    roles = await AccessService(db).repo.get_active_roles(account.id, str(clan_id))
    role_set = {r.lower() for r in roles}
    if role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}):
        return
    if "family_admin" in role_set:
        return
    raise HTTPException(status_code=403, detail="Không có quyền thực hiện hành động này")


class ClanAnnouncementCreate(BaseModel):
    title: str
    content: str
    category: Optional[str] = "event"
    targetAudience: Optional[str] = "all"
    priority: Optional[str] = "normal"
    channels: Optional[Dict[str, bool]] = None


@router.post("/families/{family_id}/announcements", status_code=status.HTTP_201_CREATED)
async def publish_clan_announcement(
    family_id: str,
    data: ClanAnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Phát thông báo hoạt động, sự kiện dòng họ tới toàn thể thành viên."""
    f_uuid = _family_uuid(family_id)
    await _require_branch_scope(db, account, f_uuid, None, "family.update")

    clan_res = await db.execute(select(Clan).where(Clan.clan_id == f_uuid))
    clan = clan_res.scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=404, detail="Không tìm thấy dòng họ")

    roles = await AccessService(db).repo.get_active_roles(account.id, str(f_uuid))
    role_set = {r.lower() for r in roles}
    is_leader = bool(role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}))
    sender_role = "Trưởng Tộc" if is_leader else "Quản trị viên gia tộc"
    sender_display = getattr(account, "display_name", None) or getattr(account, "full_name", None) or account.email.split("@")[0]

    notif = Notification(
        notification_id=uuid.uuid4(),
        clan_id=f_uuid,
        type=data.category.upper() if data.category else "EVENT",
        title=data.title.strip(),
        body=data.content.strip(),
        entity_type="ANNOUNCEMENT",
        sender_name=sender_display,
        sender_role=sender_role,
        target_audience=data.targetAudience or "all",
        priority=data.priority or "normal",
        channels=data.channels or {"inApp": True, "email": True, "push": False},
        created_at=datetime.now(timezone.utc),
    )
    db.add(notif)
    await db.flush()

    m_res = await db.execute(
        select(ClanMembership.user_id).where(
            ClanMembership.clan_id == f_uuid,
            ClanMembership.status == "ACTIVE",
            ClanMembership.revoked_at.is_(None),
        )
    )
    member_user_ids = set(m_res.scalars().all())
    member_user_ids.add(account.id)

    now_utc = datetime.now(timezone.utc)
    for uid in member_user_ids:
        un = UserNotification(
            notification_id=notif.notification_id,
            user_id=uid,
            delivered_at=now_utc,
            read_at=now_utc if uid == account.id else None,
        )
        db.add(un)

    db.add(AuditLog(
        log_id=uuid.uuid4(),
        clan_id=f_uuid,
        actor_id=account.id,
        action="Phát thông báo dòng họ",
        entity_type="ANNOUNCEMENT",
        entity_id=notif.notification_id,
        new_data={"title": notif.title, "recipient_count": len(member_user_ids)},
        reason="Thông báo dòng họ",
        occurred_at=now_utc,
    ))

    await db.commit()

    return {
        "success": True,
        "message": f"Đã phát thông báo thành công đến {len(member_user_ids)} thành viên dòng họ.",
        "announcement": {
            "id": str(notif.notification_id),
            "clanName": clan.name,
            "senderName": notif.sender_name,
            "senderRole": notif.sender_role,
            "title": notif.title,
            "content": notif.body,
            "category": notif.type.lower(),
            "targetAudience": notif.target_audience,
            "priority": notif.priority,
            "channels": notif.channels,
            "createdAt": notif.created_at.strftime("%d/%m/%Y %H:%M"),
            "recipientCount": len(member_user_ids),
            "readCount": 1,
        }
    }


@router.get("/families/{family_id}/announcements")
async def list_clan_announcements(
    family_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Danh sách các thông báo hoạt động & sự kiện của dòng họ."""
    f_uuid = _family_uuid(family_id)

    clan_res = await db.execute(select(Clan).where(Clan.clan_id == f_uuid))
    clan = clan_res.scalar_one_or_none()
    clan_name = clan.name if clan else "Dòng họ"

    stmt = select(Notification).where(
        Notification.clan_id == f_uuid
    ).order_by(Notification.created_at.desc())

    res = await db.execute(stmt)
    notifs = res.scalars().all()

    items = []
    for n in notifs:
        u_res = await db.execute(
            select(
                func.count(UserNotification.user_id),
                func.count(UserNotification.read_at),
            ).where(UserNotification.notification_id == n.notification_id)
        )
        rec_cnt, read_cnt = u_res.first() or (0, 0)

        items.append({
            "id": str(n.notification_id),
            "clanName": clan_name,
            "senderName": n.sender_name or "Hội đồng gia tộc",
            "senderRole": n.sender_role or "Ban quản trị",
            "title": n.title,
            "content": n.body,
            "category": (n.type or "system").lower(),
            "targetAudience": n.target_audience or "all",
            "priority": n.priority or "normal",
            "channels": n.channels or {"inApp": True, "email": True, "push": False},
            "createdAt": n.created_at.strftime("%d/%m/%Y %H:%M"),
            "recipientCount": rec_cnt,
            "readCount": read_cnt,
        })

    return items


@router.delete("/families/{family_id}/announcements/{announcement_id}")
async def delete_clan_announcement(
    family_id: str,
    announcement_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Xóa / thu hồi thông báo dòng họ."""
    f_uuid = _family_uuid(family_id)
    await _require_branch_scope(db, account, f_uuid, None, "family.update")

    try:
        a_uuid = uuid.UUID(announcement_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid announcement_id")

    n_res = await db.execute(select(Notification).where(Notification.notification_id == a_uuid, Notification.clan_id == f_uuid))
    notif = n_res.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo")

    await db.delete(notif)
    await db.commit()
    return {"success": True, "message": "Đã xóa thông báo dòng họ thành công."}


@router.get("/notifications")
async def list_user_notifications(
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Hòm thư thông báo cá nhân thành viên."""
    stmt = (
        select(Notification, UserNotification.read_at)
        .join(UserNotification, UserNotification.notification_id == Notification.notification_id)
        .where(UserNotification.user_id == account.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    )

    res = await db.execute(stmt)
    rows = res.all()

    items = []
    for notif, read_at in rows:
        items.append({
            "id": str(notif.notification_id),
            "notificationId": str(notif.notification_id),
            "category": (notif.type or "system").lower(),
            "title": notif.title,
            "content": notif.body,
            "createdAt": notif.created_at.strftime("%d/%m/%Y %H:%M"),
            "read": read_at is not None,
            "readAt": read_at.isoformat() if read_at else None,
            "senderName": notif.sender_name or "Hội đồng gia tộc",
            "targetAudience": notif.target_audience or "all",
            "priority": notif.priority or "normal",
        })

    return items


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Đánh dấu thông báo đã đọc."""
    try:
        n_uuid = uuid.UUID(notification_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid notification_id")

    res = await db.execute(
        select(UserNotification).where(
            UserNotification.notification_id == n_uuid,
            UserNotification.user_id == account.id,
        )
    )
    un = res.scalar_one_or_none()
    if un:
        un.read_at = datetime.now(timezone.utc)
        await db.commit()

    return {"success": True}


@router.put("/notifications/mark-all-read")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Đánh dấu tất cả thông báo trong hộp thư là đã đọc."""
    stmt = (
        update(UserNotification)
        .where(
            UserNotification.user_id == account.id,
            UserNotification.read_at.is_(None),
        )
        .values(read_at=datetime.now(timezone.utc))
    )
    await db.execute(stmt)
    await db.commit()
    return {"success": True}


# =============================================================================
# FUNDS & DONATIONS ENDPOINTS (MODULE C05 - SPRINT 5)
# =============================================================================
import os
from decimal import Decimal
from fastapi import File, Form, UploadFile
from fastapi.responses import FileResponse
from app.core.utils.image_validation import SAFE_SERVE_HEADERS
from app.schemas.activity_fund import (
    FundCreate,
    FundUpdate,
    FundResponse,
    BankAccountUpdate,
    BankAccountResponse,
    DonationCreate,
    DonationResponse,
    DonationSubmitEvidence,
    DonationVerifyRequest,
    DonationRejectRequest,
    DonationCancelRequest,
    EvidenceItem,
    FundSummaryResponse,
)
from app.services.activity_fund.fund_service import FundService, QR_UPLOAD_DIR, EVIDENCE_UPLOAD_DIR


# --- 1. QUẢN LÝ QUỸ (FUNDS) ---

@router.post("/clans/{clan_id}/funds", response_model=FundResponse, status_code=status.HTTP_201_CREATED)
@router.post("/families/{clan_id}/funds", response_model=FundResponse, status_code=status.HTTP_201_CREATED)
async def create_clan_fund(
    clan_id: str,
    data: FundCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Tộc trưởng hoặc Family Admin tạo quỹ dòng họ mới."""
    c_uuid = _family_uuid(clan_id)
    return await FundService(db).create_fund(c_uuid, account, data)


@router.get("/clans/{clan_id}/funds", response_model=List[FundResponse])
@router.get("/families/{clan_id}/funds", response_model=List[FundResponse])
async def list_clan_funds(
    clan_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Danh sách các quỹ của dòng họ (Thành viên xem quỹ công khai, Admin xem toàn bộ)."""
    c_uuid = _family_uuid(clan_id)
    return await FundService(db).list_funds(c_uuid, account)


@router.patch("/clans/{clan_id}/funds/{fund_id}", response_model=FundResponse)
@router.patch("/families/{clan_id}/funds/{fund_id}", response_model=FundResponse)
async def update_clan_fund(
    clan_id: str,
    fund_id: str,
    data: FundUpdate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Cập nhật thông tin hoặc trạng thái quỹ (Tộc trưởng hoặc Family Admin)."""
    c_uuid = _family_uuid(clan_id)
    f_uuid = _family_uuid(fund_id)
    return await FundService(db).update_fund(c_uuid, f_uuid, account, data)


@router.delete("/clans/{clan_id}/funds/{fund_id}")
@router.delete("/families/{clan_id}/funds/{fund_id}")
async def delete_clan_fund(
    clan_id: str,
    fund_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Xóa quỹ dòng họ (Chỉ Tộc trưởng hoặc Family Admin)."""
    c_uuid = _family_uuid(clan_id)
    f_uuid = _family_uuid(fund_id)
    return await FundService(db).delete_fund(c_uuid, f_uuid, account)


# --- 2. CẤU HÌNH TÀI KHOẢN NGÂN HÀNG & QR NHẬN ĐÓNG GÓP ---

@router.get("/clans/{clan_id}/bank-account", response_model=Optional[BankAccountResponse])
@router.get("/families/{clan_id}/bank-account", response_model=Optional[BankAccountResponse])
async def get_clan_bank_account(
    clan_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Lấy thông tin tài khoản ngân hàng và mã QR của dòng họ."""
    c_uuid = _family_uuid(clan_id)
    return await FundService(db).get_bank_account(c_uuid, account)


@router.put("/clans/{clan_id}/bank-account", response_model=BankAccountResponse)
@router.put("/families/{clan_id}/bank-account", response_model=BankAccountResponse)
async def update_clan_bank_account(
    clan_id: str,
    data: BankAccountUpdate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Cập nhật thông tin tài khoản nhận tiền dòng họ (Tộc trưởng hoặc Family Admin)."""
    c_uuid = _family_uuid(clan_id)
    return await FundService(db).update_bank_account(c_uuid, account, data)


@router.post("/clans/{clan_id}/bank-account/qr-upload")
@router.post("/families/{clan_id}/bank-account/qr-upload")
async def upload_clan_qr_code(
    clan_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Tải lên hình ảnh mã QR ngân hàng của dòng họ (PNG, JPEG, WebP <= 2MB)."""
    c_uuid = _family_uuid(clan_id)
    return await FundService(db).upload_bank_qr_image(c_uuid, account, file)


# --- 3. QUY TRÌNH ĐÓNG GÓP CỦA THÀNH VIÊN ---

@router.post("/clans/{clan_id}/donations/with-evidence", response_model=DonationResponse, status_code=status.HTTP_201_CREATED)
@router.post("/families/{clan_id}/donations/with-evidence", response_model=DonationResponse, status_code=status.HTTP_201_CREATED)
async def create_donation_with_evidence_request(
    clan_id: str,
    fund_id: str = Form(...),
    amount: float = Form(...),
    donor_name: Optional[str] = Form(None),
    donation_code: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    bank_transaction_reference: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Thành viên nộp yêu cầu đóng góp KÈM ẢNH MINH CHỨNG (Bắt buộc phải có ảnh).
    
    Quy tắc:
    - Nếu chưa có ảnh minh chứng hợp lệ thì tuyệt đối không tạo yêu cầu.
    - Đơn được tạo trực tiếp với trạng thái AWAITING_VERIFICATION để Tộc trưởng đối soát.
    """
    c_uuid = _family_uuid(clan_id)
    f_uuid = _family_uuid(fund_id)
    return await FundService(db).create_donation_with_evidence(
        clan_id=c_uuid,
        actor=account,
        fund_id=f_uuid,
        amount=Decimal(str(amount)),
        file=file,
        donor_name=donor_name,
        donation_code=donation_code,
        note=note,
        bank_transaction_reference=bank_transaction_reference,
    )


@router.post("/clans/{clan_id}/donations", response_model=DonationResponse, status_code=status.HTTP_201_CREATED)
@router.post("/families/{clan_id}/donations", response_model=DonationResponse, status_code=status.HTTP_201_CREATED)
async def create_donation_request(
    clan_id: str,
    data: DonationCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Thành viên tạo yêu cầu đóng góp quỹ (sinh mã đóng góp duy nhất)."""
    c_uuid = _family_uuid(clan_id)
    return await FundService(db).create_donation(c_uuid, account, data)


@router.post("/clans/{clan_id}/donations/{donation_id}/evidence", response_model=EvidenceItem)
@router.post("/families/{clan_id}/donations/{donation_id}/evidence", response_model=EvidenceItem)
async def upload_donation_evidence_file(
    clan_id: str,
    donation_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Thành viên tải lên ảnh biên lai / ảnh chụp màn hình giao dịch chuyển khoản."""
    c_uuid = _family_uuid(clan_id)
    d_uuid = _family_uuid(donation_id)
    return await FundService(db).upload_donation_evidence(c_uuid, d_uuid, account, file)


@router.post("/clans/{clan_id}/donations/{donation_id}/submit", response_model=DonationResponse)
@router.post("/families/{clan_id}/donations/{donation_id}/submit", response_model=DonationResponse)
async def submit_donation_evidence_and_request(
    clan_id: str,
    donation_id: str,
    data: DonationSubmitEvidence,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Thành viên xác nhận 'Tôi đã chuyển khoản' để gửi yêu cầu đến Tộc trưởng kiểm tra đối soát."""
    c_uuid = _family_uuid(clan_id)
    d_uuid = _family_uuid(donation_id)
    return await FundService(db).submit_donation_verification(
        c_uuid, d_uuid, account, data.bank_transaction_reference, data.note
    )


# --- 4. TRUY VẤN VÀ LỊCH SỬ GIAO DỊCH (ISOLATION) ---

@router.get("/clans/{clan_id}/donations/me", response_model=List[DonationResponse])
@router.get("/families/{clan_id}/donations/me", response_model=List[DonationResponse])
async def list_my_clan_donations(
    clan_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Lịch sử đóng góp cá nhân của tài khoản đăng nhập (chỉ trả về giao dịch của chính mình)."""
    c_uuid = _family_uuid(clan_id)
    return await FundService(db).list_my_donations(c_uuid, account)


@router.get("/clans/{clan_id}/donations", response_model=List[DonationResponse])
@router.get("/families/{clan_id}/donations", response_model=List[DonationResponse])
async def list_all_clan_donations(
    clan_id: str,
    fund_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Tộc trưởng và Family Admin xem toàn bộ giao dịch đóng góp thuộc dòng họ."""
    c_uuid = _family_uuid(clan_id)
    f_uuid = _family_uuid(fund_id) if fund_id else None
    return await FundService(db).list_clan_donations(c_uuid, account, f_uuid, status_filter)


@router.get("/clans/{clan_id}/donations/{donation_id}", response_model=DonationResponse)
@router.get("/families/{clan_id}/donations/{donation_id}", response_model=DonationResponse)
async def get_donation_detail_by_id(
    clan_id: str,
    donation_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Xem chi tiết một giao dịch đóng góp (người tạo hoặc ban quản trị)."""
    c_uuid = _family_uuid(clan_id)
    d_uuid = _family_uuid(donation_id)
    return await FundService(db).get_donation_detail(c_uuid, d_uuid, account)


# --- 5. ĐỐI SOÁT & PHÊ DUYỆT (ĐỘC QUYỀN TỘC TRƯỞNG) ---

@router.post("/clans/{clan_id}/donations/{donation_id}/verify", response_model=DonationResponse)
@router.post("/families/{clan_id}/donations/{donation_id}/verify", response_model=DonationResponse)
async def verify_donation_success(
    clan_id: str,
    donation_id: str,
    data: Optional[DonationVerifyRequest] = None,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Tộc trưởng bấm 'Xác nhận đã nhận tiền'. CHỈ TỘC TRƯỞNG CÓ QUYỀN NÀY."""
    c_uuid = _family_uuid(clan_id)
    d_uuid = _family_uuid(donation_id)
    note = data.note if data else None
    return await FundService(db).verify_donation(c_uuid, d_uuid, account, note)


@router.post("/clans/{clan_id}/donations/{donation_id}/reject", response_model=DonationResponse)
@router.post("/families/{clan_id}/donations/{donation_id}/reject", response_model=DonationResponse)
async def reject_donation_request(
    clan_id: str,
    donation_id: str,
    data: DonationRejectRequest,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Tộc trưởng từ chối giao dịch đóng góp (bắt buộc nhập lý do)."""
    c_uuid = _family_uuid(clan_id)
    d_uuid = _family_uuid(donation_id)
    return await FundService(db).reject_donation(c_uuid, d_uuid, account, data.reason)


@router.post("/clans/{clan_id}/donations/{donation_id}/cancel", response_model=DonationResponse)
@router.post("/families/{clan_id}/donations/{donation_id}/cancel", response_model=DonationResponse)
async def cancel_donation_request(
    clan_id: str,
    donation_id: str,
    data: Optional[DonationCancelRequest] = None,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Thành viên tự hủy yêu cầu đóng góp của mình."""
    c_uuid = _family_uuid(clan_id)
    d_uuid = _family_uuid(donation_id)
    reason = data.reason if data else None
    return await FundService(db).cancel_donation(c_uuid, d_uuid, account, reason)


# --- 6. TỔNG KẾT & THỐNG KÊ QUỸ ---

@router.get("/clans/{clan_id}/funds/summary", response_model=FundSummaryResponse)
@router.get("/families/{clan_id}/funds/summary", response_model=FundSummaryResponse)
async def get_clan_funds_summary(
    clan_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Lấy dữ liệu tổng hợp số dư, tổng mục tiêu và số khoản đang chờ duyệt."""
    c_uuid = _family_uuid(clan_id)
    return await FundService(db).get_funds_summary(c_uuid, account)


# --- 7. SERVE AN TOÀN TỆP TIN ĐÃ UPLOAD ---

@router.get("/uploads/{category}/{filename}")
@router.get("/api/uploads/{category}/{filename}")
async def serve_uploaded_file(
    category: str,
    filename: str,
):
    """Phục vụ ảnh QR ngân hàng và ảnh minh chứng đóng góp an toàn với SAFE_SERVE_HEADERS."""
    if category not in ("qr_codes", "donation_evidence"):
        raise HTTPException(status_code=400, detail="Thư mục không hợp lệ")

    # Bảo vệ chống directory traversal
    clean_filename = os.path.basename(filename)
    if clean_filename != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Tên tệp tin không hợp lệ")

    if category == "qr_codes":
        file_path = os.path.join(QR_UPLOAD_DIR, clean_filename)
    else:
        file_path = os.path.join(EVIDENCE_UPLOAD_DIR, clean_filename)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp tin")

    # Xác định Content-Type
    ext = os.path.splitext(clean_filename)[1].lower()
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    media_type = media_type_map.get(ext, "application/octet-stream")

    return FileResponse(file_path, media_type=media_type, headers=SAFE_SERVE_HEADERS)

