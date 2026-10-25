import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';
import apiClient from '../api/axios';
import { readApiError, withRequestId } from '../api/apiError';
import { clearSession, hasSession, setSession } from '../api/session';
import type { AccountProfile, AccountRoleInfo } from '../context/AuthContext';
import type { MeResponse, SessionCreateResponse, SessionUser } from '../types/auth';

/*
 * Mốc M1: chỉ có MỘT cửa đăng nhập là POST /auth/login (mật khẩu kiểm tra trong DB).
 * Firebase KHÔNG dùng để đăng nhập; ở FE chỉ còn sendPasswordResetEmail (quên mật khẩu, Mốc M4).
 * Không còn Google, Facebook, SMS OTP.
 */

export interface RegisterPayload {
  username?: string;
  email: string;
  password: string;
  confirmPassword?: string;
  displayName?: string;
  otp?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * Cùng chính sách với BE (core/security/password_hash.py): ít nhất 8 ký tự, có chữ hoa,
 * chữ thường và số, tối đa 72 byte. Trả về thông báo lỗi, hoặc null nếu hợp lệ.
 * Chỉ để báo sớm cho người dùng; BE vẫn là nơi kiểm tra chính.
 */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự.';
  if (!/[A-Z]/.test(password)) return 'Mật khẩu phải có ít nhất một chữ hoa.';
  if (!/[a-z]/.test(password)) return 'Mật khẩu phải có ít nhất một chữ thường.';
  if (!/[0-9]/.test(password)) return 'Mật khẩu phải có ít nhất một chữ số.';
  if (new TextEncoder().encode(password).length > 72) return 'Mật khẩu quá dài (tối đa 72 byte).';
  return null;
}

// ----- Phiên của BE: POST /auth/login, GET /auth/me, POST /auth/logout -----

/** Thông báo lỗi khi đăng nhập (rẽ nhánh theo error.code; message của BE đã là tiếng Việt). */
function loginErrorMessage(err: unknown): string {
  const info = readApiError(err);
  if (info.isNetworkError) {
    return 'Không thể kết nối đến máy chủ Backend. Vui lòng kiểm tra server và cấu hình VITE_API_BASE_URL.';
  }
  switch (info.code) {
    case 'AUTHENTICATION_FAILED':
      return 'Email/tên đăng nhập hoặc mật khẩu không đúng.';
    case 'ACCOUNT_LOCKED':
    case 'FORBIDDEN':
      return info.message || 'Tài khoản tạm thời không đăng nhập được.';
    case 'ACCOUNT_BLOCKED':
      return 'Tài khoản này hiện không thể sử dụng. Vui lòng liên hệ quản trị viên.';
    case 'TEMPORARY_PASSWORD_EXPIRED':
      return 'Mật khẩu tạm thời đã hết hạn. Vui lòng liên hệ quản trị viên để được cấp lại.';
    case 'RATE_LIMITED':
      return 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.';
    case 'DATABASE_UNAVAILABLE':
      return withRequestId('Hệ thống tạm thời không khả dụng. Vui lòng thử lại sau.', info);
    default:
      return withRequestId('Đăng nhập thất bại. Vui lòng thử lại.', info);
  }
}

/** Lưu phiên BE trả về (access_token chỉ giữ trong bộ nhớ, kèm expires_at). */
function storeSession(res: SessionCreateResponse): void {
  setSession({ accessToken: res.access_token, expiresAt: res.expires_at });
}

/** true khi BE báo phiên hạn chế (phải đổi mật khẩu trước). */
export function isPasswordChangeRequired(err: unknown): boolean {
  const info = readApiError(err);
  return info.status === 403 && info.code === 'PASSWORD_CHANGE_REQUIRED';
}

/**
 * Hồ sơ tối thiểu của phiên hạn chế khi GET /auth/me không đọc được: chỉ đủ để router đưa
 * người dùng tới /change-password (L-17). Không có vai trò, nên không vào được dashboard.
 */
export function restrictedProfile(user?: SessionUser | null): AccountProfile {
  return {
    id: user?.user_id ?? '',
    email: user?.email ?? null,
    display_name: user?.display_name ?? null,
    phone_verified: false,
    status: (user?.status ?? 'PENDING').toLowerCase(),
    roles: [],
    primary_role: 'member',
    requires_password_change: true,
  };
}

/**
 * POST /auth/login rồi GET /auth/me. Dùng được cho cả phiên hạn chế
 * (requires_password_change = true: chỉ /auth/me, /auth/change-password, /auth/logout).
 * Không bao giờ để lại phiên dở dang: lỗi ở bước nào thì phiên trong bộ nhớ cũng bị xóa.
 */
