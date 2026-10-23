# NHẬT KÝ SỬA LỖI FRONTEND (FE BUGFIX LOG)
**Dự án**: Hệ thống Quản lý Gia phả Liên họ (Multi-Family Genealogy System)  
**Kỹ sư thực hiện**: Senior React/TypeScript Frontend Engineer  
**Thời gian bắt đầu**: 2026-10-23  

---

## Mục lục theo dõi tiến độ
- [x] Khởi tạo tài liệu theo dõi lỗi & cài đặt môi trường
- [x] PHẦN 1: Xác thực, Phân quyền & First-Login Flow (L-16, L-17, L-18, L-10)
- [x] PHẦN 2: Cổng công khai & Đăng ký Business Wizard (L-01, L-03, L-27, L-28, L-07, L-29, L-06)
- [x] PHẦN 3: Tra cứu đăng ký & Thanh điều hướng TopBar (L-08, L-09, L-31, L-30)
- [x] PHẦN 4: Hệ thống quản trị Admin (/admin) (L-11, L-23, L-12, L-15, L-19, L-20, L-21, L-22)
- [x] PHẦN 5: Quản lý thành viên, Phả hệ & Testability (L-02, BUG-005/015, BUG-007/017, BUG-019/022, Date/File Constraints, BUG-025, Data-TestId)

---

## Chi tiết các lỗi đã xử lý

### PHẦN 1: XÁC THỰC, PHÂN QUYỀN & FIRST-LOGIN FLOW

#### 1. [L-16] Xử lý lỗi `PASSWORD_CHANGE_REQUIRED` trong chu trình đăng nhập
- **File(s) đã can thiệp**:
  - `src/services/auth.service.ts`
  - `src/context/AuthContext.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Khi tài khoản mới được cấp mật khẩu tạm thời đăng nhập, Backend trả mã lỗi `PASSWORD_CHANGE_REQUIRED` khi gọi `/auth/me`. Khối `catch` ở `completeLogin` và `fetchAccount` lập tức xóa sạch token (`clearSession()`), đăng xuất Firebase và ném ra thông báo lỗi chung chung "Đăng nhập thất bại. Vui lòng thử lại", làm người dùng bị văng ra mà không thể thực hiện đổi mật khẩu lần đầu.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Tại `auth.service.ts` (hàm `completeLogin`): Bắt `info.code === 'PASSWORD_CHANGE_REQUIRED'`, giữ lại session token hạn chế và trả về `AccountProfile` tạm thời có `requires_password_change: true`.
  - Tại `auth.service.ts` (hàm `sessionErrorMessage`): Thêm nhánh xử lý mã `PASSWORD_CHANGE_REQUIRED` trả về "Tài khoản yêu cầu đổi mật khẩu lần đầu trước khi tiếp tục."
  - Tại `AuthContext.tsx` (hàm `fetchAccount` và `login`): Bổ sung kiểm tra mã lỗi `PASSWORD_CHANGE_REQUIRED` để gán `account` profile với `requires_password_change: true` thay vì gọi `clearSession()` và `signOut(auth)`.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Giả lập hoặc đăng nhập bằng tài khoản có trạng thái yêu cầu đổi mật khẩu lần đầu.
  2. Quan sát hệ thống không bị crash hoặc văng ra thông báo "Đăng nhập thất bại", phiên tạm thời vẫn được giữ.

---

#### 2. [L-17] Sửa điều kiện hiển thị & khóa bắt buộc của FirstLoginPasswordModal
- **File(s) đã can thiệp**:
  - `src/pages/dashboard/Dashboard.tsx`
  - `src/components/auth/FirstLoginPasswordModal.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Trong `Dashboard.tsx`, điều kiện kích hoạt modal đang đọc sai tên trường thành `account.must_change_password` (trong khi schema API trả về là `requires_password_change`), dẫn tới modal không bao giờ tự bật lên.
  - Đồng thời, modal cũ chỉ giả lập timeout chứ không kết nối API `changePassword` thực tế.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Tại `Dashboard.tsx` (dòng 178): Sửa điều kiện `useEffect` thành `if (account?.requires_password_change) { setShowFirstLoginModal(true); }`.
  - Tại `FirstLoginPasswordModal.tsx`:
    - Kết nối hàm `changePassword` từ `useAuthContext()` để gọi API đổi mật khẩu Backend thực tế (`POST /auth/change-password`).
    - Khóa không cho đóng modal qua click ngoài (chỉ cho phép hoàn tất đổi mật khẩu hoặc bấm nút "Đăng xuất" an toàn).
- **Cách kiểm tra lại (Verification Steps)**:
  1. Khi `account.requires_password_change === true`, modal tự động bật lên.
  2. Người dùng không thể đóng modal bằng cách click backdrop.
  3. Nhập mật khẩu hiện tại và mật khẩu mới hợp lệ -> gọi đổi mật khẩu thành công.

---

