import React, { useState } from 'react';
import { useToast } from '../../../shared/common/Toast';
import DataTable, { Column } from '../../../shared/DataTable/DataTable';
import './AdminAccountMgmt.css';

export interface BusinessAccountItem {
  id: string;
  family_code: string;
  family_name: string;
  manager_name: string;
  username: string;
  recovery_email: string;
  recovery_phone: string;
  status: 'ACTIVE' | 'LOCKED' | 'PENDING_ACTIVATION';
  created_at: string;
  last_login?: string;
}

export interface PersonalUserItem {
  id: string;
  username: string;
  display_name: string;
  email: string;
  phone: string;
  family_affiliations_count: number;
  primary_role: 'admin' | 'member' | 'viewer';
  status: 'ACTIVE' | 'LOCKED';
  lock_reason?: string;
  locked_at?: string;
  created_at: string;
}

const INITIAL_BIZ_ACCOUNTS: BusinessAccountItem[] = [];

const INITIAL_USERS: PersonalUserItem[] = [];

export const AdminAccountMgmt: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'BIZ_ACCOUNTS' | 'PERSONAL_USERS'>('BIZ_ACCOUNTS');
  const [bizAccounts, setBizAccounts] = useState<BusinessAccountItem[]>(INITIAL_BIZ_ACCOUNTS);
  const [personalUsers, setPersonalUsers] = useState<PersonalUserItem[]>(INITIAL_USERS);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Recovery Edit Modal (FR-SA-17)
  const [selectedBizAcc, setSelectedBizAcc] = useState<BusinessAccountItem | null>(null);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [editRecoveryEmail, setEditRecoveryEmail] = useState('');
  const [editRecoveryPhone, setEditRecoveryPhone] = useState('');

  // Lock / Unlock Personal User Modal (FR-SA-19)
  const [selectedUser, setSelectedUser] = useState<PersonalUserItem | null>(null);
  const [isUserLockModalOpen, setIsUserLockModalOpen] = useState(false);
  const [lockReason, setLockReason] = useState('');

  const toast = useToast();

  // Handle Recovery Edit
  const handleOpenRecoveryModal = (acc: BusinessAccountItem) => {
    setSelectedBizAcc(acc);
    setEditRecoveryEmail(acc.recovery_email);
    setEditRecoveryPhone(acc.recovery_phone);
    setIsRecoveryModalOpen(true);
  };

  const handleSaveRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBizAcc) return;
    setBizAccounts((prev) =>
      prev.map((a) =>
        a.id === selectedBizAcc.id
          ? { ...a, recovery_email: editRecoveryEmail, recovery_phone: editRecoveryPhone }
          : a
      )
    );
    setIsRecoveryModalOpen(false);
    toast.success('Cập nhật thành công', `Đã lưu thông tin liên hệ khôi phục của "${selectedBizAcc.manager_name}".`);
  };

  // Handle Reset Access Credentials
  const handleResetAccess = (acc: BusinessAccountItem) => {
    toast.loading('Đang cấp lại mã truy cập...', 'Hệ thống đang sinh mật khẩu tạm mới.');
    setTimeout(() => {
      toast.success(
        'Đã gửi mật khẩu tạm mới',
        `Mật khẩu tạm đã được gửi đến Email: ${acc.recovery_email} và SMS: ${acc.recovery_phone}.`
      );
    }, 600);
  };

  // Toggle Biz Lock
  const handleToggleBizLock = (acc: BusinessAccountItem) => {
    const nextStatus = acc.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED';
    setBizAccounts((prev) =>
      prev.map((a) => (a.id === acc.id ? { ...a, status: nextStatus } : a))
    );
    if (nextStatus === 'LOCKED') {
      toast.warning('Đã khóa tài khoản Business', `Tài khoản Trưởng tộc của "${acc.family_name}" đã bị tạm khóa.`);
    } else {
      toast.success('Đã mở khóa tài khoản Business', `Tài khoản Trưởng tộc của "${acc.family_name}" đã hoạt động trở lại.`);
    }
  };

  // Handle User Lock / Unlock
  const handleOpenUserLockModal = (user: PersonalUserItem) => {
    setSelectedUser(user);
    setLockReason('');
    setIsUserLockModalOpen(true);
  };

  const handleConfirmUserLock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (selectedUser.status === 'ACTIVE' && !lockReason.trim()) {
      toast.error('Thiếu lý do', 'Vui lòng nhập lý do khóa tài khoản để lưu vết Audit.');
      return;
    }

    const nextStatus = selectedUser.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    setPersonalUsers((prev) =>
      prev.map((u) =>
        u.id === selectedUser.id
          ? {
            ...u,
            status: nextStatus,
            lock_reason: nextStatus === 'LOCKED' ? lockReason.trim() : undefined,
            locked_at: nextStatus === 'LOCKED' ? new Date().toISOString().slice(0, 16).replace('T', ' ') : undefined,
          }
          : u
      )
    );

    setIsUserLockModalOpen(false);
    if (nextStatus === 'LOCKED') {
      toast.error('Đã khóa người dùng', `Tài khoản "${selectedUser.display_name}" đã bị khóa và chấm dứt các phiên đăng nhập.`);
    } else {
      toast.success('Đã mở khóa', `Tài khoản "${selectedUser.display_name}" đã được mở khóa bình thường.`);
    }
  };

  // Filtered Biz Accounts
  const filteredBiz = bizAccounts.filter(
    (b) =>
      b.family_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.manager_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.family_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtered Personal Users
  const filteredUsers = personalUsers.filter(
    (u) =>
      u.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.phone.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const bizColumns: Column<BusinessAccountItem>[] = [
    {
      key: 'family_code',
      header: 'Mã Dòng Họ',
      render: (item) => <span className="perm-tag" style={{background: '#e2e8f0'}}>{item.family_code}</span>
    },
    {
      key: 'family_name',
      header: 'Dòng Họ & Business',
      render: (item) => (
        <>
          <div style={{fontWeight: 600, color: '#0f172a'}}>{item.family_name}</div>
          <div style={{fontSize: '0.85rem', color: '#64748b'}}>ID: {item.id}</div>
        </>
      )
    },
    {
      key: 'manager_name',
      header: 'Trưởng Tộc (Username)',
      render: (item) => (
        <>
          <div style={{fontWeight: 600, color: '#0f172a'}}>{item.manager_name}</div>
          <div style={{fontSize: '0.8rem', color: '#64748b'}}>@{item.username}</div>
        </>
      )
    },
    {
      key: 'recovery',
      header: 'Thông Tin Khôi Phục',
      render: (item) => (
        <div style={{fontSize: '0.85rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px'}}>
          <span>📧 {item.recovery_email}</span>
          <span>📱 {item.recovery_phone}</span>
        </div>
      )
    },
    {
      key: 'last_login',
      header: 'Lần Đăng Nhập Cuối',
      render: (item) => <span style={{fontSize: '0.85rem', color: '#64748b'}}>{item.last_login}</span>
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      render: (item) => (
        <>
          {item.status === 'ACTIVE' && <span className="status-badge-active">Hoạt động</span>}
          {item.status === 'PENDING_ACTIVATION' && <span className="status-badge-locked" style={{background: '#fef3c7', color: '#b45309'}}>Chờ kích hoạt</span>}
          {item.status === 'LOCKED' && <span className="status-badge-locked" style={{background: '#fee2e2', color: '#b91c1c'}}>Đã khóa</span>}
        </>
      )
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      render: (item) => (
        <div className="action-btn-row">
          <button className="btn-icon-action" title="Cập nhật Email/SĐT khôi phục" onClick={() => handleOpenRecoveryModal(item)}>
            Khôi phục
          </button>
          <button className="btn-icon-action" title="Cấp lại mật khẩu tạm thời" onClick={() => handleResetAccess(item)}>
            Cấp lại pass
          </button>
          <button
            className={`btn-icon-action ${item.status === 'LOCKED' ? 'unlock' : 'lock'}`}
            title={item.status === 'LOCKED' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
            onClick={() => handleToggleBizLock(item)}
          >
            {item.status === 'LOCKED' ? 'Mở' : 'Khóa'}
          </button>
        </div>
      )
    }
  ];

  const userColumns: Column<PersonalUserItem>[] = [
    {
      key: 'id',
      header: 'Mã Người Dùng',
      render: (item) => <span className="perm-tag" style={{background: '#e2e8f0'}}>{item.id}</span>
    },
    {
      key: 'display_name',
      header: 'Họ Và Tên',
      render: (item) => (
        <>
          <div style={{fontWeight: 600, color: '#0f172a'}}>{item.display_name}</div>
          <div style={{fontSize: '0.85rem', color: '#64748b'}}>Tham gia: {item.created_at}</div>
        </>
      )
    },
    {
      key: 'username',
      header: 'Tên Đăng Nhập',
      render: (item) => <span style={{fontSize: '0.85rem', color: '#0f172a', fontWeight: 500}}>@{item.username}</span>
    },
    {
      key: 'contact',
      header: 'Email & SĐT',
      render: (item) => (
        <div style={{fontSize: '0.85rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px'}}>
          <span>{item.email}</span>
          <span>{item.phone}</span>
        </div>
      )
    },
    {
      key: 'primary_role',
      header: 'Vai Trò',
      render: (item) => (
        <span className={`badge-role-pill badge-role-${item.primary_role}`}>
          {item.primary_role === 'admin' ? 'Quản Trị' : item.primary_role === 'member' ? 'Thành Viên' : 'Người Xem'}
        </span>
      )
    },
    {
      key: 'family_affiliations_count',
      header: 'Dòng Họ Liên Kết',
      render: (item) => <span className="perm-tag" style={{background: '#f1f5f9'}}>{item.family_affiliations_count} gia phả</span>
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      render: (item) => (
        <>
          {item.status === 'ACTIVE' ? (
            <span className="status-badge-active">Hoạt động</span>
          ) : (
            <span className="status-badge-locked" style={{background: '#fee2e2', color: '#b91c1c'}}>Đã khóa</span>
          )}
        </>
      )
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      render: (item) => (
        <div className="action-btn-row">
          <button
            className={`btn-icon-action ${item.status === 'LOCKED' ? 'unlock' : 'lock'}`}
            onClick={() => handleOpenUserLockModal(item)}
          >
            {item.status === 'LOCKED' ? 'Mở Khóa' : 'Khóa'}
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="admin-account-container">
      {/* Header */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản Lý Tài Khoản & Người Dùng Hệ Thống</h2>
          <p className="admin-account-subtitle">
            Phân tách độc lập giữa Tài khoản Business (Trưởng tộc quản trị dòng họ) và Tài khoản người dùng cá nhân toàn quốc.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="admin-controls" style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
          <button
            className={`admin-btn-secondary ${activeTab === 'BIZ_ACCOUNTS' ? 'admin-btn-primary' : ''}`} style={activeTab === 'BIZ_ACCOUNTS' ? {background: '#fff', color: '#0f172a', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'} : {background: 'transparent'}}
            onClick={() => setActiveTab('BIZ_ACCOUNTS')}
          >
            Tài Khoản Dòng Họ ({bizAccounts.length})
          </button>
          <button
            className={`admin-btn-secondary ${activeTab === 'PERSONAL_USERS' ? 'admin-btn-primary' : ''}`} style={activeTab === 'PERSONAL_USERS' ? {background: '#fff', color: '#0f172a', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'} : {background: 'transparent'}}
            onClick={() => setActiveTab('PERSONAL_USERS')}
          >
            Người Dùng Cá Nhân ({personalUsers.length})
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <input
          type="text"
          className="admin-search-input"
          style={{ maxWidth: 440, flex: 1 }}
          placeholder={
            activeTab === 'BIZ_ACCOUNTS'
              ? 'Tìm theo tên dòng họ, Trưởng tộc, username...'
              : 'Tìm theo họ tên người dùng, username, email, sđt...'
          }
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TAB 1: Business Accounts Table (FR-SA-17) */}
      {activeTab === 'BIZ_ACCOUNTS' && (
        <div className="admin-table-card">
          <DataTable columns={bizColumns} data={filteredBiz} keyExtractor={(item) => item.id} emptyMessage="Không tìm thấy tài khoản Business nào." />
        </div>
      )}

      {/* TAB 2: Personal Users Table (FR-SA-19) */}
      {activeTab === 'PERSONAL_USERS' && (
        <div className="admin-table-card">
          <DataTable columns={userColumns} data={filteredUsers} keyExtractor={(item) => item.id} emptyMessage="Không tìm thấy người dùng nào." />
        </div>
      )}

      {/* Modal: Cập nhật thông tin khôi phục (FR-SA-17) */}
      {isRecoveryModalOpen && selectedBizAcc && (
        <div className="admin-modal-overlay" onClick={() => setIsRecoveryModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">{selectedBizAcc.manager_name}</h3>
              <button className="admin-modal-close" onClick={() => setIsRecoveryModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleSaveRecovery}>
              <div style={{ padding: '24px' }}>
                <p style={{ marginBottom: '16px', fontSize: '0.95rem', color: '#475569' }}>
                  Quản lý kênh tiếp nhận mã khôi phục và mật khẩu tạm của dòng họ <strong>{selectedBizAcc.family_name}</strong>.
                </p>

                <div className="form-group-admin">
                  <label className="form-label-admin">Email khôi phục:</label>
                  <input
                    type="email"
                    className="form-input-admin"
                    value={editRecoveryEmail}
                    onChange={(e) => setEditRecoveryEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group-admin">
                  <label className="form-label-admin">Số điện thoại khôi phục:</label>
                  <input
                    type="text"
                    className="form-input-admin"
                    value={editRecoveryPhone}
                    onChange={(e) => setEditRecoveryPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="admin-btn-secondary" onClick={() => setIsRecoveryModalOpen(false)}>
                  Hủy bỏ
                </button>
                <button type="submit" className="admin-btn-primary">
                  Lưu Thông Tin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Khóa / Mở khóa người dùng cá nhân (FR-SA-19) */}
      {isUserLockModalOpen && selectedUser && (
        <div className="admin-modal-overlay" onClick={() => setIsUserLockModalOpen(false)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {selectedUser.status === 'ACTIVE' ? 'Khóa Tài Khoản Người Dùng' : 'Mở Khóa Tài Khoản'}
              </h3>
              <button className="admin-modal-close" onClick={() => setIsUserLockModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleConfirmUserLock}>
              <div style={{ padding: '24px' }}>
                {selectedUser.status === 'ACTIVE' ? (
                  <>
                    <p style={{ marginBottom: '16px', fontSize: '0.95rem', color: '#475569' }}>
                      Khóa tài khoản sẽ thu hồi toàn bộ phiên đăng nhập của người dùng <strong>@{selectedUser.username}</strong> trên mọi thiết bị.
                    </p>
                    <div className="form-group-admin">
                      <label className="form-label-admin">Lý do khóa tài khoản (Ghi nhận vào AuditLog):</label>
                      <textarea
                        rows={3}
                        className="form-input-admin"
                        placeholder="Ví dụ: Đăng tải nội dung vi phạm thuần phong mỹ tục, spam tài liệu..."
                        value={lockReason}
                        onChange={(e) => setLockReason(e.target.value)}
                        required
                        style={{ resize: 'vertical' }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ marginBottom: '16px', fontSize: '0.95rem', color: '#475569' }}>
                      Xác nhận mở khóa lại quyền truy cập cho người dùng <strong>@{selectedUser.username}</strong> ({selectedUser.display_name}).
                    </p>
                    {selectedUser.lock_reason && (
                      <div className="admin-msg-box" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                        <strong>Lý do khóa trước đây:</strong> {selectedUser.lock_reason}
                        <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Khóa vào lúc: {selectedUser.locked_at}</div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="admin-modal-footer">
                <button type="button" className="admin-btn-secondary" onClick={() => setIsUserLockModalOpen(false)}>
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className={selectedUser.status === 'ACTIVE' ? 'admin-btn-primary' : 'admin-btn-primary'} style={selectedUser.status === 'ACTIVE' ? {background: '#ef4444'} : {}}
                >
                  {selectedUser.status === 'ACTIVE' ? 'Xác Nhận Khóa' : 'Xác Nhận Mở Khóa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAccountMgmt;
