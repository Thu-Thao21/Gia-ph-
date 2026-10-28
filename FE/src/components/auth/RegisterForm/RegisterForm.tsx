import React, { useEffect, useState } from 'react';
import {
  passwordPolicyError,
  registerWithEmailPassword,
  sendRegisterOtp,
  verifyRegisterOtp,
  RegisterError,
} from '../../../services/auth.service';
import PasswordInput from '../PasswordInput/PasswordInput';
import {
  formatWait,
  emailTakenKind,
  emailTakenMessage,
  type EmailTakenKind,
  otpErrorMessage,
  isOtpRateLimited,
  otpNewCodeReason,
  otpRetryAfterSeconds,
  type OtpNewCodeReason,
} from '../../../api/otpErrors';
import OtpResendPrompt from '../OtpResendPrompt/OtpResendPrompt';
import type { AccountProfile } from '../../../context/AuthContext';
import './RegisterForm.css';

export interface RegisterFormProps {
  onSwitchToLogin: () => void;
  /** Mở trang Quên mật khẩu (hiện trong thông báo "Gmail đã được đăng ký"). */
  onSwitchToForgotPassword?: () => void;
  onSuccess: (profile?: AccountProfile) => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin, onSwitchToForgotPassword, onSuccess }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });

  // OTP State
  const [otpCode, setOtpCode] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  // Token dùng một lần BE trả sau khi xác thực đúng mã (Mốc M5-1); chỉ giữ trong bộ nhớ.
  const [verificationToken, setVerificationToken] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMsg, setOtpMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  // Khác null khi mã đang nhập không dùng được nữa (hết hạn, sai quá số lần, đã có mã mới hơn).
  const [newCodeReason, setNewCodeReason] = useState<OtpNewCodeReason | null>(null);
  // Lần gửi mã gần nhất bị giới hạn: khối "Gửi mã mới" chỉ giữ nút khóa + đếm ngược, không thêm câu.
  const [otpRateLimited, setOtpRateLimited] = useState(false);
  // Gmail đã có tài khoản (409): 'registered' -> Đăng nhập / Quên mật khẩu; 'needs_admin' -> tài
  // khoản chưa kích hoạt, chỉ quản trị viên xử lý được (không hiện Quên mật khẩu).
  const [emailTaken, setEmailTaken] = useState<EmailTakenKind | null>(null);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isValidGmail = (val: string) => {
    return /^[^@\s]+@gmail\.com$/i.test(val.trim());
  };

  const handleSendOtp = async () => {
    const trimmed = formData.email.trim();
    if (!isValidGmail(trimmed)) {
      setOtpMsg({ text: 'Email bắt buộc phải có đuôi @gmail.com hợp lệ.', isError: true });
      return;
    }
    setOtpLoading(true);
    setOtpMsg(null);
    setEmailTaken(null);
    try {
      await sendRegisterOtp(trimmed);
      setIsOtpSent(true);
      setOtpCode('');
      setNewCodeReason(null);
      setOtpRateLimited(false);
      setOtpCountdown(60);
      setOtpMsg({ text: 'Mã xác thực 6 số đã được gửi tới Gmail. Vui lòng kiểm tra hộp thư.', isError: false });
    } catch (err: unknown) {
      const taken = emailTakenKind(err);
      if (taken) {
        setEmailTaken(taken);
        return;
      }
      setOtpRateLimited(isOtpRateLimited(err));
      const wait = otpRetryAfterSeconds(err);
      if (wait !== null) setOtpCountdown(wait); // chờ đúng thời gian BE báo (retry_after)
      setOtpMsg({ text: otpErrorMessage(err, 'send'), isError: true });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const trimmedCode = otpCode.trim();
    if (trimmedCode.length !== 6) {
      setOtpMsg({ text: 'Vui lòng nhập đủ 6 chữ số mã OTP.', isError: true });
      return;
    }
    setOtpLoading(true);
    setOtpMsg(null);
    try {
      const verified = await verifyRegisterOtp(formData.email.trim(), trimmedCode);
      setVerificationToken(verified.verification_token);
      setIsEmailVerified(true);
      setOtpMsg({ text: 'Xác thực Gmail thành công!', isError: false });
    } catch (err: unknown) {
      const reason = otpNewCodeReason(err);
      if (reason) {
        // Mã đã nhập không dùng được nữa: xóa ô nhập, mời bấm "Gửi mã mới" (KHÔNG tự gửi).
        setOtpCode('');
        setNewCodeReason(reason);
        setOtpRateLimited(false);
      }
      setOtpMsg({ text: otpErrorMessage(err, 'verify'), isError: true });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidGmail(formData.email)) {
      setError('Địa chỉ email bắt buộc phải là @gmail.com hợp lệ.');
      return;
    }

    if (!isEmailVerified || !verificationToken) {
      setError('Vui lòng bấm Gửi mã OTP và xác thực Gmail trước khi hoàn tất đăng ký.');
      return;
    }

    const policyError = passwordPolicyError(formData.password);
    if (policyError) {
      setError(policyError);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Xác nhận mật khẩu không khớp.');
      return;
    }

    setIsSubmitting(true);

    try {
      const profile = await registerWithEmailPassword({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        displayName: formData.displayName,
        verificationToken,
      });
      onSuccess(profile);
    } catch (err) {
      if (err instanceof RegisterError && err.kind === 'verification_required') {
        // Token thiếu / hết hạn / đã dùng: quay lại bước xác thực Gmail (gửi mã mới khi người dùng bấm).
        setIsEmailVerified(false);
        setVerificationToken('');
        setIsOtpSent(false);
        setOtpCode('');
        setNewCodeReason(null);
        setError(err.message);
      } else if (err instanceof RegisterError && err.kind !== 'verification_required') {
        setEmailTaken(err.kind);
      } else {
        setError(err instanceof Error ? err.message : 'Đăng ký thất bại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-form-card">
      <div className="register-form-glow-top" />

      <div className="register-form-header">
        <div className="register-form-badge">
          <span className="register-form-badge-dot" />
          <span className="register-form-badge-text">TẠO TÀI KHOẢN MỚI</span>
        </div>
        <h1 className="register-form-title">Tham gia Gia Phả Liên Họ!</h1>
        <p className="register-form-subtitle">Điền thông tin bên dưới để tạo tài khoản thành viên mới.</p>
      </div>

      <form onSubmit={handleSubmit} className="register-form-body">
        <div className="register-form-group">
          <label className="register-form-label">Tên đăng nhập *</label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="vd: nguyen_van_a"
            required
            className="register-form-input"
          />
        </div>

        <div className="register-form-group">
          <label className="register-form-label">Địa chỉ Gmail liên hệ (@gmail.com) *</label>
          <div className="reg-email-row">
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, email: e.target.value }));
                if (isEmailVerified) setIsEmailVerified(false);
                setVerificationToken('');
                if (isOtpSent) setIsOtpSent(false);
                setNewCodeReason(null);
                setEmailTaken(null);
                setOtpMsg(null);
              }}
              placeholder="VD: nguyenvana@gmail.com"
              disabled={isEmailVerified}
              required
              className="register-form-input"
            />
            {!isEmailVerified && (
              <button
                type="button"
                className="reg-otp-btn"
                onClick={handleSendOtp}
                disabled={otpLoading || otpCountdown > 0 || !isValidGmail(formData.email)}
              >
                {otpLoading ? 'Đang gửi...' : otpCountdown > 0 ? `Gửi lại (${formatWait(otpCountdown)})` : isOtpSent ? 'Gửi lại mã' : 'Gửi mã OTP'}
              </button>
            )}
          </div>

          {isEmailVerified ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span className="reg-otp-verified-badge">✓ Đã xác thực Gmail thành công</span>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '11.5px',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                }}
                onClick={() => {
                  setIsEmailVerified(false);
                  setIsOtpSent(false);
                  setOtpCode('');
                  setNewCodeReason(null);
                  setOtpMsg(null);
                }}
              >
                Đổi Gmail
              </button>
            </div>
          ) : (
            isOtpSent && (
              <div className="reg-otp-box">
                <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                  Nhập mã 6 số gửi đến hộp thư Gmail:
                </span>
                {(!newCodeReason || newCodeReason === 'superseded') && (
                <div className="reg-otp-input-row">
                  <input
                    type="text"
                    maxLength={6}
                    className="reg-otp-code-input"
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <button
                    type="button"
                    className="reg-otp-verify-btn"
                    onClick={handleVerifyOtp}
                    disabled={otpLoading || otpCode.trim().length !== 6}
                  >
                    {otpLoading ? 'Đang kiểm tra...' : 'Xác nhận OTP'}
                  </button>
                </div>
                )}
                {newCodeReason && (
                  <OtpResendPrompt
                    reason={newCodeReason}
                    secondsLeft={otpCountdown}
                    loading={otpLoading}
                    onResend={handleSendOtp}
                    rateLimited={otpRateLimited}
                  />
                )}
              </div>
            )
          )}

          {otpMsg && (
            <p className={`reg-otp-msg ${otpMsg.isError ? 'error' : 'success'}`}>
              {otpMsg.text}
            </p>
          )}
        </div>

        <div className="register-form-group">
          <label className="register-form-label">Họ và tên hiển thị</label>
          <input
            type="text"
            name="displayName"
            value={formData.displayName}
            onChange={handleChange}
            placeholder="VD: Nguyễn Văn A"
            className="register-form-input"
          />
        </div>

        <div className="register-form-group">
          <label className="register-form-label">Mật khẩu</label>
          <PasswordInput
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Ít nhất 8 ký tự, có chữ hoa, chữ thường và số"
            autoComplete="new-password"
            required
            className="register-form-input"
          />
        </div>

        <div className="register-form-group">
          <label className="register-form-label">Xác nhận mật khẩu</label>
          <PasswordInput
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="Nhập lại mật khẩu"
            autoComplete="new-password"
            required
            className="register-form-input"
          />
        </div>

        {emailTaken ? (
          <div className="register-form-taken" role="alert" data-testid="register-email-taken">
            <p className="register-form-taken-text">{emailTakenMessage(emailTaken)}</p>
            <div className="register-form-taken-actions">
              <button type="button" onClick={onSwitchToLogin} className="register-form-taken-link">
                Đăng nhập
              </button>
              {emailTaken === 'registered' && onSwitchToForgotPassword && (
                <button type="button" onClick={onSwitchToForgotPassword} className="register-form-taken-link">
                  Quên mật khẩu
                </button>
              )}
            </div>
          </div>
        ) : null}

        {error ? <p className="register-form-error">{error}</p> : null}

        <button type="submit" disabled={isSubmitting} className="register-form-submit">
          {isSubmitting ? 'Đang xử lý...' : 'Tạo Tài Khoản'}
        </button>
        {/* Nhóm chốt (Mốc M1): chỉ đăng ký/đăng nhập bằng email + mật khẩu, không Google/Facebook/SMS. */}
      </form>

      <div className="register-form-switch">
        Đã có tài khoản?{' '}
        <button type="button" onClick={onSwitchToLogin} className="btn-switch-link">
          Đăng nhập ngay
        </button>
      </div>
    </div>
  );
};

export default RegisterForm;
