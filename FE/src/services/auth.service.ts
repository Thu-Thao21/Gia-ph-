import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  FacebookAuthProvider,
  linkWithCredential,
  RecaptchaVerifier,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider, facebookProvider } from '../config/firebase';
import apiClient from '../api/axios';
import { readApiError, withRequestId } from '../api/apiError';
import { clearSession, hasSession, setSession } from '../api/session';
import type { AccountProfile, AccountRoleInfo } from '../context/AuthContext';
import type { MeResponse, SessionCreateResponse } from '../types/auth';

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

function handleAuthError(err: any, providerName: string): string {
  console.error(`${providerName} Auth Error:`, err?.code || err?.message);
  const code = err?.code || '';
  if (code === 'auth/popup-closed-by-user') {
    return `Bạn đã đóng cửa sổ đăng nhập ${providerName}.`;
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'Yêu cầu đăng nhập đã bị hủy.';
  }
  if (code === 'auth/operation-not-allowed') {
    return `Đăng nhập ${providerName} chưa được kích hoạt trong Firebase Console. Vui lòng bật provider này trong Authentication -> Sign-in method.`;
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Tên miền hiện tại chưa được cấp phép trong Firebase Console (Authentication -> Settings -> Authorized domains).';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'Email của tài khoản này đã được đăng ký bằng phương thức khác. Vui lòng đăng nhập bằng Email/Google trước.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Trình duyệt đã chặn cửa sổ Popup đăng nhập. Vui lòng bỏ chặn Popup hoặc cho phép pop-up từ trang web này.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-email'
  ) {
    return 'Email hoặc mật khẩu không đúng.';
  }
  if (code === 'auth/user-disabled') {
    return 'Tài khoản Firebase này đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Không thể kết nối đến Firebase. Vui lòng kiểm tra kết nối mạng.';
  }
  return err?.message || `Đăng nhập ${providerName} thất bại.`;
}

// ----- Phiên của BE mới: POST /auth/session, GET /auth/me, POST /auth/logout -----

/** Thông báo lỗi khi đổi Firebase ID token lấy phiên BE (rẽ nhánh theo error.code). */
function sessionErrorMessage(err: unknown): string {
  const info = readApiError(err);
  if (info.isNetworkError) {
    return 'Không thể kết nối đến máy chủ Backend. Vui lòng kiểm tra server và cấu hình VITE_API_BASE_URL.';
  }
  switch (info.code) {
    case 'INVALID_ID_TOKEN':
      return 'Tài khoản chưa được cấp quyền truy cập hệ thống hoặc phiên Firebase không còn hợp lệ. Vui lòng đăng nhập lại hoặc liên hệ quản trị viên.';
    case 'ACCOUNT_BLOCKED':
      return 'Tài khoản này hiện không thể sử dụng. Vui lòng liên hệ quản trị viên.';
    case 'TEMPORARY_PASSWORD_EXPIRED':
      return 'Mật khẩu tạm thời đã hết hạn. Vui lòng liên hệ quản trị viên để được cấp lại.';
    case 'PASSWORD_CHANGE_REQUIRED':
      return 'Tài khoản yêu cầu đổi mật khẩu lần đầu trước khi tiếp tục.';
    case 'PROVIDER_UNAVAILABLE':
    case 'DATABASE_UNAVAILABLE':
      return withRequestId('Hệ thống tạm thời không khả dụng. Vui lòng thử lại sau.', info);
    default:
      if (info.status === null && err instanceof Error && err.message) return err.message;
      return withRequestId('Đăng nhập thất bại. Vui lòng thử lại.', info);
  }
}

let pendingSession: Promise<void> | null = null;

/**
 * Đổi Firebase ID token của người dùng lấy access_token của BE (POST /auth/session).
 * access_token chỉ được BE trả một lần; lưu trong bộ nhớ kèm expires_at.
 * Các lời gọi đồng thời dùng chung một request.
 */