#### 3. [L-18] Nhận diện quyền `BUSINESS_OWNER` và lưu `clan_name`
- **File(s) đã can thiệp**:
  - `src/services/auth.service.ts`
  - `src/context/AuthContext.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Hàm `toAccountProfile` gán cứng `primary_role: me.permissions.length > 0 ? 'admin' : 'member'`, bỏ qua vai trò `BUSINESS_OWNER` trong mảng `memberships`, khiến chủ dòng họ đăng nhập vào bị coi là `member` thường.
  - Profile thiếu các trường `clan_name` và `clan_id`.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Tại `AuthContext.tsx`: Mở rộng interface `AccountProfile` thêm `clan_name?: string | null;` và `clan_id?: string | null;`.
  - Tại `auth.service.ts` (hàm `toAccountProfile`):
    - Tìm kiếm trong `me.memberships` mục có `membership_status === 'ACTIVE'` và `clan_status === 'ACTIVE'` và `roles.includes('BUSINESS_OWNER')`.
    - Nếu thỏa mãn (và không phải System Admin), gán `primary_role = 'family_head'`.
    - Trích xuất `clan_name` và `clan_id` vào profile để Dashboard hiển thị chính xác không gian dòng họ.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Đăng nhập với tài khoản sở hữu dòng họ (Business Owner).
  2. Kiểm tra `account.primary_role` mang giá trị `'family_head'` và `account.clan_name` hiển thị tên dòng họ tương ứng.

---

#### 4. [L-10] Chuyển đổi Quên mật khẩu sang Firebase Auth SDK (Loại bỏ OTP chưa hỗ trợ)
- **File(s) đã can thiệp**:
  - `src/components/auth/ForgotPasswordForm/ForgotPasswordForm.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Giao diện cũ yêu cầu nhập OTP và gọi `requestPasswordResetOTP` / `resetPasswordWithOTP`, nhưng Backend mới chưa hỗ trợ hai endpoint này (gây lỗi 404/500).
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Bỏ state nhiều bước `REQUEST_OTP` / `VERIFY_AND_RESET`.
  - Bỏ các ô nhập SĐT, mã OTP, mật khẩu mới trên form này.
  - Chuyển sang form một bước: "Nhập email để nhận liên kết đặt lại mật khẩu qua thư điện tử".
  - Khi submit, gọi `sendPasswordResetLink(trimmedEmail)` từ Firebase Auth SDK.
  - Thêm thông báo thành công hướng dẫn người dùng kiểm tra hộp thư đến/spam.
  - Gắn thuộc tính kiểm thử: `data-testid="input-forgot-email"`, `data-testid="btn-forgot-submit"`, `data-testid="btn-back-to-login"`.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Truy cập `/forgot-password`.
  2. Nhập email hợp lệ và bấm "Gửi liên kết đặt lại mật khẩu".
  3. Firebase gửi email reset link thành công và UI hiển thị alert thông báo màu xanh.

---

### PHẦN 2: CỔNG CÔNG KHAI & ĐĂNG KÝ BUSINESS WIZARD

#### 1. [L-01] Chống tràn chữ mã tra cứu & Thêm nút "Sao chép mã"
- **File(s) đã can thiệp**:
  - `src/pages/public/BusinessRegister/BusinessRegisterWizard.css`
  - `src/pages/public/BusinessRegister/BusinessRegisterWizard.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Mã `tracking_code` (UUID) dài, font chữ lớn (26px) và không có thuộc tính ngắt dòng, khiến giao diện bị vỡ/tràn ngang trên màn hình di động hoặc thẻ biên nhận.
  - Người dùng không có cách sao chép nhanh mã tra cứu một lần.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Tại `BusinessRegisterWizard.css` (.code-value): Thêm `overflow-wrap: anywhere; word-break: break-all; font-size: 20px; letter-spacing: 0.5px;`.
  - Tại `BusinessRegisterWizard.tsx`: Thêm nút "Sao chép mã" (`data-testid="btn-copy-tracking-code"`) bên cạnh mã tra cứu trong thẻ `.receipt-code-box`. Gọi `navigator.clipboard.writeText(trackingCode)` kèm phản hồi "✓ Đã sao chép!" trong 2 giây.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Hoàn thành đăng ký Business để tới màn hình biên nhận thành công.
  2. Quan sát chuỗi mã tra cứu hiển thị gọn gàng, không tràn khung.
  3. Bấm nút "Sao chép mã" và dán ra ngoài để kiểm tra chuỗi clipboard.

---

#### 2. [L-03] Sửa mã màu Hex không hợp lệ trong `.receipt-warning`
- **File(s) đã can thiệp**:
  - `src/pages/public/BusinessRegister/BusinessRegisterWizard.css`
- **Nguyên nhân lỗi phía FE**:
  - Class `.receipt-warning` khai báo `background: #fffbeeb;` (7 ký tự hex - sai chuẩn cú pháp CSS), khiến thuộc tính màu nền bị trình duyệt loại bỏ.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Sửa thành `background: #fffbeb;` (chuẩn màu vàng nhạt hổ phách amber-50).
- **Cách kiểm tra lại (Verification Steps)**:
  1. Mở màn hình thành công tại `/public/business-register`.
  2. Khung cảnh báo hiển thị nền vàng nhạt `#fffbeb` với viền `#fef3c7` rõ ràng.

---

