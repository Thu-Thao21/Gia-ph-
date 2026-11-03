import { useAuth } from '../../context/AuthContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, FeatureEmptyState, FeatureIcon, FeatureModal, FeaturePagination, FeatureToast } from '../common/FeatureUI';
import { archiveMockData, type ArchiveFileType, type ArchiveRecord } from '../../data/sprint5MockData';
import { useLocalPreviewState } from '../../features/familyAdmin/useLocalPreviewState';
import './ClanDocumentsModule.css';
import { ArchiveImage } from './ArchiveImage';
import { readArchiveFile, saveArchiveFile, removeArchiveFile } from '../../services/archiveFiles';

type ArchiveForm = { name: string; type: ArchiveFileType; tags: string; description: string };
const EMPTY_FORM: ArchiveForm = { name: '', type: 'document', tags: '', description: '' };
const typeLabels: Record<ArchiveFileType, string> = { photo: 'Hình ảnh', document: 'Tài liệu', video: 'Video', audio: 'Âm thanh', record: 'Hồ sơ gia tộc' };
const typeGlyphs: Record<ArchiveFileType, string> = { photo: '▧', document: '≣', video: '▶', audio: '♫', record: '⌘' };
const PAGE_SIZE = 6;
const dateStamp = (value: string) => { const [day, month, year] = value.split('/'); return new Date(`${year}-${month}-${day}`).getTime() || 0; };

const inferType = (fileName: string): ArchiveFileType => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg','jpeg','png','webp','gif'].includes(ext || '')) return 'photo';
  if (['mp4','mov','webm'].includes(ext || '')) return 'video';
  if (['mp3','m4a','wav','ogg'].includes(ext || '')) return 'audio';
  return 'document';
};

const normalizeRecord = (item: ArchiveRecord): ArchiveRecord => {
  const legacy = item as ArchiveRecord & { uploader?: string; fileSize?: string; category?: string };
  const kind = String(item.type);
  const isPhoto = kind === 'image' || kind === 'photo' || inferType(item.fileName || item.name) === 'photo' || item.url?.startsWith('data:image/');
  return {
    ...item,
    type: isPhoto ? 'photo' : item.type,
    owner: item.owner || legacy.uploader || 'Thành viên',
    size: item.size || legacy.fileSize || '0 MB',
    tags: Array.isArray(item.tags) ? item.tags : legacy.category ? [legacy.category] : [],
  };
};

export interface ClanDocumentsModuleProps { canManage?: boolean }

