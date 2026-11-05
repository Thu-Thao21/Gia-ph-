"""C07. Archive & Media Controller.

Handles family historical documents, media assets, uploads, and archival records.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.models.archive.entities import ClanDocument
from app.models.family.entities import Clan
from app.models.postgres import Account
from app.services.auth_access.access_service import AccessService
from app.dependencies.auth import get_current_account

router = APIRouter(tags=["C07. Archive & Media Controller"])


def _family_uuid(val: str) -> uuid.UUID:
    try:
        return uuid.UUID(val)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid family_id format")


class DocumentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = "GENERAL"
    fileUrl: Optional[str] = None
    fileType: Optional[str] = None


@router.get("/families/{family_id}/documents")
async def list_clan_documents(
    family_id: str,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Danh mục tư liệu lịch sử, văn bia, hình ảnh lưu trữ của dòng họ."""
    f_uuid = _family_uuid(family_id)

    stmt = select(ClanDocument).where(ClanDocument.clan_id == f_uuid).order_by(ClanDocument.created_at.desc())
    if category:
        stmt = stmt.where(ClanDocument.category == category.upper())

    res = await db.execute(stmt)
    docs = res.scalars().all()

    return [
        {
            "id": str(d.id),
            "documentId": str(d.id),
            "title": d.title,
            "description": d.description,
            "category": d.category,
            "fileUrl": d.file_url,
            "fileType": d.file_type,
            "createdAt": d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]


@router.post("/families/{family_id}/documents", status_code=status.HTTP_201_CREATED)
async def create_clan_document(
    family_id: str,
    data: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Lưu trữ tư liệu, văn bia hoặc hình ảnh lịch sử mới."""
    f_uuid = _family_uuid(family_id)

    new_doc = ClanDocument(
        clan_id=f_uuid,
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        category=data.category.upper() if data.category else "GENERAL",
        file_url=data.fileUrl,
        file_type=data.fileType,
        uploaded_by=account.id,
    )
    db.add(new_doc)
    await db.commit()
    await db.refresh(new_doc)

    return {
        "id": str(new_doc.id),
        "documentId": str(new_doc.id),
        "title": new_doc.title,
        "message": "Đã lưu trữ tư liệu gia tộc thành công.",
    }


@router.delete("/families/{family_id}/documents/{document_id}")
async def delete_clan_document(
    family_id: str,
    document_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Xóa tư liệu lưu trữ."""
    f_uuid = _family_uuid(family_id)

    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document_id")

    res = await db.execute(select(ClanDocument).where(ClanDocument.id == doc_uuid, ClanDocument.clan_id == f_uuid))
    doc = res.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tư liệu")

    await db.delete(doc)
    await db.commit()
    return {"success": True, "message": "Đã xóa tư liệu gia tộc thành công."}
