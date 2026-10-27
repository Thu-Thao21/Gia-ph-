 import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminUsers,
  fetchAdminUserDetail,
  updateAdminUserStatus,
  type AdminUserItem,
  type AdminUserDetail,
} from '../../../services/admin.service';
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
  ACTIVE: { label: 'Hoạt động', className: 'status-active' },
  PENDING: { label: 'Chờ đổi mật khẩu', className: 'status-pending' },
  LOCKED: { label: 'Đã khóa', className: 'status-locked' },
  DISABLED: { label: 'Đã vô hiệu hóa', className: 'status-disabled' },
};

export const AdminAccountMgmt: React.FC = () => {
  const [accounts, setAccounts] = useState<UserAccountItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modal Detail & Edit states
  const [selectedAcc, setSelectedAcc] = useState<UserAccountItem | null>(null);
  const [modalMode, setModalMode] = useState<'DETAIL' | 'EDIT'>('DETAIL');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [accDetail, setAccDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Form states for Edit
  const [editRole, setEditRole] = useState<string>('member');
  const [editStatus, setEditStatus] = useState<AccountStatus>('ACTIVE');
  const [editDisplayName, setEditDisplayName] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const mapBackendUser = (u: AdminUserItem): UserAccountItem => {
    const rawStatus = (u.status || 'ACTIVE').toUpperCase();
    const normalizedStatus: AccountStatus =
      rawStatus === 'PENDING' ? 'PENDING' :
      rawStatus === 'LOCKED' ? 'LOCKED' :
      rawStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE';

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
      setErrorMsg(`Không thể tải danh sách tài khoản: ${info.message}`);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleOpenModal = async (acc: UserAccountItem, mode: 'DETAIL' | 'EDIT' = 'DETAIL') => {
    setSelectedAcc(acc);
    setModalMode(mode);
    setEditRole(acc.primary_role);
    setEditStatus((acc.status as AccountStatus) || 'ACTIVE');
    setEditDisplayName(acc.display_name || acc.username || '');
    setEditReason('');
    setIsModalOpen(true);
    setErrorMsg('');

    setDetailLoading(true);
    setAccDetail(null);
    try {
      const detail = await fetchAdminUserDetail(acc.id);
      setAccDetail(detail);
    } catch (err) {
      console.warn('Không thể tải chi tiết chuyên sâu của tài khoản:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleLock = async (acc: UserAccountItem) => {
    if (acc.status === 'PENDING') return;

    const nextStatus: AccountStatus = acc.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED';
    try {
      await updateAdminUserStatus(acc.id, nextStatus as 'ACTIVE' | 'LOCKED', 'Cập nhật từ bảng quản trị');
      setAccounts((prev) =>
        prev.map((item) =>
          item.id === acc.id ? { ...item, status: nextStatus } : item
        )
      );
      if (selectedAcc && selectedAcc.id === acc.id) {
        setSelectedAcc((prev) => (prev ? { ...prev, status: nextStatus } : null));
        setEditStatus(nextStatus);
        if (accDetail) {
          setAccDetail((prev) => (prev ? { ...prev, status: nextStatus } : null));
        }
      }
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
    }, 4000);
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
        if (selectedAcc && selectedAcc.id === acc.id) {
          setSelectedAcc((prev) => (prev ? { ...prev, status: 'DISABLED' } : null));
          setEditStatus('DISABLED');
          if (accDetail) {
            setAccDetail((prev) => (prev ? { ...prev, status: 'DISABLED' } : null));
          }
        }
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
      }, 4000);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAcc) return;

    setIsSubmitting(true);
    try {
      const targetStatus: 'ACTIVE' | 'LOCKED' | 'DISABLED' =
        editStatus === 'LOCKED' ? 'LOCKED' : editStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
      await updateAdminUserStatus(
        selectedAcc.id,
        targetStatus,
        editReason.trim() || 'Cập nhật trạng thái bởi quản trị viên'
      );
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
      setSelectedAcc((prev) => (prev ? { ...prev, status: targetStatus } : null));
      if (accDetail) {
        setAccDetail((prev) => (prev ? { ...prev, status: targetStatus } : null));
      }
      setSuccessMsg(`Cập nhật trạng thái tài khoản "${selectedAcc.display_name || selectedAcc.username}" thành công.`);
      setErrorMsg('');
      setModalMode('DETAIL');
    } catch (err: any) {
      const info = readApiError(err);
      setErrorMsg(`Lỗi khi cập nhật tài khoản: ${info.message}`);
      setSuccessMsg('');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => {
        setSuccessMsg('');
        setErrorMsg('');
      }, 4000);
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    const nameStr = (acc.display_name || '') + (acc.username || '') + (acc.email || '') + (acc.phone_e164 || '');
    const matchSearch = nameStr.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = roleFilter ? acc.primary_role === roleFilter : true;
    const matchStatus = statusFilter ? acc.status === statusFilter : true;
    return matchSearch && matchRole && matchStatus;
  });

  return (
    <div className="admin-acc-wrapper">
      {/* Header & Controls */}
      <div className="admin-acc-topbar">
        <div>
          <h2 className="admin-acc-heading">Quản Lý Tài Khoản & Phân Quyền</h2>
          <p className="admin-acc-subheading">
            Bấm vào bất kỳ dòng nào để xem chi tiết và chỉnh sửa trạng thái trực tiếp.
          </p>
        </div>
        <div className="admin-acc-filters">
          <input
            type="text"
            className="admin-acc-search"
            placeholder="Tìm theo tên, email, SĐT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-accounts"
          />
          <select
            className="admin-acc-select"
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
            className="admin-acc-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid="select-filter-status"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="PENDING">Chờ đổi mật khẩu</option>
            <option value="LOCKED">Đã khóa</option>
            <option value="DISABLED">Đã vô hiệu hóa</option>
          </select>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="admin-acc-alert alert-danger" role="alert">
          <span style={{ flex: 1 }}>{errorMsg}</span>
          <button
            type="button"
            className="admin-acc-alert-close"
            onClick={() => setErrorMsg('')}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="admin-acc-alert alert-ok" role="status">
          <span style={{ flex: 1 }}>{successMsg}</span>
          <button
            type="button"
            className="admin-acc-alert-close"
            onClick={() => setSuccessMsg('')}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
      )}

      {/* Table Card */}
      <div className="admin-acc-card">
        {loading ? (
          <div className="admin-acc-empty">Đang tải danh sách tài khoản...</div>
        ) : filteredAccounts.length === 0 ? (
          <div className="admin-acc-empty">Không tìm thấy tài khoản phù hợp.</div>
        ) : (
          <div className="admin-acc-table-scroll">
            <table className="admin-acc-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Tài khoản / Người dùng</th>
                  <th style={{ width: '26%' }}>Email / Số điện thoại</th>
                  <th style={{ width: '14%' }}>Vai trò</th>
                  <th style={{ width: '14%' }}>Trạng thái</th>
                  <th style={{ width: '10%' }}>Ngày tạo</th>
                  <th style={{ width: '8%', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((acc) => {
                  const statusInfo = STATUS_CONFIG[acc.status] || {
                    label: acc.status,
                    className: 'status-locked',
                  };
                  const isPending = acc.status === 'PENDING';

                  return (
                    <tr
                      key={acc.id}
                      className="admin-acc-row"
                      onClick={() => handleOpenModal(acc, 'DETAIL')}
                      title="Bấm để xem chi tiết và chỉnh sửa"
                    >
                      <td>
                        <div className="user-cell">
                          <div className={`user-avatar avatar-${acc.primary_role}`}>
                            {(acc.display_name || acc.username || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="user-info">
                            <span className="user-name">{acc.display_name || acc.username}</span>
                            <span className="user-handle">@{acc.username || acc.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="contact-cell">
                          <span className="contact-email">{acc.email || '—'}</span>
                          {acc.phone_e164 && <span className="contact-phone">{acc.phone_e164}</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`role-badge role-${acc.primary_role}`}>
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
                        <span className={`status-badge ${statusInfo.className}`}>
                          <span className="status-dot" />
                          <span>{statusInfo.label}</span>
                        </span>
                      </td>
                      <td className="date-cell">
                        {acc.created_at || 'Mới đây'}
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-tbl-action btn-tbl-edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenModal(acc, 'EDIT');
                            }}
                            title="Sửa tài khoản"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className={`btn-tbl-action ${acc.status === 'LOCKED' ? 'btn-tbl-unlock' : 'btn-tbl-lock'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleLock(acc);
                            }}
                            disabled={isPending}
                            title={
                              isPending
                                ? 'Đang chờ đổi mật khẩu lần đầu'
                                : acc.status === 'LOCKED'
                                ? 'Mở khóa'
                                : 'Khóa'
                            }
                          >
                            {acc.status === 'LOCKED' ? 'Mở khóa' : 'Khóa'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail & Edit Modal */}
      {isModalOpen && selectedAcc && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {modalMode === 'DETAIL' ? 'Chi Tiết Tài Khoản' : 'Chỉnh Sửa Trạng Thái'}
                </h3>
                <p className="modal-subtitle">
                  {modalMode === 'DETAIL'
                    ? 'Xem thông tin tài khoản và phân quyền trong hệ thống'
                    : 'Cập nhật trạng thái hoạt động của tài khoản người dùng'}
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Tabs (Clean text only) */}
            <div className="modal-nav-tabs">
              <button
                type="button"
                className={`modal-tab-btn ${modalMode === 'DETAIL' ? 'active' : ''}`}
                onClick={() => setModalMode('DETAIL')}
              >
                Thông tin chi tiết
              </button>
              <button
                type="button"
                className={`modal-tab-btn ${modalMode === 'EDIT' ? 'active' : ''}`}
                onClick={() => setModalMode('EDIT')}
              >
                Chỉnh sửa tài khoản
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body-scroll">
              {/* Profile Overview Card */}
              <div className="profile-card">
                <div className={`profile-avatar avatar-${selectedAcc.primary_role}`}>
                  {(selectedAcc.display_name || selectedAcc.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="profile-info">
                  <div className="profile-name">{selectedAcc.display_name || selectedAcc.username}</div>
                  <div className="profile-meta">
                    <span className="profile-handle">@{selectedAcc.username || selectedAcc.id.slice(0, 8)}</span>
                    <span className={`role-badge role-${selectedAcc.primary_role}`}>
                      {selectedAcc.primary_role === 'admin'
                        ? 'Admin'
                        : selectedAcc.primary_role === 'family_head'
                        ? 'Chủ dòng họ'
                        : selectedAcc.primary_role === 'viewer'
                        ? 'Người xem'
                        : 'Thành viên'}
                    </span>
                    <span className={`status-badge ${STATUS_CONFIG[selectedAcc.status]?.className || 'status-locked'}`}>
                      <span className="status-dot" />
                      <span>{STATUS_CONFIG[selectedAcc.status]?.label || selectedAcc.status}</span>
                    </span>
                  </div>
                </div>
              </div>

              {modalMode === 'DETAIL' ? (
                <div>
                  <div className="details-grid">
                    <div className="detail-item">
                      <span className="detail-label">Email</span>
                      <span className="detail-value">
                        {selectedAcc.email || accDetail?.email || '—'}
                        {accDetail?.email_verified !== undefined && (
                          <span className={`tag-verify ${accDetail.email_verified ? 'tag-ok' : 'tag-warn'}`}>
                            {accDetail.email_verified ? 'Đã xác thực' : 'Chưa xác thực'}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Số điện thoại</span>
                      <span className="detail-value">
                        {accDetail?.phone || selectedAcc.phone_e164 || 'Chưa liên kết'}
                        {accDetail?.phone && accDetail?.phone_verified !== undefined && (
                          <span className={`tag-verify ${accDetail.phone_verified ? 'tag-ok' : 'tag-warn'}`}>
                            {accDetail.phone_verified ? 'Đã xác minh' : 'Chưa xác minh'}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Mã ID Tài Khoản</span>
                      <span className="detail-value mono-text">
                        {selectedAcc.id}
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Ngày khởi tạo</span>
                      <span className="detail-value">
                        {selectedAcc.created_at || (accDetail?.created_at ? new Date(accDetail.created_at).toLocaleDateString('vi-VN') : 'Mới đây')}
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Đăng nhập gần nhất</span>
                      <span className="detail-value">
                        {accDetail?.last_login_at
                          ? new Date(accDetail.last_login_at).toLocaleString('vi-VN')
                          : 'Chưa có thông tin'}
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">Đổi mật khẩu lần đầu</span>
                      <span className="detail-value">
                        {selectedAcc.status === 'PENDING' || accDetail?.requires_password_change
                          ? 'Bắt buộc khi đăng nhập'
                          : 'Đã hoàn tất'}
                      </span>
                    </div>
                  </div>

                  {/* Clan Memberships */}
                  <div className="clan-section">
                    <div className="section-title">Gia phả / Dòng họ trực thuộc</div>
                    {detailLoading ? (
                      <div className="clan-loading">Đang tải dữ liệu...</div>
                    ) : accDetail?.memberships && accDetail.memberships.length > 0 ? (
                      <div className="clan-list">
                        {accDetail.memberships.map((m) => (
                          <div key={m.clan_id} className="clan-item">
                            <div>
                              <div className="clan-name">{m.clan_name}</div>
                              <div className="clan-status">Trạng thái: {m.clan_status || 'ACTIVE'}</div>
                            </div>
                            <div className="clan-role-pill">
                              {m.roles?.join(', ') || 'Thành viên'}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="clan-empty">
                        Người dùng này chưa tham gia hoặc chưa được phân quyền trong gia phả nào.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* EDIT FORM */
                <form id="form-edit-account" onSubmit={handleSaveAccount}>
                  <div className="form-field">
                    <label className="form-label">
                      Tên hiển thị <span className="label-hint">(Chỉ xem)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input form-input-disabled"
                      value={editDisplayName}
                      disabled
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-label">
                      Vai trò hệ thống <span className="label-hint">(Chỉ xem)</span>
                    </label>
                    <select
                      className="form-input form-input-disabled"
                      value={editRole}
                      disabled
                    >
                      <option value="admin">Admin</option>
                      <option value="family_head">Chủ dòng họ</option>
                      <option value="member">Thành viên</option>
                      <option value="viewer">Người xem</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">Trạng thái tài khoản</label>
                    <select
                      className="form-input"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as AccountStatus)}
                      data-testid="select-edit-status"
                    >
                      <option value="ACTIVE">Hoạt động (ACTIVE)</option>
                      <option value="PENDING" disabled>Chờ đổi mật khẩu (PENDING - Tự động khi cấp mới)</option>
                      <option value="LOCKED">Khóa tài khoản (LOCKED)</option>
                      <option value="DISABLED">Vô hiệu hóa (DISABLED)</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-label">
                      Lý do thay đổi <span className="label-hint">(Tùy chọn)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Ghi chú lý do cập nhật trạng thái..."
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                    />
                  </div>
                </form>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              {modalMode === 'DETAIL' ? (
                <>
                  <div className="footer-left">
                    <button
                      type="button"
                      className={`btn-subtle ${selectedAcc.status === 'LOCKED' ? 'btn-subtle-ok' : 'btn-subtle-danger'}`}
                      onClick={() => handleToggleLock(selectedAcc)}
                      disabled={selectedAcc.status === 'PENDING'}
                    >
                      {selectedAcc.status === 'LOCKED' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                    </button>
                    <button
                      type="button"
                      className="btn-subtle btn-subtle-muted"
                      onClick={() => handleDeleteAccount(selectedAcc)}
                      disabled={selectedAcc.status === 'DISABLED'}
                    >
                      Vô hiệu hóa
                    </button>
                  </div>
                  <div className="footer-right">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setIsModalOpen(false)}
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setModalMode('EDIT')}
                    >
                      Chỉnh sửa tài khoản
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="footer-left">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setModalMode('DETAIL')}
                    >
                      Xem chi tiết
                    </button>
                  </div>
                  <div className="footer-right">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setIsModalOpen(false)}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      form="form-edit-account"
                      className="btn-primary"
                      disabled={isSubmitting}
                      data-testid="btn-save-account"
                    >
                      {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAccountMgmt;