export const ClanDocumentsModule: React.FC<ClanDocumentsModuleProps> = ({ canManage = true }) => {
  const { account } = useAuth();
  const [storedRecords, setRecords] = useLocalPreviewState<ArchiveRecord[]>('documents', archiveMockData);
  const records = useMemo(() => storedRecords.map(normalizeRecord), [storedRecords]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ArchiveFileType>('all');
  const [fromDate, setFromDate] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ArchiveRecord | null>(null);
  const [editing, setEditing] = useState<ArchiveRecord | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState<ArchiveForm>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ArchiveRecord | null>(null);
  const [toast, setToast] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<ArchiveRecord | null>(null);
  const [fileBusy, setFileBusy] = useState(false);

  const filtered = useMemo(() => records.filter((item) => {
    const text = `${item.name} ${item.owner} ${item.tags.join(' ')} ${item.description}`.toLocaleLowerCase('vi');
    return text.includes(search.trim().toLocaleLowerCase('vi')) && (typeFilter === 'all' || item.type === typeFilter) && (!fromDate || dateStamp(item.uploadDate) >= new Date(fromDate).getTime());
  }).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name,'vi') : sort === 'oldest' ? dateStamp(a.uploadDate)-dateStamp(b.uploadDate) : dateStamp(b.uploadDate)-dateStamp(a.uploadDate)), [records, search, typeFilter, fromDate, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => setPage(1), [search, typeFilter, fromDate, sort, view]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (nextFile.type.startsWith('image/') && nextFile.size > 5 * 1024 * 1024) { setFile(null); setError('Tệp hình ảnh vượt quá giới hạn 5 MB. Vui lòng chọn tệp nhỏ hơn.'); setUploadState('error'); return; }
    if (nextFile.size > 250 * 1024 * 1024) { setFile(null); setError('Tệp vượt quá giới hạn 250 MB.'); setUploadState('error'); return; }
    setFile(nextFile); setForm((current) => ({ ...current, name: current.name || nextFile.name, type: inferType(nextFile.name) })); setError(''); setUploadState('idle');
  };

  const openUpload = () => { if (!canManage) return; setShowUpload(true); setForm(EMPTY_FORM); setFile(null); setError(''); setUploadProgress(0); setUploadState('idle'); };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || uploadState === 'uploading') return;
    if (!file) { setError('Vui lòng chọn một tệp để tải lên.'); setUploadState('error'); return; }
    if (!form.name.trim()) { setError('Vui lòng nhập tên tư liệu.'); setUploadState('error'); return; }
    setError(''); setUploadState('uploading'); setUploadProgress(8);
    const record: ArchiveRecord = {
      id: `TL-${crypto.randomUUID()}`, name: form.name.trim(),
      type: inferType(file.name) === 'photo' ? 'photo' : form.type,
      owner: account?.display_name || 'Thành viên', uploadDate: new Date().toLocaleDateString('vi-VN'),
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`, fileName: file.name, fileVersion: crypto.randomUUID(),
      tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean),
      description: form.description.trim() || 'Tư liệu gia tộc do thành viên đóng góp.',
    };
    try {
      await saveArchiveFile(record.id, file);
      setRecords((items) => [record, ...items]);
      setUploadProgress(100); setUploadState('success'); setShowUpload(false); setPage(1);
      setToast('Đã lưu tệp tư liệu trên trình duyệt này.');
    } catch {
      setUploadState('error');
      setError('Chưa lưu được tệp. Vui lòng kiểm tra dung lượng trống của trình duyệt và thử lại.');
    }
  };

  const chooseReplacement = (item: ArchiveRecord) => {
    if (!canManage || fileBusy) return;
    replaceTarget.current = item;
    replaceInput.current?.click();
  };

  const replaceFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    const target = replaceTarget.current;
    event.target.value = '';
    if (!nextFile || !target || !canManage || fileBusy) return;
    const limit = inferType(nextFile.name) === 'photo' ? 5 : 250;
    if (!nextFile.size || nextFile.size > limit * 1024 * 1024) {
      setToast(`Vui lòng chọn tệp có dung lượng lớn hơn 0 và không quá ${limit} MB.`); return;
    }
    setFileBusy(true);
    try {
      await saveArchiveFile(target.id, nextFile);
      const updated: ArchiveRecord = { ...target, type: inferType(nextFile.name), fileName: nextFile.name,
        fileVersion: crypto.randomUUID(), url: undefined, size: `${(nextFile.size / 1024 / 1024).toFixed(2)} MB` };
      setRecords((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSelected((current) => current?.id === updated.id ? updated : current);
      setToast('Đã cập nhật tệp tư liệu.');
    } catch { setToast('Chưa lưu được tệp. Vui lòng kiểm tra dung lượng trống và thử lại.'); }
    finally { setFileBusy(false); }
  };

  const deleteRecord = async () => {
    if (!deleteTarget || !canManage || fileBusy) return;
    setFileBusy(true);
    try {
      await removeArchiveFile(deleteTarget.id);
      setRecords((items) => items.filter((item) => item.id !== deleteTarget.id));
      setSelected((current) => current?.id === deleteTarget.id ? null : current);
      setDeleteTarget(null); setToast('Đã xóa tư liệu.');
    } catch { setToast('Chưa xóa được tư liệu. Vui lòng thử lại.'); }
    finally { setFileBusy(false); }
  };

  const saveMetadata = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !form.name.trim()) return;
    const updated: ArchiveRecord = { ...editing, name: form.name.trim(), type: form.type, tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean), description: form.description.trim() };
    setRecords((items) => items.map((item) => item.id === updated.id ? updated : item)); setEditing(null); setSelected(updated); setToast('Đã cập nhật metadata tư liệu.');
  };

  const openEdit = (item: ArchiveRecord) => { if (!canManage) return; setEditing(item); setForm({ name: item.name, type: item.type, tags: item.tags.join(', '), description: item.description }); };
  const download = async (item: ArchiveRecord) => {
    try {
      const stored = await readArchiveFile(item.id);
      let blob = stored?.blob;
      if (!blob && item.url && /^(https?:\/\/|data:)/i.test(item.url)) {
        const response = await fetch(item.url);
        if (!response.ok) throw new Error('Unavailable');
        blob = await response.blob();
      }
      if (!blob) { setToast('Mục này chưa có tệp gốc. Vui lòng chọn lại tệp tư liệu.'); return; }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = stored?.name || item.fileName || item.name;
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setToast('Không tải được tệp tư liệu. Vui lòng thử lại.'); }
  };
  const clearFilters = () => { setSearch(''); setTypeFilter('all'); setFromDate(''); setSort('newest'); };

  return <section className="archive-page" aria-labelledby="archive-title">
    <input ref={replaceInput} type="file" hidden onChange={replaceFile} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" aria-label="Chọn lại tệp tư liệu" />
    <header className="archive-hero"><div><span>KHO TƯ LIỆU SỐ</span><h1 id="archive-title">Lưu trữ gia tộc</h1><p>Kho lưu trữ tư liệu, hồ sơ và hình ảnh lịch sử gia tộc.</p></div><button type="button" className="archive-primary" disabled={!canManage} title={!canManage ? 'Bạn không có quyền tải tư liệu' : undefined} onClick={openUpload}><FeatureIcon name="upload" /> Thêm tư liệu</button></header>
    <div className="archive-kpis"><article><span>Tổng tư liệu</span><strong>{records.length}</strong><small>5 loại nội dung</small></article><article><span>Ảnh & video</span><strong>{records.filter((item) => item.type === 'photo' || item.type === 'video').length}</strong><small>Ký ức hình ảnh</small></article><article><span>Hồ sơ lịch sử</span><strong>{records.filter((item) => item.type === 'document' || item.type === 'record').length}</strong><small>Đã được số hóa</small></article><article><span>Dung lượng</span><strong>{records.reduce((total, item) => total + (parseFloat(item.size) || 0), 0).toFixed(2)} MB</strong><small>Tổng dung lượng tư liệu</small></article></div>
    <div className="archive-library-card">
      <div className="archive-heading"><div><h2>Thư viện tư liệu</h2><span>Xem ảnh trực tiếp, tìm kiếm và quản lý tư liệu</span></div><div className="archive-view-switch"><button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Xem dạng lưới">▦</button><button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="Xem dạng danh sách">☷</button></div></div>
      <div className="archive-toolbar"><label><FeatureIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, người tải lên, thẻ..." aria-label="Tìm tư liệu" /></label><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} aria-label="Lọc loại"><option value="all">Tất cả định dạng</option>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><label className="archive-date"><span>Từ ngày</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sắp xếp"><option value="newest">Mới tải lên</option><option value="oldest">Cũ nhất</option><option value="name">Tên A–Z</option></select><button type="button" onClick={clearFilters}>Đặt lại</button></div>
      {visible.length ? <div className={`archive-items ${view}`}>{visible.map((item) => <article className="archive-item" key={item.id}><button type="button" className={`archive-thumb ${item.type}`} onClick={() => setSelected(item)} aria-label={`Xem ${item.name}`}>
        {item.type === 'photo' ? <ArchiveImage id={item.id} name={item.name} version={item.fileVersion} url={item.url} /> : <><span>{typeGlyphs[item.type]}</span><small>{typeLabels[item.type]}</small></>}
      </button><div className="archive-item-body"><div className="archive-item-title"><div><h3>{item.name}</h3><span>{item.id}</span></div><span className={`archive-type ${item.type}`}>{typeLabels[item.type]}</span></div><p>{item.description}</p><div className="archive-meta"><span>Tải bởi <strong>{item.owner}</strong></span><span>{item.uploadDate}</span><span>{item.size}</span></div><div className="archive-tags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><footer><button type="button" onClick={() => setSelected(item)}><FeatureIcon name="eye" /> Xem</button><button type="button" onClick={() => download(item)}><FeatureIcon name="download" /> Tải</button><button type="button" disabled={!canManage} title={!canManage ? 'Không có quyền sửa' : undefined} onClick={() => openEdit(item)}><FeatureIcon name="edit" /> Sửa</button><button type="button" disabled={!canManage || fileBusy} title="Bổ sung hoặc thay tệp gốc" aria-label={`Chọn lại tệp ${item.name}`} onClick={() => chooseReplacement(item)}><FeatureIcon name="upload" /></button><button type="button" className="danger" disabled={!canManage || fileBusy} title={!canManage ? 'Không có quyền xóa' : 'Xóa tư liệu'} aria-label={`Xóa ${item.name}`} onClick={() => setDeleteTarget(item)}><FeatureIcon name="delete" /></button></footer></div></article>)}</div> : <FeatureEmptyState title="Không tìm thấy tư liệu" description="Không có tệp phù hợp với loại, ngày hoặc từ khóa hiện tại." action={<button className="archive-primary" onClick={clearFilters}>Xóa bộ lọc</button>} />}
      <div className="archive-footer"><span>Hiển thị {visible.length} / {filtered.length} tư liệu · Lưu trên trình duyệt này</span><FeaturePagination page={page} totalPages={totalPages} onChange={setPage} /></div>
    </div>
    {showUpload && <FeatureModal title="Thêm tư liệu" eyebrow="KHO LƯU TRỮ SỐ" onClose={() => uploadState !== 'uploading' && setShowUpload(false)} wide footer={<><button type="button" className="feature-button secondary" disabled={uploadState === 'uploading'} onClick={() => setShowUpload(false)}>Hủy</button><button type="submit" form="archive-upload-form" className="feature-button primary" disabled={uploadState === 'uploading' || uploadState === 'success'}><FeatureIcon name="upload" /> {uploadState === 'uploading' ? `Đang xử lý ${uploadProgress}%` : 'Lưu tư liệu'}</button></>}><form id="archive-upload-form" onSubmit={upload} className="feature-form-grid" noValidate><div className="feature-field full"><label>Tệp tư liệu <em>*</em></label><div className={`archive-dropzone ${dragActive ? 'active' : ''} ${error ? 'error' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); chooseFile(event.dataTransfer.files[0]); }}><input ref={fileInput} type="file" onChange={(event) => chooseFile(event.target.files?.[0])} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" /><div><FeatureIcon name="upload" size={27} /><strong>Kéo và thả tệp vào đây</strong><span>hoặc <button type="button" onClick={() => fileInput.current?.click()}>chọn từ thiết bị</button></span><small>Ảnh, tài liệu, video, âm thanh · tối đa 250 MB</small>{file && <em>{file.name} · {(file.size/1024/1024).toFixed(1)} MB</em>}</div></div>{error && <span className="feature-field-error">{error}</span>}</div><div className="feature-field"><label>Tên hiển thị <em>*</em></label><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="feature-field"><label>Loại tư liệu</label><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ArchiveFileType })}>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="feature-field full"><label>Thẻ phân loại</label><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="Gia phả cổ, Chi trưởng, Nghi lễ" /></div><div className="feature-field full"><label>Mô tả / Nguồn gốc</label><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>{uploadState === 'uploading' && <div className="archive-progress full"><span style={{width:`${uploadProgress}%`}} /><strong>{uploadProgress}% · Đang xử lý...</strong></div>}{uploadState === 'success' && <div className="archive-upload-success full"><FeatureIcon name="check" /> Đã lưu tư liệu thành công.</div>}</form></FeatureModal>}
    {editing && <FeatureModal title="Chỉnh sửa tư liệu" eyebrow={editing.id} onClose={() => setEditing(null)} wide footer={<><button type="button" className="feature-button secondary" onClick={() => setEditing(null)}>Hủy</button><button type="submit" form="archive-edit-form" className="feature-button primary"><FeatureIcon name="check" /> Lưu thay đổi</button></>}><form id="archive-edit-form" onSubmit={saveMetadata} className="feature-form-grid"><div className="feature-field"><label>Tên hiển thị <em>*</em></label><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div><div className="feature-field"><label>Loại tư liệu</label><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ArchiveFileType })}>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="feature-field full"><label>Thẻ</label><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></div><div className="feature-field full"><label>Mô tả</label><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div></form></FeatureModal>}
    {selected && <FeatureModal title={selected.name} eyebrow={`${typeLabels[selected.type]} · ${selected.size}`} onClose={() => setSelected(null)} wide footer={<><button type="button" className="feature-button secondary" onClick={() => setSelected(null)}>Đóng</button><button type="button" className="feature-button ghost" onClick={() => download(selected)}><FeatureIcon name="download" /> Tải tư liệu</button><button type="button" className="feature-button ghost" disabled={!canManage || fileBusy} onClick={() => chooseReplacement(selected)}><FeatureIcon name="upload" /> Chọn lại tệp</button><button type="button" className="feature-button primary" disabled={!canManage} onClick={() => openEdit(selected)}><FeatureIcon name="edit" /> Sửa tư liệu</button></>}><div className="archive-preview"><div className={`archive-preview-visual ${selected.type}`}>
      {selected.type === 'photo' ? <ArchiveImage id={selected.id} name={selected.name} version={selected.fileVersion} url={selected.url} full /> : <><span>{typeGlyphs[selected.type]}</span><strong>{typeLabels[selected.type].toLocaleUpperCase('vi')}</strong></>}
    </div><dl><div><dt>Người tải lên</dt><dd>{selected.owner}</dd></div><div><dt>Ngày tải</dt><dd>{selected.uploadDate}</dd></div><div><dt>Dung lượng</dt><dd>{selected.size}</dd></div><div><dt>Thẻ</dt><dd>{selected.tags.join(', ')}</dd></div></dl><p>{selected.description}</p></div></FeatureModal>}
    {deleteTarget && <ConfirmDialog title="Xóa tư liệu?" description={`“${deleteTarget.name}” sẽ bị xóa khỏi thư viện.`} confirmLabel="Xóa tư liệu" danger onCancel={() => setDeleteTarget(null)} onConfirm={deleteRecord} />}
    {toast && <FeatureToast message={toast} onClose={() => setToast('')} />}
  </section>;
};

export default ClanDocumentsModule;
