import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, FeatureEmptyState, FeatureIcon, FeatureModal, FeaturePagination, FeatureToast } from '../common/FeatureUI';
import { eventMockData, type EventParticipant, type EventStatus, type FamilyEventRecord } from '../../data/sprint5MockData';
import { useLocalPreviewState } from '../../features/familyAdmin/useLocalPreviewState';
import './ClanEventsModule.css';

type EventForm = Omit<FamilyEventRecord, 'id' | 'participants'>;
const EMPTY_FORM: EventForm = { name: '', type: 'meeting', description: '', startDate: '', endDate: '', time: '', location: '', organizer: '', status: 'upcoming', notes: '' };
const PAGE_SIZE = 3;
const statusLabels: Record<EventStatus, string> = { upcoming: 'Sắp diễn ra', ongoing: 'Đang diễn ra', completed: 'Đã kết thúc', cancelled: 'Đã hủy' };
const typeLabels = { meeting: 'Họp dòng họ', ceremony: 'Nghi lễ', scholarship: 'Khuyến học', trip: 'Về nguồn' };
const displayDate = (value: string) => value.includes('-') ? value.split('-').reverse().join('/') : value;
const inputDate = (value: string) => value.includes('/') ? value.split('/').reverse().join('-') : value;

export interface ClanEventsModuleProps { canManage?: boolean }

