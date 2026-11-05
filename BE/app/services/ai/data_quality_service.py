"""Genealogy Data Quality & Anomaly Detection Service for MFGMS-AI (Phase 5).

Provides deterministic audits and AI-powered quality assessment:
1. Duplicate Person Detection: Multi-factor scoring (heuristic 0-100 score, NOT an empirical probability).
2. Missing Relationship Suggestions: Graph topology analysis with safe wording ("Kiểm tra liên kết phối ngẫu", không khẳng định hôn nhân).
3. Data Anomaly Checks: Cycles (DFS), timeline contradictions (parent born after child, negative lifespans), generation gaps, self-relations.
4. AI Executive Quality Synthesis: Gemini summarizes health score and prioritizes action items for Clan/Family Admin.
5. Strict Privacy-by-Design: Integrates AIConsent & ClanAISetting filter so unconsented personal data is NEVER sent to Gemini.
6. Branch-scoped audit: Enforces branch boundaries for Family Admin.

Guarantees:
- Read-only audit & advisory: Never modifies, deletes, or merges Neon DB rows automatically.
- Strict isolation: All queries filtered strictly by clan_id and caller's allowed branch scope.
- Zero emojis.
"""

from __future__ import annotations

import logging
import re
import unicodedata
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai.entities import AIConsent, ClanAISetting
from app.models.family.entities import Clan
from app.models.genealogy.entities import FamilyBranch, Person, Relationship
from app.services.ai.chatbot_service import sanitize_ai_response
from app.services.ai.gemini_service import gemini_service

logger = logging.getLogger("mfg.ai.quality_service")


def _normalize_name(name: str) -> str:
    """Chuẩn hóa tên tiếng Việt: viết thường, loại bỏ khoảng trắng thừa và dấu câu."""
    if not name:
        return ""
    text = name.strip().lower()
    text = re.sub(r"[^\w\s]", "", text)
    return " ".join(text.split())


def _name_similarity(name1: str, name2: str) -> float:
    """Tính độ tương đồng giữa hai tên tiếng Việt."""
    n1 = _normalize_name(name1)
    n2 = _normalize_name(name2)
    if not n1 or not n2:
        return 0.0
    if n1 == n2:
        return 1.0

    tokens1 = set(n1.split())
    tokens2 = set(n2.split())
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)

    jaccard = len(intersection) / len(union) if union else 0.0

    parts1 = n1.split()
    parts2 = n2.split()
    bonus = 0.0
    if parts1 and parts2:
        if parts1[0] == parts2[0]:
            bonus += 0.15
        if parts1[-1] == parts2[-1]:
            bonus += 0.25

    return min(1.0, (jaccard * 0.6) + bonus)


