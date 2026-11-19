"""Test suite for AI Smart Excel Import Service (Templateless)."""

import io
import pytest
import openpyxl
from app.services.ai.smart_excel_service import smart_excel_service, _parse_generation_value, _infer_gender_from_context


def test_generation_and_gender_helpers():
    assert _parse_generation_value(1) == 1
    assert _parse_generation_value("Đời thứ 3") == 3
    assert _parse_generation_value("IV") == 4
    assert _parse_generation_value("Thế hệ 2") == 2

    assert _infer_gender_from_context("Nguyễn Văn An") == "MALE"
    assert _infer_gender_from_context("Trần Thị Mai") == "FEMALE"
    assert _infer_gender_from_context("Cụ Bà Lê Thị Bảy") == "FEMALE"
    assert _infer_gender_from_context("Ông Tổ Võ Đại") == "MALE"


@pytest.mark.asyncio
async def test_detect_schema_heuristic():
    # Tạo file Excel tự do không theo mẫu (chỉ 1 sheet tự do, cột tự do)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "GiaPhaDongHo"

    # Dòng 1: Banner title (Merged / Text)
    ws.append(["GIA PHẢ DÒNG HỌ VÕ TỘC - NĂM 2024", "", "", "", "", ""])
    # Dòng 2: Header bất kỳ không theo mẫu
    ws.append(["STT", "Họ và tên thành viên", "Năm sinh", "Thân phụ", "Hôn phối", "Đời"])
    # Dòng 3, 4, 5: Data
    ws.append([1, "Võ Văn Thủy", "1920", "", "Lê Thị Lan", "Đời 1"])
    ws.append([2, "Võ Văn Hùng", "1950", "Võ Văn Thủy", "Nguyễn Thị Đào", "Đời 2"])
    ws.append([3, "Võ Văn Dũng", "1980", "Võ Văn Hùng", "", "Đời 3"])

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    import uuid
    dummy_clan_id = uuid.uuid4()

    res = await smart_excel_service.detect_schema(file_bytes, dummy_clan_id, use_ai=False)

    assert res["selected_sheet"] == "GiaPhaDongHo"
    assert res["header_row"] == 2
    assert res["data_start_row"] == 3

    col_map = {item["col_letter"]: item["suggested_field"] for item in res["column_mapping"]}
    assert col_map["B"] == "full_name"
    assert col_map["C"] == "birth_date"
    assert col_map["D"] == "father_name"
    assert col_map["E"] == "spouse_name"
    assert col_map["F"] == "generation"
