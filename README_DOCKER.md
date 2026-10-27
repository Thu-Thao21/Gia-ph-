# HƯỚNG DẪN CHẠY DỰ ÁN BẰNG DOCKER (KHÔNG CẦN CÀI ĐẶT GÌ THÊM)

Dự án **Hệ thống Quản lý Gia phả Đa dòng họ (MFGMS)** đã được đóng gói toàn bộ Frontend và Backend vào Docker. 
Bất kỳ thành viên nào trong nhóm khi clone repo về máy **không cần cài Node.js, Python hay PostgreSQL**, chỉ cần máy có **Docker Desktop**.

---

## 1. Khởi chạy toàn bộ hệ thống (Chỉ 1 câu lệnh)

Mở Terminal tại thư mục gốc của dự án và chạy:

```bash
docker compose up --build -d
```

Docker sẽ tự động:
1. Build Frontend SPA với Nginx.
2. Build Backend FastAPI với đầy đủ dependencies (`psycopg`, `bcrypt`, `greenlet`...).
3. Tự động kết nối trực tiếp đến **PostgreSQL Neon Cloud DB**.

---

## 2. Truy cập hệ thống

* **Giao diện người dùng (Frontend)**:
  👉 [http://localhost:5173](http://localhost:5173) (hoặc [http://localhost:3000](http://localhost:3000))
* **Tài liệu API Backend (Swagger UI)**:
  👉 [http://localhost:8001/docs](http://localhost:8001/docs)

---

## 3. Danh sách tài khoản đăng nhập mẫu

| Vai trò | Email đăng nhập | Mật khẩu | Dòng họ / Quyền hạn |
|---|---|---|---|
| **System Admin** | `thuthaor120608@gmail.com` | `Admin@123` | Quản trị toàn hệ thống |
| **Trưởng tộc Họ Võ** | `vo.danang@giapha.com` | `Admin@123` | Chủ quản Dòng Họ Võ Đại Tộc |
| **Trưởng tộc Họ Mai** | `mai.phongdien@giapha.com` | `Admin@123` | Chủ quản Dòng Họ Mai Thế Tộc |
| **Family Admin** | `huy13052005@gmail.com` | `Admin@123` | Quản trị viên Chi 1 Họ Võ |
| **Member** | `quankophaiwibu@gmail.com` | `Admin@123` | Thành viên dòng họ & Cầu nối liên họ |

---

## 4. Dừng hệ thống

Khi muốn dừng các container:

```bash
docker compose down
```
