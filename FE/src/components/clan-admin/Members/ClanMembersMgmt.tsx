import './ClanMembersMgmt.css';
import React, { useState } from 'react';
import PageHeader from '../../../shared/Layout/PageHeader';
import DataTable, { type Column } from '../../../shared/DataTable/DataTable';

interface Account {
  id: string;
  username: string;
  personName: string;
  role: 'member' | 'family_admin';
  status: 'active' | 'locked' | 'pending';
  lastLogin: string;
}

export const ClanMembersMgmt: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const data: Account[] = [
    { id: '1', username: 'khoa.nguyen', personName: 'Nguyễn Văn Khoa', role: 'member', status: 'active', lastLogin: '11/09/2026 09:30' },
    { id: '2', username: 'hoa.nguyen', personName: 'Nguyễn Thị Hoa', role: 'family_admin', status: 'active', lastLogin: '10/09/2026 14:15' },
    { id: '3', username: 'nam.nguyen', personName: 'Nguyễn Văn Nam', role: 'member', status: 'locked', lastLogin: '01/01/2026 00:00' },
  ];

  const columns: Column<Account>[] = [
    { key: 'username', header: 'Tên đăng nhập', render: (item) => <strong className="text-slate-800">{item.username}</strong> },
    { key: 'personName', header: 'Nhân khẩu liên kết', render: (item) => <span className="members-person-name">{item.personName}</span> },
    { key: 'role', header: 'Vai trò', render: (item) => (
      <span className={`member-role-badge ${item.role === 'family_admin' ? 'role-admin' : 'role-member'}`}>
        {item.role === 'family_admin' ? 'Family Admin' : 'Member'}
      </span>
    )},
    { key: 'status', header: 'Trạng thái', render: (item) => (
      <span className={`member-status-badge ${item.status === 'active' ? 'status-active' : item.status === 'locked' ? 'status-locked' : 'status-pending'}`}>
        {item.status === 'active' ? 'Hoạt động' : item.status === 'locked' ? 'Đã khóa' : 'Chờ xác nhận'}
      </span>
    )},
    { key: 'lastLogin', header: 'Đăng nhập cuối', render: (item) => item.lastLogin },
    { key: 'actions', header: 'Thao tác', render: (item) => (
      <button 
        className="members-btn-manage"
        onClick={() => setSelectedAccount(item)}
      >
        Quản lý
      </button>
    )},
  ];

  const handleAction = (action: string) => {
    const isConfirm = window.confirm(`Bạn có chắc chắn muốn ${action} tài khoản này?`);
    if (isConfirm) {
      alert(`Đã thực hiện: ${action}`);
      setSelectedAccount(null);
    }
  };

  return (
    <div className="admin-account-container">
      
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Tài khoản thành viên (Account)</h2>
          <p className="admin-account-subtitle">Quản lý tài khoản đăng nhập của các thành viên. Một tài khoản có thể liên kết với một nhân khẩu.</p>
        </div>
      </div>
      
      <div className="members-filter-bar">
        <input 
          type="text" 
          placeholder="Tìm kiếm username, tên..." 
          className="members-search-input form-input-admin flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="members-status-select form-input-admin w-48">
          <option value="">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="locked">Đã khóa</option>
        </select>
        <select className="members-role-select form-input-admin w-48">
          <option value="">Tất cả vai trò</option>
          <option value="member">Member</option>
          <option value="family_admin">Family Admin</option>
        </select>
      </div>

      <div className="members-table-container">
        <DataTable 
          columns={columns} 
          data={data} 
          keyExtractor={(item) => item.id} 
          emptyMessage="Chưa có tài khoản nào được cấp."
        />
      </div>

      {/* Centered Modal for Account Detail */}
      {selectedAccount && (
        <div className="members-modal-overlay">
          <div className="members-modal-backdrop" onClick={() => setSelectedAccount(null)}></div>
          
          <div className="members-modal-content relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-zoom-in overflow-hidden">
            <div className="members-modal-header">
              <div className="members-modal-header-left">
                <div className="members-modal-icon-wrap">
                  <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
                </div>
                <div>
                  <h2 className="members-modal-username">@{selectedAccount.username}</h2>
                  <p className="text-slate-500">Liên kết: <strong>{selectedAccount.personName}</strong></p>
                </div>
              </div>
              <button 
                className="members-modal-close"
                onClick={() => setSelectedAccount(null)}
              >
                ✕
              </button>
            </div>

            <div className="members-modal-body">
              
              <div className="members-info-section">
                <h3 className="members-info-title">Thông tin Tài khoản</h3>
                <div className="members-info-grid">
                  <div className="members-info-row">
                    <span className="text-slate-500">Trạng thái</span>
                    <span className={`member-detail-status ${selectedAccount.status === 'active' ? 'status-active' : 'status-locked'}`}>
                      {selectedAccount.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="members-info-row">
                    <span className="text-slate-500">Vai trò</span>
                    <span className="members-info-value">{selectedAccount.role}</span>
                  </div>
                  <div className="members-info-row">
                    <span className="text-slate-500">Đăng nhập lần cuối</span>
                    <span className="members-info-value">{selectedAccount.lastLogin}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="members-action-title">Thao tác Quản trị</h3>
                
                {selectedAccount.status === 'active' ? (
                  <button 
                    className="members-btn-lock"
                    onClick={() => handleAction('Khóa tài khoản')}
                  >
                    Khóa tài khoản (Lock)
                  </button>
                ) : (
                  <button 
                    className="members-btn-unlock"
                    onClick={() => handleAction('Mở khóa tài khoản')}
                  >
                    Mở khóa (Unlock)
                  </button>
                )}

                <button 
                  className="members-btn-reset-pw"
                  onClick={() => handleAction('Cấp lại mật khẩu')}
                >
                  Cấp lại mật khẩu (Reset Password)
                </button>

                <button 
                  className="members-btn-upgrade"
                  onClick={() => handleAction('Nâng cấp thành Family Admin')}
                >
                  Nâng quyền Family Admin
                </button>

                <button 
                  className="members-btn-revoke"
                  onClick={() => handleAction('Thu hồi tài khoản')}
                >
                  Thu hồi (Revoke Access)
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClanMembersMgmt;
