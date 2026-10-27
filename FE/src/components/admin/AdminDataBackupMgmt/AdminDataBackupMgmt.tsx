import React, { useEffect, useMemo, useState } from 'react';
import { backupMockData, type BackupRecord, type BackupStatus } from '../../../data/adminOperationsMockData';
import { AdminConfirmDialog, AdminModal, AdminPageHeader, AdminPagination, AdminStatePanel, AdminStatusBadge, AdminToast, formatAdminDate, useAdminToast } from '../PlatformAdmin/shared';
import '../PlatformAdmin/PlatformAdmin.css';

const PAGE_SIZE = 4;

export const AdminDataBackupMgmt: React.FC = () => {
  const [backups, setBackups] = useState<BackupRecord[]>(() => backupMockData.map((item) => ({ ...item })));
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | BackupRecord['type']>('all');
  const [status, setStatus] = useState<'all' | BackupStatus>('all');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<BackupRecord['type']>('Full');
  const [createName, setCreateName] = useState('');
  const [confirm, setConfirm] = useState<{ action: 'restore' | 'delete'; item: BackupRecord } | null>(null);
  const { toast, showToast, dismissToast } = useAdminToast();

  useEffect(() => { const timer = window.setTimeout(() => setLoading(false), 330); return () => window.clearTimeout(timer); }, []);
  useEffect(() => setPage(1), [search, type, status]);
  const filtered = useMemo(() => backups.filter((item) => `${item.name} ${item.id} ${item.createdBy}`.toLowerCase().includes(search.trim().toLowerCase()) && (type === 'all' || item.type === type) && (status === 'all' || item.status === status)), [backups, search, type, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const createBackup = (event: React.FormEvent) => {
    event.preventDefault();
    const date = new Date();
    const id = `BAK-${String(Date.now()).slice(-6)}`;
    const defaultName = `mfgms_${createType.toLowerCase()}_${date.toISOString().slice(0,10).replace(/-/g,'_')}.sql.gz`;
    const record: BackupRecord = { id, name: createName.trim() || defaultName, type: createType, createdAt: date.toISOString(), size: 'Đang tính...', status: 'processing', createdBy: 'Admin hệ thống' };
    setBackups((items) => [record, ...items]); setShowCreate(false); showToast('Đã bắt đầu tạo bản sao lưu.', 'info');
    window.setTimeout(() => { setBackups((items) => items.map((item) => item.id === id ? { ...item, size: createType === 'Incremental' ? '196 MB' : '2.91 GB', status: 'success' } : item)); showToast('Bản sao lưu đã hoàn tất và được kiểm tra checksum.'); }, 1600);
  };

  const download = (item: BackupRecord) => {
    const blob = new Blob([`MFGMS backup\n${item.id}\n${item.createdAt}`], {type:'application/gzip'});
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href=url; anchor.download=`${item.name}.gz`; anchor.click(); URL.revokeObjectURL(url); showToast(`Đã tạo tệp tải xuống ${item.name}.`);
  };

  const confirmAction = () => {
    if (!confirm) return;
    if (confirm.action === 'delete') { setBackups((items) => items.filter((item) => item.id !== confirm.item.id)); showToast('Đã xóa bản sao lưu thành công.'); }
    else { showToast(`Đã tạo tác vụ khôi phục từ ${confirm.item.name}.`, 'info'); }
    setConfirm(null);
  };

  const reset = () => { setSearch(''); setType('all'); setStatus('all'); };
  return <section className="s6a-page">
    <AdminPageHeader eyebrow="AN TOÀN DỮ LIỆU" title="Sao lưu & Khôi phục" description="Tạo snapshot, theo dõi trạng thái và quy trình khôi phục an toàn có xác nhận." actions={<button type="button" className="s6a-button primary" onClick={() => { setCreateName(''); setCreateType('Full'); setShowCreate(true); }}>+ Tạo bản sao lưu</button>} />
    <div className="s6a-metric-grid four">
      <article className="s6a-metric-card theme-blue">
        <span className="s6a-metric-title">Bản sao lưu</span>
        <strong className="s6a-metric-val">{backups.length}</strong>
        <small className="s6a-metric-sub">Trong lịch sử hiện tại</small>
      </article>

      <article className="s6a-metric-card theme-emerald">
        <span className="s6a-metric-title">Hoàn tất</span>
        <strong className="s6a-metric-val">{backups.filter((item) => item.status === 'success').length}</strong>
        <small className="s6a-metric-sub">Checksum hợp lệ</small>
      </article>

      <article className="s6a-metric-card theme-amber">
        <span className="s6a-metric-title">Đang xử lý</span>
        <strong className="s6a-metric-val">{backups.filter((item) => item.status === 'processing').length}</strong>
        <small className="s6a-metric-sub">Tác vụ nền</small>
      </article>

      <article className="s6a-metric-card theme-purple">
        <span className="s6a-metric-title">Lần gần nhất</span>
        <strong className="s6a-metric-val">02:00</strong>
        <small className="s6a-metric-sub">14/09/2026 · Full</small>
      </article>
    </div>
    <div className="s6a-card"><div className="s6a-card-heading"><div><h2>Lịch sử sao lưu</h2><p>Tải xuống, khôi phục hoặc xóa các bản snapshot.</p></div><span className="s6a-count-pill">{filtered.length} bản ghi</span></div><div className="s6a-filter-bar s6a-filter-grid"><label className="s6a-search-field wide"><span>Tìm kiếm</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên file, mã backup, người tạo..." /></label><label><span>Loại</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}><option value="all">Tất cả</option><option value="Full">Full</option><option value="Incremental">Incremental</option><option value="Manual">Manual</option></select></label><label><span>Trạng thái</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">Tất cả</option><option value="success">Hoàn tất</option><option value="processing">Đang xử lý</option><option value="failed">Thất bại</option></select></label><button type="button" className="s6a-button ghost align-end" onClick={reset}>Đặt lại</button></div>
      {loading ? <AdminStatePanel kind="loading" message="Đang tải lịch sử sao lưu..." /> : !visible.length ? <AdminStatePanel kind="empty" title="Không có bản sao lưu phù hợp" message="Thử thay đổi bộ lọc hoặc tạo một bản sao lưu mới." /> : <><div className="s6a-table-wrap"><table className="s6a-table"><thead><tr><th>Tên / Mã</th><th>Loại</th><th>Ngày tạo</th><th>Dung lượng</th><th>Người tạo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><span className="s6a-table-subline">{item.id}</span></td><td>{item.type}</td><td>{formatAdminDate(item.createdAt,true)}</td><td>{item.size}</td><td>{item.createdBy}</td><td><AdminStatusBadge status={item.status} label={item.status === 'success' ? 'Hoàn tất' : item.status === 'processing' ? 'Đang xử lý' : 'Thất bại'} /></td><td><div className="s6a-inline-actions"><button className="s6a-link-button" disabled={item.status !== 'success'} onClick={() => download(item)}>Tải xuống</button><button className="s6a-link-button" disabled={item.status !== 'success'} onClick={() => setConfirm({action:'restore',item})}>Khôi phục</button><button className="s6a-link-button danger-text" disabled={item.status === 'processing'} onClick={() => setConfirm({action:'delete',item})}>Xóa</button></div></td></tr>)}</tbody></table></div><AdminPagination page={safePage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} /></>}
    </div>
    <AdminModal open={showCreate} title="Tạo bản sao lưu" description="Tạo snapshot dữ liệu toàn bộ hệ thống cơ sở dữ liệu." onClose={() => setShowCreate(false)} size="sm" footer={<><button type="button" className="s6a-button secondary" onClick={() => setShowCreate(false)}>Hủy</button><button type="submit" form="create-backup-form" className="s6a-button primary">Bắt đầu sao lưu</button></>}><form id="create-backup-form" className="s6a-form s6a-form-grid one-column" onSubmit={createBackup}><label className="full"><span>Loại sao lưu</span><select value={createType} onChange={(event) => setCreateType(event.target.value as BackupRecord['type'])}><option value="Full">Toàn bộ hệ thống (Full)</option><option value="Incremental">Thay đổi gần nhất (Incremental)</option><option value="Manual">Snapshot thủ công</option></select></label><label className="full"><span>Tên file tùy chọn</span><input value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Để trống để hệ thống tự đặt tên" /></label><div className="s6a-form-note full">Bản sao lưu sẽ chuyển từ “Đang xử lý” sang “Hoàn tất” sau vài giây.</div></form></AdminModal>
    <AdminConfirmDialog open={Boolean(confirm)} title={confirm?.action === 'restore' ? 'Khôi phục từ bản sao lưu?' : 'Xóa bản sao lưu?'} message={confirm ? (confirm.action === 'restore' ? `Hệ thống sẽ thực hiện khôi phục từ ${confirm.item.name}.` : `${confirm.item.name} sẽ bị xóa khỏi danh sách.`) : ''} confirmLabel={confirm?.action === 'restore' ? 'Tạo tác vụ khôi phục' : 'Xác nhận xóa'} tone={confirm?.action === 'delete' ? 'danger' : 'primary'} onCancel={() => setConfirm(null)} onConfirm={confirmAction} />
    <AdminToast toast={toast} onDismiss={dismissToast} />
  </section>;
};

export default AdminDataBackupMgmt;
