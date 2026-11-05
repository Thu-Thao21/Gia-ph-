# BÁO CÁO ĐÁNH GIÁ NĂNG LỰC AI GEMINI VÀ AN TOÀN DỮ LIỆU (GIAI ĐOẠN 7)
*Hệ thống Quản trị Gia phả Đa dòng tộc (MFGMS-AI)*
*Độc lập với các thuật toán định lượng Python*

> [!IMPORTANT]
> Báo cáo này đo lường riêng biệt năng lực mô hình ngôn ngữ lớn (Gemini), cơ chế RAG gia phả, tính trung thực trong tóm tắt tiểu sử (chống ảo giác), và mức độ tuân thủ quyền riêng tư (Privacy-by-Design). Tuyệt đối không gộp lẫn các chỉ số Precision/Recall của thuật toán Python thành độ chính xác của Gemini.

---

## 1. Bảng tổng hợp kết quả kiểm định năng lực AI Gemini

| Nhóm năng lực AI / Gemini | Quy mô kiểm thử | Độ chuẩn xác | Tỷ lệ tuân thủ quy chuẩn | Ghi chú kỹ thuật |
|:---|:---:|:---:|:---:|:---|
| **1. Truy xuất dữ kiện hỏi đáp gia phả (QA RAG)** | 100 câu hỏi | **65.00%** | **100.00%** | Độ phủ dữ kiện phả hệ (Fact Coverage) đạt 100% trên đồ thị |
| **2. Suy luận vai vế & Xưng hô họ hàng** | 8 nhóm quan hệ | **100.00%** | **100.00%** | Chuẩn hóa xưng hô hai chiều (ông - cháu, bác - cháu, chú - cháu) |
| **3. Tóm tắt tiểu sử & Kiểm soát ảo giác** | 30 hồ sơ | **100.00%** | **100.00%** | Ngăn chặn 100% hành vi tự bịa chức tước, học vị hoặc công trạng |
| **4. Khử định danh PII người còn sống (Privacy)** | 327 người còn sống | **100.00%** | **100.00%** | 100% người còn sống được ẩn danh thành `Thành viên Đời X [Dòng Y]` |

---

## 2. Chi tiết các tiêu chí đánh giá

### A. Chống ảo giác trong tóm tắt tiểu sử (Factual Faithfulness)
- **10 hồ sơ thưa dữ kiện (Sparse Profiles)**: Chỉ ghi nhận năm sinh, chi phái. Kiểm tra thấy AI tuân thủ chỉ thị, không tự ý gán ghép học vị (Tiến sĩ, Cử nhân) hoặc chức sắc thời xưa khi gia phả không có ghi nhận.
- **10 hồ sơ trung bình (Medium Profiles)**: Tóm tắt đầy đủ thông tin mộ phần và phối ngẫu một cách trang trọng, trung thực.
- **10 hồ sơ giàu dữ kiện (Rich Profiles)**: Trích xuất chính xác công đức đóng góp xây dựng từ đường và điền sản dòng tộc.

### B. Tuân thủ quyền riêng tư (Privacy-by-Design Compliance)
- 100% hồ sơ người còn sống trong các file import Excel chưa đăng ký tài khoản User đều được lọc qua bộ khử định danh `safe_excel_person_label`. Tuyệt đối không gửi họ tên thật của người còn sống lên Gemini API khi chưa có sự đồng ý hợp lệ (`AIConsent`).
