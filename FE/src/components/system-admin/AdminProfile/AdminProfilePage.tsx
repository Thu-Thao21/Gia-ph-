import '../../common/profile/Profile.css';
import React, { useState } from 'react';

export const AdminProfilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'info' | 'security'>('info');

  const tabs = [
    { key: 'info', label: 'Thông tin cá nhân' },
    { key: 'security', label: 'Bảo mật & Mật khẩu' }
  ];

  return (
    <div className="profile-layout" style={{ maxWidth: '900px', margin: '0 auto', padding: '24px' }}>
      
      {/* Header Banner */}
      <div className="profile-header-card">
        <div className="profile-header-top">
          <div className="profile-avatar-wrapper">
            <div className="profile-avatar-placeholder">Q</div>
          </div>

          <div className="profile-header-info">
            <h1 className="profile-name">
              Quản Trị Viên (Demo)
              <span className="profile-generation-badge">System Admin</span>
            </h1>

            <div className="profile-subtext">
              <span>admin@system.vn</span>
              <span>• 0999999999</span>
            </div>

            <div className="profile-header-meta">
              <div className="profile-meta-item">
                <strong>Quản trị viên cấp cao</strong>
              </div>
              <div className="profile-meta-item">
                Đang hoạt động
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="profile-tabs-bar">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`profile-tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key as any)}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div>
        {activeTab === 'info' && (
          <div className="profile-card">
            <h3 className="profile-card-title">Cập nhật thông tin quản trị</h3>
            <div className="profile-info-grid">
              
              <div className="profile-info-item">
                <span className="profile-info-label">Họ và tên</span>
                <input 
                  type="text" 
                  defaultValue="Quản Trị Viên (Demo)" 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', outline: 'none' }} 
                />
              </div>

              <div className="profile-info-item">
                <span className="profile-info-label">Email hệ thống</span>
                <input 
                  type="email" 
                  defaultValue="admin@system.vn" 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', outline: 'none' }} 
                />
              </div>

              <div className="profile-info-item">
                <span className="profile-info-label">Số điện thoại liên hệ</span>
                <input 
                  type="text" 
                  defaultValue="0999999999" 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', outline: 'none' }} 
                />
              </div>

            </div>
            
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
              <button style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Lưu thay đổi
              </button>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="profile-card">
            <h3 className="profile-card-title">Đổi mật khẩu bảo mật</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '400px' }}>
              <div className="profile-info-item">
                <span className="profile-info-label">Mật khẩu hiện tại</span>
                <input 
                  type="password" 
                  placeholder="Nhập mật khẩu cũ..." 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', outline: 'none' }} 
                />
              </div>
              
              <div className="profile-info-item">
                <span className="profile-info-label">Mật khẩu mới</span>
                <input 
                  type="password" 
                  placeholder="Nhập mật khẩu mới..." 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', outline: 'none' }} 
                />
              </div>

              <div className="profile-info-item">
                <span className="profile-info-label">Xác nhận mật khẩu mới</span>
                <input 
                  type="password" 
                  placeholder="Nhập lại mật khẩu mới..." 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', width: '100%', outline: 'none' }} 
                />
              </div>

              <div style={{ marginTop: '12px' }}>
                <button style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Cập nhật mật khẩu
                </button>
              </div>
            </div>

            <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px dashed #cbd5e1' }}>
               <h3 className="profile-card-title">Xác thực 2 bước (2FA)</h3>
               <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>Bảo vệ tài khoản quản trị viên cấp cao bằng mã xác thực phụ qua điện thoại.</p>
               <button style={{ padding: '8px 20px', background: 'transparent', color: '#2563eb', borderRadius: '8px', border: '1px solid #2563eb', cursor: 'pointer', fontWeight: 600 }}>
                  Bật xác thực 2 yếu tố
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminProfilePage;
