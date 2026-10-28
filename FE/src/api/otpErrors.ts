import { readApiError, type ApiErrorInfo } from './apiError';

/** Câu duy nhất khi Gmail đã có tài khoản (BE: 409 EMAIL_ALREADY_REGISTERED, Mốc M5-3). */
export const EMAIL_ALREADY_REGISTERED_MESSAGE =
  'Gmail này đã được đăng ký. Hãy đăng nhập hoặc dùng chức năng quên mật khẩu.';

/** Gmail có tài khoản Firebase nhưng chưa có trong hệ thống (BE: 409 EMAIL_ACCOUNT_NEEDS_ADMIN). */
export const EMAIL_ACCOUNT_NEEDS_ADMIN_MESSAGE =
  'Gmail này đã có tài khoản trên hệ thống nhưng chưa được kích hoạt. Vui lòng liên hệ quản trị viên.';

/**
 * Loại "Gmail đã có tài khoản": 'registered' (đăng nhập / quên mật khẩu được),
 * 'needs_admin' (tài khoản chưa kích hoạt, chỉ quản trị viên xử lý được), null nếu không phải.
 */
export type EmailTakenKind = 'registered' | 'needs_admin';

export function emailTakenKind(err: unknown): EmailTakenKind | null {
  const code = readApiError(err).code;
  if (code === 'EMAIL_ALREADY_REGISTERED') return 'registered';
  if (code === 'EMAIL_ACCOUNT_NEEDS_ADMIN') return 'needs_admin';
  return null;
}

/** true khi BE báo Gmail đã có tài khoản (ở bước gửi mã hoặc bước tạo tài khoản). */
export function isEmailAlreadyRegistered(err: unknown): boolean {
  return emailTakenKind(err) !== null;
}

export function emailTakenMessage(kind: EmailTakenKind): string {
  return kind === 'needs_admin' ? EMAIL_ACCOUNT_NEEDS_ADMIN_MESSAGE : EMAIL_ALREADY_REGISTERED_MESSAGE;
}

/*
 * Mốc M5-2: câu tiếng Việt cho từng lỗi OTP của BE (đăng ký thành viên và wizard Business).
 * Rẽ nhánh theo error.code và các con số trong error.details, không theo error.message.
 */

export type OtpStep = 'send' | 'verify';

