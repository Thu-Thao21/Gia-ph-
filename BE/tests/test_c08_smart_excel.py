"""Test suite for AI Smart Excel Import Service (Templateless)."""

import io
import uuid
import pytest
import openpyxl
from unittest.mock import AsyncMock, MagicMock
from app.services.ai.smart_excel_service import (
    smart_excel_service,
    _parse_generation_value,
    _infer_gender_from_context,
)


def _create_mock_db():
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.all.return_value = []
    mock_db.execute.return_value = mock_result
    return mock_db


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
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "GiaPhaDongHo"

    ws.append(["GIA PHẢ DÒNG HỌ VÕ TỘC - NĂM 2024", "", "", "", "", ""])
    ws.append(["STT", "Họ và tên thành viên", "Năm sinh", "Thân phụ", "Hôn phối", "Đời"])
    ws.append([1, "Võ Văn Thủy", "1920", "", "Lê Thị Lan", "Đời 1"])
    ws.append([2, "Võ Văn Hùng", "1950", "Võ Văn Thủy", "Nguyễn Thị Đào", "Đời 2"])
    ws.append([3, "Võ Văn Dũng", "1980", "Võ Văn Hùng", "", "Đời 3"])

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

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


@pytest.mark.asyncio
async def test_multi_sheet_and_selected_sheet_flow():
    """Kiểm tra xử lý file Excel có nhiều sheet, nhận diện sheet THÀNH VIÊN và phân tích không phát sinh NameError."""
    wb = openpyxl.Workbook()
    ws_intro = wb.active
    ws_intro.title = "GIỚI THIỆU"
    ws_intro.append(["Lịch sử dòng họ Mai Thế Tộc qua các thời kỳ..."])

    ws_members = wb.create_sheet("THÀNH VIÊN")
    ws_members.append(["Mã", "Họ và tên", "Giới tính", "Đời thứ", "Năm sinh", "Cha", "Mẹ", "Hôn phối", "Chi nhánh"])
    ws_members.append(["MTT_01", "Mai Phước An", "Nam", "1", "1900", "", "", "Trần Thị Diệu", "Chi Trưởng"])
    ws_members.append(["MTT_02", "Mai Thế Dũng", "Nam", "2", "1930", "Mai Phước An", "Trần Thị Diệu", "Hoàng Thị Nhàn", "Chi Trưởng"])
    ws_members.append(["MTT_03", "Mai Phúc Hậu", "Nam", "3", "1960", "Mai Thế Dũng", "Hoàng Thị Nhàn", "", "Chi Trưởng"])

    ws_guide = wb.create_sheet("HƯỚNG DẪN")
    ws_guide.append(["Quy định nhập phả hệ"])

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    dummy_clan_id = uuid.uuid4()

    # 1. Nhận diện schema - Phải tự động ưu tiên sheet THÀNH VIÊN
    detect_res = await smart_excel_service.detect_schema(file_bytes, dummy_clan_id, use_ai=False)
    assert detect_res["selected_sheet"] == "THÀNH VIÊN"
    assert "GIỚI THIỆU" in detect_res["sheet_names"]
    assert "THÀNH VIÊN" in detect_res["sheet_names"]
    assert "HƯỚNG DẪN" in detect_res["sheet_names"]

    # 2. Parse & Preview với selected_sheet truyền vào - Không được văng NameError: name 'selected_sheet' is not defined
    config = {
        "selected_sheet": "THÀNH VIÊN",
        "header_row": 1,
        "data_start_row": 2,
        "column_mapping": {
            "A": "person_code",
            "B": "full_name",
            "C": "gender",
            "D": "generation",
            "E": "birth_date",
            "F": "father_name",
            "G": "mother_name",
            "H": "spouse_name",
            "I": "branch_name",
        },
        "create_implicit_spouses": True,
    }

    mock_db = _create_mock_db()
    preview_res = await smart_excel_service.parse_and_reconstruct_graph(
        file_bytes=file_bytes,
        clan_id=dummy_clan_id,
        db=mock_db,
        config=config,
    )

    assert preview_res["is_valid"] is True
    assert preview_res["summary"]["total_persons"] == 5  # 3 explicit + 2 spouses (Trần Thị Diệu, Hoàng Thị Nhàn)
    assert preview_res["summary"]["parent_child_count"] >= 2