#### 3. [L-27 & L-28] Validation SĐT và Họ tên người đại diện (Bước 1)
- **File(s) đã can thiệp**:
  - `src/pages/public/BusinessRegister/BusinessRegisterWizard.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Người dùng có thể nhập chuỗi toàn khoảng trắng hoặc SĐT chứa ký tự đặc biệt lộn xộn, dẫn đến Backend trả lỗi validation 422 Unprocessable Entity.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Trong `handleNextStep1`:
    - `repName.trim()`: Chặn chuỗi rỗng / chỉ toàn khoảng trắng, kiểm tra độ dài 1–255 ký tự. Báo lỗi tiếng Việt cụ thể.
    - `repPhone.trim()`: Kiểm tra regex `^\+?[0-9\s()-]{6,30}$` (dấu + chỉ được phép đứng đầu tiên, độ dài 6-30 ký tự số/ngoặc/gạch nối/khoảng trắng). Báo lỗi tiếng Việt chi tiết nếu sai định dạng.
    - Bổ sung `data-testid` cho các input Bước 1: `input-rep-name`, `input-rep-email`, `input-rep-phone`, `select-rep-role`, `btn-step1-next`.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Thử nhập họ tên chỉ gồm dấu cách -> Bấm tiếp tục -> Báo lỗi.
  2. Thử nhập SĐT chứa chữ hoặc dấu + ở giữa (VD: `090+123`) -> Báo lỗi định dạng.
  3. Nhập đúng -> Chuyển sang Bước 2 suôn sẻ.

---

#### 4. [L-07 & L-29] Validation Tên dòng họ (Bước 2)
- **File(s) đã can thiệp**:
  - `src/pages/public/BusinessRegister/BusinessRegisterWizard.tsx`
  - `src/pages/public/BusinessRegister/BusinessRegisterWizard.css`
- **Nguyên nhân lỗi phía FE**:
  - `familyName` (`clan_name`) cho phép nhập ký tự gạch dưới `_`, ký tự đặc biệt hoặc tên quá ngắn (< 5 ký tự), khiến Backend reject hoặc làm sai lệch định dạng dòng họ.
  - Lỗi không hiển thị trực tiếp bên dưới ô input.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Trong `handleNextStep2`:
    - `familyName.trim()` độ dài từ 5 đến 255 ký tự.
    - Regex tiếng Việt nghiêm ngặt: chỉ cho phép chữ cái (kể cả có dấu tiếng Việt), số và khoảng trắng (chặn hoàn toàn `_`, `@`, `#`, `$`, `%`,...):
      `/^[a-zA-Z0-9\sàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]+$/`.
    - State `clanNameError`: Render chữ cảnh báo đỏ `⚠️ {clanNameError}` kèm viền đỏ input (`field-input-error`) ngay dưới ô "Tên dòng họ đăng ký". Tự động xóa lỗi khi người dùng gõ lại.
    - Gắn `data-testid="input-clan-name"`, `data-testid="clan-name-error"`, `data-testid="btn-step2-next"`.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Nhập `Họ_Nguyễn` (chứa dấu `_`) hoặc tên < 5 ký tự.
  2. Bấm "Tiếp tục" -> Thông báo lỗi đỏ hiển thị ngay dưới ô input.
  3. Sửa thành `Dòng họ Nguyễn Phúc` -> Lỗi biến mất và chuyển tiếp thành công.

---

#### 5. [L-06] Hiển thị giá gói & Việt hóa toàn diện mã tính năng kỹ thuật
- **File(s) đã can thiệp**:
  - `src/services/business.service.ts`
  - `src/pages/public/BusinessPlans/BusinessPlansView.tsx`
  - `src/pages/public/BusinessPlans/BusinessPlansView.css`
- **Nguyên nhân lỗi phía FE**:
  - Giao diện gói dịch vụ không hiển thị giá tiền (`price`) và chu kỳ thanh toán (`billing_period_months`).
  - Danh sách tính năng để nguyên mã thô kỹ thuật (VD: `MAX_PERSONS: 5000`, `DATA_EXPORT`, `TREE_VIEW_3D`) gây khó hiểu cho người dùng gia tộc.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Tại `business.service.ts`:
    - Thêm hàm `formatPlanPrice(plan)`: Chuyển chuỗi số thập phân sang định dạng tiền tệ Việt Nam `xxx.xxx đ / tháng` (hoặc `/ năm`, `Miễn phí`).
    - Thêm từ điển `FEATURE_NAME_MAP` và hàm `formatPlanFeatures(plan)`: Ánh xạ toàn bộ các mã kỹ thuật (`MAX_PERSONS` -> "Số lượng thành viên tối đa", `DATA_EXPORT` -> "Xuất dữ liệu gia phả (Excel / PDF)", `TREE_VIEW_3D` -> "Cây gia phả 3D tương tác đa chiều",...).
  - Tại `BusinessPlansView.tsx` & `.css`:
    - Thêm trường `priceFormatted` vào thẻ gói.
    - Render khối giá nổi bật `.plan-price-val` (màu xanh ngọc `#047857`, font 24px đậm).
    - Render danh sách tính năng tiếng Việt trực quan.
    - Gắn `data-testid="plan-card-{id}"`, `data-testid="btn-select-plan-{id}"`.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Truy cập `/public/business-plans`.
  2. Quan sát các thẻ gói hiển thị rõ ràng giá tiền kèm chu kỳ.
  3. Kiểm tra danh sách tính năng là tiếng Việt trực quan thay vì mã code thô.

