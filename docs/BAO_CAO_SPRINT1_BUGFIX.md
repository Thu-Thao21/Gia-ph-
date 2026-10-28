# Báo cáo sửa lỗi Sprint 1: phần ngoài (đăng nhập, đăng ký, quên mật khẩu, Business, cấu hình)

Phạm vi: chỉ phần "ngoài" của hệ thống. Cây gia phả, liên dòng họ và các chức năng bên trong KHÔNG
thuộc đợt này (xem mục 6). Chưa commit, chưa push; mọi migration chỉ được viết và chạy thử trên DB tạm,
riêng 0008, 0009 đã được áp dụng trên dev_minhquan.

Kiểm chứng cuối: `pytest` toàn bộ BE (nhóm `integration` chạy riêng khi có Postgres tạm), `npm run build`
FE, `tsc --noEmit` cho các file đã sửa. Số liệu ở mục 7.

## 1. Lỗi và lỗ hổng đã sửa theo mốc

| Mốc | Vấn đề | Đã sửa | Kiểm chứng |
|---|---|---|---|
| M1 | Đăng nhập dựa vào Firebase ID token ở FE; tài khoản thử và khóa cứng trong repo | Một cửa `POST /auth/login`, mật khẩu băm bcrypt trong DB (`credential_metadata.password_hash`); bắt đổi mật khẩu tạm; khóa tài khoản sau 5 lần sai (15 phút); gỡ bí mật khỏi code | `tests/test_login_api.py`, `test_auth_api.py` |
| M2 | Nhiều route không xác thực; IDOR (xem/sửa dữ liệu dòng họ khác) | Mọi route phải xác thực trừ danh sách public có lý do (`app/core/public_routes.py`); test gọi MỌI route không token phải nhận 401; chặn IDOR ở thành viên, gia phả, liên dòng họ | `test_route_auth.py`, `test_idor.py`, `test_idor_inter_family.py`, `docs/route_inventory_M2.md` |
| M3a | Quên mật khẩu với user có trong DB nhưng chưa có tài khoản Firebase thì không gửi thư; Firebase báo "không có email" bằng một lỗi khác (Email Enumeration Protection) nên bị hiểu nhầm là lỗi hệ thống | Tự tạo tài khoản Firebase (mật khẩu ngẫu nhiên, không gửi cho ai) rồi gửi thư; nhận đúng `UnexpectedResponseError` và xác nhận lại bằng `get_user_by_email`; audit mọi kết cục | `test_firebase_reset_link.py`, `test_password_reset.py` |
| M4 | Phụ thuộc mẫu email Firebase (không sửa được Action URL); liên kết đặt lại mật khẩu dùng lại được | BE tự tạo liên kết `{FRONTEND_BASE_URL}/reset-password` và gửi qua SMTP; phản hồi 200 chung (không dò được email); mã chỉ dùng một lần (bảng `used_password_reset_codes`, cùng transaction với mật khẩu) | `test_password_reset.py` (gồm 2 request song song) |
| M5-0 | Thư (cả mật khẩu tạm) có thể gửi tới `@giapha.com`, tên miền không thuộc nhóm; mật khẩu tạm gửi ra hai nơi | Chặn mọi thư tới tên miền cấm (`BLOCKED_EMAIL_DOMAINS`), có audit; mật khẩu tạm gửi một lần, chỉ tới Gmail liên hệ | `test_email_domain_block.py` |
| M5-1 | OTP đăng ký: báo "đã gửi" khi chưa cấu hình SMTP; ai biết email đã xác thực là tạo được tài khoản; trạng thái dùng chung giữa hai luồng; không giới hạn theo email; mã băm SHA-256 đảo ngược được và chỉ ở RAM; log lộ email; mã OTP bị in ra console | Fail-closed; OTP lưu trong DB bằng HMAC (`email_otp_challenges`); token xác thực dùng một lần, gắn đúng email và đúng luồng; giới hạn theo mã, theo email, theo IP; log che email | `test_otp_security.py` (7 lỗ hổng tái hiện trên code cũ rồi sửa) |
| M5-2, M3b | Báo lỗi OTP một câu chung, gây hiểu nhầm; mã lỗi riêng bị mất | Mã lỗi riêng (`OTP_INVALID` kèm số lượt còn lại, `OTP_EXPIRED`, `OTP_TOO_MANY_ATTEMPTS`, `OTP_SUPERSEDED`, `OTP_RATE_LIMITED`, `EMAIL_NOT_VERIFIED`, `VERIFICATION_EXPIRED`, `VERIFICATION_USED`); FE hiện câu tiếng Việt theo mã, nút "Gửi mã mới" (không tự gửi) | `test_otp_error_codes.py` |
| M5-3 | Gmail đã có tài khoản Firebase "mồ côi" làm đăng ký báo 503 | 409 `EMAIL_ALREADY_REGISTERED` hoặc `EMAIL_ACCOUNT_NEEDS_ADMIN`; không nhận, không xóa tài khoản Firebase | `test_register_email_taken.py` |
| M5 | Một Gmail đăng ký được nhiều lần (thành viên, Business, Trưởng tộc); Gmail thật của Trưởng tộc tìm qua chuỗi bảng mong manh | Sổ Gmail (`gmail_registry`, chuẩn hóa dấu chấm, `+tag`, googlemail); `users.contact_email`; quên mật khẩu Trưởng tộc gửi tới Gmail liên hệ | `test_gmail_registry.py`, `test_m5_migrations_db.py` |
| M5c | Form Business: BE lỏng hơn FE; một dòng họ đăng ký được nhiều lần; mã dòng họ ngẫu nhiên; logo nhận SVG | Validate BE chặt (họ tên, Gmail, di động VN, tên dòng họ, quê gốc; lỗi kèm danh sách trường); khóa dòng họ duy nhất (`clan_identity_registry`, 409 `DUPLICATE_CLAN`, cảnh báo mềm cho Super Admin); mã dòng họ và ID đăng nhập `<mã>@giapha.com` sinh từ tên; logo chỉ PNG/JPEG/WebP theo nội dung, từ chối SVG | `test_clan_identity.py`, `test_m5c_migration_db.py` |
| M6b, M7 | Khóa Firebase cứng trong FE; DEBUG có thể bật ngoài dev; requirements không ghim; `.env.example` thiếu biến; healthcheck không giới hạn thời gian | Xem mục 4 | `test_env_example.py` |

