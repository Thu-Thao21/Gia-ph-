import './ProfilePage.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';

export const ProfilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'info' | 'security'>('info');

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Hồ sơ cá nhân</h2>
          <p className="admin-account-subtitle">Quản lý thông tin cá nhân và bảo mật tài khoản của bạn.</p>
        </div>
      </div>

      <div className="profile-page-content">
        <div className="profile-grid">
          {/* Sidebar */}
          <div className="profile-sidebar">
            <div className="profile-user-info">
              <div className="profile-avatar">
                T
              </div>
              <h3 className="profile-name">Trưởng tộc Admin</h3>
              <p className="profile-role">Quản trị viên cấp cao</p>
            </div>

            <nav className="profile-nav">
              <button 
                onClick={() => setActiveTab('info')}
                className={`profile-nav-btn ${activeTab === 'info' ? 'nav-active' : 'nav-inactive'}`}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                Thông tin chung
              </button>
              <button 
                onClick={() => setActiveTab('security')}
                className={`profile-nav-btn ${activeTab === 'security' ? 'nav-active' : 'nav-inactive'}`}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                Bảo mật & Mật khẩu
              </button>
            </nav>
          </div>

          {/* Main Content */}
          <div className="profile-main">
            {activeTab === 'info' ? (
              <div className="animate-fade-in">
                <h3 className="profile-section-title">Thông tin cá nhân</h3>
                <div className="profile-form-grid">
                  <div className="form-group-admin">
                    <label className="form-label-admin">Họ và tên</label>
                    <input type="text" className="form-input-admin" defaultValue="Trưởng tộc Admin" />
                  </div>
                  <div className="form-group-admin">
                    <label className="form-label-admin">Email</label>
                    <input type="email" className="form-input-admin" defaultValue="admin@giaphaviet.vn" />
                  </div>
                  <div className="form-group-admin">
                    <label className="form-label-admin">Số điện thoại</label>
                    <input type="text" className="form-input-admin" defaultValue="0987654321" />
                  </div>
                  <div className="form-group-admin">
                    <label className="form-label-admin">Ngày sinh</label>
                    <input type="date" className="form-input-admin" defaultValue="1970-01-01" />
                  </div>
                  <div className="profile-form-full form-group-admin col-span-2">
                    <label className="form-label-admin">Địa chỉ</label>
                    <input type="text" className="form-input-admin" defaultValue="Hà Nội, Việt Nam" />
                  </div>
                </div>
                <div className="profile-form-actions">
                  <button className="profile-btn-save admin-btn-primary px-8">Lưu thay đổi</button>
                </div>
              </div>
            ) : (
              <div className="animate-fade-in">
                <h3 className="profile-section-title">Đổi mật khẩu</h3>
                <div className="profile-form-col">
                  <div className="form-group-admin">
                    <label className="form-label-admin">Mật khẩu hiện tại</label>
                    <input type="password" className="form-input-admin" placeholder="Nhập mật khẩu hiện tại" />
                  </div>
                  <div className="form-group-admin">
                    <label className="form-label-admin">Mật khẩu mới</label>
                    <input type="password" className="form-input-admin" placeholder="Nhập mật khẩu mới" />
                  </div>
                  <div className="form-group-admin">
                    <label className="form-label-admin">Xác nhận mật khẩu mới</label>
                    <input type="password" className="form-input-admin" placeholder="Nhập lại mật khẩu mới" />
                  </div>
                  <div className="mt-6">
                    <button className="admin-btn-primary">Cập nhật mật khẩu</button>
                  </div>
                </div>

                <div className="profile-security-section">
                  <h3 className="profile-section-title">Xác thực 2 yếu tố (2FA)</h3>
                  <p className="profile-section-desc">Bảo vệ tài khoản của bạn bằng cách yêu cầu mã xác thực khi đăng nhập.</p>
                  <button className="admin-btn-secondary">Bật xác thực 2 yếu tố</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