export async function loginWithPassword(payload: LoginPayload): Promise<AccountProfile> {
  clearSession();
  let login: SessionCreateResponse;
  try {
    const res = await apiClient.post<SessionCreateResponse>('/auth/login', {
      email: payload.email.trim(),
      password: payload.password,
    });
    login = res.data;
  } catch (err) {
    throw new Error(loginErrorMessage(err));
  }
  storeSession(login);
  try {
    return await fetchCurrentAccount();
  } catch (err) {
    // Phiên hạn chế mà BE vẫn chặn /auth/me (BE cũ chỉ cho dạng /api/v1/...): vẫn đi tới màn
    // đổi mật khẩu, POST /auth/change-password vẫn dùng được với phiên này.
    if (isPasswordChangeRequired(err)) {
      return restrictedProfile(login.user);
    }
    clearSession();
    throw new Error(loginErrorMessage(err));
  }
}

const ROLE_CODE_TO_UI_ROLE: Record<string, string> = {
  BUSINESS_OWNER: 'family_head',
  FAMILY_ADMIN: 'family_admin',
  FAMILY_MEMBER: 'member',
};

/** Chuyển GET /auth/me sang AccountProfile mà giao diện đang dùng (email, tên đều lấy từ BE). */
export function toAccountProfile(me: MeResponse): AccountProfile {
  const roles: AccountRoleInfo[] = me.memberships.flatMap((membership) =>
    membership.roles.map((roleCode) => ({
      id: `${membership.clan_id}:${roleCode}`,
      role: ROLE_CODE_TO_UI_ROLE[roleCode] || roleCode.toLowerCase(),
      family_id: membership.clan_id,
      // Quyền chỉ có hiệu lực khi membership và dòng họ đều ACTIVE (handoff mục 8).
      status:
        membership.membership_status === 'ACTIVE' && membership.clan_status === 'ACTIVE'
          ? 'active'
          : membership.membership_status.toLowerCase(),
    }))
  );

  // [L-18]: Phân tích mảng memberships trả về từ API /auth/me.
  // Nếu chứa quyền BUSINESS_OWNER và dòng họ đang ACTIVE, gán primary_role = 'family_head'
  // (không để fallback thành 'member'), đồng thời lưu clan_name vào profile để User Dashboard hiển thị đúng.
  const activeBusinessOwnerMembership = me.memberships?.find(
    (m) =>
      m.membership_status === 'ACTIVE' &&
      m.clan_status === 'ACTIVE' &&
      m.roles.includes('BUSINESS_OWNER')
  );

  const activeFamilyAdminMembership = me.memberships?.find(
    (m) =>
      m.membership_status === 'ACTIVE' &&
      m.clan_status === 'ACTIVE' &&
      m.roles.includes('FAMILY_ADMIN')
  );

  let primaryRole = 'member';
  if (me.permissions && me.permissions.length > 0) {
    primaryRole = 'admin';
  } else if (activeBusinessOwnerMembership) {
    primaryRole = 'family_head';
  } else if (activeFamilyAdminMembership) {
    primaryRole = 'family_admin';
  }

  const primaryClan = activeBusinessOwnerMembership || activeFamilyAdminMembership || me.memberships?.[0];

  return {
    id: me.user_id,
    username: me.username ?? null,
    email: me.email,
    phone_e164: null,
    display_name: me.display_name,
    phone_verified: false,
    status: me.status.toLowerCase(),
    roles,
    primary_role: primaryRole,
    requires_password_change: me.requires_password_change,
    memberships: me.memberships,
    permissions: me.permissions,
    clan_name: primaryClan?.clan_name ?? null,
    clan_id: primaryClan?.clan_id ?? null,
  };
}

/** GET /auth/me (dùng được cả với phiên hạn chế). */
export async function fetchCurrentAccount(): Promise<AccountProfile> {
  const res = await apiClient.get<MeResponse>('/auth/me');
  return toAccountProfile(res.data);
}

/** POST /auth/logout (nếu đang có phiên) rồi xóa phiên trong bộ nhớ. */
export async function logoutSession(): Promise<void> {
  try {
    if (hasSession()) {
      await apiClient.post('/auth/logout');
    }
  } catch (err) {
    const info = readApiError(err);
    console.warn('Đăng xuất phía Backend không thành công:', info.status, info.code);
  } finally {
    clearSession();
  }
}

