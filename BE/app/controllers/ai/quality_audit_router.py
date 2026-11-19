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
