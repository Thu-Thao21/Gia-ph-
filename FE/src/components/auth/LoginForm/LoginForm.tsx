import React, { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import PasswordInput from '../PasswordInput/PasswordInput';
import type { AccountProfile } from '../../../context/AuthContext';
import './LoginForm.css';

export interface LoginFormProps {
  onSwitchToRegister: () => void;
  onSwitchToForgotPassword?: () => void;
  onSuccess: (profile?: AccountProfile) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSwitchToRegister,
  onSwitchToForgotPassword,
  onSuccess,
}) => {
  const { login } = useAuth();
  const [formData, setFormData] = useState({ emailOrPhone: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const identifier = formData.emailOrPhone.trim();
    if (!identifier) {
      setError('Vui lòng nhập email hoặc tên đăng nhập.');
      return;
    }

    setIsSubmitting(true);

    try {
      const profile = await login({
        emailOrPhone: identifier,
        password: formData.password,
      });
      onSuccess(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-form-card">
      <div className="login-form-glow-top" />

      <div className="login-form-header">
        <div className="login-form-badge">
          <span className="login-form-badge-dot" />
          <span className="login-form-badge-text">ĐĂNG NHẬP HỆ THỐNG</span>
        </div>
        <h1 className="login-form-title">Chào mừng bạn trở lại!</h1>
        <p className="login-form-subtitle">Đăng nhập bằng tài khoản của bạn. Hệ thống sẽ tự xác định quyền truy cập.</p>
      </div>

      <form onSubmit={handleSubmit} className="login-form-body">
        <div className="login-form-group">
          <label className="login-form-label" htmlFor="login-identifier">Email hoặc Tên đăng nhập *</label>
          <input
            id="login-identifier"
            type="text"
            name="emailOrPhone"
            value={formData.emailOrPhone}
            onChange={handleChange}
            placeholder="VD: nguyenvana@gmail.com hoặc tên đăng nhập"
            autoComplete="username"
            required
            className="login-form-input"
            data-testid="input-login-account"
          />
        </div>

        <div className="login-form-group">
          <div className="login-form-label-row">
            <label className="login-form-label">Mật khẩu</label>
            {onSwitchToForgotPassword && (
              <button
                type="button"
                onClick={onSwitchToForgotPassword}
                className="btn-switch-link"
              >
                Quên mật khẩu?
              </button>
            )}
          </div>
          <PasswordInput
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Nhập mật khẩu"
            autoComplete="current-password"
            required
            className="login-form-input"
            data-testid="input-login-password"
          />
        </div>

        {error ? <p className="login-form-error">{error}</p> : null}

        <button type="submit" disabled={isSubmitting} className="login-form-submit" data-testid="btn-login">
          {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>

        <p className="login-form-footer-note">
          Quyền truy cập được xác định theo vai trò đã cấp cho tài khoản.
        </p>
        {/* Nhóm chốt (Mốc M1): chỉ đăng nhập bằng email/tên đăng nhập + mật khẩu (POST /auth/login). */}
      </form>

      <div className="login-form-switch">
        Chưa có tài khoản?{' '}
        <button type="button" onClick={onSwitchToRegister} className="btn-switch-link">
          Đăng ký ngay
        </button>
      </div>
    </div>
  );
};

export default LoginForm;
