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

