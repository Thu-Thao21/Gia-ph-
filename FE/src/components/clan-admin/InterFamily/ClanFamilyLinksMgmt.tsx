import './ClanFamilyLinksMgmt.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';
import DataTable, { type Column } from '../../../shared/DataTable/DataTable';

interface LinkReq {
  id: string;
  familyName: string;
  type: string;
  status: 'connected' | 'pending_sent' | 'pending_received';
  sharedLevel: string;
}

export const ClanFamilyLinksMgmt: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'connected' | 'requests'>('connected');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const data: LinkReq[] = [
    { id: '1', familyName: 'Dòng họ Trần (Nam Định)', type: 'Họ Ngoại', status: 'connected', sharedLevel: 'Một phần' },
    { id: '2', familyName: 'Dòng họ Lê (Hà Nội)', type: 'Thông gia', status: 'pending_received', sharedLevel: 'Chưa cấu hình' },
    { id: '3', familyName: 'Dòng họ Phạm (Thái Bình)', type: 'Dâu / Rể', status: 'pending_sent', sharedLevel: 'Chưa cấu hình' },
  ];

  const connectedData = data.filter(d => d.status === 'connected');
  const requestsData = data.filter(d => d.status !== 'connected');

  const connectedCols: Column<LinkReq>[] = [
    { key: 'familyName', header: 'Tên Dòng họ', render: (item) => <strong className="text-slate-800">{item.familyName}</strong> },
    { key: 'type', header: 'Quan hệ', render: (item) => <span className="links-type-badge">{item.type}</span> },
    { key: 'sharedLevel', header: 'Quyền chia sẻ', render: (item) => item.sharedLevel },
    { key: 'actions', header: 'Thao tác', render: () => (
      <div className="links-actions-connected">
        <button className="links-btn-config" onClick={() => setShowConfigModal(true)}>Cấu hình</button>
        <button className="links-btn-cancel">Hủy liên kết</button>
      </div>
    )},
  ];

  const requestCols: Column<LinkReq>[] = [
    { key: 'familyName', header: 'Tên Dòng họ', render: (item) => <strong className="text-slate-800">{item.familyName}</strong> },
    { key: 'type', header: 'Quan hệ', render: (item) => <span className="links-type-badge-req">{item.type}</span> },
    { key: 'status', header: 'Trạng thái', render: (item) => (
      <span className={`link-status-badge ${item.status === 'pending_sent' ? 'status-sent' : 'status-received'}`}>
        {item.status === 'pending_sent' ? 'Đã gửi yêu cầu' : 'Yêu cầu đến'}
      </span>
    )},
    { key: 'actions', header: 'Thao tác', render: (item) => (
      <div className="links-actions-req">
        {item.status === 'pending_received' ? (
          <>
            <button className="links-btn-accept">Chấp nhận</button>
            <button className="links-btn-reject">Từ chối</button>
          </>
        ) : (
          <button className="links-btn-revoke">Thu hồi</button>
        )}
      </div>
    )},
  ];

  const headerActions = (
    <button className="links-btn-search admin-btn-primary flex items-center gap-2" onClick={() => setShowSearchModal(true)}>
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      Tìm & Kết nối Liên họ
    </button>
  );

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản lý Liên họ</h2>
          <p className="admin-account-subtitle">Mạng lưới kết nối với các dòng họ thông gia, nội ngoại để tự động cập nhật gia phả chéo.</p>
        </div>
        <div className="admin-account-controls">
          {headerActions}
        </div>
      </div>
      
      <div className="links-tabs">
        <button 
          className={`link-tab-btn ${activeTab === 'connected' ? 'tab-active' : 'tab-inactive'}`}
          onClick={() => setActiveTab('connected')}
        >
          Đang liên kết ({connectedData.length})
        </button>
        <button 
          className={`link-tab-btn ${activeTab === 'requests' ? 'tab-active' : 'tab-inactive'}`}
          onClick={() => setActiveTab('requests')}
        >
          Yêu cầu gửi/nhận ({requestsData.length})
        </button>
      </div>

      <div className="links-table-container">
        {activeTab === 'connected' ? (
          <DataTable columns={connectedCols} data={connectedData} keyExtractor={(item) => item.id} emptyMessage="Chưa có dòng họ nào liên kết." />
        ) : (
          <DataTable columns={requestCols} data={requestsData} keyExtractor={(item) => item.id} emptyMessage="Không có yêu cầu liên kết nào." />
        )}
      </div>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="links-search-modal-overlay">
          <div className="links-search-modal-backdrop" onClick={() => setShowSearchModal(false)}></div>
          
          <div className="links-search-modal-content">
            <div className="links-search-modal-header">
              <h2 className="links-search-modal-title">Tìm kiếm Dòng họ</h2>
              <button className="links-search-modal-close" onClick={() => setShowSearchModal(false)}>✕</button>
            </div>

            <div className="p-6">
              <input 
                type="text" 
                className="links-search-input form-input-admin w-full mb-6" 
                placeholder="Nhập ID Dòng họ hoặc Số điện thoại Trưởng tộc..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              {searchQuery.length > 3 && (
                <div className="links-search-result">
                  <div>
                    <h3 className="links-search-result-title">Dòng họ Lê (Nghệ An)</h3>
                    <p className="links-search-result-desc">ID: LE-NA-2026</p>
                  </div>
                  <button className="admin-btn-primary" onClick={() => {
                    alert('Đã gửi yêu cầu kết nối');
                    setShowSearchModal(false);
                  }}>Gửi yêu cầu</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sharing Config Modal */}
      {showConfigModal && (
        <div className="links-config-modal-overlay">
          <div className="links-config-modal-backdrop" onClick={() => setShowConfigModal(false)}></div>
          
          <div className="links-config-modal-content relative w-full max-w-md bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-zoom-in overflow-hidden">
            <div className="links-config-modal-header">
              <h2 className="links-config-modal-title">Cấu hình Chia sẻ</h2>
              <button className="links-config-modal-close" onClick={() => setShowConfigModal(false)}>✕</button>
            </div>

            <div className="links-config-modal-body">
              <p className="links-config-modal-desc">Mức độ chia sẻ dữ liệu với: <strong>Dòng họ Trần (Nam Định)</strong></p>

              <div className="space-y-4">
                <label className="links-config-radio-label">
                  <input type="radio" name="shareLevel" className="mt-1" defaultChecked />
                  <div>
                    <h4 className="links-config-radio-title">Chia sẻ Toàn bộ</h4>
                    <p className="links-config-radio-desc">Cho phép họ xem toàn bộ cây gia phả (trừ thông tin cá nhân bị ẩn).</p>
                  </div>
                </label>

                <label className="links-config-radio-label">
                  <input type="radio" name="shareLevel" className="mt-1" />
                  <div>
                    <h4 className="links-config-radio-title">Chia sẻ Một phần</h4>
                    <p className="links-config-radio-desc">Chỉ chia sẻ nhánh có quan hệ thông gia / dâu rể.</p>
                  </div>
                </label>

                <label className="links-config-radio-label">
                  <input type="radio" name="shareLevel" className="mt-1" />
                  <div>
                    <h4 className="links-config-radio-title">Không chia sẻ</h4>
                    <p className="links-config-radio-desc">Chỉ hiển thị tên dòng họ trong danh sách liên kết.</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="links-config-modal-footer">
              <button className="admin-btn-secondary" onClick={() => setShowConfigModal(false)}>Hủy</button>
              <button className="admin-btn-primary" onClick={() => setShowConfigModal(false)}>Lưu cấu hình</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClanFamilyLinksMgmt;
