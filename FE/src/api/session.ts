/**
 * Phiên của BE mới (access_token lấy từ POST /auth/session).
 *
 * access_token là bí mật: chỉ giữ trong bộ nhớ của ứng dụng, không ghi vào
 * localStorage, URL hay log (handoff_frontend.md mục 2). Khi tải lại trang,
 * AuthContext đổi Firebase ID token hiện tại lấy một phiên mới.
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

export function setSession(session: AppSession): void {
  current = session;
}

export function clearSession(): void {
  current = null;
}

export function getAccessToken(): string | null {
  return current?.accessToken ?? null;
}

export function getSessionExpiresAt(): string | null {
  return current?.expiresAt ?? null;
}

/** Có phiên và phiên chưa quá expires_at theo đồng hồ máy khách. */
export function hasSession(): boolean {
  if (!current) return false;
  const expiresAt = Date.parse(current.expiresAt);
  if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
    current = null;
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
