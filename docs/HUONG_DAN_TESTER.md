# Hướng dẫn cho tester (nhánh `fix/security-auth`)

Mục tiêu: clone nhánh, chạy 1 script cài đặt, chạy BE + FE là dùng được. Mọi lệnh dưới đây chạy trong
**PowerShell**, từ **thư mục gốc repo** (thư mục chứa `BE`, `FE`, `scripts`).

## 1. Yêu cầu máy
- Windows 10/11, PowerShell 5.1 trở lên (có sẵn trên Windows).
- Python **3.13** (3.11+ vẫn chạy được): https://www.python.org/downloads/ (tick *Add python.exe to PATH*).
- Node.js **20 LTS** (18+): https://nodejs.org/
- Git: https://git-scm.com/
- Internet (cài thư viện, kết nối DB Neon, Gmail SMTP). KHÔNG cần Docker.

## 2. Lấy mã nguồn
```powershell
git clone -b fix/security-auth <địa chỉ repo> giapha
cd giapha
```

## 3. Nhận "gói bí mật" từ Minh (qua kênh riêng, KHÔNG qua git/nhóm chat công khai)
Gói gồm 2 tệp (mẫu: `docs/GOI_BI_MAT_CHO_TESTER.md`). Đặt vào thư mục `secrets\` ở gốc repo:
```
giapha\
  secrets\
    be.env                               <- DATABASE_URL, FIREBASE_*, SMTP_*
    firebase-service-account.json        <- tệp service account (đúng 1 tệp .json)
```
`secrets\` đã được `.gitignore` bỏ qua; script cài đặt dừng lại nếu thấy tệp nào trong đó bị git theo dõi.

## 4. Cài đặt (1 lệnh)
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_tester.ps1
```
Script làm: kiểm tra Python/Node, tạo `BE\.venv`, cài thư viện BE (phiên bản ghim) và FE, tạo `BE\.env`
và `FE\.env` (chỉ khi chưa có), tự điền gói bí mật, `APP_ENV=dev`, `ALLOW_GMAIL_PLUS_ALIAS=true`,
`OTP_HMAC_KEY` ngẫu nhiên, `DEV_DATABASE_HOSTS` theo host của DATABASE_URL, rồi chạy kiểm tra cấu hình
(`BE\scripts\check_env.py`, chỉ đọc, không in bí mật).

