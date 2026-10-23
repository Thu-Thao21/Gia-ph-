import React, { useEffect, useState } from 'react';
import {
  loginWithGoogle,
  loginWithFacebook,
  registerWithEmailPassword,
  sendRegisterOtp,
  verifyRegisterOtp,
} from '../../../services/auth.service';
import { useAuth } from '../../../hooks/useAuth';
import PasswordInput from '../PasswordInput/PasswordInput';
import type { AccountProfile } from '../../../context/AuthContext';
import './RegisterForm.css';

export interface RegisterFormProps {
  onSwitchToLogin: () => void;
  onSuccess: (profile?: AccountProfile) => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin, onSuccess }) => {
  const { refreshAccount } = useAuth();
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
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMsg, setOtpMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);

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
    try {
      await sendRegisterOtp(trimmed);
      setIsOtpSent(true);
      setOtpCountdown(60);
      setOtpMsg({ text: 'Mã xác thực 6 số đã được gửi tới Gmail. Vui lòng kiểm tra hộp thư.', isError: false });
    } catch (err: unknown) {
      setOtpMsg({
        text: err instanceof Error ? err.message : 'Không thể gửi mã xác thực. Vui lòng thử lại sau.',
        isError: true,
      });
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
      await verifyRegisterOtp(formData.email.trim(), trimmedCode);
      setIsEmailVerified(true);
      setOtpMsg({ text: 'Xác thực Gmail thành công!', isError: false });
    } catch (err: unknown) {
      setOtpMsg({
        text: err instanceof Error ? err.message : 'Mã xác thực không đúng hoặc đã hết hạn.',
        isError: true,
      });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      const profile = await loginWithGoogle();
      if (profile.id) {
        localStorage.removeItem('auth_token');
        onSuccess(await refreshAccount() || profile);
      }
    } catch (err: any) {
      setError(err.message || 'Đăng nhập Google thất bại.');
    }
  };

  const handleFacebookLogin = async () => {
    setError('');
    try {
      const profile = await loginWithFacebook();
      if (profile.id) {
        localStorage.removeItem('auth_token');
        onSuccess(await refreshAccount() || profile);
      }
    } catch (err: any) {
      setError(err.message || 'Đăng nhập Facebook thất bại.');
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

    if (!isEmailVerified) {
      setError('Vui lòng bấm Gửi mã OTP và xác thực Gmail trước khi hoàn tất đăng ký.');
      return;
    }

    if (formData.password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.');
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
        otp: otpCode.trim(),
      });
      onSuccess(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại.');
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
                if (isOtpSent) setIsOtpSent(false);
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
                {otpLoading ? 'Đang gửi...' : otpCountdown > 0 ? `Gửi lại (${otpCountdown}s)` : isOtpSent ? 'Gửi lại mã' : 'Gửi mã OTP'}
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
            placeholder="Ít nhất 6 ký tự"
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

        {error ? <p className="register-form-error">{error}</p> : null}

        <button type="submit" disabled={isSubmitting} className="register-form-submit">
          {isSubmitting ? 'Đang xử lý...' : 'Tạo Tài Khoản'}
        </button>

        <div className="register-form-divider">
          <span className="register-form-divider-line" />
          <span className="register-form-divider-text">HOẶC</span>
          <span className="register-form-divider-line" />
        </div>

        <div className="register-form-socials">
          <button type="button" onClick={handleGoogleLogin} className="btn-social-google">
            <span className="btn-social-icon-google">G</span>
            <span>Google</span>
          </button>
          <button type="button" onClick={handleFacebookLogin} className="btn-social-facebook">
            <span className="btn-social-icon-facebook">F</span>
            <span>Facebook</span>
          </button>
        </div>
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
