import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClanContext } from '../../context/ClanContext';
import apiClient from '../../api/axios';
import {
  fetchClanUsers, assignFamilyAdmin, revokeFamilyAdmin, type ClanUserItem,
} from '../../services/admin.service';
import {
  getFamilyAdminState, importPersons, issueAccount, removeRelation, requestAccountReset,
  reviewLinkRequest, reviewProposal, saveBranch, savePerson, saveRelation, sendLinkRequest,
  toggleAccountLock, togglePersonHidden, useFamilyAdminState, syncFamilyAdminFromBackend,
  type FamilyBranch, type FamilyPerson, type FamilyRelation, type RelationType,
} from './familyAdminStore';
import './FamilyAdminModule.css';
import { downloadFamilyXlsx, downloadPersonTemplateXlsx, readPersonXlsx } from './familyAdminExcel';
import {
  getClanJoinRequestsForReviewer,
  reviewClanJoinRequest,
  type ClanJoinRequestItem,
} from '../../services/clanJoin.service';

export type FamilyAdminView = 'overview' | 'members' | 'relations' | 'branches' | 'tree' | 'search' | 'approvals' | 'accounts' | 'links' | 'exchange' | 'audit';
type Props = { view: FamilyAdminView; onNavigate?: (view: FamilyAdminView) => void };

