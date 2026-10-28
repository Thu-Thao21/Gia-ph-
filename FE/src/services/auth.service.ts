import apiClient from '../api/axios';
import { readApiError, withRequestId } from '../api/apiError';
import {
  emailTakenKind,
  emailTakenMessage,
  verificationErrorMessage,
  type EmailTakenKind,
} from '../api/otpErrors';
import { clearSession, hasSession, setSession } from '../api/session';
import type { AccountProfile, AccountRoleInfo } from '../context/AuthContext';
import type { MeResponse, SessionCreateResponse, SessionUser } from '../types/auth';

/*
 * Mốc M1: chỉ có MỘT cửa đăng nhập là POST /auth/login (mật khẩu kiểm tra trong DB).
 * Firebase KHÔNG dùng để đăng nhập, và FE không còn gọi Firebase nữa: quên mật khẩu đi qua BE
 * (POST /auth/password-reset/request và /confirm, Mốc M4b).
 * Không còn Google, Facebook, SMS OTP.
 */

export interface RegisterPayload {
  username?: string;
  email: string;
  password: string;
  confirmPassword?: string;
  displayName?: string;
  /** Token dùng một lần do POST /auth/register-verify-otp trả về (Mốc M5-1), không phải mã OTP. */
  verificationToken?: string;
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

export interface RegisterVerifyOtpResponse {
  message: string;
  /** Dùng một lần, chỉ cho đúng email này: gửi kèm khi tạo tài khoản. */
  verification_token: string;
}

export async function sendRegisterOtp(email: string): Promise<RegisterOtpResponse> {
  const res = await apiClient.post<RegisterOtpResponse>('/auth/register-send-otp', { email });
  return res.data;
}

export async function verifyRegisterOtp(email: string, otp: string): Promise<RegisterVerifyOtpResponse> {
  const res = await apiClient.post<RegisterVerifyOtpResponse>('/auth/register-verify-otp', { email, otp });
  return res.data;
}

/** Lỗi đăng ký có loại, để form hiện thêm hướng dẫn (ví dụ link Đăng nhập / Quên mật khẩu). */
export class RegisterError extends Error {
  /** EmailTakenKind: Gmail đã có tài khoản; 'verification_required': phải xác thực Gmail lại. */
  constructor(message: string, readonly kind: EmailTakenKind | 'verification_required') {
    super(message);
  }
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
  if (!payload.verificationToken) {
    throw new Error('Vui lòng xác thực mã OTP trước khi tạo tài khoản.');
  }

  try {
    const res = await apiClient.post<SessionCreateResponse>('/auth/register-public', {
      email,
      password: payload.password,
      display_name: payload.displayName || payload.username || email.split('@')[0],
      username: payload.username || email.split('@')[0],
      verification_token: payload.verificationToken,
    });
    storeSession(res.data);
    return await fetchCurrentAccount();
  } catch (err: unknown) {
    const info = readApiError(err);
    if (info.isNetworkError) {
      throw new Error('Không thể kết nối đến máy chủ Backend.');
    }
    const taken = emailTakenKind(err);
    if (taken) {
      throw new RegisterError(emailTakenMessage(taken), taken);
    }
    const verification = verificationErrorMessage(err);
    if (verification) {
      throw new RegisterError(verification, 'verification_required');
    }
    if (info.code === 'PROVIDER_UNAVAILABLE') {
      throw new Error(withRequestId('Dịch vụ tạo tài khoản tạm thời không khả dụng. Vui lòng thử lại sau.', info));
    }
    throw new Error(withRequestId(info.message || 'Đăng ký tài khoản thất bại. Vui lòng thử lại.', info));
  }
}

/** Câu duy nhất hiển thị sau khi gửi yêu cầu quên mật khẩu, dù email có tài khoản hay không. */
export const PASSWORD_RESET_REQUESTED_MESSAGE =
  'Nếu địa chỉ email này có tài khoản trong hệ thống, một liên kết đặt lại mật khẩu đã được gửi đến hộp thư. ' +
  'Vui lòng kiểm tra cả thư mục Spam/Quảng cáo. Liên kết chỉ dùng được một lần.';

/**
 * Quên mật khẩu, bước 1 (Mốc M4b): BE (POST /auth/password-reset/request) tự tạo liên kết
 * {FRONTEND_BASE_URL}/reset-password?mode=resetPassword&oobCode=... và gửi email qua SMTP; không
 * phụ thuộc mẫu email của Firebase. BE luôn trả cùng một 200 dù email có tài khoản hay không
 * (chống dò email); chỉ lỗi mạng hoặc gửi quá nhiều lần mới báo lỗi, bằng thông báo chung.
 */
export async function sendPasswordResetLink(email: string): Promise<void> {
  try {
    await apiClient.post('/auth/password-reset/request', { email: email.trim() });
  } catch (err) {
    const info = readApiError(err);
    if (info.isNetworkError) {
      throw new Error('Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
    }
    if (info.code === 'RATE_LIMITED') {
      throw new Error('Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau ít phút.');
    }
    if (info.code === 'VALIDATION_ERROR') {
      throw new Error('Địa chỉ email không hợp lệ.');
    }
    throw new Error(withRequestId('Không thể gửi yêu cầu đặt lại mật khẩu lúc này. Vui lòng thử lại sau.', info));
  }
}

/** Kết quả lỗi của bước 2, để trang /reset-password chọn cách hiển thị. */
export class PasswordResetError extends Error {
  constructor(message: string, readonly kind: 'expired' | 'invalid' | 'policy' | 'rate_limited' | 'other') {
    super(message);
  }
}

/**
 * Quên mật khẩu, bước 2: mã oobCode từ liên kết trong email + mật khẩu mới -> BE
 * (POST /auth/password-reset/confirm). BE đổi mật khẩu trong DB (nguồn đăng nhập), thu hồi mọi
 * phiên, rồi đồng bộ Firebase. Thành công: 204, không có phiên mới (đăng nhập lại).
 */
export async function confirmPasswordReset(oobCode: string, newPassword: string): Promise<void> {
  const policyError = passwordPolicyError(newPassword);
  if (policyError) throw new PasswordResetError(policyError, 'policy');
  try {
    await apiClient.post('/auth/password-reset/confirm', { oob_code: oobCode, new_password: newPassword });
  } catch (err) {
    const info = readApiError(err);
    if (info.isNetworkError) {
      throw new PasswordResetError('Không thể kết nối đến máy chủ. Vui lòng thử lại.', 'other');
    }
    switch (info.code) {
      case 'RESET_CODE_EXPIRED':
        throw new PasswordResetError('Liên kết đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu liên kết mới.', 'expired');
      case 'RESET_CODE_INVALID':
        throw new PasswordResetError(
          'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng. Vui lòng yêu cầu liên kết mới.',
          'invalid'
        );
      case 'VALIDATION_ERROR':
        throw new PasswordResetError(
          'Mật khẩu mới không đạt yêu cầu (ít nhất 8 ký tự, có chữ hoa, chữ thường và chữ số).',
          'policy'
        );
      case 'RATE_LIMITED':
        throw new PasswordResetError('Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ít phút.', 'rate_limited');
      default:
        throw new PasswordResetError(
          withRequestId('Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.', info),
          'other'
        );
    }
  }
}

/**
 * Yêu cầu mã OTP đặt lại mật khẩu qua BE: BE mới CHƯA có endpoint (KI-05).
 * Không gọi API cũ. Quên mật khẩu bằng liên kết email: sendPasswordResetLink.
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
