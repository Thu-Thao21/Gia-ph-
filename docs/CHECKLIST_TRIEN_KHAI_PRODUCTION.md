# Checklist triển khai production (phần ngoài, Sprint 1)

Chỉ là danh sách việc cần làm; chưa thực hiện. Đánh dấu từng mục khi làm xong, ghi người làm và giờ.

## A. Trước ngày triển khai
- [ ] Nhóm trưởng chốt các mục ở `docs/BAO_CAO_SPRINT1_BUGFIX.md` mục 5.
- [ ] Đổi (rotate) bí mật đã lộ trong lịch sử git: khóa Google/Firebase Web API cũ, mật khẩu Neon cũ.
- [ ] Giới hạn khóa Firebase Web API theo domain/API trong Google Cloud Console.
- [ ] Review code và merge vào nhánh phát hành; CI chạy `pip install -r requirements-dev.txt` + `pytest`, và `npm ci && npm run build`.
- [ ] Chạy thử migration 0005 đến 0010 trên một nhánh Neon tách từ production (KHÔNG phải production), đọc log backfill (nhóm trùng), xử lý dữ liệu trùng nếu cần.
- [ ] Chuẩn bị bản sao lưu / điểm khôi phục (Neon branch hoặc point-in-time) ngay trước giờ chạy.

## B. Biến môi trường production (BE)
- [ ] `APP_ENV=production`, `DEBUG=false`, `OTP_DEV_SIMULATION=false`, `ALLOW_GMAIL_PLUS_ALIAS=false` (chốt trước 0008).
- [ ] `DEV_DATABASE_HOSTS` KHÔNG chứa host production.
- [ ] `DATABASE_URL` của production (`sslmode=require`), role riêng, mật khẩu mới.
- [ ] `OTP_HMAC_KEY`: chuỗi ngẫu nhiên 32+ ký tự, khác dev, lưu trong kho bí mật.
- [ ] `SMTP_USER` / `SMTP_PASSWORD` (App Password), `BLOCKED_EMAIL_DOMAINS=giapha.com`.
- [ ] `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_PATH` (tệp ngoài repo, quyền đọc tối thiểu).
- [ ] `FRONTEND_ORIGINS` = đúng domain FE (không `*`), `FRONTEND_URL`, `FRONTEND_BASE_URL` = domain FE thật.
- [ ] Sau reverse proxy: `TRUST_PROXY_HEADERS=true`, `TRUSTED_PROXY_COUNT` đúng số proxy.
- [ ] So từng biến với `BE/.env.example`; không để giá trị mẫu.

## C. Biến môi trường production (FE)
- [ ] `VITE_API_BASE_URL` = domain BE thật (gồm `/api/v1`).
- [ ] Không điền `VITE_FIREBASE_*` trừ khi có tính năng cần (FE hiện không dùng Firebase).

## D. Thứ tự triển khai
- [ ] Bật bảo trì / chặn ghi (nếu cần).
- [ ] In host đích và đối chiếu: đúng endpoint production, KHÔNG phải nhánh dev; lấy fingerprint (`python -m app.db.fingerprint`).
- [ ] Xem trước SQL: `alembic upgrade <revision hiện tại>:head --sql`.
- [ ] `ALLOW_MIGRATE=1 MIGRATE_EXPECT_FINGERPRINT=<fingerprint production> alembic upgrade head`; lưu log (nhóm trùng 0008/0010).
- [ ] Triển khai BE mới (image build với `requirements.txt` + `constraints.txt`); BE phải khởi động không có lỗi cấu hình.
- [ ] Triển khai FE mới (build với biến production).
- [ ] Tắt bảo trì.

## E. Kiểm tra sau triển khai
- [ ] `GET /api/health` 200 nhanh; `GET /api/health/ready` 200 (`{"status":"ready"}`).
- [ ] Đăng nhập bằng tài khoản thật; đổi mật khẩu tạm của Trưởng tộc mới.
- [ ] Đăng ký thành viên: nhận OTP thật, sai mã thấy đúng thông báo, đăng ký thành công; Gmail trùng báo 409.
- [ ] Wizard Business: nộp hồ sơ; dòng họ trùng báo `DUPLICATE_CLAN`; Super Admin thấy cảnh báo mềm.
- [ ] Duyệt hồ sơ: mã dòng họ và ID `<mã>@giapha.com` đúng; mật khẩu tạm tới Gmail liên hệ (một thư).
- [ ] Quên mật khẩu (thành viên và Trưởng tộc): thư tới đúng Gmail, liên kết dùng một lần.
- [ ] Không có thư nào gửi tới `@giapha.com` (audit `email.blocked_domain` nếu có).
- [ ] Log không có mật khẩu, mã OTP, token, email đầy đủ.

## F. Khôi phục khi lỗi
- [ ] BE lỗi sau migration: khôi phục bản BE cũ CHỈ khi DB chưa bị đổi; nếu đã chạy migration thì ưu tiên sửa tiến, hoặc khôi phục DB từ điểm khôi phục (downgrade 0010 đến 0005 làm mất dữ liệu các bảng mới).
- [ ] Ghi lại sự cố và thời điểm khôi phục.
