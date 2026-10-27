import React, { useState } from 'react';
import { PASSWORD_RESET_REQUESTED_MESSAGE, sendPasswordResetLink } from '../../../services/auth.service';
import './ForgotPasswordForm.css';

export interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPasswordResetLink(trimmedEmail);
      // Cùng một câu cho mọi email (có hay không có tài khoản): chống dò email.
      setSuccessMsg(PASSWORD_RESET_REQUESTED_MESSAGE);
    } catch (err: any) {
      // sendPasswordResetLink chỉ ném thông báo chung (mạng / quá nhiều lần), không nói gì về tài khoản.
      setError(err?.message || 'Không thể gửi yêu cầu đặt lại mật khẩu lúc này. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="forgot-form-card">
      <div className="forgot-form-glow-top" />

      <div className="forgot-form-header">
        <div className="forgot-form-badge">
          <span className="forgot-form-badge-dot" />
          <span className="forgot-form-badge-text">KHÔI PHỤC MẬT KHẨU</span>
        </div>
        <h1 className="forgot-form-title">Quên mật khẩu?</h1>
        <p className="forgot-form-subtitle">
          Nhập email để nhận liên kết đặt lại mật khẩu qua thư điện tử.
        </p>
      </div>

      <form onSubmit={handleResetRequest} className="forgot-form-body">
        <div className="forgot-form-group">
          <label className="forgot-form-label">Địa chỉ email tài khoản</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            autoComplete="email"
            className="forgot-form-input"
            data-testid="input-forgot-email"
          />
        </div>

        {error ? <p className="forgot-form-error">{error}</p> : null}
        {successMsg ? <p className="forgot-form-success">{successMsg}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="forgot-form-submit"
          data-testid="btn-forgot-submit"
        >
          {isSubmitting ? 'Đang gửi liên kết...' : 'Gửi liên kết đặt lại mật khẩu'}
        </button>
      </form>

      <div className="forgot-form-switch">
        Nhớ mật khẩu?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="btn-switch-link"
          data-testid="btn-back-to-login"
        >
          Quay lại Đăng nhập
        </button>
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