export function establishSession(user: FirebaseUser): Promise<void> {
  if (pendingSession) return pendingSession;
  pendingSession = (async () => {
    clearSession();
    const idToken = await user.getIdToken();
    const res = await apiClient.post<SessionCreateResponse>('/auth/session', { id_token: idToken });
    setSession({ accessToken: res.data.access_token, expiresAt: res.data.expires_at });
  })().finally(() => {
    pendingSession = null;
  });
  return pendingSession;
}

const ROLE_CODE_TO_UI_ROLE: Record<string, string> = {
  BUSINESS_OWNER: 'family_head',
  FAMILY_ADMIN: 'family_admin',
  FAMILY_MEMBER: 'member',
};

/** Chuyển GET /auth/me sang AccountProfile mà giao diện đang dùng. */
export function toAccountProfile(me: MeResponse): AccountProfile {
  const fbUser = auth.currentUser;
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
    firebase_uid: fbUser?.uid ?? 'dev-uid',
    username: null,
    email: fbUser?.email ?? '',
    phone_e164: fbUser?.phoneNumber ?? null,
    display_name: me.display_name,
    email_verified: fbUser?.emailVerified ?? true,
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

/** Sau khi đăng nhập Firebase: tạo phiên BE rồi đọc tài khoản. Lỗi thì đăng xuất Firebase. */
async function completeLogin(user: FirebaseUser): Promise<AccountProfile> {
  try {
    if (!hasSession()) {
      await establishSession(user);
    }
    return await fetchCurrentAccount();
  } catch (err) {
    // [L-16]: Nếu API /auth/me trả mã lỗi PASSWORD_CHANGE_REQUIRED, bắt mã lỗi này,
    // giữ token tạm và lập tức trả về profile yêu cầu đổi mật khẩu lần đầu thay vì báo "Đăng nhập thất bại".
    const info = readApiError(err);
    if (info.code === 'PASSWORD_CHANGE_REQUIRED') {
      return {
        id: user.uid,
        firebase_uid: user.uid,
        email: user.email,
        display_name: user.displayName || user.email?.split('@')[0] || 'Người dùng',
        email_verified: user.emailVerified,
        phone_verified: false,
        status: 'pending',
        roles: [],
        primary_role: 'member',
        requires_password_change: true,
      };
    }
    clearSession();
    await signOut(auth).catch(() => undefined);
    throw new Error(sessionErrorMessage(err));
  }
}

/** POST /auth/logout (nếu đang có phiên) rồi signOut Firebase. */
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
    await signOut(auth);
  }
}

/**
 * Đổi mật khẩu (phiên hạn chế hoặc bình thường): POST /auth/change-password.
 * recent_id_token phải từ lần đăng nhập trong vòng 5 phút, nên xác thực lại với
 * Firebase bằng mật khẩu hiện tại trước. Thành công (204) thì mọi phiên bị thu hồi:
 * xóa phiên, signOut Firebase và bắt đăng nhập lại.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Không xác định được tài khoản đang đăng nhập. Vui lòng đăng nhập lại.');
  }

  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      throw new Error('Mật khẩu hiện tại không đúng.');
    }
    throw new Error(handleAuthError(err, 'Email'));
  }

  const recentIdToken = await user.getIdToken(true);
  try {
    await apiClient.post('/auth/change-password', {
      new_password: newPassword,
      recent_id_token: recentIdToken,
    });
  } catch (err) {
    const info = readApiError(err);
    if (info.isNetworkError) {
      throw new Error('Không thể kết nối đến máy chủ Backend. Vui lòng thử lại.');
    }
    switch (info.code) {
      case 'RECENT_LOGIN_REQUIRED':
        throw new Error('Cần xác thực lại. Vui lòng nhập lại mật khẩu hiện tại và thử lại.');
      case 'TEMPORARY_PASSWORD_EXPIRED':
        throw new Error('Mật khẩu tạm thời đã hết hạn. Vui lòng liên hệ quản trị viên để được cấp lại.');
      case 'VALIDATION_ERROR':
        throw new Error('Mật khẩu mới không đạt yêu cầu (tối thiểu 6 ký tự).');
      case 'SESSION_INVALID':
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      case 'DATABASE_UNAVAILABLE':
        throw new Error(
          withRequestId(
            'Máy chủ tạm thời lỗi khi lưu mật khẩu mới. Vui lòng thử lại; nếu mật khẩu tạm không còn đúng, hãy nhập mật khẩu mới vào ô mật khẩu hiện tại.',
            info
          )
        );
      case 'PROVIDER_UNAVAILABLE':
        throw new Error(withRequestId('Dịch vụ xác thực tạm thời không khả dụng. Vui lòng thử lại sau.', info));
      default:
        throw new Error(withRequestId('Đổi mật khẩu thất bại. Vui lòng thử lại.', info));
    }
  }

  // 204: mọi phiên của người dùng đã bị thu hồi.
  clearSession();
  await signOut(auth);
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
 * Đăng ký tài khoản cá nhân bằng Gmail thật đã xác thực OTP:
 * Tạo người dùng phía Backend và tự động đăng nhập.
 */