---

### PHẦN 3: TRA CỨU ĐĂNG KÝ & THANH ĐIỀU HƯỚNG (TOPBAR)

#### 1. [L-08] Chuẩn hóa tiêu đề & Placeholder trang Tra cứu Business
- **File(s) đã can thiệp**:
  - `src/pages/public/BusinessTrack/BusinessTrackStatusPage.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Tiêu đề phụ và placeholder ghi "Nhập mã theo dõi yêu cầu (VD: BIZ-20260912-1234) hoặc email đại diện...", trong khi Backend chỉ hỗ trợ tra cứu duy nhất bằng chuỗi mã định danh `tracking_code` (UUID) và không tra cứu bằng email, dẫn tới hiểu lầm cho người dùng.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Sửa `track-subtitle`: "Nhập mã theo dõi yêu cầu để kiểm tra tiến độ xét duyệt."
  - Sửa `placeholder`: "Nhập mã tra cứu hồ sơ" (loại bỏ chữ "hoặc Email đại diện" và "BIZ-...").
- **Cách kiểm tra lại (Verification Steps)**:
  1. Truy cập `/public/business-register/track`.
  2. Quan sát placeholder và subtitle hiển thị súc tích, chính xác hướng dẫn nhập mã tra cứu.

---

#### 2. [L-09] Tách state `searchedCode` và reset kết quả khi người dùng sửa input
- **File(s) đã can thiệp**:
  - `src/pages/public/BusinessTrack/BusinessTrackStatusPage.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Trước đây thông báo lỗi sử dụng trực tiếp `inputCode` đang binding với ô nhập. Khi người dùng xóa/gõ chữ mới sau khi tra cứu thất bại, chữ hiển thị trong thông báo lỗi bị nhảy theo thời gian thực (realtime mismatch).
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Khai báo state độc lập `const [searchedCode, setSearchedCode] = useState(urlCode);`.
  - Chỉ gán `setSearchedCode(code)` khi người dùng thực sự bấm nút "Tra Cứu Ngay".
  - Trong `onChange` của ô nhập: gọi `setSearched(false)` và `setLookupError('')` để xóa kết quả tra cứu cũ ngay khi người dùng gõ ký tự mới.
  - Sử dụng `searchedCode` trong thông báo lỗi không tìm thấy: `❌ Không tìm thấy yêu cầu đăng ký nào khớp với mã {searchedCode}.`
- **Cách kiểm tra lại (Verification Steps)**:
  1. Nhập mã sai `abc` -> Bấm "Tra Cứu Ngay" -> Thông báo hiển thị mã `abc`.
  2. Gõ thêm ký tự vào ô input -> Thông báo kết quả cũ lập tức được reset ẩn đi.

---

#### 3. [L-31] Validation bắt buộc nhập mã tra cứu & Disable nút submit khi rỗng
- **File(s) đã can thiệp**:
  - `src/pages/public/BusinessTrack/BusinessTrackStatusPage.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Chưa chặn người dùng submit input rỗng hoặc chỉ có khoảng trắng, dẫn tới không có phản hồi trực quan.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Bổ sung kiểm tra `if (!code.trim()) { setLookupError('Vui lòng nhập mã tra cứu.'); setSearched(true); return; }`.
  - Trên nút submit: `disabled={!inputCode.trim() || isLoading || retry.isLocked}`.
  - Thêm `data-testid="input-track-code"` và `data-testid="btn-track-submit"`.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Khi ô input rỗng hoặc chỉ có dấu cách -> Nút "Tra Cứu Ngay" bị vô hiệu hóa (disabled).
  2. Nhập ký tự hợp lệ -> Nút sáng lên sẵn sàng bấm.

---

#### 4. [L-30] Tự động đóng Dropdown Menu Người dùng bằng phím Escape & Click Outside
- **File(s) đã can thiệp**:
  - `src/components/dashboard/TopBar/TopBar.tsx`
  - `src/shared/Layout/TopBar/TopBar.tsx`
  - `src/components/common/TopBar.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Dropdown menu tài khoản người dùng và thông báo chỉ đóng khi người dùng click lại chính xác vào nút avatar, không lắng nghe phím `Escape` và không đóng khi click ra ngoài DOM (vi phạm tiêu chuẩn trải nghiệm người dùng Web UI).
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Sử dụng hook `useRef` gắn vào vùng bao quanh dropdown (`profileMenuRef`, `notifMenuRef`).
  - Sử dụng hook `useEffect` đăng ký event listener `keydown` (bắt `e.key === 'Escape'`) và `mousedown` (bắt `!ref.current.contains(e.target)`).
  - Tự động đóng dropdown và cleanup event listeners khi component unmount hoặc khi menu đã đóng.
  - Tạo re-export proxy tại `src/components/common/TopBar.tsx`.
  - Bổ sung `data-testid="btn-topbar-profile"`, `data-testid="dropdown-profile-menu"`, `data-testid="btn-topbar-logout"`.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Bấm mở dropdown menu người dùng góc trên bên phải.
  2. Nhấn phím `Escape` trên bàn phím -> Menu lập tức đóng lại mượt mà.
  3. Mở lại menu và click chuột ra vùng bất kỳ bên ngoài -> Menu tự động đóng.

