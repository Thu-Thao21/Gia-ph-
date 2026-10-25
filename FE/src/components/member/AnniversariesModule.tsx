import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, FeatureEmptyState, FeatureIcon, FeatureModal, FeaturePagination, FeatureToast } from '../common/FeatureUI';
import { memorialMockData, type MemorialRecord } from '../../data/sprint5MockData';
import { useLocalPreviewState } from '../../features/familyAdmin/useLocalPreviewState';
import './AnniversariesModule.css';

type ModalState = { mode: 'add' | 'edit' | 'detail'; item?: MemorialRecord } | null;
type MemorialForm = Omit<MemorialRecord, 'id'>;
const EMPTY_FORM: MemorialForm = { name: '', initial: '', generation: 4, deathDate: '', memorialDate: '', lunarDate: '', relationship: '', reminder: true, notes: '' };
const PAGE_SIZE = 4;

const parseDate = (value: string) => {
  const parts = value.includes('/') ? value.split('/').reverse() : value.split('-');
  const stamp = new Date(parts.join('-')).getTime();
  return Number.isNaN(stamp) ? Number.MAX_SAFE_INTEGER : stamp;
};

const displayDate = (value: string) => {
  if (!value.includes('-')) return value;
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

const inputDate = (value: string) => {
  if (!value.includes('/')) return value;
  const [day, month, year] = value.split('/');
  return `${year}-${month}-${day}`;
};

export const AnniversariesModule: React.FC = () => {
  const [records, setRecords] = useLocalPreviewState<MemorialRecord[]>('memorials', memorialMockData);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reminderFilter, setReminderFilter] = useState<'all' | 'on' | 'off'>('all');
  const [sort, setSort] = useState<'date' | 'name' | 'generation'>('date');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<MemorialForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<MemorialRecord | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => { const timer = window.setTimeout(() => setLoading(false), 320); return () => window.clearTimeout(timer); }, []);

  const filtered = useMemo(() => records.filter((item) => {
    const matchesText = `${item.name} ${item.relationship} ${item.notes}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'));
    const matchesReminder = reminderFilter === 'all' || (reminderFilter === 'on' ? item.reminder : !item.reminder);
    return matchesText && matchesReminder;
  }).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'vi') : sort === 'generation' ? a.generation - b.generation : parseDate(a.memorialDate) - parseDate(b.memorialDate)), [records, search, reminderFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [search, reminderFilter, sort]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const openForm = (item?: MemorialRecord) => {
    setErrors({});
    setForm(item ? { ...item, deathDate: inputDate(item.deathDate), memorialDate: inputDate(item.memorialDate) } : EMPTY_FORM);
    setModal({ mode: item ? 'edit' : 'add', item });
  };

  const saveRecord = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'Vui lòng nhập tên người đã mất.';
    if (!form.deathDate) nextErrors.deathDate = 'Vui lòng chọn ngày mất.';
    if (!form.memorialDate) nextErrors.memorialDate = 'Vui lòng chọn ngày tưởng niệm.';
    if (!form.relationship.trim()) nextErrors.relationship = 'Vui lòng nhập mối quan hệ.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const record: MemorialRecord = {
      ...form,
      id: modal?.item?.id || `GT-${String(Date.now()).slice(-5)}`,
      initial: form.initial || form.name.trim().charAt(0).toLocaleUpperCase('vi'),
      deathDate: displayDate(form.deathDate), memorialDate: displayDate(form.memorialDate),
      lunarDate: form.lunarDate.trim() || 'Chưa cập nhật ngày Âm lịch',
    };
    setRecords((current) => modal?.mode === 'edit' ? current.map((item) => item.id === record.id ? record : item) : [record, ...current]);
    setModal(null);
    setToast(modal?.mode === 'edit' ? 'Đã cập nhật ngày tưởng niệm.' : 'Đã thêm ngày tưởng niệm mới.');
  };

  const toggleReminder = (item: MemorialRecord) => {
    setRecords((current) => current.map((record) => record.id === item.id ? { ...record, reminder: !record.reminder } : record));
    setToast(item.reminder ? `Đã tắt nhắc lịch cho ${item.name}.` : `Đã bật nhắc lịch cho ${item.name}.`);
  };

  return <section className="memorial-page" aria-labelledby="memorial-title">
    <header className="memorial-hero"><div><span>ĐỜI SỐNG GIA TỘC</span><h1 id="memorial-title">Ngày giỗ & tưởng niệm</h1><p>Gìn giữ lịch tưởng niệm, ghi chú nghi lễ và chủ động nhắc thành viên trong gia đình.</p></div><button type="button" className="memorial-primary" onClick={() => openForm()}><FeatureIcon name="plus" /> Thêm ngày tưởng niệm</button></header>
    <div className="memorial-kpis"><article><span>Sự kiện tưởng niệm</span><strong>{records.length}</strong><small>Trong lịch gia tộc</small></article><article><span>Đang bật nhắc lịch</span><strong>{records.filter((item) => item.reminder).length}</strong><small>Email và trong ứng dụng</small></article><article><span>Gần nhất</span><strong>15/08</strong><small>Giỗ Cụ Nguyễn Văn Tông</small></article></div>
    <div className="memorial-card">
      <div className="memorial-toolbar"><label><FeatureIcon name="search" /><input aria-label="Tìm ngày tưởng niệm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, quan hệ hoặc ghi chú..." /></label><select aria-label="Lọc nhắc lịch" value={reminderFilter} onChange={(event) => setReminderFilter(event.target.value as typeof reminderFilter)}><option value="all">Tất cả nhắc lịch</option><option value="on">Đang bật</option><option value="off">Đang tắt</option></select><select aria-label="Sắp xếp" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="date">Ngày tưởng niệm</option><option value="name">Tên A–Z</option><option value="generation">Thế hệ</option></select></div>
      {loading ? <div className="memorial-skeleton-grid">{[1,2,3,4].map((item) => <div key={item} />)}</div> : visible.length ? <div className="memorial-grid">{visible.map((item) => <article className="memorial-item" key={item.id}>
        <div className="memorial-item-head"><div className="memorial-avatar">{item.initial}</div><div><span>Đời thứ {item.generation}</span><h2>{item.name}</h2><small>{item.relationship}</small></div><button type="button" className={`memorial-reminder ${item.reminder ? 'on' : ''}`} onClick={() => toggleReminder(item)} aria-pressed={item.reminder} title={item.reminder ? 'Tắt nhắc lịch' : 'Bật nhắc lịch'}><span /></button></div>
        <div className="memorial-date-panel"><FeatureIcon name="calendar" /><div><span>Ngày tưởng niệm</span><strong>{item.memorialDate}</strong><small>{item.lunarDate}</small></div></div>
        <dl><div><dt>Ngày mất</dt><dd>{item.deathDate}</dd></div><div><dt>Nhắc lịch</dt><dd>{item.reminder ? 'Trước 7 ngày' : 'Đang tắt'}</dd></div></dl>
        <p>{item.notes}</p>
        <footer><button type="button" onClick={() => setModal({ mode: 'detail', item })}><FeatureIcon name="eye" /> Chi tiết</button><button type="button" onClick={() => openForm(item)}><FeatureIcon name="edit" /> Sửa</button><button type="button" className="danger" onClick={() => setDeleteTarget(item)}><FeatureIcon name="delete" /></button></footer>
      </article>)}</div> : <FeatureEmptyState title="Không tìm thấy ngày tưởng niệm" description="Không có dữ liệu phù hợp với từ khóa và bộ lọc hiện tại." action={<button className="memorial-primary" onClick={() => openForm()}>Thêm ngày tưởng niệm</button>} />}
      <div className="memorial-pagination-row"><span>Hiển thị {visible.length} / {filtered.length} mục</span><FeaturePagination page={page} totalPages={totalPages} onChange={setPage} /></div>
    </div>
    {modal?.mode === 'detail' && modal.item && <FeatureModal title={modal.item.name} eyebrow="CHI TIẾT TƯỞNG NIỆM" onClose={() => setModal(null)} footer={<><button type="button" className="feature-button secondary" onClick={() => setModal(null)}>Đóng</button><button type="button" className="feature-button primary" onClick={() => openForm(modal.item)}><FeatureIcon name="edit" /> Chỉnh sửa</button></>}><div className="memorial-detail"><div className="memorial-detail-person"><div className="memorial-avatar large">{modal.item.initial}</div><div><strong>{modal.item.name}</strong><span>{modal.item.relationship} · Đời thứ {modal.item.generation}</span></div></div><dl><div><dt>Ngày mất</dt><dd>{modal.item.deathDate}</dd></div><div><dt>Ngày tưởng niệm</dt><dd>{modal.item.memorialDate}</dd></div><div><dt>Âm lịch</dt><dd>{modal.item.lunarDate}</dd></div><div><dt>Nhắc lịch</dt><dd>{modal.item.reminder ? 'Đang bật' : 'Đang tắt'}</dd></div></dl><p>{modal.item.notes}</p></div></FeatureModal>}
    {(modal?.mode === 'add' || modal?.mode === 'edit') && <FeatureModal title={modal.mode === 'edit' ? 'Chỉnh sửa ngày tưởng niệm' : 'Thêm ngày tưởng niệm'} eyebrow="LỊCH GIA TỘC" onClose={() => setModal(null)} wide footer={<><button type="button" className="feature-button secondary" onClick={() => setModal(null)}>Hủy</button><button type="submit" form="memorial-form" className="feature-button primary"><FeatureIcon name="check" /> {modal.mode === 'edit' ? 'Lưu thay đổi' : 'Thêm vào lịch'}</button></>}><form id="memorial-form" className="feature-form-grid" onSubmit={saveRecord} noValidate><div className="feature-field"><label>Người đã mất <em>*</em></label><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ví dụ: Cụ Nguyễn Văn Tông" />{errors.name && <span className="feature-field-error">{errors.name}</span>}</div><div className="feature-field"><label>Quan hệ <em>*</em></label><input value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} placeholder="Ví dụ: Ông nội" />{errors.relationship && <span className="feature-field-error">{errors.relationship}</span>}</div><div className="feature-field"><label>Ngày mất <em>*</em></label><input type="date" value={form.deathDate} onChange={(event) => setForm({ ...form, deathDate: event.target.value })} />{errors.deathDate && <span className="feature-field-error">{errors.deathDate}</span>}</div><div className="feature-field"><label>Ngày tưởng niệm <em>*</em></label><input type="date" value={form.memorialDate} onChange={(event) => setForm({ ...form, memorialDate: event.target.value })} />{errors.memorialDate && <span className="feature-field-error">{errors.memorialDate}</span>}</div><div className="feature-field"><label>Ngày Âm lịch</label><input value={form.lunarDate} onChange={(event) => setForm({ ...form, lunarDate: event.target.value })} placeholder="15 tháng 8 Âm lịch" /></div><div className="feature-field"><label>Thế hệ</label><select value={form.generation} onChange={(event) => setForm({ ...form, generation: Number(event.target.value) })}>{[1,2,3,4,5,6].map((item) => <option key={item} value={item}>Đời thứ {item}</option>)}</select></div><div className="feature-field full"><label>Ghi chú nghi lễ</label><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Thời gian, địa điểm và các lưu ý chuẩn bị..." /></div><label className="memorial-check full"><input type="checkbox" checked={form.reminder} onChange={(event) => setForm({ ...form, reminder: event.target.checked })} /><span><strong>Bật nhắc lịch</strong><small>Nhận thông báo trước ngày tưởng niệm.</small></span></label></form></FeatureModal>}
    {deleteTarget && <ConfirmDialog title="Xóa ngày tưởng niệm?" description={`“${deleteTarget.name}” sẽ bị xóa khỏi lịch tưởng niệm gia tộc.`} confirmLabel="Xóa khỏi lịch" danger onCancel={() => setDeleteTarget(null)} onConfirm={() => { setRecords((current) => current.filter((item) => item.id !== deleteTarget.id)); setDeleteTarget(null); setToast('Đã xóa ngày tưởng niệm.'); }} />}
    {toast && <FeatureToast message={toast} onClose={() => setToast('')} />}
  </section>;
};

export default AnniversariesModule;
