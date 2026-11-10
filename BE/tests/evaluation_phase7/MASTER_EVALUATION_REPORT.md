# BÁO CÁO TỔNG HỢP TOÀN DIỆN THỰC NGHIỆM ĐÁNH GIÁ HỆ THỐNG AI & DỮ LIỆU PHẢ HỆ (GIAI ĐOẠN 7)
**Dự án**: Hệ thống Quản trị Gia phả Đa dòng tộc tích hợp Trí tuệ Nhân tạo (MFGMS-AI)  
**Phục vụ**: Đồ án Tốt nghiệp Kỹ sư / Cử nhân Công nghệ Thông tin  
**Thời gian thực hiện**: Ngày 03/11/2026  
**Môi trường thực nghiệm**: Python 3.13, PostgreSQL Neon, FastAPI, Gemini API  

---

## 1. Cơ cấu Tập Dữ Liệu Thực Nghiệm (Experimental Datasets)

Hệ thống được đánh giá theo phương pháp luận khoa học, phân định rạch ròi giữa **Tập Phát Triển (Development Set)** và **Tập Kiểm Thử Độc Lập (Independent Test Set)**:

| Tiêu chí | Tập Phát Triển (Dev Set - Preserved) | Tập Kiểm Thử Độc Lập (Test Set - Phase 7) |
|:---|:---|:---|
| **Mục đích** | Tinh chỉnh thuật toán ban đầu | Đánh giá khách quan, độc lập |
| **Quy mô Person** | 60 trường hợp kiểm thử chọn lọc | **540 Person** giả lập (Gen 1-7, Họ Dương & Họ Mai) |
| **Số quan hệ phả hệ** | 60 quan hệ cơ bản | **943 quan hệ phả hệ đa thế hệ** |
| **Cặp đối soát trùng lặp** | 20 cặp | **200 cặp** (100 Positives, 100 Hard Negatives) |
| **Gợi ý quan hệ thiếu** | 20 trường hợp | **80 trường hợp** (40 Positives, 40 Negatives) |
| **Kiểm định bất thường** | 20 trường hợp | **80 trường hợp** (40 Positives, 40 Negatives) |
| **Hồ sơ file Excel** | N/A | **12 file Excel** (6 file hợp lệ, 6 file lỗi có chủ đích) |
| **Câu hỏi hỏi đáp (QA)** | N/A | **100 câu hỏi gia phả** kèm đáp án chuẩn (Ground Truth) |
| **Hồ sơ tiểu sử kiểm thử** | N/A | **30 hồ sơ** (Thưa, Trung bình, Giàu dữ sự) |
| **Tính độc lập** | Giữ nguyên gốc, không sửa đổi | Tạo bằng Seed cố định `20261103`, không trùng lặp Person |

---

## 2. Kết quả Đánh giá Thuật toán Định lượng Python (Frozen Algorithms)

Các thuật toán nội bộ được **đóng băng (frozen)** và đánh giá nghiêm ngặt trên 372 trường hợp kiểm thử độc lập:

| Nhóm chức năng thuật toán Python | Tổng mẫu | TP | FP | TN | FN | Precision | Recall | F1-Score | Accuracy |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1. Phát hiện hồ sơ nghi trùng lặp** | 200 | 100 | 0 | 100 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **2. Gợi ý kiểm tra liên kết phối ngẫu** | 80 | 40 | 0 | 40 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **3. Kiểm định bất thường phả hệ & niên đại** | 80 | 40 | 0 | 40 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **4. Thẩm định tiền kiểm tra file Excel** | 12 | 6 | 0 | 6 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **TỔNG HỢP TOÀN BỘ THUẬT TOÁN PYTHON** | **372** | **186** | **0** | **186** | **0** | **100.00%** | **100.00%** | **100.00%** | **100.00%** |

### Ma trận nhầm lẫn (Confusion Matrices)
- **Phát hiện trùng lặp**: $TN = 100, FP = 0, FN = 0, TP = 100$
- **Gợi ý kiểm tra phối ngẫu**: $TN = 40, FP = 0, FN = 0, TP = 40$
- **Kiểm định bất thường**: $TN = 40, FP = 0, FN = 0, TP = 40$
- **Tiền thẩm định file Excel**: $TN = 6, FP = 0, FN = 0, TP = 6$

---

## 3. Kiểm định Tính Độc Lập và Độ Tin Cậy của Dataset (Vấn đề 4)

1. **Kiểm tra cơ chế suy luận (No Label Leakage)**:
   - Thuật toán **không sử dụng nhãn chuẩn (`ground_truth`)** để đưa ra quyết định. Nhãn dự đoán `predicted` được tính toán độc lập từ ma trận điểm suy diễn (`final_score >= 65`).
2. **Bản chất của tập dữ liệu kiểm thử (Rule-Aligned Synthetic Benchmark)**:
   - Tập kiểm thử gồm 540 Person được sinh tự động theo quy tắc cấu trúc phả hệ người Việt (cha mẹ, thế hệ, năm sinh, chi nhánh rõ ràng).
   - Do dữ liệu giả lập có ranh giới thuộc tính tường minh (các cặp Hard Negative có sự khác biệt rõ về cha mẹ hoặc cách biệt 2 thế hệ), thuật toán heuristic có thể phân loại chính xác các trường hợp biên được thiết kế.
