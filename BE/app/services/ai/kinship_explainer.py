"""AI Kinship Explainer Service for MFGMS-AI (Phase 4).

Combines deterministic graph traversal (RelationshipPathService + KinshipService)
with Gemini AI to explain kinship, generation hierarchies, and Vietnamese forms of address.

Guarantees:
1. Deterministic truth: Grounded in Neon DB Person and Relationship entities.
2. Privacy by Design: Evaluates Clan AI settings and person-level consents before sending data to Gemini.
3. Fallback resilience: If AI is disabled or fails, deterministic results are still returned cleanly.
4. Strict anti-hallucination: Gemini explains strictly the computed path without inventing extra relations.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai.entities import ClanAISetting
from app.models.genealogy.entities import Person, Relationship
from app.services.ai.chatbot_service import sanitize_ai_response
from app.services.ai.context_filter import ai_context_filter
from app.services.ai.gemini_service import gemini_service
from app.services.genealogy.kinship_service import KinshipService
from app.services.genealogy.relationship_path_service import RelationshipPathService

logger = logging.getLogger("mfg.ai.kinship_explainer")


class KinshipExplainerService:
    """Service giải thích quan hệ họ hàng và xưng hô kết hợp thuật toán phả hệ & Gemini."""

    async def explain_kinship(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        user_id: uuid.UUID,
        person_a_id: uuid.UUID,
        person_b_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Tính toán và giải thích chi tiết quan hệ giữa Person A và Person B."""
        # 1. Truy vấn thông tin hai Person trong clan_id
        stmt_a = select(Person).where(Person.id == person_a_id, Person.family_id == clan_id)
        stmt_b = select(Person).where(Person.id == person_b_id, Person.family_id == clan_id)

        person_a = (await db.execute(stmt_a)).scalar_one_or_none()
        person_b = (await db.execute(stmt_b)).scalar_one_or_none()

        if not person_a or not person_b:
            raise ValueError("Không tìm thấy một trong hai thành viên trong dòng họ này.")

        # 2. Xử lý trường hợp đặc biệt: Chọn cùng một người
        if str(person_a_id) == str(person_b_id):
            return {
                "person_a_id": str(person_a.id),
                "person_a_name": person_a.full_name,
                "person_b_id": str(person_b.id),
                "person_b_name": person_b.full_name,
                "found": True,
                "relationship_type": "SELF",
                "kinship_term": "Chính mình",
                "address_title_a_to_b": "Tôi",
                "self_pronoun_a_to_b": "Tôi",
                "address_title_b_to_a": "Tôi",
                "self_pronoun_b_to_a": "Tôi",
                "generation_diff": 0,
                "relationship_path": [
                    {
                        "person_id": str(person_a.id),
                        "full_name": person_a.full_name,
                        "generation": person_a.generation,
                        "gender": person_a.gender,
                        "relation_to_next": None,
                    }
                ],
                "confidence_status": "confirmed",
                "evidence": [],
                "ai_explanation": f"{person_a.full_name} và đối tượng được chọn là cùng một người trong gia phả.",
                "explanation_status": "success",
            }

        # 3. Lấy toàn bộ quan hệ và thành viên của clan để tìm đường đi ngắn nhất
        rel_stmt = select(Relationship).where(
            Relationship.family_id == clan_id,
            Relationship.status == "ACTIVE",
        )
        relationships = (await db.execute(rel_stmt)).scalars().all()

        person_stmt = select(Person).where(
            Person.family_id == clan_id,
            Person.status == "ACTIVE",
        )
        all_persons = (await db.execute(person_stmt)).scalars().all()
        person_map = {str(p.id): p for p in all_persons}

        # 4. Tìm đường đi quan hệ ngắn nhất thông qua BFS
        path_result = RelationshipPathService.find_path(
            start_id=str(person_a_id),
            target_id=str(person_b_id),
            relationships=relationships,
        )

        gen_diff = (person_b.generation or 1) - (person_a.generation or 1)

        # 5. Nếu không tìm thấy đường đi trong dữ liệu
        if not path_result:
            return {
                "person_a_id": str(person_a.id),
                "person_a_name": person_a.full_name,
                "person_b_id": str(person_b.id),
                "person_b_name": person_b.full_name,
                "found": False,
                "relationship_type": "UNKNOWN",
                "kinship_term": "Chưa xác định",
                "address_title_a_to_b": "N/A",
                "self_pronoun_a_to_b": "Tôi",
                "address_title_b_to_a": "N/A",
                "self_pronoun_b_to_a": "Tôi",
                "generation_diff": gen_diff,
                "relationship_path": [],
                "confidence_status": "insufficient_data",
                "evidence": [],
                "ai_explanation": (
                    f"Dữ liệu gia phả hiện tại chưa có thông tin quan hệ trực tiếp hoặc gián đoạn giữa "
                    f"{person_a.full_name} (Đời {person_a.generation or 1}) và "
                    f"{person_b.full_name} (Đời {person_b.generation or 1})."
                ),
                "explanation_status": "no_path",
            }

        path_node_ids, path_edge_objs = path_result
        path_persons = [person_map[pid] for pid in path_node_ids if pid in person_map]

        # 6. Tính toán tên quan hệ và xưng hô chuẩn mực theo luật phả hệ Việt Nam
        kinship_info = KinshipService.calculate_kinship(
            from_person=person_a,
            to_person=person_b,
            path=path_persons,
            edges=path_edge_objs,
        )

        kinship_term = kinship_info.get("kinship_name") or "Họ hàng"
        address_title_a_to_b = kinship_info.get("address_title") or "Chào theo vai vế"
        reciprocal_address = kinship_info.get("reciprocal_address") or "Tôi"
        reciprocal_kinship = kinship_info.get("reciprocal_kinship") or "Họ hàng"

        # Chuẩn bị danh sách node đường đi
        path_nodes: List[Dict[str, Any]] = []
        for idx, p in enumerate(path_persons):
            rel_label = None
            if idx < len(path_edge_objs):
                edge = path_edge_objs[idx]
                rel_type = getattr(edge, "relationship_type", "").upper()
                rel_label = "Cha/Mẹ - Con" if rel_type == "PARENT_CHILD" else "Vợ/Chồng"

            path_nodes.append(
                {
                    "person_id": str(p.id),
                    "full_name": p.full_name,
                    "generation": p.generation,
                    "gender": p.gender,
                    "relation_to_next": rel_label,
                }
            )

        # Bằng chứng phả hệ (Evidence) từ DB
        evidence = [
            {
                "from_person": person_map.get(str(getattr(rel, "from_member_id", None)), None) and person_map[str(getattr(rel, "from_member_id", None))].full_name,
                "to_person": person_map.get(str(getattr(rel, "to_member_id", None)), None) and person_map[str(getattr(rel, "to_member_id", None))].full_name,
                "relationship_type": getattr(rel, "relationship_type", ""),
                "verified": getattr(rel, "verified", True),
            }
            for rel in path_edge_objs
        ]

        # 7. Kiểm tra cấu hình AI của dòng họ
        setting_stmt = select(ClanAISetting).where(ClanAISetting.clan_id == clan_id)
        clan_setting = (await db.execute(setting_stmt)).scalar_one_or_none()

        is_ai_enabled = clan_setting and clan_setting.ai_enabled
        features = clan_setting.features or {} if clan_setting else {}
        feature_ok = features.get("relationship_analysis", True) or features.get("assistant", True)

        # Phân loại relationship_type
        rel_type_code = "COLLATERAL"
        if len(path_persons) == 2:
            first_edge = getattr(path_edge_objs[0], "relationship_type", "").upper() if path_edge_objs else ""
            if first_edge == "SPOUSE":
                rel_type_code = "SPOUSE"
            elif first_edge == "PARENT_CHILD":
                rel_type_code = "DIRECT_LINEAGE"
        elif gen_diff == 0:
            rel_type_code = "SIBLINGS" if len(path_persons) == 3 else "COLLATERAL"

        base_response = {
            "person_a_id": str(person_a.id),
            "person_a_name": person_a.full_name,
            "person_b_id": str(person_b.id),
            "person_b_name": person_b.full_name,
            "found": True,
            "relationship_type": rel_type_code,
            "kinship_term": kinship_term,
            "address_title_a_to_b": address_title_a_to_b,
            "self_pronoun_a_to_b": reciprocal_address,
            "address_title_b_to_a": reciprocal_kinship,
            "self_pronoun_b_to_a": address_title_a_to_b,
            "generation_diff": gen_diff,
            "relationship_path": path_nodes,
            "confidence_status": "confirmed",
            "evidence": evidence,
        }

        if not is_ai_enabled or not feature_ok:
            base_response["ai_explanation"] = (
                f"Theo thuật toán phả hệ: {person_a.full_name} gọi {person_b.full_name} là {kinship_term}. "
                f"(Tính năng giải thích nâng cao bằng AI chưa được bật trong cấu hình dòng họ)."
            )
            base_response["explanation_status"] = "clan_ai_disabled"
            return base_response

        # 8. Kiểm tra quyền riêng tư (AI Consent) cho các Person trong đường đi
        filter_res = await ai_context_filter.filter_persons_context(
            db=db,
            clan_id=clan_id,
            purpose="relationshipAnalysis",
            candidate_persons=path_persons,
        )

        # 9. Soạn thảo prompt kiểm soát chặt chẽ cho Gemini
        path_desc = " -> ".join([f"{p.full_name} (Đời {p.generation or 1})" for p in path_persons])
        system_instruction = (
            "Bạn là chuyên gia về văn hóa gia phả và lễ nghĩa xưng hô truyền thống Việt Nam trong hệ thống MFGMS-AI.\n"
            "DƯỚI ĐÂY LÀ DỮ LIỆU ĐÃ ĐƯỢC XÁC THỰC TỪ CƠ SỞ DỮ LIỆU GIA PHẢ:\n"
            f"- Người hỏi (A): {person_a.full_name} (Đời {person_a.generation or 1}, Giới tính: {person_a.gender or 'Chưa rõ'})\n"
            f"- Đối tượng được tra cứu (B): {person_b.full_name} (Đời {person_b.generation or 1}, Giới tính: {person_b.gender or 'Chưa rõ'})\n"
            f"- Chênh lệch thế hệ: {abs(gen_diff)} đời ({'B ở đời trước A' if gen_diff < 0 else 'B ở đời sau A' if gen_diff > 0 else 'Cùng thế hệ'})\n"
            f"- Tên gọi quan hệ xác thực: {kinship_term}\n"
            f"- Cách A gọi B: {address_title_a_to_b}\n"
            f"- Đường quan hệ phả hệ thực tế: {path_desc}\n\n"
            "YÊU CẦU TRÌNH BÀY:\n"
            "1. Xác định rõ mối quan hệ và vai vế giữa A và B một cách trang trọng, tự nhiên.\n"
            "2. Giải thích nguồn gốc quan hệ theo từng bước trong đường phả hệ (ai là cha/mẹ, con cái, anh chị em của ai).\n"
            "3. Hướng dẫn cách xưng hô chuẩn mực theo văn hóa người Việt (A xưng hô thế nào với B, B đáp lại A thế nào).\n"
            "4. KHÔNG sử dụng các định dạng dấu sao lộn xộn (* **). Dùng gạch đầu dòng rõ ràng.\n"
            "5. TUYỆT ĐỐI KHÔNG tự suy đoán hay kết luận quan hệ khác với dữ liệu đã cung cấp."
        )

        gemini_res = await gemini_service.generate_content_safe(
            prompt=system_instruction,
            model=clan_setting.gemini_model if clan_setting else None,
        )

        if gemini_res.get("success") and gemini_res.get("response"):
            explanation_text = sanitize_ai_response(gemini_res["response"])
            base_response["ai_explanation"] = explanation_text
            base_response["explanation_status"] = "success"
        else:
            base_response["ai_explanation"] = (
                f"Thuật toán phả hệ đã xác nhận: {person_a.full_name} gọi {person_b.full_name} là {kinship_term}. "
                f"Đường liên kết: {path_desc}."
            )
            base_response["explanation_status"] = "error"

        return base_response


kinship_explainer_service = KinshipExplainerService()