@pytest.mark.asyncio
async def test_duplicate_name_across_different_generations():
    """Kiểm tra trường hợp 2 thành viên trùng họ tên ở 2 thế hệ khác nhau không bị mất dữ liệu và không gây lỗi NameError."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "THÀNH VIÊN"

    ws.append(["Mã", "Họ và tên", "Đời thứ", "Cha"])
    ws.append(["MTT_01", "Mai Thế Dũng", "1", ""])
    ws.append(["MTT_02", "Mai Văn An", "2", "Mai Thế Dũng"])
    # Đời 3: Cháu mang tên giống ông nội (Mai Thế Dũng)
    ws.append(["MTT_03", "Mai Thế Dũng", "3", "Mai Văn An"])

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    dummy_clan_id = uuid.uuid4()
    config = {
        "selected_sheet": "THÀNH VIÊN",
        "header_row": 1,
        "data_start_row": 2,
        "column_mapping": {
            "A": "person_code",
            "B": "full_name",
            "C": "generation",
            "D": "father_name",
        },
    }

    mock_db = _create_mock_db()
    preview_res = await smart_excel_service.parse_and_reconstruct_graph(
        file_bytes=file_bytes,
        clan_id=dummy_clan_id,
        db=mock_db,
        config=config,
    )

    # Cả 3 người đều phải được bảo toàn, không bị bỏ qua (không mất dữ liệu)
    assert preview_res["is_valid"] is True
    assert preview_res["summary"]["explicit_persons"] == 3
    # Phải có cảnh báo SAME_NAME_DIFFERENT_PERSON và có ghi nhận selected_sheet
    assert len(preview_res["warnings"]) > 0
    assert preview_res["warnings"][0]["sheet"] == "THÀNH VIÊN"


@pytest.mark.asyncio
async def test_exact_duplicate_person_blocks_import():
    """Kiểm tra hồ sơ trùng lặp hoàn toàn sẽ bị chặn bởi fatal_errors với sheet name chính xác."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "THÀNH VIÊN"

    ws.append(["Họ và tên", "Đời thứ", "Cha", "Năm sinh"])
    ws.append(["Mai Văn Nam", "2", "Mai Văn Thủy", "1950"])
    # Dòng 3 trùng lặp hoàn toàn dòng 2
    ws.append(["Mai Văn Nam", "2", "Mai Văn Thủy", "1950"])

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    dummy_clan_id = uuid.uuid4()
    config = {
        "selected_sheet": "THÀNH VIÊN",
        "header_row": 1,
        "data_start_row": 2,
        "column_mapping": {
            "A": "full_name",
            "B": "generation",
            "C": "father_name",
            "D": "birth_date",
        },
    }

    mock_db = _create_mock_db()
    preview_res = await smart_excel_service.parse_and_reconstruct_graph(
        file_bytes=file_bytes,
        clan_id=dummy_clan_id,
        db=mock_db,
        config=config,
    )

    assert preview_res["is_valid"] is False
    assert len(preview_res["fatal_errors"]) == 1
    assert preview_res["fatal_errors"][0]["code"] == "DUPLICATE_PERSON"
    assert preview_res["fatal_errors"][0]["sheet"] == "THÀNH VIÊN"


