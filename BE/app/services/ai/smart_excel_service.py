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
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import openpyxl
from sqlalchemy import select, text
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
        "key": "full_name",
        "label": "Họ và tên",
        "required": True,
        "description": "Tên đầy đủ của thành viên trong dòng họ",
    },
    {
        "key": "person_code",
        "label": "Mã định danh / STT / Code",
        "required": False,
        "description": "Mã thành viên hoặc số thứ tự trong file (vd: MAI001, MAI022...)",
    },
    {
        "key": "gender",
        "label": "Giới tính",
        "required": False,
        "description": "Nam / Nữ",
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
        "key": "generation",
        "label": "Đời thứ / Thế hệ",
        "required": False,
        "description": "Thứ tự thế hệ (1, 2, 3... hoặc I, II...)",
    },
    {
        "key": "father_name",
        "label": "Tên Cha / Bố / Thân phụ",
        "required": False,
        "description": "Họ tên người cha để tự động nối quan hệ",
    },
    {
        "key": "mother_name",
        "label": "Tên Mẹ / Thân mẫu",
        "required": False,
        "description": "Họ tên người mẹ để tự động nối quan hệ",
    },
    {
        "key": "spouse_name",
        "label": "Tên Vợ / Chồng / Hôn phối",
        "required": False,
        "description": "Họ tên phối ngẫu",
    },
    {
        "key": "branch_name",
        "label": "Tên Chi nhánh / Phân chi",
        "required": False,
        "description": "Chi họ, phân cành gia tộc",
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

# Regex patterns for heuristic Vietnamese column matching
HEURISTIC_RULES: List[Tuple[str, re.Pattern]] = [
    ("person_code", re.compile(r"(mã\s*thành\s*viên|mã\s*tv|mã\s*số|^mã$|^stt$|^code$|^id$|^mã\s*hồ\s*sơ$)", re.I)),
    ("full_name", re.compile(r"(họ\s*v?[aà]?\s*tên|họ\s*tên|^tên$|danh\s*tính|thành\s*viên|full\s*name|^name$)", re.I)),
    ("father_name", re.compile(r"(thân\s*phụ|tên\s*cha|tên\s*bố|họ\s*tên\s*cha|họ\s*tên\s*bố|^cha$|^bố$|^father$|cha\s*đẻ)", re.I)),
    ("mother_name", re.compile(r"(thân\s*mẫu|tên\s*mẹ|họ\s*tên\s*mẹ|^mẹ$|^mother$|mẹ\s*đẻ)", re.I)),
    ("spouse_name", re.compile(r"(hôn\s*phối|phu\s*thê|vợ\s*\/?\s*chồng|^vợ$|^chồng$|bạn\s*đời|tên\s*vợ|tên\s*chồng|^spouse$|^wife$)", re.I)),
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
    ) -> Dict[str, Any]:
        """Tự động phân tích file Excel và nhận diện bản đồ ánh xạ cột bằng AI + Heuristic."""
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
        except Exception as e:
            raise ValueError(f"Không thể đọc file Excel: {str(e)}")

        sheet_names = wb.sheetnames
        if not sheet_names:
            raise ValueError("File Excel không có bất kỳ trang tính (sheet) nào.")

        # Chọn sheet phù hợp nhất
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
                    '    "E": "father_name"\n'
                    "  },\n"
                    '  "notes": "Nhận diện bảng gia phả gồm mã, họ tên, giới tính, thế hệ và thân phụ."\n'
                    "}\n"
                    "Các trường hợp lệ: person_code, full_name, gender, birth_date, death_date, is_alive, generation, "
                    "father_name, mother_name, spouse_name, branch_name, other_name, occupation, burial_location, bio, none."
                )
                ai_res = await gemini_service.generate_content_safe(ai_prompt, timeout_seconds=6.0, max_retries=1)
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
            "notes": notes or "Hệ thống đã tự động nhận diện cấu trúc các cột trong file Excel của bạn.",
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

        sheet_name = config.get("selected_sheet") or wb.sheetnames[0]
        if sheet_name not in wb.sheetnames:
            sheet_name = wb.sheetnames[0]
        ws = wb[sheet_name]

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

        detected_branches: Set[str] = set()
        seen_person_names: Dict[str, int] = {}

        for r_idx in range(data_start_row, ws.max_row + 1):
            row_data: Dict[str, Any] = {}
            for col_idx, field_key in field_by_col_idx.items():
                val = ws.cell(row=r_idx, column=col_idx).value
                row_data[field_key] = val

            raw_name = _clean_str(row_data.get("full_name"))
            if not raw_name:
                continue

            norm_name = raw_name.strip().lower()
            if norm_name in seen_person_names:
                fatal_errors.append({
                    "sheet": selected_sheet,
                    "row": r_idx,
                    "column": "Họ và tên",
                    "code": "DUPLICATE_NAME",
                    "message": f"Trùng họ và tên '{raw_name}' với dòng {seen_person_names[norm_name]} trong file Excel",
                })
                continue
            seen_person_names[norm_name] = r_idx

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

            custom_code = _clean_str(row_data.get("person_code"))
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
                "fatherName": _clean_str(row_data.get("father_name")),
                "motherName": _clean_str(row_data.get("mother_name")),
                "spouseName": _clean_str(row_data.get("spouse_name")),
                "otherName": _clean_str(row_data.get("other_name")),
                "occupation": _clean_str(row_data.get("occupation")),
                "burialLocation": _clean_str(row_data.get("burial_location")),
                "biography": _clean_str(row_data.get("bio")),
            })

        if not raw_persons:
            raise ValueError("Không tìm thấy dữ liệu thành viên nào trong sheet đã chọn.")

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

        # Ráp nối Parent - Child và Spouse
        for p in raw_persons:
            # 2.1 Ráp nối Cha (Father)
            f_name = p.get("fatherName")
            if f_name:
                f_str = str(f_name).strip().upper()
                f_clean_c = _clean_code(f_name)
                matched_father = by_code.get(f_str) or (by_code.get(f_clean_c) if f_clean_c else None)
                if not matched_father:
                    f_norm = _normalize_name(f_name)
                    f_clean_n = _clean_person_name(f_name)
                    candidates = by_norm_name.get(f_norm) or by_norm_name.get(f_clean_n, [])

                    # Lọc ứng viên có thế hệ nhỏ hơn con (ví dụ: con đời 3 thì cha đời 2)
                    for cand in candidates:
                        if cand["code"] == p["code"]:
                            continue
                        if cand["generation"] < p["generation"]:
                            matched_father = cand
                            break

                    if not matched_father and candidates:
                        matched_father = candidates[0]

                    if not matched_father:
                        # Tìm trong Neon DB
                        db_cands = db_by_norm_name.get(f_norm) or db_by_norm_name.get(f_clean_n, [])
                        if db_cands:
                            matched_father = db_cands[0]

                if matched_father:
                    _add_rel(matched_father.get("code") or matched_father.get("id"), p["code"], "PARENT_CHILD", "BIOLOGICAL")
                else:
                    warnings.append({
                        "sheet": sheet_name,
                        "row": p["row_idx"],
                        "column": "Cha",
                        "message": f"Không tìm thấy người cha tên '{f_name}' trong phả hệ.",
                    })

            # 2.2 Ráp nối Mẹ (Mother)
            m_name = p.get("motherName")
            if m_name:
                m_str = str(m_name).strip().upper()
                m_clean_c = _clean_code(m_name)
                matched_mother = by_code.get(m_str) or (by_code.get(m_clean_c) if m_clean_c else None)
                if not matched_mother:
                    m_norm = _normalize_name(m_name)
                    m_clean_n = _clean_person_name(m_name)
                    candidates = by_norm_name.get(m_norm) or by_norm_name.get(m_clean_n, [])

                    for cand in candidates:
                        if cand["code"] == p["code"]:
                            continue
                        if cand["generation"] < p["generation"]:
                            matched_mother = cand
                            break

                    if not matched_mother and candidates:
                        matched_mother = candidates[0]

                    if not matched_mother:
                        db_cands = db_by_norm_name.get(m_norm) or db_by_norm_name.get(m_clean_n, [])
                        if db_cands:
                            matched_mother = db_cands[0]

                if matched_mother:
                    _add_rel(matched_mother.get("code") or matched_mother.get("id"), p["code"], "PARENT_CHILD", "BIOLOGICAL")

            # 2.3 Ráp nối Vợ / Chồng (Spouse)
            sp_name = p.get("spouseName")
            if sp_name:
                sp_str = str(sp_name).strip().upper()
                sp_clean_c = _clean_code(sp_name)
                matched_spouse = by_code.get(sp_str) or (by_code.get(sp_clean_c) if sp_clean_c else None)
                if not matched_spouse:
                    sp_norm = _normalize_name(sp_name)
                    sp_clean_n = _clean_person_name(sp_name)
                    candidates = by_norm_name.get(sp_norm) or by_norm_name.get(sp_clean_n, [])

                    for cand in candidates:
                        if cand["code"] == p["code"]:
                            continue
                        if cand["generation"] == p["generation"]:
                            matched_spouse = cand
                            break

                    if not matched_spouse and candidates:
                        matched_spouse = candidates[0]

                    if not matched_spouse:
                        # Tạo implicit spouse record nếu chưa có
                        sp_code = f"SMART_SPOUSE_{implicit_partner_code_counter}"
                        implicit_partner_code_counter += 1
                        sp_gender = "FEMALE" if p["gender"] == "MALE" else "MALE"

                        new_spouse_record = {
                            "row_idx": p["row_idx"],
                            "code": sp_code,
                            "fullName": sp_name,
                            "gender": sp_gender,
                            "generation": p["generation"],
                            "birthDate": None,
                            "deathDate": None,
                            "isLiving": p["isLiving"],
                            "branchName": p["branchName"],
                            "biography": f"Hôn phối của {p['fullName']}",
                        }
                        implicit_partners.append(new_spouse_record)
                        by_norm_name.setdefault(sp_norm, []).append(new_spouse_record)
                        if sp_clean_n and sp_clean_n != sp_norm:
                            by_norm_name.setdefault(sp_clean_n, []).append(new_spouse_record)
                        by_code[sp_code.upper()] = new_spouse_record
                        matched_spouse = new_spouse_record

                if matched_spouse:
                    _add_rel(p["code"], matched_spouse["code"], "SPOUSE")

        # Gộp implicit partners vào danh sách thành viên
        all_persons = raw_persons + implicit_partners

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

        # 1. Truy vấn và thêm Branch
        existing_b = (await db.execute(
            select(FamilyBranch.name, FamilyBranch.id).where(FamilyBranch.family_id == clan_id)
        )).all()
        for b_name, b_id in existing_b:
            if b_name:
                branch_id_map[b_name.strip().lower()] = b_id

        created_branches = 0
        for b in branches_data:
            norm_b_name = b["name"].strip().lower()
            if norm_b_name in branch_id_map:
                continue
            new_b_id = uuid.uuid4()
            branch_obj = FamilyBranch(
                id=new_b_id,
                family_id=clan_id,
                code=b.get("code"),
                name=b["name"],
                description=b.get("description"),
                branch_order=b.get("order", 0),
                status="ACTIVE",
            )
            db.add(branch_obj)
            branch_id_map[norm_b_name] = new_b_id
            created_branches += 1

        await db.flush()

        # 2. Thêm Persons
        created_persons = 0
        for p in persons_data:
            p_code = p["code"]
            new_p_id = uuid.uuid4()
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

            person_obj = Person(
                id=new_p_id,
                family_id=clan_id,
                branch_id=b_target_id,
                full_name=p["fullName"],
                gender=p.get("gender") or "OTHER",
                birth_date=birth_d,
                death_date=death_d,
                is_alive=p.get("isLiving", True),
                generation=p.get("generation", 1),
                bio=p.get("biography"),
                status="ACTIVE",
                created_by=user_id,
            )
            db.add(person_obj)
            person_id_map[p_code] = new_p_id
            created_persons += 1

        await db.flush()

        # 3. Thêm Relationships
        created_rels = 0
        new_parent_child_edges: List[Tuple[uuid.UUID, uuid.UUID]] = []

        # Truy vấn các cặp vợ chồng đã tồn tại trong CSDL để tránh trùng lặp
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

        # Tập hợp theo dõi để ngăn chèn trùng lặp trong cùng một đợt nhập
        inserted_spouse_pairs: Set[Tuple[uuid.UUID, uuid.UUID]] = set()
        inserted_pc_pairs: Set[Tuple[uuid.UUID, uuid.UUID]] = set()

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

            rel_obj = Relationship(
                id=uuid.uuid4(),
                family_id=clan_id,
                from_member_id=uid1,
                to_member_id=uid2,
                relationship_type=rel_type,
                parent_type=r.get("parentType"),
                status="ACTIVE",
                verified=True,
                created_by=user_id,
            )
            db.add(rel_obj)
            created_rels += 1

        await db.flush()

        # 4. Cập nhật PersonClosure an toàn và tối ưu siêu tốc qua batch executemany
        if person_id_map:
            await db.execute(
                text("""
                    INSERT INTO person_closure (ancestor_id, descendant_id, depth)
                    VALUES (:pid, :pid, 0)
                    ON CONFLICT (ancestor_id, descendant_id) DO NOTHING
                """),
                [{"pid": pid} for pid in person_id_map.values()],
            )

        pc_edge_params = [
            {"parent_id": p_id, "child_id": c_id}
            for p_id, c_id in new_parent_child_edges
            if p_id != c_id
        ]
        if pc_edge_params:
            await db.execute(
                text("""
                    INSERT INTO person_closure (ancestor_id, descendant_id, depth)
                    SELECT super.ancestor_id, sub.descendant_id, super.depth + sub.depth + 1
                    FROM person_closure super
                    CROSS JOIN person_closure sub
                    WHERE super.descendant_id = :parent_id
                      AND sub.ancestor_id = :child_id
                    ON CONFLICT (ancestor_id, descendant_id) DO UPDATE SET
                      depth = LEAST(person_closure.depth, EXCLUDED.depth)
                """),
                pc_edge_params,
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
