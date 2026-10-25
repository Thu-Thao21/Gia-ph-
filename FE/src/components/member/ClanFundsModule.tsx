import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, FeatureEmptyState, FeatureIcon, FeatureModal, FeaturePagination, FeatureToast } from '../common/FeatureUI';
import { fundTransactionMockData, type FundTransactionRecord, type FundTransactionStatus, type FundTransactionType } from '../../data/sprint5MockData';
import { useLocalPreviewState } from '../../features/familyAdmin/useLocalPreviewState';
import './ClanFundsModule.css';

type TransactionForm = Omit<FundTransactionRecord, 'id'>;
const EMPTY_FORM: TransactionForm = { type: 'income', amount: 0, description: '', party: '', date: '', createdBy: 'Võ Văn Thắng', status: 'pending' };
const PAGE_SIZE = 5;
const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const displayDate = (value: string) => value.includes('-') ? value.split('-').reverse().join('/') : value;
const inputDate = (value: string) => value.includes('/') ? value.split('/').reverse().join('-') : value;
const dateStamp = (value: string) => new Date(inputDate(value)).getTime() || 0;
const statusLabels: Record<FundTransactionStatus, string> = { confirmed: 'Đã xác nhận', pending: 'Chờ duyệt', cancelled: 'Đã hủy' };

export interface ClanFundsModuleProps { canManage?: boolean }