export async function registerWithEmailPassword(payload: RegisterPayload): Promise<AccountProfile> {
  const email = (payload.email || '').trim();
  if (!email.toLowerCase().endsWith('@gmail.com')) {
    throw new Error('Email đăng ký bắt buộc phải là địa chỉ Gmail có đuôi @gmail.com.');
  }
  if (!payload.otp) {
    throw new Error('Vui lòng xác thực mã OTP trước khi tạo tài khoản.');
  }

  // Thử tạo tài khoản trên Firebase trước nếu có thể
  try {
    await createUserWithEmailAndPassword(auth, email, payload.password);
  } catch (fbErr: any) {
    console.warn('Firebase registration notice:', fbErr?.code || fbErr?.message);
  }

  try {
    const res = await apiClient.post<SessionCreateResponse>('/auth/register-public', {
      email,
      password: payload.password,
      display_name: payload.displayName || payload.username || email.split('@')[0],
      username: payload.username || email.split('@')[0],
      otp: payload.otp,
    });
    setSession({ accessToken: res.data.access_token, expiresAt: res.data.expires_at });
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
    throw new Error(info.message || 'Đăng ký tài khoản thất bại. Vui lòng thử lại.');
  }
}

/**
 * Đăng nhập Email/Password qua Firebase, rồi đổi ID token lấy phiên BE.
 * Hỗ trợ Gmail (@gmail.com) cho Member/Admin và @giapha.com cho Trưởng tộc.
 */
export async function loginWithEmailPassword(payload: LoginPayload): Promise<AccountProfile> {
  const email = payload.email.trim();
  if (!email.includes('@')) {
    throw new Error('Vui lòng đăng nhập bằng địa chỉ email hợp lệ (@gmail.com hoặc @giapha.com).');
  }
  const emailLower = email.toLowerCase();
  if (!emailLower.endsWith('@gmail.com') && !emailLower.endsWith('@giapha.com')) {
    throw new Error('Hệ thống chỉ hỗ trợ đăng nhập bằng tài khoản Gmail (@gmail.com) hoặc tài khoản Trưởng tộc (@giapha.com).');
  }
  let user: FirebaseUser;
  try {
    const credential = await signInWithEmailAndPassword(auth, email, payload.password);
    user = credential.user;
  } catch (err: any) {
    throw new Error(handleAuthError(err, 'Email'));
  }
  return completeLogin(user);
}


/**
 * Đăng nhập Google qua Firebase, rồi đổi ID token lấy phiên BE.
 */
export async function loginWithGoogle(): Promise<AccountProfile> {
  let user: FirebaseUser;
  try {
    let credential;
    try {
      credential = await signInWithPopup(auth, googleProvider);
    } catch (popupErr: any) {
      if (popupErr.code === 'auth/popup-blocked') {
        // Sau redirect, AuthContext tự tạo phiên khi Firebase báo đã đăng nhập.
        await signInWithRedirect(auth, googleProvider);
        return {} as AccountProfile;
      }
      throw popupErr;
    }
    user = credential.user;
  } catch (err: any) {
    throw new Error(handleAuthError(err, 'Google'));
  }
  return completeLogin(user);
}