const relationLabels: Record<RelationType, string> = {
  father: 'Cha → con', mother: 'Mẹ → con', spouse: 'Vợ/chồng',
  adoptive_parent: 'Cha/mẹ nuôi → con', step_parent: 'Cha/mẹ kế → con',
};
const genderLabels = { male: 'Nam', female: 'Nữ', other: 'Khác' };
const emptyPerson = (branchId: string): Omit<FamilyPerson, 'id'> => ({
  fullName: '', gender: 'male', birthDate: '', deathDate: '', branchId,
  generation: 1, phone: '', email: '', bio: '', hidden: false, visibility: 'family',
});
const emptyBranch: Omit<FamilyBranch, 'id'> = { name: '', founderId: '', description: '' };
const clean = (value: string) => value.trim().toLocaleLowerCase('vi');

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell); if (row.some((part) => part.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('Tệp CSV có dấu ngoặc kép chưa đóng.');
  row.push(cell);
  if (row.some((part) => part.trim())) rows.push(row);
  return rows;
}

export const FamilyAdminModule: React.FC<Props> = ({ view, onNavigate }) => {
  const { account } = useAuth();
  const { activeClanId, activeClanName, activeClanRole } = useClanContext();
  const clanId = activeClanId || account?.clan_id || account?.memberships?.[0]?.clan_id || '';
  const isLeader = activeClanRole === 'clan_admin';

  const data = useFamilyAdminState();
  const clanDisplayName = activeClanName || data.familyName;
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [clanUsers, setClanUsers] = useState<ClanUserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const loadClanUsers = useCallback(async () => {
    if (!clanId) return;
    try {
      setLoadingUsers(true);
      const res = await fetchClanUsers(clanId);
      setClanUsers(res.items);
    } catch (err) {
      console.error('Failed to load clan users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }, [clanId]);

  useEffect(() => {
    syncFamilyAdminFromBackend(clanId);
    loadClanUsers();
  }, [clanId, loadClanUsers]);

  const [confirmAction, setConfirmAction] = useState<{
    type: 'assign' | 'revoke';
    userId: string;
    userName: string;
  } | null>(null);

  const handleExecuteConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, userId, userName } = confirmAction;
    setActionUserId(userId);
    try {
      if (type === 'assign') {
        await assignFamilyAdmin(clanId, userId);
        setNotice({ text: `Đã nâng quyền Family Admin thành công cho ${userName}.`, error: false });
      } else {
        await revokeFamilyAdmin(clanId, userId);
        setNotice({ text: `Đã thu hồi quyền Family Admin của ${userName}.`, error: false });
      }
      setConfirmAction(null);
      await loadClanUsers();
    } catch (err: any) {
      setNotice({
        text: err?.response?.data?.message || err?.message || (type === 'assign' ? 'Không thể nâng quyền Family Admin.' : 'Không thể thu hồi quyền.'),
        error: true,
      });
    } finally {
      setActionUserId(null);
    }
  };

  const handleExportClanMembers = async () => {
    try {
      const response = await apiClient.get(`/families/${clanId}/persons/export?format=csv`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'danh-sach-thanh-vien.csv';
      link.click();
      URL.revokeObjectURL(url);
      setNotice({ text: 'Đã xuất danh sách thành viên dòng họ thành công.', error: false });
    } catch (err) {
      const current = getFamilyAdminState();
      const rows = [
        ['fullName', 'gender', 'birthDate', 'branch', 'generation'],
        ...current.persons
          .filter((person) => !person.hidden && person.visibility !== 'private')
          .map((person) => [
            person.fullName,
            person.gender,
            person.birthDate,
            current.branches.find((branch) => branch.id === person.branchId)?.name || '',
            String(person.generation),
          ]),
      ];
      downloadFile(
        'danh-sach-thanh-vien.csv',
        rows.map((row) => row.map(csvEscape).join(',')).join('\r\n'),
        'text/csv;charset=utf-8'
      );
      setNotice({ text: 'Đã xuất danh sách thành viên dòng họ.', error: false });
    }
  };

  const [query, setQuery] = useState('');
  const [personForm, setPersonForm] = useState<Omit<FamilyPerson, 'id'> | null>(null);
  const [editPersonId, setEditPersonId] = useState<string | undefined>();
  const [branchForm, setBranchForm] = useState<Omit<FamilyBranch, 'id'> | null>(null);
  const [editBranchId, setEditBranchId] = useState<string | undefined>();
  const [relationForm, setRelationForm] = useState<Omit<FamilyRelation, 'id'>>({ type: 'father', fromId: '', toId: '', since: '' });
  const [editRelationId, setEditRelationId] = useState<string | undefined>();
  const [accountForm, setAccountForm] = useState({ personId: '', username: '', email: '' });
  const [linkForm, setLinkForm] = useState({ targetFamily: '', reason: '' });
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [treeBranch, setTreeBranch] = useState('all');
  const [treeGeneration, setTreeGeneration] = useState('all');
  const [treeFocus, setTreeFocus] = useState('');
  const [treeScale, setTreeScale] = useState(1);
  const [searchFrom, setSearchFrom] = useState('');
  const [searchTo, setSearchTo] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<Array<Pick<FamilyPerson, 'fullName' | 'gender' | 'birthDate' | 'branchId' | 'generation'>> | null>(null);
  const [xlsxPreview, setXlsxPreview] = useState<Array<Pick<FamilyPerson, 'fullName' | 'gender' | 'birthDate' | 'branchId' | 'generation'>> | null>(null);

  // Join Requests review state for view === 'approvals'
  const [approvalsTab, setApprovalsTab] = useState<'join-requests' | 'proposals'>('join-requests');
  const [joinRequests, setJoinRequests] = useState<ClanJoinRequestItem[]>([]);
  const [loadingJoinReqs, setLoadingJoinReqs] = useState(false);
  const [selectedJoinReq, setSelectedJoinReq] = useState<ClanJoinRequestItem | null>(null);

  const [reviewActionType, setReviewActionType] = useState<'APPROVE' | 'REJECT' | 'NEED_INFO'>('APPROVE');
  const [reviewerNote, setReviewerNote] = useState('');
  const [linkPersonMode, setLinkPersonMode] = useState<'existing' | 'new'>('new');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedParentId, setSelectedParentId] = useState('');
  const [personSearchText, setPersonSearchText] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonGender, setNewPersonGender] = useState<'male' | 'female' | 'other'>('male');
  const [newPersonBirthDate, setNewPersonBirthDate] = useState('');
  const [newPersonBranchId, setNewPersonBranchId] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const loadJoinRequests = useCallback(async () => {
    if (!clanId) return;
    try {
      setLoadingJoinReqs(true);
      const res = await getClanJoinRequestsForReviewer(clanId);
      setJoinRequests(res);
    } catch (err) {
      console.error('Failed to load clan join requests:', err);
    } finally {
      setLoadingJoinReqs(false);
    }
  }, [clanId]);

  useEffect(() => {
    if (view === 'approvals') {
      loadJoinRequests();
    }
  }, [view, loadJoinRequests]);

  const handleOpenReviewModal = (req: ClanJoinRequestItem) => {
    setSelectedJoinReq(req);
    setReviewActionType('APPROVE');
    setReviewerNote('');
    setLinkPersonMode('new');
    setSelectedPersonId('');
    setSelectedParentId('');
    setPersonSearchText('');
    setNewPersonName(req.full_name);
    setNewPersonGender('male');
    setNewPersonBirthDate(req.birth_date || '');
    setNewPersonBranchId(data.branches[0]?.id || '');
  };

  const handleExecuteReview = async () => {
    if (!selectedJoinReq) return;
    if ((reviewActionType === 'NEED_INFO' || reviewActionType === 'REJECT') && !reviewerNote.trim()) {
      alert('Vui lòng nhập lý do / phản hồi (không được để trống).');
      return;
    }

    if (reviewActionType === 'APPROVE') {
      if (linkPersonMode === 'existing' && !selectedPersonId) {
        alert('Vui lòng chọn một Person trong cây để liên kết hồ sơ.');
        return;
      }
      if (linkPersonMode === 'new' && !newPersonName.trim()) {
        alert('Vui lòng nhập họ và tên của thành viên.');
        return;
      }
    }

    try {
      setIsSubmittingReview(true);
      const payload: any = {
        action: reviewActionType,
        review_note: reviewerNote.trim() || undefined,
      };

      if (reviewActionType === 'APPROVE') {
        if (linkPersonMode === 'existing') {
          payload.person_id = selectedPersonId;
        } else {
          payload.new_person = {
            full_name: newPersonName.trim(),
            gender: newPersonGender,
            birth_date: newPersonBirthDate || null,
            branch_id: newPersonBranchId || null,
            parent_id: selectedParentId || null,
          };
        }
      }

      await reviewClanJoinRequest(clanId, selectedJoinReq.request_id, payload);
      setNotice({ text: 'Đã xử lý yêu cầu gia nhập thành công.', error: false });
      setSelectedJoinReq(null);
      await loadJoinRequests();
      await syncFamilyAdminFromBackend(clanId);
    } catch (err: any) {
      console.error('Lỗi khi duyệt yêu cầu gia nhập:', err);
      const detail = err.response?.data?.detail;
      const msg =
        (typeof detail === 'object' && detail?.message) ||
        (typeof detail === 'string' ? detail : null) ||
        err.response?.data?.message ||
        err.message ||
        'Không thể xử lý yêu cầu.';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const personName = (id: string) => data.persons.find((person) => person.id === id)?.fullName || 'Không tìm thấy';
  const branchName = (id: string) => data.branches.find((branch) => branch.id === id)?.name || 'Chưa phân chi';
  const linkedCount = data.linkRequests.filter((item) => item.status === 'approved').length;
  const pendingCount = data.proposals.filter((item) => item.status === 'pending').length;

  const run = (action: () => void, success: string) => {
    try { action(); setNotice({ text: success, error: false }); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không thể hoàn tất thao tác.', error: true }); }
  };
  const go = (target: FamilyAdminView) => onNavigate?.(target);
  const filteredPersons = useMemo(() => data.persons.filter((person) =>
    [person.fullName, branchName(person.branchId), person.email].join(' ').toLocaleLowerCase('vi').includes(clean(query))), [data.persons, data.branches, query]);

  const activeRelations = data.relations.filter((relation) =>
    data.persons.some((person) => person.id === relation.fromId && !person.hidden) &&
    data.persons.some((person) => person.id === relation.toId && !person.hidden));

  const relationshipPath = useMemo(() => {
    if (!searchFrom || !searchTo) return null;
    if (searchFrom === searchTo) return [searchFrom];
    const queue: string[][] = [[searchFrom]];
    const visited = new Set([searchFrom]);
    while (queue.length) {
      const path = queue.shift()!;
      const last = path[path.length - 1];
      for (const relation of activeRelations) {
        const next = relation.fromId === last ? relation.toId : relation.toId === last ? relation.fromId : null;
        if (!next || visited.has(next)) continue;
        const candidate = [...path, next];
        if (next === searchTo) return candidate;
        visited.add(next);
        queue.push(candidate);
      }
    }
    return [];
  }, [activeRelations, searchFrom, searchTo]);

  const relationshipHint = (() => {
    if (!searchFrom || !searchTo || !relationshipPath?.length) return '';
    if (searchFrom === searchTo) return 'Đây là cùng một Person.';
    if (relationshipPath.length === 2) {
      const relation = data.relations.find((item) => item.fromId === searchFrom && item.toId === searchTo || item.fromId === searchTo && item.toId === searchFrom);
      if (!relation) return '';
      if (relation.type === 'spouse') return `${personName(searchFrom)} là vợ/chồng của ${personName(searchTo)}.`;
      const forward = relation.fromId === searchFrom;
      const label = relation.type === 'father' ? (forward ? 'cha' : 'con')
        : relation.type === 'mother' ? (forward ? 'mẹ' : 'con')
        : relation.type === 'adoptive_parent' ? (forward ? 'cha/mẹ nuôi' : 'con nuôi')
        : (forward ? 'cha/mẹ kế' : 'con riêng');
      return `${personName(searchFrom)} là ${label} của ${personName(searchTo)}.`;
    }
    const firstParents = data.relations.filter((relation) => relation.toId === searchFrom && relation.type !== 'spouse').map((relation) => relation.fromId);
    const secondParents = data.relations.filter((relation) => relation.toId === searchTo && relation.type !== 'spouse').map((relation) => relation.fromId);
    if (firstParents.some((id) => secondParents.includes(id))) return `${personName(searchFrom)} và ${personName(searchTo)} là anh/chị/em theo dữ liệu cha mẹ chung.`;
    return `Có đường kết nối ${relationshipPath.length - 1} bước, nhưng chưa đủ dữ liệu để khẳng định xưng hô cụ thể.`;
  })();

  const title = ({ overview: 'Tổng quan dòng họ', members: 'Quản lý Person', relations: 'Quản lý quan hệ', branches: 'Quản lý Chi & Nhánh', tree: 'Cây gia phả', search: 'Tìm quan hệ', approvals: 'Phê duyệt đề xuất', accounts: 'Tài khoản thành viên', links: 'Liên kết dòng họ', exchange: 'Nhập & xuất dữ liệu', audit: 'Nhật ký thao tác' } satisfies Record<FamilyAdminView, string>)[view];

  return <section className="fa-workspace" aria-labelledby="fa-title">
    <header className="fa-header">
      <div><span className="fa-eyebrow">FAMILY ADMIN · {clanDisplayName}</span><h1 id="fa-title">{title}</h1><p>Khu vực quản lý và phân quyền dòng họ chính thức.</p></div>
      <span className="fa-preview-tag" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>HỆ THỐNG DÒNG HỌ</span>
    </header>
    {notice && <div className={`fa-notice ${notice.error ? 'error' : 'success'}`} role="status">{notice.text}<button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">×</button></div>}

    {view === 'overview' && <>
      <div className="fa-stat-grid">
        <article><span>Person đang hiển thị</span><strong>{data.persons.filter((person) => !person.hidden).length}</strong><small>{data.branches.length} Chi/Nhánh</small></article>
        <article><span>Quan hệ đã ghi</span><strong>{data.relations.length}</strong><small>Cha mẹ, hôn nhân và quan hệ khác</small></article>
        <article><span>Đề xuất chờ duyệt</span><strong>{pendingCount}</strong><small>Cần xem trước khi áp dụng</small></article>
        <article><span>Dòng họ đã liên kết</span><strong>{linkedCount}</strong><small>Chỉ là trạng thái bản xem trước</small></article>
      </div>
      <div className="fa-panel"><h2>Đi tới chức năng</h2><div className="fa-quick-grid">
        {([['members', 'Quản lý Person'], ['relations', 'Quan hệ gia phả'], ['branches', 'Chi & Nhánh'], ['approvals', 'Duyệt đề xuất'], ['accounts', 'Tài khoản Member'], ['links', 'Liên họ'], ['exchange', 'Nhập xuất CSV']] as [FamilyAdminView, string][]).map(([target, label]) => <button type="button" key={target} onClick={() => go(target)}>{label}<span>→</span></button>)}
      </div></div>
      <div className="fa-panel"><h2>Thao tác gần đây</h2>{data.audit.length ? <ul className="fa-audit-list">{data.audit.slice(0, 5).map((item) => <li key={item.id}><span>{item.action}</span><time>{new Date(item.at).toLocaleString('vi-VN')}</time></li>)}</ul> : <p className="fa-muted">Chưa có thao tác trong bản xem trước.</p>}</div>
    </>}

    {view === 'members' && <>
      <div className="fa-panel"><div className="fa-panel-heading"><div><h2>Danh sách Person</h2><p>Thêm, sửa, ẩn và khôi phục hồ sơ trong dòng họ.</p></div><button type="button" className="fa-primary" onClick={() => { setEditPersonId(undefined); setPersonForm(emptyPerson(data.branches[0]?.id || '')); }}>+ Thêm Person</button></div>
        <div className="fa-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, Chi/Nhánh hoặc email" aria-label="Tìm Person" /><span>{filteredPersons.length} kết quả</span></div>
        <div className="fa-table-wrap"><table><thead><tr><th>Họ tên</th><th>Đời / Chi</th><th>Ngày sinh</th><th>Hiển thị</th><th>Tài khoản</th><th>Thao tác</th></tr></thead><tbody>{filteredPersons.map((person) => <tr key={person.id}><td><strong>{person.fullName}</strong><small>{person.bio || genderLabels[person.gender]}</small></td><td>Đời {person.generation}<small>{branchName(person.branchId)}</small></td><td>{person.birthDate || 'Chưa rõ'}</td><td><span className={`fa-status ${person.hidden ? 'muted' : 'approved'}`}>{person.hidden ? 'Đã ẩn' : 'Hiển thị'}</span></td><td>{data.accounts.some((account) => account.personId === person.id) ? 'Có bản nháp' : 'Chưa có'}</td><td><div className="fa-actions"><button type="button" onClick={() => { setEditPersonId(person.id); setPersonForm({ ...person }); }}>Sửa</button><button type="button" onClick={() => run(() => togglePersonHidden(person.id), 'Đã cập nhật trạng thái Person.')}>{person.hidden ? 'Khôi phục' : 'Ẩn'}</button></div></td></tr>)}</tbody></table></div>
      </div>
      {personForm && <div className="fa-modal-backdrop"><div className="fa-modal" role="dialog" aria-modal="true" aria-labelledby="fa-person-form"><div className="fa-modal-title"><h2 id="fa-person-form">{editPersonId ? 'Sửa Person' : 'Thêm Person'}</h2><button type="button" onClick={() => setPersonForm(null)} aria-label="Đóng">×</button></div><form onSubmit={(event) => {
        event.preventDefault();
        const todayStr = new Date().toISOString().split('T')[0];
        if (personForm.birthDate && personForm.birthDate > todayStr) {
          setNotice({ text: 'Ngày sinh không thể lớn hơn ngày hiện tại.', error: true });
          return;
        }
        if (personForm.deathDate && personForm.birthDate && personForm.deathDate < personForm.birthDate) {
          setNotice({ text: 'Ngày mất phải sau hoặc bằng ngày sinh.', error: true });
          return;
        }
        if (editPersonId) {
          const original = data.persons.find((p) => p.id === editPersonId);
          if (original && original.gender !== personForm.gender) {
            const hasSpouse = data.relations.some((r) => r.type === 'spouse' && (r.fromId === editPersonId || r.toId === editPersonId));
            if (hasSpouse) {
              if (!window.confirm('Người này đang có quan hệ hôn phối (vợ/chồng). Việc thay đổi giới tính có thể tác động đến hiển thị quan hệ trong gia phả. Bạn có chắc chắn muốn tiếp tục?')) {
                return;
              }
            }
          }
        }
        try { savePerson(personForm, editPersonId); setPersonForm(null); setNotice({ text: 'Đã lưu Person trong bản xem trước.', error: false }); } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không thể lưu Person.', error: true }); }
      }}><div className="fa-form-grid">
        <label>Họ và tên *<input required value={personForm.fullName} onChange={(event) => setPersonForm({ ...personForm, fullName: event.target.value })} /></label>
        <label>Giới tính<select value={personForm.gender} onChange={(event) => setPersonForm({ ...personForm, gender: event.target.value as FamilyPerson['gender'] })}><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option></select></label>
        <label>Ngày sinh<input type="date" max={new Date().toISOString().split('T')[0]} value={personForm.birthDate} onChange={(event) => setPersonForm({ ...personForm, birthDate: event.target.value })} /></label>
        <label>Ngày mất<input type="date" min={personForm.birthDate || undefined} value={personForm.deathDate} onChange={(event) => setPersonForm({ ...personForm, deathDate: event.target.value })} /></label>
        <label>Chi/Nhánh<select value={personForm.branchId} onChange={(event) => setPersonForm({ ...personForm, branchId: event.target.value })}>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Đời thứ<input type="number" min="1" value={personForm.generation} onChange={(event) => setPersonForm({ ...personForm, generation: Number(event.target.value) })} /></label>
        <label>Email<input type="email" value={personForm.email} onChange={(event) => setPersonForm({ ...personForm, email: event.target.value })} /></label>
        <label>Điện thoại<input value={personForm.phone} onChange={(event) => setPersonForm({ ...personForm, phone: event.target.value })} /></label>
        <label>Quyền xem hồ sơ<select value={personForm.visibility} onChange={(event) => setPersonForm({ ...personForm, visibility: event.target.value as FamilyPerson['visibility'] })}><option value="family">Trong dòng họ</option><option value="admin">Người quản lý</option><option value="private">Riêng tư (không công khai)</option></select></label>
        <label className="fa-wide">Tiểu sử<textarea value={personForm.bio} onChange={(event) => setPersonForm({ ...personForm, bio: event.target.value })} rows={3} /></label>
      </div><div className="fa-modal-actions"><button type="button" onClick={() => setPersonForm(null)}>Hủy</button><button type="submit" className="fa-primary">Lưu Person</button></div></form></div></div>}
    </>}

    {view === 'branches' && <div className="fa-panel"><div className="fa-panel-heading"><div><h2>Chi/Nhánh của {clanDisplayName}</h2><p>Quản lý tên chi, người lập chi và số Person trực thuộc.</p></div><button className="fa-primary" type="button" onClick={() => { setEditBranchId(undefined); setBranchForm({ ...emptyBranch }); }}>+ Thêm Chi/Nhánh</button></div><div className="fa-card-grid">{data.branches.map((branch) => <article className="fa-card" key={branch.id}><span className="fa-card-eyebrow">CHI/NHÁNH</span><h3>{branch.name}</h3><p>{branch.description || 'Chưa có mô tả'}</p><dl><div><dt>Người lập chi</dt><dd>{branch.founderId ? personName(branch.founderId) : 'Chưa chọn'}</dd></div><div><dt>Person</dt><dd>{data.persons.filter((person) => person.branchId === branch.id).length}</dd></div></dl><button type="button" onClick={() => { setEditBranchId(branch.id); setBranchForm({ ...branch }); }}>Chỉnh sửa</button></article>)}</div>
      {branchForm && <div className="fa-modal-backdrop"><div className="fa-modal" role="dialog" aria-modal="true" aria-labelledby="fa-branch-form"><div className="fa-modal-title"><h2 id="fa-branch-form">{editBranchId ? 'Sửa Chi/Nhánh' : 'Thêm Chi/Nhánh'}</h2><button type="button" onClick={() => setBranchForm(null)} aria-label="Đóng">×</button></div><form onSubmit={(event) => { event.preventDefault(); try { saveBranch(branchForm, editBranchId); setBranchForm(null); setNotice({ text: 'Đã lưu Chi/Nhánh trong bản xem trước.', error: false }); } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không thể lưu Chi/Nhánh.', error: true }); } }}><div className="fa-form-grid"><label>Tên Chi/Nhánh *<input required value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} /></label><label>Người lập chi<select value={branchForm.founderId} onChange={(event) => setBranchForm({ ...branchForm, founderId: event.target.value })}><option value="">Chưa chọn</option>{data.persons.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label className="fa-wide">Mô tả<textarea rows={3} value={branchForm.description} onChange={(event) => setBranchForm({ ...branchForm, description: event.target.value })} /></label></div><div className="fa-modal-actions"><button type="button" onClick={() => setBranchForm(null)}>Hủy</button><button className="fa-primary" type="submit">Lưu Chi/Nhánh</button></div></form></div></div>}
    </div>}

    {view === 'relations' && <><div className="fa-panel"><h2>{editRelationId ? 'Sửa quan hệ' : 'Thêm quan hệ'}</h2><p className="fa-muted">Kiểm tra trùng, tự liên kết và vòng tổ tiên trước khi lưu.</p><form className="fa-form-grid" onSubmit={(event) => {
      event.preventDefault();
      const parentTypes = ['father', 'mother', 'adoptive_parent', 'step_parent'];
      if (parentTypes.includes(relationForm.type)) {
        const pPerson = data.persons.find((p) => p.id === relationForm.fromId);
        const cPerson = data.persons.find((p) => p.id === relationForm.toId);
        if (pPerson?.birthDate && cPerson?.birthDate) {
          const pYear = parseInt(pPerson.birthDate.slice(0, 4), 10);
          const cYear = parseInt(cPerson.birthDate.slice(0, 4), 10);
          if (!isNaN(pYear) && !isNaN(cYear) && cYear - pYear < 13) {
            if (!window.confirm('Khoảng cách tuổi sinh học bất thường (< 13 tuổi). Bạn có chắc chắn muốn lưu?')) {
              return;
            }
          }
        }
      }
      try { saveRelation(relationForm, editRelationId); setRelationForm({ type: 'father', fromId: '', toId: '', since: '' }); setEditRelationId(undefined); setNotice({ text: 'Đã lưu quan hệ trong bản xem trước.', error: false }); } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không thể lưu quan hệ.', error: true }); }
    }}><label>Loại quan hệ<select value={relationForm.type} onChange={(event) => setRelationForm({ ...relationForm, type: event.target.value as RelationType })}>{Object.entries(relationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Người thứ nhất (Cha/Mẹ)<select required value={relationForm.fromId} onChange={(event) => setRelationForm({ ...relationForm, fromId: event.target.value })}><option value="">Chọn Person</option>{data.persons.filter((person) => !person.hidden).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label>Người thứ hai (Con)<select required value={relationForm.toId} onChange={(event) => setRelationForm({ ...relationForm, toId: event.target.value })}><option value="">Chọn Person</option>{data.persons.filter((person) => !person.hidden).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label>Từ ngày (nếu có)<input type="date" value={relationForm.since} onChange={(event) => setRelationForm({ ...relationForm, since: event.target.value })} /></label><div className="fa-wide fa-actions"><button className="fa-primary" type="submit">Lưu quan hệ</button>{editRelationId && <button type="button" onClick={() => { setEditRelationId(undefined); setRelationForm({ type: 'father', fromId: '', toId: '', since: '' }); }}>Hủy sửa</button>}</div></form></div><div className="fa-panel"><h2>Quan hệ đã ghi</h2><div className="fa-table-wrap"><table><thead><tr><th>Loại</th><th>Người thứ nhất</th><th>Người thứ hai</th><th>Từ ngày</th><th>Thao tác</th></tr></thead><tbody>{data.relations.map((relation) => <tr key={relation.id}><td>{relationLabels[relation.type]}</td><td>{personName(relation.fromId)}</td><td>{personName(relation.toId)}</td><td>{relation.since || '—'}</td><td><div className="fa-actions"><button type="button" onClick={() => { setEditRelationId(relation.id); setRelationForm({ ...relation }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Sửa</button><button type="button" onClick={() => { if (window.confirm('Gỡ quan hệ này khỏi bản xem trước?')) run(() => removeRelation(relation.id), 'Đã gỡ quan hệ.'); }}>Gỡ</button></div></td></tr>)}</tbody></table></div></div></>}

    {view === 'tree' && <div className="fa-panel"><div className="fa-panel-heading"><div><h2>Cây theo quan hệ cha/mẹ–con</h2><p>Chọn chi, đời hoặc một Person để tập trung.</p></div><button type="button" onClick={() => go('relations')}>Quản lý quan hệ →</button></div><div className="fa-toolbar"><select aria-label="Lọc Chi/Nhánh" value={treeBranch} onChange={(event) => setTreeBranch(event.target.value)}><option value="all">Tất cả Chi/Nhánh</option>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select aria-label="Lọc đời thứ" value={treeGeneration} onChange={(event) => setTreeGeneration(event.target.value)}><option value="all">Tất cả đời</option>{[...new Set(data.persons.map((person) => person.generation))].sort((a, b) => a - b).map((generation) => <option key={generation} value={generation}>Đời {generation}</option>)}</select><select aria-label="Tập trung Person" value={treeFocus} onChange={(event) => setTreeFocus(event.target.value)}><option value="">Toàn cây</option>{data.persons.filter((person) => !person.hidden).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select><div className="fa-zoom"><button type="button" onClick={() => setTreeScale((value) => Math.max(0.8, value - 0.1))}>−</button><span>{Math.round(treeScale * 100)}%</span><button type="button" onClick={() => setTreeScale((value) => Math.min(1.3, value + 0.1))}>+</button></div></div><div className="fa-tree-list" style={{ fontSize: `${treeScale}rem` }}>{data.persons.filter((person) => !person.hidden && (treeBranch === 'all' || person.branchId === treeBranch) && (treeGeneration === 'all' || String(person.generation) === treeGeneration) && (!treeFocus || person.id === treeFocus || data.relations.some((relation) => (relation.fromId === treeFocus && relation.toId === person.id || relation.toId === treeFocus && relation.fromId === person.id) && relation.type !== 'spouse'))).sort((a, b) => a.generation - b.generation).map((person) => { const parents = data.relations.filter((relation) => relation.toId === person.id && relation.type !== 'spouse'); const spouses = data.relations.filter((relation) => relation.type === 'spouse' && (relation.fromId === person.id || relation.toId === person.id)); return <article key={person.id} className="fa-tree-person" style={{ marginLeft: `${Math.max(0, person.generation - Math.min(...data.persons.map((item) => item.generation))) * 24}px` }}><div><strong>{person.fullName}</strong><span>Đời {person.generation} · {branchName(person.branchId)}</span></div><small>{parents.length ? `Cha/mẹ: ${parents.map((item) => personName(item.fromId)).join(', ')}` : 'Gốc nhánh / chưa ghi cha mẹ'}{spouses.length ? ` · Vợ/chồng: ${spouses.map((item) => personName(item.fromId === person.id ? item.toId : item.fromId)).join(', ')}` : ''}</small></article>; })}</div></div>}

    {view === 'search' && <div className="fa-panel"><h2>Đường quan hệ giữa hai Person</h2><p className="fa-muted">Dựa trên các cạnh cha/mẹ–con, hôn nhân, con nuôi và con riêng đã được ghi.</p><div className="fa-form-grid"><label>Person thứ nhất<select value={searchFrom} onChange={(event) => setSearchFrom(event.target.value)}><option value="">Chọn Person</option>{data.persons.filter((person) => !person.hidden).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label>Person thứ hai<select value={searchTo} onChange={(event) => setSearchTo(event.target.value)}><option value="">Chọn Person</option>{data.persons.filter((person) => !person.hidden).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label></div>{relationshipPath && <div className="fa-result">{relationshipPath.length ? <><strong>Đường kết nối ngắn nhất: {relationshipPath.length - 1} bước</strong><ol>{relationshipPath.map((id, index) => <li key={`${id}-${index}`}>{personName(id)}{index < relationshipPath.length - 1 && <small>{(() => { const nextId = relationshipPath[index + 1]; const relation = data.relations.find((item) => item.fromId === id && item.toId === nextId || item.fromId === nextId && item.toId === id); return relation ? ` — ${relationLabels[relation.type]}` : ''; })()}</small>}</li>)}</ol></> : <p>Chưa xác định được quan hệ từ dữ liệu hiện có.</p>}</div>}</div>}
    {view === 'search' && relationshipHint && <div className="fa-panel"><h2>Gợi ý xưng hô</h2><p>{relationshipHint}</p><p className="fa-muted">Kết quả suy từ dữ liệu quan hệ đã ghi; cần người quản lý xác minh trước khi dùng chính thức.</p></div>}

    {view === 'approvals' && (
      <>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            type="button"
            className={approvalsTab === 'join-requests' ? 'fa-primary' : ''}
            onClick={() => setApprovalsTab('join-requests')}
            style={{ padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
          >
            Gia nhập dòng tộc ({joinRequests.filter((r) => r.status === 'PENDING' || r.status === 'NEED_INFO').length})
          </button>
          <button
            type="button"
            className={approvalsTab === 'proposals' ? 'fa-primary' : ''}
            onClick={() => setApprovalsTab('proposals')}
            style={{ padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
          >
            Đề xuất chỉnh sửa gia phả ({data.proposals.filter((p) => p.status === 'pending').length})
          </button>
        </div>

        {approvalsTab === 'join-requests' && (
          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>Xét duyệt hồ sơ xin gia nhập dòng tộc</h2>
                <p className="fa-muted">
                  Xác minh quan hệ huyết thống/hôn nhân của tài khoản xin gia nhập và liên kết với hồ sơ Person trong cây gia phả.
                </p>
              </div>
              <button type="button" onClick={loadJoinRequests} disabled={loadingJoinReqs}>
                {loadingJoinReqs ? 'Đang tải...' : 'Làm mới'}
              </button>
            </div>

            {joinRequests.length === 0 ? (
              <p className="fa-muted">Chưa có yêu cầu xin gia nhập nào gửi tới dòng họ này.</p>
            ) : (
              <div className="fa-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Người xin gia nhập</th>
                      <th>Phía gia đình</th>
                      <th>Người thân khai báo</th>
                      <th>Ngày gửi</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {joinRequests.map((req) => (
                      <tr key={req.request_id}>
                        <td>
                          <strong>{req.full_name}</strong>
                          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                            {req.user_display_name} ({req.user_email || 'Tài khoản'})
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: req.lineage_type === 'PATERNAL' ? '#e0f2fe' : '#fdf2f8',
                              color: req.lineage_type === 'PATERNAL' ? '#0369a1' : '#be185d',
                            }}
                          >
                            {req.lineage_type === 'PATERNAL' ? 'Bên nội' : 'Bên ngoại'}
                          </span>
                        </td>
                        <td>
                          <div>{req.relative_name}</div>
                          <small style={{ color: '#64748b' }}>Quan hệ: {req.relative_relation}</small>
                        </td>
                        <td>{new Date(req.created_at).toLocaleDateString('vi-VN')}</td>
                        <td>
                          <span
                            className={`fa-status ${
                              req.status === 'APPROVED' ? 'approved' : req.status === 'REJECTED' ? 'rejected' : 'pending'
                            }`}
                          >
                            {req.status === 'PENDING'
                              ? 'Chờ xác minh'
                              : req.status === 'NEED_INFO'
                              ? 'Cần bổ sung'
                              : req.status === 'APPROVED'
                              ? 'Đã chấp thuận'
                              : req.status === 'REJECTED'
                              ? 'Đã từ chối'
                              : 'Đã hủy'}
                          </span>
                        </td>
                        <td>
                          <div className="fa-actions">
                            <button type="button" onClick={() => handleOpenReviewModal(req)}>
                              {req.status === 'PENDING' || req.status === 'NEED_INFO' ? 'Xét duyệt' : 'Xem chi tiết'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {approvalsTab === 'proposals' && (
          <div className="fa-panel">
            <h2>Đề xuất chờ xử lý</h2>
            <p className="fa-muted">Khi duyệt, thay đổi được áp dụng vào dữ liệu bản xem trước. Từ chối giữ nguyên dữ liệu.</p>
            {data.proposals.length ? (
              <div className="fa-proposals">
                {data.proposals.map((proposal) => (
                  <article className="fa-proposal" key={proposal.id}>
                    <div className="fa-proposal-top">
                      <div>
                        <span className="fa-card-eyebrow">
                          {proposal.type === 'profile' ? 'HỒ SƠ' : 'QUAN HỆ'} · {proposal.proposer}
                        </span>
                        <h3>{proposal.summary}</h3>
                      </div>
                      <span className={`fa-status ${proposal.status}`}>
                        {proposal.status === 'pending'
                          ? 'Chờ duyệt'
                          : proposal.status === 'approved'
                          ? 'Đã duyệt'
                          : 'Từ chối'}
                      </span>
                    </div>
                    <p>
                      Person: <strong>{personName(proposal.personId)}</strong>
                      {proposal.type === 'profile'
                        ? ` · Giá trị đề xuất: ${proposal.proposedValue}`
                        : proposal.relation
                        ? ` · ${relationLabels[proposal.relation.type]}: ${personName(
                            proposal.relation.fromId
                          )} → ${personName(proposal.relation.toId)}`
                        : ''}
                    </p>
                    {proposal.status === 'pending' ? (
                      <>
                        <label>
                          Lý do / ghi chú
                          <textarea
                            rows={2}
                            value={reviewNote[proposal.id] || ''}
                            onChange={(event) =>
                              setReviewNote({ ...reviewNote, [proposal.id]: event.target.value })
                            }
                            placeholder="Bắt buộc khi từ chối"
                          />
                        </label>
                        <div className="fa-actions">
                          <button
                            type="button"
                            className="fa-primary"
                            onClick={() =>
                              run(
                                () => reviewProposal(proposal.id, 'approved', reviewNote[proposal.id] || ''),
                                'Đã duyệt và cập nhật dữ liệu bản xem trước.'
                              )
                            }
                          >
                            Phê duyệt
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              run(
                                () => reviewProposal(proposal.id, 'rejected', reviewNote[proposal.id] || ''),
                                'Đã từ chối đề xuất.'
                              )
                            }
                          >
                            Từ chối
                          </button>
                        </div>
                      </>
                    ) : (
                      <small>
                        {proposal.note || 'Không có ghi chú'}
                        {proposal.reviewedAt ? ` · ${new Date(proposal.reviewedAt).toLocaleString('vi-VN')}` : ''}
                      </small>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p>Chưa có đề xuất.</p>
            )}
          </div>
        )}

        {/* MODAL XÉT DUYỆT HỒ SƠ XIN GIA NHẬP */}
        {selectedJoinReq && (
          <div className="fa-modal-backdrop">
            <div className="fa-modal" role="dialog" aria-modal="true" style={{ maxWidth: '680px', borderRadius: '16px' }}>
              <div className="fa-modal-title" style={{ paddingBottom: '12px', borderBottom: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Xét duyệt hồ sơ xin gia nhập dòng họ</h2>
                <button
                  type="button"
                  onClick={() => setSelectedJoinReq(null)}
                  aria-label="Đóng"
                  style={{ border: 0, background: 'transparent', fontSize: '24px', cursor: 'pointer', color: '#64748b' }}
                >
                  ×
                </button>
              </div>

              <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: '4px' }}>
                {/* Thông tin người xin gia nhập */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13.5px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>Người xin gia nhập:</span>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{selectedJoinReq.full_name}</div>
                      <small style={{ color: '#64748b' }}>{selectedJoinReq.user_display_name} ({selectedJoinReq.user_email})</small>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>Phía quan hệ:</span>
                      <div style={{ marginTop: '2px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: selectedJoinReq.lineage_type === 'PATERNAL' ? '#e0f2fe' : '#fdf2f8',
                          color: selectedJoinReq.lineage_type === 'PATERNAL' ? '#0369a1' : '#be185d',
                        }}>
                          {selectedJoinReq.lineage_type === 'PATERNAL' ? 'Bên nội (Họ cha)' : 'Bên ngoại (Họ mẹ)'}
                        </span>
                      </div>
                      <small style={{ color: '#64748b', display: 'block', marginTop: '4px' }}>Ngày sinh: {selectedJoinReq.birth_date || 'Chưa rõ'}</small>
                    </div>
                  </div>

                  <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#f1f5f9', borderRadius: '6px' }}>
                    <span style={{ color: '#475569', fontSize: '12px', fontWeight: 600 }}>Người thân & quan hệ đã khai: </span>
                    <strong style={{ color: '#0f172a' }}>{selectedJoinReq.relative_name}</strong> ({selectedJoinReq.relative_relation})
                  </div>

                  <div>
                    <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>Lời khai xác minh:</span>
                    <div style={{ whiteSpace: 'pre-wrap', background: '#ffffff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '4px', color: '#1e293b', fontSize: '13px', lineHeight: '1.5' }}>
                      {selectedJoinReq.verification_notes}
                    </div>
                  </div>

                  {selectedJoinReq.review_note && (
                    <div style={{ color: '#991b1b', marginTop: '8px', fontSize: '12.5px' }}>
                      <strong>Ghi chú trước đó:</strong> {selectedJoinReq.review_note}
                    </div>
                  )}

                  {selectedJoinReq.linked_person_name && (
                    <div style={{ color: '#166534', marginTop: '8px', fontSize: '12.5px' }}>
                      <strong>Hồ sơ Person đã liên kết:</strong> {selectedJoinReq.linked_person_name}
                    </div>
                  )}
                </div>

                {/* Form thao tác nếu PENDING hoặc NEED_INFO */}
                {(selectedJoinReq.status === 'PENDING' || selectedJoinReq.status === 'NEED_INFO') ? (
                  <div>
                    <h3 style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#0f172a', fontWeight: 700 }}>
                      Hành động xét duyệt:
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      <button
                        type="button"
                        onClick={() => setReviewActionType('APPROVE')}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '13.5px',
                          border: reviewActionType === 'APPROVE' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                          background: reviewActionType === 'APPROVE' ? '#2563eb' : '#ffffff',
                          color: reviewActionType === 'APPROVE' ? '#ffffff' : '#334155',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Chấp thuận
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewActionType('NEED_INFO')}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '13.5px',
                          border: reviewActionType === 'NEED_INFO' ? '1.5px solid #d97706' : '1px solid #cbd5e1',
                          background: reviewActionType === 'NEED_INFO' ? '#d97706' : '#ffffff',
                          color: reviewActionType === 'NEED_INFO' ? '#ffffff' : '#334155',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Yêu cầu bổ sung
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewActionType('REJECT')}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '13.5px',
                          border: reviewActionType === 'REJECT' ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                          background: reviewActionType === 'REJECT' ? '#dc2626' : '#ffffff',
                          color: reviewActionType === 'REJECT' ? '#ffffff' : '#334155',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Từ chối
                      </button>
                    </div>

                    {/* APPROVE Options */}
                    {reviewActionType === 'APPROVE' && (
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                          <div
                            onClick={() => setLinkPersonMode('new')}
                            style={{
                              border: linkPersonMode === 'new' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                              background: linkPersonMode === 'new' ? '#eff6ff' : '#ffffff',
                              borderRadius: '8px',
                              padding: '12px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '13.5px', color: linkPersonMode === 'new' ? '#1d4ed8' : '#0f172a', marginBottom: '4px' }}>
                              1. Thêm mới vào Cây gia phả
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.4' }}>
                              Tạo hồ sơ thành viên và xuất hiện trên Cây gia phả (mặc định chưa nối phả hệ).
                            </div>
                          </div>

                          <div
                            onClick={() => setLinkPersonMode('existing')}
                            style={{
                              border: linkPersonMode === 'existing' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                              background: linkPersonMode === 'existing' ? '#eff6ff' : '#ffffff',
                              borderRadius: '8px',
                              padding: '12px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '13.5px', color: linkPersonMode === 'existing' ? '#1d4ed8' : '#0f172a', marginBottom: '4px' }}>
                              2. Liên kết hồ sơ có sẵn
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.4' }}>
                              Gán tài khoản vào một hồ sơ Person đã có từ trước trong cây gia phả.
                            </div>
                          </div>
                        </div>

                        {linkPersonMode === 'new' && (
                          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
                              Thông tin hồ sơ hiển thị trên cây:
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                              <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                                Họ và tên *
                                <input
                                  type="text"
                                  required
                                  value={newPersonName}
                                  onChange={(e) => setNewPersonName(e.target.value)}
                                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                                />
                              </label>
                              <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                                Giới tính
                                <select
                                  value={newPersonGender}
                                  onChange={(e) => setNewPersonGender(e.target.value as any)}
                                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                                >
                                  <option value="male">Nam</option>
                                  <option value="female">Nữ</option>
                                  <option value="other">Khác</option>
                                </select>
                              </label>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                              <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                                Ngày sinh
                                <input
                                  type="date"
                                  value={newPersonBirthDate}
                                  onChange={(e) => setNewPersonBirthDate(e.target.value)}
                                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                                />
                              </label>
                              <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                                Chi / Nhánh
                                <select
                                  value={newPersonBranchId}
                                  onChange={(e) => setNewPersonBranchId(e.target.value)}
                                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                                >
                                  {data.branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>

                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px', marginTop: '6px' }}>
                              <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                Xác nhận quan hệ ngay (Tùy chọn):
                              </label>
                              <small style={{ color: '#64748b', display: 'block', marginBottom: '6px' }}>
                                Nếu đã xác minh được người thân ({selectedJoinReq.relative_name}), bạn có thể chọn Cha/Mẹ để nối đường phả hệ ngay khi duyệt. Nếu để trống, thành viên sẽ hiển thị ở trạng thái chưa nối để kết nối sau trên cây gia phả.
                              </small>
                              <select
                                value={selectedParentId}
                                onChange={(e) => setSelectedParentId(e.target.value)}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                              >
                                <option value="">-- Để trống (Chưa nối phả hệ, xác nhận quan hệ sau) --</option>
                                {data.persons
                                  .filter((p) => !p.hidden)
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.fullName} (Đời {p.generation} · {genderLabels[p.gender]} · {branchName(p.branchId)})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        )}

                        {linkPersonMode === 'existing' && (
                          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
                            <input
                              type="text"
                              placeholder="Lọc theo tên thành viên có sẵn..."
                              value={personSearchText}
                              onChange={(e) => setPersonSearchText(e.target.value)}
                              style={{ width: '100%', padding: '8px 10px', marginBottom: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                            />
                            <select
                              required
                              value={selectedPersonId}
                              onChange={(e) => setSelectedPersonId(e.target.value)}
                              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                            >
                              <option value="">-- Chọn hồ sơ Person trong cây gia phả --</option>
                              {data.persons
                                .filter((p) => !p.hidden && (!personSearchText || p.fullName.toLowerCase().includes(personSearchText.toLowerCase())))
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.fullName} (Đời {p.generation} · {genderLabels[p.gender]} · Sinh: {p.birthDate || 'Chưa rõ'} · {branchName(p.branchId)})
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        <div style={{ fontSize: '12.5px', color: '#166534', background: '#dcfce7', padding: '8px 12px', borderRadius: '6px' }}>
                          Người dùng sẽ nhận quyền <strong>Thành viên (Member)</strong> tại dòng họ này sau khi được phê duyệt.
                        </div>
                      </div>
                    )}

                    {/* Reviewer Note Input */}
                    <div className="fa-form-grid" style={{ gridTemplateColumns: '1fr', marginTop: '12px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                        {reviewActionType === 'APPROVE'
                          ? 'Ghi chú duyệt (tùy chọn):'
                          : reviewActionType === 'NEED_INFO'
                          ? 'Nội dung phản hồi cần bổ sung * (Bắt buộc):'
                          : 'Lý do từ chối * (Bắt buộc):'}
                        <textarea
                          rows={3}
                          value={reviewerNote}
                          onChange={(e) => setReviewerNote(e.target.value)}
                          placeholder={
                            reviewActionType === 'APPROVE'
                              ? 'Ví dụ: Đã xác minh quan hệ với người thân đã khai...'
                              : reviewActionType === 'NEED_INFO'
                              ? 'Vui lòng nêu rõ chi nhánh gia đình hoặc tên bố mẹ để xác minh...'
                              : 'Không tìm thấy thông tin phù hợp trong dòng họ...'
                          }
                          required={reviewActionType !== 'APPROVE'}
                          style={{ marginTop: '4px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '13px' }}
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontStyle: 'italic', background: '#f8fafc', borderRadius: '8px' }}>
                    Yêu cầu này đã được kết thúc xử lý ({selectedJoinReq.status}).
                  </div>
                )}
              </div>

              <div className="fa-modal-actions" style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setSelectedJoinReq(null)}
                  disabled={isSubmittingReview}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer' }}
                >
                  Đóng
                </button>
                {(selectedJoinReq.status === 'PENDING' || selectedJoinReq.status === 'NEED_INFO') && (
                  <button
                    type="button"
                    className="fa-primary"
                    onClick={handleExecuteReview}
                    disabled={isSubmittingReview}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '6px',
                      background: reviewActionType === 'APPROVE' ? '#2563eb' : reviewActionType === 'NEED_INFO' ? '#d97706' : '#dc2626',
                      borderColor: reviewActionType === 'APPROVE' ? '#2563eb' : reviewActionType === 'NEED_INFO' ? '#d97706' : '#dc2626',
                      color: '#ffffff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isSubmittingReview
                      ? 'Đang xử lý...'
                      : reviewActionType === 'APPROVE'
                      ? 'Xác nhận chấp thuận'
                      : reviewActionType === 'NEED_INFO'
                      ? 'Gửi yêu cầu bổ sung'
                      : 'Xác nhận từ chối'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    )}

    {view === 'accounts' && <>
      <div className="fa-panel">
        <div className="fa-panel-heading">
          <div>
            <h2>Phân quyền Quản trị viên dòng họ (Family Admin)</h2>
            <p className="fa-muted">Trưởng tộc bổ nhiệm và phân quyền Family Admin từ các thành viên chính thức thuộc dòng họ.</p>
          </div>
          <button type="button" onClick={loadClanUsers} disabled={loadingUsers}>
            {loadingUsers ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>

        <div className="fa-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Email</th>
                <th>Vai trò hiện tại</th>
                <th>Trạng thái tài khoản</th>
                <th>Thao tác quản trị</th>
              </tr>
            </thead>
            <tbody>
              {clanUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '16px' }}>
                    {loadingUsers ? 'Đang tải danh sách thành viên dòng họ...' : 'Chưa có thành viên nào trong dòng họ.'}
                  </td>
                </tr>
              ) : (
                clanUsers.map((u) => {
                  const isOwner = u.roles.includes('BUSINESS_OWNER') || u.roles.includes('owner');
                  return (
                    <tr key={u.user_id}>
                      <td><strong>{u.display_name}</strong></td>
                      <td>{u.email}</td>
                      <td>
                        {isOwner ? (
                          <span className="fa-status approved">Trưởng tộc (Chủ sở hữu)</span>
                        ) : u.is_family_admin ? (
                          <span className="fa-status approved" style={{ background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>
                            Family Admin
                          </span>
                        ) : (
                          <span className="fa-status pending">Thành viên</span>
                        )}
                      </td>
                      <td>
                        <span className={`fa-status ${u.user_status === 'ACTIVE' ? 'approved' : 'rejected'}`}>
                          {u.user_status === 'ACTIVE' ? 'Hoạt động' : u.user_status}
                        </span>
                      </td>
                      <td>
                        {isOwner ? (
                          <small>Không thể chỉnh sửa Chủ sở hữu</small>
                        ) : u.is_family_admin ? (
                          <button
                            type="button"
                            style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #f87171' }}
                            disabled={!isLeader || actionUserId === u.user_id}
                            onClick={() => setConfirmAction({ type: 'revoke', userId: u.user_id, userName: u.display_name })}
                          >
                            {actionUserId === u.user_id ? 'Đang xử lý...' : 'Thu hồi Family Admin'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="fa-primary"
                            disabled={!isLeader || actionUserId === u.user_id}
                            onClick={() => setConfirmAction({ type: 'assign', userId: u.user_id, userName: u.display_name })}
                          >
                            {actionUserId === u.user_id ? 'Đang xử lý...' : 'Nâng quyền Family Admin'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fa-panel">
        <h2>Cấp bản nháp tài khoản cho Person</h2>
        <p className="fa-muted">Dành cho việc tạo hồ sơ đăng nhập mẫu hoặc quản lý Person chưa có tài khoản thật.</p>
        <form className="fa-form-grid" onSubmit={(event) => { event.preventDefault(); try { issueAccount(accountForm); setAccountForm({ personId: '', username: '', email: '' }); setNotice({ text: 'Đã tạo bản nháp tài khoản.', error: false }); } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không thể tạo bản nháp.', error: true }); } }}>
          <label>Person *<select required value={accountForm.personId} onChange={(event) => setAccountForm({ ...accountForm, personId: event.target.value })}><option value="">Chọn Person</option>{data.persons.filter((person) => !person.deathDate && !data.accounts.some((account) => account.personId === person.id)).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
          <label>Username *<input required value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} /></label>
          <label>Email<input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} /></label>
          <div className="fa-wide"><button className="fa-primary" type="submit">Tạo bản nháp tài khoản</button></div>
        </form>
      </div>

      {confirmAction && (
        <div className="fa-modal-backdrop" onClick={() => !actionUserId && setConfirmAction(null)}>
          <div
            className="fa-modal"
            style={{
              maxWidth: '460px',
              padding: '24px',
              borderRadius: '16px',
              background: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  background: confirmAction.type === 'assign' ? '#eff6ff' : '#fef2f2',
                  color: confirmAction.type === 'assign' ? '#1d4ed8' : '#b91c1c',
                  border: `1px solid ${confirmAction.type === 'assign' ? '#bfdbfe' : '#fecaca'}`,
                }}
              >
                {confirmAction.type === 'assign' ? 'XÁC NHẬN BỔ NHIỆM' : 'XÁC NHẬN THU HỒI'}
              </span>
              <button
                type="button"
                onClick={() => !actionUserId && setConfirmAction(null)}
                style={{ border: 'none', background: 'transparent', fontSize: '20px', cursor: 'pointer', color: '#64748b', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <h3 style={{ margin: '0 0 12px', fontSize: '18px', color: '#0f172a', fontWeight: 700 }}>
              {confirmAction.type === 'assign'
                ? 'Bổ nhiệm Quản trị viên dòng họ'
                : 'Thu hồi quyền Quản trị viên'}
            </h3>

            <div style={{ fontSize: '14px', color: '#334155', lineHeight: '1.6', marginBottom: '20px' }}>
              {confirmAction.type === 'assign' ? (
                <>
                  Bạn có chắc chắn muốn nâng quyền <strong>Quản trị viên dòng họ (Family Admin)</strong> cho thành viên <strong>{confirmAction.userName}</strong> không?
                  <div style={{ marginTop: '10px', fontSize: '13px', color: '#475569', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    Sau khi cấp quyền, thành viên này sẽ có quyền hỗ trợ quản lý phả hệ, thông tin Person và các đề xuất trong dòng họ.
                  </div>
                </>
              ) : (
                <>
                  Bạn có chắc chắn muốn thu hồi quyền <strong>Family Admin</strong> của thành viên <strong>{confirmAction.userName}</strong> không?
                  <div style={{ marginTop: '10px', fontSize: '13px', color: '#991b1b', background: '#fef2f2', padding: '10px 12px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                    Tài khoản sẽ quay về quyền Thành viên thông thường và không còn quyền quản lý dòng tộc.
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                disabled={!!actionUserId}
                onClick={() => setConfirmAction(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: actionUserId ? 'not-allowed' : 'pointer',
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={!!actionUserId}
                onClick={handleExecuteConfirmAction}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: confirmAction.type === 'assign' ? '#2563eb' : '#dc2626',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  cursor: actionUserId ? 'not-allowed' : 'pointer',
                  boxShadow: confirmAction.type === 'assign' ? '0 2px 6px rgba(37, 99, 235, 0.25)' : '0 2px 6px rgba(220, 38, 38, 0.25)',
                }}
              >
                {actionUserId ? 'Đang xử lý...' : confirmAction.type === 'assign' ? 'Xác nhận nâng quyền' : 'Xác nhận thu hồi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>}

    {view === 'links' && <><div className="fa-panel"><h2>Yêu cầu liên kết dòng họ</h2><p className="fa-muted">Yêu cầu và kết quả phê duyệt ở đây chỉ tồn tại trong bản xem trước; không chia sẻ dữ liệu với dòng họ khác.</p><form className="fa-form-grid" onSubmit={(event) => { event.preventDefault(); try { sendLinkRequest(linkForm.targetFamily, linkForm.reason); setLinkForm({ targetFamily: '', reason: '' }); setNotice({ text: 'Đã lưu bản nháp yêu cầu liên họ.', error: false }); } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không thể tạo yêu cầu.', error: true }); } }}><label>Dòng họ đích *<input required value={linkForm.targetFamily} onChange={(event) => setLinkForm({ ...linkForm, targetFamily: event.target.value })} placeholder="Ví dụ: Dòng họ Trần" /></label><label>Lý do / quan hệ<input value={linkForm.reason} onChange={(event) => setLinkForm({ ...linkForm, reason: event.target.value })} placeholder="Thông gia, bên ngoại..." /></label><div className="fa-wide"><button className="fa-primary" type="submit">Gửi bản nháp yêu cầu</button></div></form></div><div className="fa-panel"><h2>Danh sách yêu cầu</h2>{data.linkRequests.length ? <div className="fa-table-wrap"><table><thead><tr><th>Dòng họ đích</th><th>Lý do</th><th>Ngày tạo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{data.linkRequests.map((request) => <tr key={request.id}><td><strong>{request.targetFamily}</strong></td><td>{request.reason || '—'}</td><td>{new Date(request.createdAt).toLocaleDateString('vi-VN')}</td><td><span className={`fa-status ${request.status}`}>{request.status === 'pending' ? 'Chờ duyệt' : request.status === 'approved' ? 'Đã duyệt (mẫu)' : 'Từ chối'}</span></td><td>{request.status === 'pending' && <div className="fa-actions"><button type="button" onClick={() => run(() => reviewLinkRequest(request.id, 'approved'), 'Đã đổi trạng thái bản nháp; chưa tạo liên kết thật.')}>Duyệt mẫu</button><button type="button" onClick={() => run(() => reviewLinkRequest(request.id, 'rejected'), 'Đã từ chối bản nháp.')}>Từ chối</button></div>}</td></tr>)}</tbody></table></div> : <p className="fa-muted">Chưa có yêu cầu liên họ.</p>}</div></>}

    {view === 'exchange' && <><div className="fa-panel"><h2>Nhập và xuất Excel (.xlsx)</h2><p className="fa-muted">Xử lý hoàn toàn trong trình duyệt. File Person phải có các cột fullName, gender, birthDate, branch, generation. Nhập sẽ hủy toàn bộ nếu có dòng lỗi hoặc trùng.</p><div className="fa-actions"><button type="button" onClick={async () => { try { await downloadPersonTemplateXlsx(); } catch { setNotice({ text: 'Không thể tạo file Excel mẫu.', error: true }); } }}>Tải mẫu Excel</button><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Chọn tệp Excel" onChange={async (event) => { try { const file = event.target.files?.[0]; setXlsxPreview(null); if (!file) return; if (file.size > 2_000_000) throw new Error('Tệp vượt quá 2 MB.'); const rows = await readPersonXlsx(file); if (rows.length < 2) throw new Error('File Excel chưa có dữ liệu Person.'); const header = rows[0].map(clean); const required = ['fullname', 'gender', 'birthdate', 'branch', 'generation']; if (!required.every((name) => header.includes(name))) throw new Error('Thiếu cột bắt buộc: fullName, gender, birthDate, branch, generation.'); const index = (name: string) => header.indexOf(name); const parsed = rows.slice(1).map((row, rowIndex) => { const branchText = row[index('branch')]?.trim() || ''; const branch = data.branches.find((item) => clean(item.name) === clean(branchText) || item.id === branchText); const gender = clean(row[index('gender')] || ''); const birthDate = row[index('birthdate')]?.trim() || ''; const generation = Number(row[index('generation')]); if (!branch || !['male', 'female', 'other'].includes(gender) || birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isInteger(generation) || generation < 1) throw new Error(`Dòng ${rowIndex + 2}: giới tính, ngày sinh, Chi/Nhánh hoặc đời thứ không hợp lệ.`); return { fullName: row[index('fullname')]?.trim() || '', gender: gender as FamilyPerson['gender'], birthDate, branchId: branch.id, generation }; }); setXlsxPreview(parsed); setNotice({ text: `Đã đọc ${parsed.length} dòng Excel. Xác nhận để nhập cục bộ.`, error: false }); } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không đọc được file Excel.', error: true }); } }} /><button type="button" className="fa-primary" disabled={!xlsxPreview?.length} onClick={() => { try { const count = importPersons(xlsxPreview || []); setXlsxPreview(null); setNotice({ text: `Đã nhập ${count} Person từ Excel vào dữ liệu cục bộ.`, error: false }); } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không thể nhập Excel.', error: true }); } }}>Xác nhận nhập Excel</button><button type="button" className="fa-primary" data-testid="btn-export-excel" onClick={handleExportClanMembers}>Xuất file Excel/CSV</button></div>{xlsxPreview && <p className="fa-muted">Sẵn sàng nhập {xlsxPreview.length} Person. Hãy kiểm tra tên Chi/Nhánh và bản ghi trùng trước khi xác nhận.</p>}</div><div className="fa-panel"><h2>Nhập Person từ CSV</h2><p className="fa-muted">CSV UTF-8 là lựa chọn nhẹ hơn Excel; nhập tất cả hoặc không nhập dòng nào khi có lỗi.</p><div className="fa-actions"><button type="button" onClick={() => downloadFile('mau-person-family-admin.csv', 'fullName,gender,birthDate,branch,generation\n"Võ Văn Mẫu",male,1990-01-01,"Chi Trưởng",6\n', 'text/csv;charset=utf-8')}>Tải file mẫu</button><input type="file" accept=".csv,text/csv" aria-label="Chọn tệp CSV" onChange={(event) => { setCsvFile(event.target.files?.[0] || null); setCsvPreview(null); }} /></div>{csvFile && <p className="fa-muted">Đã chọn: {csvFile.name}</p>}<div className="fa-actions"><button type="button" onClick={async () => { try { if (!csvFile) throw new Error('Vui lòng chọn tệp CSV.'); if (csvFile.size > 2_000_000) throw new Error('Tệp vượt quá 2 MB.'); const rows = parseCsv(await csvFile.text()); if (rows.length < 2) throw new Error('Tệp chưa có dữ liệu Person.'); const header = rows[0].map(clean); const required = ['fullname', 'gender', 'birthdate', 'branch', 'generation']; if (!required.every((name) => header.includes(name))) throw new Error('Thiếu cột bắt buộc: fullName, gender, birthDate, branch, generation.'); const index = (name: string) => header.indexOf(name); const parsed = rows.slice(1).map((row, rowIndex) => { const branchText = row[index('branch')]?.trim() || ''; const branch = data.branches.find((item) => clean(item.name) === clean(branchText) || item.id === branchText); const gender = clean(row[index('gender')] || ''); const birthDate = row[index('birthdate')]?.trim() || ''; const generation = Number(row[index('generation')]); if (!branch || !['male', 'female', 'other'].includes(gender) || birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isInteger(generation) || generation < 1) throw new Error(`Dòng ${rowIndex + 2}: giới tính, ngày sinh, Chi/Nhánh hoặc đời thứ không hợp lệ.`); return { fullName: row[index('fullname')]?.trim() || '', gender: gender as FamilyPerson['gender'], birthDate, branchId: branch.id, generation }; }); setCsvPreview(parsed); setNotice({ text: `Đã kiểm tra định dạng ${parsed.length} dòng. Xác nhận để nhập cục bộ.`, error: false }); } catch (error) { setCsvPreview(null); setNotice({ text: error instanceof Error ? error.message : 'Không đọc được tệp CSV.', error: true }); } }}>Kiểm tra tệp</button><button type="button" className="fa-primary" disabled={!csvPreview?.length} onClick={() => { try { const count = importPersons(csvPreview || []); setCsvPreview(null); setCsvFile(null); setNotice({ text: `Đã nhập ${count} Person vào dữ liệu cục bộ.`, error: false }); } catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không thể nhập dữ liệu.', error: true }); } }}>Xác nhận nhập</button></div>{csvPreview && <div className="fa-table-wrap"><table><thead><tr><th>Họ tên</th><th>Giới tính</th><th>Ngày sinh</th><th>Chi/Nhánh</th><th>Đời</th></tr></thead><tbody>{csvPreview.slice(0, 10).map((person, index) => <tr key={`${person.fullName}-${index}`}><td>{person.fullName}</td><td>{genderLabels[person.gender]}</td><td>{person.birthDate || '—'}</td><td>{branchName(person.branchId)}</td><td>{person.generation}</td></tr>)}</tbody></table>{csvPreview.length > 10 && <p className="fa-muted">Đang xem 10/{csvPreview.length} dòng.</p>}</div>}</div><div className="fa-panel"><h2>Xuất dữ liệu cục bộ</h2><p className="fa-muted">Chỉ xuất tên, giới tính, ngày sinh, Chi/Nhánh, đời thứ và quan hệ đã ghi; không đưa email, số điện thoại hoặc hồ sơ riêng tư vào file CSV.</p><div className="fa-actions"><button type="button" className="fa-primary" onClick={() => { const current = getFamilyAdminState(); const rows = [['fullName', 'gender', 'birthDate', 'branch', 'generation'], ...current.persons.filter((person) => !person.hidden && person.visibility !== 'private').map((person) => [person.fullName, person.gender, person.birthDate, current.branches.find((branch) => branch.id === person.branchId)?.name || '', String(person.generation)])]; downloadFile('person-family-admin.csv', rows.map((row) => row.map(csvEscape).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); }}>Xuất Person CSV</button><button type="button" onClick={() => { const current = getFamilyAdminState(); const visible = new Set(current.persons.filter((person) => !person.hidden && person.visibility !== 'private').map((person) => person.id)); const rows = [['type', 'from', 'to', 'since'], ...current.relations.filter((relation) => visible.has(relation.fromId) && visible.has(relation.toId)).map((relation) => [relation.type, current.persons.find((person) => person.id === relation.fromId)?.fullName || '', current.persons.find((person) => person.id === relation.toId)?.fullName || '', relation.since])]; downloadFile('quan-he-family-admin.csv', rows.map((row) => row.map(csvEscape).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); }}>Xuất quan hệ CSV</button></div></div></>}

    {view === 'audit' && <div className="fa-panel"><h2>Nhật ký trong trình duyệt</h2><p className="fa-muted">Nhật ký này không thay thế AuditLog ở máy chủ.</p>{data.audit.length ? <ul className="fa-audit-list">{data.audit.map((item) => <li key={item.id}><span>{item.action}</span><time>{new Date(item.at).toLocaleString('vi-VN')}</time></li>)}</ul> : <p>Chưa có thao tác.</p>}</div>}
  </section>;
};

export default FamilyAdminModule;