/**
 * Đổi mật khẩu (phiên hạn chế hoặc bình thường): POST /auth/change-password với
 * current_password + new_password; BE kiểm tra mật khẩu hiện tại trong DB.
 * Thành công (200): MỌI phiên cũ bị thu hồi và BE trả về MỘT phiên mới, được lưu thay phiên cũ.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<AccountProfile> {
  const policyError = passwordPolicyError(newPassword);
  if (policyError) throw new Error(policyError);

  let res;
  try {
    res = await apiClient.post<SessionCreateResponse>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  } catch (err) {
    const info = readApiError(err);
    if (info.isNetworkError) {
      throw new Error('Không thể kết nối đến máy chủ Backend. Vui lòng thử lại.');
    }
    switch (info.code) {
      case 'AUTHENTICATION_FAILED':
        throw new Error('Mật khẩu hiện tại không đúng.');
      case 'ACCOUNT_LOCKED':
        // BE đã thu hồi mọi phiên: phải đăng nhập lại khi hết thời gian khóa.
        clearSession();
        throw new Error(info.message || 'Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần.');
      case 'TEMPORARY_PASSWORD_EXPIRED':
        throw new Error('Mật khẩu tạm thời đã hết hạn. Vui lòng liên hệ quản trị viên để được cấp lại.');
      case 'VALIDATION_ERROR':
        throw new Error(
          'Mật khẩu mới không đạt yêu cầu (ít nhất 8 ký tự, có chữ hoa, chữ thường, số và khác mật khẩu hiện tại).'
        );
      case 'SESSION_INVALID':
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      case 'DATABASE_UNAVAILABLE':
        throw new Error(withRequestId('Máy chủ tạm thời lỗi khi lưu mật khẩu mới. Vui lòng thử lại.', info));
      default:
        throw new Error(withRequestId('Đổi mật khẩu thất bại. Vui lòng thử lại.', info));
    }
  }

  storeSession(res.data);
  return fetchCurrentAccount();
}

export interface RegisterOtpResponse {
  message: string;
}

export async function sendRegisterOtp(email: string): Promise<RegisterOtpResponse> {
  const res = await apiClient.post<RegisterOtpResponse>('/auth/register-send-otp', { email });
  return res.data;
}

export async function verifyRegisterOtp(email: string, otp: string): Promise<RegisterOtpResponse> {
  const res = await apiClient.post<RegisterOtpResponse>('/auth/register-verify-otp', { email, otp });
  return res.data;
}

/**
 * Đăng ký tài khoản cá nhân bằng Gmail thật đã xác thực OTP: BE tạo tài khoản
 * (Firebase rồi DB) và trả về phiên đăng nhập. FE không tự tạo tài khoản Firebase nữa.
 */
export async function registerWithEmailPassword(payload: RegisterPayload): Promise<AccountProfile> {
  const email = (payload.email || '').trim();
  if (!email.toLowerCase().endsWith('@gmail.com')) {
    throw new Error('Email đăng ký bắt buộc phải là địa chỉ Gmail có đuôi @gmail.com.');
  }
  if (!payload.otp) {
    throw new Error('Vui lòng xác thực mã OTP trước khi tạo tài khoản.');
  }

  try {
    const res = await apiClient.post<SessionCreateResponse>('/auth/register-public', {
      email,
      password: payload.password,
      display_name: payload.displayName || payload.username || email.split('@')[0],
      username: payload.username || email.split('@')[0],
      otp: payload.otp,
    });
    storeSession(res.data);
    return await fetchCurrentAccount();
  } catch (err: unknown) {
    const info = readApiError(err);
    if (info.isNetworkError) {
      throw new Error('Không thể kết nối đến máy chủ Backend.');
    }
    if (info.code === 'EMAIL_ALREADY_EXISTS') {
      throw new Error('Địa chỉ Gmail này đã được sử dụng để đăng ký tài khoản.');
    }
    if (info.code === 'INVALID_OTP' || info.code === 'EMAIL_NOT_VERIFIED') {
      throw new Error(info.message || 'Mã xác thực OTP không đúng hoặc đã hết hạn.');
    }
    if (info.code === 'PROVIDER_UNAVAILABLE') {
      throw new Error(withRequestId('Dịch vụ tạo tài khoản tạm thời không khả dụng. Vui lòng thử lại sau.', info));
    }
    throw new Error(info.message || 'Đăng ký tài khoản thất bại. Vui lòng thử lại.');
  }
}

/**
 * Gửi email đặt lại mật khẩu qua Firebase Auth (giữ lại cho Mốc M4).
 */
export async function sendPasswordResetLink(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err: any) {
    console.error('Password Reset Error:', err?.code);
    if (err.code === 'auth/user-not-found') {
      // Don't leak user existence for security
      return;
    }
    throw new Error(err.message || 'Không thể gửi email đặt lại mật khẩu.');
  }
}

/**
 * Yêu cầu mã OTP đặt lại mật khẩu qua BE: BE mới CHƯA có endpoint (KI-05).
 * Không gọi API cũ. Firebase sendPasswordResetLink vẫn dùng được.
 */
export async function requestPasswordResetOTP(emailOrPhone: string): Promise<{ message: string }> {
  void emailOrPhone;
  throw new Error(
    'Hệ thống chưa hỗ trợ đặt lại mật khẩu bằng mã OTP. Vui lòng liên hệ quản trị viên để được hỗ trợ.'
  );
}

/**
 * Đặt lại mật khẩu bằng mã OTP qua BE: BE mới CHƯA có endpoint (KI-05). Không gọi API cũ.
 */
export async function resetPasswordWithOTP(
  emailOrPhone: string,
  otpCode: string,
  newPassword: string,
  confirmPassword?: string
): Promise<{ message: string }> {
  void emailOrPhone;
  void otpCode;
  void newPassword;
  void confirmPassword;
  throw new Error(
    'Hệ thống chưa hỗ trợ đặt lại mật khẩu bằng mã OTP. Vui lòng liên hệ quản trị viên để được hỗ trợ.'
  );
}
