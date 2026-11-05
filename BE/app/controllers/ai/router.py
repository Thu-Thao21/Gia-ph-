from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

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

logger = logging.getLogger("mfg.ai.router")

router = APIRouter(prefix="", tags=["ai-management"])


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


DEFAULT_FEATURES = {
    "assistant": True,
    "relationship_analysis": True,
    "suggestions": True,
    "biography": True,
}

DEFAULT_DATA_SCOPES = {
    "public_events": True,
    "general_history": True,
    "personal_data": False,
    "images": False,
}

PURPOSE_KEYS = [
    "personalData",
    "images",
    "genealogyData",
    "relationshipAnalysis",
    "dataSuggestions",
    "biographyDrafts",
]


async def _require_clan_leader(
    db: AsyncSession, principal: Principal, clan_id: uuid.UUID
) -> Clan:
    """Xác thực người dùng là Trưởng tộc (BUSINESS_OWNER hoặc người khởi tạo dòng họ)."""
    # 1. Kiểm tra dòng họ tồn tại
    clan_stmt = select(Clan).where(Clan.clan_id == clan_id)
    clan = (await db.execute(clan_stmt)).scalar_one_or_none()
    if not clan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dòng họ không tồn tại.",
        )

    # 2. Kiểm tra quyền khởi tạo dòng họ
    if clan.created_by == principal.user_id:
        return clan

    # 3. Kiểm tra vai trò BUSINESS_OWNER trong clan
    bo_role_stmt = select(Role.role_id).where(Role.code == "BUSINESS_OWNER")
    bo_role_id = (await db.execute(bo_role_stmt)).scalar_one_or_none()
    if bo_role_id:
        user_bo_stmt = select(UserRole).where(
            UserRole.user_id == principal.user_id,
            UserRole.role_id == bo_role_id,
            UserRole.clan_id == clan_id,
            UserRole.revoked_at.is_(None),
        )
        if (await db.execute(user_bo_stmt)).scalar_one_or_none():
            return clan

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Chỉ Trưởng tộc / Chủ sở hữu dòng họ mới có quyền cấu hình tính năng AI cho dòng họ.",
    )


async def _require_clan_membership(
    db: AsyncSession, principal: Principal, clan_id: uuid.UUID
) -> ClanMembership:
    """Xác thực người dùng có tư cách thành viên hoạt động trong dòng họ (Tenant isolation)."""
    mem_stmt = select(ClanMembership).where(
        ClanMembership.clan_id == clan_id,
        ClanMembership.user_id == principal.user_id,
        ClanMembership.status == "ACTIVE",
    )
    mem = (await db.execute(mem_stmt)).scalar_one_or_none()
    if not mem:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chưa gia nhập dòng họ này hoặc tư cách thành viên đã bị thu hồi.",
        )
    return mem


# ---------------------------------------------------------------------------
# 1. CLAN ADMIN: CẤU HÌNH AI DÒNG TỘC
# ---------------------------------------------------------------------------

