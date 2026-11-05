"""Genealogy Database Query Tools for AI Chatbot (MFGMS-AI Phase 3).

Safe, controlled, parameterized queries on Neon DB for genealogy data.
No raw SQL execution by AI; all queries are typed and bound to clan_id.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.genealogy.entities import FamilyBranch, Person, Relationship

# Common Vietnamese kinship and query prefixes to strip when searching names
TITLE_PREFIXES = [
    "thân sinh phụ mẫu của", "phụ mẫu của", "cha mẹ của", "con cái của",
    "cho tôi biết thông tin về", "cho tôi biết về", "thông tin về",
    "người có tên", "thành viên",
    "ông cụ", "bà cụ", "cụ ông", "cụ bà", "cụ tổ", "thủy tổ", "tiên tổ",
    "ông", "bà", "bác", "chú", "cô", "dì", "thím", "mợ", "dượng",
    "anh", "chị", "em", "cháu", "con", "cụ", "ngài"
]

COMMON_QUESTION_SUFFIXES = [
    r"thuộc thế hệ thứ mấy và có bao nhiêu người con.*",
    r"thuộc đời thứ mấy và có bao nhiêu người con.*",
    r"thuộc thế hệ thứ mấy.*",
    r"thuộc đời thứ mấy.*",
    r"có bao nhiêu người con.*",
    r"có mấy người con.*",
    r"sinh năm bao nhiêu và thuộc chi nhánh nào.*",
    r"sinh năm bao nhiêu.*",
    r"mất năm bao nhiêu.*",
    r"thuộc chi nhánh nào.*",
    r"thuộc chi nào.*",
    r"là ai.*",
    r"ở đâu.*",
]


def clean_name_query(query: str) -> str:
    """Loại bỏ các tiền tố xưng hô, câu hỏi và dấu câu để lấy chính xác họ và tên tìm kiếm."""
    cleaned = query.strip()
    # Loại bỏ dấu câu ở cuối câu hỏi như ?, ., !, :
    cleaned = re.sub(r"[?!.,;:]+$", "", cleaned).strip()

    # 1. Nếu tên được đặt trong dấu ngoặc đơn hoặc kép: 'Dương Quang Khởi' hoặc "..."
    quoted = re.findall(r"['\"‘“]([^'\"’”]+)['\"’”]", cleaned)
    if quoted:
        candidate = quoted[0].strip()
        if len(candidate.split()) >= 2 or len(candidate) >= 3:
            return candidate

    # 2. Tìm và cắt tiền tố xưng hô hoặc tiền tố câu hỏi ở đầu nếu có
    lowered = cleaned.lower()
    for prefix in sorted(TITLE_PREFIXES, key=len, reverse=True):
        if lowered.startswith(prefix + " "):
            cleaned = cleaned[len(prefix) + 1:].strip()
            lowered = cleaned.lower()

    # 3. Cắt bỏ các hậu tố câu hỏi thường gặp ở cuối
    for suffix_pat in COMMON_QUESTION_SUFFIXES:
        match = re.search(r"\s+" + suffix_pat + "$", cleaned, re.IGNORECASE)
        if match:
            cleaned = cleaned[:match.start()].strip()
            break

    # 4. Loại bỏ các phần chú thích trong ngoặc đơn như (sinh năm 1845)
    cleaned = re.sub(r"\s*\([^)]*\)", "", cleaned).strip()

    return cleaned


class GenealogyTools:
    """Tập hợp các công cụ tra cứu dữ liệu gia phả được kiểm soát chặt chẽ."""

    @staticmethod
    async def search_persons_by_name(
        db: AsyncSession,
        clan_id: uuid.UUID,
        name_query: str,
        limit: int = 10,
    ) -> List[Person]:
        """Tìm kiếm thành viên theo tên trong dòng họ."""
        cleaned = clean_name_query(name_query)
        if not cleaned:
            return []

        # 1. Tìm kiếm chính xác hoặc khớp tương đối (ILIKE)
        stmt = (
            select(Person)
            .where(
                Person.family_id == clan_id,
                Person.full_name.ilike(f"%{cleaned}%"),
            )
            .order_by(Person.generation, Person.full_name)
            .limit(limit)
        )
        res = await db.execute(stmt)
        persons = list(res.scalars().all())

        # 2. Nếu tìm cả họ tên không thấy, thử tìm theo từ cuối (tên riêng)
        if not persons:
            tokens = cleaned.split()
            if len(tokens) > 1:
                last_name = tokens[-1]
                stmt_last = (
                    select(Person)
                    .where(
                        Person.family_id == clan_id,
                        Person.full_name.ilike(f"%{last_name}%"),
                    )
                    .order_by(Person.generation, Person.full_name)
                    .limit(limit)
                )
                res_last = await db.execute(stmt_last)
                persons = list(res_last.scalars().all())

        return persons

    @staticmethod
    async def get_person_by_id(
        db: AsyncSession,
        clan_id: uuid.UUID,
        person_id: uuid.UUID,
    ) -> Optional[Person]:
        """Lấy thông tin chi tiết một Person theo ID."""
        stmt = select(Person).where(
            Person.family_id == clan_id,
            Person.id == person_id,
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def filter_viewable_candidates(
        db: AsyncSession,
        clan_id: uuid.UUID,
        user_id: uuid.UUID,
        candidates: List[Person],
    ) -> List[Dict[str, Any]]:
        """Lọc và chuẩn hóa danh sách ứng viên (person_candidates) theo quyền riêng tư và quyền xem:
        - Kiểm tra quyền quản trị viên dòng họ (Owner, Clan Admin, Family Admin) hoặc người liên kết chính chủ.
        - Với người đã khuất: hiển thị năm sinh, năm mất trong phạm vi lịch sử dòng tộc.
        - Với người còn sống:
          + Nếu có thiết lập ẩn danh (PRIVATE/HIDDEN) và người xem không phải admin/chính chủ: loại bỏ hoàn toàn khỏi danh sách.
          + Nếu chưa có sự đồng ý AI (AIConsent) hoặc tắt chia sẻ ngày sinh: che giấu (mask) năm sinh, năm mất để bảo vệ quyền riêng tư.
        """
        if not candidates:
            return []

        from app.models.family.entities import Clan, PersonAccountLink, FamilyAdminAssignment
        from app.models.user_access.entities import Role, UserRole
        from app.models.ai.entities import AIConsent
        from app.models.genealogy.entities import PersonPrivacySetting

        # 1. Kiểm tra vai trò của user_id trong Clan (Admin / Owner / Creator)
        is_admin = False
        if user_id:
            clan_stmt = select(Clan.created_by).where(Clan.clan_id == clan_id)
            clan_creator = (await db.execute(clan_stmt)).scalar_one_or_none()
            if clan_creator == user_id:
                is_admin = True
            else:
                admin_role_stmt = select(Role.role_id).where(
                    Role.code.in_(["OWNER", "BUSINESS_OWNER", "CLAN_ADMIN", "FAMILY_ADMIN", "ADMIN"])
                )
                admin_role_ids = (await db.execute(admin_role_stmt)).scalars().all()
                if admin_role_ids:
                    user_role_stmt = select(UserRole.user_role_id).where(
                        UserRole.user_id == user_id,
                        UserRole.role_id.in_(admin_role_ids),
                        or_(UserRole.clan_id == clan_id, UserRole.clan_id.is_(None)),
                        UserRole.revoked_at.is_(None),
                    )
                    if (await db.execute(user_role_stmt)).scalar_one_or_none():
                        is_admin = True

                if not is_admin:
                    fam_admin_stmt = select(FamilyAdminAssignment.assignment_id).where(
                        FamilyAdminAssignment.user_id == user_id,
                        FamilyAdminAssignment.clan_id == clan_id,
                        FamilyAdminAssignment.revoked_at.is_(None),
                    )
                    if (await db.execute(fam_admin_stmt)).scalar_one_or_none():
                        is_admin = True

        # 2. Lấy person_id liên kết với user
        user_person_id = None
        if user_id:
            link_stmt = select(PersonAccountLink.person_id).where(
                PersonAccountLink.user_id == user_id,
                PersonAccountLink.clan_id == clan_id,
                PersonAccountLink.status == "ACTIVE",
            )
            user_person_id = (await db.execute(link_stmt)).scalar_one_or_none()

        # 3. Lấy Privacy Settings và AIConsents của các ứng viên
        cand_ids = [c.id for c in candidates]
        priv_stmt = select(PersonPrivacySetting).where(PersonPrivacySetting.person_id.in_(cand_ids))
        priv_map = {p.person_id: p for p in (await db.execute(priv_stmt)).scalars().all()}

        consent_stmt = select(AIConsent.person_id).where(
            AIConsent.clan_id == clan_id,
            AIConsent.person_id.in_(cand_ids),
            AIConsent.granted.is_(True),
            AIConsent.revoked_at.is_(None),
        )
        consented_ids = set((await db.execute(consent_stmt)).scalars().all())

        filtered_candidates: List[Dict[str, Any]] = []

        for c in candidates:
            is_self = bool(user_person_id and user_person_id == c.id)
            is_living = bool(c.is_alive is not False and c.death_date is None)
            priv = priv_map.get(c.id)

            # A. Người đã khuất: Thuộc phạm vi lịch sử chung của dòng họ
            if not is_living:
                if not is_admin and not is_self and priv and priv.full_name_visibility in ("PRIVATE", "HIDDEN"):
                    continue

                filtered_candidates.append({
                    "person_id": str(c.id),
                    "full_name": c.full_name,
                    "generation": c.generation or 1,
                    "gender": (c.gender or "MALE").lower(),
                    "birth_year": c.birth_date.year if c.birth_date else None,
                    "death_year": c.death_date.year if c.death_date else None,
                    "is_alive": False,
                    "is_sensitive_masked": False,
                    "privacy_level": "PUBLIC_DECEASED",
                })
                continue

            # B. Người còn sống: Cần bảo vệ thông tin nhạy cảm
            # B1. Nếu là Admin hoặc người xem chính là người này: cho phép xem đầy đủ
            if is_admin or is_self:
                filtered_candidates.append({
                    "person_id": str(c.id),
                    "full_name": c.full_name,
                    "generation": c.generation or 1,
                    "gender": (c.gender or "MALE").lower(),
                    "birth_year": c.birth_date.year if c.birth_date else None,
                    "death_year": None,
                    "is_alive": True,
                    "is_sensitive_masked": False,
                    "privacy_level": "ADMIN_ACCESS" if is_admin else "SELF_ACCESS",
                })
                continue

            # B2. Nếu người xem là thành viên thường:
            # Nếu tên bị cài đặt ẩn hoàn toàn -> Không trả về trong danh sách
            if priv and priv.full_name_visibility in ("PRIVATE", "HIDDEN"):
                continue

            has_consent = (c.id in consented_ids)
            birth_hidden = bool(priv and priv.birth_date_visibility in ("PRIVATE", "HIDDEN"))

            if not has_consent or birth_hidden:
                # Che giấu thông tin nhạy cảm (năm sinh, năm mất)
                filtered_candidates.append({
                    "person_id": str(c.id),
                    "full_name": c.full_name,
                    "generation": c.generation or 1,
                    "gender": (c.gender or "MALE").lower(),
                    "birth_year": None,
                    "death_year": None,
                    "is_alive": True,
                    "is_sensitive_masked": True,
                    "privacy_level": "PROTECTED_LIVING",
                    "note": "Thông tin cá nhân được bảo vệ theo quyền riêng tư người còn sống",
                })
            else:
                filtered_candidates.append({
                    "person_id": str(c.id),
                    "full_name": c.full_name,
                    "generation": c.generation or 1,
                    "gender": (c.gender or "MALE").lower(),
                    "birth_year": c.birth_date.year if c.birth_date else None,
                    "death_year": None,
                    "is_alive": True,
                    "is_sensitive_masked": False,
                    "privacy_level": "CONSENTED_LIVING",
                })

        return filtered_candidates

    @staticmethod
    async def get_person_family(
        db: AsyncSession,
        clan_id: uuid.UUID,
        person_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Truy vấn mạng lưới gia đình trực hệ: Cha, Mẹ, Vợ/Chồng, Con cái, Anh chị em.
        Đảm bảo loại trừ trùng lặp bản ghi và phân biệt rõ ràng con ruột, con nuôi."""
        person = await GenealogyTools.get_person_by_id(db, clan_id, person_id)
        if not person:
            return {
                "person": None,
                "parents": [],
                "spouses": [],
                "children": [],
                "siblings": [],
                "unique_children_count": 0,
                "biological_children": [],
                "adoptive_children": [],
                "step_children": [],
                "children_summary_text": "Không có thông tin",
            }

        rel_stmt = select(Relationship).where(
            Relationship.family_id == clan_id,
            or_(
                Relationship.from_member_id == person_id,
                Relationship.to_member_id == person_id,
            ),
        )
        rels = (await db.execute(rel_stmt)).scalars().all()

        parent_ids: List[uuid.UUID] = []
        spouse_ids: List[uuid.UUID] = []
        child_type_map: Dict[uuid.UUID, str] = {}

        for r in rels:
            rtype = (r.relationship_type or "").upper().strip()
            if rtype in ("PARENT_CHILD", "PARENT", "FATHER", "MOTHER"):
                if r.to_member_id == person_id:
                    parent_ids.append(r.from_member_id)
                elif r.from_member_id == person_id:
                    cid = r.to_member_id
                    ptype = (r.parent_type or "BIOLOGICAL").upper().strip()
                    if cid not in child_type_map:
                        child_type_map[cid] = ptype
                    elif ptype == "BIOLOGICAL":
                        child_type_map[cid] = "BIOLOGICAL"
                    elif child_type_map[cid] not in ("BIOLOGICAL", "ADOPTIVE") and ptype == "ADOPTIVE":
                        child_type_map[cid] = "ADOPTIVE"
            elif rtype in ("SPOUSE", "MARRIAGE"):
                other_id = r.to_member_id if r.from_member_id == person_id else r.from_member_id
                spouse_ids.append(other_id)

        # Khử trùng lặp ID bảo đảm số lượng con cái và nhân thân là duy nhất (Unique Persons)
        parent_ids = list(dict.fromkeys(parent_ids))
        child_ids = list(child_type_map.keys())
        spouse_ids = list(dict.fromkeys(spouse_ids))

        all_related_ids = list(set(parent_ids + child_ids + spouse_ids))
        persons_map: Dict[uuid.UUID, Person] = {}
        if all_related_ids:
            p_stmt = select(Person).where(
                Person.family_id == clan_id,
                Person.id.in_(all_related_ids),
            )
            for p in (await db.execute(p_stmt)).scalars().all():
                persons_map[p.id] = p

        parents = [persons_map[pid] for pid in parent_ids if pid in persons_map]
        spouses = [persons_map[sid] for sid in spouse_ids if sid in persons_map]
        children = [persons_map[cid] for cid in child_ids if cid in persons_map]

        children.sort(key=lambda c: (c.birth_date or date.min, c.full_name))

        # Phân loại con ruột, con nuôi, con kế
        biological_children = [c for c in children if child_type_map.get(c.id) == "BIOLOGICAL"]
        adoptive_children = [c for c in children if child_type_map.get(c.id) == "ADOPTIVE"]
        step_children = [c for c in children if child_type_map.get(c.id) == "STEP"]
        other_children = [c for c in children if child_type_map.get(c.id) not in ("BIOLOGICAL", "ADOPTIVE", "STEP")]

        summary_parts = []
        if biological_children:
            summary_parts.append(f"{len(biological_children)} con ruột ({', '.join([c.full_name for c in biological_children])})")
        if adoptive_children:
            summary_parts.append(f"{len(adoptive_children)} con nuôi ({', '.join([c.full_name for c in adoptive_children])})")
        if step_children:
            summary_parts.append(f"{len(step_children)} con kế ({', '.join([c.full_name for c in step_children])})")
        if other_children:
            summary_parts.append(f"{len(other_children)} con ({', '.join([c.full_name for c in other_children])})")

        if not summary_parts:
            children_summary_text = "Không có thông tin con cái trong gia phả"
        else:
            children_summary_text = f"{len(children)} người con duy nhất (gồm: " + "; ".join(summary_parts) + ")"

        # Tìm anh chị em ruột (cùng cha hoặc mẹ)
        siblings: List[Person] = []
        if parent_ids:
            sib_rel_stmt = select(Relationship.to_member_id).where(
                Relationship.family_id == clan_id,
                Relationship.relationship_type.in_(["PARENT_CHILD", "PARENT", "FATHER", "MOTHER"]),
                Relationship.from_member_id.in_(parent_ids),
                Relationship.to_member_id != person_id,
            )
            sib_ids = list(set((await db.execute(sib_rel_stmt)).scalars().all()))
            if sib_ids:
                sib_stmt = select(Person).where(
                    Person.family_id == clan_id,
                    Person.id.in_(sib_ids),
                ).order_by(Person.birth_date, Person.full_name)
                siblings = list((await db.execute(sib_stmt)).scalars().all())

        return {
            "person": person,
            "parents": parents,
            "spouses": spouses,
            "children": children,
            "siblings": siblings,
            "unique_children_count": len(children),
            "biological_children": biological_children,
            "adoptive_children": adoptive_children,
            "step_children": step_children,
            "children_summary_text": children_summary_text,
        }

    @staticmethod
    async def get_person_generation_and_children(
        db: AsyncSession,
        clan_id: uuid.UUID,
        person_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Truy vấn chính xác thế hệ và tổng hợp số lượng con cái duy nhất của Person.
        Đảm bảo:
        - 3 quan hệ cha–con trùng lặp cho cùng một người con chỉ tính là một người con duy nhất.
        - Phân biệt rõ ràng giữa con ruột (BIOLOGICAL) và con nuôi (ADOPTIVE).
        """
        person = await GenealogyTools.get_person_by_id(db, clan_id, person_id)
        if not person:
            return {
                "person": None,
                "generation": None,
                "unique_children_count": 0,
                "children": [],
                "biological_count": 0,
                "adoptive_count": 0,
                "step_count": 0,
                "children_summary_text": "Không tìm thấy thông tin thành viên.",
            }

        rel_stmt = select(Relationship).where(
            Relationship.family_id == clan_id,
            func.upper(Relationship.relationship_type).in_(["PARENT_CHILD", "PARENT", "FATHER", "MOTHER"]),
            Relationship.from_member_id == person_id,
        )
        child_rels = list((await db.execute(rel_stmt)).scalars().all())

        # Thu thập parent_type cho từng to_member_id duy nhất
        child_type_map: Dict[uuid.UUID, str] = {}
        for r in child_rels:
            cid = r.to_member_id
            ptype = (r.parent_type or "BIOLOGICAL").upper().strip()
            if cid not in child_type_map:
                child_type_map[cid] = ptype
            elif ptype == "BIOLOGICAL":
                child_type_map[cid] = "BIOLOGICAL"
            elif child_type_map[cid] not in ("BIOLOGICAL", "ADOPTIVE") and ptype == "ADOPTIVE":
                child_type_map[cid] = "ADOPTIVE"

        unique_child_ids = list(child_type_map.keys())
        children: List[Person] = []
        if unique_child_ids:
            p_stmt = select(Person).where(
                Person.family_id == clan_id,
                Person.id.in_(unique_child_ids),
            ).order_by(Person.birth_date, Person.full_name)
            children = list((await db.execute(p_stmt)).scalars().all())

        bio_children = [c for c in children if child_type_map.get(c.id) == "BIOLOGICAL"]
        adopt_children = [c for c in children if child_type_map.get(c.id) == "ADOPTIVE"]
        step_children = [c for c in children if child_type_map.get(c.id) == "STEP"]
        other_children = [c for c in children if child_type_map.get(c.id) not in ("BIOLOGICAL", "ADOPTIVE", "STEP")]

        items = []
        if bio_children:
            items.append(f"{len(bio_children)} con ruột: {', '.join([c.full_name for c in bio_children])}")
        if adopt_children:
            items.append(f"{len(adopt_children)} con nuôi: {', '.join([c.full_name for c in adopt_children])}")
        if step_children:
            items.append(f"{len(step_children)} con kế: {', '.join([c.full_name for c in step_children])}")
        if other_children:
            items.append(f"{len(other_children)} con: {', '.join([c.full_name for c in other_children])}")

        if not items:
            summary = "Không có thông tin con cái trong gia phả"
        else:
            summary = f"{len(children)} người con duy nhất (" + "; ".join(items) + ")"

        return {
            "person": person,
            "generation": person.generation or 1,
            "unique_children_count": len(children),
            "children": children,
            "biological_count": len(bio_children),
            "biological_children": bio_children,
            "adoptive_count": len(adopt_children),
            "adoptive_children": adopt_children,
            "step_count": len(step_children),
            "step_children": step_children,
            "children_summary_text": summary,
        }

    @staticmethod
    async def get_progenitor(
        db: AsyncSession,
        clan_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Truy vấn Cụ Thủy Tổ (Đời 1 / Thế hệ nhỏ nhất) của dòng họ."""
        # 1. Tìm thế hệ nhỏ nhất
        min_gen_stmt = select(func.min(Person.generation)).where(Person.family_id == clan_id)
        min_gen = (await db.execute(min_gen_stmt)).scalar() or 1

        # 2. Tìm người nam ở thế hệ nhỏ nhất làm thủy tổ chính
        root_stmt = (
            select(Person)
            .where(
                Person.family_id == clan_id,
                Person.generation == min_gen,
            )
            .order_by(Person.gender.desc(), Person.birth_date)
            .limit(5)
        )
        roots = list((await db.execute(root_stmt)).scalars().all())
        if not roots:
            return {"progenitor": None, "spouse": None, "generation": min_gen}

        # Ưu tiên nam giới
        progenitor = next((p for p in roots if (p.gender or "").upper() == "MALE"), roots[0])

        # Tìm người phối ngẫu (Vợ thủy tổ)
        spouse: Optional[Person] = None
        spouse_rel_stmt = select(Relationship).where(
            Relationship.family_id == clan_id,
            Relationship.relationship_type == "SPOUSE",
            or_(
                Relationship.from_member_id == progenitor.id,
                Relationship.to_member_id == progenitor.id,
            ),
        )
        s_rel = (await db.execute(spouse_rel_stmt)).scalar_one_or_none()
        if s_rel:
            other_id = s_rel.to_member_id if s_rel.from_member_id == progenitor.id else s_rel.from_member_id
            spouse_stmt = select(Person).where(Person.family_id == clan_id, Person.id == other_id)
            spouse = (await db.execute(spouse_stmt)).scalar_one_or_none()

        return {
            "progenitor": progenitor,
            "spouse": spouse,
            "generation": min_gen,
        }

    @staticmethod
    async def get_clan_statistics(
        db: AsyncSession,
        clan_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Thống kê tổng quan số lượng thành viên, thế hệ, giới tính trong dòng họ."""
        persons_stmt = select(Person).where(Person.family_id == clan_id)
        persons = list((await db.execute(persons_stmt)).scalars().all())

        total = len(persons)
        if total == 0:
            return {
                "total_members": 0,
                "max_generation": 0,
                "male_count": 0,
                "female_count": 0,
                "living_count": 0,
                "deceased_count": 0,
                "generations_breakdown": {},
            }

        gens: Set[int] = set()
        male_count = 0
        female_count = 0
        living_count = 0
        deceased_count = 0
        gen_counts: Dict[int, int] = {}

        for p in persons:
            g = p.generation or 1
            gens.add(g)
            gen_counts[g] = gen_counts.get(g, 0) + 1

            gender = (p.gender or "MALE").upper()
            if gender == "MALE":
                male_count += 1
            elif gender == "FEMALE":
                female_count += 1

            is_living = bool(p.is_alive is not False and p.death_date is None)
            if is_living:
                living_count += 1
            else:
                deceased_count += 1

        return {
            "total_members": total,
            "max_generation": max(gens) if gens else 1,
            "male_count": male_count,
            "female_count": female_count,
            "living_count": living_count,
            "deceased_count": deceased_count,
            "generations_breakdown": dict(sorted(gen_counts.items())),
        }

    @staticmethod
    async def get_generation_persons(
        db: AsyncSession,
        clan_id: uuid.UUID,
        generation_no: int,
    ) -> List[Person]:
        """Lấy danh sách thành viên thuộc một thế hệ nhất định."""
        stmt = (
            select(Person)
            .where(
                Person.family_id == clan_id,
                Person.generation == generation_no,
            )
            .order_by(Person.birth_date, Person.full_name)
        )
        return list((await db.execute(stmt)).scalars().all())

    @staticmethod
    async def find_relationship_between(
        db: AsyncSession,
        clan_id: uuid.UUID,
        person_a_id: uuid.UUID,
        person_b_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Xác định mối quan hệ thân tộc và cách xưng hô giữa hai Person trong cùng dòng họ."""
        p_a = await GenealogyTools.get_person_by_id(db, clan_id, person_a_id)
        p_b = await GenealogyTools.get_person_by_id(db, clan_id, person_b_id)

        if not p_a or not p_b:
            return {"found": False, "description": "Không tìm thấy hồ sơ thành viên tương ứng."}

        if person_a_id == person_b_id:
            return {"found": True, "description": "Cùng một người."}

        # 1. Kiểm tra trực tiếp Vợ - Chồng
        sp_stmt = select(Relationship).where(
            Relationship.family_id == clan_id,
            Relationship.relationship_type == "SPOUSE",
            or_(
                (Relationship.from_member_id == person_a_id) & (Relationship.to_member_id == person_b_id),
                (Relationship.from_member_id == person_b_id) & (Relationship.to_member_id == person_a_id),
            ),
        )
        if (await db.execute(sp_stmt)).scalar_one_or_none():
            is_a_male = (p_a.gender or "MALE").upper() == "MALE"
            return {
                "found": True,
                "relationship_type": "SPOUSE",
                "description": f"{p_a.full_name} là {'chồng' if is_a_male else 'vợ'} của {p_b.full_name}.",
            }

        # 2. Kiểm tra trực tiếp Cha/Mẹ - Con
        pc_stmt = select(Relationship).where(
            Relationship.family_id == clan_id,
            Relationship.relationship_type == "PARENT_CHILD",
            or_(
                (Relationship.from_member_id == person_a_id) & (Relationship.to_member_id == person_b_id),
                (Relationship.from_member_id == person_b_id) & (Relationship.to_member_id == person_a_id),
            ),
        )
        pc_rel = (await db.execute(pc_stmt)).scalar_one_or_none()
        if pc_rel:
            if pc_rel.from_member_id == person_a_id:
                role = "cha" if (p_a.gender or "MALE").upper() == "MALE" else "mẹ"
                return {
                    "found": True,
                    "relationship_type": "PARENT_CHILD",
                    "description": f"{p_a.full_name} là {role} của {p_b.full_name}.",
                }
            else:
                role = "con trai" if (p_a.gender or "MALE").upper() == "MALE" else "con gái"
                return {
                    "found": True,
                    "relationship_type": "CHILD_PARENT",
                    "description": f"{p_a.full_name} là {role} của {p_b.full_name}.",
                }

        # 3. Kiểm tra Anh/Chị/Em ruột (cùng cha hoặc mẹ)
        fam_a = await GenealogyTools.get_person_family(db, clan_id, person_a_id)
        if any(p.id == person_b_id for p in fam_a["siblings"]):
            is_older = (p_a.birth_date or date.max) < (p_b.birth_date or date.max)
            gender_a = (p_a.gender or "MALE").upper()
            if is_older:
                role = "anh trai" if gender_a == "MALE" else "chị gái"
            else:
                role = "em trai" if gender_a == "MALE" else "em gái"
            return {
                "found": True,
                "relationship_type": "SIBLINGS",
                "description": f"{p_a.full_name} là {role} của {p_b.full_name}.",
            }

        # 4. Kiểm tra Ông/Bà - Cháu (khoảng cách thế hệ = 2)
        gen_diff = (p_a.generation or 1) - (p_b.generation or 1)
        if gen_diff == -2:
            role = "ông" if (p_a.gender or "MALE").upper() == "MALE" else "bà"
            return {
                "found": True,
                "relationship_type": "GRANDPARENT",
                "description": f"{p_a.full_name} thuộc hàng {role} của {p_b.full_name} (chênh lệch 2 thế hệ).",
            }
        elif gen_diff == 2:
            return {
                "found": True,
                "relationship_type": "GRANDCHILD",
                "description": f"{p_a.full_name} thuộc hàng cháu của {p_b.full_name} (chênh lệch 2 thế hệ).",
            }

        # 5. So sánh thế hệ tương đối
        if gen_diff == 0:
            return {
                "found": True,
                "relationship_type": "SAME_GENERATION",
                "description": f"{p_a.full_name} và {p_b.full_name} cùng thuộc đời thứ {p_a.generation or 1} trong gia tộc.",
            }
        elif gen_diff < 0:
            return {
                "found": True,
                "relationship_type": "OLDER_GENERATION",
                "description": f"{p_a.full_name} (Đời {p_a.generation}) thuộc bậc trên so với {p_b.full_name} (Đời {p_b.generation}).",
            }
        else:
            return {
                "found": True,
                "relationship_type": "YOUNGER_GENERATION",
                "description": f"{p_a.full_name} (Đời {p_a.generation}) thuộc bậc con cháu so với {p_b.full_name} (Đời {p_b.generation}).",
            }

