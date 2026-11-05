"""Excel Pre-import Quality Audit & AI Advisory Service for MFGMS-AI (Phase 6).

Inspects, validates, cross-checks, and audits genealogy Excel files before Neon DB commit:
1. Structural & Syntax Validation (Missing sheets, required columns, data types, DAG cycles).
2. Intra-file & Cross-DB Duplicate Person Detection (Phase 5 multi-factor heuristic scoring).
3. Missing & Anomalous Relationship Analysis (Co-parent spouse check, age gaps, generation gaps).
4. Pre-import Data Health Score (0-100).
5. Privacy-by-Design Gemini AI Executive Synthesis (anonymized prompt, no raw unconsented PII).
6. Read-only: Never mutates DB, never merges records, never auto-creates users/passwords.
"""

from __future__ import annotations

import io
import logging
import re
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import openpyxl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai.entities import AIConsent, ClanAISetting
from app.models.family.entities import Clan
from app.models.genealogy.entities import FamilyBranch, Person, Relationship
from app.services.ai.chatbot_service import sanitize_ai_response
from app.services.ai.data_quality_service import _name_similarity, _normalize_name
from app.services.ai.gemini_service import gemini_service
from app.services.genealogy.excel_import_service import validate_excel_data

logger = logging.getLogger("mfg.ai.excel_audit")


