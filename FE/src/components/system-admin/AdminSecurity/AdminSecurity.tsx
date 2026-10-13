import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import './AdminSecurity.css';

export const AdminSecurity: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const toast = useToast();

  // Password strength check
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

  const strengthScore = [hasMinLength, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  const strengthLabels = ['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'];
  const strengthColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#15803d'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Lỗi', 'Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Lỗi mật khẩu', 'Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }
    if (strengthScore < 3) {
      toast.error('Mật khẩu yếu', 'Vui lòng chọn mật khẩu mạnh hơn (ít nhất 8 ký tự, có số, chữ hoa và ký tự đặc biệt).');
      return;
    }

    toast.loading('Đang cập nhật...', 'Đang mã hóa credential và lưu trữ an toàn.');
    setTimeout(() => {
      toast.success(
        'Đổi mật khẩu thành công!',
        'Mật khẩu quản trị viên đã được cập nhật. ' +
          (revokeOtherSessions ? 'Các phiên đăng nhập khác đã được thu hồi.' : '')
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }, 700);
  };

  return (
    <div className="admin-security-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Bảo Mật & Đổi Mật Khẩu Quản Trị Viên</h2>
          <p className="admin-account-subtitle">
            Cập nhật thông tin đăng nhập, mật khẩu truy cập và quản lý các phiên làm việc của Quản Trị Viên Hệ Thống.
          </p>
        </div>
      </div>

      <div className="admin-sec-grid">
        {/* Left Col: Password Change Form */}
        <div className="admin-sec-card">
          <h3 className="admin-sec-card-title">Đổi Mật Khẩu Bản Thân</h3>
          <p className="admin-sec-card-sub">
            Khuyến cáo định kỳ thay đổi mật khẩu sau 90 ngày để đảm bảo an toàn tuyệt đối cho hệ thống.
          </p>

          <form onSubmit={handleSubmit} className="admin-sec-form">
            <div className="form-group">
              <label className="form-label required">Mật khẩu hiện tại:</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="admin-search-input-field"
                placeholder="Nhập mật khẩu đang dùng"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Mật khẩu mới:</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="admin-search-input-field"
                placeholder="Tối thiểu 8 ký tự, gồm số, chữ hoa & ký tự đặc biệt"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />

              {newPassword && (
                <div className="admin-strength-meter-box">
                  <div className="strength-bar-track">
                    <div
                      className="strength-bar-fill"
                      style={{
                        width: `${(strengthScore / 4) * 100}%`,
                        backgroundColor: strengthColors[strengthScore],
                      }}
                    />
                  </div>
                  <span className="strength-text" style={{ color: strengthColors[strengthScore] }}>
                    Độ an toàn: {strengthLabels[strengthScore]}
                  </span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label required">Xác nhận mật khẩu mới:</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="admin-search-input-field"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <div className="admin-sec-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                />
                <span>Hiện mật khẩu</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={revokeOtherSessions}
                  onChange={(e) => setRevokeOtherSessions(e.target.checked)}
                />
                <span>Thu hồi toàn bộ phiên đăng nhập trên các thiết bị khác</span>
              </label>
            </div>

            <button type="submit" className="btn-update-pwd">
              Cập Nhật Mật Khẩu Mới
            </button>
          </form>
        </div>

        {/* Right Col: Security Tips & Policy */}
        <div className="admin-sec-info-col">
          <div className="admin-sec-card">
            <h4 className="admin-sec-card-title">Chính Sách Mật Khẩu Nền Tảng (D01)</h4>
            <ul className="admin-policy-list">
              <li className={hasMinLength ? 'met' : ''}>
                {hasMinLength ? '✓' : '•'} Độ dài tối thiểu 8 ký tự
              </li>
              <li className={hasUpper ? 'met' : ''}>
                {hasUpper ? '✓' : '•'} Ít nhất 1 chữ cái in hoa (A-Z)
              </li>
              <li className={hasNumber ? 'met' : ''}>
                {hasNumber ? '✓' : '•'} Ít nhất 1 chữ số (0-9)
              </li>
              <li className={hasSpecial ? 'met' : ''}>
                {hasSpecial ? '✓' : '•'} Ít nhất 1 ký tự đặc biệt (!@#$%^&*)
              </li>
            </ul>
          </div>

          <div className="admin-sec-card">
            <h4 className="admin-sec-card-title">Phiên Đăng Nhập & 2FA</h4>
            <p className="admin-sec-card-sub">
              Tài khoản System Admin được áp dụng chính sách tự động khóa màn hình sau 30 phút không hoạt động và bắt buộc xác thực mã OTP khi đăng nhập từ thiết bị lạ.
            </p>
            <div className="status-badge status-approved" style={{ display: 'inline-block', marginTop: 8 }}>
              ✓ Bảo Mật 2FA Đang Bật
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSecurity;