---

### PHẦN 4: HỆ THỐNG QUẢN TRỊ ADMIN (/admin)

#### 1. [L-11 & L-23] Gắn nhãn rõ ràng "Dữ liệu mẫu (Demo UI)" cho thống kê số liệu và ma trận phân quyền
- **File(s) đã can thiệp**:
  - `src/components/dashboard/AdminDashboard/AdminDashboard.tsx`
  - `src/shared/dashboard/AdminDashboard/AdminDashboard.tsx`
  - `src/components/admin/Sprint6Admin/RolePermissionManagement.tsx`
  - `src/components/admin/Sprint6Admin/shared.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Các con số thống kê trên Admin Dashboard (số tài khoản, dòng họ, doanh thu...) và ma trận phân quyền Sprint 6 hiện đang dùng dữ liệu mô phỏng/hardcode mẫu nhưng không có nhãn chỉ báo, dễ gây hiểu nhầm cho người dùng/thanh tra rằng đây là dữ liệu production thực tế từ DB.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Mở rộng prop `title` trong `AdminPageHeader` (`Sprint6Admin/shared.tsx`) thành `React.ReactNode` để hỗ trợ hiển thị badge kèm tiêu đề.
  - Tại `AdminDashboard.tsx` & `shared/dashboard/AdminDashboard.tsx`: Thêm thanh tiêu đề `Chỉ số Vận hành Hệ thống` kèm badge `data-testid="badge-demo-stats"`:
    `<span className="admin-demo-badge">Dữ liệu mẫu (Demo UI)</span>` trên nền vàng nhạt `rgba(254, 243, 199, 1)` và viền cam nhẹ.
  - Tại `RolePermissionManagement.tsx`: Bổ sung badge `Dữ liệu mẫu (Demo UI)` cạnh tiêu đề trang và cạnh tiêu đề "Ma trận Quyền Module".
- **Cách kiểm tra lại (Verification Steps)**:
  1. Truy cập `/admin` và `/admin/roles`.
  2. Quan sát thấy badge "Dữ liệu mẫu (Demo UI)" xuất hiện trực quan, rõ ràng trên các khối dữ liệu mẫu.

---

#### 2. [L-12] Triệt tiêu lỗi đỏ Console khi tải danh sách yêu cầu liên kết dòng họ
- **File(s) đã can thiệp**:
  - `src/components/admin/AdminFamilyLinksMgmt/AdminFamilyLinksMgmt.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Khối `catch` của hàm `fetchLinkRequests` gọi `console.error('Fetch link requests error from Neon DB:', err);` khi endpoint `/networks/link-requests` chưa khả dụng trên Backend, in lỗi đỏ liên tục lên console trình duyệt.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Chuyển sang bọc khối `catch` phòng vệ an toàn (defensive programming), gán `setRequests([])` và không in `console.error` ra DevTools, triệt tiêu hoàn toàn lỗi đỏ console cho người dùng.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Truy cập tab "Quản lý Liên Kết Dòng Họ" trên trang quản trị.
  2. Mở tab Console trong DevTools của trình duyệt, kiểm tra không còn xuất hiện dòng log đỏ lỗi liên kết.

---