@pytest.mark.asyncio
async def test_500_members_simulation():
    """Mô phỏng file Excel Mai Thế Tộc gồm đúng 500 thành viên với 19 cột dữ liệu, đảm bảo không mất dữ liệu."""
    wb = openpyxl.Workbook()
    # Sheet 1: Giới thiệu
    ws_intro = wb.active
    ws_intro.title = "BÌA"
    ws_intro.append(["GIA PHẢ MAI THẾ TỘC - 500 THÀNH VIÊN"])

    # Sheet 2: THÀNH VIÊN (19 cột)
    ws = wb.create_sheet("THÀNH VIÊN")
    headers = [
        "STT", "Mã TV", "Họ và tên", "Tên thường gọi", "Giới tính",
        "Đời thứ", "Năm sinh", "Năm mất", "Còn sống", "Chi nhánh",
        "Thân phụ (Cha)", "Thân mẫu (Mẹ)", "Hôn phối (Vợ/Chồng)", "Nghề nghiệp", "Quê quán",
        "Nơi an táng", "Số điện thoại", "Email", "Tiểu sử",
    ]
    ws.append(headers)

    # Tạo 500 thành viên qua 7 đời
    # Đời 1: Cụ Tổ
    ws.append([1, "MTT_001", "Mai Phước An", "Cụ Tổ", "Nam", 1, "1850", "1920", "Không", "Chi Trưởng", "", "", "Trần Thị Diệu", "Quan lại", "Huế", "Phong Điền", "", "", "Thủy tổ"])
    
    # Đời 2..7: Sinh 499 thành viên có liên kết cha-con
    current_count = 1
    gen_members = {1: ["Mai Phước An"]}

    for gen in range(2, 8):
        gen_members[gen] = []
        parents_in_prev_gen = gen_members[gen - 1]
        members_in_this_gen = 83 if gen < 7 else (500 - current_count)

        for i in range(members_in_this_gen):
            current_count += 1
            code = f"MTT_{current_count:03d}"
            name = f"Mai Thế Thành {current_count}"
            gen_members[gen].append(name)
            parent_name = parents_in_prev_gen[i % len(parents_in_prev_gen)]
            gender = "Nam" if i % 2 == 0 else "Nữ"
            birth_year = 1850 + (gen * 25) + (i % 10)
            branch = f"Chi {('Trưởng' if i % 3 == 0 else 'Hai' if i % 3 == 1 else 'Ba')}"

            ws.append([
                current_count, code, name, "", gender,
                gen, str(birth_year), "", "Có" if birth_year > 1940 else "Không", branch,
                parent_name, "", "", "Kinh doanh", "Huế",
                "", "", "", "Thành viên thế hệ " + str(gen)
            ])

    assert current_count == 500

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    dummy_clan_id = uuid.uuid4()

    # 1. Nhận diện cấu trúc
    detect_res = await smart_excel_service.detect_schema(file_bytes, dummy_clan_id, use_ai=False)
    assert detect_res["selected_sheet"] == "THÀNH VIÊN"
    assert len(detect_res["sheet_names"]) == 2

    # Ánh xạ cột
    mapping = {
        "A": "none",
        "B": "person_code",
        "C": "full_name",
        "D": "other_name",
        "E": "gender",
        "F": "generation",
        "G": "birth_date",
        "H": "death_date",
        "I": "is_alive",
        "J": "branch_name",
        "K": "father_name",
        "L": "mother_name",
        "M": "spouse_name",
        "N": "occupation",
        "O": "none",
        "P": "burial_location",
        "Q": "none",
        "R": "none",
        "S": "bio",
    }

    config = {
        "selected_sheet": "THÀNH VIÊN",
        "header_row": 1,
        "data_start_row": 2,
        "column_mapping": mapping,
    }

    mock_db = _create_mock_db()

    # 2. Phân tích và ráp nối phả hệ
    preview_res = await smart_excel_service.parse_and_reconstruct_graph(
        file_bytes=file_bytes,
        clan_id=dummy_clan_id,
        db=mock_db,
        config=config,
    )

    # Đảm bảo KHÔNG MẤT DỮ LIỆU VÀ KHÔNG NHÂN BẢN THÀNH 1000: Đủ đúng 500 persons gốc
    assert preview_res["summary"]["explicit_persons"] == 500
    assert preview_res["summary"]["implicit_spouses"] == 0
    assert preview_res["summary"]["total_persons"] == 500
    assert preview_res["is_valid"] is True
    assert len(preview_res["fatal_errors"]) == 0
    # Đảm bảo ráp nối được quan hệ cha-con
    assert preview_res["summary"]["parent_child_count"] == 499
    # Đảm bảo phân nhánh chi phái đầy đủ
    assert preview_res["summary"]["total_branches"] == 3


