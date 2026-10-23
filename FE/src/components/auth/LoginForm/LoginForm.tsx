import React, { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import PasswordInput from '../PasswordInput/PasswordInput';
import type { AccountProfile } from '../../../context/AuthContext';
import './LoginForm.css';

import { loginWithGoogle, loginWithFacebook } from '../../../services/auth.service';

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
  const { login, refreshAccount } = useAuth();
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
    setIsSubmitting(true);

    try {
      const profile = await login({
        emailOrPhone: formData.emailOrPhone,
        password: formData.password,
      });
      onSuccess(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const profile = await loginWithGoogle();
      if (profile.id) {
        localStorage.removeItem('auth_token');
        onSuccess(await refreshAccount() || profile);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập Google thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFacebookLogin = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const profile = await loginWithFacebook();
      if (profile.id) {
        localStorage.removeItem('auth_token');
        onSuccess(await refreshAccount() || profile);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập Facebook thất bại.');
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
          <label className="login-form-label" htmlFor="login-identifier">Tên đăng nhập, email hoặc số điện thoại</label>
          <input
            id="login-identifier"
            type="text"
            name="emailOrPhone"
            value={formData.emailOrPhone}
            onChange={handleChange}
            placeholder="Tên đăng nhập, email hoặc số điện thoại"
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

        <div className="login-form-divider">
          <span className="login-form-divider-line" />
          <span className="login-form-divider-text">HOẶC</span>
          <span className="login-form-divider-line" />
        </div>

        <div className="login-form-socials">
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
