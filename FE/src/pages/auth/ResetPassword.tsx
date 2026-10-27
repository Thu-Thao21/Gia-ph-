import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLanding from '../../components/auth/AuthLanding';
import PasswordInput from '../../components/auth/PasswordInput/PasswordInput';
import '../../components/auth/ForgotPasswordForm/ForgotPasswordForm.css';
import loginBackground from '../../assets/nenan.png';
import { confirmPasswordReset, PasswordResetError, passwordPolicyError } from '../../services/auth.service';

/** Thông báo trang /login hiển thị sau khi đặt lại mật khẩu thành công. */
export const PASSWORD_RESET_DONE_NOTICE =
  'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới (mọi phiên đăng nhập cũ đã bị đăng xuất).';

/**
 * Quên mật khẩu, bước 2 (Mốc M4). Liên kết trong email Firebase trỏ về đây
 * (Firebase Console > Authentication > Templates > Password reset > Customize action URL):
 *   /reset-password?mode=resetPassword&oobCode=...&apiKey=...&lang=...
 * Chỉ dùng mode và oobCode; mật khẩu mới được gửi cho BE, BE đổi mật khẩu trong DB.
 */
const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const oobCode = params.get('oobCode') || '';
  const mode = params.get('mode');
  const linkProblem = useMemo(() => {
    if (!oobCode) return 'Liên kết đặt lại mật khẩu không hợp lệ (thiếu mã xác nhận).';
    if (mode && mode !== 'resetPassword') return 'Liên kết này không dùng để đặt lại mật khẩu.';
    return null;
  }, [oobCode, mode]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(linkProblem);
  const [deadLink, setDeadLink] = useState(Boolean(linkProblem));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deadLink) return;
    setError(null);
    const policyError = passwordPolicyError(password);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (password !== confirm) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setIsSubmitting(true);
    try {
      await confirmPasswordReset(oobCode, password);
      navigate('/login', { replace: true, state: { notice: PASSWORD_RESET_DONE_NOTICE } });
    } catch (err) {
      const kind = err instanceof PasswordResetError ? err.kind : 'other';
      if (kind === 'expired' || kind === 'invalid') setDeadLink(true);
      setError(err instanceof Error ? err.message : 'Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLanding
      title="Đặt lại mật khẩu"
      subtitle="Tạo mật khẩu mới cho tài khoản gia phả của bạn."
      backgroundImage={loginBackground}
    >
      <div className="forgot-form-card">
        <div className="forgot-form-glow-top" />
        <div className="forgot-form-header">
          <div className="forgot-form-badge">
            <span className="forgot-form-badge-dot" />
            <span className="forgot-form-badge-text">MẬT KHẨU MỚI</span>
          </div>
          <h1 className="forgot-form-title">Đặt lại mật khẩu</h1>
          <p className="forgot-form-subtitle">
            Ít nhất 8 ký tự, có chữ hoa, chữ thường và chữ số.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="forgot-form-body">
          <div className="forgot-form-group">
            <label className="forgot-form-label">Mật khẩu mới</label>
            <PasswordInput
              name="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới"
              autoComplete="new-password"
              required
              className="forgot-form-input"
              data-testid="input-reset-password"
            />
          </div>
          <div className="forgot-form-group">
            <label className="forgot-form-label">Xác nhận mật khẩu mới</label>
            <PasswordInput
              name="confirm-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              required
              className="forgot-form-input"
              data-testid="input-reset-password-confirm"
            />
          </div>

          {error ? (
            <p className="forgot-form-error" role="alert">
              {error}
              {deadLink ? (
                <>
                  {' '}
                  <Link to="/forgot-password">Yêu cầu liên kết mới</Link>
                </>
              ) : null}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || deadLink}
            className="forgot-form-submit"
            data-testid="btn-reset-submit"
          >
            {isSubmitting ? 'Đang cập nhật...' : 'Đặt lại mật khẩu'}
          </button>
        </form>

        <div className="forgot-form-switch">
          <Link to="/login" className="btn-switch-link">
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </AuthLanding>
  );
};

export default ResetPasswordPage;