@pytest.mark.asyncio
async def test_commit_blocked_when_fatal_errors_exist():
    """Kiểm tra commit_smart_import từ chối lưu dữ liệu xuống database khi có lỗi chặn."""
    dummy_clan_id = uuid.uuid4()
    dummy_user_id = uuid.uuid4()
    mock_db = _create_mock_db()

    invalid_parsed_data = {
        "is_valid": False,
        "fatal_errors": [{"sheet": "THÀNH VIÊN", "row": 2, "message": "Lỗi dữ liệu nghiêm trọng"}],
        "preview": {"persons": [{"fullName": "Test", "code": "P1"}], "relationships": [], "branches": []},
    }

    with pytest.raises(ValueError, match="Không thể lưu dữ liệu vì quá trình phân tích còn lỗi chặn"):
        await smart_excel_service.commit_smart_import(
            clan_id=dummy_clan_id,
            user_id=dummy_user_id,
            db=mock_db,
            parsed_data=invalid_parsed_data,
        )


@pytest.mark.asyncio
async def test_father_code_prioritized_linking():
    """Kiểm tra ưu tiên liên kết bằng Mã Cha (father_code) thay vì so khớp tên."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "THÀNH VIÊN"

    # 2 người cùng tên "Mai Văn Thủy" ở đời 1, nhưng mã khác nhau
    ws.append(["Mã", "Họ và tên", "Đời", "Mã Cha"])
    ws.append(["MTT_01", "Mai Văn Thủy", 1, ""])
    ws.append(["MTT_02", "Mai Văn Thủy", 1, ""])
    # Người con chỉ rõ Mã Cha là MTT_02
    ws.append(["MTT_03", "Mai Văn Nam", 2, "MTT_02"])

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    dummy_clan_id = uuid.uuid4()
    detect_res = await smart_excel_service.detect_schema(file_bytes, dummy_clan_id, use_ai=False)
    col_map = {item["col_letter"]: item["suggested_field"] for item in detect_res["column_mapping"]}
    assert col_map["D"] == "father_code"

    config = {
        "selected_sheet": "THÀNH VIÊN",
        "header_row": 1,
        "data_start_row": 2,
        "column_mapping": col_map,
    }

    mock_db = _create_mock_db()
    preview_res = await smart_excel_service.parse_and_reconstruct_graph(
        file_bytes=file_bytes,
        clan_id=dummy_clan_id,
        db=mock_db,
        config=config,
    )

    assert preview_res["is_valid"] is True
    assert preview_res["summary"]["parent_child_count"] == 1
    # Quan hệ phải nối chính xác với MTT_02, không phải MTT_01
    pc_rel = preview_res["preview"]["relationships"][0]
    assert pc_rel["person1"] == "MTT_02"
    assert pc_rel["person2"] == "MTT_03"


@pytest.mark.asyncio
async def test_cycle_detection_blocks_import():
    """Kiểm tra phát hiện chu trình huyết thống (A -> B -> C -> A) và chặn import bằng LINEAGE_CYCLE_DETECTED."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "THÀNH VIÊN"

    ws.append(["Mã", "Họ và tên", "Đời", "Mã Cha"])
    ws.append(["P1", "Thành viên A", 1, "P3"])  # A là con của C
    ws.append(["P2", "Thành viên B", 2, "P1"])  # B là con của A
    ws.append(["P3", "Thành viên C", 3, "P2"])  # C là con của B -> Vòng lặp!

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    dummy_clan_id = uuid.uuid4()
    config = {
        "selected_sheet": "THÀNH VIÊN",
        "header_row": 1,
        "data_start_row": 2,
        "column_mapping": {
            "A": "person_code",
            "B": "full_name",
            "C": "generation",
            "D": "father_code",
        },
    }

    mock_db = _create_mock_db()
    preview_res = await smart_excel_service.parse_and_reconstruct_graph(
        file_bytes=file_bytes,
        clan_id=dummy_clan_id,
        db=mock_db,
        config=config,
    )

    assert preview_res["is_valid"] is False
    assert any(err["code"] == "LINEAGE_CYCLE_DETECTED" for err in preview_res["fatal_errors"])