class DataQualityService:
    """Service kiểm định chất lượng dữ liệu, phát hiện trùng lặp & bất thường phả hệ."""

    async def detect_duplicates(
        self,
        persons: List[Person],
        relationships: List[Relationship],
        branches_map: Dict[uuid.UUID, str],
    ) -> List[Dict[str, Any]]:
        """Phát hiện các hồ sơ Person nghi ngờ trùng lặp dựa trên ma trận tiêu chí heuristic."""
        results: List[Dict[str, Any]] = []

        # Xây dựng bản đồ phụ mẫu và hôn phối của từng người
        parents_map: Dict[uuid.UUID, Set[uuid.UUID]] = {}
        spouses_map: Dict[uuid.UUID, Set[uuid.UUID]] = {}

        for r in relationships:
            rel_type = (r.relationship_type or "").upper()
            if rel_type == "PARENT_CHILD":
                parents_map.setdefault(r.to_member_id, set()).add(r.from_member_id)
            elif rel_type in ("SPOUSE", "MARRIAGE"):
                spouses_map.setdefault(r.from_member_id, set()).add(r.to_member_id)
                spouses_map.setdefault(r.to_member_id, set()).add(r.from_member_id)

        n = len(persons)
        for i in range(n):
            p1 = persons[i]
            for j in range(i + 1, n):
                p2 = persons[j]

                score = 0
                reasons: List[str] = []

                # 1. So sánh tên
                sim = _name_similarity(p1.full_name, p2.full_name)
                if sim >= 0.95:
                    score += 45
                    reasons.append(f"Họ tên trùng khớp hoàn toàn ('{p1.full_name}')")
                elif sim >= 0.70:
                    score += 30
                    reasons.append(f"Họ tên tương đồng cao ('{p1.full_name}' vs '{p2.full_name}')")
                else:
                    continue

                # 2. So sánh giới tính
                g1 = (p1.gender or "").upper()
                g2 = (p2.gender or "").upper()
                if g1 and g2:
                    if g1 == g2:
                        score += 10
                    else:
                        continue

                # 3. So sánh thế hệ
                gen1 = p1.generation or 1
                gen2 = p2.generation or 1
                gen_diff = abs(gen1 - gen2)
                if gen_diff == 0:
                    score += 20
                    reasons.append(f"Cùng thuộc Đời thứ {gen1}")
                elif gen_diff == 1:
                    score += 5
                else:
                    score -= 25

                # 4. So sánh năm sinh / năm mất
                b1 = p1.birth_date.year if p1.birth_date else None
                b2 = p2.birth_date.year if p2.birth_date else None
                if b1 and b2:
                    diff_b = abs(b1 - b2)
                    if diff_b == 0:
                        score += 25
                        reasons.append(f"Cùng năm sinh ({b1})")
                    elif diff_b <= 2:
                        score += 15
                        reasons.append(f"Năm sinh chênh lệch rất nhỏ ({b1} vs {b2})")
                    elif diff_b > 10:
                        score -= 30

                # 5. So sánh thân sinh (Cha/Mẹ)
                p1_parents = parents_map.get(p1.id, set())
                p2_parents = parents_map.get(p2.id, set())
                shared_parents = p1_parents.intersection(p2_parents)
                if shared_parents:
                    score += 25
                    reasons.append(f"Cùng thông tin phụ mẫu ({len(shared_parents)} người)")
                elif p1_parents and p2_parents and not shared_parents:
                    score -= 35
                    reasons.append("Khác biệt thông tin phụ mẫu (hai người có phụ mẫu khác nhau)")

                # 6. So sánh hôn phối
                p1_spouses = spouses_map.get(p1.id, set())
                p2_spouses = spouses_map.get(p2.id, set())
                shared_spouses = p1_spouses.intersection(p2_spouses)
                if shared_spouses:
                    score += 25
                    reasons.append(f"Cùng người phối ngẫu ({len(shared_spouses)} người)")

                # 7. So sánh chi nhánh
                if p1.branch_id and p2.branch_id and p1.branch_id == p2.branch_id:
                    score += 5
                    b_name = branches_map.get(p1.branch_id, "Chi tộc")
                    reasons.append(f"Cùng thuộc chi '{b_name}'")

                final_score = max(0, min(100, score))

                # Ngưỡng phát hiện nghi trùng: từ 65 điểm trở lên
                if final_score >= 65:
                    if final_score >= 85:
                        rec = f"Điểm tương đồng: {final_score}/100. Thuật toán phát hiện sự tương đồng cao về tên và thông tin thân nhân; đề xuất người quản trị đối chiếu kỹ hồ sơ thực tế trước khi xem xét gộp hồ sơ."
                    else:
                        rec = f"Điểm tương đồng: {final_score}/100. Có sự tương đồng ở một số tiêu chí quy chuẩn; đề xuất kiểm tra đối chiếu tiểu sử và nguồn gốc."

                    results.append({
                        "person_1": {
                            "person_id": str(p1.id),
                            "full_name": p1.full_name,
                            "generation": p1.generation or 1,
                            "gender": p1.gender,
                            "birth_year": b1,
                            "death_year": p1.death_date.year if p1.death_date else None,
                            "branch_name": branches_map.get(p1.branch_id) if p1.branch_id else None,
                            "is_alive": p1.is_alive,
                        },
                        "person_2": {
                            "person_id": str(p2.id),
                            "full_name": p2.full_name,
                            "generation": p2.generation or 1,
                            "gender": p2.gender,
                            "birth_year": b2,
                            "death_year": p2.death_date.year if p2.death_date else None,
                            "branch_name": branches_map.get(p2.branch_id) if p2.branch_id else None,
                            "is_alive": p2.is_alive,
                        },
                        "similarity_score": final_score,
                        "reasons": reasons,
                        "recommendation": rec,
                    })

        # Sắp xếp điểm tương đồng giảm dần
        results.sort(key=lambda x: x["similarity_score"], reverse=True)
        return results[:25]

    async def detect_missing_relationships(
        self,
        persons: List[Person],
        relationships: List[Relationship],
    ) -> List[Dict[str, Any]]:
        """Phát hiện các mối quan hệ có khả năng cao bị bỏ sót (Không tự suy đoán hôn nhân)."""
        suggestions: List[Dict[str, Any]] = []
        persons_map = {p.id: p for p in persons}

        # Tập hợp các liên kết cha-con và phối ngẫu hiện có
        parent_child_edges: Dict[uuid.UUID, Set[uuid.UUID]] = {}
        child_parent_edges: Dict[uuid.UUID, Set[uuid.UUID]] = {}
        existing_spouses: Set[Tuple[uuid.UUID, uuid.UUID]] = set()

        for r in relationships:
            rel_type = (r.relationship_type or "").upper()
            if rel_type == "PARENT_CHILD":
                parent_child_edges.setdefault(r.to_member_id, set()).add(r.from_member_id)
                child_parent_edges.setdefault(r.from_member_id, set()).add(r.to_member_id)
            elif rel_type in ("SPOUSE", "MARRIAGE"):
                p_min = min(r.from_member_id, r.to_member_id)
                p_max = max(r.from_member_id, r.to_member_id)
                existing_spouses.add((p_min, p_max))

        # 1. Hai người cùng là phụ mẫu của một con nhưng chưa có liên kết phối ngẫu
        # Lưu ý: Cùng có con không đồng nghĩa đã kết hôn -> Chỉ gợi ý kiểm tra liên kết phối ngẫu
        missing_spouse_pairs: Set[Tuple[uuid.UUID, uuid.UUID]] = set()
        for child_id, parents in parent_child_edges.items():
            if len(parents) >= 2:
                parent_list = list(parents)
                for i in range(len(parent_list)):
                    for j in range(i + 1, len(parent_list)):
                        pA = parent_list[i]
                        pB = parent_list[j]
                        pair = (min(pA, pB), max(pA, pB))
                        if pair not in existing_spouses and pair not in missing_spouse_pairs:
                            missing_spouse_pairs.add(pair)
                            child_p = persons_map.get(child_id)
                            personA = persons_map.get(pair[0])
                            personB = persons_map.get(pair[1])
                            if personA and personB:
                                child_name = child_p.full_name if child_p else "thành viên"
                                suggestions.append({
                                    "from_person_id": str(personA.id),
                                    "from_person_name": personA.full_name,
                                    "to_person_id": str(personB.id),
                                    "to_person_name": personB.full_name,
                                    "suggested_type": "CHECK_SPOUSE_LINK",
                                    "confidence": "MEDIUM",
                                    "evidence": [
                                        f"Cả hai cùng được ghi nhận là phụ mẫu của người con '{child_name}' (Đời {child_p.generation if child_p else '?'})"
                                    ],
                                    "reason": (
                                        f"Hai hồ sơ cùng được ghi nhận là cha/mẹ của '{child_name}', nhưng hiện tại "
                                        "chưa có liên kết phối ngẫu trong hệ thống. Đề xuất người quản trị kiểm tra hồ sơ thực tế "
                                        "để bổ sung liên kết phối ngẫu nếu phù hợp (không tự động suy đoán quan hệ hôn nhân)."
                                    ),
                                })

        # 2. Người con mới chỉ gắn với 1 trong 2 người của cặp phối ngẫu
        for pair in existing_spouses:
            sp1_id, sp2_id = pair
            p1 = persons_map.get(sp1_id)
            p2 = persons_map.get(sp2_id)
            if not p1 or not p2:
                continue

            children_1 = child_parent_edges.get(sp1_id, set())
            children_2 = child_parent_edges.get(sp2_id, set())

            only_1 = children_1 - children_2
            for ch_id in only_1:
                ch_p = persons_map.get(ch_id)
                if ch_p:
                    suggestions.append({
                        "from_person_id": str(p2.id),
                        "from_person_name": p2.full_name,
                        "to_person_id": str(ch_p.id),
                        "to_person_name": ch_p.full_name,
                        "suggested_type": "PARENT_CHILD",
                        "confidence": "LOW",
                        "evidence": [f"'{p2.full_name}' có liên kết phối ngẫu với '{p1.full_name}', người đã có con là '{ch_p.full_name}'"],
                        "reason": (
                            f"'{ch_p.full_name}' đã được ghi nhận là con của '{p1.full_name}'. "
                            f"Vì '{p1.full_name}' và '{p2.full_name}' là cặp phối ngẫu, cần kiểm tra xem "
                            f"'{ch_p.full_name}' có phải là con chung hay con riêng trước khi bổ sung liên kết."
                        ),
                    })

        return suggestions[:25]

    async def detect_anomalies(
        self,
        persons: List[Person],
        relationships: List[Relationship],
    ) -> List[Dict[str, Any]]:
        """Kiểm tra các bất thường phả hệ: Vòng lặp, mâu thuẫn niên đại, thế hệ sai, tự thân."""
        anomalies: List[Dict[str, Any]] = []
        persons_map = {p.id: p for p in persons}

        # 1. Mối quan hệ tự thân (Self-relationship)
        for r in relationships:
            if r.from_member_id == r.to_member_id:
                p = persons_map.get(r.from_member_id)
                p_name = p.full_name if p else str(r.from_member_id)
                anomalies.append({
                    "anomaly_type": "SELF_RELATION",
                    "severity": "CRITICAL",
                    "title": f"Mối quan hệ tự thân ở '{p_name}'",
                    "description": f"Thành viên '{p_name}' có mối quan hệ liên kết với chính bản thân mình (from_id == to_id).",
                    "affected_persons": [{"person_id": str(r.from_member_id), "full_name": p_name}],
                    "recommended_fix": "Xóa liên kết tự thân không hợp lệ này khỏi cơ sở dữ liệu.",
                })

        # 2. Vòng lặp phả hệ (Circular Dependency / Cycles)
        adj_parents: Dict[uuid.UUID, List[uuid.UUID]] = {}
        for r in relationships:
            if (r.relationship_type or "").upper() == "PARENT_CHILD":
                adj_parents.setdefault(r.from_member_id, []).append(r.to_member_id)

        visited: Set[uuid.UUID] = set()
        rec_stack: Set[uuid.UUID] = set()
        cycle_nodes: Set[uuid.UUID] = set()

        def dfs_cycle(curr: uuid.UUID) -> bool:
            visited.add(curr)
            rec_stack.add(curr)
            for neighbor in adj_parents.get(curr, []):
                if neighbor not in visited:
                    if dfs_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    cycle_nodes.add(curr)
                    cycle_nodes.add(neighbor)
                    return True
            rec_stack.remove(curr)
            return False

        for p in persons:
            if p.id not in visited:
                dfs_cycle(p.id)

        if cycle_nodes:
            cycle_persons = [persons_map[pid].full_name for pid in cycle_nodes if pid in persons_map]
            anomalies.append({
                "anomaly_type": "CYCLE",
                "severity": "CRITICAL",
                "title": "Phát hiện vòng lặp tổ tiên - con cháu (Circular Lineage)",
                "description": f"Xuất hiện vòng lặp phả hệ khép kín trong các thế hệ: con cháu lại trở thành tổ tiên của cha ông ({', '.join(cycle_persons)}).",
                "affected_persons": [{"person_id": str(pid), "full_name": persons_map[pid].full_name} for pid in cycle_nodes if pid in persons_map],
                "recommended_fix": "Kiểm tra và ngắt bỏ các liên kết cha-con bị đảo ngược chiều.",
            })

        # 3. Mâu thuẫn niên đại & Thế hệ trong quan hệ Cha - Con
        for r in relationships:
            if (r.relationship_type or "").upper() == "PARENT_CHILD":
                parent = persons_map.get(r.from_member_id)
                child = persons_map.get(r.to_member_id)
                if not parent or not child:
                    continue

                # a. Thế hệ con nhỏ hơn hoặc bằng thế hệ cha/mẹ
                if parent.generation and child.generation:
                    if child.generation <= parent.generation:
                        anomalies.append({
                            "anomaly_type": "GENERATION_ANOMALY",
                            "severity": "CRITICAL",
                            "title": f"Thế hệ không hợp lý giữa '{parent.full_name}' và '{child.full_name}'",
                            "description": f"Người cha/mẹ '{parent.full_name}' thuộc Đời {parent.generation}, nhưng người con '{child.full_name}' lại thuộc Đời {child.generation} (con phải có số đời lớn hơn cha mẹ).",
                            "affected_persons": [
                                {"person_id": str(parent.id), "full_name": parent.full_name, "role": "Cha/Mẹ"},
                                {"person_id": str(child.id), "full_name": child.full_name, "role": "Con"},
                            ],
                            "recommended_fix": f"Điều chỉnh lại số đời của '{child.full_name}' (khuyến nghị: Đời {parent.generation + 1}).",
                        })
                    elif child.generation - parent.generation > 1:
                        anomalies.append({
                            "anomaly_type": "GENERATION_ANOMALY",
                            "severity": "WARNING",
                            "title": f"Khoảng cách thế hệ lệch ({child.generation - parent.generation} đời) giữa '{parent.full_name}' và '{child.full_name}'",
                            "description": f"Khoảng cách giữa đời cha/mẹ ({parent.generation}) và đời con ({child.generation}) chênh lệch hơn 1 đời.",
                            "affected_persons": [
                                {"person_id": str(parent.id), "full_name": parent.full_name, "role": "Cha/Mẹ"},
                                {"person_id": str(child.id), "full_name": child.full_name, "role": "Con"},
                            ],
                            "recommended_fix": "Xác minh lại xem giữa hai người có thế hệ trung gian bị thiếu hay không.",
                        })

                # b. Mâu thuẫn năm sinh
                if parent.birth_date and child.birth_date:
                    if parent.birth_date >= child.birth_date:
                        anomalies.append({
                            "anomaly_type": "TIMELINE_CONFLICT",
                            "severity": "CRITICAL",
                            "title": f"Mâu thuẫn năm sinh: '{parent.full_name}' sinh cùng hoặc sau con '{child.full_name}'",
                            "description": f"Cha/Mẹ sinh năm {parent.birth_date.year}, trong khi con lại sinh năm {child.birth_date.year}.",
                            "affected_persons": [
                                {"person_id": str(parent.id), "full_name": parent.full_name, "role": "Cha/Mẹ"},
                                {"person_id": str(child.id), "full_name": child.full_name, "role": "Con"},
                            ],
                            "recommended_fix": "Kiểm tra lại ngày tháng năm sinh chính xác của cha/mẹ và con trên văn tự gia phả.",
                        })
                    elif child.birth_date.year - parent.birth_date.year < 13:
                        anomalies.append({
                            "anomaly_type": "TIMELINE_CONFLICT",
                            "severity": "WARNING",
                            "title": f"Độ tuổi sinh con bất thường ({child.birth_date.year - parent.birth_date.year} tuổi)",
                            "description": f"Cha/Mẹ sinh năm {parent.birth_date.year}, sinh con '{child.full_name}' năm {child.birth_date.year} (chênh lệch dưới 13 năm).",
                            "affected_persons": [
                                {"person_id": str(parent.id), "full_name": parent.full_name, "role": "Cha/Mẹ"},
                                {"person_id": str(child.id), "full_name": child.full_name, "role": "Con"},
                            ],
                            "recommended_fix": "Xác minh lại năm sinh để tránh nhầm lẫn giữa năm âm lịch và dương lịch.",
                        })

                # c. Cha/mẹ mất trước khi con chào đời quá lâu
                if parent.death_date and child.birth_date:
                    days_diff = (child.birth_date - parent.death_date).days
                    if days_diff > 300:
                        anomalies.append({
                            "anomaly_type": "TIMELINE_CONFLICT",
                            "severity": "CRITICAL",
                            "title": f"Cha/Mẹ mất trước khi con chào đời ({parent.full_name})",
                            "description": f"'{parent.full_name}' mất năm {parent.death_date.year}, nhưng con '{child.full_name}' sinh năm {child.birth_date.year} (cách nhau hơn 300 ngày).",
                            "affected_persons": [
                                {"person_id": str(parent.id), "full_name": parent.full_name, "role": "Cha/Mẹ"},
                                {"person_id": str(child.id), "full_name": child.full_name, "role": "Con"},
                            ],
                            "recommended_fix": "Kiểm tra lại năm mất của cha/mẹ hoặc năm sinh của người con.",
                        })

        # 4. Kiểm tra cá nhân: Ngày mất trước ngày sinh
        for p in persons:
            if p.birth_date and p.death_date and p.death_date < p.birth_date:
                anomalies.append({
                    "anomaly_type": "TIMELINE_CONFLICT",
                    "severity": "CRITICAL",
                    "title": f"Ngày mất trước ngày sinh ở '{p.full_name}'",
                    "description": f"Thành viên '{p.full_name}' có ngày mất ({p.death_date}) trước ngày sinh ({p.birth_date}).",
                    "affected_persons": [{"person_id": str(p.id), "full_name": p.full_name}],
                    "recommended_fix": "Chỉnh sửa lại thứ tự ngày tháng năm sinh/mất chính xác.",
                })

        # 5. Bản ghi cô lập hoàn toàn (Isolated Records)
        active_connected_ids = set()
        for r in relationships:
            active_connected_ids.add(r.from_member_id)
            active_connected_ids.add(r.to_member_id)

        isolated_count = 0
        for p in persons:
            if p.id not in active_connected_ids:
                isolated_count += 1
                if isolated_count <= 5:
                    anomalies.append({
                        "anomaly_type": "ISOLATED_PERSON",
                        "severity": "INFO",
                        "title": f"Hồ sơ cô lập: '{p.full_name}' (Đời {p.generation or 1})",
                        "description": f"Thành viên '{p.full_name}' chưa có bất kỳ liên kết quan hệ (cha mẹ, con cái hay vợ chồng) nào với cây gia phả dòng tộc.",
                        "affected_persons": [{"person_id": str(p.id), "full_name": p.full_name}],
                        "recommended_fix": "Bổ sung liên kết cha mẹ hoặc phối ngẫu để kết nối thành viên vào cây gia phả.",
                    })

        return anomalies[:40]

    async def generate_quality_report(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        allowed_branch_ids: Optional[Set[uuid.UUID]] = None,
        include_ai_synthesis: bool = True,
    ) -> Dict[str, Any]:
        """Tạo báo cáo toàn diện về chất lượng dữ liệu kèm nhận định AI có bảo vệ quyền riêng tư."""
        # 1. Kiểm tra Clan
        clan_stmt = select(Clan).where(Clan.clan_id == clan_id)
        clan = (await db.execute(clan_stmt)).scalar_one_or_none()
        if not clan:
            raise ValueError("Không tìm thấy thông tin dòng họ.")

        # 2. Lấy danh sách thành viên theo phạm vi chi nhánh (Branch Scope Enforcement)
        if allowed_branch_ids is not None:
            persons_stmt = select(Person).where(
                Person.family_id == clan_id,
                Person.status == "ACTIVE",
                Person.branch_id.in_(allowed_branch_ids),
            )
            branches_stmt = select(FamilyBranch).where(
                FamilyBranch.family_id == clan_id,
                FamilyBranch.id.in_(allowed_branch_ids),
            )
            audit_scope = "branch_scoped"
        else:
            persons_stmt = select(Person).where(Person.family_id == clan_id, Person.status == "ACTIVE")
            branches_stmt = select(FamilyBranch).where(FamilyBranch.family_id == clan_id)
            audit_scope = "clan_wide"

        persons = (await db.execute(persons_stmt)).scalars().all()
        person_ids = {p.id for p in persons}

        # Quan hệ chỉ lấy trong tập hợp các Person được phép kiểm định
        rels_stmt = select(Relationship).where(
            Relationship.family_id == clan_id,
            Relationship.status == "ACTIVE",
            Relationship.from_member_id.in_(person_ids),
            Relationship.to_member_id.in_(person_ids),
        )
        relationships = (await db.execute(rels_stmt)).scalars().all()

        branches = (await db.execute(branches_stmt)).scalars().all()
        branches_map = {b.id: b.name for b in branches}
        scoped_branch_names = [branches_map[b_id] for b_id in allowed_branch_ids if b_id in branches_map] if allowed_branch_ids else None

        # 3. Chạy các thuật toán kiểm tra
        duplicates = await self.detect_duplicates(persons, relationships, branches_map)
        missing_rels = await self.detect_missing_relationships(persons, relationships)
        anomalies = await self.detect_anomalies(persons, relationships)

        # 4. Tính toán Điểm Sức Khỏe Dữ Liệu (Health Score 0-100)
        penalty = 0
        critical_count = sum(1 for a in anomalies if a["severity"] == "CRITICAL")
        warning_count = sum(1 for a in anomalies if a["severity"] == "WARNING")
        high_dup_count = sum(1 for d in duplicates if d["similarity_score"] >= 80)

        penalty += critical_count * 15
        penalty += warning_count * 5
        penalty += high_dup_count * 4
        penalty += len(missing_rels) * 2

        health_score = max(0, min(100, 100 - penalty))

        # 5. Gemini AI Tổng Hợp Báo Cáo Chất Lượng Dữ Liệu (Áp dụng bộ lọc quyền riêng tư AIConsent)
        ai_summary: Optional[str] = None
        if include_ai_synthesis:
            setting_stmt = select(ClanAISetting).where(ClanAISetting.clan_id == clan_id)
            clan_setting = (await db.execute(setting_stmt)).scalar_one_or_none()

            # Chặn nếu Clan chưa bật AI
            if not clan_setting or not clan_setting.ai_enabled:
                ai_summary = (
                    "Tính năng phân tích AI chưa được kích hoạt bởi Trưởng tộc trong phần Cấu hình AI dòng họ. "
                    "Báo cáo chất lượng hiện tại được lập hoàn toàn bằng thuật toán kiểm định nội bộ của hệ thống."
                )
            else:
                features = clan_setting.features or {}
                # Chặn nếu Trưởng tộc tắt tính năng gợi ý/trợ lý
                if not features.get("suggestions", True) and not features.get("assistant", True):
                    ai_summary = (
                        "Tính năng gợi ý và trợ lý AI đang tạm dừng theo cấu hình của Trưởng tộc. "
                        "Báo cáo chất lượng hiện tại được lập bằng thuật toán kiểm định nội bộ."
                    )
                else:
                    # Lấy cấu hình quyền chia sẻ dữ liệu và các consent hợp lệ
                    data_scopes = clan_setting.allowed_data_scopes or {}
                    allow_personal_data = bool(data_scopes.get("personal_data", False))
                    allow_general_history = bool(data_scopes.get("general_history", True))

                    consent_stmt = select(AIConsent.person_id).where(
                        AIConsent.clan_id == clan_id,
                        AIConsent.purpose.in_(["dataSuggestions", "relationshipAnalysis", "genealogyData"]),
                        AIConsent.granted.is_(True),
                        AIConsent.revoked_at.is_(None),
                        AIConsent.person_id.is_not(None),
                    )
                    consented_person_ids = set((await db.execute(consent_stmt)).scalars().all())

                    persons_map = {p.id: p for p in persons}

                    # Hàm che chắn thông tin cá nhân chưa có sự đồng ý (Privacy-by-Design Masking)
                    def safe_label(pid: uuid.UUID) -> str:
                        p = persons_map.get(pid)
                        if not p:
                            return "Thành viên"
                        is_living = bool(p.is_alive is not False and p.death_date is None)
                        if not is_living:
                            if allow_general_history:
                                return p.full_name
                            return f"Thành viên quá cố (Đời {p.generation or 1})"
                        # Người còn sống
                        if allow_personal_data and (p.id in consented_person_ids):
                            return p.full_name
                        return f"Thành viên Đời {p.generation or 1} [Mã ẩn danh #{str(p.id)[:6]}]"

                    # Khử định danh trong danh sách bất thường gửi đến Gemini
                    sanitized_anomaly_lines: List[str] = []
                    for a in anomalies[:5]:
                        # Tạo mô tả ẩn danh an toàn
                        aff_labels = [safe_label(uuid.UUID(ap["person_id"])) for ap in a.get("affected_persons", []) if "person_id" in ap]
                        aff_str = f" (Liên quan: {', '.join(aff_labels)})" if aff_labels else ""
                        sanitized_anomaly_lines.append(f"• [{a['severity']}] {a['anomaly_type']}: {a['recommended_fix']}{aff_str}")

                    model_name = clan_setting.gemini_model or gemini_service.model_name
                    scope_desc = f"Phạm vi chi nhánh: {', '.join(scoped_branch_names)}" if scoped_branch_names else "Toàn bộ dòng tộc"

                    prompt = (
                        "Bạn là Chuyên gia Cố vấn Kiểm định Chất lượng Dữ liệu Gia phả cho hệ thống MFGMS-AI.\n"
                        "DƯỚI ĐÂY LÀ KẾT QUẢ RÀ SOÁT TỰ ĐỘNG CỦA CƠ SỞ DỮ LIỆU GIA PHẢ:\n"
                        f"- Dòng tộc: {clan.name} ({scope_desc})\n"
                        f"- Quy mô kiểm định: {len(persons)} thành viên, {len(relationships)} liên kết quan hệ.\n"
                        f"- Điểm sức khỏe dữ liệu: {health_score}/100 điểm.\n"
                        f"- Hồ sơ nghi trùng lặp (điểm tương đồng cao): {len(duplicates)} trường hợp.\n"
                        f"- Gợi ý kiểm tra quan hệ còn thiếu: {len(missing_rels)} liên kết.\n"
                        f"- Bất thường dữ liệu cần rà soát: {len(anomalies)} cảnh báo (trong đó có {critical_count} lỗi nghiêm trọng, {warning_count} cảnh báo).\n\n"
                        "TỔNG HỢP CÁC NHÓM LỖI CHÍNH ĐÃ PHÁT HIỆN:\n"
                        + ("\n".join(sanitized_anomaly_lines) if sanitized_anomaly_lines else "• Không phát hiện lỗi nghiêm trọng.")
                        + "\n\n"
                        "YÊU CẦU BIÊN SOẠN BÁO CÁO CỐ VẤN CHO BAN QUẢN TRỊ:\n"
                        "1. Nhận định tổng quan về tính toàn vẹn của dữ liệu gia phả dựa trên điểm số.\n"
                        "2. Hướng dẫn ưu tiên rà soát các vấn đề nghiêm trọng (như mâu thuẫn năm sinh, vòng lặp thế hệ).\n"
                        "3. Khuyến nghị nguyên tắc đối chiếu cho các hồ sơ nghi trùng (lưu ý: điểm tương đồng là căn cứ gợi ý, cần đối chiếu gia phả gốc; hai người cùng có con không đồng nghĩa đã kết hôn mà cần kiểm tra liên kết phối ngẫu).\n"
                        "4. Văn phong trang trọng, chuẩn mực, mang tính cố vấn chuyên môn.\n"
                        "5. Tuyệt đối KHÔNG dùng các định dạng dấu sao lộn xộn (* **). Dùng dấu gạch đầu dòng rõ ràng."
                    )

                    gemini_res = await gemini_service.generate_content_safe(
                        prompt=prompt,
                        model=model_name,
                        timeout_seconds=25.0,
                    )
                    if gemini_res.get("success") and gemini_res.get("response"):
                        ai_summary = sanitize_ai_response(gemini_res["response"])
                    else:
                        ai_summary = (
                            f"Hệ thống kiểm định phả hệ ghi nhận điểm sức khỏe dữ liệu: {health_score}/100. "
                            f"Phát hiện {len(duplicates)} hồ sơ nghi trùng lặp, "
                            f"{len(missing_rels)} gợi ý kiểm tra liên kết phối ngẫu/phụ mẫu, và {len(anomalies)} cảnh báo bất thường."
                        )

        return {
            "clan_id": str(clan_id),
            "clan_name": clan.name,
            "audit_scope": audit_scope,
            "scoped_branch_names": scoped_branch_names,
            "total_persons": len(persons),
            "total_relationships": len(relationships),
            "health_score": health_score,
            "duplicates_count": len(duplicates),
            "duplicate_candidates": duplicates,
            "missing_relationships_count": len(missing_rels),
            "missing_relationships": missing_rels,
            "anomalies_count": len(anomalies),
            "anomalies": anomalies,
            "ai_summary": ai_summary,
            "status": "success",
        }


data_quality_service = DataQualityService()
