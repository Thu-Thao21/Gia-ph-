import React, { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import './AdminProfileView.css';

interface AdminProfileViewProps {
  onNavigateTab?: (tabId: string) => void;
}

export const AdminProfileView: React.FC<AdminProfileViewProps> = ({ onNavigateTab }) => {
  const { account, changePassword, updateProfile, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [pwdMessage, setPwdMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Edit Profile States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const displayName = account?.display_name || account?.username || 'Thu Thảo';
  const username = account?.username || 'admin';
  const email = account?.email || 'admin@giaphaviet.vn';
  const phone = account?.phone_e164 || 'Chưa thiết lập';
  const accountId = account?.id || 'sa-00000000-0000-0000-0000-000000000001';
  const primaryRole = account?.primary_role?.toUpperCase() || 'SYSTEM_ADMIN';
  const status = account?.status || 'ACTIVE';

  const [editDisplayName, setEditDisplayName] = useState(displayName);
  const [editPhone, setEditPhone] = useState(account?.phone_e164 || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleOpenEdit = () => {
    setEditDisplayName(displayName);
    setEditPhone(phone === 'Chưa thiết lập' ? '' : phone);
    setProfileMessage(null);
    setIsEditingProfile(true);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(accountId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2500);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);

    if (!editDisplayName.trim()) {
      setProfileMessage({ type: 'error', text: 'Tên hiển thị không được để trống.' });
      return;
    }

    try {
      setIsSavingProfile(true);
      await updateProfile({
        displayName: editDisplayName.trim(),
        phone: editPhone.trim(),
      });
      setProfileMessage({ type: 'success', text: 'Cập nhật thông tin hồ sơ Admin thành công!' });
      setIsEditingProfile(false);
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Không thể cập nhật hồ sơ. Vui lòng thử lại.';
      setProfileMessage({ type: 'error', text: msg });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMessage(null);

    if (!currentPassword) {
      setPwdMessage({ type: 'error', text: 'Vui lòng nhập mật khẩu hiện tại.' });
      return;
    }
    if (newPassword.length < 6) {
      setPwdMessage({ type: 'error', text: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMessage({ type: 'error', text: 'Mật khẩu xác nhận không khớp.' });
      return;
    }

    try {
      setIsChangingPassword(true);
      await changePassword(currentPassword, newPassword);
      setPwdMessage({ type: 'success', text: 'Đổi mật khẩu tài khoản Admin thành công! Phiên bảo mật đã được làm mới.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại.';
      setPwdMessage({ type: 'error', text: msg });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="admin-profile-container">
      {/* Page Header */}
      <div className="admin-profile-page-header">
        <div>
          <span className="admin-profile-badge">TÀI KHOẢN HỆ THỐNG</span>
          <h1 className="admin-profile-title">Hồ Sơ Của Tôi (System Admin)</h1>
          <p className="admin-profile-subtitle">
            Quản lý thông tin định danh cá nhân, đặc quyền quản trị nền tảng và thiết lập bảo mật tài khoản.
          </p>
        </div>
      </div>

      <div className="admin-profile-grid">
        {/* Left Column: Admin Identity Card */}
        <div className="admin-profile-left">
          <div className="admin-card identity-card">
            {profileMessage && (
              <div className={`admin-pwd-alert ${profileMessage.type}`} style={{ marginBottom: '18px' }}>
                {profileMessage.type === 'success' ? '✓ ' : '! '}
                {profileMessage.text}
              </div>
            )}

            <div className="admin-avatar-section">
              <div className="admin-avatar-bubble">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="admin-identity-info">
                <h2 className="admin-name">{displayName}</h2>
                <div className="admin-role-pill">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Quản Trị Viên Hệ Thống (System Admin)
                </div>
                <div className="admin-status-indicator">
                  <span className="status-dot-active" />
                  <span>Trạng thái: <strong>{status}</strong></span>
                </div>
              </div>
            </div>

            <div className="admin-card-divider" />

            {/* Basic Info Rows */}
            <div className="admin-info-rows">
              <div className="admin-info-row">
                <span className="info-label">Tên đăng nhập:</span>
                <span className="info-value">@{username}</span>
              </div>
              <div className="admin-info-row">
                <span className="info-label">Email quản trị:</span>
                <div className="info-value-group">
                  <span className="info-value">{email}</span>
                  <span className="info-tag-verified">Đã xác minh</span>
                </div>
              </div>
              <div className="admin-info-row">
                <span className="info-label">Số điện thoại:</span>
                <div className="info-value-group">
                  <span className="info-value">{phone}</span>
                </div>
              </div>
              <div className="admin-info-row">
                <span className="info-label">Cấp bậc hệ thống:</span>
                <span className="info-value role-highlight">{primaryRole}</span>
              </div>
              <div className="admin-info-row">
                <span className="info-label">Mã định danh (ID):</span>
                <div className="info-value-group">
                  <code className="admin-uuid">{accountId}</code>
                  <button type="button" className="btn-copy-id" onClick={handleCopyId}>
                    {copiedId ? '✓ Đã chép' : 'Sao chép'}
                  </button>
                </div>
              </div>
            </div>

            <div className="admin-card-divider" />

            {/* Quick Actions */}
            <div className="admin-quick-actions">
              <button
                type="button"
                className="btn-edit-profile-action"
                onClick={handleOpenEdit}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Chỉnh sửa hồ sơ của tôi
              </button>

              {onNavigateTab && (
                <button
                  type="button"
                  className="btn-quick-nav"
                  onClick={() => onNavigateTab('admin-permissions')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Quản lý tài khoản toàn hệ thống
                </button>
              )}
              <button
                type="button"
                className="btn-admin-logout"
                onClick={() => logout()}
              >
                Đăng xuất tài khoản an toàn
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Privileges & Password Change */}
        <div className="admin-profile-right">
          {/* Admin Privileges Box */}
          <div className="admin-card privileges-card">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Đặc Quyền Quản Trị Hệ Thống (System Privileges)
            </h3>
            <p className="section-desc">
              Tài khoản này nắm giữ vai trò cao nhất, được miễn trừ mọi giới hạn dòng họ và có toàn quyền điều hành nền tảng:
            </p>

            <div className="privilege-badges-grid">
              <div className="privilege-item">
                <div className="privilege-icon">✓</div>
                <div>
                  <strong>Toàn quyền truy cập mọi dòng họ</strong>
                  <span>Xem, quản lý và duyệt mọi gia phả trên hệ thống không bị hạn chế bởi Clan ID.</span>
                </div>
              </div>
              <div className="privilege-item">
                <div className="privilege-icon">✓</div>
                <div>
                  <strong>Phê duyệt & Cấp quyền Trưởng tộc (Owner)</strong>
                  <span>Thẩm định hồ sơ Business, cấp quyền tạo lập và quản trị dòng họ mới.</span>
                </div>
              </div>
              <div className="privilege-item">
                <div className="privilege-icon">✓</div>
                <div>
                  <strong>Quản lý người dùng & Khóa tài khoản</strong>
                  <span>Phân bổ vai trò (Admin / Member), khóa các tài khoản vi phạm quy chế.</span>
                </div>
              </div>
              <div className="privilege-item">
                <div className="privilege-icon">✓</div>
                <div>
                  <strong>Giám sát Nhật ký An ninh (Audit Logs)</strong>
                  <span>Truy vết mọi hành vi đăng nhập, thay đổi cấu trúc cây gia phả và liên kết thông gia.</span>
                </div>
              </div>
              <div className="privilege-item">
                <div className="privilege-icon">✓</div>
                <div>
                  <strong>Sao lưu & Phục hồi Thảm họa</strong>
                  <span>Quyền xuất và nạp dữ liệu bảo lưu PostgreSQL toàn hệ thống định kỳ.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="admin-card password-card">
            <h3 className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Bảo Mật & Đổi Mật Khẩu
            </h3>
            <p className="section-desc">
              Thay đổi mật khẩu đăng nhập định kỳ để đảm bảo an toàn tuyệt đối cho tài khoản Quản trị viên.
            </p>

            {pwdMessage && (
              <div className={`admin-pwd-alert ${pwdMessage.type}`}>
                {pwdMessage.type === 'success' ? '✓ ' : '! '}
                {pwdMessage.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="admin-pwd-form">
              <div className="form-group">
                <label htmlFor="admin-curr-pwd">Mật khẩu hiện tại *</label>
                <input
                  id="admin-curr-pwd"
                  type="password"
                  placeholder="Nhập mật khẩu hiện tại"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="admin-new-pwd">Mật khẩu mới *</label>
                  <input
                    id="admin-new-pwd"
                    type="password"
                    placeholder="Tối thiểu 6 ký tự"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="admin-conf-pwd">Xác nhận mật khẩu mới *</label>
                  <input
                    id="admin-conf-pwd"
                    type="password"
                    placeholder="Nhập lại mật khẩu mới"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-save-pwd"
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? 'Đang cập nhật...' : 'Cập nhật Mật khẩu Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditingProfile && (
        <div className="admin-edit-modal-backdrop" onClick={() => setIsEditingProfile(false)}>
          <div className="admin-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-edit-modal-header">
              <div className="modal-title-group">
                <div className="modal-icon-badge">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="admin-edit-modal-title">Chỉnh Sửa Hồ Sơ Quản Trị Viên</h3>
                  <p className="admin-edit-modal-sub">Cập nhật thông tin hiển thị và số điện thoại liên lạc của bạn</p>
                </div>
              </div>
              <button
                type="button"
                className="admin-edit-modal-close"
                onClick={() => setIsEditingProfile(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="admin-edit-form">
              <div className="form-group">
                <label htmlFor="edit-admin-display-name">Tên hiển thị (Họ và tên) *</label>
                <input
                  id="edit-admin-display-name"
                  type="text"
                  placeholder="Nhập họ và tên hiển thị..."
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-admin-phone">Số điện thoại liên hệ</label>
                <input
                  id="edit-admin-phone"
                  type="tel"
                  placeholder="Ví dụ: 0912345678"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-admin-email">Email quản trị chính thức</label>
                <input
                  id="edit-admin-email"
                  type="email"
                  value={email}
                  disabled
                  className="input-disabled"
                />
                <span className="field-hint">Email dùng để đăng nhập và nhận thông báo bảo mật hệ thống (cố định).</span>
              </div>

              <div className="form-group">
                <label htmlFor="edit-admin-username">Tên đăng nhập hệ thống</label>
                <input
                  id="edit-admin-username"
                  type="text"
                  value={'@' + username}
                  disabled
                  className="input-disabled"
                />
              </div>

              <div className="admin-edit-modal-footer">
                <button
                  type="button"
                  className="btn-cancel-edit"
                  onClick={() => setIsEditingProfile(false)}
                  disabled={isSavingProfile}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn-save-profile"
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? 'Đang lưu thay đổi...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProfileView;