## 2. Migration và thứ tự áp dụng

Áp dụng tuần tự, mỗi lần qua guard (`ALLOW_MIGRATE=1`, `MIGRATE_EXPECT_FINGERPRINT=<fingerprint DB đích>`),
và PHẢI chạy trước khi khởi động BE mới (model đã có các cột/bảng này).

| Revision | Nội dung | Ghi chú |
|---|---|---|
| 0005_credential_password_hash | `credential_metadata.password_hash` | idempotent |
| 0006_used_password_reset_codes | mã đặt lại mật khẩu đã dùng (băm) | |
| 0007_email_otp_challenges | OTP đăng ký (HMAC, token dùng một lần) | |
| 0008_gmail_registry | sổ Gmail + backfill | chốt `ALLOW_GMAIL_PLUS_ALIAS` TRƯỚC khi chạy; giữ nguyên giá trị về sau |
| 0009_users_contact_email | Gmail liên hệ của Trưởng tộc + backfill | |
| 0010_clan_identity_registry | khóa dòng họ + `uq_clans_clan_code_lower` + backfill | index chữ thường bị bỏ qua (có in) nếu dữ liệu có mã chỉ khác hoa thường |

Trùng dữ liệu không làm hỏng migration: bản được ưu tiên giữ `active`, các bản khác `duplicate` kèm
`note=duplicate_of:<id>`, nhóm trùng in ra log (đã che). Kiểm tra trước khi chạy (chỉ đọc, dừng nếu
không phải host dev): `BE/scripts/check_m5_migration.py`, `BE/scripts/check_m5c_migration.py`.
Trạng thái dev_minhquan khi viết báo cáo: đã ở 0009, còn 0010.

## 3. Biến môi trường mới hoặc đổi

BE (đầy đủ trong `BE/.env.example`, test bảo đảm khớp `Settings`):

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `APP_ENV` | production | chỉ `dev` mới cho DEBUG và các công tắc dev |
| `DEBUG` | false | bật ngoài dev hoặc với DB không nằm trong `DEV_DATABASE_HOSTS` thì BE từ chối khởi động |
| `DEV_DATABASE_HOSTS` | localhost,127.0.0.1,::1 | host/tiền tố host DB mà tiến trình DEBUG được dùng |
| `FRONTEND_BASE_URL` | http://localhost:5173 | gốc liên kết đặt lại mật khẩu |
| `LOG_LEVEL` | INFO | log của app trên console |
| `BLOCKED_EMAIL_DOMAINS` | giapha.com | không bao giờ gửi thư tới các tên miền này |
| `OTP_HMAC_KEY` | (trống) | BẮT BUỘC điền (32+ ký tự ngẫu nhiên); trống thì route OTP trả 503 |
| `OTP_TTL_SECONDS` ... `OTP_VERIFIED_TOKEN_TTL_SECONDS` | 600, 60, 5, 3600, 5, 10, 1800 | giới hạn OTP |
| `OTP_DEV_SIMULATION` | false | chỉ dev |
| `ALLOW_GMAIL_PLUS_ALIAS` | false | chỉ dev; ngoài `APP_ENV=dev` thì BE từ chối khởi động |
| `RATE_LIMIT_OTP_SEND_MAX` / `_VERIFY_MAX` | 10 / 20 (mỗi 10 phút) | đổi từ 5 / 10 |
| `SMTP_USER`, `SMTP_PASSWORD` | (trống) | bắt buộc để gửi OTP và thư |
| `SECRET_KEY` | đã bỏ | không code nào dùng |

