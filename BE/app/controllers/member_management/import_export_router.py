from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Response, status, File, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.models.family.entities import (
    Clan, ClanProfile, ClanMembership, PersonAccountLink,
    BusinessRegistration, FamilyAdminAssignment, Notification, UserNotification
)
from app.models.genealogy.entities import (
    Person, Relationship, FamilyBranch, ClanLocation, PersonBurial, LocationProposal
)
from app.models.user_access.entities import User, Role, UserRole
from app.models.postgres import Account
from app.services.auth_access.access_service import AccessService
from app.controllers.member_management.common import (
    _family_uuid, _require, _require_branch_scope
)

router = APIRouter()

from app.services.genealogy.excel_import_service import (
    generate_excel_template,
    validate_excel_data,
    execute_excel_import,
)


@router.get("/families/{family_id}/persons/export")
@router.get("/persons/export")
async def export_persons(
    family_id: Optional[str] = None,
    format: str = Query("csv"),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Export person list as CSV (BUG-025). person.update in that family."""
    return await export_persons_csv(db=db, account=account, family_id=family_id)




async def export_persons_csv(*, db: AsyncSession, account: Account, family_id: Optional[str]) -> Response:
    """The CSV of one family's persons. Also used by GET /api/v1/families/{id}/persons/export."""
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="family_id is required to export persons for a clan"
        )
    try:
        f_uuid = uuid.UUID(family_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid family_id format"
        )
    # The whole clan with birth and death dates leaves the system: managers only (Mốc M2b),
    # a plain member (person.view) gets 403.
    await _require(db, account, f_uuid, "person.update")

    stmt = select(Person).where(Person.family_id == f_uuid)

    stmt = stmt.order_by(Person.generation, Person.full_name)
    res = await db.execute(stmt)
    persons = res.scalars().all()

    branch_ids = [p.branch_id for p in persons if p.branch_id]
    branch_map = {}
    if branch_ids:
        b_res = await db.execute(select(FamilyBranch).where(FamilyBranch.id.in_(branch_ids)))
        branch_map = {b.id: b.name for b in b_res.scalars().all()}

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output)
    writer.writerow([
        "STT", "Mã thành viên", "Họ và tên", "Giới tính",
        "Ngày sinh", "Ngày mất", "Tình trạng", "Đời thứ", "Chi nhánh", "Ghi chú"
    ])

    for idx, p in enumerate(persons, 1):
        g = "Nam" if (p.gender or "").upper() == "MALE" else ("Nữ" if (p.gender or "").upper() == "FEMALE" else "Khác")
        alive = "Còn sống" if p.is_alive else "Đã mất"
        b_name = branch_map.get(p.branch_id, "Chi Trưởng")
        writer.writerow([
            idx,
            str(p.id),
            p.full_name,
            g,
            p.birth_date.isoformat() if p.birth_date else "",
            p.death_date.isoformat() if p.death_date else "",
            alive,
            p.generation or 1,
            b_name,
            p.bio or ""
        ])

    csv_content = output.getvalue()
    filename = f"danh_sach_thanh_vien_{family_id or 'all'}.csv"
    return Response(
        content=csv_content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# -----------------------------------------------------------------------------
# EXCEL IMPORT ENDPOINTS (PERSON - USER PARADIGM)
# -----------------------------------------------------------------------------


@router.get("/families/{family_id}/import/template")
async def download_import_template(
    family_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Download standardized 4-sheet Excel template for Clan Admin / Family Admin."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "person.create")

    clan = (await db.execute(select(Clan).where(Clan.clan_id == f_uuid))).scalar_one_or_none()
    clan_name = clan.name if clan else "Dòng họ"
    clan_code = clan.clan_code if clan else "CLAN"

    xlsx_bytes = generate_excel_template(clan_name, clan_code)
    filename = f"MFGMS_Mau_Nhap_Gia_Pha_{clan_code}.xlsx"

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/families/{family_id}/import/preview")
async def preview_excel_import(
    family_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Dry-run validation of uploaded Excel file: returns row-by-row error report and preview."""
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "person.create")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Tệp tin tải lên bị rỗng")
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Tệp tin vượt quá dung lượng tối đa 10MB")

    return await validate_excel_data(file_bytes, f_uuid, db)


@router.post("/families/{family_id}/import/execute")
async def confirm_excel_import(
    family_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """Atomic transaction commit of valid Excel file into Neon DB.
    Enforces strict backend re-validation and branch scoping.
    """
    f_uuid = _family_uuid(family_id)
    await _require(db, account, f_uuid, "person.create")

    # Kiểm tra phân quyền chi nhánh đối với Family Admin
    roles = await AccessService(db).repo.get_active_roles(account.id, str(f_uuid))
    role_set = {r.lower() for r in roles}
    is_clan_leader = bool(role_set.intersection({"business_owner", "owner", "family_head", "clan_admin"}))
    is_sys_admin = getattr(account, "primary_role", "").lower() in ("admin", "system_admin")

    allowed_branch_ids = None
    if not is_sys_admin and not is_clan_leader:
        if "family_admin" in role_set:
            from app.models.family.entities import FamilyAdminAssignment
            stmt = select(FamilyAdminAssignment).where(
                FamilyAdminAssignment.user_id == account.id,
                FamilyAdminAssignment.clan_id == f_uuid,
                FamilyAdminAssignment.revoked_at.is_(None),
            )
            assignments = (await db.execute(stmt)).scalars().all()
            if not assignments:
                raise HTTPException(status_code=403, detail="Quyền Quản trị viên chi nhánh đã bị thu hồi hoặc không hợp lệ.")
            has_clan_wide = any(a.branch_id is None for a in assignments)
            if not has_clan_wide:
                allowed_branch_ids = {a.branch_id for a in assignments if a.branch_id is not None}
        else:
            raise HTTPException(status_code=403, detail="Thành viên thông thường không có quyền nhập dữ liệu vào cơ sở dữ liệu.")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Tệp tin tải lên bị rỗng")
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Tệp tin vượt quá dung lượng tối đa 10MB")

    try:
        result = await execute_excel_import(
            file_bytes=file_bytes,
            clan_id=f_uuid,
            user_id=account.id,
            db=db,
            allowed_branch_ids=allowed_branch_ids,
        )
        await db.commit()
        return result
    except ValueError as val_err:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống khi lưu gia phả: {str(exc)}")


