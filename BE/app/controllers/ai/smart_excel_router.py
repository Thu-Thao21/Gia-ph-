"""AI Smart Excel Import Controller (MFGMS-AI).

Endpoints for templateless, intelligent Excel genealogy ingestion:
- POST /clans/{clan_id}/ai/excel/detect-schema: Auto-detects columns, sheet and headers with Gemini AI + Heuristic.
- POST /clans/{clan_id}/ai/excel/parse-and-preview: Parses records, reconstructs graph (parent-child, spouse) and checks integrity.
- POST /clans/{clan_id}/ai/excel/commit-import: Commits validated graph atomically to Neon DB and recomputes closure.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Dict, Optional, Set

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.ai.common import _require_quality_audit_access, _utc_now
from app.db.postgres import get_db
from app.dependencies.auth import Principal, get_principal
from app.models.user_access.entities import AuditLog
from app.schemas.ai import (
    AISmartExcelCommitResponse,
    AISmartExcelDetectResponse,
    AISmartExcelPreviewResponse,
)
from app.services.ai.smart_excel_service import smart_excel_service

logger = logging.getLogger("mfg.ai.smart_excel_controller")

router = APIRouter()


class SmartCommitRequestBody(BaseModel):
    parsed_data: Dict[str, Any]
    wipe_existing: bool = True


@router.post(
    "/clans/{clan_id}/ai/excel/detect-schema",
    response_model=AISmartExcelDetectResponse,
    status_code=status.HTTP_200_OK,
)
async def detect_excel_schema(
    clan_id: uuid.UUID,
    file: UploadFile = File(...),
    selected_sheet: Optional[str] = Form(None),
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Tự động phân tích file Excel bất kỳ, nhận diện cấu trúc cột và đề xuất ánh xạ thông minh bằng AI."""
    await _require_quality_audit_access(
        db=db,
        principal=principal,
        clan_id=clan_id,
    )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp tin Excel tải lên bị rỗng.")
    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp tin vượt quá dung lượng tối đa 50MB.")

    try:
        detect_res = await smart_excel_service.detect_schema(
            file_bytes=file_bytes,
            clan_id=clan_id,
            selected_sheet=selected_sheet,
        )
        return AISmartExcelDetectResponse(
            sheet_names=detect_res["sheet_names"],
            selected_sheet=detect_res["selected_sheet"],
            header_row=detect_res["header_row"],
            data_start_row=detect_res["data_start_row"],
            column_mapping=detect_res["column_mapping"],
            available_fields=detect_res["available_fields"],
            sample_preview_rows=detect_res["sample_preview_rows"],
            ai_detected=detect_res["ai_detected"],
            needs_confirmation=detect_res.get("needs_confirmation", False),
            notes=detect_res.get("notes"),
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as exc:
        logger.exception("Lỗi khi nhận diện cấu trúc file Excel: %s", str(exc))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi đọc file Excel: {str(exc)}")


@router.post(
    "/clans/{clan_id}/ai/excel/parse-and-preview",
    response_model=AISmartExcelPreviewResponse,
    status_code=status.HTTP_200_OK,
)
async def parse_and_preview_smart_excel(
    clan_id: uuid.UUID,
    file: UploadFile = File(...),
    config: str = Form(..., description="Cấu hình JSON gồm selected_sheet, header_row, data_start_row, column_mapping"),
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Bóc tách dữ liệu và tự động ráp nối cây phả hệ (Cha - Con, Vợ - Chồng) theo bản đồ ánh xạ cột đã xác nhận."""
    await _require_quality_audit_access(
        db=db,
        principal=principal,
        clan_id=clan_id,
    )

    try:
        config_dict = json.loads(config)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cấu hình ánh xạ cột không phải JSON hợp lệ.")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp tin Excel tải lên bị rỗng.")

    try:
        preview_res = await smart_excel_service.parse_and_reconstruct_graph(
            file_bytes=file_bytes,
            clan_id=clan_id,
            db=db,
            config=config_dict,
        )
        return AISmartExcelPreviewResponse(
            is_valid=preview_res["is_valid"],
            summary=preview_res["summary"],
            preview=preview_res["preview"],
            fatal_errors=preview_res.get("fatal_errors", []),
            warnings=preview_res.get("warnings", []),
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as exc:
        logger.exception("Lỗi khi bóc tách và dựng cây phả hệ: %s", str(exc))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi phân tích dữ liệu: {str(exc)}")


@router.post(
    "/clans/{clan_id}/ai/excel/commit-import",
    response_model=AISmartExcelCommitResponse,
    status_code=status.HTTP_200_OK,
)
async def commit_smart_excel_import(
    clan_id: uuid.UUID,
    payload: SmartCommitRequestBody,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
):
    """Ghi nhận dữ liệu cây phả hệ nguyên khối (atomic) vào cơ sở dữ liệu sau khi người dùng xác nhận."""
    role_label, allowed_branch_ids = await _require_quality_audit_access(
        db=db,
        principal=principal,
        clan_id=clan_id,
    )

    if payload.parsed_data.get("is_valid") is False or (payload.parsed_data.get("fatal_errors") and len(payload.parsed_data["fatal_errors"]) > 0):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể lưu dữ liệu vì quá trình phân tích còn lỗi chặn (fatal errors). Vui lòng kiểm tra lại file Excel.",
        )

    try:
        result = await smart_excel_service.commit_smart_import(
            clan_id=clan_id,
            user_id=principal.user_id,
            db=db,
            parsed_data=payload.parsed_data,
            allowed_branch_ids=allowed_branch_ids,
            wipe_existing=payload.wipe_existing,
        )

        # Ghi nhật ký hệ thống
        now = _utc_now()
        db.add(
            AuditLog(
                clan_id=clan_id,
                actor_id=principal.user_id,
                action="smart_ai_excel_import",
                entity_type="persons_and_relations",
                new_data={
                    "created_persons": result["created_persons"],
                    "created_relationships": result["created_relationships"],
                    "created_branches": result["created_branches"],
                },
                reason="Nhập dữ liệu phả hệ tự động bằng AI Smart Excel",
                occurred_at=now,
            )
        )

        await db.commit()
        return AISmartExcelCommitResponse(**result)
    except ValueError as ve:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as exc:
        await db.rollback()
        logger.exception("Lỗi khi lưu dữ liệu phả hệ: %s", str(exc))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Lỗi khi lưu vào cơ sở dữ liệu: {str(exc)}")