- Đã chạy setup TRƯỚC khi có gói bí mật? Đặt gói vào `secrets\` rồi chạy:
  `powershell -ExecutionPolicy Bypass -File scripts\setup_tester.ps1 -FillMissing`
  (chỉ điền các ô còn trống / còn giá trị mẫu, có sao lưu `BE\.env.bak-*`; không đổi giá trị bạn đã sửa).
- Chỉ kiểm tra lại cấu hình: `cd BE; .venv\Scripts\python.exe scripts\check_env.py`
- Kết quả phải là `0 lỗi`. Mỗi `[LỖI]` có dòng `->` hướng dẫn cách sửa. Nếu báo `alembic_version` lệch
  head: **báo Minh**, không tự chạy alembic.

## 5. Chạy ứng dụng
```powershell
powershell -ExecutionPolicy Bypass -File scripts\run_all.ps1     # mở 2 cửa sổ BE + FE
```
hoặc chạy riêng trong 2 cửa sổ: `scripts\run_be.ps1` và `scripts\run_fe.ps1` (cùng lệnh `powershell -ExecutionPolicy Bypass -File ...`).

| Thành phần | Địa chỉ |
|---|---|
| Ứng dụng (FE) | http://localhost:5173 |
| Backend API | http://127.0.0.1:8001/api/v1 |
| Kiểm tra BE sống | http://127.0.0.1:8001/api/health/ready (phải trả `{"status":"ready"}`) |

Dừng: đóng cửa sổ hoặc Ctrl+C.

## 6. DB DÙNG CHUNG: quy tắc bắt buộc
Tất cả tester và Minh dùng **chung** DB dev `dev_minhquan` (Neon, host `ep-patient-term-b4dlkr06`).
- KHÔNG chạy lệnh xóa dữ liệu, `DROP`, `TRUNCATE`, KHÔNG chạy script `reset_dev_database.py`,
  KHÔNG chạy `alembic upgrade/downgrade`.
- KHÔNG đổi mật khẩu các tài khoản có sẵn (mục 7). Muốn thử đổi mật khẩu / khóa 5 lần sai: dùng tài khoản
  do CHÍNH BẠN đăng ký.
- Mỗi tester dùng alias Gmail riêng, ví dụ `tengmail+tentester1a@gmail.com`, `tengmail+tentester1b@gmail.com`
  (`+tag` khác nhau = tài khoản khác nhau vì `ALLOW_GMAIL_PLUS_ALIAS=true`; thư vẫn về hộp thư `tengmail`).
- Tên dòng họ thử: thêm tên bạn để khỏi trùng người khác, ví dụ `Họ Nguyễn Test Tester1` (dòng họ trùng
  tên + quê gốc sẽ bị chặn 409).
- Giới hạn gửi OTP (theo email mỗi giờ, theo IP mỗi 10 phút) cũng là dữ liệu dùng chung.
- Super Admin dùng chung: chỉ duyệt / từ chối hồ sơ do CHÍNH BẠN nộp.
- `check_env.py` CẢNH BÁO nếu DATABASE_URL không phải dev_minhquan và DỪNG nếu là production
  (`ep-green-mode-b4ugmgu4`). Không bao giờ dùng DB production để test.

## 7. Tài khoản có sẵn trên dev_minhquan
Tên đăng nhập đầy đủ và **mật khẩu do Minh gửi riêng** (không ghi ở đây). Đăng nhập bằng email (hoặc
username nếu có). Danh sách theo vai trò (đã che):

| Vai trò | Tài khoản (đã che) | Ghi chú |
|---|---|---|
| System Admin (Super Admin) | `q***+sa@gmail.com` | duyệt hồ sơ Business |
| Trưởng tộc (Business Owner) | 6 tài khoản `q***+…@gmail.com` (1 đang PENDING: phải đổi mật khẩu tạm) | cấp từ các hồ sơ đã duyệt |
| Thành viên | 2 tài khoản `q***+reg…@gmail.com` | tự đăng ký |

Trưởng tộc cấp MỚI từ nay có ID dạng `<mã dòng họ>@giapha.com` (không phải hộp thư thật; thư gửi tới Gmail
liên hệ của người đại diện). Tệp `BE/database/seed_neon_real_data.sql` mô tả bộ tài khoản của DB khác
(nhóm trưởng), không phải dev_minhquan.

Chỉ Minh: đặt lại mật khẩu một tài khoản có sẵn bằng
`cd BE; .venv\Scripts\python.exe scripts\set_password.py <email> [--must-change]` (mật khẩu nhập ẩn, không
in ra), rồi gửi mật khẩu cho tester qua kênh riêng.

## 8. Các luồng cần test
1. **OTP**: gửi mã, nhập sai (thấy "còn N lần thử"), sai 5 lần (mã bị hủy), mã hết hạn (10 phút), gửi lại
   quá sớm (đếm ngược), nhập mã của thư cũ sau khi đã có mã mới.
2. **Đăng ký thành viên** (`/register`): OTP -> tạo tài khoản -> đăng nhập.
3. **Gmail trùng**: đăng ký lại cùng Gmail (hoặc Gmail đang là người đại diện Business) -> 409, có nút Đăng nhập / Quên mật khẩu.
4. **Đăng ký Business** (wizard): kiểm tra từng trường (số di động VN, tên dòng họ, quê gốc), logo chỉ nhận PNG/JPG/WEBP (thử đổi đuôi một tệp SVG/HTML -> bị từ chối), OTP, nộp hồ sơ, nhận mã tra cứu.
5. **Dòng họ trùng**: nộp lại cùng tên + quê gốc (khác dấu / hoa thường / có "Dòng họ") -> 409 `DUPLICATE_CLAN`, không lộ thông tin dòng họ kia.
6. **Super Admin duyệt hồ sơ**: xem chi tiết (cảnh báo mềm "dòng họ trông giống" nếu có), phê duyệt và cấp tài khoản Trưởng tộc; hoặc từ chối (Gmail và tên dòng họ được trả lại).
7. **Cấp tài khoản Trưởng tộc**: thư mật khẩu tạm tới Gmail người đại diện (một thư), ID `<mã>@giapha.com`.
8. **Đổi mật khẩu bắt buộc lần đầu**: đăng nhập Trưởng tộc mới bằng mật khẩu tạm -> buộc đổi mật khẩu.
9. **Quên mật khẩu**: thành viên (nhập Gmail) và Trưởng tộc (nhập ID `@giapha.com` HOẶC Gmail liên hệ); thư tới đúng Gmail; liên kết chỉ dùng được 1 lần; trang luôn báo cùng một câu.
10. **Khóa 5 lần sai**: đăng nhập sai 5 lần (CHỈ với tài khoản của bạn) -> khóa 15 phút.

## 9. Báo lỗi
Mỗi lỗi gồm: (1) các bước tái hiện, (2) kết quả mong đợi / thực tế, (3) ảnh chụp màn hình,
(4) **mã hỗ trợ** nếu thông báo có "(Mã hỗ trợ: ...)", (5) thời điểm (giờ:phút), (6) tài khoản test đã dùng
(che bớt). Nếu BE lỗi: chép vài dòng cuối cửa sổ BE (đã che email/mật khẩu).

## 10. Lưu ý an toàn
- KHÔNG commit `BE\.env`, `FE\.env`, thư mục `secrets\` (đã có trong `.gitignore`; trước khi commit luôn xem `git status`).
- Che mật khẩu, mã OTP, email đầy đủ, DATABASE_URL khi chụp ảnh hoặc gửi log.
- Không gửi gói bí mật cho người khác; xong đợt test thì xóa `secrets\`.
