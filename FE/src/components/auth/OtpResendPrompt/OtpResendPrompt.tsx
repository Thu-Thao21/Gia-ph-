import React from 'react';
import { formatWait, otpResendHint, type OtpNewCodeReason } from '../../../api/otpErrors';
import './OtpResendPrompt.css';

export interface OtpResendPromptProps {
  /** Vì sao mã cũ không dùng được nữa (quyết định câu hướng dẫn). */
  reason: OtpNewCodeReason;
  /** Số giây còn phải chờ trước khi BE cho gửi mã mới (0 = gửi được ngay). */
  secondsLeft: number;
  loading: boolean;
  /** Gửi MỘT mã mới. Chỉ gọi khi người dùng bấm: không bao giờ tự gửi. */
  onResend: () => void;
  /**
   * Lần gửi gần nhất bị giới hạn (OTP_RATE_LIMITED / RATE_LIMITED). Khi đó form đã hiện đúng MỘT
   * câu "Bạn đã yêu cầu mã quá nhiều lần..." bên dưới: khối này không thêm câu nào nữa, chỉ giữ
   * nút bị khóa và đếm ngược trên chính nút.
   */
  rateLimited?: boolean;
}

const GUIDANCE: Record<OtpNewCodeReason, string> = {
  too_many_attempts: 'Mã cũ đã bị hủy vì nhập sai quá nhiều lần.',
  expired: 'Mã cũ đã hết hạn.',
  superseded: 'Bạn có thể nhập mã trong thư mới nhất, hoặc yêu cầu một mã khác.',
};

/** Khối mời gửi mã mới, hiện sau OTP_TOO_MANY_ATTEMPTS / OTP_EXPIRED / OTP_SUPERSEDED (Mốc M5-2). */
export const OtpResendPrompt: React.FC<OtpResendPromptProps> = ({
  reason,
  secondsLeft,
  loading,
  onResend,
  rateLimited = false,
}) => {
  const hint = rateLimited ? null : otpResendHint(secondsLeft);
  const waiting = rateLimited && secondsLeft > 0 ? ` (${formatWait(secondsLeft)})` : '';
  return (
    <div className="otp-resend-prompt" role="status" data-testid="otp-resend-prompt">
      {!rateLimited && <span className="otp-resend-prompt-text">{GUIDANCE[reason]}</span>}
      <button
        type="button"
        className="otp-resend-prompt-btn"
        data-testid="otp-resend-btn"
        onClick={onResend}
        disabled={loading || secondsLeft > 0}
      >
        {loading ? 'Đang gửi...' : `Gửi mã mới${waiting}`}
      </button>
      {hint && <span className="otp-resend-prompt-hint">{hint}</span>}
    </div>
  );
};

export default OtpResendPrompt;