@pytest.mark.asyncio
async def test_invalid_generation_order_blocks_import():
    """Kiểm tra kiểm soát thế hệ: Cha có thế hệ >= Con sẽ bị chặn bằng INVALID_GENERATION_ORDER."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "THÀNH VIÊN"

    ws.append(["Mã", "Họ và tên", "Đời", "Mã Cha"])
    # Cha có Đời 3, nhưng Con lại ghi Đời 2 -> Bất hợp lý
    ws.append(["P1", "Mai Văn Cha", 3, ""])
    ws.append(["P2", "Mai Văn Con", 2, "P1"])

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    dummy_clan_id = uuid.uuid4()
    config = {
        "selected_sheet": "THÀNH VIÊN",
        "header_row": 1,
        "data_start_row": 2,
        "column_mapping": {
            "A": "person_code",
            "B": "full_name",
            "C": "generation",
            "D": "father_code",
        },
    }

    mock_db = _create_mock_db()
    preview_res = await smart_excel_service.parse_and_reconstruct_graph(
        file_bytes=file_bytes,
        clan_id=dummy_clan_id,
        db=mock_db,
        config=config,
    )

    assert preview_res["is_valid"] is False
    assert any(err["code"] == "INVALID_GENERATION_ORDER" for err in preview_res["fatal_errors"])


@pytest.mark.asyncio
async def test_needs_confirmation_when_missing_father():
    """Kiểm tra AI/Heuristic đánh dấu needs_confirmation=True nếu file thiếu cột Cha."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "THÀNH VIÊN"

    # Chỉ có STT, Họ và tên, Năm sinh - Không có cột Cha
    ws.append(["STT", "Họ và tên", "Năm sinh"])
    ws.append([1, "Mai Văn An", 1980])

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    dummy_clan_id = uuid.uuid4()
    detect_res = await smart_excel_service.detect_schema(file_bytes, dummy_clan_id, use_ai=False)

    assert detect_res["needs_confirmation"] is True
    assert "Chưa nhận diện được cột Cha" in detect_res["notes"]


@pytest.mark.asyncio
async def test_commit_smart_import_bulk_success():
    """Kiểm tra commit_smart_import thực hiện bulk insert siêu tốc mà không timeout."""
    dummy_clan_id = uuid.uuid4()
    dummy_user_id = uuid.uuid4()
    mock_db = _create_mock_db()

    parsed_data = {
        "is_valid": True,
        "fatal_errors": [],
        "preview": {
            "branches": [{"code": "BR_1", "name": "Chi Trưởng", "order": 1}],
            "persons": [
                {
                    "code": "P1",
                    "fullName": "Mai Văn Thủy",
                    "gender": "MALE",
                    "generation": 1,
                    "birthDate": "1920-01-01",
                    "isLiving": False,
                    "branchName": "Chi Trưởng",
                },
                {
                    "code": "P2",
                    "fullName": "Mai Văn Nam",
                    "gender": "MALE",
                    "generation": 2,
                    "birthDate": "1950-01-01",
                    "isLiving": True,
                    "branchName": "Chi Trưởng",
                },
            ],
            "relationships": [
                {
                    "person1": "P1",
                    "person2": "P2",
                    "relationshipType": "PARENT_CHILD",
                    "parentType": "BIOLOGICAL",
                }
            ],
        },
    }

    res = await smart_excel_service.commit_smart_import(
        clan_id=dummy_clan_id,
        user_id=dummy_user_id,
        db=mock_db,
        parsed_data=parsed_data,
        wipe_existing=True,
    )

    assert res["success"] is True
    assert res["created_persons"] == 2
    assert res["created_relationships"] == 1
    assert res["created_branches"] == 1


