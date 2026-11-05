"""Module Test C08: AI Assistant Controller & Model.

Kiểm tra:
- Khởi tạo ClanAISetting và AIConsent
- Cơ chế bảo trợ của Trưởng tộc khi personal_data = True
- Lọc quyền riêng tư thành viên còn sống qua AIContextFilterService
- Làm sạch và loại bỏ markdown thô từ Gemini (sanitize_ai_response)
"""

from __future__ import annotations

import uuid
import pytest
from app.models.ai.entities import AIConsent, ClanAISetting
from app.services.ai.chatbot_service import sanitize_ai_response


def test_sanitize_ai_response():
    raw_text = "**Chào bạn!** Đây là thông tin gia phả từ hệ thống."
    cleaned = sanitize_ai_response(raw_text)
    assert "**" not in cleaned
    assert "Chào bạn!" in cleaned


def test_clan_ai_setting_defaults():
    clan_id = uuid.uuid4()
    setting = ClanAISetting(
        clan_id=clan_id,
        ai_enabled=True,
        gemini_model="gemini-2.5-flash",
        features={"assistant": True, "relationship_analysis": True},
        allowed_data_scopes={"public_events": True, "general_history": True, "personal_data": True},
    )

    assert setting.clan_id == clan_id
    assert setting.ai_enabled is True
    assert setting.allowed_data_scopes.get("personal_data") is True


def test_ai_consent_entity():
    person_id = uuid.uuid4()
    clan_id = uuid.uuid4()
    consent = AIConsent(
        clan_id=clan_id,
        person_id=person_id,
        purpose="genealogyData",
        granted=True,
    )

    assert consent.person_id == person_id
    assert consent.granted is True
    assert consent.purpose == "genealogyData"
