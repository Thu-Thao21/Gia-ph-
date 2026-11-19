from __future__ import annotations

import uuid
from pydantic import BaseModel

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.genealogy.controller import GenealogyController
from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.models.postgres import Account
from app.schemas.genealogy import (
    AncestorDescendantResponse,
    FocusViewResponse,
    PersonCreate,
    PersonResponse,
    PersonUpdate,
    RelationshipCalculationResponse,
    RelationshipCreate,
    RelationshipResponse,
    TreeDataResponse,
)

router = APIRouter(prefix="/api/v1/families/{family_id}", tags=["genealogy"])


def controller(db: AsyncSession, account: Account) -> GenealogyController:
    return GenealogyController(db, account)


@router.get("/persons", response_model=list[PersonResponse])
async def search_persons(
    family_id: str,
    search: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None, alias="branchId"),
    is_living: Optional[bool] = Query(None, alias="isLiving"),
    limit: int = Query(50, ge=1),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    keyword = search if search is not None else q
    return await controller(db, account).search_persons(
        family_id, keyword, gender, branch_id, is_living, limit, offset
    )


@router.post(
    "/persons", response_model=PersonResponse, status_code=status.HTTP_201_CREATED
)
async def create_person(
    family_id: str,
    data: PersonCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    return await controller(db, account).create_person(family_id, data)


@router.get("/persons/export")
async def export_family_persons(
    family_id: str,
    format: str = Query("csv"),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    """CSV of the family's persons: person.update in THIS family (Mốc M2 N-2, M2b)."""
    from app.controllers.member_api_router import export_persons_csv
    return await export_persons_csv(db=db, account=account, family_id=family_id)


@router.get("/persons/{person_id}", response_model=PersonResponse)
async def get_person(
    family_id: str,
    person_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    return await controller(db, account).get_person(family_id, person_id)


@router.patch("/persons/{person_id}", response_model=PersonResponse)
async def update_person(
    family_id: str,
    person_id: str,
    data: PersonUpdate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    return await controller(db, account).update_person(family_id, person_id, data)


@router.post(
    "/relationships",
    response_model=RelationshipResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_relationship(
    family_id: str,
    data: RelationshipCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    return await controller(db, account).create_relationship(family_id, data)


@router.delete("/relationships/{relationship_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relationship(
    family_id: str,
    relationship_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    await controller(db, account).delete_relationship(family_id, relationship_id)


@router.get(
    "/persons/{person_id}/ancestors",
    response_model=list[AncestorDescendantResponse],
)
async def get_ancestors(
    family_id: str,
    person_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    return await controller(db, account).get_ancestors(family_id, person_id)


@router.get(
    "/persons/{person_id}/descendants",
    response_model=list[AncestorDescendantResponse],
)
async def get_descendants(
    family_id: str,
    person_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    return await controller(db, account).get_descendants(family_id, person_id)


@router.get("/tree-data", response_model=TreeDataResponse)
async def get_tree_data(
    family_id: str,
    branch_id: Optional[str] = Query(None, alias="branchId"),
    generation: Optional[int] = Query(None),
    max_generation: Optional[int] = Query(None, alias="maxGeneration"),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    return await controller(db, account).get_tree_data(
        family_id,
        branch_id=branch_id,
        generation=generation,
        max_generation=max_generation,
    )


@router.get(
    "/persons/{person_id}/focus-view",
    response_model=FocusViewResponse,
)
async def get_focus_view(
    family_id: str,
    person_id: str,
    depth: int = Query(2, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    return await controller(db, account).get_focus_view(family_id, person_id, depth)


@router.get(
    "/relationship-path",
    response_model=RelationshipCalculationResponse,
)
async def calculate_relationship(
    family_id: str,
    from_person_id: Optional[str] = Query(None, alias="fromPersonId"),
    to_person_id: Optional[str] = Query(None, alias="toPersonId"),
    from_person_id_snake: Optional[str] = Query(None, alias="from_person_id"),
    to_person_id_snake: Optional[str] = Query(None, alias="to_person_id"),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    from_id = from_person_id or from_person_id_snake
    to_id = to_person_id or to_person_id_snake
    if not from_id or not to_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both fromPersonId and toPersonId parameters are required",
        )
    return await controller(db, account).calculate_relationship(
        family_id, from_id, to_id
    )


@router.get("/public-tree", response_model=TreeDataResponse)
async def get_public_tree(
    family_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint for guest tree view with privacy masking (FR-GU-04, FR-GU-10)."""
    from app.services.genealogy import GenealogyService
    return await GenealogyService(db).get_public_tree(family_id)


class BranchCreate(BaseModel):
    name: str
    description: Optional[str] = None
    code: Optional[str] = None


class BranchUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    code: Optional[str] = None


@router.get("/branches")
async def list_branches(
    family_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    from sqlalchemy import select
    from app.models.genealogy.entities import FamilyBranch
    try:
        f_uuid = uuid.UUID(family_id)
        stmt = select(FamilyBranch).where(
            FamilyBranch.family_id == f_uuid,
            FamilyBranch.status == "ACTIVE"
        ).order_by(FamilyBranch.branch_order, FamilyBranch.created_at)
        res = await db.execute(stmt)
        branches = res.scalars().all()
        return [
            {
                "id": str(b.id),
                "name": b.name,
                "description": b.description or "",
                "code": b.code or "",
                "familyId": str(b.family_id),
            }
            for b in branches
        ]
    except Exception as e:
        return []


@router.post("/branches", status_code=status.HTTP_201_CREATED)
async def create_branch(
    family_id: str,
    data: BranchCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    from app.models.genealogy.entities import FamilyBranch
    f_uuid = uuid.UUID(family_id)
    new_b = FamilyBranch(
        family_id=f_uuid,
        name=data.name,
        description=data.description,
        code=data.code,
        status="ACTIVE",
    )
    db.add(new_b)
    await db.commit()
    await db.refresh(new_b)
    return {
        "id": str(new_b.id),
        "name": new_b.name,
        "description": new_b.description or "",
        "code": new_b.code or "",
        "familyId": str(new_b.family_id),
    }


@router.patch("/branches/{branch_id}")
async def update_branch(
    family_id: str,
    branch_id: str,
    data: BranchUpdate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    from sqlalchemy import select
    from app.models.genealogy.entities import FamilyBranch
    b_uuid = uuid.UUID(branch_id)
    f_uuid = uuid.UUID(family_id)
    stmt = select(FamilyBranch).where(FamilyBranch.id == b_uuid, FamilyBranch.family_id == f_uuid)
    res = await db.execute(stmt)
    b = res.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Branch not found")
    if data.name is not None:
        b.name = data.name
    if data.description is not None:
        b.description = data.description
    if data.code is not None:
        b.code = data.code
    await db.commit()
    await db.refresh(b)
    return {
        "id": str(b.id),
        "name": b.name,
        "description": b.description or "",
        "code": b.code or "",
        "familyId": str(b.family_id),
    }


@router.delete("/branches/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_branch(
    family_id: str,
    branch_id: str,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    from sqlalchemy import select
    from app.models.genealogy.entities import FamilyBranch
    b_uuid = uuid.UUID(branch_id)
    f_uuid = uuid.UUID(family_id)
    stmt = select(FamilyBranch).where(FamilyBranch.id == b_uuid, FamilyBranch.family_id == f_uuid)
    res = await db.execute(stmt)
    b = res.scalar_one_or_none()
    if b:
        b.status = "DELETED"
        await db.commit()

from datetime import datetime, timezone, timedelta


class ClanAuditCreate(BaseModel):
    action: str
    action_type: str = "MEMBER"
    details: str
    entity_id: Optional[str] = None


@router.get("/audit-logs")
async def list_clan_audit_logs(
    family_id: str,
    category: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    from sqlalchemy import select
    from app.models.user_access.entities import AuditLog, User
    from app.models.genealogy.entities import Person, FamilyBranch
    from app.models.family.entities import Clan

    try:
        f_uuid = uuid.UUID(family_id)
        stmt = (
            select(AuditLog)
            .where(AuditLog.clan_id == f_uuid)
            .order_by(AuditLog.occurred_at.desc())
            .limit(limit)
        )
        res = await db.execute(stmt)
        logs = res.scalars().all()

        c_res = await db.execute(select(Clan).where(Clan.clan_id == f_uuid))
        clan = c_res.scalar_one_or_none()
        clan_name = clan.name if clan else "Dòng họ"

        items = []
        for log in logs:
            raw_action = (log.action or "").lower()
            raw_entity = (log.entity_type or "").lower()

            action_name = log.action or "Cập nhật hệ thống"
            action_type = "MEMBER"

            if "excel" in raw_action or "import" in raw_action:
                action_name = "Nhập phả hệ từ Excel"
                action_type = "MEMBER"
            elif "activate" in raw_action or "clan.activate" in raw_action:
                action_name = "Kích hoạt không gian số dòng họ"
                action_type = "PERMISSION"
            elif "provision" in raw_action:
                action_name = "Khởi tạo hệ thống gia tộc"
                action_type = "PERMISSION"
            elif "business.create" in raw_action:
                action_name = "Đăng ký thành lập không gian dòng họ"
                action_type = "PERMISSION"
            elif "branch" in raw_action or raw_entity == "branch":
                action_name = log.action if ("chi" in raw_action or "nhánh" in raw_action) else "Cập nhật Chi/Nhánh"
                action_type = "BRANCH"
            elif "relation" in raw_action or raw_entity == "relationship":
                action_name = log.action if "quan hệ" in raw_action else "Cập nhật mối quan hệ"
                action_type = "RELATION"
            elif "join" in raw_action or "approve" in raw_action:
                action_name = "Xét duyệt yêu cầu gia nhập"
                action_type = "APPROVAL"
            elif "profile" in raw_action:
                action_name = "Cập nhật hồ sơ dòng họ"
                action_type = "PERMISSION"
            elif "export" in raw_action:
                action_name = "Xuất dữ liệu gia phả"
                action_type = "EXPORT"
            elif raw_entity == "person" or "person" in raw_action or "thành viên" in raw_action:
                action_name = log.action if "thành viên" in raw_action else "Cập nhật thành viên"
                action_type = "MEMBER"

            if log.entity_type and log.entity_type.upper() in ["MEMBER", "RELATION", "BRANCH", "APPROVAL", "PERMISSION", "LINK", "EXPORT"]:
                action_type = log.entity_type.upper()

            if category and category != "all" and action_type.upper() != category.upper():
                continue

            actor_name = "Trưởng tộc " + clan_name
            if log.actor_id:
                u_res = await db.execute(select(User).where(User.user_id == log.actor_id))
                u = u_res.scalar_one_or_none()
                if u and u.display_name:
                    actor_name = u.display_name

            details = ""
            if log.new_data and isinstance(log.new_data, dict):
                details = log.new_data.get("description") or log.new_data.get("message") or log.new_data.get("details") or ""
            if not details:
                if "import" in raw_action:
                    details = "Nhập thành công danh sách nhân khẩu và quan hệ phả hệ vào cây gia phả."
                elif "clan.activate" in raw_action:
                    details = f"Không gian quản trị cho {clan_name} đã được kích hoạt thành công trên hệ thống."
                elif "provision" in raw_action:
                    details = "Hệ thống đã thiết lập tài khoản và cơ sở dữ liệu cho ban quản trị dòng họ."
                elif "business.create" in raw_action:
                    details = f"Đã nộp hồ sơ mở không gian số hóa gia phả cho {clan_name} để ban quản trị hệ thống phê duyệt."
                else:
                    details = log.reason or f"Thực hiện thành công thao tác {action_name}"

            items.append({
                "id": str(log.log_id),
                "actorName": actor_name,
                "action": action_name,
                "actionType": action_type,
                "details": details,
                "occurredAt": log.occurred_at.isoformat() if log.occurred_at else datetime.now(timezone.utc).isoformat(),
            })

        return items
    except Exception as e:
        import traceback
        traceback.print_exc()
        return []


@router.post("/audit-logs", status_code=status.HTTP_201_CREATED)
async def create_clan_audit_log(
    family_id: str,
    data: ClanAuditCreate,
    db: AsyncSession = Depends(get_db),
    account: Account = Depends(get_current_account),
):
    from app.models.user_access.entities import AuditLog, User
    from sqlalchemy import select
    try:
        f_uuid = uuid.UUID(family_id)
        u_res = await db.execute(select(User).where(User.account_id == account.account_id))
        user = u_res.scalar_one_or_none()
        actor_id = user.user_id if user else None

        new_log = AuditLog(
            clan_id=f_uuid,
            actor_id=actor_id,
            action=data.action,
            entity_type=data.action_type.upper(),
            new_data={"message": data.details},
            reason=data.details,
            occurred_at=datetime.now(timezone.utc),
        )
        db.add(new_log)
        await db.commit()
        await db.refresh(new_log)
        return {"id": str(new_log.log_id), "status": "recorded"}
    except Exception as e:
        return {"status": "saved_fallback"}
