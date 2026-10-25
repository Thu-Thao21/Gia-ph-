# HƯỚNG DẪN CHẠY DỰ ÁN BẰNG DOCKER (KHÔNG CẦN CÀI ĐẶT GÌ THÊM)

Dự án **Hệ thống Quản lý Gia phả Đa dòng họ (MFGMS)** đã được đóng gói toàn bộ Frontend và Backend vào Docker. 
Bất kỳ thành viên nào trong nhóm khi clone repo về máy **không cần cài Node.js, Python hay PostgreSQL**, chỉ cần máy có **Docker Desktop**.

---

## 1. Khởi chạy toàn bộ hệ thống (Chỉ 1 câu lệnh)

**Trước tiên** tạo file `.env` ở thư mục gốc (cạnh `docker-compose.yml`). `docker-compose.yml` không
còn giá trị mặc định cho bí mật, nên thiếu file này thì backend không kết nối được DB:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST/DBNAME?sslmode=require
SECRET_KEY=<chuoi-ngau-nhien-dai>
```

File `.env` đã bị `.gitignore` chặn (kiểm tra: `git check-ignore -v .env` phải in ra một dòng).
**Không bao giờ commit file này.** Chuỗi kết nối DB được trưởng nhóm gửi riêng.

Sau đó mở Terminal tại thư mục gốc của dự án và chạy:

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

Mật khẩu được gửi riêng cho từng người (không ghi trong repo). Mật khẩu được đặt bằng
`BE/scripts/set_password.py`; tài khoản seed chưa đặt mật khẩu thì không đăng nhập được.

| Vai trò | Email đăng nhập | Dòng họ / Quyền hạn |
|---|---|---|
| **System Admin** | `thuthaor120608@gmail.com` | Quản trị toàn hệ thống |
| **Trưởng tộc Họ Võ** | `vo.danang@giapha.com` | Chủ quản Dòng Họ Võ Đại Tộc |
| **Trưởng tộc Họ Mai** | `mai.phongdien@giapha.com` | Chủ quản Dòng Họ Mai Thế Tộc |
| **Family Admin** | `huy13052005@gmail.com` | Quản trị viên Chi 1 Họ Võ |
| **Member** | `quankophaiwibu@gmail.com` | Thành viên dòng họ & Cầu nối liên họ |

---

## 4. Dừng hệ thống

Khi muốn dừng các container:

```bash
docker compose down
```
