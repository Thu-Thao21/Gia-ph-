from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.dependencies.auth import Principal, get_principal
from app.models.ai.entities import AIConsent, ClanAISetting
from app.models.family.entities import Clan, ClanMembership, PersonAccountLink, FamilyAdminAssignment
from app.models.genealogy.entities import Person
from app.models.user_access.entities import AuditLog, Role, UserRole
from app.schemas.ai import (
    AIBiographySummarizeRequest,
    AIBiographySummarizeResponse,
    AIChatRequest,
    AIChatResponse,
    AIDataQualityReportRequest,
    AIDataQualityReportResponse,
    AIKinshipExplainRequest,
    AIKinshipExplainResponse,
    AITestConnectionRequest,
    AITestConnectionResponse,
    ClanAISettingResponse,
    ClanAISettingUpdate,
    MemberAIConsentsResponse,
    MemberAIConsentsUpdate,
    AIExcelImportAnalyzeResponse,
)
from app.services.ai.biography_summarizer import biography_summarizer_service
from app.services.ai.chatbot_service import chatbot_service
from app.services.ai.data_quality_service import data_quality_service
from app.services.ai.excel_audit_service import excel_audit_service
from app.services.ai.gemini_service import gemini_service
from app.services.ai.kinship_explainer import kinship_explainer_service
from app.controllers.ai.common import (
    _utc_now,
    DEFAULT_FEATURES,
    DEFAULT_DATA_SCOPES,
    PURPOSE_KEYS,
    _require_clan_leader,
    _require_clan_membership,
    _require_quality_audit_access,
)

logger = logging.getLogger("mfg.ai.router")

router = APIRouter()


@router.post(
    "/clans/{clan_id}/ai/chat",
    response_model=AIChatResponse,
    summary="Trợ lý AI Gia Phả - Hỏi đáp thông minh kết hợp Gemini & CSDL Gia Phả",
)
async def ai_chat(
    clan_id: uuid.UUID,
    body: AIChatRequest,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Điểm kết nối Chatbot AI Hybrid:
    - Kiểm tra Firebase Auth & bắt buộc thành viên hợp lệ trong clan_id (Tenant Isolation).
    - Kiểm tra cấu hình AI của dòng họ (Trưởng tộc đã bật AI hay chưa).
    - Phân loại câu hỏi tự nhiên (Gia phả, Kiến thức chung, Hỏi tiếp nối, Người trùng tên).
    - Truy vấn an toàn CSDL gia phả và lọc dữ liệu qua AIContextFilterService.
    - Duy trì phiên hội thoại an toàn theo user_id và clan_id.
    """
    # 1. Bắt buộc kiểm tra quyền thành viên trong Clan
    await _require_clan_membership(db, principal, clan_id)

    # 2. Xử lý câu hỏi qua ChatbotService
    try:
        res = await chatbot_service.chat(
            db=db,
            clan_id=clan_id,
            user_id=principal.user_id,
            message=body.message,
            conversation_id=body.conversation_id,
            person_id=body.person_id,
        )
    except PermissionError as pe:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(pe),
        )

    # 3. Ghi nhận Audit Log (chỉ ghi metadata, không lưu nội dung tin nhắn riêng tư)
    now = _utc_now()
    db.add(
        AuditLog(
            clan_id=clan_id,
            actor_id=principal.user_id,
            action="ai_service.chat",
            entity_type="chatbot",
            new_data={
                "conversation_id": res.get("conversation_id"),
                "status": res.get("status"),
                "sources_count": len(res.get("sources", [])),
                "candidates_count": len(res.get("person_candidates", [])),
            },
            reason="Hội thoại với Trợ lý AI gia phả",
            occurred_at=now,
        )
    )
    await db.commit()

    return AIChatResponse(
        answer=res.get("answer", ""),
        conversation_id=res.get("conversation_id", ""),
        sources=res.get("sources", []),
        status=res.get("status", "success"),
        suggested_questions=res.get("suggested_questions", []),
        person_candidates=res.get("person_candidates", []),
    )


# ---------------------------------------------------------------------------
# 5. GIAI ĐOẠN 4: AI GIẢI THÍCH QUAN HỆ HỌ HÀNG & TÓM TẮT TIỂU SỬ
# ---------------------------------------------------------------------------

@router.post(
    "/clans/{clan_id}/ai/kinship/explain",
    response_model=AIKinshipExplainResponse,
    summary="AI giải thích quan hệ họ hàng, vai vế và cách xưng hô",
)
async def explain_kinship(
    clan_id: uuid.UUID,
    body: AIKinshipExplainRequest,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Điểm kết nối AI giải thích quan hệ:
    - Bắt buộc thành viên hợp lệ trong clan_id (Tenant Isolation).
    - Tính toán đường đi quan hệ bằng thuật toán phả hệ thực tế từ CSDL gia tộc.
    - Kiểm tra cấu hình AI của dòng họ và quyền riêng tư cá nhân.
    - Gọi Gemini giải thích chi tiết vai vế và xưng hô truyền thống Việt Nam.
    """
    await _require_clan_membership(db, principal, clan_id)

    try:
        res = await kinship_explainer_service.explain_kinship(
            db=db,
            clan_id=clan_id,
            user_id=principal.user_id,
            person_a_id=body.person_a_id,
            person_b_id=body.person_b_id,
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve),
        )

    # Ghi nhận Audit Log
    now = _utc_now()
    db.add(
        AuditLog(
            clan_id=clan_id,
            actor_id=principal.user_id,
            action="ai_service.kinship_explain",
            entity_type="kinship",
            new_data={
                "person_a_id": str(body.person_a_id),
                "person_b_id": str(body.person_b_id),
                "found": res.get("found"),
                "relationship_type": res.get("relationship_type"),
                "kinship_term": res.get("kinship_term"),
                "status": res.get("explanation_status"),
            },
            reason="Yêu cầu AI giải thích quan hệ họ hàng",
            occurred_at=now,
        )
    )
    await db.commit()

    return AIKinshipExplainResponse(**res)


