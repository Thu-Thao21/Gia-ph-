# BÁO CÁO THỰC NGHIỆM TRỰC TIẾP GEMINI API (GIAI ĐOẠN 7)
*Hệ thống Quản trị Gia phả Đa dòng tộc (MFGMS-AI)*
*Được kích hoạt thông qua cờ `--live-gemini`*

---

## 1. Tổng quan Lượt gọi API & Phân biệt Lỗi Hạ tầng

| Chỉ số thực nghiệm | Giá trị ghi nhận | Ghi chú khoa học |
|:---|:---:|:---|
| **Tổng số lượt gọi thực hiện** | **5 lượt** | Mẫu kiểm thử từ tập câu hỏi gia phả độc lập |
| **Số lượt gọi thành công (HTTP 200)** | **5 lượt** | Nhận phản hồi nội dung hợp lệ từ Gemini |
| **Số lượt gọi thất bại (Lỗi kỹ thuật)** | **0 lượt** | Phân loại rõ: Timeout, Rate Limit 429, Unavailable 503 |
| **Tỷ lệ hoàn thành yêu cầu (Completion Rate)** | **100.00%** | Thước đo độ ổn định hạ tầng kết nối API |
| **Độ chính xác tri thức (Knowledge Accuracy)** | **80.00%** | **Chỉ tính trên các cuộc gọi thành công, không tính lỗi mạng thành sai kiến thức** |
| **Độ trễ trung bình (Average Latency)** | **0.82s** | Thời gian phản hồi trung bình mỗi lượt gọi |
| **Trạng thái đánh giá** | **HOÀN TẤT ĐÁNH GIÁ** | Minh bạch, không tuyên bố thành công khi kết nối thất bại |

---

## 2. Chi tiết Lỗi Hạ tầng & Nguyên nhân Thất bại
Không ghi nhận lỗi hạ tầng nào trong đợt chạy này.

## 3. Nhật ký kiểm định từng mẫu câu hỏi:

- **`QA_001`**: Thủy tổ của dòng họ Dương trong hệ thống tên là gì và sinh năm bao nhiêu?
  - Trạng thái gọi: `SUCCESS` | Đánh giá tri thức: `PASS` (1.1s)
  - Phản hồi từ AI: Thủy tổ của dòng họ Dương là Dương Quang Khởi, sinh năm 1820.
- **`QA_002`**: Thủy tổ họ Mai tên là gì?
  - Trạng thái gọi: `SUCCESS` | Đánh giá tri thức: `PASS` (0.82s)
  - Phản hồi từ AI: Thủy tổ họ Mai tên là Mai Phước Điền.
- **`QA_003`**: Dòng họ Dương có những chi phái nào?
  - Trạng thái gọi: `SUCCESS` | Đánh giá tri thức: `PASS` (0.89s)
  - Phản hồi từ AI: Chào bạn, tôi là Trợ lý AI Gia phả MFGMS-AI.

Dựa trên dữ liệu phả hệ tham chiếu, Dòng họ Dương gồm có các chi sau:
- Chi Giáp Họ Dương
- Chi Ất Họ Dương
- Chi Bính Họ Dương
- Chi Đinh Họ Dương
- **`QA_004`**: Dòng họ Mai có những chi phái nào?
  - Trạng thái gọi: `SUCCESS` | Đánh giá tri thức: `PASS` (0.69s)
  - Phản hồi từ AI: Dòng họ Mai gồm có các chi: Chi Tiền Mai, Chi Hậu Mai, Chi Đông Mai, Chi Tây Mai.
- **`QA_005`**: Người có tên 'Dương Quang Khởi' thuộc thế hệ thứ mấy và có bao nhiêu người con?
  - Trạng thái gọi: `SUCCESS` | Đánh giá tri thức: `PARTIAL_OR_FAIL` (0.61s)
  - Phản hồi từ AI: Dương Quang Khởi thuộc Đời thứ 1 và có 4 người con.
