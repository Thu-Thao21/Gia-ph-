"""Notification Service for Module C05: Activity & Fund.
Điều phối và phát thông báo in-app cho toàn hệ thống:
- Thông báo khi có yêu cầu mới (Gia nhập dòng họ, Đề xuất địa điểm, Đề xuất phả hệ, Yêu cầu liên họ)
- Thông báo khi yêu cầu được phê duyệt hoặc từ chối
- Thông báo khi có sự kiện, thay đổi phân quyền, thông cáo dòng họ
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Set

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family.entities import (
    Clan,
    ClanMembership,
    FamilyAdminAssignment,
    Notification,
    UserNotification,
)
from app.models.user_access.entities import Role, UserRole

logger = logging.getLogger("mfg.notification_service")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class NotificationService:
    @staticmethod
    async def get_clan_admin_user_ids(
        db: AsyncSession,
        clan_id: uuid.UUID,
        exclude_user_id: Optional[uuid.UUID] = None,
    ) -> List[uuid.UUID]:
        """Truy vấn tất cả user_id có vai trò quản trị (Trưởng tộc, Clan Admin, Family Admin) trong dòng họ."""
        admin_uids: Set[uuid.UUID] = set()

        # 1. Người tạo dòng họ (Clan Creator)
        clan_res = await db.execute(select(Clan.created_by).where(Clan.clan_id == clan_id))
        creator_id = clan_res.scalar_one_or_none()
        if creator_id:
            admin_uids.add(creator_id)

        # 2. Người dùng có UserRole phù hợp
        admin_roles_res = await db.execute(
            select(Role.role_id).where(
                Role.code.in_(["OWNER", "BUSINESS_OWNER", "CLAN_ADMIN", "FAMILY_ADMIN", "ADMIN"])
            )
        )
        role_ids = list(admin_roles_res.scalars().all())
        if role_ids:
            ur_res = await db.execute(
                select(UserRole.user_id).where(
                    UserRole.role_id.in_(role_ids),
                    or_(UserRole.clan_id == clan_id, UserRole.clan_id.is_(None)),
                    UserRole.revoked_at.is_(None),
                )
            )
            for uid in ur_res.scalars().all():
                admin_uids.add(uid)

        # 3. Family Admin Assignments
        fa_res = await db.execute(
            select(FamilyAdminAssignment.user_id).where(FamilyAdminAssignment.clan_id == clan_id)
        )
        for uid in fa_res.scalars().all():
            admin_uids.add(uid)

        if exclude_user_id and exclude_user_id in admin_uids:
            admin_uids.remove(exclude_user_id)

        return list(admin_uids)

    @staticmethod
    async def create_and_fanout(
        db: AsyncSession,
        recipient_user_ids: List[uuid.UUID],
        title: str,
        body: str,
        clan_id: Optional[uuid.UUID] = None,
        notif_type: str = "REQUEST",
        entity_type: Optional[str] = None,
        entity_id: Optional[uuid.UUID] = None,
        sender_name: str = "Ban Quản trị dòng họ",
        sender_role: Optional[str] = "Hệ thống",
        target_audience: str = "all",
        priority: str = "normal",
    ) -> Optional[Notification]:
        """Tạo Notification và phân phối (fan-out) UserNotification tới danh sách người nhận."""
        unique_recipients = list(set([uid for uid in recipient_user_ids if uid]))
        if not unique_recipients:
            return None

        now = _now_utc()
        notif = Notification(
            notification_id=uuid.uuid4(),
            clan_id=clan_id,
            type=notif_type.upper(),
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
            sender_name=sender_name,
            sender_role=sender_role,
            target_audience=target_audience,
            priority=priority,
            channels={"inApp": True, "email": False, "push": False},
            created_at=now,
        )
        db.add(notif)
        await db.flush()

        for uid in unique_recipients:
            un = UserNotification(
                notification_id=notif.notification_id,
                user_id=uid,
                delivered_at=now,
            )
            db.add(un)

        try:
            await db.commit()
            logger.info(
                "Đã gửi thông báo '%s' tới %d người dùng (clan_id=%s)",
                title,
                len(unique_recipients),
                clan_id,
            )
        except Exception as e:
            logger.error("Lỗi khi gửi thông báo: %s", e)
            await db.rollback()

        return notif

    @classmethod
    async def notify_clan_admins(
        cls,
        db: AsyncSession,
        clan_id: uuid.UUID,
        title: str,
        body: str,
        notif_type: str = "REQUEST",
        entity_type: Optional[str] = None,
        entity_id: Optional[uuid.UUID] = None,
        sender_name: str = "Thành viên dòng họ",
        exclude_user_id: Optional[uuid.UUID] = None,
    ) -> Optional[Notification]:
        """Gửi thông báo đến toàn bộ Ban Quản trị / Trưởng tộc của dòng họ."""
        admin_uids = await cls.get_clan_admin_user_ids(db, clan_id, exclude_user_id=exclude_user_id)
        if not admin_uids:
            return None
        return await cls.create_and_fanout(
            db=db,
            recipient_user_ids=admin_uids,
            title=title,
            body=body,
            clan_id=clan_id,
            notif_type=notif_type,
            entity_type=entity_type,
            entity_id=entity_id,
            sender_name=sender_name,
            sender_role="Thành viên",
            target_audience="admin",
            priority="high",
        )

    @classmethod
    async def notify_single_user(
        cls,
        db: AsyncSession,
        user_id: uuid.UUID,
        title: str,
        body: str,
        clan_id: Optional[uuid.UUID] = None,
        notif_type: str = "SYSTEM",
        entity_type: Optional[str] = None,
        entity_id: Optional[uuid.UUID] = None,
        sender_name: str = "Hội đồng dòng họ",
    ) -> Optional[Notification]:
        """Gửi thông báo riêng đến một tài khoản người dùng cụ thể."""
        return await cls.create_and_fanout(
            db=db,
            recipient_user_ids=[user_id],
            title=title,
            body=body,
            clan_id=clan_id,
            notif_type=notif_type,
            entity_type=entity_type,
            entity_id=entity_id,
            sender_name=sender_name,
            sender_role="Hội đồng dòng họ",
            target_audience="individual",
            priority="normal",
        )


notification_service = NotificationService()

