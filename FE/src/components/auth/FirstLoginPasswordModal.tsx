import React, { useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import './FirstLoginPasswordModal.css';

interface FirstLoginPasswordModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
}

export const FirstLoginPasswordModal: React.FC<FirstLoginPasswordModalProps> = ({
  isOpen,
  onSuccess,
  onCancel,
}) => {
  const { changePassword } = useAuthContext();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!currentPassword) {
      setErrorMsg('Vui lòng nhập mật khẩu tạm thời hiện tại.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMsg('Mật khẩu mới không được trùng với mật khẩu tạm thời.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setLoading(false);
      onSuccess();
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err?.message || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại mật khẩu hiện tại.');
    }
  };

  return (
    <div className="first-pwd-modal-overlay">
      <div className="first-pwd-modal-card">
        <div className="first-pwd-header">
          <div className="first-pwd-icon">🔒</div>
          <h2 className="first-pwd-title">Yêu cầu đổi mật khẩu lần đầu</h2>
          <p className="first-pwd-subtitle">
            Tài khoản của bạn đang sử dụng mật khẩu tạm thời do Quản trị viên cấp.
            Vì lý do bảo mật, vui lòng thiết lập mật khẩu mới trước khi tiếp tục.
          </p>
        </div>

        {errorMsg && <div className="first-pwd-error-alert">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="first-pwd-form">
          <div className="first-pwd-field-group">
            <label className="first-pwd-label">Mật khẩu tạm thời hiện tại *</label>
            <input
              type="password"
              className="first-pwd-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Nhập mật khẩu được cấp"
              required
            />
          </div>

          <div className="first-pwd-field-group">
            <label className="first-pwd-label">Mật khẩu mới *</label>
            <input
              type="password"
              className="first-pwd-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              required
            />
          </div>

          <div className="first-pwd-field-group">
            <label className="first-pwd-label">Xác nhận mật khẩu mới *</label>
            <input
              type="password"
              className="first-pwd-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              required
            />
          </div>

          <div className="first-pwd-action-row">
            {onCancel && (
              <button
                type="button"
                className="first-pwd-cancel-btn"
                onClick={onCancel}
                disabled={loading}
              >
                Đăng xuất
              </button>
            )}
            <button type="submit" className="first-pwd-submit-btn" disabled={loading}>
              {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FirstLoginPasswordModal;
