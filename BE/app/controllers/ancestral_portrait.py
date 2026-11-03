"""An ancestor's portrait is stored in PostgreSQL, alongside their person profile."""

import base64
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.controllers.member_api_router import _require, _require_branch_scope
from app.core.utils.image_validation import MAX_BYTES, ImageRejected, check_image
from app.db.postgres import get_db
from app.dependencies.auth import get_current_account
from app.models.genealogy.entities import Person
from app.models.user_access.entities import AuditLog, User
from app.services.auth_access.access_service import AccessService

router = APIRouter(prefix="/api/v1/families/{family_id}", tags=["ancestral-hall"])


async def _editable_ancestor(
    family_id: uuid.UUID,
    person_id: uuid.UUID,
    db: AsyncSession,
    account: User,
) -> Person:
    # Check the requested clan before looking up the person. The person id must belong
    # to that clan too, and a branch admin may only edit their assigned branch.
    await _require(db, account, family_id, "person.update")
    person = (await db.execute(select(Person).where(
        Person.id == person_id, Person.family_id == family_id,
        Person.status.notin_(["DELETED", "MERGED"]),
    ))).scalar_one_or_none()
    if person is None:
        raise HTTPException(404, "Không tìm thấy hồ sơ tiền nhân trong dòng họ này.")
    if not await AccessService(db).is_system_admin(account):
        await _require_branch_scope(db, account, family_id, person.branch_id, "person.update")
    if person.is_alive is not False and person.death_date is None:
        raise HTTPException(422, "Ảnh thờ chỉ dành cho hồ sơ tiền nhân đã khuất.")
    return person


@router.put("/persons/{person_id}/portrait")
async def upload_ancestor_portrait(
    family_id: uuid.UUID,
    person_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    person = await _editable_ancestor(family_id, person_id, db, account)

    try:
        data = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()
    try:
        checked = check_image(data)
    except ImageRejected as exc:
        if exc.reason == "too_large":
            raise HTTPException(413, "Ảnh vượt quá dung lượng cho phép (2 MB).") from None
        if exc.reason == "bad_dimensions":
            raise HTTPException(422, "Chiều rộng và chiều cao ảnh phải từ 16 đến 4096 pixel.") from None
        raise HTTPException(422, "Ảnh không hợp lệ. Vui lòng chọn ảnh JPG, PNG hoặc WebP.") from None

    # The existing TEXT field stores the image itself as a data URL, so it survives
    # restarts without relying on local files or a browser's storage.
    portrait_url = f"data:{checked.mime_type};base64,{base64.b64encode(data).decode('ascii')}"
    person.avatar_url = portrait_url
    person.updated_at = datetime.now(timezone.utc)
    db.add(AuditLog(
        clan_id=family_id, actor_id=account.user_id,
        action="person.portrait_updated", entity_type="person", entity_id=person_id,
        new_data={"mime_type": checked.mime_type, "size_bytes": len(data)},
    ))
    await db.commit()
    return {"personId": str(person_id), "avatarUrl": portrait_url}


@router.delete("/persons/{person_id}/portrait")
async def delete_ancestor_portrait(
    family_id: uuid.UUID,
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    account: User = Depends(get_current_account),
):
    person = await _editable_ancestor(family_id, person_id, db, account)
    if person.avatar_url is not None:
        person.avatar_url = None
        person.updated_at = datetime.now(timezone.utc)
        db.add(AuditLog(
            clan_id=family_id, actor_id=account.user_id,
            action="person.portrait_deleted", entity_type="person", entity_id=person_id,
            new_data={"avatarUrl": None},
        ))
        await db.commit()
    return {"personId": str(person_id), "avatarUrl": None}
