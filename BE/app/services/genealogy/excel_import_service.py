"""Excel Import and Template Generation Service for Multi-Family Genealogy (MFGMS-AI).

Adheres strictly to the Person - User separation paradigm:
- Excel imports ONLY Persons, Relationships, and Branches.
- NEVER creates User accounts, emails, or credentials.
- All imported persons start in 'Chưa liên kết tài khoản' state.
- Ensures atomic Neon DB transactions (rollback on any failure).
- Performs full DAG cycle detection and duplicate warnings.
"""

from __future__ import annotations

import io
import re
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Set, Tuple

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family.entities import Clan
from app.models.genealogy.entities import FamilyBranch, Person, PersonClosure, Relationship


# -----------------------------------------------------------------------------
# Color Palette & Styles for Excel Template
# -----------------------------------------------------------------------------
COLOR_EMERALD = "059669"  # Sheet: THÀNH VIÊN
COLOR_SKY = "0284C7"      # Sheet: QUAN HỆ
COLOR_AMBER = "D97706"    # Sheet: CHI NHÁNH
COLOR_SLATE = "475569"    # Sheet: HƯỚNG DẪN
COLOR_LIGHT_GRAY = "F1F5F9"
COLOR_BORDER = "CBD5E1"


def _make_header_cell(cell, fill_hex: str, text: str):
    cell.value = text
    cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    cell.fill = PatternFill(start_color=fill_hex, end_color=fill_hex, fill_type="solid")
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def _apply_border(ws, max_row: int, max_col: int):
    thin_border = Border(
        left=Side(style="thin", color=COLOR_BORDER),
        right=Side(style="thin", color=COLOR_BORDER),
        top=Side(style="thin", color=COLOR_BORDER),
        bottom=Side(style="thin", color=COLOR_BORDER),
    )
    for row in range(1, max_row + 1):
        for col in range(1, max_col + 1):
            cell = ws.cell(row=row, column=col)
            cell.border = thin_border


def _auto_column_widths(ws):
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            val_str = str(cell.value or "")
            if "\n" in val_str:
                val_str = max(val_str.split("\n"), key=len)
            max_len = max(max_len, len(val_str))
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)