@pytest.mark.asyncio
async def test_large_scale_import_2000_members():
    """Kiểm tra khả năng chịu tải với dữ liệu lớn: 2.000 thành viên qua 10 thế hệ."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "THÀNH VIÊN"

    headers = ["Mã TV", "Họ và tên", "Giới tính", "Đời thứ", "Năm sinh", "Mã Cha", "Chi họ"]
    ws.append(headers)

    # Đời 1: Cụ Tổ
    ws.append(["P_0001", "Mai Khởi Tổ", "Nam", 1, "1750", "", "Chi Trưởng"])

    # Tạo 1.999 thành viên tiếp theo qua các đời 2..10
    parent_codes_by_gen = {1: ["P_0001"]}
    total_count = 1

    for gen in range(2, 11):
        parent_codes_by_gen[gen] = []
        parents = parent_codes_by_gen[gen - 1]
        members_this_gen = 222 if gen < 10 else (2000 - total_count)

        for i in range(members_this_gen):
            total_count += 1
            code = f"P_{total_count:04d}"
            name = f"Mai Thế Tộc {total_count}"
            parent_codes_by_gen[gen].append(code)
            p_code = parents[i % len(parents)]
            gender = "Nam" if i % 2 == 0 else "Nữ"
            birth_year = 1750 + (gen * 25) + (i % 10)
            branch = f"Chi {('Trưởng' if i % 4 == 0 else 'Hai' if i % 4 == 1 else 'Ba' if i % 4 == 2 else 'Tư')}"

            ws.append([code, name, gender, gen, str(birth_year), p_code, branch])

    assert total_count == 2000

    buf = io.BytesIO()
    wb.save(buf)
    file_bytes = buf.getvalue()

    dummy_clan_id = uuid.uuid4()
    dummy_user_id = uuid.uuid4()

    # 1. Phân tích & ráp nối cây 2.000 người
    config = {
        "selected_sheet": "THÀNH VIÊN",
        "header_row": 1,
        "data_start_row": 2,
        "column_mapping": {
            "A": "person_code",
            "B": "full_name",
            "C": "gender",
            "D": "generation",
            "E": "birth_date",
            "F": "father_code",
            "G": "branch_name",
        },
    }

    mock_db = _create_mock_db()
    preview_res = await smart_excel_service.parse_and_reconstruct_graph(
        file_bytes=file_bytes,
        clan_id=dummy_clan_id,
        db=mock_db,
        config=config,
    )

    assert preview_res["is_valid"] is True
    assert preview_res["summary"]["explicit_persons"] == 2000
    assert preview_res["summary"]["total_persons"] == 2000
    assert preview_res["summary"]["parent_child_count"] == 1999
    assert preview_res["summary"]["total_branches"] == 4

    # 2. Commit bulk insert 2.000 người
    commit_res = await smart_excel_service.commit_smart_import(
        clan_id=dummy_clan_id,
        user_id=dummy_user_id,
        db=mock_db,
        parsed_data=preview_res,
        wipe_existing=True,
    )

    assert commit_res["success"] is True
    assert commit_res["created_persons"] == 2000
    assert commit_res["created_relationships"] == 1999
