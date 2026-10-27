import axios from 'axios';

/**
 * Lỗi của BE mới luôn có dạng {"error": {"code", "message", "request_id"}}.
 * Rẽ nhánh theo `status` và `code`, KHÔNG theo `message` (tiếng Anh, có thể đổi).
 */
export interface ApiErrorInfo {
  /** HTTP status, null khi không có response (lỗi mạng, CORS, timeout). */
  status: number | null;
  /** error.code của BE, ví dụ SESSION_INVALID, DUPLICATE_RESOURCE, RATE_LIMITED. */
  code: string | null;
  /** Thông báo lỗi từ BE (detail hoặc error.message) */
  message?: string | null;
  /** error.request_id của BE (hoặc header X-Request-ID), để báo lỗi cho BE. */
  requestId: string | null;
  /** Số giây đọc từ header Retry-After (thường đi kèm 429), null nếu không có. */
  retryAfterSeconds: number | null;
  /** error.details của BE (chỉ có ở một số lỗi, ví dụ OTP: số lượt còn lại, số giây chờ). */
  details?: Record<string, unknown> | null;
  /** true khi request không nhận được response nào. */
  isNetworkError: boolean;
}

function parseRetryAfter(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const date = Date.parse(raw);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export function readApiError(err: unknown): ApiErrorInfo {
  if (!axios.isAxiosError(err)) {
    return { status: null, code: null, message: null, requestId: null, retryAfterSeconds: null, isNetworkError: false };
  }
  const response = err.response;
  if (!response) {
    return { status: null, code: null, message: null, requestId: null, retryAfterSeconds: null, isNetworkError: true };
  }
  const body = response.data as
    | { error?: { code?: unknown; request_id?: unknown; message?: unknown; details?: unknown }; detail?: unknown }
    | undefined;
  const rawDetails = body?.error?.details;
  const details =
    rawDetails && typeof rawDetails === 'object' && !Array.isArray(rawDetails)
      ? (rawDetails as Record<string, unknown>)
      : null;
  const code = typeof body?.error?.code === 'string' ? body.error.code : null;
  const message =
    typeof body?.detail === 'string'
      ? body.detail
      : typeof body?.error?.message === 'string'
        ? body.error.message
        : null;
  const headerRequestId = response.headers?.['x-request-id'];
  const requestId =
    typeof body?.error?.request_id === 'string'
      ? body.error.request_id
      : typeof headerRequestId === 'string'
        ? headerRequestId
        : null;
  return {
    status: response.status,
    code,
    message,
    requestId,
    retryAfterSeconds: parseRetryAfter(response.headers?.['retry-after']),
    details,
    isNetworkError: false,
  };
}

/** Thêm mã request_id (nếu có) vào cuối thông báo để người dùng gửi cho bộ phận hỗ trợ. */
export function withRequestId(message: string, info: ApiErrorInfo): string {
  return info.requestId ? `${message} (Mã hỗ trợ: ${info.requestId})` : message;
}
