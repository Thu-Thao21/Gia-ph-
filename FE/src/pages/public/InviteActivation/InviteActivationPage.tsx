import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PublicLayout } from '../../../components/guest/PublicLayout';
import { ROUTES } from '../../../config/routes';
import './InviteActivationPage.css';

export const InviteActivationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCode = searchParams.get('code') || '';

  const [inviteCode, setInviteCode] = useState(urlCode);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isValidating, setIsValidating] = useState(false);
  const [validatedData, setValidatedData] = useState<{
    valid: boolean;
    memberName?: string;
    familyName?: string;
    errorState?: 'invalid' | 'expired' | 'used';
  } | null>(null);

  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (urlCode) {
      handleValidateCode(urlCode);
    }
  }, [urlCode]);

  const handleValidateCode = (codeToVerify?: string) => {
    const code = codeToVerify || inviteCode;
    if (!code.trim()) return;

    setIsValidating(true);
    setErrorMsg('');

    setTimeout(() => {
      setIsValidating(false);
      const upper = code.toUpperCase();
      if (upper === 'EXPIRED') {
        setValidatedData({ valid: false, errorState: 'expired' });
      } else if (upper === 'USED') {
        setValidatedData({ valid: false, errorState: 'used' });
      } else if (upper.length >= 6) {
        setValidatedData({
          valid: true,
          memberName: 'Nguyễn Văn A',
          familyName: 'Dòng Họ Nguyễn Chi 1',
        });
      } else {
        setValidatedData({ valid: false, errorState: 'invalid' });
      }
    }, 800);
  };

  const handleActivateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setErrorMsg('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSuccess(true);
  };

  return (
    <PublicLayout>
      <div className="act-container">
        <div className="act-header">
          <span className="act-badge">KÍCH HOẠT TÀI KHOẢN GIA THÀNH VIÊN</span>
          <h1 className="act-title">Kích Hoạt Mã / Link Lời Mời</h1>
          <p className="act-subtitle">
            Nhập mã kích hoạt được Trưởng tộc / Hội đồng gia tộc cấp để xác minh hồ sơ và thiết lập mật khẩu cá nhân.
          </p>
        </div>

        {isSuccess ? (
          <div className="act-card success">
            <div className="act-icon">🎉</div>
            <h2>Kích Hoạt Tài Khoản Thành Công!</h2>
            <p>
              Tài khoản của bạn đã được liên kết chính thức với hồ sơ <strong>{validatedData?.memberName}</strong> thuộc <strong>{validatedData?.familyName}</strong>.
            </p>

            <button className="pub-btn-primary" onClick={() => navigate(ROUTES.LOGIN)}>
              Đăng Nhập Ngay ➔
            </button>
          </div>
        ) : (
          <div className="act-card">
            {!validatedData?.valid ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleValidateCode();
                }}
                className="act-form"
              >
                <div className="act-field">
                  <label className="act-label">Mã lời mời / Mã kích hoạt (6-12 ký tự) *</label>
                  <input
                    type="text"
                    className="act-input"
                    placeholder="VD: INV-2026-99"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required
                  />
                </div>

                {validatedData && !validatedData.valid && (
                  <div className="act-error-alert">
                    {validatedData.errorState === 'invalid' && '❌ Mã kích hoạt không hợp lệ hoặc không tồn tại.'}
                    {validatedData.errorState === 'expired' && '⌛ Mã lời mời đã hết hạn sử dụng. Vui lòng xin mã mới từ Trưởng tộc.'}
                    {validatedData.errorState === 'used' && '⚠️ Mã kích hoạt này đã được sử dụng trước đó.'}
                  </div>
                )}

                <button type="submit" className="act-submit-btn" disabled={isValidating}>
                  {isValidating ? 'Đang kiểm tra...' : 'Xác Minh Mã Lời Mời ➔'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleActivateSubmit} className="act-form">
                <div className="bound-person-info">
                  <h4>✓ Hồ sơ gia tộc gắn kết:</h4>
                  <p>Họ tên: <strong>{validatedData.memberName}</strong> — {validatedData.familyName}</p>
                </div>

                {errorMsg && <div className="act-error-alert">{errorMsg}</div>}

                <div className="act-field">
                  <label className="act-label">Thiết lập mật khẩu cá nhân *</label>
                  <input
                    type="password"
                    className="act-input"
                    placeholder="Tối thiểu 6 ký tự"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="act-field">
                  <label className="act-label">Xác nhận mật khẩu *</label>
                  <input
                    type="password"
                    className="act-input"
                    placeholder="Nhập lại mật khẩu"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="act-submit-btn">
                  Hoàn Tất Kích Hoạt & Tạo Mật Khẩu
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </PublicLayout>
  );
};

export default InviteActivationPage;