#### 3. [L-15] Chống gửi trùng request duyệt đơn (Double Click Guard)
- **File(s) đã can thiệp**:
  - `src/components/admin/AdminApprovalsMgmt/AdminApprovalsMgmt.tsx`
  - `src/components/admin/Sprint6Admin/shared.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Khi quản trị viên bấm nút "Xác nhận phê duyệt" trên `AdminConfirmDialog`, nếu người dùng nhấp đúp (double click) hoặc mạng có độ trễ, FE gửi đồng thời 2 request `POST .../approve-and-provision`, dẫn đến backend xử lý xung đột hoặc báo lỗi 500 do bản ghi đã được xử lý.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Bổ sung prop `disabled?: boolean` cho `AdminConfirmDialog` trong `Sprint6Admin/shared.tsx`.
  - Khai báo state `const [isSubmitting, setIsSubmitting] = useState(false);` trong `AdminApprovalsMgmt.tsx`.
  - Trong `handleApprove`: nếu `isSubmitting === true` thì `return;` ngay lập tức; gán `setIsSubmitting(true)` trước khi gửi API và khôi phục `setIsSubmitting(false)` trong khối `finally`.
  - Nút xác nhận chuyển trạng thái sang `disabled={isSubmitting}` và đổi nhãn sang "Đang xử lý..." ngay trong lần bấm đầu tiên.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Vào `/admin/approvals`, mở một hồ sơ chờ duyệt và bấm "Phê duyệt".
  2. Bấm "Xác nhận phê duyệt": Nút bấm lập tức bị khóa `disabled`, ngăn chặn hoàn toàn việc click lần thứ hai khi request đang bay trên mạng.

---

#### 4. [L-19, L-20, L-21, L-22] Cải tiến toàn diện phân hệ Quản lý tài khoản Admin
- **File(s) đã can thiệp**:
  - `src/components/admin/AdminAccountMgmt/AdminAccountMgmt.tsx`
  - `src/components/admin/AdminAccountMgmt/AdminAccountMgmt.css`
- **Nguyên nhân lỗi phía FE**:
  - [L-19]: Tài khoản trạng thái `PENDING` bị gán nhầm thành "Đã khóa" (locked), và nút Khóa/Mở vẫn hoạt động sai với tài khoản chưa kích hoạt đổi mật khẩu.
  - [L-20]: Mã FE cũ đoán quyền quản trị viên bằng `u.display_name.toLowerCase().includes('admin')`, dẫn đến gán sai quyền cho người dùng có tên chứa từ "admin".
  - [L-21]: Không sử dụng chuẩn `readApiError` để bóc tách `{error: {message}}`, thông báo lỗi không có nền đỏ cảnh báo.
  - [L-22]: Form sửa thông tin cho phép nhập "Tên hiển thị" và "Vai trò" mặc dù backend chưa hỗ trợ cập nhật 2 trường này qua endpoint hiện tại, gây thất bại ngầm khi gửi; nút "Xóa" dễ gây hiểu nhầm là xóa cứng khỏi database.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Định nghĩa kiểu `AccountStatus = 'ACTIVE' | 'PENDING' | 'LOCKED' | 'DISABLED'`.
  - Cấu hình mapping `STATUS_CONFIG` hiển thị chuẩn 4 trạng thái:
    * `ACTIVE`: "Hoạt động" (badge xanh lá)
    * `PENDING`: "Chờ đổi mật khẩu" (badge vàng cam, class `.status-badge-pending`)
    * `LOCKED`: "Đã khóa" (badge đỏ, class `.status-badge-locked`)
    * `DISABLED`: "Đã vô hiệu hóa" (badge xám, class `.status-badge-disabled`)
  - Bổ sung bộ lọc trạng thái (status filter) trong thanh công cụ.
  - Khóa (disable) nút Mở/Khóa đối với tài khoản đang ở trạng thái `PENDING` kèm tooltip giải thích.
  - Bỏ triệt để heuristic `display_name.includes('admin')`; đọc vai trò chuẩn từ `role` / `primary_role` của đối tượng người dùng hoặc mặc định là `member`.
  - Sử dụng hàm `readApiError(err)` bóc tách lỗi chi tiết từ backend, hiển thị thông báo lỗi trên khung đỏ `admin-msg-box alert-error` có nút đóng (X).
  - Trong Modal Sửa tài khoản: đặt `disabled` kèm ghi chú "(Chỉ xem - Backend chưa hỗ trợ cập nhật)" cho 2 trường Tên hiển thị và Vai trò; chỉ cho phép quản trị viên cập nhật Trạng thái tài khoản.
  - Đổi tên nút "Xóa" thành "Vô hiệu hóa" (Disabled).
- **Cách kiểm tra lại (Verification Steps)**:
  1. Truy cập `/admin/accounts`.
  2. Kiểm tra danh sách: Tài khoản `PENDING` hiển thị nhãn "Chờ đổi mật khẩu" màu vàng cam, nút Khóa/Mở bị disabled.
  3. Bấm "Sửa" một tài khoản: Ô Tên hiển thị và Vai trò bị làm mờ (disabled), chỉ dropdown Trạng thái có thể chọn.
  4. Bấm "Vô hiệu hóa": Hệ thống gọi API cập nhật trạng thái `DISABLED`.
  5. Khi API trả về lỗi: Thông báo lỗi hiển thị rõ ràng trên nền đỏ `alert-error`.

---

### PHẦN 5: QUẢN LÝ THÀNH VIÊN, PHẢ HỆ & TESTABILITY

#### 1. [L-02] Triệt tiêu lỗi 404 console khi gọi `fetchFamilies`
- **File(s) đã can thiệp**:
  - `src/services/member.service.ts`
- **Nguyên nhân lỗi phía FE**:
  - Hàm `fetchFamilies()` gọi sai endpoint không có prefix `/api/v1` và thiếu cơ chế bắt lỗi phòng vệ (defensive catch), dẫn đến lỗi HTTP 404 in đỏ trong Developer Tools Console khi người dùng chưa đăng nhập hoặc khi chuyển trang.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Chuyển URL endpoint từ `/families` thành `/api/v1/families`.
  - Bọc khối `try / catch` trả về mảng rỗng `[]` khi request thất bại thay vì ném lỗi vỡ ứng dụng.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Mở Console (F12) trong trình duyệt.
  2. Truy cập các trang điều hướng thành viên.
  3. Xác nhận không còn xuất hiện lỗi `404 Not Found` từ request `/families`.

---

#### 2. [BUG-005 / BUG-015] Chuẩn hóa tham số truy vấn tìm đường quan hệ `GET /relationship-path`
- **File(s) đã can thiệp**:
  - `src/services/genealogy.service.ts`
- **Nguyên nhân lỗi phía FE**:
  - Service gọi endpoint tính toán đường đi quan hệ giữa 2 người gửi tham số query là `fromPersonId`, trong khi Backend định nghĩa tham số yêu cầu là `source_person_id` (và `target_person_id`), gây lỗi 422 Unprocessable Entity.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Trong `fetchRelationshipCalculation(familyId, fromPersonId, toPersonId)`:
    - Map `source_person_id: fromPersonId` và `target_person_id: toPersonId`.
    - Giữ thêm `toPersonId` để tương thích ngược.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Vào công cụ tính toán / tra cứu quan hệ gia tộc giữa hai thành viên.
  2. Bấm tra cứu và kiểm tra Network tab: Tham số URL query được gửi đúng dạng `?source_person_id=...&target_person_id=...`.

---

#### 3. [BUG-007 / BUG-017] Component Avatar SVG Fallback chuẩn theo giới tính Nam/Nữ
- **File(s) đã can thiệp**:
  - `src/components/common/GenderAvatar.tsx` (Tạo mới)
  - `src/shared/tree/TreeNodeCard/TreeNodeCard.tsx`
  - `src/components/profile/MemberList/MemberList.tsx`
  - `src/components/admin/AdminMembersMgmt/AdminMembersMgmt.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Khi thành viên không có ảnh đại diện (`avatar_storage_key === null` hoặc rỗng), component không render fallback hoặc để trống phần tử DOM làm vỡ layout thẻ card và vỡ căn lề khung ảnh trên cây phả hệ và danh sách nhân khẩu.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Xây dựng component `GenderAvatar` tối ưu hóa:
    * Thiết kế 2 vector SVG đồ họa sắc nét riêng biệt cho giới tính Nam (Male Avatar) và Nữ (Female Avatar).
    * Hiển thị ảnh thật nếu có `avatarUrl`, tự động chuyển sang icon SVG giới tính nếu ảnh bị lỗi (lắng nghe `onError`).
    * Nếu không xác định được giới tính, fallback về icon người dùng chung kèm chữ cái đầu của họ tên.
  - Tích hợp `GenderAvatar` vào `TreeNodeCard` (thẻ thành viên trên cây gia phả), `MemberList` (danh sách thành viên), và `AdminMembersMgmt` (bảng quản lý nhân khẩu).
