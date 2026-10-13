import './ClanAccountMgmt.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';

interface Delegate {
  id: string;
  name: string;
  role: string;
  permissions: string[];
}

export const ClanAccountMgmt: React.FC = () => {
  const [privacyMode, setPrivacyMode] = useState<'public' | 'private'>('private');
  const [msg, setMsg] = useState('');

  const [delegates, setDelegates] = useState<Delegate[]>([]);

  const [isDelegateModalOpen, setIsDelegateModalOpen] = useState(false);

  const handleSaveSettings = () => {
    setMsg('Đã lưu cấu hình dòng họ.');
    setTimeout(() => setMsg(''), 3000);
  };

  const handleTransferOwnership = () => {
    if (window.confirm('CẢNH BÁO: Việc chuyển giao quyền Trưởng Tộc sẽ khiến bạn mất quyền quản trị cao nhất. Bạn có chắc chắn?')) {
      alert('Chức năng chuyển giao đang được phát triển.');
    }
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
          <h2 className="admin-account-title">Cài Đặt Dòng Họ & Phân Quyền</h2>
          <p className="admin-account-subtitle">Thiết lập bảo mật hiển thị gia phả và ủy quyền quản lý cho các trưởng chi, thư ký.</p>
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
          {/* Left Col: Privacy & Settings */}
          <div className="clan-account-left-col">
            <div className="clan-account-card">
              <div className="clan-account-card-header">
                <h3 className="clan-account-card-title">Quyền Riêng Tư Gia Phả</h3>
              </div>
              <div className="clan-account-card-body">
                <div className="clan-account-radio-group">
                  <input 
                    type="radio" 
                    id="privacy_private" 
                    name="privacy" 
                    checked={privacyMode === 'private'} 
                    onChange={() => setPrivacyMode('private')}
                    className="clan-account-radio-input"
                  />
                  <label htmlFor="privacy_private" className="clan-account-radio-label">
                    <strong className="clan-account-radio-title">Nội bộ dòng họ (Riêng tư)</strong>
                    <p className="clan-account-radio-desc">Chỉ các thành viên được cấp tài khoản mới có thể xem chi tiết gia phả.</p>
                  </label>
                </div>
                
                <div className="clan-account-radio-group-mt">
                  <input 
                    type="radio" 
                    id="privacy_public" 
                    name="privacy" 
                    checked={privacyMode === 'public'} 
                    onChange={() => setPrivacyMode('public')}
                    className="clan-account-radio-input"
                  />
                  <label htmlFor="privacy_public" className="clan-account-radio-label">
                    <strong className="clan-account-radio-title">Công khai một phần</strong>
                    <p className="clan-account-radio-desc">Người ngoài (hoặc khách) có thể xem cây gia phả rút gọn (không hiện thông tin cá nhân nhạy cảm).</p>
                  </label>
                </div>
              </div>
            </div>

            <div className="clan-account-danger-card">
              <div className="clan-account-danger-header">
                <h3 className="clan-account-danger-title">Khu Vực Nguy Hiểm</h3>
              </div>
              <div className="clan-account-card-body-no-space">
                <p className="clan-account-danger-text">Chuyển giao quyền "Trưởng Tộc / Business Owner" cho một người khác trong họ. Bạn sẽ mất quyền quản trị cao nhất sau khi thực hiện.</p>
                <button className="clan-account-danger-btn admin-btn-primary bg-blue-600 hover:bg-blue-700 border-blue-600 shadow-red-600/20" onClick={handleTransferOwnership}>
                  Chuyển Giao Quyền
                </button>
              </div>
            </div>
          </div>

          {/* Right Col: Delegation */}
          <div>
            <div className="clan-account-card-full-height">
              <div className="clan-account-card-header-flex">
                <h3 className="clan-account-card-title">Ủy Quyền Quản Trị</h3>
                <button className="clan-account-add-btn admin-btn-secondary text-sm py-1.5 px-3" onClick={() => setIsDelegateModalOpen(true)}>
                  + Thêm người
                </button>
              </div>
              <div className="clan-account-card-body-no-space">
                <p className="clan-account-delegate-desc">Cấp quyền cho Trưởng Chi hoặc Ban liên lạc để chia sẻ khối lượng công việc quản lý.</p>
                
                <div className="clan-account-delegate-list">
                  {delegates.map(d => (
                    <div key={d.id} className="clan-account-delegate-item">
                      <div className="clan-account-delegate-item-header">
                        <strong className="clan-account-delegate-name">{d.name}</strong>
                        <span className="clan-account-delegate-role">{d.role}</span>
                      </div>
                      <div className="clan-account-delegate-perms">
                        {d.permissions.map((p, idx) => (
                          <span key={idx} className="clan-account-delegate-perm-tag">{p}</span>
                        ))}
                      </div>
                      <button className="clan-account-delegate-remove-btn">
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        Gỡ quyền
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delegate Modal */}
      {isDelegateModalOpen && (
        <>
          <div className="clan-account-modal-backdrop" onClick={() => setIsDelegateModalOpen(false)}></div>
          <div className="clan-account-modal-overlay">
            <div className="clan-account-modal-content bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-zoom-in">
              <div className="clan-account-modal-header">
                <h3 className="clan-account-modal-title">Thêm Ủy Quyền Quản Trị</h3>
                <button className="clan-account-modal-close" onClick={() => setIsDelegateModalOpen(false)}>
                  <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div className="clan-account-modal-body">
                <div className="form-group-admin">
                  <label className="form-label-admin">Chọn thành viên</label>
                  <input type="text" className="form-input-admin" placeholder="Nhập tên hoặc số điện thoại..." />
                </div>
                <div className="form-group-admin">
                  <label className="form-label-admin">Vai trò ủy quyền</label>
                  <select className="form-input-admin">
                    <option>Trưởng Chi</option>
                    <option>Thủ Quỹ</option>
                    <option>Thư Ký (Quản lý tư liệu)</option>
                  </select>
                </div>
              </div>
              <div className="clan-account-modal-footer">
                <button className="admin-btn-secondary" onClick={() => setIsDelegateModalOpen(false)}>Hủy</button>
                <button className="admin-btn-primary" onClick={() => setIsDelegateModalOpen(false)}>Xác nhận ủy quyền</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClanAccountMgmt;