export const ClanFundsModule: React.FC<ClanFundsModuleProps> = ({ canManage = true }) => {
  const [transactions, setTransactions] = useLocalPreviewState<FundTransactionRecord[]>('funds', fundTransactionMockData);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FundTransactionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | FundTransactionStatus>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<'newest' | 'amount-high' | 'amount-low'>('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FundTransactionRecord | null>(null);
  const [editing, setEditing] = useState<FundTransactionRecord | 'new' | null>(null);
  const [form, setForm] = useState<TransactionForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmTarget, setConfirmTarget] = useState<{ item: FundTransactionRecord; action: 'delete' | 'cancel' } | null>(null);
  const [toast, setToast] = useState('');

  const confirmed = transactions.filter((item) => item.status === 'confirmed');
  const totalIncome = confirmed.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const totalExpense = confirmed.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  const balance = totalIncome - totalExpense;

  const filtered = useMemo(() => transactions.filter((item) => {
    const text = `${item.id} ${item.description} ${item.party} ${item.createdBy}`.toLocaleLowerCase('vi');
    const stamp = dateStamp(item.date);
    return text.includes(search.trim().toLocaleLowerCase('vi')) && (typeFilter === 'all' || item.type === typeFilter) && (statusFilter === 'all' || item.status === statusFilter) && (!fromDate || stamp >= new Date(fromDate).getTime()) && (!toDate || stamp <= new Date(toDate).getTime());
  }).sort((a, b) => sort === 'amount-high' ? b.amount - a.amount : sort === 'amount-low' ? a.amount - b.amount : dateStamp(b.date) - dateStamp(a.date)), [transactions, search, typeFilter, statusFilter, fromDate, toDate, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [search, typeFilter, statusFilter, fromDate, toDate, sort]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const openForm = (item?: FundTransactionRecord) => {
    if (!canManage) return;
    setEditing(item || 'new'); setErrors({});
    setForm(item ? { ...item, date: inputDate(item.date) } : { ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
  };

  const saveTransaction = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.amount || form.amount <= 0) nextErrors.amount = 'Số tiền phải lớn hơn 0.';
    if (!form.description.trim()) nextErrors.description = 'Vui lòng nhập nội dung giao dịch.';
    if (!form.party.trim()) nextErrors.party = 'Vui lòng nhập người đóng góp / nhận tiền.';
    if (!form.date) nextErrors.date = 'Vui lòng chọn ngày giao dịch.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const existing = editing !== 'new' ? editing : null;
    const record: FundTransactionRecord = { ...form, id: existing?.id || `GD-${String(Date.now()).slice(-6)}`, date: displayDate(form.date) };
    setTransactions((current) => existing ? current.map((item) => item.id === record.id ? record : item) : [record, ...current]);
    setEditing(null); setSelected(record); setToast(existing ? 'Đã cập nhật giao dịch.' : 'Đã thêm giao dịch mới.');
  };

  const confirmAction = () => {
    if (!confirmTarget) return;
    if (confirmTarget.action === 'delete') setTransactions((current) => current.filter((item) => item.id !== confirmTarget.item.id));
    else setTransactions((current) => current.map((item) => item.id === confirmTarget.item.id ? { ...item, status: 'cancelled' } : item));
    setSelected(null); setToast(confirmTarget.action === 'delete' ? 'Đã xóa giao dịch thành công.' : 'Đã hủy giao dịch đang chờ.'); setConfirmTarget(null);
  };

  const clearFilters = () => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setFromDate(''); setToDate(''); setSort('newest'); };

  return <section className="family-fund-page" aria-labelledby="fund-title">
    <header className="fund-hero"><div><span>TÀI CHÍNH GIA TỘC</span><h1 id="fund-title">Quỹ & thu chi dòng họ</h1><p>Theo dõi số dư, minh bạch giao dịch và quản lý đóng góp dòng họ.</p></div><button type="button" className="fund-primary" disabled={!canManage} title={!canManage ? 'Chỉ Chủ dòng họ có quyền tạo giao dịch' : undefined} onClick={() => openForm()}><FeatureIcon name="plus" /> Thêm giao dịch</button></header>
    <div className="fund-kpis"><article><span>Số dư hiện tại</span><strong>{formatVnd(balance)}</strong><small>Cập nhật từ giao dịch đã xác nhận</small></article><article className="income"><span>Tổng thu</span><strong>{formatVnd(totalIncome)}</strong><small>{confirmed.filter((item) => item.type === 'income').length} khoản thu</small></article><article className="expense"><span>Tổng chi</span><strong>{formatVnd(totalExpense)}</strong><small>{confirmed.filter((item) => item.type === 'expense').length} khoản chi</small></article><article><span>Số giao dịch</span><strong>{transactions.length}</strong><small>{transactions.filter((item) => item.status === 'pending').length} đang chờ duyệt</small></article></div>
    <div className="fund-insight-grid"><article className="fund-chart"><div><h2>Thu và chi theo kỳ</h2><span>Biểu đồ 6 tháng gần nhất</span></div><div className="fund-bars" aria-label="Biểu đồ thu chi"><div><span style={{height:'48%'}} /><i style={{height:'24%'}} /><small>T4</small></div><div><span style={{height:'62%'}} /><i style={{height:'38%'}} /><small>T5</small></div><div><span style={{height:'55%'}} /><i style={{height:'34%'}} /><small>T6</small></div><div><span style={{height:'73%'}} /><i style={{height:'45%'}} /><small>T7</small></div><div><span style={{height:'68%'}} /><i style={{height:'32%'}} /><small>T8</small></div><div><span style={{height:'92%'}} /><i style={{height:'51%'}} /><small>T9</small></div></div><footer><span><i className="income-dot" /> Thu</span><span><i className="expense-dot" /> Chi</span></footer></article><article className="fund-permission-card"><div className={canManage ? 'allowed' : 'limited'}><FeatureIcon name={canManage ? 'check' : 'lock'} size={22} /></div><h2>{canManage ? 'Quyền Chủ dòng họ' : 'Quyền Thành viên'}</h2><p>{canManage ? 'Bạn có thể thêm, sửa, hủy và xem chi tiết giao dịch.' : 'Bạn có thể xem báo cáo. Các thao tác ghi sổ đang bị khóa theo quyền dữ liệu.'}</p><span>{canManage ? 'TOÀN QUYỀN QUẢN LÝ' : 'CHỈ XEM'}</span></article></div>
    <div className="fund-table-card">
      <div className="fund-table-heading"><div><h2>Lịch sử giao dịch</h2><span>Thu, chi và trạng thái xác nhận</span></div><button type="button" onClick={clearFilters}>Đặt lại bộ lọc</button></div>
      <div className="fund-toolbar"><label className="fund-search"><FeatureIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, nội dung, người nhận..." aria-label="Tìm giao dịch" /></label><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} aria-label="Lọc loại"><option value="all">Tất cả loại</option><option value="income">Khoản thu</option><option value="expense">Khoản chi</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Lọc trạng thái"><option value="all">Tất cả trạng thái</option><option value="confirmed">Đã xác nhận</option><option value="pending">Chờ duyệt</option><option value="cancelled">Đã hủy</option></select><label className="fund-date"><span>Từ</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Từ ngày" /></label><label className="fund-date"><span>Đến</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Đến ngày" /></label><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sắp xếp"><option value="newest">Mới nhất</option><option value="amount-high">Số tiền giảm dần</option><option value="amount-low">Số tiền tăng dần</option></select></div>
      <div className="fund-table-wrap"><table className="fund-table"><thead><tr><th>Mã giao dịch</th><th>Loại</th><th>Nội dung</th><th>Người góp / nhận</th><th>Ngày</th><th>Số tiền</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{item.id}</strong><small>Tạo bởi {item.createdBy}</small></td><td><span className={`fund-type ${item.type}`}>{item.type === 'income' ? 'Thu' : 'Chi'}</span></td><td><strong>{item.description}</strong></td><td>{item.party}</td><td>{item.date}</td><td className={`fund-amount ${item.type}`}>{item.type === 'income' ? '+' : '−'}{formatVnd(item.amount)}</td><td><span className={`fund-status ${item.status}`}>{statusLabels[item.status]}</span></td><td><div className="fund-actions"><button type="button" onClick={() => setSelected(item)} title="Xem chi tiết"><FeatureIcon name="eye" /></button><button type="button" disabled={!canManage || item.status === 'cancelled'} onClick={() => openForm(item)} title={!canManage ? 'Không có quyền sửa' : 'Sửa'}><FeatureIcon name="edit" /></button></div></td></tr>)}</tbody></table>{!visible.length && <FeatureEmptyState title="Không có giao dịch phù hợp" description="Hãy thay đổi khoảng ngày hoặc bộ lọc trạng thái." action={<button type="button" className="fund-primary" onClick={clearFilters}>Xóa bộ lọc</button>} />}</div>
      <div className="fund-table-footer"><span>Hiển thị {visible.length} / {filtered.length} giao dịch</span><FeaturePagination page={page} totalPages={totalPages} onChange={setPage} /></div>
    </div>
    {editing && <FeatureModal title={editing === 'new' ? 'Thêm giao dịch' : `Chỉnh sửa ${editing.id}`} eyebrow="SỔ QUỸ GIA TỘC" onClose={() => setEditing(null)} wide footer={<><button type="button" className="feature-button secondary" onClick={() => setEditing(null)}>Hủy</button><button type="submit" form="fund-transaction-form" className="feature-button primary"><FeatureIcon name="check" /> Lưu giao dịch</button></>}><form id="fund-transaction-form" className="feature-form-grid" onSubmit={saveTransaction} noValidate><div className="feature-field"><label>Loại giao dịch <em>*</em></label><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as FundTransactionType })}><option value="income">Khoản thu</option><option value="expense">Khoản chi</option></select></div><div className="feature-field"><label>Số tiền (VND) <em>*</em></label><input type="number" min="1" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} placeholder="0" />{errors.amount && <span className="feature-field-error">{errors.amount}</span>}</div><div className="feature-field full"><label>Nội dung giao dịch <em>*</em></label><input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Mục đích thu / chi" />{errors.description && <span className="feature-field-error">{errors.description}</span>}</div><div className="feature-field"><label>Người đóng góp / nhận tiền <em>*</em></label><input value={form.party} onChange={(event) => setForm({ ...form, party: event.target.value })} placeholder="Tên cá nhân hoặc đơn vị" />{errors.party && <span className="feature-field-error">{errors.party}</span>}</div><div className="feature-field"><label>Ngày giao dịch <em>*</em></label><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />{errors.date && <span className="feature-field-error">{errors.date}</span>}</div><div className="feature-field"><label>Người tạo</label><input value={form.createdBy} onChange={(event) => setForm({ ...form, createdBy: event.target.value })} /></div><div className="feature-field"><label>Trạng thái</label><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FundTransactionStatus })}>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div></form></FeatureModal>}
    {selected && <FeatureModal title={`Giao dịch ${selected.id}`} eyebrow="CHI TIẾT THU CHI" onClose={() => setSelected(null)} footer={<><button type="button" className="feature-button secondary" onClick={() => setSelected(null)}>Đóng</button>{selected.status === 'pending' && <button type="button" className="feature-button danger" disabled={!canManage} onClick={() => setConfirmTarget({ item: selected, action: 'cancel' })}>Hủy giao dịch</button>}<button type="button" className="feature-button primary" disabled={!canManage || selected.status === 'cancelled'} onClick={() => openForm(selected)}><FeatureIcon name="edit" /> Chỉnh sửa</button></>}><div className="fund-detail"><div className={`fund-detail-amount ${selected.type}`}><span>{selected.type === 'income' ? 'Khoản thu' : 'Khoản chi'}</span><strong>{selected.type === 'income' ? '+' : '−'}{formatVnd(selected.amount)}</strong></div><dl><div><dt>Nội dung</dt><dd>{selected.description}</dd></div><div><dt>Người góp / nhận</dt><dd>{selected.party}</dd></div><div><dt>Ngày giao dịch</dt><dd>{selected.date}</dd></div><div><dt>Người tạo</dt><dd>{selected.createdBy}</dd></div><div><dt>Trạng thái</dt><dd><span className={`fund-status ${selected.status}`}>{statusLabels[selected.status]}</span></dd></div></dl>{canManage && <button type="button" className="fund-delete-link" onClick={() => setConfirmTarget({ item: selected, action: 'delete' })}><FeatureIcon name="delete" /> Xóa bản ghi</button>}</div></FeatureModal>}
    {confirmTarget && <ConfirmDialog title={confirmTarget.action === 'delete' ? 'Xóa giao dịch?' : 'Hủy giao dịch?'} description={confirmTarget.action === 'delete' ? `${confirmTarget.item.id} sẽ bị xóa khỏi sổ quỹ gia tộc.` : `${confirmTarget.item.id} sẽ chuyển sang trạng thái “Đã hủy” và không được tính vào số dư.`} confirmLabel={confirmTarget.action === 'delete' ? 'Xóa giao dịch' : 'Xác nhận hủy'} danger onCancel={() => setConfirmTarget(null)} onConfirm={confirmAction} />}
    {toast && <FeatureToast message={toast} onClose={() => setToast('')} />}
  </section>;
};

export default ClanFundsModule;
