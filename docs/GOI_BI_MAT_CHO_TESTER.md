# Mẫu "gói bí mật" cho tester (Minh gửi riêng)

Tệp này CHỈ là mẫu: tên biến và ví dụ GIẢ. Giá trị thật Minh gửi qua kênh riêng (tin nhắn trực tiếp /
trình quản lý mật khẩu), KHÔNG qua git, issue hay nhóm chat công khai. Tester đặt vào `secrets\` ở gốc repo
rồi chạy `scripts\setup_tester.ps1` (hoặc `-FillMissing` nếu đã chạy trước đó).

## Tệp 1: `secrets\be.env`
```
# DB dev DÙNG CHUNG dev_minhquan (Neon, host ep-patient-term-b4dlkr06). KHÔNG BAO GIỜ là production.
DATABASE_URL=postgresql+psycopg://<user>:<mật_khẩu>@ep-patient-term-b4dlkr06-pooler.<region>.aws.neon.tech/<db>?sslmode=require

# Firebase (project của nhóm)
FIREBASE_PROJECT_ID=<firebase-project-id>
# Web API key của cùng project: cần cho bước xác nhận "quên mật khẩu"
FIREBASE_API_KEY=<web-api-key>

# Gmail gửi OTP / thư (App Password 16 ký tự, KHÔNG phải mật khẩu Gmail)
SMTP_USER=<gmail-gui-thu>@gmail.com
SMTP_PASSWORD=<app-password-16-ky-tu>
```

## Tệp 2: `secrets\firebase-service-account.json`
Tệp service account của project Firebase trên (Firebase Console > Project settings > Service accounts >
Generate new private key). Đúng MỘT tệp `.json` trong `secrets\`; setup tự điền
`FIREBASE_SERVICE_ACCOUNT_PATH=../secrets/<tên tệp>.json`.

## Không nằm trong gói (setup tự tạo)
`APP_ENV=dev`, `ALLOW_GMAIL_PLUS_ALIAS=true`, `OTP_HMAC_KEY` (ngẫu nhiên riêng mỗi máy),
`DEV_DATABASE_HOSTS` (theo host của DATABASE_URL), `FRONTEND_*`, `FE\.env`.

## Nhắc tester
- Tuyệt đối không commit / không đẩy lên git / không chụp màn hình nội dung `secrets\`, `BE\.env`.
- DB dùng chung: không xóa dữ liệu, không DROP/TRUNCATE, không chạy alembic, không đổi mật khẩu tài khoản có sẵn.
- Kết thúc đợt test: xóa `secrets\`; Minh sẽ đổi mật khẩu DB / thu hồi khóa nếu cần.

## Việc Minh chuẩn bị trước khi gửi
- [ ] (Khuyên) tạo role Neon riêng cho tester trên dev_minhquan thay vì dùng role chủ; ít nhất KHÔNG gửi role có quyền DDL nếu không cần.
- [ ] Gửi FIREBASE_API_KEY đã giới hạn theo API (Identity Toolkit) trong Google Cloud.
- [ ] Gmail gửi thư dùng App Password riêng cho đợt test (thu hồi được).
- [ ] DB dev_minhquan đã ở alembic head (`0010_clan_identity_registry`); `check_env.py` báo lệch thì Minh chạy migration.
- [ ] Danh sách ID tài khoản có sẵn + mật khẩu (đặt bằng `BE\scripts\set_password.py`), gửi riêng.
