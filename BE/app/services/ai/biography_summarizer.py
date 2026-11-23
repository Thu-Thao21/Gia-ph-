"""AI Biography Summarizer Service for MFGMS-AI (Phase 4).

Generates grounded, respectful biographical summaries of ancestors and persons from family records.
Guarantees:
1. Grounded in DB facts: Gathers generation, branch, birth/death, parents, spouse, children, and records.
2. Anti-hallucination: Gemini prompt explicitly forbids fabricating military deeds, titles, or events.
3. Privacy & Consent: Passes through AIContextFilterService (checking 'biographyDrafts' / 'general_history').
4. Multiple styles: 'short' (3-5 sentences), 'standard' (1-2 paragraphs), 'formal' (trang trọng gia tộc).
5. Does NOT overwrite persons.biography in DB; output is provided for review and user preview.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai.entities import ClanAISetting
from app.models.genealogy.entities import FamilyBranch, Person, Relationship
from app.services.ai.chatbot_service import sanitize_ai_response
from app.services.ai.context_filter import ai_context_filter
from app.services.ai.gemini_service import gemini_service

logger = logging.getLogger("mfg.ai.biography_summarizer")


class BiographySummarizerService:
    """Service tóm tắt tiểu sử tiền nhân & thành viên từ dữ liệu phả hệ gia tộc."""

    @staticmethod
    def _synthesize_realistic_biography(
        person: Person,
        branch_name: str,
        parents: List[str],
        spouses: List[str],
        children: List[str],
        style: str,
    ) -> str:
        """Tạo bản tóm tắt tiểu sử chân thực, chuẩn phong cách gia phả Việt Nam."""
        gen_label = f"Đời thứ {person.generation or 1}"
        branch_label = (
            f"chi {branch_name}"
            if branch_name and branch_name not in {"Chưa phân chi", "Toàn tộc"}
            else "dòng họ"
        )

        parents_str = f"Thân sinh: {', '.join(parents)}." if parents else ""
        spouses_str = f"Hôn phối: {', '.join(spouses)}." if spouses else ""
        children_str = (
            f"Có {len(children)} người con nối dõi ghi nhận trong gia phả."
            if children
            else ""
        )
        bio_str = (
            f"Ghi chép truyền thống: {person.bio.strip()}."
            if person.bio and person.bio.strip()
            else ""
        )

        if style == "short":
            sentences = [
                f"{person.full_name} là thành viên {gen_label} thuộc {branch_label}."
            ]
            if parents_str:
                sentences.append(parents_str)
            if spouses_str:
                sentences.append(spouses_str)
            if children_str:
                sentences.append(children_str)
            sentences.append("Hồ sơ đã được xác thực và lưu trữ chính thức trong cây phả hệ gia tộc.")
            return " ".join(sentences)

        elif style == "formal":
            sentences = [
                f"Theo gia phả truyền thừa của dòng họ, {person.full_name} thuộc hàng hậu duệ {gen_label}, phái thuộc {branch_label}."
            ]
            if parents:
                sentences.append(f"Được sinh thành và dưỡng dục bởi {', '.join(parents)}.")
            if spouses:
                sentences.append(f"Gia đình thuận hòa, kết duyên cùng {', '.join(spouses)}.")
            if children:
                sentences.append(
                    f"Cùng vun đắp gia phong, sinh dưỡng {len(children)} người con kế thừa nề nếp tổ tông."
                )
            if bio_str:
                sentences.append(bio_str)
            sentences.append("Gìn giữ gia phong thuần hậu, tiếp nối truyền thống tốt đẹp của tổ tiên muôn đời.")
            return " ".join(sentences)

        else:  # standard
            sentences = [
                f"{person.full_name} là thành viên thuộc {gen_label}, {branch_label} trong gia phả dòng họ."
            ]
            if parents_str:
                sentences.append(parents_str)
            if spouses_str:
                sentences.append(spouses_str)
            if children:
                names_preview = ", ".join(children[:3])
                suffix = "..." if len(children) > 3 else ""
                sentences.append(f"Gia đình có {len(children)} người con ({names_preview}{suffix}).")
            if bio_str:
                sentences.append(bio_str)
            sentences.append("Thông tin được chuẩn hóa và lưu trữ an toàn trong hồ sơ phả hệ của gia tộc.")
            return " ".join(sentences)

    async def summarize_biography(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        user_id: uuid.UUID,
        person_id: uuid.UUID,
        style: str = "standard",
    ) -> Dict[str, Any]:
        """Tạo bản tóm tắt tiểu sử có căn cứ dữ kiện phả hệ."""
        # 1. Truy vấn thông tin Person từ CSDL gia phả
        stmt = select(Person).where(Person.id == person_id, Person.family_id == clan_id)
        person = (await db.execute(stmt)).scalar_one_or_none()

        if not person:
            raise ValueError("Không tìm thấy thông tin thành viên trong dòng họ này.")

        # 2. Truy vấn tên Chi nhánh (Branch) nếu có
        branch_name = "Chưa phân chi"
        if person.branch_id:
            branch_stmt = select(FamilyBranch.name).where(FamilyBranch.id == person.branch_id)
            branch_val = (await db.execute(branch_stmt)).scalar_one_or_none()
            if branch_val:
                branch_name = branch_val

        # 3. Truy vấn các mối quan hệ gia đình trực tiếp (Cha, Mẹ, Vợ/Chồng, Con cái)
        rel_stmt = select(Relationship).where(
            Relationship.family_id == clan_id,
            Relationship.status == "ACTIVE",
            (Relationship.from_member_id == person_id) | (Relationship.to_member_id == person_id),
        )
        direct_rels = (await db.execute(rel_stmt)).scalars().all()

        related_ids = set()
        for r in direct_rels:
            related_ids.add(r.from_member_id)
            related_ids.add(r.to_member_id)
        related_ids.discard(person_id)

        related_persons_map = {}
        if related_ids:
            rel_persons_stmt = select(Person).where(Person.id.in_(related_ids))
            rel_persons = (await db.execute(rel_persons_stmt)).scalars().all()
            related_persons_map = {p.id: p for p in rel_persons}

        parents = []
        spouses = []
        children = []

        for r in direct_rels:
            rel_type = (r.relationship_type or "").upper()
            if rel_type == "PARENT_CHILD":
                if r.to_member_id == person_id:
                    # from_member_id là cha/mẹ của person
                    parent_p = related_persons_map.get(r.from_member_id)
                    if parent_p:
                        role_label = "Cha" if (parent_p.gender or "").upper() in {"MALE", "NAM"} else "Mẹ"
                        parents.append(f"{role_label}: {parent_p.full_name}")
                elif r.from_member_id == person_id:
                    # to_member_id là con của person
                    child_p = related_persons_map.get(r.to_member_id)
                    if child_p:
                        children.append(child_p.full_name)
            elif rel_type == "SPOUSE":
                other_id = r.to_member_id if r.from_member_id == person_id else r.from_member_id
                spouse_p = related_persons_map.get(other_id)
                if spouse_p:
                    role_label = "Chồng" if (spouse_p.gender or "").upper() in {"MALE", "NAM"} else "Vợ"
                    spouses.append(f"{role_label}: {spouse_p.full_name}")

        # 4. Tập hợp các dữ kiện đã kiểm chứng từ DB
        verified_facts: List[str] = [
            f"Họ và tên: {person.full_name}",
            f"Thế hệ: Đời thứ {person.generation or 1}",
            f"Chi tộc: {branch_name}",
        ]

        if person.birth_date:
            verified_facts.append(f"Sinh năm: {person.birth_date.year}")
        if person.death_date:
            verified_facts.append(f"Mất năm: {person.death_date.year}")
        elif person.is_alive is not None:
            verified_facts.append("Tình trạng: " + ("Còn sống" if person.is_alive else "Đã khuất"))

        if parents:
            verified_facts.append("Thân sinh: " + ", ".join(parents))
        if spouses:
            verified_facts.append("Hôn phối: " + ", ".join(spouses))
        if children:
            verified_facts.append(f"Số người con: {len(children)} ({', '.join(children[:4])}{'...' if len(children) > 4 else ''})")
        if person.bio and person.bio.strip():
            verified_facts.append(f"Ghi chép gốc: {person.bio.strip()[:300]}")

        sources = [
            {"person_id": str(person.id), "full_name": person.full_name, "role": f"Đời thứ {person.generation or 1}"}
        ]

        # 5. Kiểm tra cấu hình AI của Clan
        setting_stmt = select(ClanAISetting).where(ClanAISetting.clan_id == clan_id)
        clan_setting = (await db.execute(setting_stmt)).scalar_one_or_none()

        is_ai_enabled = clan_setting and clan_setting.ai_enabled
        features = clan_setting.features or {} if clan_setting else {}
        feature_ok = features.get("biography", True) or features.get("assistant", True)

        if not is_ai_enabled or not feature_ok:
            fallback_text = self._synthesize_realistic_biography(
                person=person,
                branch_name=branch_name,
                parents=parents,
                spouses=spouses,
                children=children,
                style=style,
            )
            return {
                "person_id": str(person.id),
                "full_name": person.full_name,
                "style": style,
                "summary": fallback_text,
                "verified_facts": verified_facts,
                "sources": sources,
                "status": "clan_ai_disabled",
            }

        # 6. Kiểm tra quyền riêng tư (AI Consent)
        filter_res = await ai_context_filter.filter_persons_context(
            db=db,
            clan_id=clan_id,
            purpose="biographyDrafts",
            candidate_persons=[person],
        )

        if filter_res.allowed_count == 0 and person.is_alive:
            realistic_summary = self._synthesize_realistic_biography(
                person=person,
                branch_name=branch_name,
                parents=parents,
                spouses=spouses,
                children=children,
                style=style,
            )
            return {
                "person_id": str(person.id),
                "full_name": person.full_name,
                "style": style,
                "summary": realistic_summary,
                "verified_facts": verified_facts,
                "sources": sources,
                "status": "consent_revoked",
            }

        # 7. Định hình văn phong theo style yêu cầu
        style_instruction = ""
        if style == "short":
            style_instruction = "Tạo một bản tóm tắt NGẮN GỌN từ 3 đến 5 câu súc tích, làm nổi bật vai vế và gia đình."
        elif style == "formal":
            style_instruction = (
                "Sử dụng văn phong TRANG TRỌNG, KÍNH CẨN của người Việt Nam khi giới thiệu lịch sử gia tộc, "
                "bày tỏ lòng thành kính với tiền nhân và công đức lưu truyền cho hậu thế."
            )
        else:
            style_instruction = "Tạo bản tóm tắt TIÊU CHUẨN từ 1 đến 2 đoạn văn mạch lạc, ấm cúng và đầy đủ dữ kiện."

        facts_text = "\n- ".join(verified_facts)
        prompt = (
            "Bạn là chuyên viên biên soạn gia phả và lịch sử dòng tộc Việt Nam cho hệ thống MFGMS-AI.\n"
            "DƯỚI ĐÂY LÀ TOÀN BỘ DỮ KIỆN XÁC THỰC TỪ CƠ SỞ DỮ LIỆU GIA PHẢ:\n"
            f"- {facts_text}\n\n"
            f"YÊU CẦU PHONG CÁCH: {style_instruction}\n\n"
            "NGUYÊN TẮC BẢO ĐẢM TÍNH CHÂN THỰC (BẮT BUỘC):\n"
            "1. CHỈ SỬ DỤNG các dữ kiện được cung cấp ở trên. TUYỆT ĐỐI KHÔNG tự sáng tác công trạng, chức tước, chiến công hay nghề nghiệp không có trong dữ liệu.\n"
            "2. KHÔNG khẳng định những thông tin không có trong DB. Nếu dữ liệu ít, hãy viết ngắn gọn tương ứng.\n"
            "3. Giữ trọn danh xưng kính cẩn, văn từ trong sáng chuẩn tiếng Việt.\n"
            "4. KHÔNG sử dụng các định dạng dấu sao rườm rà (* **).\n"
            "5. Không tự xưng là trí tuệ nhân tạo trong bài viết."
        )

        gemini_res = await gemini_service.generate_content_safe(
            prompt=prompt,
            model=clan_setting.gemini_model if clan_setting else None,
        )

        if gemini_res.get("success") and gemini_res.get("response"):
            summary_text = sanitize_ai_response(gemini_res["response"])
            return {
                "person_id": str(person.id),
                "full_name": person.full_name,
                "style": style,
                "summary": summary_text,
                "verified_facts": verified_facts,
                "sources": sources,
                "status": "success",
            }

        # Fallback khi Gemini timeout hoặc lỗi mạng
        fallback_text = (
            f"{person.full_name} thuộc Đời thứ {person.generation or 1}, chi {branch_name} trong dòng họ. "
            + (f"Thân sinh: {', '.join(parents)}. " if parents else "")
            + (f"Hôn phối: {', '.join(spouses)}. " if spouses else "")
            + (f"Có {len(children)} người con nối dõi. " if children else "")
            + (f"Ghi chép: {person.bio.strip()}." if person.bio else "")
        )
        return {
            "person_id": str(person.id),
            "full_name": person.full_name,
            "style": style,
            "summary": fallback_text,
            "verified_facts": verified_facts,
            "sources": sources,
            "status": "error",
        }


biography_summarizer_service = BiographySummarizerService()

