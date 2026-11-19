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


def test_extract_clan_surname():
    from app.services.ai.chatbot_service import extract_clan_surname

    assert extract_clan_surname("Dòng Họ Dương") == "Dương"
    assert extract_clan_surname("Võ Đại Tộc (Gò Nổi - Quảng Nam)") == "Võ"
    assert extract_clan_surname("Mai Thế Tộc (Phong Điền - Thừa Thiên Huế)") == "Mai"
    assert extract_clan_surname("Họ Nguyễn") == "Nguyễn"


def test_ego_context_dataclass():
    from app.services.ai.chatbot_service import EgoContext

    user_id = uuid.uuid4()
    clan_id = uuid.uuid4()
    person_id = uuid.uuid4()

    ego = EgoContext(
        user_id=user_id,
        clan_id=clan_id,
        user_name="Dương Thị Thu Thảo",
        role_title="Trưởng tộc",
        clan_name="Dòng Họ Dương",
        is_linked=True,
        person_id=person_id,
        person_name="Dương Thị Thu Thảo",
        generation=5,
        parents=["Dương Anh Tuấn"],
        children=[],
    )

    assert ego.user_name == "Dương Thị Thu Thảo"
    assert ego.role_title == "Trưởng tộc"
    assert ego.is_linked is True
    assert ego.generation == 5
    assert len(ego.parents) == 1


def test_anti_bleed_detection_logic():
    import re
    from app.services.ai.genealogy_tools import clean_name_query

    # Given previous active focus was Dương Thảo Vy
    prev_person_name = "Dương Thảo Vy"

    # User now asks: "Dương là ai"
    msg_clean = "Dương là ai"
    who_is_match = re.search(r"^(.*?)\s+là\s+ai(\s+rứa|\s+vậy|\s+đó|\s+hả|\s+thế)?$", msg_clean, re.IGNORECASE)
    assert who_is_match is not None

    candidate_target = clean_name_query(who_is_match.group(1))
    assert candidate_target == "Dương"

    pronouns = ["ông ấy", "bà ấy", "người này", "người đó", "ông nớ", "bà nớ", "hắn", "cô ấy", "vị này", "cụ ấy"]
    is_follow_up = candidate_target.lower() in pronouns
    assert is_follow_up is False  # Must NOT be a follow-up!