@router.get(
    "/clans/{clan_id}/ai/settings",
    response_model=ClanAISettingResponse,
    summary="Lấy cấu hình AI dòng tộc (Dành cho Trưởng tộc)",
)
async def get_clan_ai_settings(
    clan_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    await _require_clan_leader(db, principal, clan_id)

    stmt = select(ClanAISetting).where(ClanAISetting.clan_id == clan_id)
    setting = (await db.execute(stmt)).scalar_one_or_none()

    if not setting:
        return ClanAISettingResponse(
            clan_id=clan_id,
            ai_enabled=False,
            features=DEFAULT_FEATURES,
            allowed_data_scopes=DEFAULT_DATA_SCOPES,
            gemini_model=gemini_service.model_name,
            configured=gemini_service.is_configured(),
            updated_at=None,
        )

    return ClanAISettingResponse(
        clan_id=clan_id,
        ai_enabled=setting.ai_enabled,
        features=setting.features or DEFAULT_FEATURES,
        allowed_data_scopes=setting.allowed_data_scopes or DEFAULT_DATA_SCOPES,
        gemini_model=setting.gemini_model or gemini_service.model_name,
        configured=gemini_service.is_configured(),
        updated_at=setting.updated_at,
    )


@router.put(
    "/clans/{clan_id}/ai/settings",
    response_model=ClanAISettingResponse,
    summary="Cập nhật cấu hình AI dòng tộc (Dành cho Trưởng tộc)",
)
async def update_clan_ai_settings(
    clan_id: uuid.UUID,
    body: ClanAISettingUpdate,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    clan = await _require_clan_leader(db, principal, clan_id)
    now = _utc_now()

    stmt = select(ClanAISetting).where(ClanAISetting.clan_id == clan_id)
    setting = (await db.execute(stmt)).scalar_one_or_none()

    features_to_save = (
        body.features if body.features is not None else DEFAULT_FEATURES
    )
    scopes_to_save = (
        body.allowed_data_scopes if body.allowed_data_scopes is not None else DEFAULT_DATA_SCOPES
    )

    if not setting:
        setting = ClanAISetting(
            clan_id=clan_id,
            ai_enabled=body.ai_enabled,
            features=features_to_save,
            allowed_data_scopes=scopes_to_save,
            gemini_model=body.gemini_model or gemini_service.model_name,
            updated_by=principal.user_id,
            updated_at=now,
        )
        db.add(setting)
    else:
        setting.ai_enabled = body.ai_enabled
        setting.features = features_to_save
        setting.allowed_data_scopes = scopes_to_save
        if body.gemini_model:
            setting.gemini_model = body.gemini_model
        setting.updated_by = principal.user_id
        setting.updated_at = now

    # Ghi nhận AuditLog
    db.add(
        AuditLog(
            clan_id=clan_id,
            actor_id=principal.user_id,
            action="ai_settings.update",
            entity_type="clan_ai_settings",
            entity_id=clan_id,
            new_data={
                "ai_enabled": body.ai_enabled,
                "features": features_to_save,
                "allowed_data_scopes": scopes_to_save,
            },
            reason="Trưởng tộc cập nhật cấu hình AI dòng họ",
            occurred_at=now,
        )
    )

    await db.commit()
    await db.refresh(setting)

    return ClanAISettingResponse(
        clan_id=clan_id,
        ai_enabled=setting.ai_enabled,
        features=setting.features,
        allowed_data_scopes=setting.allowed_data_scopes,
        gemini_model=setting.gemini_model or gemini_service.model_name,
        configured=gemini_service.is_configured(),
        updated_at=setting.updated_at,
    )


# ---------------------------------------------------------------------------
# 2. MEMBER: QUẢN LÝ QUYỀN RIÊNG TƯ & ĐỒNG Ý AI CÁ NHÂN
# ---------------------------------------------------------------------------

@router.get(
    "/clans/{clan_id}/ai/consents/me",
    response_model=MemberAIConsentsResponse,
    summary="Lấy quyền đồng ý AI của thành viên hiện tại trong dòng họ",
)
async def get_my_ai_consents(
    clan_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    await _require_clan_membership(db, principal, clan_id)

    # 1. Trạng thái AI dòng họ
    clan_setting = (
        await db.execute(
            select(ClanAISetting.ai_enabled).where(ClanAISetting.clan_id == clan_id)
        )
    ).scalar_one_or_none()
    clan_ai_enabled = bool(clan_setting)

    # 2. Tìm Person gắn với tài khoản trong clan
    link_stmt = select(PersonAccountLink.person_id).where(
        PersonAccountLink.clan_id == clan_id,
        PersonAccountLink.user_id == principal.user_id,
        PersonAccountLink.status == "ACTIVE",
        PersonAccountLink.revoked_at.is_(None),
    )
    linked_person_id = (await db.execute(link_stmt)).scalar_one_or_none()

    person_name = None
    if linked_person_id:
        p_name = (
            await db.execute(
                select(Person.full_name).where(Person.id == linked_person_id)
            )
        ).scalar_one_or_none()
        person_name = p_name

    # 3. Lấy các bản ghi ai_consents
    stmt = select(AIConsent).where(
        AIConsent.user_id == principal.user_id,
        AIConsent.clan_id == clan_id,
    )
    rows = (await db.execute(stmt)).scalars().all()

    choices = {k: False for k in PURPOSE_KEYS}
    latest_update = None
    for r in rows:
        if r.purpose in choices:
            choices[r.purpose] = bool(r.granted and r.revoked_at is None)
        if not latest_update or r.changed_at > latest_update:
            latest_update = r.changed_at

    master_consent = any(choices.values())

    return MemberAIConsentsResponse(
        clan_id=clan_id,
        person_id=linked_person_id,
        person_name=person_name,
        clan_ai_enabled=clan_ai_enabled,
        master_consent=master_consent,
        choices=choices,
        updated_at=latest_update,
    )


@router.put(
    "/clans/{clan_id}/ai/consents/me",
    response_model=MemberAIConsentsResponse,
    summary="Cập nhật quyền đồng ý sử dụng AI của thành viên",
)
async def update_my_ai_consents(
    clan_id: uuid.UUID,
    body: MemberAIConsentsUpdate,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    await _require_clan_membership(db, principal, clan_id)
    now = _utc_now()

    # Tìm Person gắn với tài khoản trong clan nếu có
    link_stmt = select(PersonAccountLink.person_id).where(
        PersonAccountLink.clan_id == clan_id,
        PersonAccountLink.user_id == principal.user_id,
        PersonAccountLink.status == "ACTIVE",
        PersonAccountLink.revoked_at.is_(None),
    )
    linked_person_id = (await db.execute(link_stmt)).scalar_one_or_none()

    person_name = None
    if linked_person_id:
        p_name = (
            await db.execute(
                select(Person.full_name).where(Person.id == linked_person_id)
            )
        ).scalar_one_or_none()
        person_name = p_name

    # Upsert cho từng purpose
    effective_choices = body.choices if body.master_consent else {k: False for k in PURPOSE_KEYS}

    for purpose, is_granted in effective_choices.items():
        stmt = select(AIConsent).where(
            AIConsent.user_id == principal.user_id,
            AIConsent.purpose == purpose,
            AIConsent.clan_id == clan_id,
        )
        consent = (await db.execute(stmt)).scalar_one_or_none()
        if not consent:
            consent = AIConsent(
                consent_id=uuid.uuid4(),
                person_id=linked_person_id,
                user_id=principal.user_id,
                clan_id=clan_id,
                purpose=purpose,
                granted=is_granted,
                changed_at=now,
                revoked_at=None if is_granted else now,
            )
            db.add(consent)
        else:
            consent.person_id = linked_person_id
            consent.granted = is_granted
            consent.changed_at = now
            consent.revoked_at = None if is_granted else now

    # Audit log
    db.add(
        AuditLog(
            clan_id=clan_id,
            actor_id=principal.user_id,
            action="ai_consent.update",
            entity_type="ai_consent",
            new_data={
                "master_consent": body.master_consent,
                "choices": effective_choices,
                "person_id": str(linked_person_id) if linked_person_id else None,
            },
            reason="Thành viên cập nhật quyền riêng tư & đồng ý AI",
            occurred_at=now,
        )
    )

    await db.commit()

    # Lấy clan_ai_enabled
    clan_setting = (
        await db.execute(
            select(ClanAISetting.ai_enabled).where(ClanAISetting.clan_id == clan_id)
        )
    ).scalar_one_or_none()

    return MemberAIConsentsResponse(
        clan_id=clan_id,
        person_id=linked_person_id,
        person_name=person_name,
        clan_ai_enabled=bool(clan_setting),
        master_consent=body.master_consent,
        choices=effective_choices,
        updated_at=now,
    )


@router.post(
    "/clans/{clan_id}/ai/consents/me/revoke-all",
    summary="Thu hồi toàn bộ sự đồng ý sử dụng AI của thành viên",
)
async def revoke_all_my_ai_consents(
    clan_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    await _require_clan_membership(db, principal, clan_id)
    now = _utc_now()

    stmt = select(AIConsent).where(
        AIConsent.user_id == principal.user_id,
        AIConsent.clan_id == clan_id,
    )
    rows = (await db.execute(stmt)).scalars().all()
    for r in rows:
        r.granted = False
        r.revoked_at = now
        r.changed_at = now

    db.add(
        AuditLog(
            clan_id=clan_id,
            actor_id=principal.user_id,
            action="ai_consent.revoke_all",
            entity_type="ai_consent",
            new_data={"status": "REVOKED_ALL"},
            reason="Thành viên thu hồi toàn bộ sự đồng ý sử dụng AI",
            occurred_at=now,
        )
    )

    await db.commit()
    return {
        "success": True,
        "message": "Đã thu hồi toàn bộ quyền sử dụng dữ liệu với AI thành công.",
    }


# ---------------------------------------------------------------------------
# 3. TEST KẾT NỐI GEMINI AI AN TOÀN (GIAI ĐOẠN 2)
# ---------------------------------------------------------------------------

@router.post(
    "/clans/{clan_id}/ai/test-connection",
    response_model=AITestConnectionResponse,
    summary="Kiểm tra kết nối Gemini AI bằng dữ liệu giả lập (Không gửi Person thật)",
)
async def test_gemini_connection(
    clan_id: uuid.UUID,
    body: AITestConnectionRequest,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Kiểm tra Gemini API an toàn theo đúng yêu cầu Giai đoạn 2:
    - Kiểm tra tư cách thành viên / Trưởng tộc.
    - Kiểm tra Trưởng tộc đã bật AI cho dòng họ hay chưa.
    - Tuyệt đối không gửi dữ liệu Person thật từ database.
    - Dùng câu hỏi chung hoặc kịch bản mô phỏng để kiểm tra độ trễ và tính sẵn sàng của Gemini.
    """
    # 1. Kiểm tra thành viên trong clan
    await _require_clan_membership(db, principal, clan_id)

    # 2. Kiểm tra Trưởng tộc đã bật AI cho dòng họ hay chưa
    setting_stmt = select(ClanAISetting).where(ClanAISetting.clan_id == clan_id)
    setting = (await db.execute(setting_stmt)).scalar_one_or_none()

    if not setting or not setting.ai_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Trưởng tộc chưa kích hoạt tính năng AI cho dòng họ này. Vui lòng bật AI trong mục Cấu hình AI dòng họ trước khi kiểm tra kết nối.",
        )

    # 3. Chuẩn bị câu hỏi kiểm tra giả lập (Không chứa Person thật)
    user_prompt = body.prompt.strip() if body.prompt and body.prompt.strip() else (
        "Chào Gemini! Hãy giải thích ngắn gọn trong 2 câu vì sao cây gia phả có ý nghĩa quan trọng với văn hóa Việt Nam."
    )

    # 4. Gọi Gemini an toàn thông qua service dùng chung
    res = await gemini_service.generate_content_safe(
        prompt=user_prompt,
        model=setting.gemini_model,
    )

    # 5. Ghi nhận nhật ký kiểm toán
    now = _utc_now()
    db.add(
        AuditLog(
            clan_id=clan_id,
            actor_id=principal.user_id,
            action="ai_service.test_connection",
            entity_type="gemini_service",
            new_data={
                "success": res.get("success"),
                "model": res.get("model"),
                "latency_ms": res.get("latency_ms"),
            },
            reason="Kiểm tra kết nối Gemini AI nền tảng",
            occurred_at=now,
        )
    )
    await db.commit()

    if not res.get("success"):
        return AITestConnectionResponse(
            success=False,
            model=setting.gemini_model or gemini_service.model_name,
            response=None,
            latency_ms=res.get("latency_ms", 0),
            message=res.get("message", "Không thể kết nối đến Gemini AI."),
        )

    return AITestConnectionResponse(
        success=True,
        model=res.get("model", gemini_service.model_name),
        response=res.get("response"),
        latency_ms=res.get("latency_ms", 0),
        message="Kết nối Gemini API thành công!",
    )


# ---------------------------------------------------------------------------
# 4. CHATBOT AI GIA PHẢ THÔNG MINH (GIAI ĐOẠN 3)
# ---------------------------------------------------------------------------

@router.post(
    "/clans/{clan_id}/ai/chat",
    response_model=AIChatResponse,
    summary="Trợ lý AI Gia Phả - Hỏi đáp thông minh kết hợp Gemini & Neon DB",
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
    - Truy vấn an toàn Neon DB và lọc dữ liệu qua AIContextFilterService.
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
    - Tính toán đường đi quan hệ bằng thuật toán phả hệ thực tế từ Neon DB.
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
    - Tập hợp dữ kiện xác thực từ Neon DB: thế hệ, chi nhánh, gia đình, ngày sinh/mất.
    - Kiểm tra cấu hình AI dòng họ và quyền đồng ý AI (AIConsent).
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

async def _require_quality_audit_access(
    db: AsyncSession,
    principal: Principal,
    clan_id: uuid.UUID,
    requested_branch_id: Optional[uuid.UUID] = None,
) -> Tuple[str, Optional[Set[uuid.UUID]]]:
    """
    Xác thực quyền kiểm định chất lượng dữ liệu:
    - System Admin & Clan Leader (BUSINESS_OWNER / FAMILY_HEAD / Người tạo):
        Toàn quyền clan. Nếu truyền requested_branch_id thì giới hạn theo branch đó.
    - Family Admin:
        Phải có FamilyAdminAssignment còn hiệu lực (revoked_at IS NULL).
        Nếu có assignment clan-wide (branch_id IS NULL) -> Toàn quyền clan.
        Nếu chỉ có assignment theo branch cụ thể:
            Bắt buộc chỉ được kiểm định trong phạm vi chi nhánh được phân công.
            Nếu requested_branch_id nằm ngoài phạm vi được phân quyền -> 403 Forbidden!
    - Thành viên thông thường (không có quyền quản trị):
        403 Forbidden!
    """
    # 1. Kiểm tra System Admin
    if getattr(principal, "primary_role", "").lower() in ("admin", "system_admin"):
        if requested_branch_id:
            return "system_admin", {requested_branch_id}
        return "system_admin", None

    # 2. Kiểm tra Clan tồn tại
    clan_stmt = select(Clan).where(Clan.clan_id == clan_id)
    clan = (await db.execute(clan_stmt)).scalar_one_or_none()
    if not clan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dòng họ không tồn tại.")

    # 3. Kiểm tra Clan Leader (Người tạo dòng họ hoặc vai trò BUSINESS_OWNER / FAMILY_HEAD)
    is_clan_leader = False
    if clan.created_by == principal.user_id:
        is_clan_leader = True
    else:
        roles_stmt = select(Role.role_id).where(Role.code.in_(["BUSINESS_OWNER", "FAMILY_HEAD"]))
        leader_role_ids = (await db.execute(roles_stmt)).scalars().all()
        if leader_role_ids:
            ur_stmt = select(UserRole).where(
                UserRole.user_id == principal.user_id,
                UserRole.role_id.in_(leader_role_ids),
                UserRole.clan_id == clan_id,
                UserRole.revoked_at.is_(None),
            )
            if (await db.execute(ur_stmt)).scalar_one_or_none():
                is_clan_leader = True

    if is_clan_leader:
        if requested_branch_id:
            return "clan_admin", {requested_branch_id}
        return "clan_admin", None

    # 4. Kiểm tra phân quyền Family Admin trong clan này
    fa_stmt = select(FamilyAdminAssignment).where(
        FamilyAdminAssignment.user_id == principal.user_id,
        FamilyAdminAssignment.clan_id == clan_id,
        FamilyAdminAssignment.revoked_at.is_(None),
    )
    assignments = (await db.execute(fa_stmt)).scalars().all()
    if not assignments:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chức năng Kiểm định chất lượng dữ liệu chỉ dành cho Trưởng tộc hoặc Quản trị viên dòng họ (Family Admin) được cấp quyền.",
        )

    has_clan_wide = any(a.branch_id is None for a in assignments)
    if has_clan_wide:
        if requested_branch_id:
            return "family_admin", {requested_branch_id}
        return "family_admin", None

    allowed_branch_ids = {a.branch_id for a in assignments if a.branch_id is not None}
    if not allowed_branch_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản Quản trị viên chưa được phân công chi nhánh cụ thể nào để kiểm định dữ liệu.",
        )

    if requested_branch_id:
        if requested_branch_id not in allowed_branch_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền kiểm định chi nhánh này. Chỉ được phép thao tác trong chi nhánh được phân công.",
            )
        return "family_admin", {requested_branch_id}

    return "family_admin", allowed_branch_ids


@router.post(
    "/clans/{clan_id}/ai/quality/report",
    response_model=AIDataQualityReportResponse,
    summary="Kiểm định chất lượng dữ liệu gia phả & Bất thường (Giai đoạn 5)",
)
async def generate_quality_report(
    clan_id: uuid.UUID,
    body: Optional[AIDataQualityReportRequest] = None,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Điểm kết nối kiểm định chất lượng gia phả:
    - Bắt buộc quyền Clan Admin hoặc Family Admin có phân công hợp lệ.
    - Family Admin bị giới hạn chặt chẽ trong phạm vi chi nhánh được phân quyền.
    - Chạy thuật toán phát hiện Person nghi trùng lặp theo thang điểm tiêu chí (0-100).
    - Gợi ý kiểm tra liên kết phối ngẫu (không tự suy đoán hôn nhân).
    - Kiểm tra vòng lặp phả hệ, mâu thuẫn năm sinh, thế hệ không hợp lệ.
    - Áp dụng AIConsent và ClanAISetting trước khi chuyển dữ liệu cho Gemini AI.
    - Read-only: Hoàn toàn không tự sửa dữ liệu trong Neon DB.
    """
    req_branch_id = None
    if body and body.branch_id:
        try:
            req_branch_id = uuid.UUID(body.branch_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id không hợp lệ.")

    role_label, allowed_branch_ids = await _require_quality_audit_access(
        db=db,
        principal=principal,
        clan_id=clan_id,
        requested_branch_id=req_branch_id,
    )

    include_ai = body.include_ai_synthesis if body else True

    try:
        report = await data_quality_service.generate_quality_report(
            db=db,
            clan_id=clan_id,
            allowed_branch_ids=allowed_branch_ids,
            include_ai_synthesis=include_ai,
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
            action="ai_service.quality_report",
            entity_type="data_quality",
            new_data={
                "role_label": role_label,
                "audit_scope": report.get("audit_scope"),
                "scoped_branches": report.get("scoped_branch_names"),
                "health_score": report.get("health_score"),
                "duplicates_count": report.get("duplicates_count"),
                "missing_relationships_count": report.get("missing_relationships_count"),
                "anomalies_count": report.get("anomalies_count"),
                "include_ai_synthesis": include_ai,
            },
            reason="Yêu cầu kiểm định chất lượng dữ liệu gia phả dòng họ",
            occurred_at=now,
        )
    )
    await db.commit()

    return AIDataQualityReportResponse(**report)


@router.get(
    "/clans/{clan_id}/ai/quality/duplicates",
    summary="Danh sách các cặp Person nghi trùng lặp",
)
async def get_duplicate_candidates(
    clan_id: uuid.UUID,
    branch_id: Optional[uuid.UUID] = None,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Truy vấn nhanh danh sách các cặp Person nghi trùng lặp trong phạm vi được phân quyền."""
    _, allowed_branch_ids = await _require_quality_audit_access(
        db=db,
        principal=principal,
        clan_id=clan_id,
        requested_branch_id=branch_id,
    )

    report = await data_quality_service.generate_quality_report(
        db=db,
        clan_id=clan_id,
        allowed_branch_ids=allowed_branch_ids,
        include_ai_synthesis=False,
    )
    return {
        "clan_id": str(clan_id),
        "audit_scope": report["audit_scope"],
        "scoped_branches": report["scoped_branch_names"],
        "total_candidates": report["duplicates_count"],
        "duplicates": report["duplicate_candidates"],
    }


@router.get(
    "/clans/{clan_id}/ai/quality/anomalies",
    summary="Danh sách các cảnh báo bất thường phả hệ",
)
async def get_data_anomalies(
    clan_id: uuid.UUID,
    branch_id: Optional[uuid.UUID] = None,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Truy vấn nhanh danh sách bất thường phả hệ (vòng lặp, mâu thuẫn năm sinh, thế hệ)."""
    _, allowed_branch_ids = await _require_quality_audit_access(
        db=db,
        principal=principal,
        clan_id=clan_id,
        requested_branch_id=branch_id,
    )

    report = await data_quality_service.generate_quality_report(
        db=db,
        clan_id=clan_id,
        allowed_branch_ids=allowed_branch_ids,
        include_ai_synthesis=False,
    )
    return {
        "clan_id": str(clan_id),
        "audit_scope": report["audit_scope"],
        "scoped_branches": report["scoped_branch_names"],
        "total_anomalies": report["anomalies_count"],
        "anomalies": report["anomalies"],
    }


@router.get(
    "/clans/{clan_id}/ai/quality/missing-relations",
    summary="Danh sách gợi ý quan hệ có thể còn thiếu",
)
async def get_missing_relationships(
    clan_id: uuid.UUID,
    branch_id: Optional[uuid.UUID] = None,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Truy vấn nhanh các gợi ý quan hệ còn thiếu dựa trên suy diễn logic phả hệ."""
    _, allowed_branch_ids = await _require_quality_audit_access(
        db=db,
        principal=principal,
        clan_id=clan_id,
        requested_branch_id=branch_id,
    )

    report = await data_quality_service.generate_quality_report(
        db=db,
        clan_id=clan_id,
        allowed_branch_ids=allowed_branch_ids,
        include_ai_synthesis=False,
    )
    return {
        "clan_id": str(clan_id),
        "audit_scope": report["audit_scope"],
        "scoped_branches": report["scoped_branch_names"],
        "total_suggestions": report["missing_relationships_count"],
        "suggestions": report["missing_relationships"],
    }


# ---------------------------------------------------------------------------
# 7. GIAI ĐOẠN 6: AI KIỂM TRA & ĐỐI SOÁT EXCEL IMPORT
# ---------------------------------------------------------------------------

@router.post(
    "/clans/{clan_id}/ai/import/analyze",
    response_model=AIExcelImportAnalyzeResponse,
    summary="AI Kiểm tra và đối soát dữ liệu Excel trước khi Import (Giai đoạn 6)",
)
async def analyze_excel_import(
    clan_id: uuid.UUID,
    file: UploadFile = File(...),
    branch_id: Optional[str] = Form(None),
    include_ai: bool = Form(True),
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """
    Điểm kết nối AI phân tích, đối soát và thẩm định file Excel trước khi Import vào Neon DB:
    - Bắt buộc quyền Clan Admin hoặc Family Admin có phân công hợp lệ (Tenant isolation).
    - Family Admin chỉ được kiểm định trong phạm vi chi nhánh được phân quyền.
    - Quét lỗi cú pháp, cấu trúc và chu trình phả hệ bằng Python.
    - Đối soát hồ sơ nghi trùng trong file Excel và với Neon DB theo tiêu chí heuristic (X/100).
    - Phân tích bất thường thế hệ, mâu thuẫn thời gian và gợi ý kiểm tra liên kết phối ngẫu.
    - Áp dụng AIConsent & ClanAISetting trước khi chuyển dữ liệu cho Gemini AI.
    - Hoàn toàn Read-only: Không tự tạo Person hay sửa dữ liệu DB trong lúc phân tích.
    """
    req_branch_id = None
    if branch_id:
        try:
            req_branch_id = uuid.UUID(branch_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id không hợp lệ.")

    role_label, allowed_branch_ids = await _require_quality_audit_access(
        db=db,
        principal=principal,
        clan_id=clan_id,
        requested_branch_id=req_branch_id,
    )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp tin Excel tải lên bị rỗng.")
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp tin vượt quá dung lượng tối đa 10MB.")

    try:
        report = await excel_audit_service.analyze_excel_import(
            db=db,
            clan_id=clan_id,
            file_bytes=file_bytes,
            allowed_branch_ids=allowed_branch_ids,
            include_ai_advisory=include_ai,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))

    # Ghi nhận Audit Log
    now = _utc_now()
    db.add(
        AuditLog(
            clan_id=clan_id,
            actor_id=principal.user_id,
            action="ai_excel_import_analysis",
            entity_type="excel_import",
            new_data={
                "role_label": role_label,
                "filename": file.filename,
                "audit_scope": report.get("audit_scope"),
                "is_valid": report.get("is_valid"),
                "health_score": report.get("summary", {}).get("health_score"),
                "fatal_count": report.get("summary", {}).get("fatal_count"),
                "warning_count": report.get("summary", {}).get("warning_count"),
                "duplicates_count": report.get("summary", {}).get("duplicates_count"),
                "include_ai": include_ai,
            },
            reason="Yêu cầu AI kiểm tra và đối soát file Excel trước khi Import vào Neon DB",
            occurred_at=now,
        )
    )
    await db.commit()

    return AIExcelImportAnalyzeResponse(**report)
