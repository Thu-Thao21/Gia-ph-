import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readApiError } from '../api/apiError';
import { clearSession, hasSession, onSessionInvalid } from '../api/session';
import {
  changePassword as changePasswordRequest,
  fetchCurrentAccount,
  isPasswordChangeRequired,
  loginWithPassword,
  logoutSession,
  restrictedProfile,
} from '../services/auth.service';
import type { MembershipSummary } from '../types/auth';

export interface AccountRoleInfo {
  id: string;
  role: string;
  family_id?: string | null;
  status: string;
}

export interface AccountProfile {
  id: string;
  username?: string | null;
  email?: string | null;
  phone_e164?: string | null;
  display_name?: string | null;
  email_verified?: boolean;
  phone_verified: boolean;
  status: string;
  roles: AccountRoleInfo[];
  primary_role: 'admin' | 'member' | string;
  /** Từ GET /auth/me: true là phiên hạn chế, phải đổi mật khẩu trước (L-17). */
  requires_password_change?: boolean;
  /** Từ GET /auth/me: dòng họ, vai trò và quyền hiệu lực trong từng dòng họ. */
  memberships?: MembershipSummary[];
  /** Từ GET /auth/me: quyền cấp hệ thống (tạm thời, không hard-code). */
  permissions?: string[];
  clan_name?: string | null;
  clan_id?: string | null;
}

interface AuthContextType {
  account: AccountProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  primaryRole: string;
  login: (payload: { emailOrPhone: string; password: string }) => Promise<AccountProfile>;
  refreshAccount: () => Promise<AccountProfile | null>;
  /** POST /auth/change-password; thành công thì mọi phiên cũ bị thu hồi và BE cấp một phiên mới. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<AccountProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/*
 * Mốc M1: một cửa đăng nhập duy nhất là POST /auth/login. Firebase không tạo phiên nữa.
 * access_token chỉ nằm trong bộ nhớ (api/session.ts), nên tải lại trang là phải đăng nhập lại.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  /** Đọc lại tài khoản từ GET /auth/me nếu đang có phiên BE. */
  const fetchAccount = async (): Promise<AccountProfile | null> => {
    if (!hasSession()) {
      setAccount(null);
      return null;
    }
    try {
      const profile = await fetchCurrentAccount();
      setAccount(profile);
      return profile;
    } catch (error) {
      if (isPasswordChangeRequired(error)) {
        // Giữ phiên hạn chế: router đưa thẳng tới /change-password (L-17), không kẹt ở đăng nhập.
        const profile = { ...restrictedProfile(), ...(account ?? {}), requires_password_change: true };
        setAccount(profile);
        return profile;
      }
      // Không log nguyên đối tượng lỗi: nó chứa header Authorization.
      const info = readApiError(error);
      console.warn('Không lấy được tài khoản từ Backend:', info.status, info.code, info.requestId);
      clearSession();
      setAccount(null);
      return null;
    }
  };

  const login = async (payload: { emailOrPhone: string; password: string }): Promise<AccountProfile> => {
    const profile = await loginWithPassword({
      email: payload.emailOrPhone.trim().toLowerCase(),
      password: payload.password,
    });
    setAccount(profile);
    return profile;
  };

  useEffect(() => {
    void fetchAccount().finally(() => setLoading(false));
  }, []);

  // BE trả 401 SESSION_INVALID: phiên đã bị xóa, về trang đăng nhập.
  useEffect(() => {
    return onSessionInvalid(() => {
      setAccount(null);
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  const changePassword = async (currentPassword: string, newPassword: string): Promise<AccountProfile> => {
    try {
      const profile = await changePasswordRequest(currentPassword, newPassword);
      setAccount(profile);
      return profile;
    } catch (err) {
      // ACCOUNT_LOCKED: BE đã thu hồi mọi phiên (service đã xóa phiên trong bộ nhớ).
      if (!hasSession()) setAccount(null);
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await logoutSession();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      clearSession();
      setAccount(null);
      setLoading(false);
    }
  };

  const primaryRole = account?.primary_role || 'member';

  return (
    <AuthContext.Provider
      value={{
        account,
        isAuthenticated: !!account,
        loading,
        primaryRole,
        login,
        refreshAccount: fetchAccount,
        changePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );

};

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

export const useAuth = useAuthContext;

/** Trang đích sau đăng nhập: phiên hạn chế phải vào thẳng màn đổi mật khẩu (L-17). */
export function homePathFor(profile: AccountProfile | null | undefined): string {
  if (profile?.requires_password_change) return '/change-password';
  return profile?.primary_role === 'admin' ? '/admin' : '/user';
}