export const ClanEventsModule: React.FC<ClanEventsModuleProps> = ({ canManage = true }) => {
  const [events, setEvents] = useLocalPreviewState<FamilyEventRecord[]>('events', eventMockData);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FamilyEventRecord['type']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | EventStatus>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FamilyEventRecord | null>(null);
  const [editing, setEditing] = useState<FamilyEventRecord | 'new' | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<FamilyEventRecord | null>(null);
  const [removeParticipant, setRemoveParticipant] = useState<EventParticipant | null>(null);
  const [participantName, setParticipantName] = useState('');
  const [participantRelationship, setParticipantRelationship] = useState('');
  const [toast, setToast] = useState('');

  const filtered = useMemo(() => events.filter((item) => {
    const text = `${item.name} ${item.location} ${item.organizer}`.toLocaleLowerCase('vi');
    return text.includes(search.trim().toLocaleLowerCase('vi')) && (typeFilter === 'all' || item.type === typeFilter) && (statusFilter === 'all' || item.status === statusFilter);
  }), [events, search, typeFilter, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [search, typeFilter, statusFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const openForm = (item?: FamilyEventRecord) => {
    if (!canManage) return;
    setEditing(item || 'new'); setErrors({});
    setForm(item ? { name: item.name, type: item.type, description: item.description, startDate: inputDate(item.startDate), endDate: inputDate(item.endDate), time: item.time, location: item.location, organizer: item.organizer, status: item.status, notes: item.notes } : EMPTY_FORM);
  };

  const saveEvent = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = 'Vui lòng nhập tên sự kiện.';
    if (!form.startDate) nextErrors.startDate = 'Vui lòng chọn ngày bắt đầu.';
    if (!form.endDate) nextErrors.endDate = 'Vui lòng chọn ngày kết thúc.';
    if (form.startDate && form.endDate && form.endDate < form.startDate) nextErrors.endDate = 'Ngày kết thúc phải sau ngày bắt đầu.';
    if (!form.time.trim()) nextErrors.time = 'Vui lòng nhập thời gian.';
    if (!form.location.trim()) nextErrors.location = 'Vui lòng nhập địa điểm.';
    if (!form.organizer.trim()) nextErrors.organizer = 'Vui lòng nhập đơn vị tổ chức.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const existing = editing !== 'new' ? editing : null;
    const record: FamilyEventRecord = { ...form, id: existing?.id || `SK-${String(Date.now()).slice(-5)}`, startDate: displayDate(form.startDate), endDate: displayDate(form.endDate), participants: existing?.participants || [] };
    setEvents((current) => existing ? current.map((item) => item.id === record.id ? record : item) : [record, ...current]);
    setSelected(record); setEditing(null); setToast(existing ? 'Đã cập nhật sự kiện.' : 'Đã tạo sự kiện mới.');
  };

  const addParticipant = () => {
    if (!selected || !participantName.trim()) return;
    const participant: EventParticipant = { id: `TV-${Date.now()}`, name: participantName.trim(), initial: participantName.trim().charAt(0).toUpperCase(), relationship: participantRelationship.trim() || 'Thành viên gia tộc', rsvp: 'pending' };
    const updated = { ...selected, participants: [...selected.participants, participant] };
    setEvents((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); setParticipantName(''); setParticipantRelationship(''); setToast('Đã thêm người tham dự vào danh sách.');
  };

  const updateRsvp = (participantId: string, rsvp: EventParticipant['rsvp']) => {
    if (!selected) return;
    const updated = { ...selected, participants: selected.participants.map((item) => item.id === participantId ? { ...item, rsvp } : item) };
    setEvents((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated);
  };

  const removeSelectedParticipant = () => {
    if (!selected || !removeParticipant) return;
    const updated = { ...selected, participants: selected.participants.filter((item) => item.id !== removeParticipant.id) };
    setEvents((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); setRemoveParticipant(null); setToast('Đã xóa người tham dự khỏi sự kiện.');
  };

  return <section className="family-events-page" aria-labelledby="family-events-title">
    <header className="family-events-hero"><div><span>ĐỜI SỐNG DÒNG HỌ</span><h1 id="family-events-title">Sự kiện gia tộc</h1><p>Lên lịch hoạt động, quản lý người tham dự và theo dõi RSVP tại một nơi.</p></div><button type="button" className="event-primary" disabled={!canManage} title={!canManage ? 'Chỉ Chủ dòng họ có quyền tạo sự kiện' : undefined} onClick={() => openForm()}><FeatureIcon name="plus" /> Tạo sự kiện</button></header>
    {!canManage && <div className="event-role-note"><FeatureIcon name="lock" /><div><strong>Quyền Thành viên</strong><span>Bạn có thể xem và phản hồi tham dự. Chức năng tạo, sửa và xóa dành cho Chủ dòng họ.</span></div></div>}
    <div className="event-kpis"><article><span>Sắp diễn ra</span><strong>{events.filter((item) => item.status === 'upcoming').length}</strong><small>Trong lịch gia tộc</small></article><article><span>Đang diễn ra</span><strong>{events.filter((item) => item.status === 'ongoing').length}</strong><small>Hoạt động hiện tại</small></article><article><span>Tổng người tham dự</span><strong>{events.reduce((sum, item) => sum + item.participants.length, 0)}</strong><small>Trên tất cả sự kiện</small></article></div>
    <div className="event-list-card">
      <div className="event-toolbar"><label><FeatureIcon name="search" /><input aria-label="Tìm sự kiện" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, địa điểm, đơn vị tổ chức..." /></label><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} aria-label="Lọc loại"><option value="all">Tất cả loại</option><option value="meeting">Họp dòng họ</option><option value="ceremony">Nghi lễ</option><option value="scholarship">Khuyến học</option><option value="trip">Về nguồn</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Lọc trạng thái"><option value="all">Tất cả trạng thái</option><option value="upcoming">Sắp diễn ra</option><option value="ongoing">Đang diễn ra</option><option value="completed">Đã kết thúc</option><option value="cancelled">Đã hủy</option></select></div>
      {visible.length ? <div className="event-grid">{visible.map((item) => <article className="event-card" key={item.id}><div className="event-card-top"><span className={`event-type ${item.type}`}>{typeLabels[item.type]}</span><span className={`event-status ${item.status}`}>{statusLabels[item.status]}</span></div><h2>{item.name}</h2><p>{item.description}</p><div className="event-info-grid"><div><FeatureIcon name="calendar" /><span><small>Ngày & giờ</small><strong>{item.startDate}{item.endDate !== item.startDate ? ` – ${item.endDate}` : ''} · {item.time}</strong></span></div><div><span className="event-pin">⌖</span><span><small>Địa điểm</small><strong>{item.location}</strong></span></div><div><span className="event-user">◎</span><span><small>Đơn vị tổ chức</small><strong>{item.organizer}</strong></span></div><div><span className="event-user">◉</span><span><small>Người tham dự</small><strong>{item.participants.length} thành viên</strong></span></div></div><footer><button type="button" className="event-view" onClick={() => setSelected(item)}><FeatureIcon name="eye" /> Xem chi tiết</button><button type="button" disabled={!canManage} title={!canManage ? 'Không có quyền chỉnh sửa' : undefined} onClick={() => openForm(item)}><FeatureIcon name="edit" /> Sửa</button><button type="button" className="danger" disabled={!canManage} title={!canManage ? 'Không có quyền xóa' : undefined} onClick={() => setDeleteTarget(item)}><FeatureIcon name="delete" /></button></footer></article>)}</div> : <FeatureEmptyState title="Không tìm thấy sự kiện" description="Thử thay đổi từ khóa hoặc bộ lọc để xem các hoạt động khác." />}
      <div className="event-pagination-row"><span>Hiển thị {visible.length} / {filtered.length} sự kiện</span><FeaturePagination page={page} totalPages={totalPages} onChange={setPage} /></div>
    </div>
    {editing && <FeatureModal title={editing === 'new' ? 'Tạo sự kiện gia tộc' : 'Chỉnh sửa sự kiện'} eyebrow="QUẢN LÝ SỰ KIỆN" onClose={() => setEditing(null)} wide footer={<><button type="button" className="feature-button secondary" onClick={() => setEditing(null)}>Hủy</button><button type="submit" form="family-event-form" className="feature-button primary"><FeatureIcon name="check" /> Lưu sự kiện</button></>}><form id="family-event-form" className="feature-form-grid" onSubmit={saveEvent} noValidate><div className="feature-field full"><label>Tên sự kiện <em>*</em></label><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ví dụ: Đại hội dòng họ năm 2027" />{errors.name && <span className="feature-field-error">{errors.name}</span>}</div><div className="feature-field"><label>Loại sự kiện</label><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as EventForm['type'] })}><option value="meeting">Họp dòng họ</option><option value="ceremony">Nghi lễ</option><option value="scholarship">Khuyến học</option><option value="trip">Về nguồn</option></select></div><div className="feature-field"><label>Trạng thái</label><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as EventStatus })}>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="feature-field full"><label>Mô tả</label><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Mục đích và nội dung chính..." /></div><div className="feature-field"><label>Ngày bắt đầu <em>*</em></label><input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />{errors.startDate && <span className="feature-field-error">{errors.startDate}</span>}</div><div className="feature-field"><label>Ngày kết thúc <em>*</em></label><input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />{errors.endDate && <span className="feature-field-error">{errors.endDate}</span>}</div><div className="feature-field"><label>Thời gian <em>*</em></label><input value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} placeholder="08:00 – 11:30" />{errors.time && <span className="feature-field-error">{errors.time}</span>}</div><div className="feature-field"><label>Địa điểm <em>*</em></label><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Nhà thờ tổ / trực tuyến..." />{errors.location && <span className="feature-field-error">{errors.location}</span>}</div><div className="feature-field full"><label>Đơn vị tổ chức <em>*</em></label><input value={form.organizer} onChange={(event) => setForm({ ...form, organizer: event.target.value })} placeholder="Hội đồng gia tộc" />{errors.organizer && <span className="feature-field-error">{errors.organizer}</span>}</div><div className="feature-field full"><label>Ghi chú</label><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Trang phục, phương tiện, thời hạn đăng ký..." /></div></form></FeatureModal>}
    {selected && <FeatureModal title={selected.name} eyebrow={`${typeLabels[selected.type]} · ${statusLabels[selected.status]}`} onClose={() => setSelected(null)} wide footer={<><button type="button" className="feature-button secondary" onClick={() => setSelected(null)}>Đóng</button><button type="button" className="feature-button primary" disabled={!canManage} onClick={() => openForm(selected)}><FeatureIcon name="edit" /> Chỉnh sửa</button></>}><div className="event-detail-summary"><p>{selected.description}</p><dl><div><dt>Thời gian</dt><dd>{selected.startDate} · {selected.time}</dd></div><div><dt>Địa điểm</dt><dd>{selected.location}</dd></div><div><dt>Tổ chức</dt><dd>{selected.organizer}</dd></div><div><dt>Ghi chú</dt><dd>{selected.notes || 'Không có'}</dd></div></dl></div><div className="participant-section"><div className="participant-title"><div><h3>Người tham dự</h3><span>{selected.participants.length} thành viên trong danh sách</span></div></div>{canManage && <div className="participant-add"><input aria-label="Tên người tham dự" value={participantName} onChange={(event) => setParticipantName(event.target.value)} placeholder="Tên thành viên" /><input aria-label="Quan hệ" value={participantRelationship} onChange={(event) => setParticipantRelationship(event.target.value)} placeholder="Đời / Chi / Quan hệ" /><button type="button" onClick={addParticipant} disabled={!participantName.trim()}><FeatureIcon name="plus" /> Thêm</button></div>}<div className="participant-list">{selected.participants.length ? selected.participants.map((person) => <div key={person.id}><span className="participant-avatar">{person.initial}</span><div><strong>{person.name}</strong><small>{person.relationship}</small></div><select aria-label={`RSVP của ${person.name}`} value={person.rsvp} disabled={!canManage} onChange={(event) => updateRsvp(person.id, event.target.value as EventParticipant['rsvp'])}><option value="confirmed">Đã xác nhận</option><option value="pending">Chờ phản hồi</option><option value="declined">Không tham dự</option></select><button type="button" disabled={!canManage} onClick={() => setRemoveParticipant(person)} aria-label={`Xóa ${person.name}`}><FeatureIcon name="delete" /></button></div>) : <FeatureEmptyState title="Chưa có người tham dự" description="Thêm thành viên để bắt đầu theo dõi phản hồi tham dự." />}</div></div></FeatureModal>}
    {deleteTarget && <ConfirmDialog title="Xóa sự kiện?" description={`“${deleteTarget.name}” và danh sách người tham dự sẽ bị xóa khỏi hệ thống.`} confirmLabel="Xóa sự kiện" danger onCancel={() => setDeleteTarget(null)} onConfirm={() => { setEvents((current) => current.filter((item) => item.id !== deleteTarget.id)); setDeleteTarget(null); setToast('Đã xóa sự kiện.'); }} />}
    {removeParticipant && <ConfirmDialog title="Xóa người tham dự?" description={`Xóa ${removeParticipant.name} khỏi danh sách sự kiện này?`} confirmLabel="Xóa khỏi danh sách" danger onCancel={() => setRemoveParticipant(null)} onConfirm={removeSelectedParticipant} />}
    {toast && <FeatureToast message={toast} onClose={() => setToast('')} />}
  </section>;
};

export default ClanEventsModule;