@router.post(
    "/clans/{clan_id}/ai/biography/summarize",
    response_model=AIBiographySummarizeResponse,
    summary="AI tạo bản tóm tắt tiểu sử tiền nhân & thành viên",
)
async def summarize_biography(
    clan_id: uuid.UUID,
    body: AIBiographySummarizeRequest,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Điểm kết nối AI tóm tắt tiểu sử:
    - Bắt buộc thành viên hợp lệ trong clan_id.
    - Tập hợp dữ kiện xác thực từ gia phả: thế hệ, chi nhánh, gia đình, ngày sinh/mất.
    - Kiểm tra cấu hình AI dòng họ và bảo mật thông tin cá nhân.
    - Gemini tóm tắt theo phong cách (short / standard / formal) với nguyên tắc chống bịa đặt.
    """
    await _require_clan_membership(db, principal, clan_id)

    valid_styles = {"short", "standard", "formal"}
    selected_style = body.style if body.style in valid_styles else "standard"

    try:
        res = await biography_summarizer_service.summarize_biography(
            db=db,
            clan_id=clan_id,
            user_id=principal.user_id,
            person_id=body.person_id,
            style=selected_style,
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve),
        )

    # Ghi nhận Audit Log
    now = _utc_now()
    db.add(
        AuditLog(
            clan_id=clan_id,
            actor_id=principal.user_id,
            action="ai_service.biography_summarize",
            entity_type="biography",
            new_data={
                "person_id": str(body.person_id),
                "style": selected_style,
                "status": res.get("status"),
                "verified_facts_count": len(res.get("verified_facts", [])),
            },
            reason="Yêu cầu AI tóm tắt tiểu sử thành viên",
            occurred_at=now,
        )
    )
    await db.commit()

    return AIBiographySummarizeResponse(**res)


# ---------------------------------------------------------------------------
# 6. GIAI ĐOẠN 5: KIỂM ĐỊNH CHẤT LƯỢNG DỮ LIỆU, PHÁT HIỆN TRÙNG & BẤT THƯỜNG
# ---------------------------------------------------------------------------

