import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../../../api/axios';
import { type AuditLevel, type AuditLogRecord, type AuditStatus } from '../../../types/adminOperations.types';
import { AdminModal, AdminPageHeader, AdminPagination, AdminStatePanel, AdminStatusBadge, formatAdminDate } from '../PlatformAdmin/shared';
import { fetchClanAuditLogs, type ClanAuditLogItem } from '../../../services/genealogy.service';
import { useClanContext } from '../../../context/ClanContext';
import '../PlatformAdmin/PlatformAdmin.css';

const PAGE_SIZE = 5;
const levelLabels: Record<AuditLevel, string> = { info: 'Thông tin', warning: 'Cảnh báo', security: 'Bảo mật', error: 'Lỗi' };

export const AdminAuditLogsMgmt: React.FC = () => {
  const { activeClanId } = useClanContext();
  const effectiveClanId = activeClanId || '';

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<'all' | AuditLevel>('all');
  const [status, setStatus] = useState<'all' | AuditStatus>('all');
  const [module, setModule] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLogRecord | null>(null);

  const loadAuditLogsFromDb = async () => {
    setLoading(true);
    try {
      // 1. Ưu tiên lấy nhật ký toàn hệ thống từ /admin/audit-logs trên PostgreSQL
      const res = await apiClient.get<any>('/admin/audit-logs').catch(() => null);
      if (res && res.data && Array.isArray(res.data.items)) {
        const mapped: AuditLogRecord[] = res.data.items.map((item: any) => {
          const actLower = (item.action || '').toLowerCase();
          const isErr = actLower.includes('lỗi') || actLower.includes('thất bại');
          const isWarn = actLower.includes('xóa') || actLower.includes('từ chối');
          const isSec = actLower.includes('bảo mật') || actLower.includes('phân quyền') || actLower.includes('khóa');

          return {
            id: item.id,
            timestamp: item.timestamp || new Date().toISOString(),
            user: item.user || 'Quản trị viên',
            action: item.action || 'Thao tác hệ thống',
            module: item.module || 'Hệ thống',
            ip: item.ip || '127.0.0.1',
            device: item.device || 'Web Admin Client',
            status: isErr ? 'failed' : 'success',
            level: isErr ? 'error' : isSec ? 'security' : isWarn ? 'warning' : 'info',
            detail: item.detail || item.action,
          };
        });
        setLogs(mapped);
        return;
      }

      // 2. Dự phòng theo ID dòng họ nếu có
      if (effectiveClanId) {
        const realLogs = await fetchClanAuditLogs(effectiveClanId);
        const mapped: AuditLogRecord[] = realLogs.map((item: ClanAuditLogItem) => {
          const actLower = (item.action || '').toLowerCase();
          const isErr = actLower.includes('lỗi') || actLower.includes('thất bại');
          const isWarn = actLower.includes('xóa') || actLower.includes('từ chối');
          const isSec = actLower.includes('bảo mật') || actLower.includes('phân quyền') || actLower.includes('khóa');

          return {
            id: item.id,
            timestamp: item.occurredAt || new Date().toISOString(),
            user: item.actorName || 'Quản trị viên',
            action: item.action || 'Thao tác hệ thống',
            module: item.actionType || 'Hệ thống',
            ip: '127.0.0.1',
            device: 'Máy chủ Web / DB',
            status: isErr ? 'failed' : 'success',
            level: isErr ? 'error' : isSec ? 'security' : isWarn ? 'warning' : 'info',
            detail: item.details || item.action,
          };
        });
        setLogs(mapped);
      } else {
        setLogs([]);
      }
    } catch (err) {
      console.error('Lỗi khi tải nhật ký kiểm toán từ Database:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogsFromDb();
  }, [effectiveClanId]);

  useEffect(() => setPage(1), [search, level, status, module, fromDate, toDate]);
  const modules = Array.from(new Set(logs.map((item) => item.module)));
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const filtered = useMemo(() => logs.filter((item) => {
    const needle = search.trim().toLowerCase();
    const text = `${item.id} ${item.user} ${item.action} ${item.module} ${item.ip} ${item.device}`.toLowerCase();
    const itemDate = item.timestamp.slice(0, 10);
    return text.includes(needle) && (level === 'all' || item.level === level) && (status === 'all' || item.status === status) && (module === 'all' || item.module === module) && (!fromDate || itemDate >= fromDate) && (!toDate || itemDate <= toDate);
  }), [logs, search, level, status, module, fromDate, toDate]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const reset = () => { setSearch(''); setLevel('all'); setStatus('all'); setModule('all'); setFromDate(''); setToDate(''); };

  return <section className="s6a-page">
    <AdminPageHeader eyebrow="GIÁM SÁT & BẢO MẬT" title="Nhật ký hệ thống" description="Theo dõi thao tác, thiết bị và sự kiện bảo mật trong toàn bộ nền tảng (Dữ liệu thời gian thực từ Database Neon)." actions={<button type="button" className="s6a-button secondary" onClick={() => { const blob = new Blob([JSON.stringify(filtered, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='system-logs.json'; a.click(); URL.revokeObjectURL(url); }}>Xuất nhật ký</button>} />
    <div className="s6a-metric-grid four">
      <article className="s6a-metric-card theme-blue">
        <span className="s6a-metric-title">Tổng bản ghi</span>
        <strong className="s6a-metric-val">{logs.length}</strong>
        <small className="s6a-metric-sub">Nhật ký từ Database</small>
      </article>

      <article className="s6a-metric-card theme-purple">
        <span className="s6a-metric-title">Sự kiện bảo mật</span>
        <strong className="s6a-metric-val">{logs.filter((item) => item.level === 'security').length}</strong>
        <small className="s6a-metric-sub">Cần theo dõi</small>
      </article>

      <article className="s6a-metric-card theme-amber">
        <span className="s6a-metric-title">Cảnh báo &amp; lỗi</span>
        <strong className="s6a-metric-val">{logs.filter((item) => item.level === 'warning' || item.level === 'error').length}</strong>
        <small className="s6a-metric-sub">Trong CSDL</small>
      </article>

      <article className="s6a-metric-card theme-emerald">
        <span className="s6a-metric-title">Thành công</span>
        <strong className="s6a-metric-val">
          {logs.length ? Math.round(logs.filter((item) => item.status === 'success').length / logs.length * 100) : 100}%
        </strong>
        <small className="s6a-metric-sub">Tỷ lệ tác vụ hoàn tất</small>
      </article>
    </div>
    <div className="s6a-card"><div className="s6a-card-heading"><div><h2>Dòng sự kiện hệ thống</h2><p>Tìm theo người dùng, hành động, module, IP hoặc thiết bị.</p></div><span className="s6a-count-pill">{filtered.length} bản ghi</span></div><div className="s6a-filter-bar s6a-filter-grid"><label className="s6a-search-field wide"><span>Tìm kiếm</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã log, tài khoản, hành động, IP..." /></label><label><span>Module</span><select value={module} onChange={(event) => setModule(event.target.value)}><option value="all">Tất cả</option>{modules.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Mức độ</span><select value={level} onChange={(event) => setLevel(event.target.value as typeof level)}><option value="all">Tất cả</option>{Object.entries(levelLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Trạng thái</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">Tất cả</option><option value="success">Thành công</option><option value="failed">Thất bại</option></select></label><label><span>Từ ngày</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label><span>Đến ngày</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><button type="button" className="s6a-button ghost align-end" onClick={reset}>Đặt lại</button></div>
      {invalidRange ? <AdminStatePanel kind="error" title="Khoảng ngày không hợp lệ" message="Ngày bắt đầu phải trước hoặc trùng ngày kết thúc." action={<button className="s6a-button secondary" onClick={() => setToDate('')}>Xóa ngày kết thúc</button>} /> : loading ? (
        <AdminStatePanel
          kind="loading"
          title="Đang đồng bộ nhật ký an ninh..."
          message="Hệ thống đang truy xuất luồng kiểm toán an ninh và lịch sử hoạt động..."
        />
      ) : !visible.length ? <AdminStatePanel kind="empty" title="Không có nhật ký phù hợp" message="Thử thay đổi bộ lọc hoặc khoảng thời gian." action={<button className="s6a-button secondary" onClick={reset}>Xóa bộ lọc</button>} /> : <><div className="s6a-table-wrap"><table className="s6a-table"><thead><tr><th>Thời gian / Mã</th><th>Người dùng</th><th>Hành động</th><th>Module</th><th>IP / Thiết bị</th><th>Mức độ</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{formatAdminDate(item.timestamp,true)}</strong><span className="s6a-table-subline">{item.id}</span></td><td>{item.user}</td><td><strong>{item.action}</strong></td><td>{item.module}</td><td><span className="s6a-table-main">{item.ip}</span><span className="s6a-table-subline">{item.device}</span></td><td><AdminStatusBadge status={item.level} label={levelLabels[item.level]} /></td><td><AdminStatusBadge status={item.status} /></td><td><button className="s6a-link-button" onClick={() => setSelected(item)}>Xem</button></td></tr>)}</tbody></table></div><AdminPagination page={safePage} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} /></>}
    </div>
    <AdminModal open={Boolean(selected)} title={selected ? selected.action : ''} description={selected?.id} onClose={() => setSelected(null)} size="md" footer={<button type="button" className="s6a-button primary" onClick={() => setSelected(null)}>Đóng</button>}>{selected && <div className="s6a-detail-grid"><div><span>Thời gian</span><strong>{formatAdminDate(selected.timestamp,true)}</strong></div><div><span>Tài khoản</span><strong>{selected.user}</strong></div><div><span>Module</span><strong>{selected.module}</strong></div><div><span>IP / Thiết bị</span><strong>{selected.ip} · {selected.device}</strong></div><div><span>Mức độ</span><AdminStatusBadge status={selected.level} label={levelLabels[selected.level]} /></div><div><span>Trạng thái</span><AdminStatusBadge status={selected.status} /></div><div className="wide"><span>Nội dung chi tiết</span><p>{selected.detail}</p></div></div>}</AdminModal>
  </section>;
};

export default AdminAuditLogsMgmt;