# -----------------------------------------------------------------------------
# 1. EXCEL TEMPLATE GENERATION
# -----------------------------------------------------------------------------
def generate_excel_template(clan_name: str, clan_code: str) -> bytes:
    """Creates a standardized 4-sheet Excel workbook with styling and sample data."""
    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)

    # ---------------------------------------------------------
    # Sheet 1: THÀNH VIÊN (Person Profile)
    # ---------------------------------------------------------
    ws_persons = wb.create_sheet(title="THÀNH VIÊN")
    person_headers = [
        "Mã thành viên (*)",
        "Họ và tên (*)",
        "Giới tính (*)",
        "Đời thứ (*)",
        "Tình trạng (*)",
        "Ngày sinh",
        "Ngày mất",
        "Mã Chi nhánh",
        "Quê quán / Trú quán",
        "Tiểu sử / Ghi chú",
    ]
    for idx, h in enumerate(person_headers, 1):
        _make_header_cell(ws_persons.cell(row=1, column=idx), COLOR_EMERALD, h)

    # Realistic sample data (3 generations)
    sample_persons = [
        ["P01", "Cụ Thủy Tổ", "Nam", 1, "Đã mất", "1910-02-15", "1985-08-20", "CHI_01", "Quê gốc Cố Đô", "Thủy tổ khai canh dòng họ"],
        ["P02", "Cụ Bà Thủy Tổ", "Nữ", 1, "Đã mất", "1915-05-10", "1990-11-04", "CHI_01", "Quê gốc Cố Đô", "Chính thất Thủy tổ"],
        ["P03", "Bác Trưởng Nam", "Nam", 2, "Còn sống", "1945-03-20", "", "CHI_01", "Huế", "Trưởng nam đời 2"],
        ["P04", "Bác Dâu Trưởng", "Nữ", 2, "Còn sống", "1948-07-15", "", "CHI_01", "Huế", "Vợ Bác Trưởng Nam"],
        ["P05", "Bác Chi Thứ", "Nam", 2, "Còn sống", "1950-09-08", "", "CHI_02", "Đà Nẵng", "Lập nghiệp phương xa, Chi trưởng Chi 2"],
        ["P06", "Cháu Đích Tôn", "Nam", 3, "Còn sống", "1975-09-25", "", "CHI_01", "TP. Hồ Chí Minh", "Kỹ sư, đảm trách số hóa gia phả"],
        ["P07", "Cháu Dâu", "Nữ", 3, "Còn sống", "1978-10-14", "", "CHI_01", "TP. Hồ Chí Minh", "Vợ Cháu Đích Tôn"],
        ["P08", "Chắt Đời Bốn", "Nam", 4, "Còn sống", "2005-06-20", "", "CHI_01", "TP. Hồ Chí Minh", "Sinh viên Đại học Bách Khoa"],
    ]
    for row in sample_persons:
        ws_persons.append(row)

    ws_persons.row_dimensions[1].height = 28
    ws_persons.views.sheetView[0].showGridLines = True
    ws_persons.freeze_panes = "A2"
    _apply_border(ws_persons, len(sample_persons) + 1, len(person_headers))
    _auto_column_widths(ws_persons)

    # ---------------------------------------------------------
    # Sheet 2: QUAN HỆ (Relationships)
    # ---------------------------------------------------------
    ws_rels = wb.create_sheet(title="QUAN HỆ")
    rel_headers = [
        "Mã người thứ nhất (*)",
        "Mã người thứ hai (*)",
        "Loại quan hệ (*)",
        "Thứ tự con",
        "Ghi chú quan hệ",
    ]
    for idx, h in enumerate(rel_headers, 1):
        _make_header_cell(ws_rels.cell(row=1, column=idx), COLOR_SKY, h)

    sample_rels = [
        ["P01", "P02", "Vợ - Chồng", "", "Cụ Thủy Tổ & Cụ Bà Thủy Tổ"],
        ["P01", "P03", "Cha - Con", 1, "Trưởng nam"],
        ["P02", "P03", "Mẹ - Con", 1, "Con chính thất"],
        ["P01", "P05", "Cha - Con", 2, "Thứ nam (lập chi 2)"],
        ["P03", "P04", "Vợ - Chồng", "", "Vợ chồng Bác Trưởng Nam"],
        ["P03", "P06", "Cha - Con", 1, "Con trai trưởng"],
        ["P06", "P07", "Vợ - Chồng", "", "Vợ chồng Cháu Đích Tôn"],
        ["P06", "P08", "Cha - Con", 1, "Đích tôn đời 4"],
    ]
    for row in sample_rels:
        ws_rels.append(row)

    ws_rels.row_dimensions[1].height = 28
    ws_rels.views.sheetView[0].showGridLines = True
    ws_rels.freeze_panes = "A2"
    _apply_border(ws_rels, len(sample_rels) + 1, len(rel_headers))
    _auto_column_widths(ws_rels)

    # ---------------------------------------------------------
    # Sheet 3: CHI NHÁNH (Branches)
    # ---------------------------------------------------------
    ws_branches = wb.create_sheet(title="CHI NHÁNH")
    branch_headers = [
        "Mã Chi nhánh (*)",
        "Tên Chi/Nhánh (*)",
        "Trực thuộc Chi (cha)",
        "Thứ tự sắp xếp",
        "Mô tả Chi",
    ]
    for idx, h in enumerate(branch_headers, 1):
        _make_header_cell(ws_branches.cell(row=1, column=idx), COLOR_AMBER, h)

    sample_branches = [
        ["CHI_01", "Chi 1 (Chi Trưởng - Phụng thờ Từ Đường)", "", 1, "Chi gốc gìn giữ nhà thờ họ và tế lễ"],
        ["CHI_02", "Chi 2 (Chi Thứ - Phát triển phương xa)", "", 2, "Chi nhánh phát triển tại Đà Nẵng và miền Nam"],
    ]
    for row in sample_branches:
        ws_branches.append(row)

    ws_branches.row_dimensions[1].height = 28
    ws_branches.views.sheetView[0].showGridLines = True
    ws_branches.freeze_panes = "A2"
    _apply_border(ws_branches, len(sample_branches) + 1, len(branch_headers))
    _auto_column_widths(ws_branches)

    # ---------------------------------------------------------
    # Sheet 4: HƯỚNG DẪN (Instructions & Best Practices)
    # ---------------------------------------------------------
    ws_guide = wb.create_sheet(title="HƯỚNG DẪN")
    ws_guide.views.sheetView[0].showGridLines = True

    guide_title = ws_guide.cell(row=1, column=1, value=f"HƯỚNG DẪN NHẬP DỮ LIỆU GIA PHẢ EXCEL: {clan_name} ({clan_code})")
    guide_title.font = Font(name="Calibri", size=14, bold=True, color="0F172A")
    ws_guide.row_dimensions[1].height = 32

    instructions = [
        ("1. NGUYÊN TẮC CỐT LÕI (PERSON - USER SEPARATION)", [
            "• File Excel này CHỈ DÙNG để nhập hồ sơ gia phả (Person) và thiết lập quan hệ gia đình (Relationship).",
            "• TUYỆT ĐỐI KHÔNG tạo tài khoản người dùng đăng nhập từ file Excel (không có cột Email, Mật khẩu).",
            "• Mọi thành viên nhập từ Excel sẽ hiển thị trên cây với nhãn 'Chưa liên kết tài khoản'.",
            "• Sau này khi con cháu tạo tài khoản thật và xin gia nhập, Trưởng tộc sẽ duyệt và gắn tài khoản vào người tương ứng trên cây.",
        ]),
        ("2. QUY ƯỚC DỮ LIỆU TỪNG SHEET", [
            "• Sheet THÀNH VIÊN: 'Mã thành viên' (như P01, P02...) là mã tạm thời để nối quan hệ trong file. Bắt buộc có: Mã, Họ tên, Giới tính, Đời thứ, Tình trạng.",
            "• Giới tính: Chỉ điền 'Nam' hoặc 'Nữ'.",
            "• Đời thứ: Điền số nguyên dương (Thủy tổ đời 1, con đời 2, cháu đời 3...).",
            "• Tình trạng: Điền 'Còn sống' hoặc 'Đã mất'.",
            "• Ngày sinh / Ngày mất: Định dạng chuẩn YYYY-MM-DD (ví dụ: 1975-09-25) hoặc chỉ điền năm sinh (ví dụ: 1975).",
            "• Sheet QUAN HỆ: 'Người thứ nhất' là Cha/Mẹ hoặc Chồng. 'Người thứ hai' là Con hoặc Vợ.",
            "• Loại quan hệ: Chọn chính xác 'Cha - Con', 'Mẹ - Con' hoặc 'Vợ - Chồng'.",
            "• Sheet CHI NHÁNH: Liệt kê các chi/phái của dòng họ. Mã chi (như CHI_01) dùng để liên kết ở sheet Thành viên.",
        ]),
        ("3. CÁC ĐIỀU CẤM KỴ & HỆ THỐNG SẼ CHẶN", [
            "• Vòng lặp gia phả: Không thể khai báo một người vừa là tổ tiên vừa là con cháu của nhau.",
            "• Tự làm cha/mẹ hoặc vợ/chồng của chính mình: Mã người 1 và Mã người 2 không được trùng nhau.",
            "• Bậc thế hệ ngược: Cha mẹ bắt buộc phải có 'Đời thứ' nhỏ hơn con (ví dụ: Cha đời 2 -> Con đời 3).",
            "• Trùng lặp người: Hệ thống sẽ cảnh báo nếu phát hiện người trùng Họ tên và Năm sinh với người đã có trên cây.",
        ]),
        ("4. QUY TRÌNH THỰC HIỆN", [
            "• Bước 1: Giữ nguyên dòng tiêu đề (Dòng 1), xóa các dòng mẫu và điền dữ liệu dòng họ của bạn.",
            "• Bước 2: Lưu file và tải lên giao diện 'Nhập danh sách từ Excel'.",
            "• Bước 3: Hệ thống sẽ tự động quét lỗi, hiển thị bảng xem trước (Preview) và báo lỗi từng dòng nếu có.",
            "• Bước 4: Kiểm tra và bấm 'Xác nhận nhập vào cơ sở dữ liệu' để cây gia phả tự động cập nhật.",
        ]),
    ]

    curr_row = 3
    for section_title, bullets in instructions:
        sec_cell = ws_guide.cell(row=curr_row, column=1, value=section_title)
        sec_cell.font = Font(name="Calibri", size=11, bold=True, color=COLOR_EMERALD)
        curr_row += 1
        for bullet in bullets:
            b_cell = ws_guide.cell(row=curr_row, column=1, value=bullet)
            b_cell.font = Font(name="Calibri", size=10, color="334155")
            curr_row += 1
        curr_row += 1

    ws_guide.column_dimensions["A"].width = 110

    # Save to buffer
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()