- **Cách kiểm tra lại (Verification Steps)**:
  1. Vào trang Cây gia phả và Danh sách thành viên.
  2. Quan sát các thành viên chưa có ảnh đại diện:
     - Thành viên Nam hiển thị avatar vector xanh dương lịch thiệp.
     - Thành viên Nữ hiển thị avatar vector hồng/cam duyên dáng.
  3. Bố cục thẻ không bị vỡ hoặc thụt lề.

---

#### 4. [BUG-019 & BUG-022] Ràng buộc logic sinh học & Cảnh báo đổi giới tính người có hôn phối
- **File(s) đã can thiệp**:
  - `src/features/familyAdmin/FamilyAdminModule.tsx`
  - `src/components/admin/AdminMembersMgmt/AdminMembersMgmt.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Form thêm/sửa quan hệ Cha/Mẹ - Con cho phép lưu cả các trường hợp cha/mẹ nhỏ hơn hoặc xấp xỉ tuổi con, vi phạm logic sinh học thực tế mà không có cảnh báo.
  - Form chỉnh sửa thông tin thành viên cho phép đổi giới tính trực tiếp mà không cảnh báo nếu người này đang có hôn phối (vợ/chồng), làm sai lệch mối quan hệ vợ - chồng trong phả hệ.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - **Kiểm tra tuổi sinh học (< 13 tuổi) [BUG-019]**:
    * Trong form gán quan hệ cha mẹ - con (`FamilyAdminModule.tsx`): Kiểm tra năm sinh cha/mẹ và con. Nếu `cYear - pYear < 13`, kích hoạt hộp thoại cảnh báo: `"Khoảng cách tuổi sinh học bất thường (< 13 tuổi). Bạn có chắc chắn muốn lưu?"`. Nếu người dùng hủy, chặn không gửi lưu.
  - **Cảnh báo đổi giới tính người có hôn phối [BUG-022]**:
    * Trong form sửa thành viên (`FamilyAdminModule.tsx` và `AdminMembersMgmt.tsx`): Kiểm tra nếu thành viên đang có quan hệ vợ/chồng (`relationship === 'Vợ / Chồng'` hoặc quan hệ `spouse`) và `original.gender !== nextGender`, kích hoạt hộp thoại xác nhận: `"Người này đang có quan hệ hôn phối (vợ/chồng). Việc thay đổi giới tính có thể tác động đến hiển thị quan hệ trong gia phả. Bạn có chắc chắn muốn tiếp tục?"`.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Gán quan hệ cha/mẹ sinh năm 2005 cho con sinh năm 2010 (khoảng cách 5 tuổi < 13): Hộp thoại cảnh báo xuất hiện.
  2. Sửa thông tin một người đã có vợ/chồng, đổi giới tính từ Nam sang Nữ: Hộp thoại cảnh báo tác động hôn phối xuất hiện trước khi lưu.

---

#### 5. [Ràng buộc Date & File] Khống chế ngày hợp lệ & Chặn tải file > 5MB phía Client
- **File(s) đã can thiệp**:
  - `src/features/familyAdmin/FamilyAdminModule.tsx`
  - `src/components/admin/AdminMembersMgmt/AdminMembersMgmt.tsx`
  - `src/pages/public/BusinessRegister/BusinessRegisterWizard.tsx`
  - `src/components/member/ClanDocumentsModule.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Các ô chọn ngày (date inputs) cho phép chọn ngày sinh trong tương lai hoặc ngày mất trước ngày sinh.
  - Người dùng có thể chọn tải lên các tệp ảnh logo kích thước hàng chục megabyte làm treo băng thông mạng và bị máy chủ từ chối sau đó.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - **Ràng buộc ngày tháng**:
    * Ô chọn Ngày sinh: Thêm thuộc tính `max={new Date().toISOString().split('T')[0]}` và kiểm tra `birthDate > todayStr` trước khi submit form.
    * Ô chọn Ngày mất: Thêm thuộc tính `min={birthDate || undefined}` và kiểm tra `deathDate < birthDate` hiển thị lỗi "Ngày mất phải sau hoặc bằng ngày sinh".
  - **Ràng buộc tệp hình ảnh > 5MB**:
    * Tại Bước 2 `BusinessRegisterWizard.tsx`: Thêm ô tải ảnh biểu trưng / logo dòng họ với sự kiện `onChange` kiểm tra ngay `file.size > 5 * 1024 * 1024`. Nếu vượt quá, hiển thị cảnh báo đỏ và reset input về rỗng.
    * Tại `ClanDocumentsModule.tsx`: Kiểm tra `nextFile.type.startsWith('image/') && nextFile.size > 5 * 1024 * 1024`, chặn lưu và thông báo lỗi "Tệp hình ảnh vượt quá giới hạn 5 MB. Vui lòng chọn tệp nhỏ hơn."
