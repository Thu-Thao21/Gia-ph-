import React, { useState, useEffect, useCallback } from 'react';
import { fetchAdminUsers, updateAdminUserStatus, type AdminUserItem } from '../../../services/admin.service';
import { readApiError } from '../../../api/apiError';
import './AdminAccountMgmt.css';

export type AccountStatus = 'ACTIVE' | 'PENDING' | 'LOCKED' | 'DISABLED';

export interface UserAccountItem {
  id: string;
  username?: string;
  email?: string;
  phone_e164?: string;
  display_name?: string;
  primary_role: 'admin' | 'family_head' | 'member' | 'viewer' | string;
  status: AccountStatus | string;
  created_at?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Hoạt động', className: 'status-badge-active' },
  PENDING: { label: 'Chờ đổi mật khẩu', className: 'status-badge-pending' },
  LOCKED: { label: 'Đã khóa', className: 'status-badge-locked' },
  DISABLED: { label: 'Đã vô hiệu hóa', className: 'status-badge-disabled' },
};

export const AdminAccountMgmt: React.FC = () => {
  const [accounts, setAccounts] = useState<UserAccountItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedAcc, setSelectedAcc] = useState<UserAccountItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editRole, setEditRole] = useState<string>('member');
  const [editStatus, setEditStatus] = useState<AccountStatus>('ACTIVE');
  const [editDisplayName, setEditDisplayName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const mapBackendUser = (u: AdminUserItem): UserAccountItem => {
    const rawStatus = (u.status || 'ACTIVE').toUpperCase();
    const normalizedStatus: AccountStatus =
      rawStatus === 'PENDING' ? 'PENDING' :
      rawStatus === 'LOCKED' ? 'LOCKED' :
      rawStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE';

    // Eliminate guessing role from display_name string
    const inferredRole = (u as any).role || (u as any).primary_role || 'member';

    return {
      id: u.user_id,
      email: u.email,
      display_name: u.display_name,
      username: u.email ? u.email.split('@')[0] : u.user_id.slice(0, 8),
      primary_role: inferredRole,
      status: normalizedStatus,
      created_at: u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : undefined,
    };
  };

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAdminUsers({ q: searchTerm.trim() || undefined, page_size: 100 });
      if (res && Array.isArray(res.items)) {
        setAccounts(res.items.map(mapBackendUser));
      }
    } catch (err: any) {
      console.error('Lỗi khi tải danh sách người dùng:', err);
      const info = readApiError(err);
      setErrorMsg(`Không thể tải danh sách tài khoản từ máy chủ: ${info.message}`);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleToggleLock = async (acc: UserAccountItem) => {
    // Disable action for PENDING accounts as required by L-19
    if (acc.status === 'PENDING') return;

    const nextStatus: AccountStatus = acc.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED';
    try {
      await updateAdminUserStatus(acc.id, nextStatus as 'ACTIVE' | 'LOCKED', 'Thay đổi trạng thái tài khoản từ trang Quản trị');
      setAccounts((prev) =>
        prev.map((item) =>
          item.id === acc.id ? { ...item, status: nextStatus } : item
        )
      );
      setSuccessMsg(`Đã ${nextStatus === 'LOCKED' ? 'khóa' : 'mở khóa'} tài khoản ${acc.display_name || acc.email}`);
      setErrorMsg('');
    } catch (err: any) {
      const info = readApiError(err);
      setErrorMsg(`Không thể cập nhật trạng thái tài khoản: ${info.message}`);
      setSuccessMsg('');
    }
    setTimeout(() => {
      setSuccessMsg('');
      setErrorMsg('');
    }, 5000);
  };

  const handleDeleteAccount = async (acc: UserAccountItem) => {
    if (window.confirm(`Bạn có chắc chắn muốn vô hiệu hóa tài khoản "${acc.display_name || acc.username}"?`)) {
      try {
        await updateAdminUserStatus(acc.id, 'DISABLED', 'Vô hiệu hóa tài khoản');
        setAccounts((prev) =>
          prev.map((item) =>
            item.id === acc.id ? { ...item, status: 'DISABLED' } : item
          )
        );
        setSuccessMsg(`Đã vô hiệu hóa tài khoản ${acc.display_name || acc.username} thành công.`);
        setErrorMsg('');
      } catch (err: any) {
        const info = readApiError(err);
        setErrorMsg(`Không thể vô hiệu hóa tài khoản: ${info.message}`);
        setSuccessMsg('');
      }
      setTimeout(() => {
        setSuccessMsg('');
        setErrorMsg('');
      }, 5000);
    }
  };

  const handleOpenEditModal = (acc: UserAccountItem) => {
    setSelectedAcc(acc);
    setEditRole(acc.primary_role);
    setEditStatus((acc.status as AccountStatus) || 'ACTIVE');
    setEditDisplayName(acc.display_name || acc.username || '');
    setIsEditModalOpen(true);
    setErrorMsg('');
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAcc) return;

    try {
      const targetStatus: 'ACTIVE' | 'LOCKED' | 'DISABLED' =
        editStatus === 'LOCKED' ? 'LOCKED' : editStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
      await updateAdminUserStatus(selectedAcc.id, targetStatus, `Cập nhật trạng thái bởi quản trị viên`);
      setAccounts((prev) =>
        prev.map((item) =>
          item.id === selectedAcc.id
            ? {
                ...item,
                status: targetStatus,
              }
            : item
        )
      );
      setIsEditModalOpen(false);
      setSuccessMsg(`Cập nhật trạng thái tài khoản "${selectedAcc.display_name || selectedAcc.username}" thành công!`);
      setErrorMsg('');
    } catch (err: any) {
      const info = readApiError(err);
      setErrorMsg(`Lỗi khi cập nhật tài khoản: ${info.message}`);
      setSuccessMsg('');
    }
    setTimeout(() => {
      setSuccessMsg('');
      setErrorMsg('');
    }, 5000);
  };

  const filteredAccounts = accounts.filter((acc) => {
    const nameStr = (acc.display_name || '') + (acc.username || '') + (acc.email || '') + (acc.phone_e164 || '');
    const matchSearch = nameStr.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = roleFilter ? acc.primary_role === roleFilter : true;
    const matchStatus = statusFilter ? acc.status === statusFilter : true;
    return matchSearch && matchRole && matchStatus;
  });

  return (
    <div className="admin-account-container">
      {/* Header & Controls */}
      <div className="admin-account-header">
        <div>
          <h2 className="admin-account-title">Quản Lý Tài Khoản & Cấp Quyền Hệ Thống</h2>
          <p className="admin-account-subtitle">
            Khóa, mở khóa, theo dõi trạng thái tài khoản và vô hiệu hóa người dùng.
          </p>
        </div>

        <div className="admin-account-controls">
          <input
            type="text"
            className="admin-search-input"
            placeholder="Tìm theo tên, email, sđt..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-users"
          />
          <select
            className="admin-select-filter"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            data-testid="select-filter-role"
          >
            <option value="">Tất cả vai trò</option>
            <option value="admin">Admin</option>
            <option value="family_head">Chủ dòng họ</option>
            <option value="member">Thành viên</option>
            <option value="viewer">Người xem</option>
          </select>
          <select
            className="admin-select-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid="select-filter-status"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Hoạt động (ACTIVE)</option>
            <option value="PENDING">Chờ đổi mật khẩu (PENDING)</option>
            <option value="LOCKED">Đã khóa (LOCKED)</option>
            <option value="DISABLED">Đã vô hiệu hóa (DISABLED)</option>
          </select>
        </div>
      </div>

      {/* Error & Success Messages */}
      {errorMsg && (
        <div className="admin-msg-box alert-error" role="alert" data-testid="alert-error">
          <span style={{ marginRight: '8px', fontWeight: 'bold' }}>⚠️</span>
          <span style={{ flex: 1 }}>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
            aria-label="Đóng thông báo lỗi"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="admin-msg-box alert-success" role="status" data-testid="alert-success">
          <span style={{ marginRight: '8px', fontWeight: 'bold' }}>✓</span>
          <span style={{ flex: 1 }}>{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 'bold' }}
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {/* Table List */}
      <div className="admin-table-card">
        {loading ? (
          <p className="admin-table-loading">Đang tải danh sách tài khoản...</p>
        ) : filteredAccounts.length === 0 ? (
          <p className="admin-table-empty">Không tìm thấy tài khoản phù hợp.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tài khoản / Người dùng</th>
                <th>Email / SĐT</th>
                <th>Vai trò hiện tại</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((acc) => {
                const statusInfo = STATUS_CONFIG[acc.status] || {
                  label: acc.status,
                  className: 'status-badge-locked',
                };
                const isPending = acc.status === 'PENDING';

                return (
                  <tr key={acc.id}>
                    <td>
                      <div className="admin-acc-name">{acc.display_name || acc.username}</div>
                      <div className="admin-acc-username">@{acc.username || acc.id.slice(0, 8)}</div>
                    </td>
                    <td>
                      <div className="admin-acc-email">{acc.email || '—'}</div>
                      {acc.phone_e164 && <div className="admin-acc-phone">{acc.phone_e164}</div>}
                    </td>
                    <td>
                      <span
                        className={`badge-role-pill ${
                          acc.primary_role === 'admin'
                            ? 'badge-role-admin'
                            : acc.primary_role === 'family_head'
                            ? 'badge-role-head'
                            : acc.primary_role === 'viewer'
                            ? 'badge-role-viewer'
                            : 'acc-role-member'
                        }`}
                      >
                        {acc.primary_role === 'admin'
                          ? 'Admin'
                          : acc.primary_role === 'family_head'
                          ? 'Chủ dòng họ'
                          : acc.primary_role === 'viewer'
                          ? 'Người xem'
                          : 'Thành viên'}
                      </span>
                    </td>
                    <td>
                      <span className={statusInfo.className}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="admin-acc-date">{acc.created_at || 'Mới đây'}</td>
                    <td>
                      <div className="action-btn-row">
                        <button
                          className="btn-icon-action"
                          onClick={() => handleOpenEditModal(acc)}
                          title="Sửa trạng thái tài khoản"
                          data-testid={`btn-edit-${acc.id}`}
                        >
                          Sửa
                        </button>
                        <button
                          className={`btn-icon-action ${acc.status === 'LOCKED' ? 'unlock' : 'lock'}`}
                          onClick={() => handleToggleLock(acc)}
                          disabled={isPending}
                          title={
                            isPending
                              ? 'Tài khoản đang chờ người dùng đổi mật khẩu lần đầu (không thể khóa/mở)'
                              : acc.status === 'LOCKED'
                              ? 'Mở khóa tài khoản'
                              : 'Khóa tài khoản'
                          }
                          data-testid={`btn-toggle-lock-${acc.id}`}
                        >
                          {acc.status === 'LOCKED' ? 'Mở' : 'Khóa'}
                        </button>
                        <button
                          className="btn-icon-action lock"
                          onClick={() => handleDeleteAccount(acc)}
                          title="Vô hiệu hóa tài khoản"
                          data-testid={`btn-disable-${acc.id}`}
                        >
                          Vô hiệu hóa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && selectedAcc && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-box">
            <div className="admin-modal-header">
              <h3>Chỉnh Sửa Trạng Thái Tài Khoản</h3>
              <button className="admin-modal-close" onClick={() => setIsEditModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveAccount}>
              <div className="form-group-admin">
                <label className="form-label-admin">
                  Tên hiển thị <small style={{ color: '#64748b', fontWeight: 'normal' }}>(Chỉ xem - Backend chưa hỗ trợ cập nhật)</small>
                </label>
                <input
                  type="text"
                  className="form-input-admin"
                  value={editDisplayName}
                  disabled
                  title="Backend chưa có API sửa tên hiển thị từ trang này"
                  style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                />
              </div>

              <div className="form-group-admin">
                <label className="form-label-admin">
                  Vai trò hệ thống <small style={{ color: '#64748b', fontWeight: 'normal' }}>(Chỉ xem - Backend chưa hỗ trợ cập nhật)</small>
                </label>
                <select
                  className="form-input-admin"
                  value={editRole}
                  disabled
                  title="Backend chưa có API sửa vai trò từ trang này"
                  style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
                >
                  <option value="admin">Admin (Quản trị toàn bộ)</option>
                  <option value="family_head">Chủ dòng họ (Quản lý một gia phả)</option>
                  <option value="member">Thành viên (Xem & đóng góp)</option>
                  <option value="viewer">Người xem (Chỉ xem dữ liệu)</option>
                </select>
              </div>

              <div className="form-group-admin">
                <label className="form-label-admin">Trạng thái tài khoản</label>
                <select
                  className="form-input-admin"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AccountStatus)}
                  data-testid="select-edit-status"
                >
                  <option value="ACTIVE">Hoạt động (ACTIVE)</option>
                  <option value="PENDING" disabled>Chờ đổi mật khẩu (PENDING - Tự động chuyển khi đổi mật khẩu)</option>
                  <option value="LOCKED">Khóa tài khoản (LOCKED)</option>
                  <option value="DISABLED">Vô hiệu hóa (DISABLED)</option>
                </select>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn-icon-action"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Hủy
                </button>
                <button type="submit" className="admin-btn-primary" data-testid="btn-save-account">
                  Lưu thay đổi
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