function details(info: ApiErrorInfo, key: string): number | null {
  const value = info.details?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** "45 giây", "3 phút", "1 giờ 5 phút". */
export function formatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} giây`;
  const minutes = Math.ceil(s / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

/** Số giây phải chờ (details.retry_after_seconds, hoặc header Retry-After), null nếu không có. */
export function otpRetryAfterSeconds(err: unknown): number | null {
  const info = readApiError(err);
  return details(info, 'retry_after_seconds') ?? info.retryAfterSeconds;
}

export function otpErrorMessage(err: unknown, step: OtpStep): string {
  const info = readApiError(err);
  if (info.isNetworkError) return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.';

  switch (info.code) {
    case 'OTP_INVALID': {
      const left = details(info, 'remaining_attempts');
      return left !== null ? `Mã chưa đúng. Bạn còn ${left} lần thử.` : 'Mã chưa đúng. Vui lòng kiểm tra lại.';
    }
    case 'OTP_EXPIRED': {
      const ttl = details(info, 'code_ttl_seconds');
      const validity = ttl !== null ? ` (mã có hiệu lực ${formatWait(ttl)})` : '';
      return `Mã đã hết hạn${validity}. Vui lòng gửi mã mới.`;
    }
    case 'OTP_TOO_MANY_ATTEMPTS':
      return 'Bạn đã nhập sai quá nhiều lần. Vui lòng gửi mã mới.';
    case 'OTP_SUPERSEDED':
      return 'Mã này đã được thay bằng mã mới hơn. Vui lòng dùng mã trong thư mới nhất.';
    case 'OTP_RATE_LIMITED':
    case 'RATE_LIMITED': {
      const wait = details(info, 'retry_after_seconds') ?? info.retryAfterSeconds;
      const when = wait !== null ? `sau ${formatWait(wait)}` : 'sau ít phút';
      return step === 'send'
        ? `Bạn đã yêu cầu mã quá nhiều lần. Vui lòng thử lại ${when}.`
        : `Bạn đã thử quá nhiều lần. Vui lòng thử lại ${when}.`;
    }
    case 'PROVIDER_UNAVAILABLE':
      return 'Hệ thống gửi email đang bận hoặc gặp lỗi. Vui lòng thử lại sau.';
    case 'EMAIL_ALREADY_REGISTERED':
      return EMAIL_ALREADY_REGISTERED_MESSAGE;
    case 'EMAIL_ACCOUNT_NEEDS_ADMIN':
      return EMAIL_ACCOUNT_NEEDS_ADMIN_MESSAGE;
    default:
      break;
  }
  if (step === 'send' && info.status === 409) return EMAIL_ALREADY_REGISTERED_MESSAGE;
  if (info.status === 422) return 'Địa chỉ email không hợp lệ (bắt buộc là Gmail @gmail.com).';
  return step === 'send'
    ? 'Không thể gửi mã xác thực. Vui lòng thử lại sau.'
    : 'Không thể xác thực mã lúc này. Vui lòng thử lại.';
}

/*
 * Mốc M5-2 (4b): sau các lỗi này mã đang nhập không dùng được nữa, nên form xóa ô nhập mã và mời
 * người dùng bấm "Gửi mã mới". KHÔNG bao giờ tự gửi mã: mỗi lần gửi là một thư vào hộp thư của
 * địa chỉ đã nhập (có thể của người khác), chỉ gửi khi người dùng bấm.
 */
export type OtpNewCodeReason = 'too_many_attempts' | 'expired' | 'superseded';

const NEW_CODE_REASONS: Record<string, OtpNewCodeReason> = {
  OTP_TOO_MANY_ATTEMPTS: 'too_many_attempts',
  OTP_EXPIRED: 'expired',
  OTP_SUPERSEDED: 'superseded',
};

/** Lý do phải dùng mã mới, hoặc null nếu mã hiện tại vẫn thử tiếp được (ví dụ OTP_INVALID). */
export function otpNewCodeReason(err: unknown): OtpNewCodeReason | null {
  return NEW_CODE_REASONS[readApiError(err).code ?? ''] ?? null;
}

/** "Có thể gửi lại sau 45 giây." khi còn phải chờ, null khi bấm gửi được ngay. */
export function otpResendHint(secondsLeft: number): string | null {
  return secondsLeft > 0 ? `Có thể gửi lại sau ${formatWait(secondsLeft)}.` : null;
}

/** true khi lỗi là giới hạn số lần (OTP_RATE_LIMITED theo email, RATE_LIMITED theo IP). */
export function isOtpRateLimited(err: unknown): boolean {
  const code = readApiError(err).code;
  return code === 'OTP_RATE_LIMITED' || code === 'RATE_LIMITED';
}

/*
 * Mốc M3b: register-public từ chối vì token xác thực. Cả ba trường hợp đều phải xác thực Gmail lại
 * bằng mã mới; trả null nếu lỗi không thuộc nhóm này.
 */
export function verificationErrorMessage(err: unknown): string | null {
  const info = readApiError(err);
  switch (info.code) {
    case 'EMAIL_NOT_VERIFIED':
      return 'Gmail chưa được xác thực bằng mã OTP. Vui lòng gửi mã và xác thực lại.';
    case 'VERIFICATION_EXPIRED': {
      const ttl = details(info, 'verification_ttl_seconds');
      const validity = ttl !== null ? ` (có hiệu lực ${formatWait(ttl)})` : '';
      return `Phiên xác thực Gmail đã hết hạn${validity}. Vui lòng xác thực lại bằng mã mới.`;
    }
    case 'VERIFICATION_USED':
      return 'Phiên xác thực Gmail này đã được sử dụng. Vui lòng xác thực lại bằng mã mới.';
    default:
      return null;
  }
}
