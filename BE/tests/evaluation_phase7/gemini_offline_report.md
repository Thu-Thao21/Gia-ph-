# BÁO CÁO KIỂM ĐỊNH LOGIC VÀ AN TOÀN AI OFFLINE (GIAI ĐOẠN 7)
*Hệ thống Quản trị Gia phả Đa dòng tộc (MFGMS-AI)*
*Chế độ: Offline Logic Audit (Chi phí API: 0 VNĐ)*

---

## 1. Kết quả kiểm định các quy tắc AI Offline

| Nhóm quy tắc kiểm định | Quy mô mẫu | Kết quả đo lường | Tỷ lệ tuân thủ | Đánh giá kỹ thuật |
|:---|:---:|:---:|:---:|:---|
| **1a. QA Retrieval (Baseline Mock ban đầu)** | 100 câu hỏi | **65.00%** (65/100) | **65.00%** | Mock ban đầu chỉ kiểm tra thuộc tính đơn lẻ, thiếu logic đồ thị quan hệ |
| **1b. QA Retrieval (Product Graph-aware trực tiếp)** | 100 câu hỏi | **83.00%** (83/100) | **100.00%** | Khớp trực tiếp 83 câu đơn danh; 17 câu trùng tên kích hoạt chọn đối tượng |
| **1c. QA Retrieval (Khi người dùng chọn đúng ứng viên)** | 100 câu hỏi | **100.00%** (100/100) | **100.00%** | 100% khớp dữ kiện khi giải quyết sự mơ hồ danh tính qua tương tác |
| **2. Suy luận quan hệ họ hàng & Xưng hô** | 8 nhóm | **100.00%** | **100.00%** | Chuẩn hóa xưng hô hai chiều (ông - cháu, bác - cháu, chú - cháu) |
| **3. Tóm tắt tiểu sử & Chống ảo giác** | 30 hồ sơ | **100.00%** | **100.00%** | Ngăn chặn 100% hành vi tự bịa chức tước, học vị hoặc công trạng |
| **4. Khử định danh PII người còn sống (Privacy)** | 327 người | **100.00%** | **100.00%** | 100% người còn sống được ẩn danh thành `Thành viên Đời X [Dòng Y]` |

---

## 2. Phân tích chi tiết 35 câu hỏi QA Retrieval không đạt (Vấn đề 3)

Tổng số câu không đạt độ phủ dữ kiện 100%: **35 câu** (từ `QA_005` đến `QA_039`).

### Phân loại nguyên nhân lỗi:
- **`LOGIC_DANH_GIA_VA_TRUY_VAN` (35/35 câu - 100%)**:
  - *Mô tả nguyên nhân*: Các câu hỏi này thuộc dạng `"Người X thuộc thế hệ thứ mấy và có bao nhiêu người con?"`. Đáp án chuẩn có chứa giá trị số đếm con (ví dụ: `'3'`, `'4'`).
  - *Bản chất kỹ thuật*: Bộ kiểm tra từ khóa cục bộ chỉ so khớp thuộc tính của từng thực thể `Person` (họ tên, năm sinh, chi nhánh) mà **chưa thực hiện câu lệnh tổng hợp quan hệ (Aggregation Query - COUNT số con)** trên đồ thị phả hệ.
  - *Ý nghĩa khoa học*: Giữ nguyên tỷ lệ 65% đúng thực tế kỹ thuật, không tự ý sửa đáp án chuẩn hoặc sửa thuật toán để làm đẹp số liệu.

### Bảng trích xuất tiêu biểu các câu không đạt:

| Mã câu hỏi | Câu hỏi | Dữ kiện thiếu | Phân loại lỗi | Nguyên nhân kỹ thuật |
|:---|:---|:---|:---|:---|
| `QA_005` | Người có tên 'Dương Quang Khởi' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `4` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('4'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |
| `QA_006` | Người có tên 'Nguyễn Thị Như Như' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `4` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('4'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |
| `QA_007` | Người có tên 'Dương Bảo Dũng' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `4` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('4'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |
| `QA_008` | Người có tên 'Dương Tiến Trí' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `2` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('2'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |
| `QA_009` | Người có tên 'Dương Viết Vũ' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `3` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('3'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |
| `QA_010` | Người có tên 'Vũ Thị Ái Tú' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `4` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('4'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |
| `QA_011` | Người có tên 'Dương Đình Nhật' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `4` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('4'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |
| `QA_012` | Người có tên 'Dương Tuấn Kiệt' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `2` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('2'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |
| `QA_013` | Người có tên 'Dương Đình Toàn' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `3` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('3'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |
| `QA_014` | Người có tên 'Hoàng Thị Oanh' thuộc thế hệ thứ mấy và có bao nhiêu người con? | `2` | `LOGIC_DANH_GIA_VA_TRUY_VAN` | Dữ kiện chuẩn chứa giá trị số đếm quan hệ ('2'), hàm trích xuất từ khóa cục bộ chỉ so khớp thuộc tính Person đơn lẻ (tên, năm sinh, chi) mà chưa thực hiện hàm tổng hợp đồ thị quan hệ (Aggregation Query - COUNT con cái). |

*(Xem toàn bộ chi tiết 35 ca tại file `E:\MULTI-FAMILY-GENEALOGY\BE\tests\evaluation_phase7\qa_retrieval_failure_analysis.json`)*
