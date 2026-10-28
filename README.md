# MULTI-FAMILY GENEALOGY MANAGEMENT SYSTEM (MFGMS)
### Hệ Thống Quản Lý & Kết Nối Gia Phả Đa Dòng Họ

Dự án nền tảng số hóa gia phả, kết nối dòng tộc, tra cứu quan hệ họ hàng và quản trị thông tin dòng họ toàn diện cho các dòng họ Việt Nam.

---

## 1. Công Nghệ Sử Dụng (Tech Stack)

- **Frontend (`/FE`):**
  - **Framework:** React 18, TypeScript, Vite.
  - **Styling:** Vanilla CSS cao cấp, tối ưu responsive, bảng màu chuẩn mực SaaS (`AdminTheme.css`).
  - **Authentication:** Firebase Client SDK tích hợp Backend Session.
- **Backend (`/BE`):**
  - **Framework:** Python, FastAPI, Uvicorn.
  - **Database & ORM:** PostgreSQL trên đám mây (Neon DB), SQLAlchemy (Async), Alembic migrations.
  - **Authentication:** Firebase Admin SDK, JWT Session Tokens, Role-Based Access Control (RBAC).

---

## 2. Hướng Dẫn Khởi Chạy Nhanh (Quick Start)

### Backend (BE)
```bash
# Di chuyển vào thư mục BE
cd BE

# Kích hoạt môi trường ảo Python (nếu có)
# Cài đặt thư viện:
pip install -r requirements.txt

# Khởi chạy server Backend (chạy tại port 8001):
py run_server.py
```
*API Docs kiểm tra tại:* `http://127.0.0.1:8001/docs`

### Frontend (FE)
```bash
# Di chuyển vào thư mục FE
cd FE

# Cài đặt thư viện:
npm install

# Khởi chạy máy chủ phát triển (chạy tại port 5173):
npm run dev
```
*Giao diện người dùng truy cập tại:* `http://localhost:5173`

---

## 3. Cấu Trúc Dự Án & Bản Đồ Thư Mục

Để tra cứu vị trí các tính năng, component và API trong 3 giây, vui lòng xem chi tiết tại:
👉 **[Tài Liệu Cấu Trúc Dự Án (PROJECT_STRUCTURE.md)](docs/PROJECT_STRUCTURE.md)**

### Thư mục tài liệu tổng hợp (`docs/`):
- `docs/sprints/`: Kịch bản kiểm thử và checklist tiêu chuẩn các sprint.
- `docs/reports/`: Báo cáo vá lỗi, tổng hợp sửa đổi giao diện và tài liệu khắc phục lỗ hổng.