# -----------------------------------------------------------------------------
# 2. DATA NORMALIZATION HELPERS
# -----------------------------------------------------------------------------
def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()


def _parse_date(val: Any) -> Tuple[Optional[date], Optional[str]]:
    """Parses date from Excel cell (can be datetime, date, or string YYYY-MM-DD or YYYY).
    Returns (parsed_date, error_message).
    """
    if val is None or val == "":
        return None, None
    if isinstance(val, datetime):
        return val.date(), None
    if isinstance(val, date):
        return val, None

    s = str(val).strip()
    if not s:
        return None, None

    # Check 4-digit year e.g. "1975"
    if re.fullmatch(r"\d{4}", s):
        try:
            return date(int(s), 1, 1), None
        except ValueError:
            return None, f"Năm sinh/mất không hợp lệ: '{s}'"

    # Check YYYY-MM-DD
    match = re.fullmatch(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
    if match:
        y, m, d = int(match.group(1)), int(match.group(2)), int(match.group(3))
        try:
            return date(y, m, d), None
        except ValueError:
            return None, f"Ngày tháng không tồn tại: '{s}'"

    # Check DD/MM/YYYY
    match_vn = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", s)
    if match_vn:
        d, m, y = int(match_vn.group(1)), int(match_vn.group(2)), int(match_vn.group(3))
        try:
            return date(y, m, d), None
        except ValueError:
            return None, f"Ngày tháng không tồn tại: '{s}'"

    return None, f"Định dạng ngày không hợp lệ '{s}'. Hãy dùng YYYY-MM-DD hoặc năm YYYY"


def _normalize_gender(val: Any) -> Tuple[Optional[str], Optional[str]]:
    s = _clean_str(val).lower()
    if not s:
        return None, "Giới tính không được để trống"
    if s in ["nam", "male", "m"]:
        return "MALE", None
    if s in ["nữ", "nu", "female", "f"]:
        return "FEMALE", None
    return None, f"Giới tính không hợp lệ: '{val}'. Chỉ chấp nhận 'Nam' hoặc 'Nữ'"


def _normalize_living_status(val: Any) -> Tuple[Optional[bool], Optional[str]]:
    s = _clean_str(val).lower()
    if not s:
        return None, "Tình trạng không được để trống"
    if s in ["còn sống", "con song", "sống", "song", "true", "1", "living", "alive"]:
        return True, None
    if s in ["đã mất", "da mat", "mất", "mat", "false", "0", "deceased", "dead"]:
        return False, None
    return None, f"Tình trạng không hợp lệ: '{val}'. Chỉ chấp nhận 'Còn sống' hoặc 'Đã mất'"


def _normalize_rel_type(val: Any) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Returns (relationship_type, parent_type, error)."""
    s = _clean_str(val).lower()
    if not s:
        return None, None, "Loại quan hệ không được để trống"

    if s in ["cha - con", "cha con", "bố - con", "bo con", "cha", "bố", "father"]:
        return "PARENT_CHILD", "BIOLOGICAL", None
    if s in ["mẹ - con", "me con", "mẹ", "me", "mother"]:
        return "PARENT_CHILD", "BIOLOGICAL", None
    if s in ["vợ - chồng", "vo chong", "vợ", "chồng", "spouse", "phu thê"]:
        return "SPOUSE", None, None

    return None, None, f"Loại quan hệ không hợp lệ: '{val}'. Chỉ chấp nhận 'Cha - Con', 'Mẹ - Con', hoặc 'Vợ - Chồng'"


# -----------------------------------------------------------------------------
# 3. DRY-RUN VALIDATION ENGINE
# -----------------------------------------------------------------------------
async def validate_excel_data(
    file_bytes: bytes,
    clan_id: uuid.UUID,
    db: AsyncSession,
) -> Dict[str, Any]:
    """Inspects an uploaded Excel file, validates syntax, references, DAG cycles,
    and returns a structured report with row-by-row error highlighting.
    """
    fatal_errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as e:
        return {
            "is_valid": False,
            "summary": {"total_persons": 0, "total_relationships": 0, "total_branches": 0, "fatal_count": 1, "warning_count": 0},
            "fatal_errors": [{"sheet": "FILE", "row": 0, "column": "", "code": "INVALID_EXCEL", "message": f"Không thể đọc file Excel: {str(e)}"}],
            "warnings": [],
            "preview": {"persons": [], "relationships": [], "branches": []},
        }

    # Find sheets (case-insensitive)
    sheet_names = {s.upper(): s for s in wb.sheetnames}
    person_sheet_name = sheet_names.get("THÀNH VIÊN") or sheet_names.get("THANH VIEN") or sheet_names.get("PERSONS") or sheet_names.get("MEMBERS")
    rel_sheet_name = sheet_names.get("QUAN HỆ") or sheet_names.get("QUAN HE") or sheet_names.get("RELATIONSHIPS")
    branch_sheet_name = sheet_names.get("CHI NHÁNH") or sheet_names.get("CHI NHANH") or sheet_names.get("BRANCHES")

    if not person_sheet_name:
        return {
            "is_valid": False,
            "summary": {"total_persons": 0, "total_relationships": 0, "total_branches": 0, "fatal_count": 1, "warning_count": 0},
            "fatal_errors": [{"sheet": "FILE", "row": 0, "column": "", "code": "MISSING_SHEET", "message": "File thiếu sheet 'THÀNH VIÊN'. Hãy sử dụng đúng file mẫu của hệ thống."}],
            "warnings": [],
            "preview": {"persons": [], "relationships": [], "branches": []},
        }

    # Query existing clan data for cross-reference
    existing_persons_res = await db.execute(
        select(Person.id, Person.full_name, Person.birth_date, Person.generation).where(Person.family_id == clan_id)
    )
    existing_persons = existing_persons_res.all()
    existing_person_ids = {str(p[0]) for p in existing_persons}
    existing_person_map = {str(p[0]): {"name": p[1], "birth_date": p[2], "gen": p[3]} for p in existing_persons}

    existing_branches_res = await db.execute(
        select(FamilyBranch.id, FamilyBranch.name, FamilyBranch.code).where(FamilyBranch.family_id == clan_id)
    )
    existing_branches = existing_branches_res.all()
    existing_branch_ids = {str(b[0]) for b in existing_branches}
    existing_branch_codes = {str(b[2]).strip().upper(): str(b[0]) for b in existing_branches if b[2]}
    existing_branch_names = {str(b[1]).strip().lower(): str(b[0]) for b in existing_branches}

    # ---------------------------------------------------------
    # Parse 1: CHI NHÁNH (Branches)
    # ---------------------------------------------------------
    parsed_branches: List[Dict[str, Any]] = []
    branch_code_set: Set[str] = set()

    if branch_sheet_name:
        ws_b = wb[branch_sheet_name]
        for row_idx in range(2, ws_b.max_row + 1):
            raw_code = _clean_str(ws_b.cell(row=row_idx, column=1).value)
            raw_name = _clean_str(ws_b.cell(row=row_idx, column=2).value)
            raw_parent = _clean_str(ws_b.cell(row=row_idx, column=3).value)
            raw_order = _clean_str(ws_b.cell(row=row_idx, column=4).value)
            raw_desc = _clean_str(ws_b.cell(row=row_idx, column=5).value)

            if not raw_code and not raw_name:
                continue

            if not raw_code:
                fatal_errors.append({"sheet": "CHI NHÁNH", "row": row_idx, "column": "A (Mã Chi)", "code": "REQUIRED_FIELD", "message": "Mã Chi nhánh không được để trống"})
                continue
            if not raw_name:
                fatal_errors.append({"sheet": "CHI NHÁNH", "row": row_idx, "column": "B (Tên Chi)", "code": "REQUIRED_FIELD", "message": "Tên Chi/Nhánh không được để trống"})
                continue

            norm_code = raw_code.upper()
            if norm_code in branch_code_set:
                fatal_errors.append({"sheet": "CHI NHÁNH", "row": row_idx, "column": "A (Mã Chi)", "code": "DUPLICATE_CODE", "message": f"Trùng mã Chi nhánh '{raw_code}' trong file"})
                continue
            branch_code_set.add(norm_code)

            order_val = 0
            if raw_order:
                try:
                    order_val = int(raw_order)
                except ValueError:
                    warnings.append({"sheet": "CHI NHÁNH", "row": row_idx, "column": "D (Thứ tự)", "code": "INVALID_FORMAT", "message": f"Thứ tự sắp xếp '{raw_order}' không phải số, đặt mặc định 0"})

            parsed_branches.append({
                "row_idx": row_idx,
                "code": norm_code,
                "name": raw_name,
                "parent_code": raw_parent.upper() if raw_parent else None,
                "order": order_val,
                "description": raw_desc or None,
            })

    # ---------------------------------------------------------
    # Parse 2: THÀNH VIÊN (Persons)
    # ---------------------------------------------------------
    ws_p = wb[person_sheet_name]
    parsed_persons: List[Dict[str, Any]] = []
    person_code_set: Set[str] = set()
    person_gen_map: Dict[str, int] = {}

    for row_idx in range(2, ws_p.max_row + 1):
        raw_code = _clean_str(ws_p.cell(row=row_idx, column=1).value)
        raw_name = _clean_str(ws_p.cell(row=row_idx, column=2).value)
        raw_gender = ws_p.cell(row=row_idx, column=3).value
        raw_gen = ws_p.cell(row=row_idx, column=4).value
        raw_living = ws_p.cell(row=row_idx, column=5).value
        raw_birth = ws_p.cell(row=row_idx, column=6).value
        raw_death = ws_p.cell(row=row_idx, column=7).value
        raw_bcode = _clean_str(ws_p.cell(row=row_idx, column=8).value)
        raw_origin = _clean_str(ws_p.cell(row=row_idx, column=9).value)
        raw_bio = _clean_str(ws_p.cell(row=row_idx, column=10).value)

        # Skip empty row
        if not raw_code and not raw_name:
            continue

        row_has_error = False

        if not raw_code:
            fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "A (Mã)", "code": "REQUIRED_FIELD", "message": "Mã thành viên không được để trống"})
            row_has_error = True
        else:
            norm_code = raw_code.upper()
            if norm_code in person_code_set:
                fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "A (Mã)", "code": "DUPLICATE_CODE", "message": f"Trùng mã thành viên '{raw_code}' trong file"})
                row_has_error = True
            person_code_set.add(norm_code)

        if not raw_name:
            fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "B (Họ tên)", "code": "REQUIRED_FIELD", "message": "Họ và tên không được để trống"})
            row_has_error = True

        gender_norm, gender_err = _normalize_gender(raw_gender)
        if gender_err:
            fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "C (Giới tính)", "code": "INVALID_VALUE", "message": gender_err})
            row_has_error = True

        # Generation
        gen_val = 1
        if raw_gen is None or str(raw_gen).strip() == "":
            fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "D (Đời thứ)", "code": "REQUIRED_FIELD", "message": "Đời thứ không được để trống"})
            row_has_error = True
        else:
            try:
                gen_val = int(raw_gen)
                if gen_val < 1:
                    raise ValueError()
            except ValueError:
                fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "D (Đời thứ)", "code": "INVALID_VALUE", "message": f"Đời thứ '{raw_gen}' phải là số nguyên dương (1, 2, 3...)"})
                row_has_error = True

        living_norm, living_err = _normalize_living_status(raw_living)
        if living_err:
            fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "E (Tình trạng)", "code": "INVALID_VALUE", "message": living_err})
            row_has_error = True

        birth_date, birth_err = _parse_date(raw_birth)
        if birth_err:
            fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "F (Ngày sinh)", "code": "INVALID_DATE", "message": birth_err})
            row_has_error = True

        death_date, death_err = _parse_date(raw_death)
        if death_err:
            fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "G (Ngày mất)", "code": "INVALID_DATE", "message": death_err})
            row_has_error = True

        if living_norm is False and not death_date:
            warnings.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "G (Ngày mất)", "code": "MISSING_DEATH_DATE", "message": f"Thành viên '{raw_name}' đã mất nhưng chưa ghi nhận ngày/năm mất"})

        if birth_date and death_date and death_date < birth_date:
            fatal_errors.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "G (Ngày mất)", "code": "INVALID_DATE_RANGE", "message": f"Ngày mất ({death_date}) không thể trước ngày sinh ({birth_date})"})
            row_has_error = True

        # Branch verification
        branch_norm = None
        if raw_bcode:
            norm_b = raw_bcode.upper()
            if norm_b in branch_code_set or norm_b in existing_branch_codes or raw_bcode in existing_branch_ids:
                branch_norm = norm_b
            elif raw_bcode.lower() in existing_branch_names:
                branch_norm = existing_branch_names[raw_bcode.lower()]
            else:
                warnings.append({"sheet": "THÀNH VIÊN", "row": row_idx, "column": "H (Mã Chi)", "code": "UNKNOWN_BRANCH", "message": f"Mã Chi '{raw_bcode}' chưa có trong danh sách chi nhánh, sẽ để trống"})

        if raw_code and not row_has_error:
            person_gen_map[norm_code] = gen_val

        # Duplicate detection check against DB
        for ep in existing_persons:
            ep_name = str(ep[1]).strip().lower()
            if raw_name.strip().lower() == ep_name:
                ep_birth = ep[2]
                same_birth = False
                if birth_date and ep_birth:
                    same_birth = (birth_date == ep_birth) or (birth_date.year == ep_birth.year)
                if same_birth or (not birth_date and not ep_birth):
                    warnings.append({
                        "sheet": "THÀNH VIÊN",
                        "row": row_idx,
                        "column": "B (Họ tên)",
                        "code": "POSSIBLE_DUPLICATE",
                        "message": f"Họ tên '{raw_name}' trùng với thành viên đã có trên cây (ID: {ep[0]}, Đời {ep[3]}). Hệ thống sẽ tạo hồ sơ phân biệt mới.",
                    })

        parsed_persons.append({
            "row_idx": row_idx,
            "code": norm_code if raw_code else f"ROW_{row_idx}",
            "fullName": raw_name,
            "gender": gender_norm or "MALE",
            "generation": gen_val,
            "isLiving": living_norm if living_norm is not None else True,
            "birthDate": birth_date.isoformat() if birth_date else None,
            "deathDate": death_date.isoformat() if death_date else None,
            "branchCode": branch_norm,
            "originPlace": raw_origin or None,
            "biography": raw_bio or None,
        })

    # ---------------------------------------------------------
    # Parse 3: QUAN HỆ (Relationships & Cycle Detection)
    # ---------------------------------------------------------
    parsed_relationships: List[Dict[str, Any]] = []
    # Parent-child adjacency list for DAG cycle detection
    pc_adj: Dict[str, List[str]] = {}
    spouse_set: Set[Tuple[str, str]] = set()

    if rel_sheet_name:
        ws_r = wb[rel_sheet_name]
        for row_idx in range(2, ws_r.max_row + 1):
            raw_p1 = _clean_str(ws_r.cell(row=row_idx, column=1).value)
            raw_p2 = _clean_str(ws_r.cell(row=row_idx, column=2).value)
            raw_type = ws_r.cell(row=row_idx, column=3).value
            raw_order = ws_r.cell(row=row_idx, column=4).value
            raw_notes = _clean_str(ws_r.cell(row=row_idx, column=5).value)

            if not raw_p1 and not raw_p2:
                continue

            row_has_error = False

            if not raw_p1:
                fatal_errors.append({"sheet": "QUAN HỆ", "row": row_idx, "column": "A (Người thứ nhất)", "code": "REQUIRED_FIELD", "message": "Người thứ nhất không được để trống"})
                row_has_error = True
            if not raw_p2:
                fatal_errors.append({"sheet": "QUAN HỆ", "row": row_idx, "column": "B (Người thứ hai)", "code": "REQUIRED_FIELD", "message": "Người thứ hai không được để trống"})
                row_has_error = True

            code_p1 = raw_p1.upper()
            code_p2 = raw_p2.upper()

            if code_p1 == code_p2 and code_p1:
                fatal_errors.append({"sheet": "QUAN HỆ", "row": row_idx, "column": "A-B", "code": "SELF_RELATION", "message": f"Một người không thể tự tạo quan hệ với chính mình ('{raw_p1}')"})
                row_has_error = True

            # Check if codes exist in Sheet THÀNH VIÊN or DB
            p1_exists = (code_p1 in person_code_set) or (raw_p1 in existing_person_ids)
            p2_exists = (code_p2 in person_code_set) or (raw_p2 in existing_person_ids)

            if not p1_exists:
                fatal_errors.append({"sheet": "QUAN HỆ", "row": row_idx, "column": "A (Người thứ nhất)", "code": "UNKNOWN_PERSON", "message": f"Mã '{raw_p1}' không tồn tại trong sheet THÀNH VIÊN hoặc cơ sở dữ liệu"})
                row_has_error = True
            if not p2_exists:
                fatal_errors.append({"sheet": "QUAN HỆ", "row": row_idx, "column": "B (Người thứ hai)", "code": "UNKNOWN_PERSON", "message": f"Mã '{raw_p2}' không tồn tại trong sheet THÀNH VIÊN hoặc cơ sở dữ liệu"})
                row_has_error = True

            rel_type, parent_type, type_err = _normalize_rel_type(raw_type)
            if type_err:
                fatal_errors.append({"sheet": "QUAN HỆ", "row": row_idx, "column": "C (Loại quan hệ)", "code": "INVALID_REL_TYPE", "message": type_err})
                row_has_error = True

            child_order = None
            if raw_order:
                try:
                    child_order = int(raw_order)
                except ValueError:
                    warnings.append({"sheet": "QUAN HỆ", "row": row_idx, "column": "D (Thứ tự con)", "code": "INVALID_FORMAT", "message": f"Thứ tự con '{raw_order}' không phải số nguyên"})

            if row_has_error:
                continue

            # Generation hierarchy verification
            gen_p1 = person_gen_map.get(code_p1) or (existing_person_map.get(raw_p1, {}).get("gen"))
            gen_p2 = person_gen_map.get(code_p2) or (existing_person_map.get(raw_p2, {}).get("gen"))

            if rel_type == "PARENT_CHILD":
                if gen_p1 is not None and gen_p2 is not None:
                    if gen_p1 >= gen_p2:
                        fatal_errors.append({
                            "sheet": "QUAN HỆ",
                            "row": row_idx,
                            "column": "A-B",
                            "code": "INVALID_GENERATION_HIERARCHY",
                            "message": f"Cha/Mẹ ('{raw_p1}' Đời {gen_p1}) phải có đời nhỏ hơn Con ('{raw_p2}' Đời {gen_p2})",
                        })
                # Add edge to DAG
                pc_adj.setdefault(code_p1, []).append(code_p2)

            elif rel_type == "SPOUSE":
                pair_key = (min(code_p1, code_p2), max(code_p1, code_p2))
                if pair_key in spouse_set:
                    warnings.append({"sheet": "QUAN HỆ", "row": row_idx, "column": "A-B", "code": "DUPLICATE_SPOUSE", "message": f"Quan hệ vợ chồng giữa '{raw_p1}' và '{raw_p2}' bị lặp lại trong file"})
                spouse_set.add(pair_key)

            parsed_relationships.append({
                "row_idx": row_idx,
                "person1": code_p1,
                "person2": code_p2,
                "relationshipType": rel_type,
                "parentType": parent_type,
                "childOrder": child_order,
                "notes": raw_notes or None,
            })

    # ---------------------------------------------------------
    # DAG Cycle Detection (DFS)
    # ---------------------------------------------------------
    visited: Dict[str, int] = {}  # 0: unvisited, 1: visiting, 2: visited
    cycle_nodes: List[str] = []

    def dfs(node: str, path: List[str]) -> bool:
        visited[node] = 1
        path.append(node)
        for child in pc_adj.get(node, []):
            if visited.get(child, 0) == 1:
                # Cycle found!
                cycle_idx = path.index(child)
                cycle_nodes.extend(path[cycle_idx:] + [child])
                return True
            if visited.get(child, 0) == 0:
                if dfs(child, path):
                    return True
        path.pop()
        visited[node] = 2
        return False

    for root_cand in list(pc_adj.keys()):
        if visited.get(root_cand, 0) == 0:
            if dfs(root_cand, []):
                cycle_str = " -> ".join(cycle_nodes)
                fatal_errors.append({
                    "sheet": "QUAN HỆ",
                    "row": 0,
                    "column": "Logic phả hệ",
                    "code": "PEDIGREE_CYCLE_DETECTED",
                    "message": f"Phát hiện vòng lặp gia phả nghiêm trọng: [{cycle_str}]. Tổ tiên không thể đồng thời là con cháu của chính mình!",
                })
                break

    is_valid = len(fatal_errors) == 0

    return {
        "is_valid": is_valid,
        "summary": {
            "total_persons": len(parsed_persons),
            "total_relationships": len(parsed_relationships),
            "total_branches": len(parsed_branches),
            "fatal_count": len(fatal_errors),
            "warning_count": len(warnings),
        },
        "fatal_errors": fatal_errors,
        "warnings": warnings,
        "preview": {
            "persons": parsed_persons,
            "relationships": parsed_relationships,
            "branches": parsed_branches,
        },
    }


# -----------------------------------------------------------------------------
# 4. ATOMIC DATABASE TRANSACTION COMMIT & CLOSURE RECOMPUTATION
# -----------------------------------------------------------------------------
async def execute_excel_import(
    file_bytes: bytes,
    clan_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession,
    allowed_branch_ids: Optional[Set[uuid.UUID]] = None,
) -> Dict[str, Any]:
    """Performs validation first; if valid, commits all branches, persons,
    relationships, and recomputes the person_closure table in a single transaction.
    Enforces strict backend validation and branch scoping.
    """
    validation = await validate_excel_data(file_bytes, clan_id, db)
    fatal_errors = validation.get("fatal_errors", [])
    if not validation["is_valid"] or len(fatal_errors) > 0:
        err_details = "; ".join([f"[{e['sheet']} - Dòng {e['row']}]: {e['message']}" for e in fatal_errors[:5]])
        raise ValueError(f"Chặn nhập dữ liệu: Phát hiện {len(fatal_errors)} lỗi chặn trong file Excel: {err_details}")

    preview = validation["preview"]
    branches_data = preview["branches"]
    persons_data = preview["persons"]
    rels_data = preview["relationships"]

    branch_id_map: Dict[str, uuid.UUID] = {}
    person_id_map: Dict[str, uuid.UUID] = {}

    # Query existing branch codes in DB
    existing_b = (await db.execute(
        select(FamilyBranch.code, FamilyBranch.id).where(FamilyBranch.family_id == clan_id)
    )).all()
    for code, b_id in existing_b:
        if code:
            branch_id_map[code.upper()] = b_id

    # 1. Insert Branches
    created_branches = 0
    for b in branches_data:
        b_code = b["code"]
        if b_code in branch_id_map:
            continue
        new_b_id = uuid.uuid4()
        branch_obj = FamilyBranch(
            id=new_b_id,
            family_id=clan_id,
            code=b_code,
            name=b["name"],
            description=b["description"],
            branch_order=b["order"],
            status="ACTIVE",
        )
        db.add(branch_obj)
        branch_id_map[b_code] = new_b_id
        created_branches += 1

    await db.flush()

    # 2. Insert Persons
    created_persons = 0
    for p in persons_data:
        p_code = p["code"]
        new_p_id = uuid.uuid4()
        b_target_id = branch_id_map.get(p.get("branchCode") or "")

        birth_d = None
        if p.get("birthDate"):
            birth_d = date.fromisoformat(p["birthDate"])

        death_d = None
        if p.get("deathDate"):
            death_d = date.fromisoformat(p["deathDate"])

        person_obj = Person(
            id=new_p_id,
            family_id=clan_id,
            branch_id=b_target_id,
            full_name=p["fullName"],
            gender=p["gender"],
            birth_date=birth_d,
            death_date=death_d,
            is_alive=p["isLiving"],
            generation=p["generation"],
            bio=p.get("biography"),
            status="ACTIVE",
            created_by=user_id,
        )
        db.add(person_obj)
        person_id_map[p_code] = new_p_id
        created_persons += 1

    await db.flush()

    # 3. Insert Relationships
    created_rels = 0
    new_parent_child_edges: List[Tuple[uuid.UUID, uuid.UUID]] = []

    for r in rels_data:
        p1_code = r["person1"]
        p2_code = r["person2"]

        # Resolve to UUID
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

        rel_type = r["relationshipType"]
        rel_obj = Relationship(
            id=uuid.uuid4(),
            family_id=clan_id,
            from_member_id=uid1,
            to_member_id=uid2,
            relationship_type=rel_type,
            parent_type=r.get("parentType"),
            child_order=r.get("childOrder"),
            status="ACTIVE",
            verified=True,
            created_by=user_id,
        )
        db.add(rel_obj)
        created_rels += 1

        if rel_type == "PARENT_CHILD":
            new_parent_child_edges.append((uid1, uid2))

    await db.flush()

    # 4. Update PersonClosure Table
    # A. Self-closure (depth 0) for all new persons
    for p_uuid in person_id_map.values():
        await db.execute(
            text("""
                INSERT INTO person_closure (ancestor_id, descendant_id, depth)
                VALUES (:pid, :pid, 0)
                ON CONFLICT (ancestor_id, descendant_id) DO NOTHING
            """),
            {"pid": p_uuid},
        )

    # B. For each parent-child edge (p -> c):
    # Any ancestor of p is an ancestor of c (and all descendants of c)
    for p_id, c_id in new_parent_child_edges:
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
            {"parent_id": p_id, "child_id": c_id},
        )

    from app.models.user_access.entities import AuditLog
    from datetime import timezone

    audit_entry = AuditLog(
        log_id=uuid.uuid4(),
        clan_id=clan_id,
        actor_id=user_id,
        action="Nhập phả hệ từ Excel",
        entity_type="MEMBER",
        entity_id=clan_id,
        new_data={
            "description": f"Đã nhập thành công {created_persons} thành viên, {created_rels} mối quan hệ và {created_branches} chi nhánh vào gia phả dòng họ.",
            "added_persons": created_persons,
            "added_relationships": created_rels,
            "added_branches": created_branches,
        },
        reason="Nhập phả hệ định dạng .xlsx",
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(audit_entry)

    await db.flush()

    return {
        "success": True,
        "message": f"Đã nhập thành công {created_persons} thành viên, {created_rels} mối quan hệ và {created_branches} chi nhánh vào gia phả dòng họ.",
        "added_persons": created_persons,
        "added_relationships": created_rels,
        "added_branches": created_branches,
    }