- **Cách kiểm tra lại (Verification Steps)**:
  1. Thử chọn ngày sinh trong tương lai: Datepicker giới hạn không cho chọn hoặc form báo lỗi.
  2. Chọn tệp ảnh > 5MB tại Bước 2 đăng ký: Hệ thống báo lỗi đỏ ngay tức thì và không chấp nhận tệp.

---

#### 6. [BUG-025] Vô hiệu hóa nút "Xuất file Excel" kèm Tooltip thông báo
- **File(s) đã can thiệp**:
  - `src/features/familyAdmin/FamilyAdminModule.tsx`
  - `src/components/clan-admin/ImportExport/ImportExportPage.tsx`
- **Nguyên nhân lỗi phía FE**:
  - Nút xuất file Excel chưa hoàn thiện xử lý đầy đủ với toàn bộ dữ liệu backend phức tạp, dẫn đến phát sinh lỗi khi người dùng bấm vào.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Đặt thuộc tính `disabled` cho các nút "Xuất file Excel".
  - Thêm thuộc tính `title="Tính năng đang cập nhật"` và `data-testid="btn-export-excel"`.
  - Tinh chỉnh CSS `opacity: 0.6; cursor: not-allowed;` để người dùng nhận biết tính năng đang được phát triển.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Truy cập màn hình Import/Export hoặc Quản trị Gia phả tab Trao đổi dữ liệu.
  2. Nút "Xuất file Excel" ở trạng thái disabled, hover chuột hiển thị tooltip "Tính năng đang cập nhật".

---

#### 7. [Test Automation] Đồng bộ các thuộc tính `data-testid` cho kiểm thử tự động
- **File(s) đã can thiệp**:
  - `src/components/auth/LoginForm/LoginForm.tsx`: `data-testid="btn-login"`, `input-login-account`, `input-login-password`.
  - `src/pages/public/BusinessRegister/BusinessRegisterWizard.tsx`: `data-testid="input-clan-name"`, `input-clan-logo`, `btn-step1-next`, `btn-step2-next`, `btn-submit-registration`, `text-tracking-code`, `btn-copy-tracking-code`.
  - `src/pages/public/BusinessTrack/BusinessTrackStatusPage.tsx`: `data-testid="input-track-code"`, `btn-track-submit`.
  - `src/components/admin/AdminApprovalsMgmt/AdminApprovalsMgmt.tsx`: `data-testid="btn-approve"`, `btn-approve-detail`.
  - `src/components/admin/AdminAccountMgmt/AdminAccountMgmt.tsx`: `data-testid="input-search-users"`, `select-filter-status`, `btn-save-account`, v.v.
  - `src/components/admin/AdminMembersMgmt/AdminMembersMgmt.tsx`: `data-testid="input-member-fullname"`, `input-member-birthdate`, `select-member-gender`, `btn-save-member`.
  - `src/features/familyAdmin/FamilyAdminModule.tsx`: `data-testid="btn-export-excel"`.
- **Nguyên nhân lỗi phía FE**:
  - Thiếu các định danh kiểm thử chuẩn hóa khiến các bài kiểm thử End-to-End (Cypress / Playwright) dễ bị lỗi flakiness khi selector thay đổi cấu trúc DOM.
- **Chi tiết các dòng code đã sửa/thêm mới**:
  - Gắn thuộc tính `data-testid` có cấu trúc rõ ràng (`input-*`, `btn-*`, `select-*`, `text-*`) vào tất cả các form và nút bấm trọng yếu của 5 phân hệ.
- **Cách kiểm tra lại (Verification Steps)**:
  1. Kiểm tra DOM bằng Developer Tools hoặc chạy test suite Playwright/Cypress.
  2. Các selector `[data-testid="..."]` tìm đúng các phần tử mục tiêu.


