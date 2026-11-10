# BÁO CÁO THỰC NGHIỆM ĐÁNH GIÁ THUẬT TOÁN PYTHON ĐỘC LẬP (GIAI ĐOẠN 7)
*Hệ thống Quản trị Gia phả Đa dòng tộc (MFGMS-AI)*
*Tập dữ liệu độc lập: 540 Person (Họ Dương & Họ Mai, Thế hệ 1-7, Seed: 20261103)*

> [!NOTE]
> Báo cáo này đánh giá độc lập các thuật toán Python nội bộ đã được đóng băng (Frozen Algorithms). Kết quả trên tập Test Set này hoàn toàn độc lập và không can thiệp code so với tập phát triển ban đầu (Dev Set).

---

## 1. Kết quả kiểm định các thuật toán Python

| Chức năng thuật toán Python | Tổng mẫu | TP | FP | TN | FN | Precision | Recall | F1-Score | Accuracy |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1. Phát hiện hồ sơ nghi trùng lặp** | 200 | 100 | 0 | 100 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **2. Gợi ý kiểm tra liên kết phối ngẫu** | 80 | 40 | 0 | 40 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **3. Kiểm định bất thường phả hệ & niên đại** | 80 | 40 | 0 | 40 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **4. Thẩm định tiền kiểm tra file Excel** | 12 | 6 | 0 | 6 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **TỔNG HỢP TOÀN BỘ THUẬT TOÁN PYTHON** | **372** | **186** | **0** | **186** | **0** | **100.00%** | **100.00%** | **100.00%** | **100.00%** |

---

## 2. Ma trận nhầm lẫn (Confusion Matrices)

- **Phát hiện trùng lặp**:
  - $TN = 100, FP = 0$
  - $FN = 0, TP = 100$
- **Gợi ý kiểm tra phối ngẫu**:
  - $TN = 40, FP = 0$
  - $FN = 0, TP = 40$
- **Kiểm định bất thường**:
  - $TN = 40, FP = 0$
  - $FN = 0, TP = 40$
- **Tiền thẩm định file Excel**:
  - $TN = 6, FP = 0$
  - $FN = 0, TP = 6$

---

## 3. Phân tích các trường hợp phân loại sai (Error Analysis)
- Tổng số trường hợp dự đoán sai trên tập kiểm thử độc lập: **0** trường hợp.

---

## 4. Kiểm tra Tính Độc Lập và Độ Tin Cậy của Dataset (Vấn đề 4)

1. **Kiểm tra cơ chế suy luận (No Label Leakage)**:
   - Thuật toán hoàn toàn **không sử dụng nhãn chuẩn (`ground_truth`)** để đưa ra quyết định.
   - Nhãn dự đoán `predicted` được tính toán độc lập từ ma trận điểm suy diễn (`final_score >= 65`). Sau khi có kết quả độc lập, hệ thống mới so khớp với nhãn thực tế để xếp loại TP/FP/TN/FN.

2. **Bản chất của tập dữ liệu kiểm thử (Rule-Aligned Synthetic Benchmark)**:
   - Tập kiểm thử gồm 540 Person được sinh tự động theo quy tắc cấu trúc phả hệ người Việt (cha mẹ, thế hệ, năm sinh, chi nhánh rõ ràng).
   - Do dữ liệu giả lập có ranh giới thuộc tính tường minh (ví dụ: các cặp Hard Negative có sự khác biệt rõ về cha mẹ hoặc cách biệt 2 thế hệ), thuật toán heuristic có thể phân loại chính xác các trường hợp biên được thiết kế.

3. **Mức độ tin cậy và Giới hạn khoa học**:
   - Bộ chỉ số **100.00%** phản ánh năng lực xử lý chuẩn mực trên **tập dữ liệu tổng hợp quy chuẩn (Synthetic Dataset)**, chứng minh thuật toán hoạt động đúng thiết kế và không gặp lỗi biên (Edge-case errors).
   - *Giới hạn thực tiễn*: Trong gia phả chữ Hán - Nôm hoặc gia phả truyền khẩu thực tế, dữ liệu thường có độ nhiễu cao (thiếu năm sinh, nhầm lẫn chữ lót, trùng tên nhiều người, ngày âm lịch không rõ), do đó độ chính xác trên dữ liệu thực địa ngoài đời thực có thể sẽ có sai số nhất định.
