/**
 * Phiên của BE (access_token lấy từ POST /auth/login hoặc POST /auth/change-password).
 *
 * access_token là bí mật: chỉ giữ trong bộ nhớ của ứng dụng, không ghi vào
 * localStorage, URL hay log (handoff_frontend.md mục 2). Tải lại trang thì phiên mất
 * và phải đăng nhập lại (Firebase không còn dùng để khôi phục phiên, Mốc M1).
 */

interface AppSession {
  accessToken: string;
  /** ISO 8601 UTC, do BE trả về (8 giờ sau khi tạo). */
  expiresAt: string;
}

let current: AppSession | null = null;
const invalidListeners = new Set<() => void>();

// Dọn token của BE cũ (đã từng được lưu trong localStorage).
try {
  localStorage.removeItem('auth_token');
} catch {
  // localStorage có thể không dùng được (chế độ riêng tư); bỏ qua.
}

const SESSION_KEY = 'mfgms_app_session';

export function setSession(session: AppSession): void {
  current = session;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export function clearSession(): void {
  current = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function getAccessToken(): string | null {
  if (!current) {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        current = JSON.parse(saved);
      }
    } catch {}
  }
  return current?.accessToken ?? null;
}

export function getSessionExpiresAt(): string | null {
  if (!current) {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        current = JSON.parse(saved);
      }
    } catch {}
  }
  return current?.expiresAt ?? null;
}

/** Có phiên và phiên chưa quá expires_at theo đồng hồ máy khách. */
export function hasSession(): boolean {
  if (!current) {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        current = JSON.parse(saved);
      }
    } catch {}
  }
  if (!current) return false;
  const expiresAt = Date.parse(current.expiresAt);
  if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
    clearSession();
    return false;
  }
  return true;
}

/** Đăng ký xử lý khi BE báo 401 SESSION_INVALID. Trả về hàm hủy đăng ký. */
export function onSessionInvalid(listener: () => void): () => void {
  invalidListeners.add(listener);
  return () => {
    invalidListeners.delete(listener);
  };
}

/** Gọi khi BE trả 401 SESSION_INVALID: xóa phiên rồi báo cho các listener. */
export function notifySessionInvalid(): void {
  clearSession();
  invalidListeners.forEach((listener) => listener());
}
