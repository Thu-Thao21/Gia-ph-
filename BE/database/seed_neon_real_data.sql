-- =============================================================================
-- KỊCH BẢN KHỞI TẠO HỆ THỐNG CHO NEON POSTGRESQL (MFGMS - HỆ THỐNG GIA PHẢ LIÊN HỌ)
-- CHỈ KHỞI TẠO:
-- 1. Roles hệ thống (System Roles)
-- 2. Gói dịch vụ nền tảng (Subscription Plans & Feature Limits)
-- 3. Tài khoản Quản trị viên tối cao duy nhất (System Administrator):
--    - Email: thuthaor120608@gmail.com
--    - Tên hiển thị: Thu Thảo (System Admin)
--
-- TUYỆT ĐỐI KHÔNG CHỨA DỮ LIỆU DÒNG HỌ, NHÂN KHẨU HOẶC SỰ KIỆN MẪU.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ĐẢM BẢO CÁC VAI TRÒ (ROLES) HỆ THỐNG ĐÃ TỒN TẠI
-- -----------------------------------------------------------------------------
INSERT INTO roles (role_id, code, name, is_system_role)
VALUES 
  ('11111111-0000-0000-0000-000000000001', 'SYSTEM_ADMIN', 'Quản trị hệ thống (System Admin)', true),
  ('11111111-0000-0000-0000-000000000002', 'BUSINESS_OWNER', 'Trưởng tộc / Chủ quản dòng họ (Business Owner)', true),
  ('11111111-0000-0000-0000-000000000003', 'FAMILY_ADMIN', 'Quản trị viên gia tộc (Family Admin)', true),
  ('11111111-0000-0000-0000-000000000004', 'FAMILY_MEMBER', 'Thành viên dòng họ (Member)', true)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. TẠO TÀI KHOẢN DUY NHẤT: THU THẢO (SYSTEM ADMIN)
-- -----------------------------------------------------------------------------
INSERT INTO users (
  user_id, firebase_uid, username, email, phone, display_name, status, email_verified, phone_verified, first_login_required, created_at, updated_at
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'usr_thuthaor120608',
  'thuthao',
  'thuthaor120608@gmail.com',
  '0905123000',
  'Thu Thảo (System Admin)',
  'ACTIVE',
  true,
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (email) DO UPDATE SET 
  display_name = EXCLUDED.display_name,
  status = 'ACTIVE',
  email_verified = true;

-- Gán vai trò SYSTEM_ADMIN cho tài khoản Thu Thảo
INSERT INTO user_roles (user_id, role_id)
SELECT 
  '11111111-1111-4111-8111-111111111111',
  role_id
FROM roles 
WHERE code = 'SYSTEM_ADMIN'
ON CONFLICT DO NOTHING;

-- Khởi tạo metadata thông tin xác thực
INSERT INTO credential_metadata (user_id, auth_provider, password_hash, must_change_password, failed_login_count, locked_until, updated_at)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'LOCAL',
  NULL,
  false,
  0,
  NULL,
  CURRENT_TIMESTAMP
)
ON CONFLICT (user_id) DO UPDATE SET
  auth_provider = 'LOCAL',
  failed_login_count = 0,
  locked_until = NULL;

-- Đăng ký Gmail chuẩn hóa trong gmail_registry
INSERT INTO gmail_registry (normalized_email, original_email, user_id, purpose, created_at)
VALUES (
  'thuthaor120608@gmail.com',
  'thuthaor120608@gmail.com',
  '11111111-1111-4111-8111-111111111111',
  'SYSTEM_ADMIN',
  CURRENT_TIMESTAMP
)
ON CONFLICT (normalized_email) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. GÓI DỊCH VỤ HỆ THỐNG CHUẨN (SUBSCRIPTION PLANS & FEATURE LIMITS)
-- -----------------------------------------------------------------------------
INSERT INTO subscription_plans (plan_id, code, name, description, price, billing_period_months, max_members, max_family_admins, storage_mb, status, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'STANDARD',
    'Gói Tiêu Chuẩn',
    'Phù hợp cho các dòng họ quy mô vừa, bắt đầu số hóa cây phả hệ và gắn kết con cháu.',
    1200000.00,
    12,
    500,
    5,
    20480,
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'PREMIUM',
    'Gói Nâng Cao',
    'Dành cho các đại tộc đông đúc, mạng lưới nhiều chi phái liên họ và nhu cầu lưu trữ tư liệu lớn.',
    2400000.00,
    12,
    2000,
    15,
    102400,
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  max_members = EXCLUDED.max_members,
  storage_mb = EXCLUDED.storage_mb,
  status = EXCLUDED.status;

-- Cấu hình tính năng cho gói STANDARD
INSERT INTO plan_feature_limits (plan_id, feature_code, enabled, limit_value)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'GENEALOGY_TREE', true, 500),
  ('00000000-0000-0000-0000-000000000001', 'DIGITAL_ARCHIVE', true, 20480),
  ('00000000-0000-0000-0000-000000000001', 'INTER_FAMILY_NETWORK', true, 10),
  ('00000000-0000-0000-0000-000000000001', 'SMART_AI_ASSISTANT', true, 500)
ON CONFLICT (plan_id, feature_code) DO NOTHING;

-- Cấu hình tính năng cho gói PREMIUM
INSERT INTO plan_feature_limits (plan_id, feature_code, enabled, limit_value)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'GENEALOGY_TREE', true, 2000),
  ('00000000-0000-0000-0000-000000000002', 'DIGITAL_ARCHIVE', true, 102400),
  ('00000000-0000-0000-0000-000000000002', 'INTER_FAMILY_NETWORK', true, 50),
  ('00000000-0000-0000-0000-000000000002', 'SMART_AI_ASSISTANT', true, 5000),
  ('00000000-0000-0000-0000-000000000002', 'VIRTUAL_WORSHIP_HALL', true, 10)
ON CONFLICT (plan_id, feature_code) DO NOTHING;

COMMIT;
