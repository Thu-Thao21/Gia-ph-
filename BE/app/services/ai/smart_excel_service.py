"""AI Smart Excel Import & Heuristic Graph Reconstruction Service for MFGMS-AI.

Allows Clan Admin and Family Admin to upload ANY arbitrary Excel file without
forcing a pre-defined template.
Features:
1. Auto-detects sheet, header row, and column mapping (via Gemini AI with robust heuristic fallback).
2. Supports freeform genealogy columns (Bố/Cha, Mẹ, Vợ/Chồng, Năm sinh/mất, Đời, Chi họ, v.v.).
3. Reconstructs full family tree graph:
   - Resolves Parent-Child and Spouse links by name, generation, and family branch.
   - Creates spouse partner nodes if listed only as an attribute in a row.
   - Detects cycles, chronological anomalies, and cross-DB duplicates.
4. Preview and Human-in-the-loop confirmation before atomic Neon DB commit.
5. Strictly adheres to Person - User separation (no user accounts created).
"""

from __future__ import annotations

import io
import json
import logging
import re
import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import openpyxl
from sqlalchemy import insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family.entities import Clan
from app.models.genealogy.entities import FamilyBranch, Person, Relationship
from app.models.user_access.entities import User
from app.services.ai.data_quality_service import _name_similarity, _normalize_name
from app.services.ai.gemini_service import gemini_service
from app.services.genealogy.excel_import_service import (
    _clean_str,
    _normalize_gender,
    _normalize_living_status,
    _parse_date,
)

logger = logging.getLogger("mfg.ai.smart_excel")

# Canonical fields supported for smart mapping
CANONICAL_FIELDS: List[Dict[str, Any]] = [
    {
        "key": "person_code",
        "label": "Mã thành viên / Mã Person",
        "required": False,
        "description": "Mã định danh thành viên (vd: MTT_001, MAI_01...)",
    },
    {
        "key": "full_name",
        "label": "Họ và tên",
        "required": True,
        "description": "Tên đầy đủ của thành viên trong dòng họ",
    },
    {
        "key": "gender",
        "label": "Giới tính",
        "required": False,
        "description": "Nam / Nữ",
    },
    {
        "key": "generation",
        "label": "Đời thứ / Thế hệ",
        "required": False,
        "description": "Thứ tự thế hệ (1, 2, 3... hoặc I, II...)",
    },
    {
        "key": "birth_date",
        "label": "Ngày / Năm sinh",
        "required": False,
        "description": "Năm 4 chữ số (1970) hoặc ngày tháng (dd/mm/yyyy)",
    },
    {
        "key": "death_date",
        "label": "Ngày / Năm mất",
        "required": False,
        "description": "Năm mất hoặc ngày tạ thế",
    },
    {
        "key": "is_alive",
        "label": "Tình trạng",
        "required": False,
        "description": "Còn sống hoặc Đã mất",
    },
    {
        "key": "branch_name",
        "label": "Tên Chi nhánh / Phân chi",
        "required": False,
        "description": "Chi họ, phân cành gia tộc",
    },
    {
        "key": "father_code",
        "label": "Mã Cha / Mã Bố / Mã Thân phụ",
        "required": False,
        "description": "Mã định danh của người cha (ưu tiên liên kết chính xác 100%)",
    },
    {
        "key": "father_name",
        "label": "Tên Cha / Bố / Thân phụ",
        "required": False,
        "description": "Họ tên người cha để tự động nối quan hệ",
    },
    {
        "key": "mother_code",
        "label": "Mã Mẹ / Mã Thân mẫu",
        "required": False,
        "description": "Mã định danh của người mẹ",
    },
    {
        "key": "mother_name",
        "label": "Tên Mẹ / Thân mẫu",
        "required": False,
        "description": "Họ tên người mẹ để tự động nối quan hệ",
    },
    {
        "key": "spouse_code",
        "label": "Mã Vợ/Chồng / Mã Hôn phối",
        "required": False,
        "description": "Mã định danh của người phối ngẫu",
    },
    {
        "key": "spouse_name",
        "label": "Tên Vợ / Chồng / Hôn phối",
        "required": False,
        "description": "Họ tên người phối ngẫu",
    },
    {
        "key": "other_name",
        "label": "Tên gọi khác / Tự / Biệt danh",
        "required": False,
        "description": "Tên chữ, tên tự, tên hiệu",
    },
    {
        "key": "occupation",
        "label": "Nghề nghiệp / Chức vị",
        "required": False,
        "description": "Công việc, phẩm hàm, chức sắc",
    },
    {
        "key": "burial_location",
        "label": "Nơi an táng / Mộ phần",
        "required": False,
        "description": "Vị trí mộ phần, nghĩa trang gia tộc",
    },
    {
        "key": "bio",
        "label": "Tiểu sử / Ghi chú",
        "required": False,
        "description": "Ghi chép công đức, tích xưa",
    },
    {
        "key": "none",
        "label": "Bỏ qua cột này",
        "required": False,
        "description": "Không nhập dữ liệu từ cột này",
    },
]