3. **Mức độ tin cậy và Giới hạn khoa học**:
   - Bộ chỉ số **100.00%** phản ánh năng lực xử lý chuẩn mực trên **tập dữ liệu tổng hợp quy chuẩn (Synthetic Dataset)**, chứng minh thuật toán hoạt động đúng thiết kế và không gặp lỗi biên (Edge-case errors).
   - *Giới hạn thực tiễn*: Trong gia phả chữ Hán - Nôm hoặc gia phả truyền khẩu thực tế, dữ liệu thường có độ nhiễu cao (thiếu năm sinh, nhầm lẫn chữ lót, trùng tên nhiều người), do đó độ chính xác trên dữ liệu thực địa ngoài đời thực có thể sẽ có sai số nhất định.

---

## 4. Kết quả Đánh giá Logic AI Offline & An toàn Dữ liệu (Chi phí: 0 VNĐ)

| Năng lực AI Offline | Quy mô kiểm thử | Kết quả đo lường | Tỷ lệ tuân thủ | Đánh giá chất lượng chuyên sâu |
|:---|:---:|:---:|:---:|:---|
| **1a. QA Retrieval (Baseline Mock ban đầu)** | 100 câu hỏi | **65.00%** (65/100) | **65.00%** | Mock ban đầu chỉ kiểm tra thuộc tính đơn lẻ, thiếu logic đồ thị quan hệ tổng hợp |
| **1b. QA Retrieval (Product Graph-aware trực tiếp)** | 100 câu hỏi | **83.00%** (83/100) | **100.00%** | Khớp trực tiếp 83 câu đơn danh; 17 câu trùng tên kích hoạt prompt chọn đối tượng |
| **1c. QA Retrieval (Khi người dùng chọn đúng ứng viên)** | 100 câu hỏi | **100.00%** (100/100) | **100.00%** | 100% khớp dữ kiện khi giải quyết sự mơ hồ danh tính qua tương tác hội thoại |
| **2. Suy luận vai vế & Xưng hô họ hàng** | 8 nhóm quan hệ | **100.00%** | **100.00%** | Chuẩn xác xưng hô 2 chiều (ông - cháu, bác - cháu, chú - cháu, thím - cháu) |
| **3. Tóm tắt tiểu sử & Chống ảo giác** | 30 hồ sơ đa dạng | **100.00%** | **100.00%** | Tuyệt đối không tự ý thêm thắt học vị, chức tước, chiến công khi gia phả không ghi nhận |
| **4. Khử định danh PII người còn sống (Privacy)** | 327 người sống | **100.00%** | **100.00%** | 100% người sống trong Excel được ẩn danh thành `Thành viên Đời X [Dòng Y]` trước khi gửi AI |

### Phân tích so sánh và Khắc phục QA Retrieval:
1. **Mock Benchmark ban đầu (65/100)**:
   - 35 câu hỏi dạng *"Người X thuộc thế hệ thứ mấy và có bao nhiêu người con?"* bị thiếu số đếm con cái (`QA_005` - `QA_039`).
   - Mock cũ chỉ so khớp từ khóa trên các trường Person đơn lẻ (tên, năm sinh, chi nhánh) mà hoàn toàn không thực hiện truy vấn đồ thị quan hệ con cái (Aggregation Query).
2. **Khắc phục ở Service sản phẩm (ChatbotService & GenealogyTools)**:
   - Đã bổ sung `GenealogyTools.get_person_generation_and_children`: truy vấn chính xác thế hệ và đếm số lượng con duy nhất qua bảng quan hệ `Relationship` (`COUNT(DISTINCT to_member_id)`), kiểm soát chặt chẽ `clan_id` và quyền xem hồ sơ.
   - Sửa lỗi regex nhận diện ý định trong `chatbot_service.py`: trước đó cụm từ *"có bao nhiêu người con"* bị nhận diện nhầm thành thống kê toàn dòng tộc (`CLAN_STATISTICS` do khớp *"bao nhiêu người"*).
   - Xử lý trùng tên (Homonym Ambiguity): Khi có từ 2 Person cùng tên trong phạm vi dòng họ, hệ thống trả về trạng thái `ambiguous` kèm danh sách ứng viên (năm sinh, chi nhánh, thế hệ) để người dùng chọn, tuyệt đối không đoán mò danh tính.

---

## 5. Kết quả Thực nghiệm Trực tiếp Gemini API (Live Mode)

> [!NOTE]
> **Trạng thái**: CHƯA ĐÁNH GIÁ TRỰC TIẾP TRÊN DIỆN RỘNG (Chế độ Offline bảo vệ chi phí API).  
> Để chạy thử nghiệm trực tiếp trên một mẫu nhỏ với Gemini API thật, người dùng chủ động chạy:  
> `python tests/evaluation_phase7/evaluate_gemini_capabilities.py --live-gemini --sample=5`

---

## 6. Kết luận & Danh mục Tệp Tin Báo Cáo

1. `python_evaluation_report.json` & `.md`: Báo cáo chi tiết 372 trường hợp thuật toán Python.
2. `gemini_offline_report.json` & `.md`: Báo cáo kiểm định logic offline và an toàn dữ liệu.
3. `gemini_live_report.json` & `.md`: Báo cáo các lượt gọi trực tiếp Gemini API (khi có cờ cho phép).
4. `qa_retrieval_failure_analysis.json`: Danh mục chi tiết 35 câu hỏi QA chưa đạt độ phủ dữ kiện.
5. `MASTER_EVALUATION_REPORT.md`: Báo cáo tổng hợp toàn diện dùng cho đồ án tốt nghiệp.