FE: `VITE_API_BASE_URL`; các biến `VITE_FIREBASE_*` thành TÙY CHỌN (FE không còn dùng Firebase; không
còn giá trị dự phòng trong code, thiếu thì báo lỗi cấu hình).

## 4. Cấu hình và an toàn triển khai (M6b, M7)

- FE: bỏ khóa Firebase và mọi giá trị dự phòng trong `FE/src/config/firebase.ts`; chỉ đọc `VITE_*`.
- BE: chặn DEBUG ngoài dev (cả lúc khởi động và lúc chạy); các đường vòng dev (khóa OTP dev, giả lập
  gửi OTP, alias `+tag`) chỉ chạy khi `DEBUG=true` và `APP_ENV=dev`.
- `requirements.txt` ghim chính xác phụ thuộc trực tiếp, `constraints.txt` ghim mọi gói (từ `pip freeze`),
  `requirements-dev.txt` cho test; bỏ `aiosqlite`, `passlib` (không dùng); thêm `httpx`, `bcrypt` (đang dùng).
  Dockerfile copy thêm `constraints.txt`.
- `/api/health` (không đụng DB) và `/api/health/ready` (`SELECT 1`, tối đa 2 giây), không lộ thông tin,
  `Cache-Control: no-store`; log khởi động không in traceback lỗi kết nối DB (có thể chứa host).

## 5. Việc cần nhóm trưởng quyết định

1. **Đổi (rotate) bí mật đã lộ trong lịch sử git** (đã push lên origin): một khóa Google/Firebase Web API
   (giới hạn theo domain hoặc tạo khóa mới) và một mật khẩu Neon (`npg_…`, khác mật khẩu dev hiện tại;
   cần xác định thuộc role/DB nào và đổi). Viết lại lịch sử git là quyết định riêng.
2. Tài khoản Firebase "mồ côi" (có trong Firebase, không có trong DB): admin xóa tay, hay cho nhận lại sau OTP.
3. Sổ Gmail: luồng chấp nhận lời mời chưa có; chưa có trạng thái đơn "hết hạn"; Trưởng tộc PENDING chưa dùng
   được quên mật khẩu; `register-send-otp` vẫn báo 409 khi email đã có tài khoản (dò được email).
4. Business (M5c): logo/vai trò/mô tả trên form chưa được gửi lên BE (chưa có nơi lưu tệp); dòng họ
   SUSPENDED/EXPIRED/LOCKED và đơn NEED_SUPPLEMENT có giữ khóa không; mã sinh tự động chữ thường, mã SA nhập
   chữ HOA; dọn 2 cặp đơn PENDING trùng trên dev.
5. Tên miền `giapha.com` không thuộc nhóm (đã chặn gửi thư); có nên đổi sang tên miền nhóm sở hữu.

## 6. NGOÀI PHẠM VI (giao người phụ trách phần trong)

- Lỗi đời 0 (thế hệ gốc) trong cây gia phả.
- Route `/networks/inlaw-marriages`.
- `ownerClanId` (xác định dòng họ sở hữu ở FE/BE liên dòng họ).
- Giao diện duyệt liên kết dòng họ.
- **File phần trong đã bị M2 sửa để chống IDOR, cần người phụ trách xem lại:**
  BE `app/controllers/inter_family/router.py`, `app/controllers/member_api_router.py`,
  `app/controllers/genealogy/router.py`, `app/services/genealogy/genealogy_service.py`,
  `app/services/auth_access/access_service.py`, `app/repositories/access_repository.py`,
  `app/models/inter_family/repository.py` (mới), test `tests/test_idor.py`, `tests/test_idor_inter_family.py`;
  FE `services/genealogy.service.ts`, `services/member.service.ts`, `services/tree.service.ts`,
  `components/system-admin/AdminFamilyLinksMgmt`, `components/dashboard/AdminDashboard`,
  `components/clan-admin/Relationships/RelationshipsPage.tsx`.
- 61 lỗi TypeScript có từ trước ở `components/member/ClanDocumentsModule`, `ClanEventsModule`,
  `ClanFundsModule`, `RelationshipFinder`, `pages/public/FamilySearch` (không do đợt này).

## 7. Số liệu kiểm thử (lần chạy cuối)

- BE: `pytest -q`: 820 passed, 3 deselected (nhóm `integration`, cần Postgres tạm; hướng dẫn trong
  `tests/test_m5_migrations_db.py`). Cài MỚI từ `requirements-dev.txt` (+ `constraints.txt`) vào venv
  sạch rồi chạy lại: 820 passed. Test DB của 0008/0009 đã pass trên Postgres tạm; test DB của 0010
  đã viết, chưa chạy.
- FE: `npm run build` thành công (292 module); `tsc --noEmit` toàn dự án 61 lỗi, tất cả ở các file
  phần trong có từ trước (mục 6), 0 lỗi trong các file đã sửa.

Checklist triển khai production: `docs/CHECKLIST_TRIEN_KHAI_PRODUCTION.md`.