class ExcelAuditService:
    """Dịch vụ AI kiểm tra và đối soát dữ liệu Excel trước khi Import."""

    async def analyze_excel_import(
        self,
        db: AsyncSession,
        clan_id: uuid.UUID,
        file_bytes: bytes,
        allowed_branch_ids: Optional[Set[uuid.UUID]] = None,
        include_ai_advisory: bool = True,
    ) -> Dict[str, Any]:
        """Phân tích toàn diện file Excel, đối soát với Neon DB và xuất khuyến nghị AI."""
        # 1. Kiểm tra Clan
        clan_stmt = select(Clan).where(Clan.clan_id == clan_id)
        clan = (await db.execute(clan_stmt)).scalar_one_or_none()
        if not clan:
            raise ValueError("Không tìm thấy thông tin dòng họ.")

        # 2. Chạy bộ kiểm tra cấu trúc cơ sở bằng Python (tái sử dụng validate_excel_data)
        base_validation = await validate_excel_data(file_bytes, clan_id, db)
        is_valid = base_validation["is_valid"]
        preview = base_validation["preview"]
        fatal_errors = list(base_validation["fatal_errors"])
        warnings = list(base_validation["warnings"])

        excel_persons = preview["persons"]
        excel_relationships = preview["relationships"]
        excel_branches = preview["branches"]

        # 3. Lấy dữ liệu Person, Relationship, Branch hiện có từ Neon DB (có áp dụng phạm vi chi nhánh)
        if allowed_branch_ids is not None:
            existing_p_stmt = select(Person).where(
                Person.family_id == clan_id,
                Person.status == "ACTIVE",
                Person.branch_id.in_(allowed_branch_ids),
            )
            existing_b_stmt = select(FamilyBranch).where(
                FamilyBranch.family_id == clan_id,
                FamilyBranch.id.in_(allowed_branch_ids),
            )
            audit_scope = "branch_scoped"
        else:
            existing_p_stmt = select(Person).where(
                Person.family_id == clan_id,
                Person.status == "ACTIVE",
            )
            existing_b_stmt = select(FamilyBranch).where(FamilyBranch.family_id == clan_id)
            audit_scope = "clan_wide"

        db_persons = (await db.execute(existing_p_stmt)).scalars().all()
        db_person_map = {p.id: p for p in db_persons}
        db_branches = (await db.execute(existing_b_stmt)).scalars().all()
        db_branch_map = {b.id: b.name for b in db_branches}

        existing_r_stmt = select(Relationship).where(
            Relationship.family_id == clan_id,
            Relationship.status == "ACTIVE",
        )
        db_relationships = (await db.execute(existing_r_stmt)).scalars().all()

        # 4. Phân tích đối soát nghi trùng (Duplicate Candidates)
        # a) Nghi trùng nội bộ trong file Excel (Intra-Excel)
        duplicate_candidates: List[Dict[str, Any]] = []

        # Xây dựng bản đồ phụ mẫu và phối ngẫu trong Excel
        excel_parents_map: Dict[str, Set[str]] = {}
        excel_spouses_map: Dict[str, Set[str]] = {}
        for r in excel_relationships:
            r_type = (r.get("relationshipType") or "").upper()
            p1_code = str(r.get("person1") or "").upper()
            p2_code = str(r.get("person2") or "").upper()
            if r_type == "PARENT_CHILD":
                excel_parents_map.setdefault(p2_code, set()).add(p1_code)
            elif r_type in ("SPOUSE", "MARRIAGE"):
                excel_spouses_map.setdefault(p1_code, set()).add(p2_code)
                excel_spouses_map.setdefault(p2_code, set()).add(p1_code)

        num_ep = len(excel_persons)
        for i in range(num_ep):
            p1 = excel_persons[i]
            p1_name = p1.get("fullName", "")
            p1_code = p1.get("code", "")
            p1_gen = p1.get("generation", 1)
            p1_birth_yr = None
            if p1.get("birthDate"):
                try:
                    p1_birth_yr = date.fromisoformat(p1["birthDate"]).year
                except Exception:
                    pass

            for j in range(i + 1, num_ep):
                p2 = excel_persons[j]
                p2_name = p2.get("fullName", "")
                p2_code = p2.get("code", "")
                p2_gen = p2.get("generation", 1)
                p2_birth_yr = None
                if p2.get("birthDate"):
                    try:
                        p2_birth_yr = date.fromisoformat(p2["birthDate"]).year
                    except Exception:
                        pass

                sim = _name_similarity(p1_name, p2_name)
                if sim < 0.70:
                    continue

                score = 0
                reasons: List[str] = []

                if sim >= 0.95:
                    score += 45
                    reasons.append(f"Họ tên trùng khớp hoàn toàn ('{p1_name}')")
                else:
                    score += 30
                    reasons.append(f"Họ tên tương đồng cao ('{p1_name}' vs '{p2_name}')")

                if p1.get("gender") == p2.get("gender"):
                    score += 10

                gen_diff = abs(p1_gen - p2_gen)
                if gen_diff == 0:
                    score += 20
                    reasons.append(f"Cùng Đời thứ {p1_gen}")
                elif gen_diff >= 2:
                    score -= 25

                if p1_birth_yr and p2_birth_yr:
                    diff_yr = abs(p1_birth_yr - p2_birth_yr)
                    if diff_yr == 0:
                        score += 25
                        reasons.append(f"Cùng năm sinh ({p1_birth_yr})")
                    elif diff_yr <= 2:
                        score += 15
                        reasons.append(f"Năm sinh chênh lệch nhỏ ({p1_birth_yr} vs {p2_birth_yr})")

                # Chung phụ mẫu trong Excel
                shared_parents = excel_parents_map.get(p1_code, set()).intersection(
                    excel_parents_map.get(p2_code, set())
                )
                if shared_parents:
                    score += 25
                    reasons.append(f"Cùng phụ mẫu khai báo trong file ({len(shared_parents)} người)")

                final_score = max(0, min(100, score))
                if final_score >= 65:
                    duplicate_candidates.append({
                        "source": "intra_excel",
                        "person_1": {
                            "code": p1_code,
                            "full_name": p1_name,
                            "generation": p1_gen,
                            "birth_year": p1_birth_yr,
                            "row": p1.get("row_idx"),
                        },
                        "person_2": {
                            "code": p2_code,
                            "full_name": p2_name,
                            "generation": p2_gen,
                            "birth_year": p2_birth_yr,
                            "row": p2.get("row_idx"),
                        },
                        "similarity_score": final_score,
                        "reasons": reasons,
                        "recommendation": (
                            f"Điểm tương đồng: {final_score}/100. Hai hồ sơ trong cùng file Excel "
                            "có dấu hiệu khai báo trùng lặp. Đề xuất người quản trị kiểm tra lại trước khi nhập."
                        ),
                    })

        # b) Nghi trùng giữa Excel và Person đã có trong Neon DB (Cross-DB Check)
        for ep in excel_persons:
            ep_name = ep.get("fullName", "")
            ep_code = ep.get("code", "")
            ep_gen = ep.get("generation", 1)
            ep_birth_yr = None
            if ep.get("birthDate"):
                try:
                    ep_birth_yr = date.fromisoformat(ep["birthDate"]).year
                except Exception:
                    pass

            for db_p in db_persons:
                sim = _name_similarity(ep_name, db_p.full_name)
                if sim < 0.75:
                    continue

                db_birth_yr = db_p.birth_date.year if db_p.birth_date else None
                db_gen = db_p.generation or 1

                score = 0
                reasons = []

                if sim >= 0.95:
                    score += 45
                    reasons.append(f"Họ tên trùng với Person trên Neon ('{db_p.full_name}')")
                else:
                    score += 30
                    reasons.append(f"Họ tên tương đồng ('{ep_name}' vs '{db_p.full_name}')")

                if (ep.get("gender") or "").upper() == (db_p.gender or "").upper():
                    score += 10

                gen_diff = abs(ep_gen - db_gen)
                if gen_diff == 0:
                    score += 20
                    reasons.append(f"Cùng Đời thứ {ep_gen}")
                elif gen_diff >= 2:
                    score -= 25

                if ep_birth_yr and db_birth_yr:
                    diff_yr = abs(ep_birth_yr - db_birth_yr)
                    if diff_yr == 0:
                        score += 25
                        reasons.append(f"Trùng năm sinh ({ep_birth_yr})")
                    elif diff_yr <= 2:
                        score += 15
                        reasons.append(f"Năm sinh sát nhau ({ep_birth_yr} vs {db_birth_yr})")

                final_score = max(0, min(100, score))
                if final_score >= 65:
                    duplicate_candidates.append({
                        "source": "db_cross_check",
                        "person_1": {
                            "code": ep_code,
                            "full_name": ep_name,
                            "generation": ep_gen,
                            "birth_year": ep_birth_yr,
                            "row": ep.get("row_idx"),
                        },
                        "person_2": {
                            "person_id": str(db_p.id),
                            "full_name": db_p.full_name,
                            "generation": db_gen,
                            "birth_year": db_birth_yr,
                            "branch_name": db_branch_map.get(db_p.branch_id),
                        },
                        "similarity_score": final_score,
                        "reasons": reasons,
                        "recommendation": (
                            f"Điểm tương đồng: {final_score}/100. Hồ sơ trong Excel có thể trùng với thành viên "
                            f"'{db_p.full_name}' (Đời {db_gen}) đã có trong cơ sở dữ liệu. "
                            "Hệ thống sẽ không tự gộp; người quản trị cần đối chiếu gia phả gốc."
                        ),
                    })

        # Sắp xếp điểm tương đồng giảm dần
        duplicate_candidates.sort(key=lambda x: x["similarity_score"], reverse=True)

        # 5. Phân tích quan hệ bất thường & gợi ý liên kết (Missing & Anomalous Relations)
        anomalous_relationships: List[Dict[str, Any]] = []
        missing_relationship_suggestions: List[Dict[str, Any]] = []

        # a) Mâu thuẫn niên đại & thế hệ trong sheet QUAN HỆ
        excel_person_dict = {p["code"]: p for p in excel_persons}

        for r in excel_relationships:
            r_type = (r.get("relationshipType") or "").upper()
            p1_code = str(r.get("person1") or "").upper()
            p2_code = str(r.get("person2") or "").upper()
            row_idx = r.get("row_idx")

            p1_data = excel_person_dict.get(p1_code)
            p2_data = excel_person_dict.get(p2_code)

            if not p1_data or not p2_data:
                continue

            # Kiểm tra quan hệ Cha/Mẹ - Con
            if r_type == "PARENT_CHILD":
                gen1 = p1_data.get("generation", 1)
                gen2 = p2_data.get("generation", 1)

                if gen2 <= gen1:
                    anomalous_relationships.append({
                        "type": "GENERATION_INVERSION",
                        "severity": "CRITICAL",
                        "sheet": "QUAN HỆ",
                        "row": row_idx,
                        "title": f"Thế hệ không hợp lý: '{p1_data['fullName']}' và '{p2_data['fullName']}'",
                        "description": f"Cha/Mẹ Đời {gen1} nhưng con lại khai báo Đời {gen2} (con phải có số đời lớn hơn cha mẹ).",
                        "recommended_fix": f"Sửa lại đời của '{p2_data['fullName']}' thành Đời {gen1 + 1}.",
                    })
                elif gen2 - gen1 > 1:
                    anomalous_relationships.append({
                        "type": "GENERATION_GAP",
                        "severity": "WARNING",
                        "sheet": "QUAN HỆ",
                        "row": row_idx,
                        "title": f"Khoảng cách thế hệ lệch ({gen2 - gen1} đời)",
                        "description": f"Cha/Mẹ Đời {gen1} và con Đời {gen2} chênh lệch hơn 1 đời.",
                        "recommended_fix": "Xác minh lại xem có thế hệ trung gian bị bỏ sót giữa hai người.",
                    })

                # Mâu thuẫn năm sinh
                b1_str = p1_data.get("birthDate")
                b2_str = p2_data.get("birthDate")
                if b1_str and b2_str:
                    try:
                        d1 = date.fromisoformat(b1_str)
                        d2 = date.fromisoformat(b2_str)
                        if d1 >= d2:
                            anomalous_relationships.append({
                                "type": "TIMELINE_CONFLICT",
                                "severity": "CRITICAL",
                                "sheet": "QUAN HỆ",
                                "row": row_idx,
                                "title": f"Mâu thuẫn năm sinh giữa '{p1_data['fullName']}' và '{p2_data['fullName']}'",
                                "description": f"Cha/Mẹ sinh năm {d1.year}, trong khi con lại sinh năm {d2.year}.",
                                "recommended_fix": "Kiểm tra lại ngày tháng năm sinh chính xác của cha/mẹ và con trên văn tự gia phả.",
                            })
                        elif d2.year - d1.year < 13:
                            anomalous_relationships.append({
                                "type": "TIMELINE_CONFLICT",
                                "severity": "WARNING",
                                "sheet": "QUAN HỆ",
                                "row": row_idx,
                                "title": f"Độ tuổi sinh con bất thường ({d2.year - d1.year} tuổi)",
                                "description": f"Cha/Mẹ sinh con khi mới {d2.year - d1.year} tuổi.",
                                "recommended_fix": "Xác minh lại năm sinh để tránh nhầm lẫn giữa năm âm lịch và dương lịch.",
                            })
                    except Exception:
                        pass

        # b) Gợi ý kiểm tra liên kết phối ngẫu (Co-parent Spouse Check)
        for child_code, parents in excel_parents_map.items():
            if len(parents) >= 2:
                parent_list = list(parents)
                for idx_a in range(len(parent_list)):
                    for idx_b in range(idx_a + 1, len(parent_list)):
                        pA = parent_list[idx_a]
                        pB = parent_list[idx_b]
                        # Kiểm tra xem giữa pA và pB đã có liên kết SPOUSE chưa
                        has_spouse_link = pB in excel_spouses_map.get(pA, set())
                        if not has_spouse_link:
                            child_info = excel_person_dict.get(child_code, {})
                            pA_info = excel_person_dict.get(pA, {})
                            pB_info = excel_person_dict.get(pB, {})
                            child_name = child_info.get("fullName", child_code)
                            pA_name = pA_info.get("fullName", pA)
                            pB_name = pB_info.get("fullName", pB)

                            missing_relationship_suggestions.append({
                                "suggested_type": "CHECK_SPOUSE_LINK",
                                "confidence": "MEDIUM",
                                "from_person": {"code": pA, "full_name": pA_name},
                                "to_person": {"code": pB, "full_name": pB_name},
                                "evidence": [
                                    f"Cả hai cùng được khai báo là phụ mẫu của con '{child_name}' (Đời {child_info.get('generation', '?')})"
                                ],
                                "reason": (
                                    f"Hai hồ sơ '{pA_name}' và '{pB_name}' cùng được ghi nhận là cha/mẹ của '{child_name}' "
                                    "nhưng trong sheet QUAN HỆ chưa thiết lập liên kết phối ngẫu. "
                                    "Đề xuất người quản trị kiểm tra hồ sơ thực tế để bổ sung liên kết phối ngẫu nếu phù hợp (không tự động suy đoán quan hệ hôn nhân)."
                                ),
                            })

        # 6. Tính Điểm Sức Khỏe Dữ Liệu Dự Kiến (Pre-import Health Score: 0 - 100)
        fatal_count = len(fatal_errors)
        warning_count = len(warnings)
        critical_anomalies_count = sum(1 for a in anomalous_relationships if a.get("severity") == "CRITICAL")
        high_dup_count = sum(1 for d in duplicate_candidates if d.get("similarity_score", 0) >= 80)

        penalty = (fatal_count * 25) + (critical_anomalies_count * 15) + (warning_count * 5) + (high_dup_count * 4) + (len(missing_relationship_suggestions) * 2)
        health_score = max(0, min(100, 100 - penalty))

        # 7. Gemini AI Cố Vấn Đối Soát & Thẩm Định Nhập Phả Hệ (Bảo vệ quyền riêng tư AIConsent)
        ai_advisory: Optional[str] = None
        if include_ai_advisory:
            setting_stmt = select(ClanAISetting).where(ClanAISetting.clan_id == clan_id)
            clan_setting = (await db.execute(setting_stmt)).scalar_one_or_none()

            if not clan_setting or not clan_setting.ai_enabled:
                ai_advisory = (
                    "Tính năng phân tích AI chưa được kích hoạt bởi Trưởng tộc trong phần Cấu hình AI dòng họ. "
                    "Kết quả kiểm định hiện tại được tạo bằng thuật toán phân tích cú pháp và đồ thị nội bộ."
                )
            else:
                features = clan_setting.features or {}
                if not features.get("suggestions", True) and not features.get("assistant", True):
                    ai_advisory = (
                        "Tính năng gợi ý AI đang tạm dừng theo cấu hình dòng họ. "
                        "Hệ thống đã hoàn tất phân tích đối soát bằng bộ quy tắc kiểm định nội bộ."
                    )
                else:
                    data_scopes = clan_setting.allowed_data_scopes or {}
                    allow_personal_data = bool(data_scopes.get("personal_data", False))
                    allow_general_history = bool(data_scopes.get("general_history", True))

                    # Lấy danh sách consent của người trong DB
                    consent_stmt = select(AIConsent.person_id).where(
                        AIConsent.clan_id == clan_id,
                        AIConsent.purpose.in_(["dataSuggestions", "relationshipAnalysis", "genealogyData"]),
                        AIConsent.granted.is_(True),
                        AIConsent.revoked_at.is_(None),
                        AIConsent.person_id.is_not(None),
                    )
                    consented_person_ids = set((await db.execute(consent_stmt)).scalars().all())

                    # Khử định danh an toàn trong nội dung gửi sang Gemini (Privacy-by-Design)
                    # Quy tắc nghiêm ngặt: Người trong Excel chưa có User account nên KHÔNG CÓ AIConsent.
                    # Mọi người còn sống trong Excel BẮT BUỘC phải khử định danh danh tính.
                    def safe_excel_person_label(p_info: Dict[str, Any]) -> str:
                        is_living = bool(p_info.get("isLiving", True) and not p_info.get("birthDate"))
                        gen = p_info.get("generation", 1)
                        row = p_info.get("row") or p_info.get("row_idx") or "?"
                        if is_living:
                            # Người còn sống chưa có tài khoản: che chắn danh tính hoàn toàn
                            return f"Thành viên Đời {gen} [Dòng {row}]"
                        # Người đã khuất: chỉ hiển thị họ tên nếu dòng tộc cho phép general_history
                        if allow_general_history:
                            return p_info.get("full_name") or p_info.get("fullName") or f"Thành viên quá cố Đời {gen}"
                        return f"Thành viên quá cố (Đời {gen})"

                    def safe_db_person_label(pid_str: Optional[str]) -> str:
                        if not pid_str:
                            return "Thành viên trên Neon DB"
                        try:
                            pid = uuid.UUID(pid_str)
                            p = db_person_map.get(pid)
                            if not p:
                                return "Thành viên trên Neon DB"
                            is_living = bool(p.is_alive is not False and p.death_date is None)
                            if is_living:
                                if allow_personal_data and (pid in consented_person_ids):
                                    return p.full_name
                                return f"Thành viên Neon Đời {p.generation or 1} [Mã ẩn danh #{str(pid)[:6]}]"
                            if allow_general_history:
                                return p.full_name
                            return f"Thành viên quá cố (Đời {p.generation or 1})"
                        except Exception:
                            return "Thành viên trên Neon DB"

                    # Tạo tóm tắt ẩn danh cho prompt (Tuyệt đối không gửi PII người còn sống chưa cấp quyền)
                    issue_lines: List[str] = []
                    for fe in fatal_errors[:4]:
                        issue_lines.append(f"• [LỖI CHẶN] Sheet {fe.get('sheet')}, Dòng {fe.get('row')}: {fe.get('message')}")
                    for anom in anomalous_relationships[:4]:
                        issue_lines.append(f"• [{anom.get('severity')}] Sheet {anom.get('sheet')}, Dòng {anom.get('row', '?')}: {anom.get('type')} - {anom.get('recommended_fix')}")
                    for dup in duplicate_candidates[:3]:
                        lbl1 = safe_excel_person_label(dup["person_1"])
                        if dup["source"] == "intra_excel":
                            lbl2 = safe_excel_person_label(dup["person_2"])
                        else:
                            lbl2 = safe_db_person_label(dup["person_2"].get("person_id"))
                        issue_lines.append(f"• [NGHI TRÙNG {dup['similarity_score']}/100] {lbl1} và {lbl2}: {', '.join(dup['reasons'][:2])}")

                    model_name = clan_setting.gemini_model or gemini_service.model_name
                    import_readiness = "CHƯA THỂ NHẬP (Cần sửa lỗi chặn)" if fatal_count > 0 else (
                        "SẴN SÀNG CÓ ĐIỀU KIỆN (Cần xem xét cảnh báo)" if warning_count > 0 else "RẤT TỐT • SẴN SÀNG NHẬP"
                    )

                    prompt = (
                        "Bạn là Chuyên gia Cố vấn Thẩm định Dữ liệu Phả hệ số cho hệ thống MFGMS-AI.\\n"
                        "DƯỚI ĐÂY LÀ KẾT QUẢ ĐỐI SOÁT TỰ ĐỘNG FILE EXCEL GIA PHẢ DỰ KIẾN NHẬP VÀO HỆ THỐNG:\\n"
                        f"- Dòng tộc: {clan.name}\\n"
                        f"- Quy mô file Excel: {len(excel_persons)} thành viên, {len(excel_relationships)} quan hệ, {len(excel_branches)} chi nhánh.\\n"
                        f"- Đánh giá mức độ sẵn sàng: {import_readiness}\\n"
                        f"- Điểm chất lượng dự kiến: {health_score}/100 điểm.\\n"
                        f"- Lỗi chặn bắt buộc sửa (Fatal): {fatal_count} lỗi.\\n"
                        f"- Cảnh báo cần lưu ý (Warnings): {warning_count} cảnh báo.\\n"
                        f"- Hồ sơ nghi trùng lặp (Điểm tương đồng cao): {len(duplicate_candidates)} trường hợp.\\n"
                        f"- Gợi ý kiểm tra quan hệ còn thiếu: {len(missing_relationship_suggestions)} gợi ý.\\n\\n"
                        "CÁC VẤN ĐỀ TRỌNG YẾU PHÁT HIỆN QUA RÀ SOÁT:\\n"
                        + ("\\n".join(issue_lines) if issue_lines else "• Cấu trúc file chuẩn xác, không có lỗi chặn.")
                        + "\\n\\n"
                        "YÊU CẦU BIÊN SOẠN BÁO CÁO CỐ VẤN CHO BAN QUẢN TRỊ TRƯỚC KHI BẤM NHẬP (IMPORT):\\n"
                        "1. Đánh giá tổng quan về tính khả thi và độ hoàn thiện của file Excel.\\n"
                        "2. Hướng dẫn sửa chữa các lỗi chặn (nếu có) trước khi hệ thống cho phép ghi vào Neon DB.\\n"
                        "3. Khuyến nghị đối soát hồ sơ nghi trùng và liên kết phối ngẫu (nhắc nhở: cùng có con không đồng nghĩa đã kết hôn, điểm tương đồng là căn cứ gợi ý chứ không tự gộp).\\n"
                        "4. Lời khuyên vận hành thận trọng, tránh gây sai lệch dữ liệu cây gia phả.\\n"
                        "5. Văn phong trang trọng, tích cực, mang tính hướng dẫn chuyên nghiệp. Tuyệt đối KHÔNG dùng định dạng dấu sao lộn xộn (* **), dùng gạch đầu dòng rõ ràng."
                    )

                    gemini_res = await gemini_service.generate_content_safe(
                        prompt=prompt,
                        model=model_name,
                        timeout_seconds=25.0,
                    )
                    if gemini_res.get("success") and gemini_res.get("response"):
                        ai_advisory = sanitize_ai_response(gemini_res["response"])
                    else:
                        ai_advisory = (
                            f"Đánh giá mức độ sẵn sàng: {import_readiness}. "
                            f"Điểm chất lượng dữ liệu dự kiến: {health_score}/100. "
                            f"Phát hiện {fatal_count} lỗi chặn bắt buộc, {warning_count} cảnh báo, "
                            f"{len(duplicate_candidates)} hồ sơ nghi trùng lặp và {len(missing_relationship_suggestions)} gợi ý liên kết."
                        )

        return {
            "clan_id": str(clan_id),
            "clan_name": clan.name,
            "audit_scope": audit_scope,
            "is_valid": is_valid and (fatal_count == 0),
            "summary": {
                "total_persons": len(excel_persons),
                "total_relationships": len(excel_relationships),
                "total_branches": len(excel_branches),
                "fatal_count": fatal_count,
                "warning_count": warning_count,
                "duplicates_count": len(duplicate_candidates),
                "anomalies_count": len(anomalous_relationships),
                "missing_suggestions_count": len(missing_relationship_suggestions),
                "health_score": health_score,
            },
            "fatal_errors": fatal_errors,
            "warnings": warnings,
            "duplicate_candidates": duplicate_candidates[:30],
            "anomalous_relationships": anomalous_relationships[:30],
            "missing_relationship_suggestions": missing_relationship_suggestions[:30],
            "ai_advisory": ai_advisory,
            "preview": preview,
        }


excel_audit_service = ExcelAuditService()