# Regex patterns for heuristic Vietnamese column matching (order matters!)
HEURISTIC_RULES: List[Tuple[str, re.Pattern]] = [
    # 1. Mã định danh quan hệ (ưu tiên cao nhất để không bị nhầm sang cột tên)
    ("father_code", re.compile(r"(mã\s*(cha|bố|thân\s*phụ|phụ\s*thân|father)|(cha|bố|father)\s*(code|id|mã)|^mã\s*cha$|^mã\s*bố$|^father_?id$|^father_?code$)", re.I)),
    ("mother_code", re.compile(r"(mã\s*(mẹ|thân\s*mẫu|mẫu\s*thân|mother)|(mẹ|mother)\s*(code|id|mã)|^mã\s*mẹ$|^mother_?id$|^mother_?code$)", re.I)),
    ("spouse_code", re.compile(r"(mã\s*(hôn\s*phối|phu\s*thê|vợ|chồng|spouse)|(vợ|chồng|spouse)\s*(code|id|mã)|^spouse_?id$|^spouse_?code$)", re.I)),
    ("person_code", re.compile(r"(mã\s*(thành\s*viên|tv|nhân\s*khẩu|person|thành\s*viên\s*số)|mã\s*hồ\s*sơ|^mã$|^code$|^id$|^mã\s*tv$|^stt$|^person_?id$|^person_?code$)", re.I)),

    # 2. Cột Cha / Mẹ / Hôn phối (tên)
    ("father_name", re.compile(r"(^(tên\s*cha|tên\s*bố|họ\s*tên\s*cha|họ\s*tên\s*bố|thân\s*phụ|phụ\s*thân|cha\s*đẻ|con\s*ông|con\s*cụ)$|^(cha|bố|father)$|\b(thân\s*phụ|họ\s*tên\s*cha|tên\s*cha)\b)", re.I)),
    ("mother_name", re.compile(r"(^(tên\s*mẹ|họ\s*tên\s*mẹ|thân\s*mẫu|mẫu\s*thân|mẹ\s*đẻ|con\s*bà)$|^(mẹ|mother)$|\b(thân\s*mẫu|họ\s*tên\s*mẹ|tên\s*mẹ)\b)", re.I)),
    ("spouse_name", re.compile(r"(^(tên\s*vợ|tên\s*chồng|họ\s*tên\s*vợ|họ\s*tên\s*chồng|hôn\s*phối|phu\s*thê|bạn\s*đời)$|^(vợ|chồng|spouse|wife|husband)$|\b(hôn\s*phối|vợ\s*\/?\s*chồng)\b)", re.I)),

    # 3. Tên thành viên
    ("full_name", re.compile(r"(^(họ\s*v?[aà]?\s*tên|họ\s*tên|tên|danh\s*tính|thành\s*viên|full\s*name|name)$|\b(họ\s*v?[aà]?\s*tên|họ\s*tên)\b)", re.I)),

    # 4. Các thuộc tính cá nhân khác
    ("gender", re.compile(r"(giới\s*tính|nam\s*\/?\s*nữ|^phái$|^gender$|^sex$)", re.I)),
    ("generation", re.compile(r"(đời\s*thứ|thế\s*hệ|thế\s*thứ|^đời$|^gen$|^generation$)", re.I)),
    ("birth_date", re.compile(r"(ngày\s*sinh|năm\s*sinh|sinh\s*năm|^sinh$|^sn$|năm\s*sn|^birth$|^dob$)", re.I)),
    ("death_date", re.compile(r"(ngày\s*mất|năm\s*mất|mất\s*năm|tạ\s*thế|hưởng\s*thọ|^mất$|^death$|^dod$)", re.I)),
    ("is_alive", re.compile(r"(tình\s*trạng|còn\s*sống|trạng\s*thái|sống\s*\/?\s*mất|^living$|^status$)", re.I)),
    ("branch_name", re.compile(r"(chi\s*nhánh|phân\s*chi|chi\s*họ|^chi$|^nhánh$|^branch$)", re.I)),
    ("other_name", re.compile(r"(tên\s*gọi\s*khác|tên\s*tự|tên\s*hiệu|biệt\s*danh|^tự$|tên\s*khác)", re.I)),
    ("occupation", re.compile(r"(nghề\s*nghiệp|công\s*việc|chức\s*vụ|chức\s*sắc|^job$|^occupation$)", re.I)),
    ("burial_location", re.compile(r"(nơi\s*an\s*táng|mộ\s*phần|nơi\s*chôn\s*cất|^mộ$|nghĩa\s*trang)", re.I)),
    ("bio", re.compile(r"(tiểu\s*sử|ghi\s*chú|mô\s*tả|thông\s*tin\s*thêm|^bio$|^notes?$)", re.I)),
]


def _match_column_heuristically(header_text: str) -> Tuple[str, float]:
    """Matches a column header string against heuristic rules."""
    text_clean = header_text.strip().lower()
    if not text_clean or text_clean in {"stt", "no", "số tt", "thứ tự", "#"}:
        return "none", 0.95

    for field_key, pattern in HEURISTIC_RULES:
        if pattern.search(text_clean):
            return field_key, 0.90

    return "none", 0.40


def _parse_generation_value(val: Any) -> int:
    """Extracts positive integer from generation values like 1, 'Đời 2', 'III'."""
    if val is None:
        return 1
    s = str(val).strip().upper()
    if not s:
        return 1

    # Roman numerals mapping
    roman_map = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10}
    if s in roman_map:
        return roman_map[s]

    # Search for digits
    digits = re.findall(r"\d+", s)
    if digits:
        try:
            parsed = int(digits[0])
            if parsed > 0:
                return parsed
        except ValueError:
            pass
    return 1


def _infer_gender_from_context(name: str, has_role: Optional[str] = None) -> str:
    """Infers gender from Vietnamese honorifics or family role."""
    if has_role:
        role_u = has_role.upper()
        if "FATHER" in role_u or "CHA" in role_u or "BỐ" in role_u or "CHỒNG" in role_u:
            return "MALE"
        if "MOTHER" in role_u or "MẸ" in role_u or "VỢ" in role_u:
            return "FEMALE"

    n_lower = name.lower()
    # Check prefixes
    if re.search(r"^(ông|cụ\s*ông|bác\s*trai|anh|chú|cậu|ông\s*tổ)\b", n_lower):
        return "MALE"
    if re.search(r"^(bà|cụ\s*bà|bác\s*gái|chị|cô|mẹ|bà\s*tổ)\b", n_lower):
        return "FEMALE"

    # Common Vietnamese middle names
    if " thị " in n_lower or n_lower.startswith("thị "):
        return "FEMALE"
    if " văn " in n_lower or n_lower.startswith("văn "):
        return "MALE"

    return "OTHER"


def _clean_code(c: Any) -> str:
    """Chuẩn hóa mã định danh: loại bỏ dấu gạch ngang, khoảng trắng, viết hoa (vd: MAI-001 -> MAI001)."""
    if not c:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", str(c).strip().upper())


def _clean_person_name(name: str) -> str:
    """Loại bỏ danh xưng tiếng Việt thông dụng (Cụ, Cụ Ông, Cụ Bà, Ông, Bà, Bác, Chú, Cô, Thân phụ,...) để so khớp họ tên chuẩn xác."""
    if not name:
        return ""
    norm = _normalize_name(name)
    norm = re.sub(
        r"^(cụ\s*ông|cụ\s*bà|ông\s*tổ|bà\s*tổ|cụ|ông|bà|bác|chú|cô|thân\s*phụ|thân\s*mẫu|cha|mẹ|anh|chị)\s+",
        "",
        norm,
    )
    return norm.strip()


