import React, { useEffect, useMemo, useState } from 'react';
import {
  cloneRoleDefinitions,
  initialRoleDefinitions,
  permissionModules,
  type PermissionAction,
  type PermissionSet,
  type RoleDefinition,
} from './mockData';
import {
  AdminConfirmDialog,
  AdminPageHeader,
  AdminStatePanel,
  AdminStatusBadge,
  AdminToast,
  useAdminToast,
} from './shared';
import './PlatformAdmin.css';

const permissionColumns: Array<{ key: PermissionAction; label: string; description: string }> = [
  { key: 'view', label: 'Xem', description: 'Truy cập và xem dữ liệu' },
  { key: 'create', label: 'Tạo', description: 'Tạo bản ghi mới' },
  { key: 'update', label: 'Cập nhật', description: 'Thay đổi dữ liệu' },
  { key: 'delete', label: 'Xóa', description: 'Xóa hoặc gỡ dữ liệu' },
];

const emptyPermissions = (): PermissionSet => ({ view: false, create: false, update: false, delete: false });

export const RolePermissionManagement: React.FC = () => {
  const [roles, setRoles] = useState<RoleDefinition[]>(() => cloneRoleDefinitions(initialRoleDefinitions));
  const [savedRoles, setSavedRoles] = useState<RoleDefinition[]>(() => cloneRoleDefinitions(initialRoleDefinitions));
  const [selectedRoleId, setSelectedRoleId] = useState('family-head');
  const [moduleSearch, setModuleSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Gia phả' | 'Đời sống dòng họ' | 'Nền tảng'>('all');
  const [loading, setLoading] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast, showToast, dismissToast } = useAdminToast();

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 300);
    return () => window.clearTimeout(timer);
  }, []);

  const selectedRole = roles.find((role) => role.id === selectedRoleId) || roles[0];
  const savedRole = savedRoles.find((role) => role.id === selectedRoleId) || savedRoles[0];
  const isDirty = JSON.stringify(selectedRole.permissions) !== JSON.stringify(savedRole.permissions);

  const filteredModules = useMemo(() => {
    const needle = moduleSearch.trim().toLowerCase();
    return permissionModules.filter((module) => {
      const matchesSearch = !needle || [module.label, module.description, module.category]
        .some((value) => value.toLowerCase().includes(needle));
      return matchesSearch && (categoryFilter === 'all' || module.category === categoryFilter);
    });
  }, [moduleSearch, categoryFilter]);

  const updateSelectedRole = (updater: (role: RoleDefinition) => RoleDefinition) => {
    if (selectedRole.locked) return;
    setRoles((current) => current.map((role) => role.id === selectedRole.id ? updater(role) : role));
  };

  const togglePermission = (moduleId: string, action: PermissionAction) => {
    updateSelectedRole((role) => {
      const current = role.permissions[moduleId] || emptyPermissions();
      const nextValue = !current[action];
      let next: PermissionSet = { ...current, [action]: nextValue };

      if (action !== 'view' && nextValue) next.view = true;
      if (action === 'view' && !nextValue) next = emptyPermissions();

      return { ...role, permissions: { ...role.permissions, [moduleId]: next } };
    });
  };

  const toggleModuleRow = (moduleId: string) => {
    updateSelectedRole((role) => {
      const current = role.permissions[moduleId] || emptyPermissions();
      const allEnabled = permissionColumns.every((column) => current[column.key]);
      const next: PermissionSet = allEnabled
        ? emptyPermissions()
        : { view: true, create: true, update: true, delete: true };
      return { ...role, permissions: { ...role.permissions, [moduleId]: next } };
    });
  };

  const savePermissions = () => {
    if (selectedRole.locked || !isDirty) return;
    setSavedRoles((current) => current.map((role) => role.id === selectedRole.id
      ? cloneRoleDefinitions([selectedRole])[0]
      : role));
    showToast(`Đã lưu ma trận quyền cho vai trò “${selectedRole.name}”.`);
  };

  const resetPermissions = () => {
    setRoles((current) => current.map((role) => role.id === selectedRole.id
      ? cloneRoleDefinitions([savedRole])[0]
      : role));
    setConfirmReset(false);
    showToast(`Đã khôi phục quyền đã lưu của vai trò “${selectedRole.name}”.`, 'info');
  };

  const permissionCount = Object.values(selectedRole.permissions)
    .reduce((sum, permissions) => sum + permissionColumns.filter((column) => permissions[column.key]).length, 0);

  return (
    <section className="s6a-page">
      <AdminToast toast={toast} onDismiss={dismissToast} />
      <AdminPageHeader
        eyebrow="KIỂM SOÁT TRUY CẬP"
        title="Vai trò, Quyền & Module"
        description="Cấu hình phạm vi truy cập theo vai trò với ma trận quyền rõ ràng cho từng module hệ thống."
        actions={<button type="button" className="s6a-button secondary" onClick={() => showToast('Nhật ký phân quyền đã sẵn sàng để xem.', 'info')}>Nhật ký thay đổi</button>}
      />

      <div className="s6a-permission-layout">
        <aside className="s6a-role-panel">
          <div className="s6a-card-heading compact"><div><h2>Danh sách Vai trò</h2><p>{roles.length} vai trò hệ thống</p></div></div>
          <div className="s6a-role-list">
            {roles.map((role) => {
              const roleDirty = JSON.stringify(role.permissions) !== JSON.stringify(savedRoles.find((saved) => saved.id === role.id)?.permissions);
              return (
                <button
                  type="button"
                  key={role.id}
                  className={`s6a-role-card ${selectedRole.id === role.id ? 'active' : ''}`}
                  onClick={() => setSelectedRoleId(role.id)}
                >
                  <span className="s6a-role-avatar">{role.name.charAt(0)}</span>
                  <span className="s6a-role-card-copy"><strong>{role.name}</strong><small>{role.memberCount.toLocaleString('vi-VN')} tài khoản</small></span>
                  {role.locked && <span className="s6a-lock-mark" title="Vai trò hệ thống bị khóa">Khóa</span>}
                  {roleDirty && <span className="s6a-dirty-dot" title="Có thay đổi chưa lưu" />}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="s6a-permission-main">
          <div className="s6a-role-detail-card">
            <div>
              <div className="s6a-inline-badges">
                <AdminStatusBadge status={selectedRole.locked ? 'disabled' : 'active'} label={selectedRole.locked ? 'Vai trò hệ thống' : 'Có thể chỉnh sửa'} />
                {isDirty && <span className="s6a-unsaved-badge">Có thay đổi chưa lưu</span>}
              </div>
              <h2>{selectedRole.name}</h2>
              <p>{selectedRole.description}</p>
            </div>
            <div className="s6a-role-summary">
              <div><strong>{selectedRole.memberCount.toLocaleString('vi-VN')}</strong><span>Tài khoản</span></div>
              <div><strong>{permissionCount}</strong><span>Quyền được bật</span></div>
            </div>
          </div>

          {selectedRole.locked && (
            <div className="s6a-inline-alert info" role="note">
              Vai trò Quản trị viên hệ thống được bảo vệ để tránh mất quyền vận hành. Các checkbox chỉ hiển thị và không thể chỉnh sửa.
            </div>
          )}

          <div className="s6a-content-card permission-card">
            <div className="s6a-card-heading">
              <div>
                <h2>Ma trận Quyền Module</h2>
                <p>Bật quyền chi tiết cho từng chức năng của vai trò trong hệ thống.</p>
              </div>
              <div className="s6a-permission-actions">
                <button type="button" className="s6a-button secondary" onClick={() => setConfirmReset(true)} disabled={selectedRole.locked || !isDirty}>Đặt lại</button>
                <button type="button" className="s6a-button primary" onClick={savePermissions} disabled={selectedRole.locked || !isDirty}>Lưu quyền</button>
              </div>
            </div>

            <div className="s6a-filter-bar permission-filter">
              <label className="s6a-search-field wide"><span>Tìm module</span><input type="search" value={moduleSearch} onChange={(event) => setModuleSearch(event.target.value)} placeholder="Tên module hoặc nhóm chức năng..." /></label>
              <label><span>Nhóm module</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}><option value="all">Tất cả nhóm</option><option value="Gia phả">Gia phả</option><option value="Đời sống dòng họ">Đời sống dòng họ</option><option value="Nền tảng">Nền tảng</option></select></label>
            </div>

            {loading ? (
              <AdminStatePanel kind="loading" message="Đang tải cấu hình quyền..." />
            ) : filteredModules.length === 0 ? (
              <AdminStatePanel kind="empty" title="Không tìm thấy module" message="Thử từ khóa khác hoặc chọn tất cả nhóm module." action={<button type="button" className="s6a-button secondary" onClick={() => { setModuleSearch(''); setCategoryFilter('all'); }}>Xóa bộ lọc</button>} />
            ) : (
              <div className="s6a-table-wrap">
                <table className="s6a-table s6a-permission-table">
                  <thead>
                    <tr>
                      <th>Module</th>
                      {permissionColumns.map((column) => <th key={column.key} title={column.description}>{column.label}</th>)}
                      <th>Tất cả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModules.map((module) => {
                      const permissions = selectedRole.permissions[module.id] || emptyPermissions();
                      const allChecked = permissionColumns.every((column) => permissions[column.key]);
                      return (
                        <tr key={module.id}>
                          <td><div className="s6a-primary-cell"><strong>{module.label}</strong><span>{module.category} · {module.description}</span></div></td>
                          {permissionColumns.map((column) => (
                            <td key={column.key} data-label={column.label}>
                              <label className="s6a-checkbox-wrap">
                                <input
                                  type="checkbox"
                                  checked={permissions[column.key]}
                                  disabled={selectedRole.locked}
                                  onChange={() => togglePermission(module.id, column.key)}
                                  aria-label={`${column.label} – ${module.label}`}
                                />
                                <span aria-hidden="true" />
                              </label>
                            </td>
                          ))}
                          <td data-label="Tất cả">
                            <label className="s6a-checkbox-wrap all">
                              <input type="checkbox" checked={allChecked} disabled={selectedRole.locked} onChange={() => toggleModuleRow(module.id)} aria-label={`Toàn quyền – ${module.label}`} />
                              <span aria-hidden="true" />
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <AdminConfirmDialog
        open={confirmReset}
        title="Đặt lại Thay đổi Quyền?"
        message={`Mọi chỉnh sửa chưa lưu của vai trò “${selectedRole.name}” sẽ bị hủy và ma trận trở về trạng thái đã lưu gần nhất.`}
        confirmLabel="Đặt lại quyền"
        tone="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={resetPermissions}
      />
    </section>
  );
};

export default RolePermissionManagement;