/**
 * Đăng nhập Facebook qua Firebase, rồi đổi ID token lấy phiên BE.
 */
export async function loginWithFacebook(): Promise<AccountProfile> {
  let user: FirebaseUser;
  try {
    let credential;
    try {
      credential = await signInWithPopup(auth, facebookProvider);
    } catch (popupErr: any) {
      if (popupErr.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, facebookProvider);
        return {} as AccountProfile;
      }
      if (popupErr.code === 'auth/account-exists-with-different-credential') {
        const pendingCred = FacebookAuthProvider.credentialFromError(popupErr);
        if (auth.currentUser && pendingCred) {
          await linkWithCredential(auth.currentUser, pendingCred);
          user = auth.currentUser;
          return completeLogin(user);
        }
      }
      throw popupErr;
    }
    user = credential.user;
  } catch (err: any) {
    throw new Error(handleAuthError(err, 'Facebook'));
  }
  return completeLogin(user);
}


/**
 * Send password reset email link via Firebase Auth.
 */
export async function sendPasswordResetLink(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err: any) {
    console.error('Password Reset Error:', err);
    if (err.code === 'auth/user-not-found') {
      // Don't leak user existence for security
      return;
    }
    throw new Error(err.message || 'Không thể gửi email đặt lại mật khẩu.');
  }
}

/**
 * Normalize Vietnamese phone number to E.164 standard format (+84...)
 */
/**
 * Setup RecaptchaVerifier for Phone Auth.
 */
export function setupPhoneRecaptcha(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved
    },
  });
}

export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('84')) return `+${digits}`;
  if (digits.startsWith('0')) return `+84${digits.slice(1)}`;
  if (digits.length >= 9) return `+84${digits}`;
  return `+${digits}`;
}

/**
 * Send SMS OTP using Firebase Phone Auth.
 */
export async function sendPhoneOtp(phone: string, recaptchaVerifier: any): Promise<any> {
  const e164Phone = formatPhoneE164(phone);
  if (!e164Phone || e164Phone.length < 11) {
    throw new Error('Số điện thoại không hợp lệ. Vui lòng nhập số điện thoại Việt Nam (VD: 0912345678).');
  }

  try {
    const { signInWithPhoneNumber } = await import('firebase/auth');
    const confirmationResult = await signInWithPhoneNumber(auth, e164Phone, recaptchaVerifier);
    return confirmationResult;
  } catch (err: any) {
    console.error('SMS OTP Error:', err);
    if (err.code === 'auth/billing-not-enabled') {
      throw new Error(
        'Firebase bản miễn phí (Spark Plan) chặn bắn SMS thật tới số di động ngoài danh sách thử nghiệm.'
      );
    }
    if (err.code === 'auth/operation-not-allowed') {
      throw new Error(
        'Firebase chưa cho phép gửi SMS về Việt Nam (+84). Vui lòng vào Firebase Console -> Authentication -> Settings -> SMS Region Policy -> Chọn Allow Việt Nam (+84).'
      );
    }
    if (err.code === 'auth/quota-exceeded') {
      throw new Error('Đã hết hạn ngạch (quota) gửi tin nhắn SMS của Firebase trong ngày.');
    }
    if (err.code === 'auth/invalid-phone-number') {
      throw new Error('Số điện thoại không hợp lệ. Vui lòng kiểm tra lại số điện thoại.');
    }
    throw new Error(err.message || 'Gửi mã OTP qua SMS thất bại.');
  }
}

/**
 * Xác minh mã SMS OTP của Firebase, rồi đổi ID token lấy phiên BE.
 */
export async function verifyPhoneOtp(confirmationResult: any, otpCode: string): Promise<AccountProfile> {
  let user: FirebaseUser;
  try {
    const credential = await confirmationResult.confirm(otpCode.trim());
    user = credential.user;
  } catch (err: any) {
    console.error('Verify OTP Error:', err?.code || err?.message);
    throw new Error('Mã OTP không đúng hoặc đã hết hạn.');
  }
  return completeLogin(user);
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
