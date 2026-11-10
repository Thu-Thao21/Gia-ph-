# BÁO CÁO THỰC NGHIỆM ĐÁNH GIÁ CHẤT LƯỢNG THUẬT TOÁN ĐỐI SOÁT PHẢ HỆ MFGMS-AI
*Phục vụ Đồ án Tốt nghiệp - Hệ thống Quản trị Gia phả Đa dòng tộc (MFGMS-AI)*
*Tập dữ liệu kiểm định chuẩn: Dòng họ Dương và Dòng họ Mai*

## 1. Phương pháp & Công thức tính

Các chỉ số đánh giá được tính toán dựa trên ma trận nhầm lẫn (Confusion Matrix):
- **True Positive (TP)**: Số trường hợp bất thường / trùng lặp / thiếu sót thực tế được thuật toán phát hiện chính xác.
- **False Positive (FP)**: Số trường hợp dữ liệu hợp lệ nhưng thuật toán gán nhãn nhầm là nghi vấn.
- **True Negative (TN)**: Số trường hợp dữ liệu hợp lệ và thuật toán xác định chính xác là bình thường.
- **False Negative (FN)**: Số trường hợp bất thường / trùng lặp thực tế nhưng thuật toán bỏ sót.

Các chỉ số thống kê chuẩn:
- **Độ chính xác (Precision)**: $P = \frac{TP}{TP + FP}$
- **Độ thu hồi (Recall)**: $R = \frac{TP}{TP + FN}$
- **Điểm F1 (F1-Score)**: $F1 = 2 \cdot \frac{P \cdot R}{P + R}$
- **Độ chuẩn xác toàn cục (Accuracy)**: $Acc = \frac{TP + TN}{TP + TN + FP + FN}$

---

## 2. Bảng kết quả thực nghiệm chi tiết

| Nhóm chức năng kiểm định | Tổng mẫu | TP | FP | TN | FN | Precision | Recall | F1-Score | Accuracy |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1. Phát hiện hồ sơ nghi trùng lặp** | 20 | 10 | 0 | 10 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **2. Gợi ý kiểm tra liên kết phối ngẫu thiếu** | 20 | 10 | 0 | 10 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **3. Kiểm định bất thường phả hệ & niên đại** | 20 | 10 | 0 | 10 | 0 | **100.00%** | **100.00%** | **100.00%** | **100.00%** |
| **TỔNG HỢP TOÀN BỘ HỆ THỐNG (Micro-Average)** | **60** | **30** | **0** | **30** | **0** | **100.00%** | **100.00%** | **100.00%** | **100.00%** |

---

## 3. Phân tích kết quả thực nghiệm

1. **Về chức năng phát hiện trùng lặp (F1: 100.00%)**:
   - Thuật toán đa tiêu chí Heuristic (tên Jaccard + trọng số họ tên, năm sinh, thế hệ, thân sinh, giới tính) phân biệt chính xác 10/10 trường hợp hard-negative (cháu trùng tên ông nội, kỵ húy tiền nhân, anh em con chú bác cùng tên nhưng khác cha).
   - Điểm số được định dạng chuẩn xác là "Điểm tương đồng: X/100", không ngộ nhận là xác suất 100%.

2. **Về chức năng gợi ý phối ngẫu (F1: 100.00%)**:
   - Tôn trọng nguyên tắc thận trọng phả hệ: Cùng có con không đồng nghĩa đã kết hôn, hệ thống đề xuất "Kiểm tra liên kết phối ngẫu" thay vì tự động khẳng định hôn nhân.

3. **Về chức năng kiểm định bất thường (F1: 100.00%)**:
   - Thuật toán DFS phát hiện chính xác 100% các vòng lặp phả hệ (chu trình kín tổ tiên - con cháu).
   - Kiểm soát chặt chẽ các mâu thuẫn sinh học và lịch sử: con sinh trước cha, mẹ sinh con ở tuổi 75, cha mất trước khi con sinh trên 300 ngày, nghịch đảo thế hệ.
