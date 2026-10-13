import '../../clan-admin/Settings/ClanAccountMgmt.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';

export const AdminSettingsPage: React.FC = () => {
  const [notificationMode, setNotificationMode] = useState<'all' | 'important'>('all');
  const [msg, setMsg] = useState('');

  const handleSaveSettings = () => {
    setMsg('Đã lưu cấu hình hệ thống.');
    setTimeout(() => setMsg(''), 3000);
  };

  const headerActions = (
    <button className="admin-btn-primary" onClick={handleSaveSettings}>
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
      Lưu Cài Đặt
    </button>
  );

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Cài Đặt Hệ Thống Tùy Chọn</h2>
          <p className="admin-account-subtitle">Cấu hình hiển thị và thông báo dành riêng cho tài khoản quản trị.</p>
        </div>
        <div className="admin-account-controls">
          {headerActions}
        </div>
      </div>

      {msg && (
        <div className="clan-account-msg-box mb-4 p-4 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 animate-fade-in flex items-center gap-2">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"></path></svg>
          {msg}
        </div>
      )}

      <div className="clan-account-content">
        <div className="clan-account-layout-grid">
          {/* Left Col: Settings */}
          <div className="clan-account-left-col">
            <div className="clan-account-card">
              <div className="clan-account-card-header">
                <h3 className="clan-account-card-title">Tùy Chọn Thông Báo</h3>
              </div>
              <div className="clan-account-card-body">
                <div className="clan-account-radio-group">
                  <input 
                    type="radio" 
                    id="notif_all" 
                    name="notif" 
                    checked={notificationMode === 'all'} 
                    onChange={() => setNotificationMode('all')}
                    className="clan-account-radio-input"
                  />
                  <label htmlFor="notif_all" className="clan-account-radio-label">
                    <strong className="clan-account-radio-title">Nhận tất cả thông báo</strong>
                    <p className="clan-account-radio-desc">Gửi thông báo về mọi hoạt động trên toàn hệ thống (Đăng ký mới, thanh toán, v.v.).</p>
                  </label>
                </div>
                
                <div className="clan-account-radio-group-mt">
                  <input 
                    type="radio" 
                    id="notif_important" 
                    name="notif" 
                    checked={notificationMode === 'important'} 
                    onChange={() => setNotificationMode('important')}
                    className="clan-account-radio-input"
                  />
                  <label htmlFor="notif_important" className="clan-account-radio-label">
                    <strong className="clan-account-radio-title">Chỉ thông báo quan trọng</strong>
                    <p className="clan-account-radio-desc">Chỉ hiển thị thông báo về lỗi hệ thống, thay đổi bảo mật hoặc gói dịch vụ hết hạn.</p>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