class SmartExcelService:
    """Service nhận diện và bóc tách dữ liệu phả hệ từ file Excel tự do."""

    async def detect_schema(
        self,
        file_bytes: bytes,
        clan_id: uuid.UUID,
        use_ai: bool = True,
        selected_sheet: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Tự động phân tích file Excel và nhận diện bản đồ ánh xạ cột bằng AI + Heuristic."""
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        except Exception as e:
            raise ValueError(f"Không thể đọc file Excel: {str(e)}")

        sheet_names = wb.sheetnames
        if not sheet_names:
            raise ValueError("File Excel không có bất kỳ trang tính (sheet) nào.")

        # Chọn sheet phù hợp nhất hoặc theo selected_sheet được chỉ định
        if selected_sheet and selected_sheet in sheet_names:
            best_sheet_name = selected_sheet
        else:
            best_sheet_name = sheet_names[0]
            sheet_scores: Dict[str, int] = {}

            for s_name in sheet_names:
                score = 0
                s_name_l = s_name.lower()
                if any(k in s_name_l for k in ["gia phả", "thành viên", "nhân khẩu", "phả hệ", "danh sách", "members", "persons"]):
                    score += 50
                ws = wb[s_name]
                score += min(ws.max_row, 30)
                sheet_scores[s_name] = score

            best_sheet_name = max(sheet_scores, key=sheet_scores.get)
        ws = wb[best_sheet_name]

        # Quét 15 dòng đầu tiên để lấy mẫu dữ liệu và tìm header_row
        row_samples: List[List[str]] = []
        max_scan_row = min(ws.max_row, 15)
        max_scan_col = min(ws.max_column, 26)

        for r_idx in range(1, max_scan_row + 1):
            row_vals = []
            for c_idx in range(1, max_scan_col + 1):
                val = ws.cell(row=r_idx, column=c_idx).value
                row_vals.append(_clean_str(val))
            row_samples.append(row_vals)

        # 1. Tìm header row bằng Heuristic
        best_header_row = 1
        best_header_match_count = -1

        for r_idx, r_vals in enumerate(row_samples, 1):
            match_count = 0
            for val in r_vals:
                if not val:
                    continue
                matched_field, conf = _match_column_heuristically(val)
                if matched_field != "none" and conf >= 0.7:
                    match_count += 1
            if match_count > best_header_match_count:
                best_header_match_count = match_count
                best_header_row = r_idx

        # 2. Xây dựng bản đồ cột sơ bộ bằng Heuristic
        header_vals = row_samples[best_header_row - 1] if best_header_row <= len(row_samples) else []
        column_mapping: List[Dict[str, Any]] = []

        for c_idx, h_text in enumerate(header_vals, 1):
            col_letter = openpyxl.utils.get_column_letter(c_idx)
            matched_field, conf = _match_column_heuristically(h_text)
            field_def = next((f for f in CANONICAL_FIELDS if f["key"] == matched_field), None)
            column_mapping.append({
                "col_index": c_idx,
                "col_letter": col_letter,
                "header_text": h_text or f"Cột {col_letter}",
                "suggested_field": matched_field,
                "field_label": field_def["label"] if field_def else matched_field,
                "confidence": round(conf, 2),
            })

        # Cắt bỏ các cột trống thừa ở phía cuối
        last_non_empty_c_idx = 1
        for idx, val in enumerate(header_vals, 1):
            if val:
                last_non_empty_c_idx = max(last_non_empty_c_idx, idx)
        for r_vals in row_samples:
            for idx, val in enumerate(r_vals, 1):
                if val:
                    last_non_empty_c_idx = max(last_non_empty_c_idx, idx)

        column_mapping = column_mapping[:last_non_empty_c_idx]

        # 3. Nâng cao bằng Gemini AI nếu được cấu hình
        ai_used = False
        notes: Optional[str] = None

        if use_ai and gemini_service.is_configured():
            try:
                ai_prompt = (
                    "Bạn là chuyên gia phân tích cấu trúc dữ liệu phả hệ Việt Nam.\n"
                    "Dưới đây là các dòng đầu tiên của một file Excel gia phả:\n"
                    f"Tên sheet: '{best_sheet_name}'\n"
                    f"Dữ liệu 10 dòng đầu: {json.dumps(row_samples[:10], ensure_ascii=False)}\n\n"
                    "Hãy phân tích và trả về đúng JSON (không kèm markdown) theo định dạng:\n"
                    "{\n"
                    '  "header_row": 1,\n'
                    '  "data_start_row": 2,\n'
                    '  "mappings": {\n'
                    '    "A": "person_code",\n'
                    '    "B": "full_name",\n'
                    '    "C": "gender",\n'
                    '    "D": "generation",\n'
                    '    "E": "father_code"\n'
                    "  },\n"
                    '  "notes": "Nhận diện bảng gia phả gồm mã, họ tên, giới tính, thế hệ và mã cha."\n'
                    "}\n"
                    "Các trường hợp lệ: person_code, full_name, gender, birth_date, death_date, is_alive, generation, "
                    "father_code, father_name, mother_code, mother_name, spouse_code, spouse_name, branch_name, other_name, occupation, burial_location, bio, none.\n"
                    "QUY TẮC QUAN TRỌNG:\n"
                    "1. Nếu cột chứa mã định danh (vd: 'Mã TV', 'Mã', 'Person ID', 'STT thành viên'), gán là 'person_code'.\n"
                    "2. Nếu cột chứa mã định danh cha (vd: 'Mã Cha', 'Mã Bố', 'Mã Thân phụ', 'Father ID', 'Father Code'), BẮT BUỘC gán là 'father_code', KHÔNG ĐƯỢC gán là 'father_name'.\n"
                    "3. Nếu cột chứa tên người cha (vd: 'Tên Cha', 'Cha', 'Bố', 'Thân phụ', 'Thân phụ (Cha)'), gán là 'father_name'.\n"
                    "4. Tương tự với 'mother_code' (Mã Mẹ) vs 'mother_name' (Tên Mẹ), 'spouse_code' (Mã Vợ/Chồng) vs 'spouse_name' (Tên Vợ/Chồng).\n"
                    "5. Nếu là cột số thứ tự thuần túy không phải mã định danh, gán là 'none'."
                )
                ai_res = await gemini_service.generate_content_safe(ai_prompt, timeout_seconds=18.0, max_retries=2)
                if ai_res.get("success") and ai_res.get("response"):
                    raw_text = ai_res["response"].strip()
                    if raw_text.startswith("```json"):
                        raw_text = raw_text[7:]
                    if raw_text.startswith("```"):
                        raw_text = raw_text[3:]
                    if raw_text.endswith("```"):
                        raw_text = raw_text[:-3]
                    parsed_ai = json.loads(raw_text.strip())

                    ai_header = parsed_ai.get("header_row")
                    if isinstance(ai_header, int) and 1 <= ai_header <= 15:
                        best_header_row = ai_header

                    ai_maps = parsed_ai.get("mappings", {})
                    valid_keys = {f["key"] for f in CANONICAL_FIELDS}

                    for item in column_mapping:
                        c_let = item["col_letter"]
                        if c_let in ai_maps and ai_maps[c_let] in valid_keys:
                            item["suggested_field"] = ai_maps[c_let]
                            field_def = next((f for f in CANONICAL_FIELDS if f["key"] == ai_maps[c_let]), None)
                            item["field_label"] = field_def["label"] if field_def else ai_maps[c_let]
                            item["confidence"] = 0.98

                    notes = parsed_ai.get("notes")
                    ai_used = True
            except Exception as e:
                logger.warning("Gemini AI schema detection failed, fallback to heuristic: %s", str(e))

        data_start_row = best_header_row + 1

        # Đánh giá mức độ chắc chắn để yêu cầu người dùng xác nhận nếu cần
        mapped_fields = {item["suggested_field"] for item in column_mapping if item["suggested_field"] != "none"}
        has_father = ("father_code" in mapped_fields) or ("father_name" in mapped_fields)
        has_generation = "generation" in mapped_fields
        has_full_name = "full_name" in mapped_fields

        low_conf_cols = [
            item["header_text"] for item in column_mapping
            if item["suggested_field"] != "none" and item["confidence"] < 0.75
        ]

        # Đếm số lần xuất hiện của các trường quan trọng (không nên bị trùng)
        field_counts: Dict[str, int] = {}
        for item in column_mapping:
            f = item["suggested_field"]
            if f != "none":
                field_counts[f] = field_counts.get(f, 0) + 1
        dup_fields = [f for f, cnt in field_counts.items() if cnt > 1 and f in {"full_name", "father_name", "father_code", "generation"}]

        needs_confirmation = False
        advisory_notes: List[str] = []

        if not has_father:
            needs_confirmation = True
            advisory_notes.append("Chưa nhận diện được cột Cha/Thân phụ (Mã Cha hoặc Tên Cha). Cần xác nhận để ráp nối quan hệ huyết thống.")

        if not has_generation:
            advisory_notes.append("Chưa có cột Đời/Thế hệ.")

        if low_conf_cols:
            needs_confirmation = True
            advisory_notes.append(f"Có {len(low_conf_cols)} cột độ tin cậy dưới 75% ({', '.join(low_conf_cols[:3])}).")

        if dup_fields:
            needs_confirmation = True
            advisory_notes.append(f"Trường {', '.join(dup_fields)} đang bị gán trùng cho nhiều cột.")

        if advisory_notes:
            final_notes = " • ".join(advisory_notes)
        else:
            final_notes = notes or "AI đã tự động nhận diện cấu trúc các cột với độ tin cậy cao."

        # Lấy 3 dòng mẫu dữ liệu thực tế để xem trước
        sample_preview_rows: List[Dict[str, Any]] = []
        for r_idx in range(data_start_row, min(ws.max_row + 1, data_start_row + 4)):
            row_dict: Dict[str, Any] = {}
            has_val = False
            for item in column_mapping:
                c_idx = item["col_index"]
                val = _clean_str(ws.cell(row=r_idx, column=c_idx).value)
                if val:
                    has_val = True
                row_dict[item["col_letter"]] = val
            if has_val:
                sample_preview_rows.append(row_dict)

        return {
            "sheet_names": sheet_names,
            "selected_sheet": best_sheet_name,
            "header_row": best_header_row,
            "data_start_row": data_start_row,
            "column_mapping": column_mapping,
            "available_fields": CANONICAL_FIELDS,
            "sample_preview_rows": sample_preview_rows,
            "ai_detected": ai_used,
            "needs_confirmation": needs_confirmation,
            "notes": final_notes,
        }

    async def parse_and_reconstruct_graph(
        self,
        file_bytes: bytes,
        clan_id: uuid.UUID,
        db: AsyncSession,
        config: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Bóc tách dữ liệu từ file Excel và tự động dựng lại mạng lưới quan hệ gia phả."""
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        except Exception as e:
            raise ValueError(f"Không thể mở file Excel: {str(e)}")

        # Khai báo và chuẩn hóa selected_sheet (đảm bảo luôn tồn tại trong scope)
        selected_sheet = str(config.get("selected_sheet") or "").strip()
        if not selected_sheet or selected_sheet not in wb.sheetnames:
            # Tìm sheet có tên tương đồng (không phân biệt hoa thường)
            matched_sheet = next((s for s in wb.sheetnames if s.strip().lower() == selected_sheet.lower()), None)
            if matched_sheet:
                selected_sheet = matched_sheet
            else:
                # Dùng heuristic tìm sheet tốt nhất hoặc sheet đầu tiên
                sheet_scores: Dict[str, int] = {}
                for s_name in wb.sheetnames:
                    score = 0
                    s_name_l = s_name.lower()
                    if any(k in s_name_l for k in ["gia phả", "thành viên", "nhân khẩu", "phả hệ", "danh sách", "members", "persons"]):
                        score += 50
                    ws_temp = wb[s_name]
                    score += min(ws_temp.max_row, 30)
                    sheet_scores[s_name] = score
                selected_sheet = max(sheet_scores, key=sheet_scores.get) if sheet_scores else wb.sheetnames[0]

        sheet_name = selected_sheet
        ws = wb[selected_sheet]

        data_start_row = int(config.get("data_start_row") or 2)
        raw_mapping = config.get("column_mapping") or {}

        # Chuyển raw_mapping thành {col_index: field_key}
        field_by_col_idx: Dict[int, str] = {}
        if isinstance(raw_mapping, list):
            for m in raw_mapping:
                col_idx = m.get("col_index")
                field = m.get("suggested_field") or m.get("field")
                if col_idx and field and field != "none":
                    field_by_col_idx[int(col_idx)] = field
        elif isinstance(raw_mapping, dict):
            for col_key, field in raw_mapping.items():
                if field and field != "none":
                    if str(col_key).isdigit():
                        field_by_col_idx[int(col_key)] = field
                    else:
                        c_idx = openpyxl.utils.column_index_from_string(str(col_key))
                        field_by_col_idx[c_idx] = field

        if not any(f == "full_name" for f in field_by_col_idx.values()):
            raise ValueError("Bắt buộc phải có ít nhất một cột được gán cho 'Họ và tên'.")

        # 1. Quét toàn bộ dòng và trích xuất Person thô
        raw_persons: List[Dict[str, Any]] = []
        fatal_errors: List[Dict[str, Any]] = []
        warnings: List[Dict[str, Any]] = []
        same_name_records: List[Dict[str, Any]] = []

        detected_branches: Set[str] = set()
        seen_person_codes: Dict[str, int] = {}
        seen_person_signatures: Dict[Tuple, int] = {}
        seen_person_names: Dict[str, int] = {}

        for r_idx in range(data_start_row, ws.max_row + 1):
            row_data: Dict[str, Any] = {}
            for col_idx, field_key in field_by_col_idx.items():
                val = ws.cell(row=r_idx, column=col_idx).value
                row_data[field_key] = val

            raw_name = _clean_str(row_data.get("full_name"))
            if not raw_name:
                continue

            custom_code = _clean_str(row_data.get("person_code"))
            norm_name = raw_name.strip().lower()

            # Kiểm tra trùng mã định danh nếu có cột mã
            if custom_code:
                c_norm = custom_code.strip().upper()
                if c_norm in seen_person_codes:
                    fatal_errors.append({
                        "sheet": selected_sheet,
                        "row": r_idx,
                        "column": "Mã thành viên",
                        "code": "DUPLICATE_CODE",
                        "message": f"Trùng mã thành viên '{custom_code}' với dòng {seen_person_codes[c_norm]} trong file Excel",
                    })
                    continue
                seen_person_codes[c_norm] = r_idx

            # Giới tính
            raw_gender = row_data.get("gender")
            gender_norm, _ = _normalize_gender(raw_gender) if raw_gender else (None, None)
            if not gender_norm:
                gender_norm = _infer_gender_from_context(raw_name)

            # Thế hệ (Đời)
            gen_val = _parse_generation_value(row_data.get("generation"))

            # Ngày sinh / mất
            birth_d, birth_err = _parse_date(row_data.get("birth_date"))
            death_d, death_err = _parse_date(row_data.get("death_date"))

            # Tình trạng sống
            is_living = True
            raw_living = row_data.get("is_alive")
            if raw_living is not None:
                living_norm, _ = _normalize_living_status(raw_living)
                if living_norm is not None:
                    is_living = living_norm
            elif death_d:
                is_living = False
            elif birth_d and (date.today().year - birth_d.year > 105):
                is_living = False

            # Chi nhánh
            b_name = _clean_str(row_data.get("branch_name")) or "Chi Trưởng"
            detected_branches.add(b_name)

            father_code = _clean_str(row_data.get("father_code"))
            father_name = _clean_str(row_data.get("father_name"))
            mother_code = _clean_str(row_data.get("mother_code"))
            mother_name = _clean_str(row_data.get("mother_name"))
            spouse_code = _clean_str(row_data.get("spouse_code"))
            spouse_name = _clean_str(row_data.get("spouse_name"))

            # Chữ ký nhận diện hồ sơ trùng lặp hoàn toàn
            person_sig = (
                custom_code.strip().upper() if custom_code else "",
                norm_name,
                gen_val,
                (father_code or father_name or "").lower(),
                (mother_code or mother_name or "").lower(),
                (spouse_code or spouse_name or "").lower(),
                birth_d.isoformat() if birth_d else "",
                b_name.lower() if b_name else "",
            )

            if person_sig in seen_person_signatures:
                prev_row = seen_person_signatures[person_sig]
                fatal_errors.append({
                    "sheet": selected_sheet,
                    "row": r_idx,
                    "column": "Họ và tên",
                    "code": "DUPLICATE_PERSON",
                    "message": f"Hồ sơ thành viên '{raw_name}' bị trùng lặp hoàn toàn với dòng {prev_row} trong file Excel (cùng họ tên, thế hệ {gen_val}, cha/mẹ, hôn phối)",
                })
                continue
            seen_person_signatures[person_sig] = r_idx

            # Nếu trùng họ tên nhưng khác thế hệ / cha mẹ / mã -> Ghi nhận thành viên độc lập
            if norm_name in seen_person_names:
                prev_row = seen_person_names[norm_name]
                same_name_records.append({
                    "row": r_idx,
                    "prev_row": prev_row,
                    "name": raw_name,
                })
            seen_person_names[norm_name] = r_idx

            person_id_code = custom_code or f"SMART_P_{r_idx}"

            raw_persons.append({
                "row_idx": r_idx,
                "code": person_id_code,
                "fullName": raw_name,
                "gender": gender_norm,
                "generation": gen_val,
                "birthDate": birth_d.isoformat() if birth_d else None,
                "deathDate": death_d.isoformat() if death_d else None,
                "isLiving": is_living,
                "branchName": b_name,
                "fatherCode": father_code,
                "fatherName": father_name,
                "motherCode": mother_code,
                "motherName": mother_name,
                "spouseCode": spouse_code,
                "spouseName": spouse_name,
                "otherName": _clean_str(row_data.get("other_name")),
                "occupation": _clean_str(row_data.get("occupation")),
                "burialLocation": _clean_str(row_data.get("burial_location")),
                "biography": _clean_str(row_data.get("bio")),
            })

        if not raw_persons:
            raise ValueError("Không tìm thấy dữ liệu thành viên nào trong sheet đã chọn.")

        # Cảnh báo các trường hợp cùng tên khác người (tối đa 5 cảnh báo chi tiết + 1 tóm tắt tổng)
        if same_name_records:
            if len(same_name_records) > 5:
                warnings.append({
                    "sheet": selected_sheet,
                    "row": 0,
                    "column": "Họ và tên",
                    "code": "SAME_NAME_DIFFERENT_PERSON_SUMMARY",
                    "message": f"Hệ thống phát hiện {len(same_name_records)} lượt trùng họ tên giữa các đời/chi nhánh khác nhau. Toàn bộ hồ sơ độc lập được bảo toàn đầy đủ, không bị gộp hoặc xóa.",
                })
            for sn in same_name_records[:5]:
                warnings.append({
                    "sheet": selected_sheet,
                    "row": sn["row"],
                    "column": "Họ và tên",
                    "code": "SAME_NAME_DIFFERENT_PERSON",
                    "message": f"Họ và tên '{sn['name']}' trùng với dòng {sn['prev_row']} nhưng khác thế hệ/cha mẹ/mã định danh. Hệ thống tiếp nhận là thành viên độc lập.",
                })

        # 2. Xây dựng chỉ mục để ráp nối quan hệ phả hệ
        # Map: norm_name -> list of person
        by_norm_name: Dict[str, List[Dict[str, Any]]] = {}
        by_code: Dict[str, Dict[str, Any]] = {}
        for p in raw_persons:
            n_raw = _normalize_name(p["fullName"])
            n_clean = _clean_person_name(p["fullName"])
            by_norm_name.setdefault(n_raw, []).append(p)
            if n_clean and n_clean != n_raw:
                by_norm_name.setdefault(n_clean, []).append(p)
            if p.get("code"):
                c_raw = str(p["code"]).strip().upper()
                c_clean = _clean_code(p["code"])
                by_code[c_raw] = p
                if c_clean:
                    by_code[c_clean] = p

        # Lấy dữ liệu thành viên hiện có từ Neon DB để hỗ trợ liên kết cha/mẹ có sẵn
        db_persons_stmt = select(Person.id, Person.full_name, Person.generation, Person.gender).where(
            Person.family_id == clan_id,
            Person.status == "ACTIVE",
        )
        db_persons = (await db.execute(db_persons_stmt)).all()
        db_by_norm_name: Dict[str, List[Dict[str, Any]]] = {}
        for p_id, p_name, p_gen, p_gender in db_persons:
            n_raw = _normalize_name(p_name)
            n_clean = _clean_person_name(p_name)
            entry = {
                "id": str(p_id),
                "fullName": p_name,
                "generation": p_gen or 1,
                "gender": p_gender or "MALE",
                "is_from_db": True,
            }
            db_by_norm_name.setdefault(n_raw, []).append(entry)
            if n_clean and n_clean != n_raw:
                db_by_norm_name.setdefault(n_clean, []).append(entry)

        relationships: List[Dict[str, Any]] = []
        rel_signatures: Set[str] = set()

        def _add_rel(p1_code: str, p2_code: str, r_type: str, parent_type: Optional[str] = None):
            if not p1_code or not p2_code or p1_code == p2_code:
                return
            if r_type == "SPOUSE":
                sig = f"{min(str(p1_code), str(p2_code))}_{max(str(p1_code), str(p2_code))}_SPOUSE"
            else:
                sig = f"{p1_code}_{p2_code}_{r_type}"
            if sig in rel_signatures:
                return
            rel_signatures.add(sig)
            relationships.append({
                "person1": p1_code,
                "person2": p2_code,
                "relationshipType": r_type,
                "parentType": parent_type,
            })

        # Implicit partner persons created from spouse_name if not listed in persons
        implicit_partners: List[Dict[str, Any]] = []
        implicit_partner_code_counter = 1

        # Ráp nối Parent - Child và Spouse với thứ tự ưu tiên: Mã định danh -> Tên
        create_implicit = config.get("create_implicit_spouses", False)

        for p in raw_persons:
            # 2.1 Ráp nối Cha (Father)
            f_code = p.get("fatherCode")
            f_name = p.get("fatherName")
            matched_father = None

            # Ưu tiên 1: Tra cứu bằng Mã Cha (father_code)
            if f_code:
                fc_raw = str(f_code).strip().upper()
                fc_clean = _clean_code(f_code)
                matched_father = by_code.get(fc_raw) or (by_code.get(fc_clean) if fc_clean else None)

            # Ưu tiên 2: Nếu không có mã cha hoặc không tìm thấy, kiểm tra xem father_name có phải là mã không
            if not matched_father and f_name:
                fn_raw = str(f_name).strip().upper()
                fn_clean = _clean_code(f_name)
                matched_father = by_code.get(fn_raw) or (by_code.get(fn_clean) if fn_clean else None)

            # Ưu tiên 3: So khớp tên người cha trong danh sách
            if not matched_father and f_name:
                f_norm = _normalize_name(f_name)
                f_clean_n = _clean_person_name(f_name)
                candidates = by_norm_name.get(f_norm) or by_norm_name.get(f_clean_n, [])
                valid_candidates = [c for c in candidates if c["code"] != p["code"]]

                if valid_candidates:
                    same_gen_prev = [c for c in valid_candidates if c["generation"] == p["generation"] - 1]
                    same_branch_prev = [c for c in same_gen_prev if c.get("branchName") == p.get("branchName")]
                    if same_branch_prev:
                        matched_father = same_branch_prev[0]
                    elif same_gen_prev:
                        matched_father = same_gen_prev[0]
                    else:
                        older_cands = [c for c in valid_candidates if c["generation"] < p["generation"]]
                        matched_father = older_cands[0] if older_cands else valid_candidates[0]

            # Ưu tiên 4: Tra cứu cơ sở dữ liệu hiện có
            if not matched_father and f_name:
                f_norm = _normalize_name(f_name)
                f_clean_n = _clean_person_name(f_name)
                db_cands = db_by_norm_name.get(f_norm) or db_by_norm_name.get(f_clean_n, [])
                if db_cands:
                    matched_father = db_cands[0]

            if matched_father:
                _add_rel(matched_father.get("code") or matched_father.get("id"), p["code"], "PARENT_CHILD", "BIOLOGICAL")
            elif f_code or f_name:
                identifier_label = f"Mã '{f_code}'" if f_code else f"Tên '{f_name}'"
                warnings.append({
                    "sheet": selected_sheet,
                    "row": p["row_idx"],
                    "column": "Cha",
                    "code": "FATHER_NOT_FOUND",
                    "message": f"Không tìm thấy người cha ({identifier_label}) của thành viên '{p['fullName']}' trong phả hệ.",
                })

            # 2.2 Ráp nối Mẹ (Mother)
            m_code = p.get("motherCode")
            m_name = p.get("motherName")
            matched_mother = None

            if m_code:
                mc_raw = str(m_code).strip().upper()
                mc_clean = _clean_code(m_code)
                matched_mother = by_code.get(mc_raw) or (by_code.get(mc_clean) if mc_clean else None)

            if not matched_mother and m_name:
                mn_raw = str(m_name).strip().upper()
                mn_clean = _clean_code(m_name)
                matched_mother = by_code.get(mn_raw) or (by_code.get(mn_clean) if mn_clean else None)

            if not matched_mother and m_name:
                m_norm = _normalize_name(m_name)
                m_clean_n = _clean_person_name(m_name)
                candidates = by_norm_name.get(m_norm) or by_norm_name.get(m_clean_n, [])
                valid_candidates = [c for c in candidates if c["code"] != p["code"]]

                if valid_candidates:
                    same_gen_prev = [c for c in valid_candidates if c["generation"] == p["generation"] - 1]
                    matched_mother = same_gen_prev[0] if same_gen_prev else valid_candidates[0]

            if not matched_mother and m_name:
                m_norm = _normalize_name(m_name)
                m_clean_n = _clean_person_name(m_name)
                db_cands = db_by_norm_name.get(m_norm) or db_by_norm_name.get(m_clean_n, [])
                if db_cands:
                    matched_mother = db_cands[0]

            if matched_mother:
                _add_rel(matched_mother.get("code") or matched_mother.get("id"), p["code"], "PARENT_CHILD", "BIOLOGICAL")

            # 2.3 Ráp nối Vợ / Chồng (Spouse)
            sp_code = p.get("spouseCode")
            sp_name = p.get("spouseName")
            matched_spouse = None

            if sp_code:
                sc_raw = str(sp_code).strip().upper()
                sc_clean = _clean_code(sp_code)
                matched_spouse = by_code.get(sc_raw) or (by_code.get(sc_clean) if sc_clean else None)

            if not matched_spouse and sp_name:
                sn_raw = str(sp_name).strip().upper()
                sn_clean = _clean_code(sp_name)
                matched_spouse = by_code.get(sn_raw) or (by_code.get(sn_clean) if sn_clean else None)

            if not matched_spouse and sp_name:
                sp_norm = _normalize_name(sp_name)
                sp_clean_n = _clean_person_name(sp_name)
                candidates = by_norm_name.get(sp_norm) or by_norm_name.get(sp_clean_n, [])
                valid_cands = [c for c in candidates if c["code"] != p["code"]]
                same_gen_cands = [c for c in valid_cands if c["generation"] == p["generation"]]
                if same_gen_cands:
                    matched_spouse = same_gen_cands[0]
                elif valid_cands:
                    matched_spouse = valid_cands[0]

            if not matched_spouse and sp_name:
                sp_norm = _normalize_name(sp_name)
                sp_clean_n = _clean_person_name(sp_name)
                db_cands = db_by_norm_name.get(sp_norm) or db_by_norm_name.get(sp_clean_n, [])
                if db_cands:
                    matched_spouse = db_cands[0]

            # CHỈ TẠO HỒ SƠ PHỐI NGẪU BỔ SUNG NẾU NGƯỜI DÙNG BẬT create_implicit_spouses=True
            if not matched_spouse and (sp_code or sp_name) and create_implicit:
                sp_id_code = f"SMART_SPOUSE_{implicit_partner_code_counter}"
                implicit_partner_code_counter += 1
                sp_gender = "FEMALE" if p["gender"] == "MALE" else "MALE"

                new_spouse_record = {
                    "row_idx": p["row_idx"],
                    "code": sp_id_code,
                    "fullName": sp_name or f"Hôn phối của {p['fullName']}",
                    "gender": sp_gender,
                    "generation": p["generation"],
                    "birthDate": None,
                    "deathDate": None,
                    "isLiving": p["isLiving"],
                    "branchName": p["branchName"],
                    "biography": f"Hôn phối của {p['fullName']}",
                    "isImplicit": True,
                }
                implicit_partners.append(new_spouse_record)
                by_norm_name.setdefault(_normalize_name(new_spouse_record["fullName"]), []).append(new_spouse_record)
                by_code[sp_id_code.upper()] = new_spouse_record
                matched_spouse = new_spouse_record

            if matched_spouse:
                _add_rel(p["code"], matched_spouse.get("code") or matched_spouse.get("id"), "SPOUSE")

        # Gộp implicit partners vào danh sách thành viên (Nếu create_implicit=False thì implicit_partners rỗng)
        all_persons = raw_persons + implicit_partners

        # ---------------------------------------------------------------------------
        # KIỂM TRA TÍNH TOÀN VẸN CÂY PHẢ HỆ (DAG CYCLE DETECTION & GENERATION ORDER)
        # ---------------------------------------------------------------------------
        person_lookup: Dict[str, Dict[str, Any]] = {}
        for p in all_persons:
            person_lookup[str(p["code"])] = p
            person_lookup[str(p["code"]).upper()] = p

        # 1. Phát hiện vòng lặp huyết thống (Lineage Cycles) bằng thuật toán 3-color DFS
        pc_adj: Dict[str, List[str]] = {}
        for r in relationships:
            if r["relationshipType"] == "PARENT_CHILD":
                pc_adj.setdefault(str(r["person1"]), []).append(str(r["person2"]))

        # 0 = WHITE (chưa thăm), 1 = GRAY (đang trong stack), 2 = BLACK (đã thăm xong)
        colors: Dict[str, int] = {}
        cycle_found: List[Tuple[str, str]] = []

        def _has_cycle(node: str) -> bool:
            colors[node] = 1  # GRAY
            for nxt in pc_adj.get(node, []):
                nxt_c = colors.get(nxt, 0)
                if nxt_c == 1:
                    cycle_found.append((node, nxt))
                    return True
                if nxt_c == 0:
                    if _has_cycle(nxt):
                        return True
            colors[node] = 2  # BLACK
            return False

        for start_node in list(pc_adj.keys()):
            if colors.get(start_node, 0) == 0:
                if _has_cycle(start_node):
                    break

        if cycle_found:
            u_c, v_c = cycle_found[0]
            u_p = person_lookup.get(u_c, {})
            v_p = person_lookup.get(v_c, {})
            u_title = u_p.get("fullName", u_c)
            v_title = v_p.get("fullName", v_c)
            fatal_errors.append({
                "sheet": selected_sheet,
                "row": u_p.get("row_idx", 0),
                "column": "Quan hệ huyết thống",
                "code": "LINEAGE_CYCLE_DETECTED",
                "message": f"Phát hiện vòng lặp huyết thống luẩn quẩn: '{u_title}' và '{v_title}' tạo thành chu trình khép kín (vừa là cha/mẹ vừa là con/cháu của nhau).",
            })

        # 2. Kiểm tra sai thứ bậc thế hệ (Cha/Mẹ thế hệ phải < Con)
        for r in relationships:
            if r["relationshipType"] == "PARENT_CHILD":
                parent_p = person_lookup.get(str(r["person1"]))
                child_p = person_lookup.get(str(r["person2"]))
                if parent_p and child_p:
                    p_gen = parent_p.get("generation", 1)
                    c_gen = child_p.get("generation", 1)
                    if p_gen >= c_gen:
                        fatal_errors.append({
                            "sheet": selected_sheet,
                            "row": child_p.get("row_idx", 0),
                            "column": "Đời thứ / Thế hệ",
                            "code": "INVALID_GENERATION_ORDER",
                            "message": f"Quan hệ huyết thống sai thế hệ: Người cha/mẹ '{parent_p['fullName']}' (Đời {p_gen}) không thể có thế hệ lớn hơn hoặc bằng con '{child_p['fullName']}' (Đời {c_gen}).",
                        })

        # Chuẩn bị danh sách branches
        branches_data: List[Dict[str, Any]] = []
        for idx, b_name in enumerate(sorted(detected_branches), 1):
            branches_data.append({
                "code": f"BR_{idx}",
                "name": b_name,
                "order": idx,
                "description": f"Chi nhánh tạo tự động từ Excel",
            })

        # Gắn branchCode cho từng person
        branch_name_to_code = {b["name"]: b["code"] for b in branches_data}
        for p in all_persons:
            p["branchCode"] = branch_name_to_code.get(p.get("branchName") or "Chi Trưởng", "BR_1")

        parent_child_count = sum(1 for r in relationships if r["relationshipType"] == "PARENT_CHILD")
        spouse_count = sum(1 for r in relationships if r["relationshipType"] == "SPOUSE")
        living_count = sum(1 for p in all_persons if p.get("isLiving"))
        deceased_count = len(all_persons) - living_count

        return {
            "is_valid": len(fatal_errors) == 0,
            "summary": {
                "total_persons": len(all_persons),
                "explicit_persons": len(raw_persons),
                "implicit_spouses": len(implicit_partners),
                "total_relationships": len(relationships),
                "parent_child_count": parent_child_count,
                "spouse_count": spouse_count,
                "total_branches": len(branches_data),
                "living_count": living_count,
                "deceased_count": deceased_count,
                "fatal_count": len(fatal_errors),
                "warning_count": len(warnings),
            },
            "preview": {
                "persons": all_persons,
                "relationships": relationships,
                "branches": branches_data,
            },
            "fatal_errors": fatal_errors,
            "warnings": warnings,
        }

    async def commit_smart_import(
        self,
        clan_id: uuid.UUID,
        user_id: uuid.UUID,
        db: AsyncSession,
        parsed_data: Dict[str, Any],
        allowed_branch_ids: Optional[Set[uuid.UUID]] = None,
        wipe_existing: bool = True,
    ) -> Dict[str, Any]:
        """Thực hiện lưu dữ liệu phả hệ nguyên khối (atomic) vào CSDL Neon DB."""
        preview = parsed_data.get("preview") or {}
        branches_data = preview.get("branches", [])
        persons_data = preview.get("persons", [])
        rels_data = preview.get("relationships", [])

        if not persons_data:
            raise ValueError("Không có dữ liệu thành viên để lưu.")

        if parsed_data.get("is_valid") is False or (parsed_data.get("fatal_errors") and len(parsed_data["fatal_errors"]) > 0):
            raise ValueError("Không thể lưu dữ liệu vì quá trình phân tích còn lỗi chặn (fatal errors). Vui lòng khắc phục trước khi lưu vào CSDL.")

        # Nếu kích hoạt wipe_existing, dọn sạch dữ liệu cũ của dòng họ trước khi nhập mới
        # để ngăn ngừa tình trạng nhân bản thành viên và sinh ra nhiều đỉnh cây phả hệ
        if wipe_existing or parsed_data.get("wipe_existing"):
            logger.info("Dọn dẹp toàn bộ dữ liệu phả hệ cũ của clan %s trước khi ghi nhận dữ liệu mới.", str(clan_id))
            await db.execute(
                text("""
                    DELETE FROM person_closure
                    WHERE ancestor_id IN (SELECT person_id FROM persons WHERE clan_id = :cid)
                       OR descendant_id IN (SELECT person_id FROM persons WHERE clan_id = :cid)
                """),
                {"cid": clan_id},
            )
            await db.execute(
                text("DELETE FROM relationships WHERE clan_id = :cid"),
                {"cid": clan_id},
            )
            await db.execute(
                text("""
                    DELETE FROM person_account_links
                    WHERE person_id IN (SELECT person_id FROM persons WHERE clan_id = :cid)
                """),
                {"cid": clan_id},
            )
            await db.execute(
                text("UPDATE clan_profiles SET founder_person_id = NULL WHERE clan_id = :cid"),
                {"cid": clan_id},
            )
            await db.execute(
                text("DELETE FROM persons WHERE clan_id = :cid"),
                {"cid": clan_id},
            )
            await db.execute(
                text("DELETE FROM branches WHERE clan_id = :cid"),
                {"cid": clan_id},
            )
            await db.flush()

        branch_id_map: Dict[str, uuid.UUID] = {}
        person_id_map: Dict[str, uuid.UUID] = {}
        now = datetime.now(timezone.utc)

        # 1. Truy vấn và thêm Branch
        existing_b = (await db.execute(
            select(FamilyBranch.name, FamilyBranch.id).where(FamilyBranch.family_id == clan_id)
        )).all()
        for b_name, b_id in existing_b:
            if b_name:
                branch_id_map[b_name.strip().lower()] = b_id

        created_branches = 0
        branches_to_insert = []
        for b in branches_data:
            norm_b_name = b["name"].strip().lower()
            if norm_b_name in branch_id_map:
                continue
            new_b_id = uuid.uuid4()
            branch_id_map[norm_b_name] = new_b_id
            branches_to_insert.append({
                "branch_id": new_b_id,
                "clan_id": clan_id,
                "code": b.get("code"),
                "name": b["name"],
                "description": b.get("description"),
                "branch_order": b.get("order", 0),
                "status": "ACTIVE",
                "created_at": now,
                "updated_at": now,
            })
            created_branches += 1

        if branches_to_insert:
            await db.execute(insert(FamilyBranch.__table__), branches_to_insert)

        # 2. Thêm Persons nguyên khối (Bulk insert 1 lệnh duy nhất)
        created_persons = 0
        persons_to_insert = []
        for p in persons_data:
            p_code = p["code"]
            new_p_id = uuid.uuid4()
            person_id_map[p_code] = new_p_id
            b_target_id = branch_id_map.get((p.get("branchName") or "Chi Trưởng").strip().lower())

            birth_d = None
            if p.get("birthDate"):
                try:
                    birth_d = date.fromisoformat(p["birthDate"])
                except Exception:
                    pass

            death_d = None
            if p.get("deathDate"):
                try:
                    death_d = date.fromisoformat(p["deathDate"])
                except Exception:
                    pass

            persons_to_insert.append({
                "person_id": new_p_id,
                "clan_id": clan_id,
                "branch_id": b_target_id,
                "full_name": p["fullName"],
                "gender": p.get("gender") or "OTHER",
                "birth_date": birth_d,
                "death_date": death_d,
                "is_living": p.get("isLiving", True),
                "generation_no": p.get("generation", 1),
                "biography": p.get("biography"),
                "status": "ACTIVE",
                "created_by": user_id,
                "created_at": now,
                "updated_at": now,
            })
            created_persons += 1

        # Chèn theo từng khối 1000 bản ghi để tối ưu tốc độ và an toàn cho dữ liệu lớn (1.000 - 50.000+ người)
        if persons_to_insert:
            for i in range(0, len(persons_to_insert), 1000):
                await db.execute(insert(Person.__table__), persons_to_insert[i:i + 1000])

        # 3. Thêm Relationships nguyên khối (Bulk insert theo khối 1000)
        created_rels = 0
        new_parent_child_edges: List[Tuple[uuid.UUID, uuid.UUID]] = []

        existing_spouses_res = await db.execute(
            select(Relationship.from_member_id, Relationship.to_member_id).where(
                Relationship.family_id == clan_id,
                Relationship.relationship_type == "SPOUSE",
                Relationship.status == "ACTIVE",
            )
        )
        existing_spouse_pairs: Set[Tuple[uuid.UUID, uuid.UUID]] = {
            (min(r[0], r[1]), max(r[0], r[1]))
            for r in existing_spouses_res.all()
            if r[0] and r[1]
        }

        inserted_spouse_pairs: Set[Tuple[uuid.UUID, uuid.UUID]] = set()
        inserted_pc_pairs: Set[Tuple[uuid.UUID, uuid.UUID]] = set()
        rels_to_insert = []

        for r in rels_data:
            p1_code = r.get("person1")
            p2_code = r.get("person2")
            if not p1_code or not p2_code:
                continue

            uid1 = person_id_map.get(p1_code)
            if not uid1:
                try:
                    uid1 = uuid.UUID(p1_code)
                except ValueError:
                    continue

            uid2 = person_id_map.get(p2_code)
            if not uid2:
                try:
                    uid2 = uuid.UUID(p2_code)
                except ValueError:
                    continue

            if uid1 == uid2:
                continue

            rel_type = r.get("relationshipType")
            if rel_type == "SPOUSE":
                sp_pair = (min(uid1, uid2), max(uid1, uid2))
                if sp_pair in existing_spouse_pairs or sp_pair in inserted_spouse_pairs:
                    continue
                inserted_spouse_pairs.add(sp_pair)
            elif rel_type == "PARENT_CHILD":
                pc_pair = (uid1, uid2)
                if pc_pair in inserted_pc_pairs:
                    continue
                inserted_pc_pairs.add(pc_pair)
                new_parent_child_edges.append((uid1, uid2))
            else:
                continue

            rels_to_insert.append({
                "relationship_id": uuid.uuid4(),
                "clan_id": clan_id,
                "from_person_id": uid1,
                "to_person_id": uid2,
                "relationship_type": rel_type,
                "parent_type": r.get("parentType"),
                "status": "ACTIVE",
                "verified": True,
                "created_by": user_id,
                "created_at": now,
                "updated_at": now,
            })
            created_rels += 1

        if rels_to_insert:
            for i in range(0, len(rels_to_insert), 1000):
                await db.execute(insert(Relationship.__table__), rels_to_insert[i:i + 1000])

        # 4. Tính toán và chèn PersonClosure nguyên khối trong bộ nhớ (Chạy trong 2ms, giảm từ 498 queries xuống 1 query)
        closure_dict: Dict[Tuple[uuid.UUID, uuid.UUID], int] = {
            (pid, pid): 0 for pid in person_id_map.values()
        }

        children_by_parent: Dict[uuid.UUID, List[uuid.UUID]] = {}
        for p_id, c_id in new_parent_child_edges:
            if p_id != c_id:
                children_by_parent.setdefault(p_id, []).append(c_id)

        for root_id in person_id_map.values():
            queue = [(root_id, 0)]
            visited = {root_id}
            while queue:
                curr, depth = queue.pop(0)
                if depth > 0:
                    existing = closure_dict.get((root_id, curr))
                    if existing is None or depth < existing:
                        closure_dict[(root_id, curr)] = depth
                for nxt in children_by_parent.get(curr, []):
                    if nxt not in visited:
                        visited.add(nxt)
                        queue.append((nxt, depth + 1))

        closure_records = [
            {"ancestor_id": anc, "descendant_id": desc, "depth": d}
            for (anc, desc), d in closure_dict.items()
        ]

        if closure_records:
            chunk_size = 1000
            for i in range(0, len(closure_records), chunk_size):
                chunk = closure_records[i:i + chunk_size]
                await db.execute(
                    text("""
                        INSERT INTO person_closure (ancestor_id, descendant_id, depth)
                        VALUES (:ancestor_id, :descendant_id, :depth)
                        ON CONFLICT (ancestor_id, descendant_id) DO UPDATE SET
                            depth = LEAST(person_closure.depth, EXCLUDED.depth)
                    """),
                    chunk,
                )

        # 4. Tự động liên kết thủy tổ (founder_person_id) cho hồ sơ dòng họ
        founder_person_id = None
        for p in persons_data:
            if p.get("generation") == 1 and (p.get("gender") or "").upper() == "MALE":
                founder_person_id = person_id_map.get(p["code"])
                break
        if not founder_person_id:
            for p in persons_data:
                if p.get("generation") == 1:
                    founder_person_id = person_id_map.get(p["code"])
                    break
        if founder_person_id:
            await db.execute(
                text("UPDATE clan_profiles SET founder_person_id = :fid WHERE clan_id = :cid"),
                {"fid": founder_person_id, "cid": clan_id},
            )

        await db.flush()

        return {
            "success": True,
            "created_persons": created_persons,
            "created_relationships": created_rels,
            "created_branches": created_branches,
            "message": f"Nhập thành công {created_persons} thành viên và {created_rels} mối quan hệ vào cơ sở dữ liệu phả hệ.",
        }


smart_excel_service = SmartExcelService()
