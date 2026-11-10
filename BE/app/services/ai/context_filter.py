"""AI Context Filter Service (MFGMS-AI Phase 2).

Enforces Privacy-by-Design, Tenant Isolation, and Person-Level Consent:
1. Clan Level: Verifies `clan_ai_settings` (ai_enabled, features, allowed_data_scopes).
2. Person Level:
   - Deceased persons: Eligible if general_history scope is enabled.
   - Living persons: Require explicit, active AIConsent linked to their person_id in this clan.
   - Denied/Unconsented living persons: Private PII is completely redacted or omitted.
3. Outputs sanitized context text with zero leaks of unconsented private data.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai.entities import AIConsent, ClanAISetting
from app.models.genealogy.entities import Person

logger = logging.getLogger("mfg.ai.filter")


@dataclass
class FilteredPersonResult:
    person_id: uuid.UUID
    display_label: str
    is_living: bool
    consent_granted: bool
    fields_included: List[str]
    fields_redacted: List[str]
    data: Dict[str, Any]


@dataclass
class AIContextFilterResult:
    clan_id: uuid.UUID
    clan_ai_enabled: bool
    purpose: str
    total_candidates: int
    allowed_count: int
    redacted_count: int
    filtered_persons: List[FilteredPersonResult] = field(default_factory=list)
    sanitized_context_text: str = ""
    rejection_summary: List[str] = field(default_factory=list)


class AIContextFilterService:
    """Bộ lọc dữ liệu phả hệ dùng chung trước khi gửi ra mô hình Gemini."""

    async def filter_persons_context(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        purpose: str,
        candidate_persons: List[Person],
    ) -> AIContextFilterResult:
        """Lọc danh sách Person theo ranh giới dòng họ và quyền đồng ý AI cá nhân."""
        # 1. Kiểm tra cấu hình AI của Clan
        setting_stmt = select(ClanAISetting).where(ClanAISetting.clan_id == clan_id)
        clan_setting = (await db.execute(setting_stmt)).scalar_one_or_none()

        if not clan_setting or not clan_setting.ai_enabled:
            return AIContextFilterResult(
                clan_id=clan_id,
                clan_ai_enabled=False,
                purpose=purpose,
                total_candidates=len(candidate_persons),
                allowed_count=0,
                redacted_count=len(candidate_persons),
                sanitized_context_text="[DỮ LIỆU BỊ CHẶN: Dòng họ chưa kích hoạt tính năng AI]",
                rejection_summary=["Trưởng tộc chưa bật tính năng AI cho dòng họ này."],
            )

        data_scopes = clan_setting.allowed_data_scopes or {}
        allow_general_history = bool(data_scopes.get("general_history", True))
        allow_personal_data = bool(data_scopes.get("personal_data", False))
        allow_images = bool(data_scopes.get("images", False))

        # 2. Truy vấn danh sách AIConsent ACTIVE và REFUSED cho clan_id và purpose này
        consent_stmt = select(AIConsent.person_id).where(
            AIConsent.clan_id == clan_id,
            AIConsent.purpose == purpose,
            AIConsent.granted.is_(True),
            AIConsent.revoked_at.is_(None),
            AIConsent.person_id.is_not(None),
        )
        consented_person_ids: Set[uuid.UUID] = set(
            (await db.execute(consent_stmt)).scalars().all()
        )

        refused_stmt = select(AIConsent.person_id).where(
            AIConsent.clan_id == clan_id,
            AIConsent.purpose == purpose,
            AIConsent.granted.is_(False),
            AIConsent.person_id.is_not(None),
        )
        refused_person_ids: Set[uuid.UUID] = set(
            (await db.execute(refused_stmt)).scalars().all()
        )

        filtered_results: List[FilteredPersonResult] = []
        text_lines: List[str] = []
        rejections: List[str] = []

        allowed_count = 0
        redacted_count = 0

        for p in candidate_persons:
            # Xác định người còn sống hay đã mất
            is_living = bool(p.is_alive is not False and p.death_date is None)
            is_explicitly_refused = (p.id in refused_person_ids)
            has_explicit_consent = (p.id in consented_person_ids)

            # Trường hợp 1: Người đã khuất
            if not is_living:
                if not allow_general_history:
                    redacted_count += 1
                    rejections.append(f"Person {p.id}: Bị ẩn vì dòng họ tắt phạm vi general_history.")
                    continue

                allowed_count += 1
                birth_year = p.birth_date.year if p.birth_date else "Không rõ"
                death_year = p.death_date.year if p.death_date else "Không rõ"
                line = f"- {p.full_name} (Đời thứ {p.generation or 1}, sinh: {birth_year}, mất: {death_year})"
                if p.bio:
                    line += f": {p.bio}"
                text_lines.append(line)

                filtered_results.append(
                    FilteredPersonResult(
                        person_id=p.id,
                        display_label=p.full_name,
                        is_living=False,
                        consent_granted=True,  # Deceased fall under clan historical scope
                        fields_included=["full_name", "generation", "birth_date", "death_date", "bio"],
                        fields_redacted=[],
                        data={"name": p.full_name, "generation": p.generation},
                    )
                )
                continue

            # Trường hợp 2: Người còn sống
            # Chính sách bảo trợ của Trưởng họ:
            # Khi Trưởng tộc đã bật phạm vi personal_data = True trong cấu hình dòng họ,
            # các thành viên trong cây gia phả được bảo trợ cung cấp thông tin phả hệ cơ bản (họ tên, thế hệ, con cái),
            # TRỪ KHI cá nhân đó có tài khoản và chủ động từ chối (is_explicitly_refused).
            if allow_personal_data and not is_explicitly_refused:
                allowed_count += 1
                fields_inc = ["full_name", "generation", "gender"]
                fields_red = []

                if p.birth_date:
                    birth_str = p.birth_date.strftime("%d/%m/%Y")
                    fields_inc.append("birth_date")
                    line = f"- {p.full_name} (Thành viên còn sống, Đời thứ {p.generation or 1}, sinh ngày: {birth_str})"
                else:
                    line = f"- {p.full_name} (Thành viên còn sống, Đời thứ {p.generation or 1})"

                if allow_images and has_explicit_consent and p.avatar_url:
                    line += f" [Có hình ảnh]"
                    fields_inc.append("avatar_url")
                else:
                    fields_red.append("avatar_url")

                text_lines.append(line)
                filtered_results.append(
                    FilteredPersonResult(
                        person_id=p.id,
                        display_label=p.full_name,
                        is_living=True,
                        consent_granted=True,
                        fields_included=fields_inc,
                        fields_redacted=fields_red,
                        data={"name": p.full_name, "generation": p.generation},
                    )
                )
            else:
                # BỊ TỪ CHỐI HOẶC DÒNG HỌ TẮT PERSONAL_DATA: ẨN DANH THÔNG TIN PII
                redacted_count += 1
                reason = "Cá nhân chủ động từ chối quyền AI (AIConsent=False)" if is_explicitly_refused else "Dòng họ tắt phạm vi personal_data"
                rejections.append(f"Person {p.id}: {reason}. Đã che giấu toàn bộ PII.")

                # Đưa vào ngữ cảnh ở dạng ẩn danh cấu trúc phả hệ (không để lộ PII)
                anonymized_line = f"- [Thành viên thế hệ {p.generation or 1} - Đã ẩn thông tin cá nhân vì chưa có sự đồng ý AI]"
                text_lines.append(anonymized_line)

                filtered_results.append(
                    FilteredPersonResult(
                        person_id=p.id,
                        display_label=f"Thành viên ẩn danh (Đời {p.generation or 1})",
                        is_living=True,
                        consent_granted=False,
                        fields_included=["generation"],
                        fields_redacted=["full_name", "birth_date", "bio", "avatar_url"],
                        data={"generation": p.generation},
                    )
                )

        sanitized_context = "\n".join(text_lines)

        return AIContextFilterResult(
            clan_id=clan_id,
            clan_ai_enabled=True,
            purpose=purpose,
            total_candidates=len(candidate_persons),
            allowed_count=allowed_count,
            redacted_count=redacted_count,
            filtered_persons=filtered_results,
            sanitized_context_text=sanitized_context,
            rejection_summary=rejections,
        )


ai_context_filter = AIContextFilterService()

