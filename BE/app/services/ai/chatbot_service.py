"""Hybrid AI Chatbot Service for MFGMS-AI (Phase 3).

Integrates Gemini 3.5 Flash Lite with PostgreSQL Neon DB genealogy data.
Implements:
1. Natural language understanding without hardcoded templates.
2. 4 question types: Genealogy, General knowledge, Multi-turn follow-up, Ambiguity/homonyms.
3. Multi-turn session memory safely bound to (user_id, clan_id).
4. Controlled queries via GenealogyTools; no raw SQL execution.
5. Strict privacy filtering via AIContextFilterService.
6. Error handling for Gemini 429/503/timeout.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family.entities import PersonAccountLink

from app.models.ai.entities import ClanAISetting
from app.models.genealogy.entities import Person
from app.services.ai.context_filter import ai_context_filter
from app.services.ai.gemini_service import gemini_service
from app.services.ai.genealogy_tools import GenealogyTools, clean_name_query

logger = logging.getLogger("mfg.ai.chatbot")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def sanitize_ai_response(text: str) -> str:
    """Loại bỏ các định dạng dấu sao lộn xộn từ markdown (* **, * *) và làm sạch văn bản."""
    if not text:
        return ""
    lines = []
    for line in text.split("\n"):
        l = line.strip()
        # Chuyển '* **Tiêu đề:**' thành 'Tiêu đề:'
        l = re.sub(r"^[*\-]\s*\*\*(.*?)\*\*", r"\1", l)
        # Chuyển '**Tiêu đề:**' thành 'Tiêu đề:'
        l = re.sub(r"^\*\*(.*?)\*\*", r"\1", l)
        # Chuyển '* ' thành '- '
        l = re.sub(r"^\*\s+", r"- ", l)
        # Xóa các dấu sao lặp lại
        l = re.sub(r"\*{2,}", "", l)
        lines.append(l)
    return "\n".join(lines).strip()


@dataclass
class ConversationSession:
    conversation_id: str
    user_id: uuid.UUID
    clan_id: uuid.UUID
    current_person_id: Optional[uuid.UUID] = None
    current_person_name: Optional[str] = None
    history: List[Dict[str, str]] = field(default_factory=list)
    created_at: datetime = field(default_factory=_utc_now)
    last_activity: datetime = field(default_factory=_utc_now)


class ChatbotService:
    """Điều phối toàn diện luồng xử lý câu hỏi Hybrid AI Chatbot."""

    def __init__(self) -> None:
        # Bộ nhớ phiên hội thoại nhiều lượt: conversation_id -> ConversationSession
        self._sessions: Dict[str, ConversationSession] = {}

    def get_or_create_session(
        self,
        conversation_id: Optional[str],
        user_id: uuid.UUID,
        clan_id: uuid.UUID,
    ) -> ConversationSession:
        """Lấy hoặc tạo phiên hội thoại mới, xác thực chặt chẽ quyền sở hữu của user và clan."""
        cid = conversation_id.strip() if conversation_id and conversation_id.strip() else str(uuid.uuid4())

        if cid in self._sessions:
            sess = self._sessions[cid]
            # Bắt buộc kiểm tra tenant và user isolation trên từng lượt chat
            if sess.user_id != user_id or sess.clan_id != clan_id:
                raise PermissionError("Phiên hội thoại này không thuộc về tài khoản hoặc dòng họ hiện tại.")
            sess.last_activity = _utc_now()
            return sess

        sess = ConversationSession(
            conversation_id=cid,
            user_id=user_id,
            clan_id=clan_id,
        )
        self._sessions[cid] = sess
        return sess

    async def classify_and_extract_intent(
        self,
        user_message: str,
        session: ConversationSession,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Dùng Gemini phân tích ngôn ngữ tự nhiên để xác định ý định và bóc tách thực thể."""
        msg_clean = user_message.strip()

        # Quy tắc heuristic nhanh để nhận diện câu hỏi tổng quan / văn hóa
        general_patterns = [
            r"ý nghĩa (của )?(gia phả|dòng họ|tổ tiên)",
            r"viết (bài )?thơ",
            r"chúc mừng thọ",
            r"chúc thọ",
            r"thờ cúng tổ tiên",
            r"hôm nay tôi (buồn|mệt|vui)",
            r"tâm sự",
            r"truyền thống (gia đình|dòng họ)",
        ]
        for pat in general_patterns:
            if re.search(pat, msg_clean, re.IGNORECASE):
                return {"intent": "GENERAL_KNOWLEDGE", "reason": "cultural_or_casual"}

        # Nhận diện câu hỏi phả hệ về con cái hoặc đời/thế hệ của một cá nhân
        person_child_patterns = [
            r"(bao nhiêu|mấy) (người |đứa )?con",
            r"con cái (của|gồm)",
            r"thuộc (đời|thế hệ) (thứ )?(mấy|\d+)",
            r"thân sinh phụ mẫu",
            r"cha mẹ của",
        ]
        for pat in person_child_patterns:
            if re.search(pat, msg_clean, re.IGNORECASE):
                pname = clean_name_query(msg_clean)
                if pname and len(pname.split()) >= 2:
                    return {
                        "intent": "GENEALOGY",
                        "person_name": pname,
                        "relation_target": "generation_and_children" if "con" in msg_clean.lower() else "details",
                        "is_follow_up": False,
                    }

        # Nhận diện câu hỏi thống kê / số lượng toàn dòng họ (loại trừ câu hỏi về con cái cá nhân)
        stats_patterns = [
            r"(toàn bộ|cả dòng họ|dòng họ|trong tộc).*(bao nhiêu|mấy) (thành viên|người|đời|thế hệ)",
            r"thống kê dòng họ",
            r"có bao nhiêu nam",
            r"có bao nhiêu nữ",
            r"tổng số (người|thành viên)",
        ]
        if not re.search(r"(người con|đứa con|con cái)", msg_clean, re.IGNORECASE):
            for pat in stats_patterns:
                if re.search(pat, msg_clean, re.IGNORECASE):
                    return {"intent": "CLAN_STATISTICS"}

        # Nhận diện câu hỏi Cụ Thủy Tổ / Khởi tổ
        progenitor_patterns = [
            r"(cụ )?thủy tổ",
            r"khởi tổ",
            r"người đầu tiên",
            r"cụ tổ (là ai|tên gì)",
            r"đời thứ (nhất|1)",
        ]
        for pat in progenitor_patterns:
            if re.search(pat, msg_clean, re.IGNORECASE):
                return {"intent": "PROGENITOR"}

        # Prompt cấu trúc để Gemini phân tích sâu sắc các câu nói tự nhiên, phương ngữ, khẩu ngữ
        recent_history = session.history[-4:] if session.history else []
        history_str = "\n".join([f"{h['role']}: {h['text']}" for h in recent_history])
        active_focus = f"Thành viên đang nói tới trước đó: {session.current_person_name} (ID: {session.current_person_id})" if session.current_person_id else "Chưa có thành viên nào làm tâm điểm."

        extraction_prompt = f"""Bạn là bộ phân tích ngôn ngữ tự nhiên cho trợ lý gia phả tiếng Việt.
Hãy phân loại ý định người dùng và trích xuất thực thể.
Hiểu được tiếng Việt đời thường, phương ngữ miền Trung/Nam/Bắc (như 'rứa', 'mấy đứa', 'hắn', 'bác nớ', 'ai rứa'), viết tắt, câu hỏi tiếp nối.

Lịch sử hội thoại gần nhất:
{history_str}
{active_focus}

Câu hỏi hiện tại của người dùng: "{user_message}"

Trả về DUY NHẤT một đối tượng JSON hợp lệ không có giải thích thêm, theo định dạng sau:
{{
  "intent": "GENEALOGY" | "GENERAL_KNOWLEDGE" | "CLAN_STATISTICS" | "PROGENITOR" | "KINSHIP" | "FOLLOW_UP",
  "person_name": "tên người được hỏi (nếu có, không kèm từ xưng hô như ông, bà, bác)",
  "second_person_name": "tên người thứ hai nếu hỏi mối quan hệ giữa 2 người",
  "relation_target": "children" | "parents" | "spouse" | "siblings" | "details" | "bio",
  "is_follow_up": true | false
}}"""

        res = await gemini_service.generate_content_safe(
            prompt=extraction_prompt,
            model=model_name,
            timeout_seconds=15.0,
        )

        if res.get("success") and res.get("response"):
            raw_text = res["response"].strip()
            # Bóc tách JSON từ code block nếu Gemini sinh markdown ```json ... ```
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
            raw_text = re.sub(r"\s*```$", "", raw_text).strip()
            try:
                parsed = json.loads(raw_text)
                if isinstance(parsed, dict) and "intent" in parsed:
                    return parsed
            except Exception:
                logger.warning("Không thể parse JSON từ Gemini intent extraction: %s", raw_text)

        # Fallback: Nếu không parse được JSON, trích xuất thực thể bằng quy tắc cơ bản
        if session.current_person_id and any(w in msg_clean.lower() for w in ["người đó", "ông ấy", "bà ấy", "người này", "con cả", "vợ người đó", "chồng bà ấy"]):
            return {"intent": "FOLLOW_UP", "person_name": session.current_person_name, "is_follow_up": True}

        cleaned_query = clean_name_query(msg_clean)
        return {
            "intent": "GENEALOGY",
            "person_name": cleaned_query,
            "relation_target": "details",
            "is_follow_up": False,
        }

    async def answer_general_knowledge(
        self,
        user_message: str,
        session: ConversationSession,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Trả lời các câu hỏi kiến thức chung, văn hóa, thơ ca mà không truy vấn DB và không lộ PII."""
        system_instruction = (
            "Bạn là Trợ lý AI Gia Phả MFGMS-AI. "
            "Hãy trả lời câu hỏi của người dùng một cách ấm áp, tôn kính, am hiểu sâu sắc về văn hóa gia đình, "
            "đạo hiếu, truyền thống thờ cúng tổ tiên và gia phong của người Việt. "
            "Tuyệt đối không nhắc đến hoặc tự tạo thông tin phả hệ cụ thể của bất kỳ cá nhân nào ngoài đời thực."
        )

        full_prompt = f"{system_instruction}\n\nNgười dùng hỏi: {user_message}\n\nCâu trả lời của bạn (ngắn gọn, xúc tích, chuẩn mực tiếng Việt):"

        res = await gemini_service.generate_content_safe(
            prompt=full_prompt,
            model=model_name,
            timeout_seconds=25.0,
        )

        if not res.get("success"):
            return {
                "answer": res.get("message") or "Hệ thống AI tạm thời quá tải hoặc không thể kết nối. Vui lòng thử lại sau.",
                "sources": [],
                "status": "error",
                "suggested_questions": ["Gia phả có ý nghĩa gì đối với gia đình Việt Nam?", "Viết một lời chúc mừng thọ ông bà."],
                "person_candidates": [],
            }

        answer_text = sanitize_ai_response(res.get("response", ""))

        # Lưu lịch sử
        session.history.append({"role": "user", "text": user_message})
        session.history.append({"role": "model", "text": answer_text})

        return {
            "answer": answer_text,
            "sources": [],
            "status": "success",
            "suggested_questions": [
                "Ý nghĩa của truyền thống thờ cúng tổ tiên?",
                "Cách chuẩn bị một bài văn khấn giỗ tổ ngắn gọn?",
                "Những phong tục tốt đẹp trong ngày họp mặt dòng họ?",
            ],
            "person_candidates": [],
        }

    async def answer_clan_statistics(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        session: ConversationSession,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Trả lời các câu hỏi thống kê quy mô và cơ cấu thế hệ trong dòng họ."""
        stats = await GenealogyTools.get_clan_statistics(db, clan_id)

        stats_summary = (
            f"Tổng số thành viên: {stats['total_members']} người. "
            f"Số thế hệ: {stats['max_generation']} đời. "
            f"Thành viên nam: {stats['male_count']} người, Thành viên nữ: {stats['female_count']} người. "
            f"Số người còn sống: {stats['living_count']} người, Đã khuất: {stats['deceased_count']} người. "
            f"Cơ cấu thế hệ: {', '.join([f'Đời {g}: {c} người' for g, c in stats['generations_breakdown'].items()])}."
        )

        prompt = (
            "Bạn là Trợ lý AI Gia Phả MFGMS-AI. "
            "Dựa trên số liệu thống kê thực tế dưới đây từ cơ sở dữ liệu dòng họ, hãy diễn đạt câu trả lời tiếng Việt "
            "rõ ràng, trang trọng và súc tích:\n"
            f"Số liệu: {stats_summary}\n\n"
            "Quy tắc định dạng: Trình bày câu trả lời rõ ràng, dễ đọc. "
            "Tuyệt đối không dùng các dấu sao như '* **' hay '**'. "
            "Dùng dấu gạch đầu dòng '-' cho từng mục."
        )

        res = await gemini_service.generate_content_safe(
            prompt=prompt,
            model=model_name,
            timeout_seconds=25.0,
        )

        answer_text = sanitize_ai_response(res.get("response", "")) if res.get("success") else stats_summary

        session.history.append({"role": "user", "text": "Thống kê dòng họ"})
        session.history.append({"role": "model", "text": answer_text})

        return {
            "answer": answer_text,
            "sources": [],
            "status": "success",
            "suggested_questions": [
                "Cụ khởi tổ dòng họ là ai?",
                "Thế hệ nào trong dòng họ hiện đông thành viên nhất?",
                "Cho tôi biết danh sách các thành viên ở thế hệ thứ 2?",
            ],
            "person_candidates": [],
        }

    async def answer_progenitor(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        session: ConversationSession,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Trả lời về Cụ Thủy Tổ (Đời 1) và nguồn gốc dòng họ."""
        prog_data = await GenealogyTools.get_progenitor(db, clan_id)
        progenitor = prog_data.get("progenitor")
        spouse = prog_data.get("spouse")

        if not progenitor:
            return {
                "answer": "Hệ thống gia phả hiện chưa ghi nhận thông tin cụ thủy tổ thế hệ đầu tiên của dòng họ này.",
                "sources": [],
                "status": "success",
                "suggested_questions": ["Thống kê số lượng thành viên trong dòng họ?"],
                "person_candidates": [],
            }

        # Lọc dữ liệu qua AIContextFilterService
        candidate_persons = [progenitor]
        if spouse:
            candidate_persons.append(spouse)

        filter_res = await ai_context_filter.filter_persons_context(
            db=db,
            clan_id=clan_id,
            purpose="general_history",
            candidate_persons=candidate_persons,
        )

        context_text = filter_res.sanitized_context_text

        prompt = (
            "Bạn là Trợ lý AI Gia Phả MFGMS-AI. "
            "Dựa trên dữ liệu gia phả đã được xác thực sau đây, hãy giới thiệu về Cụ Thủy Tổ dòng họ với giọng điệu tôn kính, tự hào:\n"
            f"Dữ liệu: {context_text}\n\n"
            "Tuyệt đối không sáng tác thêm thông tin không có trong dữ liệu."
        )

        res = await gemini_service.generate_content_safe(
            prompt=prompt,
            model=model_name,
            timeout_seconds=25.0,
        )

        answer_text = sanitize_ai_response(res.get("response", "")) if res.get("success") else context_text

        session.current_person_id = progenitor.id
        session.current_person_name = progenitor.full_name
        session.history.append({"role": "user", "text": "Hỏi về cụ thủy tổ"})
        session.history.append({"role": "model", "text": answer_text})

        sources = [
            {"person_id": str(p.person_id), "full_name": p.display_label, "role": "Thủy tổ"}
            for p in filter_res.filtered_persons if p.consent_granted
        ]

        return {
            "answer": answer_text,
            "sources": sources,
            "status": "success",
            "suggested_questions": [
                f"Cụ {progenitor.full_name} có bao nhiêu người con?",
                "Những người con ở đời thứ 2 gồm những ai?",
                "Thống kê tổng số thế hệ trong dòng họ?",
            ],
            "person_candidates": [],
        }

    async def answer_genealogy_query(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        user_message: str,
        session: ConversationSession,
        extracted: Dict[str, Any],
        selected_person_id: Optional[uuid.UUID] = None,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Truy vấn thực tế dữ liệu gia phả Neon DB, xử lý trùng tên và kiểm tra quyền AI."""
        # 1. Xác định target Person:
        target_person: Optional[Person] = None

        if selected_person_id:
            target_person = await GenealogyTools.get_person_by_id(db, clan_id, selected_person_id)

        if not target_person and extracted.get("is_follow_up") and session.current_person_id:
            target_person = await GenealogyTools.get_person_by_id(db, clan_id, session.current_person_id)

        # 2. Tìm kiếm theo tên nếu chưa có target person
        if not target_person:
            person_name = extracted.get("person_name") or clean_name_query(user_message)
            raw_candidates = await GenealogyTools.search_persons_by_name(db, clan_id, person_name)

            if len(raw_candidates) == 0:
                return {
                    "answer": f"Hệ thống gia phả hiện chưa tìm thấy thành viên có tên '{person_name}' trong dòng họ này. Vui lòng kiểm tra lại họ tên hoặc liên hệ Quản trị viên dòng họ.",
                    "sources": [],
                    "status": "not_found",
                    "suggested_questions": [
                        "Xem danh sách cụ khởi tổ dòng họ?",
                        "Thống kê tổng quan số lượng thành viên dòng họ?",
                    ],
                    "person_candidates": [],
                }

            # LỌC QUYỀN XEM VÀ BẢO VỆ DỮ LIỆU NHẠY CẢM NGƯỜI CÒN SỐNG TRƯỚC KHI TRẢ VỀ person_candidates
            candidate_list = await GenealogyTools.filter_viewable_candidates(
                db=db,
                clan_id=clan_id,
                user_id=session.user_id,
                candidates=raw_candidates,
            )

            if len(candidate_list) == 0:
                return {
                    "answer": f"Hệ thống tìm thấy hồ sơ có tên '{person_name}' nhưng bạn không có quyền xem thông tin do chính sách bảo vệ quyền riêng tư cá nhân người còn sống.",
                    "sources": [],
                    "status": "forbidden",
                    "suggested_questions": [
                        "Xem danh sách cụ khởi tổ dòng họ?",
                        "Thống kê tổng quan số lượng thành viên dòng họ?",
                    ],
                    "person_candidates": [],
                }

            # NẾU CÓ NHIỀU HƠN 1 NGƯỜI TRÙNG TÊN: Trả về danh sách candidates đã được lọc quyền bảo mật
            if len(candidate_list) > 1 and not selected_person_id:
                cand_names = []
                for c in candidate_list:
                    if c.get("is_sensitive_masked"):
                        cand_names.append(f"• {c['full_name']} (Thành viên còn sống, Đời {c['generation']} - Thông tin cá nhân được bảo vệ)")
                    else:
                        details = [f"Đời {c['generation']}"]
                        if c.get("birth_year"):
                            details.append(f"sinh năm {c['birth_year']}")
                        if c.get("death_year"):
                            details.append(f"mất năm {c['death_year']}")
                        cand_names.append(f"• {c['full_name']} ({', '.join(details)})")

                cand_text = "\n".join(cand_names)
                return {
                    "answer": (
                        f"Tìm thấy {len(candidate_list)} thành viên trùng tên '{person_name}' trong dòng họ mà bạn được phép xem. "
                        f"Vui lòng chọn thành viên bạn muốn xem thông tin:\n\n{cand_text}"
                    ),
                    "sources": [],
                    "status": "ambiguous",
                    "suggested_questions": [f"Xem thông tin {c['full_name']} (Đời {c['generation']})" for c in candidate_list[:3]],
                    "person_candidates": candidate_list,
                }

            # Nếu chỉ có 1 ứng viên hợp lệ duy nhất sau khi lọc quyền
            target_cand_id = uuid.UUID(candidate_list[0]["person_id"])
            target_person = await GenealogyTools.get_person_by_id(db, clan_id, target_cand_id)

        # 3. Lấy mạng lưới gia đình của target person
        assert target_person is not None
        session.current_person_id = target_person.id
        session.current_person_name = target_person.full_name

        fam = await GenealogyTools.get_person_family(db, clan_id, target_person.id)
        related_persons: List[Person] = [target_person] + fam["parents"] + fam["spouses"] + fam["children"]

        # 4. Lọc quyền riêng tư qua AIContextFilterService
        filter_res = await ai_context_filter.filter_persons_context(
            db=db,
            clan_id=clan_id,
            purpose="genealogyData",
            candidate_persons=related_persons,
        )

        # Chuẩn bị dữ liệu context cấu trúc sạch sẽ cho Gemini
        allowed_map = {p.person_id: p for p in filter_res.filtered_persons}

        person_res = allowed_map.get(target_person.id)
        person_desc = person_res.display_label if person_res else target_person.full_name

        parents_desc = [allowed_map[p.id].display_label for p in fam["parents"] if p.id in allowed_map]
        spouses_desc = [allowed_map[s.id].display_label for s in fam["spouses"] if s.id in allowed_map]
        children_desc = [allowed_map[c.id].display_label for c in fam["children"] if c.id in allowed_map]
        siblings_desc = [allowed_map[b.id].display_label for b in fam["siblings"] if b.id in allowed_map]

        children_summary = fam.get("children_summary_text") or (f"{len(children_desc)} người: {', '.join(children_desc)}" if children_desc else "Không có thông tin con cái trong gia phả")
        context_lines = [
            f"Nhân vật chính: {person_desc} (Đời thứ {target_person.generation or 1})",
            f"Cha/Mẹ: {', '.join(parents_desc) if parents_desc else 'Chưa có thông tin ghi nhận trong gia phả'}",
            f"Vợ/Chồng: {', '.join(spouses_desc) if spouses_desc else 'Chưa có thông tin ghi nhận trong gia phả'}",
            f"Con cái ({fam.get('unique_children_count', len(children_desc))} người duy nhất): {children_summary}",
            f"Anh chị em ruột: {', '.join(siblings_desc) if siblings_desc else 'Chưa có thông tin'}",
        ]
        if target_person.bio and person_res and "bio" in person_res.fields_included:
            context_lines.append(f"Tiểu sử: {target_person.bio}")

        context_data_str = "\n".join(context_lines)

        prompt = f"""Bạn là Trợ lý AI Gia Phả MFGMS-AI thông minh và chuẩn xác.
Dựa vào dữ liệu gia phả ĐÃ ĐƯỢC XÁC THỰC sau đây:
---
{context_data_str}
---

Câu hỏi người dùng: "{user_message}"

Quy tắc bắt buộc:
1. Trả lời chính xác câu hỏi dựa hoàn toàn trên dữ liệu trên.
2. Nếu người dùng hỏi về thế hệ/đời và con cái:
   - Nêu rõ số đời (thế hệ) của nhân vật.
   - Nêu chính xác tổng số lượng con duy nhất (tuyệt đối không đếm lặp nếu có quan hệ trùng dữ liệu).
   - Nếu trong dữ liệu có phân biệt rõ con ruột và con nuôi, hãy nêu rõ số lượng và tên của từng nhóm con ruột và con nuôi.
3. Nếu người dùng hỏi cha mẹ, vợ chồng hoặc tiểu sử, hãy trả lời đúng phần đó.
4. Nếu thông tin bị ẩn (ví dụ do chưa có sự đồng ý AI của người còn sống), hãy thông báo lịch sự rằng thông tin của thành viên đã được bảo mật theo quy định quyền riêng tư.
5. Tuyệt đối không tự bịa thêm tên người hoặc quan hệ huyết thống ngoài dữ liệu cung cấp."""

        res = await gemini_service.generate_content_safe(
            prompt=prompt,
            model=model_name,
            timeout_seconds=25.0,
        )

        answer_text = sanitize_ai_response(res.get("response", "")) if res.get("success") else "\n".join(context_lines)

        session.history.append({"role": "user", "text": user_message})
        session.history.append({"role": "model", "text": answer_text})

        # Xây dựng danh sách sources hợp lệ (chỉ người được phép hiển thị)
        sources = [
            {
                "person_id": str(p.person_id),
                "full_name": p.display_label,
                "role": "Thành viên gia phả",
            }
            for p in filter_res.filtered_persons
            if p.consent_granted
        ]

        suggested = []
        if fam["children"]:
            suggested.append(f"Các con của {target_person.full_name} sinh năm nào?")
        if fam["parents"]:
            suggested.append(f"Cha mẹ của {target_person.full_name} là ai?")
        suggested.append(f"Quan hệ họ hàng giữa {target_person.full_name} và các nhánh khác?")

        return {
            "answer": answer_text,
            "sources": sources,
            "status": "success",
            "suggested_questions": suggested,
            "person_candidates": [],
        }

    async def answer_kinship_query(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        user_id: uuid.UUID,
        user_message: str,
        session: ConversationSession,
        extracted: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Xử lý câu hỏi tự nhiên về quan hệ họ hàng & cách xưng hô trong Chatbot (Giai đoạn 4)."""
        from sqlalchemy import select
        from app.models.family.entities import PersonAccountLink
        
        name_1 = extracted.get("person_name")
        name_2 = extracted.get("second_person_name")

        person_a: Optional[Person] = None
        person_b: Optional[Person] = None

        # Nếu người dùng hỏi "X là gì của tôi?" hoặc "Tôi gọi Y là gì?"
        # Tìm Ego Person từ PersonAccountLink
        is_asking_about_me = any(w in user_message.lower() for w in ["của tôi", "với tôi", "tôi gọi", "tôi xưng", "gọi tôi là"])

        if is_asking_about_me:
            link_stmt = select(PersonAccountLink.person_id).where(
                PersonAccountLink.user_id == user_id,
                PersonAccountLink.clan_id == clan_id,
                PersonAccountLink.status == "ACTIVE",
            )
            my_pid = (await db.execute(link_stmt)).scalar_one_or_none()
            if my_pid:
                person_a = await GenealogyTools.get_person_by_id(db, clan_id, my_pid)

            target_name = name_1 or name_2 or clean_name_query(user_message)
            cand_b = await GenealogyTools.search_persons_by_name(db, clan_id, target_name)
            if cand_b:
                person_b = cand_b[0]

            if not person_a:
                return {
                    "answer": (
                        "Tài khoản của bạn chưa liên kết với một hồ sơ thành viên cụ thể trong gia phả dòng họ. "
                        "Bạn có thể tra cứu mối quan hệ giữa hai người bất kỳ bằng cách hỏi rõ tên cả hai người "
                        "(ví dụ: 'Mai Văn Sơn với Mai Văn Thành có quan hệ gì?')."
                    ),
                    "sources": [],
                    "status": "ego_not_linked",
                    "suggested_questions": [
                        "Cụ khởi tổ của dòng họ là ai?",
                        "Thống kê số lượng thành viên dòng họ?",
                    ],
                    "person_candidates": [],
                }
        else:
            # Tra cứu giữa 2 người cụ thể
            if name_1 and name_2:
                cand_a = await GenealogyTools.search_persons_by_name(db, clan_id, name_1)
                cand_b = await GenealogyTools.search_persons_by_name(db, clan_id, name_2)
                if cand_a:
                    person_a = cand_a[0]
                if cand_b:
                    person_b = cand_b[0]
            elif name_1 and session.current_person_id:
                # Hỏi tiếp nối với người đang thảo luận
                person_a = await GenealogyTools.get_person_by_id(db, clan_id, session.current_person_id)
                cand_b = await GenealogyTools.search_persons_by_name(db, clan_id, name_1)
                if cand_b:
                    person_b = cand_b[0]

        if not person_a or not person_b:
            # Fallback sang tìm kiếm gia phả thông thường nếu chưa đủ thông tin 2 người
            return await self.answer_genealogy_query(
                db=db,
                clan_id=clan_id,
                user_message=user_message,
                session=session,
                extracted=extracted,
                model_name=model_name,
            )

        # Gọi Kinship Explainer Service
        explain_res = await kinship_explainer_service.explain_kinship(
            db=db,
            clan_id=clan_id,
            user_id=user_id,
            person_a_id=person_a.id,
            person_b_id=person_b.id,
        )

        answer_text = explain_res.get("ai_explanation") or (
            f"Theo gia phả: {person_a.full_name} gọi {person_b.full_name} là {explain_res.get('kinship_term')}."
        )

        session.current_person_id = person_b.id
        session.current_person_name = person_b.full_name
        session.history.append({"role": "user", "text": user_message})
        session.history.append({"role": "model", "text": answer_text})

        sources = [
            {"person_id": str(person_a.id), "full_name": person_a.full_name, "role": f"Đời {person_a.generation or 1}"},
            {"person_id": str(person_b.id), "full_name": person_b.full_name, "role": f"Đời {person_b.generation or 1}"},
        ]

        return {
            "answer": answer_text,
            "sources": sources,
            "status": "success",
            "suggested_questions": [
                f"Thông tin chi tiết về {person_b.full_name}?",
                f"Những người con của {person_b.full_name}?",
                "Cách xưng hô giữa các nhánh họ hàng?",
            ],
            "person_candidates": [],
        }

    async def chat(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        user_id: uuid.UUID,
        message: str,
        conversation_id: Optional[str] = None,
        person_id: Optional[uuid.UUID] = None,
    ) -> Dict[str, Any]:
        """Điểm vào xử lý duy nhất cho API Chatbot."""
        msg = message.strip()
        if not msg:
            return {
                "answer": "Vui lòng nhập câu hỏi để Trợ lý AI hỗ trợ bạn.",
                "conversation_id": conversation_id or str(uuid.uuid4()),
                "sources": [],
                "status": "empty_input",
                "suggested_questions": ["Cụ khởi tổ dòng họ là ai?", "Thống kê quy mô thành viên dòng họ?"],
                "person_candidates": [],
            }

        # 1. Khởi tạo / lấy phiên hội thoại
        session = self.get_or_create_session(conversation_id, user_id, clan_id)

        # 2. Lấy cấu hình AI của dòng họ
        from sqlalchemy import select
        setting_stmt = select(ClanAISetting).where(ClanAISetting.clan_id == clan_id)
        clan_setting = (await db.execute(setting_stmt)).scalar_one_or_none()

        is_clan_ai_enabled = bool(clan_setting and clan_setting.ai_enabled)
        model_name = (clan_setting.gemini_model if clan_setting else None) or gemini_service.model_name

        # 3. Phân loại ý định người dùng (Intent Classification)
        extracted = await self.classify_and_extract_intent(msg, session, model_name=model_name)
        intent = extracted.get("intent", "GENEALOGY")

        # 4. Điều phối theo nhóm câu hỏi
        if intent == "GENERAL_KNOWLEDGE":
            # Câu hỏi kiến thức chung: Luôn trả lời được mà không đụng chạm dữ liệu gia phả
            result = await self.answer_general_knowledge(msg, session, model_name=model_name)
        else:
            # Câu hỏi liên quan gia phả: Bắt buộc dòng họ phải bật AI
            if not is_clan_ai_enabled:
                return {
                    "answer": "Dòng họ hiện chưa kích hoạt tính năng Trợ lý AI gia phả. Quý Trưởng tộc có thể vào mục 'Cấu hình AI dòng họ' để bật tính năng này.",
                    "conversation_id": session.conversation_id,
                    "sources": [],
                    "status": "clan_ai_disabled",
                    "suggested_questions": [
                        "Ý nghĩa của việc lập gia phả là gì?",
                        "Viết một bài thơ về gia đình Việt Nam.",
                    ],
                    "person_candidates": [],
                }

            features = (clan_setting.features or {}) if clan_setting else {}
            if not features.get("assistant", True):
                return {
                    "answer": "Tính năng Trợ lý AI hội thoại (assistant) hiện đang tạm tắt theo cấu hình của dòng họ.",
                    "conversation_id": session.conversation_id,
                    "sources": [],
                    "status": "feature_disabled",
                    "suggested_questions": [],
                    "person_candidates": [],
                }

            if intent == "CLAN_STATISTICS":
                result = await self.answer_clan_statistics(db, clan_id, session, model_name=model_name)
            elif intent == "PROGENITOR":
                result = await self.answer_progenitor(db, clan_id, session, model_name=model_name)
            elif intent == "KINSHIP":
                result = await self.answer_kinship_query(
                    db=db,
                    clan_id=clan_id,
                    user_id=user_id,
                    user_message=msg,
                    session=session,
                    extracted=extracted,
                    model_name=model_name,
                )
            else:
                # GENEALOGY hoặc FOLLOW_UP
                result = await self.answer_genealogy_query(
                    db=db,
                    clan_id=clan_id,
                    user_message=msg,
                    session=session,
                    extracted=extracted,
                    selected_person_id=person_id,
                    model_name=model_name,
                )

        result["conversation_id"] = session.conversation_id
        return result


chatbot_service = ChatbotService()

