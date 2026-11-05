import { EmptyState } from '../../shared/Feedback/EmptyState';
import { LoadingState } from '../../shared/Feedback/LoadingState';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useClanContext } from '../../context/ClanContext';
import apiClient from '../../api/axios';
import {
  fetchClanUsers, assignFamilyAdmin, revokeFamilyAdmin, revokeClanMember, type ClanUserItem,
} from '../../services/admin.service';
import {
  getFamilyAdminState, importPersons, issueAccount, removeRelation, requestAccountReset,
  reviewProposal, saveBranch, savePerson, saveRelation,
  toggleAccountLock, togglePersonHidden, useFamilyAdminState, syncFamilyAdminFromBackend,
  savePersonToBackend, saveBranchToBackend, saveRelationToBackend, removeRelationFromBackend,
  type FamilyBranch, type FamilyPerson, type FamilyRelation, type RelationType,
} from './familyAdminStore';
import {
  fetchLinkRequests,
  sendLinkRequest as apiSendLinkRequest,
  reviewLinkRequest as apiReviewLinkRequest,
  fetchInterClanLinks,
} from '../../services/network.service';
import {
  createFamilyPerson,
  fetchClanAuditLogs,
  recordClanAuditLog,
  downloadGenealogyTemplate,
  previewGenealogyExcel,
  executeGenealogyExcel,
  type ClanAuditLogItem,
  type ExcelValidationResult,
} from '../../services/genealogy.service';
import './FamilyAdminModule.css';
import { downloadPersonTemplateXlsx, readPersonXlsx } from './familyAdminExcel';
import { AIExcelAuditView } from '../../components/clan/AIExcelAuditView';
import { analyzeExcelImportWithAI } from '../../services/ai.service';
import type { AIExcelImportAnalyzeResponse } from '../../types/ai';
import { RelationshipFinder } from '../../components/member/RelationshipFinder';
import { ExcelTemplateRequirementsGuide } from '../../shared/tree/ExcelTemplateRequirementsGuide';
import {
  getClanJoinRequestsForReviewer,
  reviewClanJoinRequest,
  type ClanJoinRequestItem,
} from '../../services/clanJoin.service';
import { fetchMembers } from '../../services/member.service';
import { readApiError } from '../../api/apiError';
import { GenderAvatar } from '../../components/common/GenderAvatar';
import { ClanLocationsModule } from '../../components/clan/ClanLocationsModule';
import { ClanNetworkManagement } from '../../components/network/ClanNetworkManagement';

export type FamilyAdminView = 'overview' | 'members' | 'relations' | 'branches' | 'tree' | 'search' | 'approvals' | 'accounts' | 'links' | 'exchange' | 'audit' | 'locations';
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

  // Link requests from backend
  const [backendLinkRequests, setBackendLinkRequests] = useState<any[]>([]);
  const [backendActiveLinks, setBackendActiveLinks] = useState<any[]>([]);
  const [linkedPersonIds, setLinkedPersonIds] = useState<Set<string>>(new Set());

  const loadLinkedPersons = useCallback(async () => {
    if (!clanId) return;
    try {
      const res = await fetchMembers({ familyId: clanId, limit: 1000 });
      const ids = new Set((res.items || []).filter((m) => Boolean(m.userId)).map((m) => m.id));
      setLinkedPersonIds(ids);
    } catch (err) {
      console.error('Failed to load linked persons:', err);
    }
  }, [clanId]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  // Clan Audit Logs State
  const [clanAuditLogs, setClanAuditLogs] = useState<ClanAuditLogItem[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditCategoryFilter, setAuditCategoryFilter] = useState('all');
  const [auditSearchTerm, setAuditSearchTerm] = useState('');

  const loadClanAuditLogs = useCallback(async () => {
    if (!clanId) return;
    try {
      setLoadingAuditLogs(true);
      const items = await fetchClanAuditLogs(clanId);
      setClanAuditLogs(items);
    } catch (err) {
      console.error('Failed to load clan audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  }, [clanId]);

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

  const loadLinksData = useCallback(async () => {
    try {
      setLoadingLinks(true);
      const [reqs, links] = await Promise.all([
        fetchLinkRequests(),
        fetchInterClanLinks('ACTIVE'),
      ]);
      setBackendLinkRequests(reqs || []);
      setBackendActiveLinks(links || []);
    } catch (err) {
      console.error('Failed to load links:', err);
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  useEffect(() => {
    syncFamilyAdminFromBackend(clanId);
    loadClanUsers();
    loadLinksData();
    loadLinkedPersons();
  }, [clanId, loadClanUsers, loadLinksData, loadLinkedPersons]);

  const [deletePersonTarget, setDeletePersonTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingPerson, setDeletingPerson] = useState(false);

  const handleConfirmDeletePerson = async () => {
    if (!deletePersonTarget) return;
    setDeletingPerson(true);
    try {
      await apiClient.delete(`/members/${deletePersonTarget.id}`);
      setNotice({
        text: `Đã xóa nhân vật '${deletePersonTarget.name}' khỏi cây gia phả (Tài khoản thành viên liên kết nếu có vẫn được bảo lưu trong dòng tộc).`,
        error: false,
      });
      setDeletePersonTarget(null);
      await syncFamilyAdminFromBackend(clanId);
    } catch (err: any) {
      setNotice({
        text: err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi xóa nhân vật khỏi cây gia phả.',
        error: true,
      });
    } finally {
      setDeletingPerson(false);
    }
  };

  const [confirmAction, setConfirmAction] = useState<{
    type: 'assign' | 'revoke' | 'expel';
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
        await recordClanAuditLog(clanId, {
          action: 'Bổ nhiệm Quản trị viên (Family Admin)',
          action_type: 'PERMISSION',
          details: `Đã cấp quyền Family Admin cho thành viên: ${userName}.`,
        });
        setNotice({ text: `Đã nâng quyền Family Admin thành công cho ${userName}.`, error: false });
      } else if (type === 'revoke') {
        await revokeFamilyAdmin(clanId, userId);
        await recordClanAuditLog(clanId, {
          action: 'Thu hồi quyền Quản trị viên (Family Admin)',
          action_type: 'PERMISSION',
          details: `Đã thu hồi quyền Family Admin của thành viên: ${userName}.`,
        });
        setNotice({ text: `Đã thu hồi quyền Family Admin của ${userName}.`, error: false });
      } else if (type === 'expel') {
        const res = await revokeClanMember(clanId, userId);
        setNotice({
          text: res?.message || `Đã khai trừ thành viên ${userName} ra khỏi dòng họ thành công.`,
          error: false,
        });
      }
      setConfirmAction(null);
      await loadClanUsers();
    } catch (err: any) {
      setNotice({
        text: err?.response?.data?.message || err?.message || (type === 'assign' ? 'Không thể nâng quyền Family Admin.' : type === 'revoke' ? 'Không thể thu hồi quyền.' : 'Không thể khai trừ thành viên.'),
        error: true,
      });
    } finally {
      setActionUserId(null);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadGenealogyTemplate(clanId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MFGMS_Mau_Nhap_Gia_Pha_${clanId.slice(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice({ text: 'Đã tải xuống file mẫu Excel chuẩn 4 sheets thành công!', error: false });
    } catch (err: any) {
      setNotice({ text: readApiError(err).message || 'Không thể tải file mẫu Excel.', error: true });
    }
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setNotice({ text: 'Vui lòng chọn tệp định dạng Excel (.xlsx).', error: true });
      return;
    }
    setImportFile(file);
    setValidationResult(null);
    setAiAuditReport(null);
    setIsValidating(true);
    try {
      const res = await previewGenealogyExcel(clanId, file);
      setValidationResult(res);
      if (res.is_valid) {
        setNotice({
          text: `File hợp lệ! Phát hiện ${res.summary.total_persons} thành viên, ${res.summary.total_relationships} quan hệ, ${res.summary.total_branches} chi nhánh. Hãy xem trước dữ liệu và xác nhận lưu.`,
          error: false,
        });
      } else {
        setNotice({
          text: `Phát hiện ${res.summary.fatal_count} lỗi dữ liệu trong file Excel. Vui lòng xem bảng báo lỗi bên dưới và chỉnh sửa lại file.`,
          error: true,
        });
      }
    } catch (err: any) {
      setNotice({ text: readApiError(err).message || 'Lỗi khi kiểm tra file Excel.', error: true });
    } finally {
      setIsValidating(false);
    }
  };


  const handleRunAIAnalysis = async () => {
    if (!importFile) return;
    setIsAnalyzingAI(true);
    setNotice(null);
    try {
      const res = await analyzeExcelImportWithAI(clanId, importFile);
      setAiAuditReport(res);
      setNotice({
        text: `Đã hoàn tất phân tích đối soát bằng AI! Điểm chất lượng dự kiến: ${res.summary.health_score}/100.`,
        error: false,
      });
    } catch (err: any) {
      setNotice({ text: err.message || 'Không thể phân tích dữ liệu bằng AI.', error: true });
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!importFile || !validationResult?.is_valid) return;
    setIsExecutingImport(true);
    try {
      const res = await executeGenealogyExcel(clanId, importFile);
      setNotice({ text: res.message || 'Đã nhập gia phả thành công vào cơ sở dữ liệu!', error: false });
      setImportFile(null);
      setValidationResult(null);
      setAiAuditReport(null);
      await syncFamilyAdminFromBackend(clanId);
    } catch (err: any) {
      setNotice({ text: readApiError(err).message || 'Có lỗi khi lưu gia phả vào hệ thống.', error: true });
    } finally {
      setIsExecutingImport(false);
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
      link.download = `danh-sach-${clanDisplayName || 'thanh-vien'}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice({ text: 'Đã xuất danh sách thành viên dòng họ thành công.', error: false });
      await recordClanAuditLog(clanId, {
        action: 'Xuất dữ liệu gia phả',
        action_type: 'EXPORT',
        details: 'Đã xuất danh sách thành viên dòng họ ra tệp bảng tính CSV/Excel.',
      });
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
      downloadFile('danh-sach-thanh-vien.csv', rows.map((row) => row.map(csvEscape).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
      setNotice({ text: 'Đã xuất danh sách thành viên thành công.', error: false });
    }
  };

  const [query, setQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');
  const [editPersonId, setEditPersonId] = useState<string | undefined>();
  const [personForm, setPersonForm] = useState<Omit<FamilyPerson, 'id'> | null>(null);
  const [savingPerson, setSavingPerson] = useState(false);

  const [editBranchId, setEditBranchId] = useState<string | undefined>();
  const [branchForm, setBranchForm] = useState<Omit<FamilyBranch, 'id'> | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);

  const [relationForm, setRelationForm] = useState<Omit<FamilyRelation, 'id'>>({ type: 'father', fromId: '', toId: '', since: '' });
  const [editRelationId, setEditRelationId] = useState<string | undefined>();
  const [savingRelation, setSavingRelation] = useState(false);

  const [linkForm, setLinkForm] = useState({ targetFamily: '', reason: '' });
  const [sendingLink, setSendingLink] = useState(false);

  const [accountForm, setAccountForm] = useState({ personId: '', username: '', email: '' });
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<Array<Pick<FamilyPerson, 'fullName' | 'gender' | 'birthDate' | 'branchId' | 'generation'>> | null>(null);
  const [xlsxPreview, setXlsxPreview] = useState<Array<Pick<FamilyPerson, 'fullName' | 'gender' | 'birthDate' | 'branchId' | 'generation'>> | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<ExcelValidationResult | null>(null);
  const [aiAuditReport, setAiAuditReport] = useState<AIExcelImportAnalyzeResponse | null>(null);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isExecutingImport, setIsExecutingImport] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState<'persons' | 'relations' | 'branches'>('persons');

  // Join Requests review state for view === 'approvals'
  const [approvalsTab, setApprovalsTab] = useState<'join-requests' | 'proposals'>('join-requests');
  const [joinRequests, setJoinRequests] = useState<ClanJoinRequestItem[]>([]);
  const [loadingJoinReqs, setLoadingJoinReqs] = useState(false);
  const [selectedJoinReq, setSelectedJoinReq] = useState<ClanJoinRequestItem | null>(null);
  const [reviewActionType, setReviewActionType] = useState<'APPROVE' | 'NEED_INFO' | 'REJECT'>('APPROVE');
  const [reviewerNote, setReviewerNote] = useState('');
  const [linkPersonMode, setLinkPersonMode] = useState<'existing' | 'new'>('new');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [selectedParentId, setSelectedParentId] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonGender, setNewPersonGender] = useState<'male' | 'female' | 'other'>('male');
  const [newPersonBirthDate, setNewPersonBirthDate] = useState('');
  const [newPersonBranchId, setNewPersonBranchId] = useState('');
  const [personSearchText, setPersonSearchText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const loadJoinRequests = useCallback(async () => {
    if (!clanId) return;
    try {
      setLoadingJoinReqs(true);
      const items = await getClanJoinRequestsForReviewer(clanId);
      setJoinRequests(items);
    } catch (err) {
      console.error('Failed to load join requests:', err);
    } finally {
      setLoadingJoinReqs(false);
    }
  }, [clanId]);

  useEffect(() => {
    if (view === 'approvals') {
      loadJoinRequests();
    }
    if (view === 'links') {
      loadLinksData();
    }
    if (view === 'audit') {
      loadClanAuditLogs();
    }
  }, [view, loadJoinRequests, loadLinksData]);

  const handleOpenReviewModal = (req: ClanJoinRequestItem) => {
    setSelectedJoinReq(req);
    setReviewActionType('APPROVE');
    setReviewerNote('');
    setPersonSearchText('');

    // 1. Tự động kiểm tra có Person nào trong cây trùng tên và chưa bị ai liên kết
    const reqNameClean = req.full_name.trim().toLowerCase();
    const matchingPerson = data.persons.find(
      (p) => p.fullName.trim().toLowerCase() === reqNameClean && !linkedPersonIds.has(p.id)
    );

    // 2. Tìm người thân / cha mẹ nếu có trùng tên với relative_name
    const relNameClean = (req.relative_name || '').trim().toLowerCase();
    const matchingParent = relNameClean
      ? data.persons.find((p) => p.fullName.trim().toLowerCase().includes(relNameClean))
      : undefined;

    const isFemale = reqNameClean.includes(' thị ') || reqNameClean.includes('thi ') || reqNameClean.endsWith(' thảo') || reqNameClean.endsWith(' hoa') || reqNameClean.endsWith(' lan');
    const guessedGender: 'male' | 'female' = isFemale ? 'female' : 'male';

    if (matchingPerson) {
      setLinkPersonMode('existing');
      setSelectedPersonId(matchingPerson.id);
      setSelectedParentId(matchingParent?.id || '');
      setNewPersonName(req.full_name);
      setNewPersonGender((matchingPerson.gender as any) || guessedGender);
      setNewPersonBirthDate(matchingPerson.birthDate || req.birth_date || '');
      setNewPersonBranchId(matchingPerson.branchId || data.branches[0]?.id || '');
    } else {
      setLinkPersonMode('new');
      setSelectedPersonId('');
      setSelectedParentId(matchingParent?.id || '');
      setNewPersonName(req.full_name);
      setNewPersonGender(guessedGender);
      setNewPersonBirthDate(req.birth_date || '');
      setNewPersonBranchId(matchingParent?.branchId || data.branches[0]?.id || '');
    }
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
          if (!selectedPersonId) {
            alert('Vui lòng chọn một hồ sơ Person để liên kết với tài khoản này.');
            return;
          }
          if (linkedPersonIds.has(selectedPersonId)) {
            alert('Hồ sơ Person này đã được liên kết với một tài khoản khác. Vui lòng chọn hồ sơ khác hoặc tạo hồ sơ mới.');
            return;
          }
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
      await recordClanAuditLog(clanId, {
        action: reviewActionType === 'APPROVE' ? 'Phê duyệt hồ sơ xin gia nhập' : reviewActionType === 'NEED_INFO' ? 'Yêu cầu bổ sung hồ sơ gia nhập' : 'Từ chối hồ sơ gia nhập',
        action_type: 'APPROVAL',
        details: `Hồ sơ: ${selectedJoinReq.full_name} (${selectedJoinReq.user_email || 'Tài khoản'}).`,
      });
      setNotice({ text: 'Đã xử lý yêu cầu gia nhập thành công.', error: false });
      setSelectedJoinReq(null);
      await loadJoinRequests();
      await syncFamilyAdminFromBackend(clanId);
    } catch (err: any) {
      console.error('Lỗi khi duyệt yêu cầu gia nhập:', err);
      const apiErr = readApiError(err);
      const detail = err.response?.data?.detail;
      const msg =
        apiErr.message ||
        err.response?.data?.error?.message ||
        (typeof detail === 'object' && detail?.message) ||
        (typeof detail === 'string' ? detail : null) ||
        err.response?.data?.message ||
        err.message ||
        'Không thể xử lý yêu cầu gia nhập.';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const personName = (id: string) => data.persons.find((person) => person.id === id)?.fullName || 'Không tìm thấy';
  const branchName = (id: string) => data.branches.find((branch) => branch.id === id)?.name || 'Chưa phân chi';

  const run = (action: () => void, success: string) => {
    try { action(); setNotice({ text: success, error: false }); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : 'Không thể hoàn tất thao tác.', error: true }); }
  };
  const go = (target: FamilyAdminView) => onNavigate?.(target);

  const filteredPersons = useMemo(() => data.persons.filter((person) => {
    const matchesSearch = [person.fullName, branchName(person.branchId), person.email].join(' ').toLocaleLowerCase('vi').includes(clean(query));
    const matchesBranch = selectedBranchFilter === 'all' || person.branchId === selectedBranchFilter;
    return matchesSearch && matchesBranch;
  }), [data.persons, data.branches, query, selectedBranchFilter]);

  // Statistics Computations
  const totalPersons = data.persons.length;
  const maleCount = data.persons.filter((p) => p.gender === 'male').length;
  const femaleCount = data.persons.filter((p) => p.gender === 'female').length;
  const livingCount = data.persons.filter((p) => !p.deathDate && !p.hidden).length;
  const deceasedCount = data.persons.filter((p) => Boolean(p.deathDate) || p.hidden).length;

  const generationDistribution = useMemo(() => {
    const map: Record<number, number> = {};
    data.persons.forEach((p) => {
      const gen = p.generation || 1;
      map[gen] = (map[gen] || 0) + 1;
    });
    const sorted = Object.entries(map).map(([gen, count]) => ({ gen: Number(gen), count })).sort((a, b) => a.gen - b.gen);
    const maxCount = Math.max(...sorted.map((item) => item.count), 1);
    return { list: sorted, maxCount, maxGen: sorted.length ? sorted[sorted.length - 1].gen : 1 };
  }, [data.persons]);

  const title = ({
    overview: 'Thống kê dân số & thế hệ',
    members: 'Quản lý thành viên dòng họ',
    relations: 'Quan hệ gia phả',
    branches: 'Quản lý Chi & Nhánh',
    tree: 'Cây theo quan hệ',
    search: 'Tìm đường quan hệ & Xưng hô',
    approvals: 'Phê duyệt đề xuất',
    accounts: 'Phân quyền & Tài khoản',
    links: 'Yêu cầu liên kết dòng họ',
    exchange: 'Nhập xuất dữ liệu gia tộc',
    audit: 'Nhật ký hoạt động',
  } satisfies Record<FamilyAdminView, string>)[view];

  return (
    <section className="fa-workspace" aria-labelledby="fa-title">
      <header className="fa-header">
        <div>
          <span className="fa-eyebrow">QUẢN TRỊ DÒNG HỌ · {clanDisplayName}</span>
          <h1 id="fa-title">{title}</h1>
          <p>Hệ thống quản lý phả hệ chính thức: lưu trữ dữ liệu nhân khẩu, quan hệ, chi nhánh và phân quyền bảo mật.</p>
        </div>
        <span className="fa-preview-tag">HỆ THỐNG GIA PHẢ</span>
      </header>

      {notice && (
        <div className={`fa-notice ${notice.error ? 'error' : 'success'}`} role="status">
          <div className="fa-notice-content">
            <span className="fa-notice-icon">
              {notice.error ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
            </span>
            <span>{notice.text}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">×</button>
        </div>
      )}

      {/* ========================================================
          1. THỐNG KÊ DÂN SỐ & THẾ HỆ (VIEW: OVERVIEW)
      ======================================================== */}
      {view === 'overview' && (
        <>
          <div className="fa-stat-grid">
            <div className="fa-stat-card">
              <span>Tổng số nhân khẩu</span>
              <strong>{totalPersons}</strong>
              <small>{data.branches.length} Chi/Nhánh đã ghi nhận</small>
            </div>
            <div className="fa-stat-card">
              <span>Nam giới</span>
              <strong style={{ color: '#2563eb' }}>{maleCount}</strong>
              <small>{totalPersons ? Math.round((maleCount / totalPersons) * 100) : 0}% tổng dòng họ</small>
            </div>
            <div className="fa-stat-card">
              <span>Nữ giới</span>
              <strong style={{ color: '#db2777' }}>{femaleCount}</strong>
              <small>{totalPersons ? Math.round((femaleCount / totalPersons) * 100) : 0}% tổng dòng họ</small>
            </div>
            <div className="fa-stat-card">
              <span>Còn sống / Hiện diện</span>
              <strong style={{ color: '#059669' }}>{livingCount}</strong>
              <small>{deceasedCount} tiền nhân đã khuất</small>
            </div>
            <div className="fa-stat-card">
              <span>Thế hệ ghi nhận</span>
              <strong style={{ color: '#d97706' }}>{generationDistribution.maxGen} Đời</strong>
              <small>Từ Thủy tổ đến thế hệ con cháu</small>
            </div>
            <div className="fa-stat-card">
              <span>Quan hệ phả hệ</span>
              <strong style={{ color: '#7c3aed' }}>{data.relations.length}</strong>
              <small>Liên kết cha mẹ - con & hôn phối</small>
            </div>
          </div>

          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>Phân bố thành viên theo thế hệ (Đời thứ)</h2>
                <p>Thống kê số lượng con cháu qua từng thế hệ của dòng tộc trong cơ sở dữ liệu.</p>
              </div>
            </div>
            {generationDistribution.list.length > 0 ? (
              <div className="fa-gen-bars">
                {generationDistribution.list.map(({ gen, count }) => {
                  const pct = Math.round((count / totalPersons) * 100) || 0;
                  const barWidth = Math.round((count / generationDistribution.maxCount) * 100);
                  return (
                    <div key={gen} className="fa-gen-bar-row">
                      <span className="fa-gen-bar-label">Đời {gen}</span>
                      <div className="fa-gen-bar-track">
                        <div className="fa-gen-bar-fill" style={{ width: `${Math.max(barWidth, 4)}%` }} />
                      </div>
                      <span className="fa-gen-bar-value">{count} người ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                variant="chart"
                compact
                title="Chưa đủ dữ liệu thành viên để phân tích thế hệ"
                subMessage="Hệ thống cần ít nhất thông tin các đời để tính toán tỉ lệ phân bố phái hệ."
              />
            )}
          </div>

          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>Cơ cấu nhân khẩu theo Chi & Nhánh</h2>
                <p>Số lượng thành viên thuộc từng chi phái trực hệ.</p>
              </div>
            </div>
            <div className="fa-card-grid">
              {data.branches.map((b) => {
                const count = data.persons.filter((p) => p.branchId === b.id).length;
                const pct = totalPersons ? Math.round((count / totalPersons) * 100) : 0;
                return (
                  <div key={b.id} className="fa-card">
                    <span className="fa-card-eyebrow">CHI NHÁNH</span>
                    <h3>{b.name}</h3>
                    <p>{b.description || 'Chưa cập nhật mô tả chi nhánh.'}</p>
                    <dl>
                      <div>
                        <dt>Số thành viên</dt>
                        <dd>{count} người ({pct}%)</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="fa-panel">
            <h2>Lối tắt quản lý dòng họ</h2>
            <div className="fa-actions" style={{ gap: '10px' }}>
              <button type="button" className="fa-primary" onClick={() => go('members')}>Quản lý thành viên →</button>
              <button type="button" onClick={() => go('relations')}>Thiết lập quan hệ →</button>
              <button type="button" onClick={() => go('branches')}>Quản lý Chi/Nhánh →</button>
              <button type="button" onClick={() => go('approvals')}>Phê duyệt hồ sơ →</button>
              <button type="button" onClick={() => go('exchange')}>Nhập/Xuất Excel →</button>
            </div>
          </div>
        </>
      )}

      {/* ========================================================
          2. QUẢN LÝ THÀNH VIÊN (VIEW: MEMBERS)
      ======================================================== */}
      {view === 'members' && (
        <>
          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>Danh sách thành viên ({filteredPersons.length})</h2>
                <p>Thêm mới, chỉnh sửa thông tin, ẩn hoặc khôi phục hồ sơ thành viên trong dòng họ.</p>
              </div>
              <button
                type="button"
                className="fa-primary"
                onClick={() => {
                  setEditPersonId(undefined);
                  setPersonForm(emptyPerson(data.branches[0]?.id || ''));
                }}
              >
                + Thêm thành viên
              </button>
            </div>

            <div className="fa-toolbar">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên thành viên, email..."
                aria-label="Tìm thành viên"
              />
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                aria-label="Lọc Chi/Nhánh"
              >
                <option value="all">Tất cả Chi/Nhánh</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <span>Hiển thị {filteredPersons.length} kết quả</span>
            </div>

            <div className="fa-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Họ và tên</th>
                    <th>Đời / Chi</th>
                    <th>Ngày sinh</th>
                    <th>Trạng thái</th>
                    <th>Quyền riêng tư</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPersons.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                        Không tìm thấy thành viên nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredPersons.map((person) => (
                      <tr key={person.id}>
                        <td>
                          <div className="fa-person-cell">
                            <span className={`fa-person-avatar ${person.gender === 'female' ? 'female' : 'male'}`}>
                              {person.fullName ? person.fullName.charAt(0).toUpperCase() : 'N'}
                            </span>
                            <div>
                              <div className="fa-person-name">{person.fullName}</div>
                              <small>{person.phone || person.email || genderLabels[person.gender]}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="fa-gen-chip">Đời {person.generation}</span>
                          <small>{branchName(person.branchId)}</small>
                        </td>
                        <td>
                          <div>{person.birthDate || 'Chưa rõ'}</div>
                          {person.deathDate && <small style={{ color: '#dc2626' }}>Mất: {person.deathDate}</small>}
                        </td>
                        <td>
                          <span className={`fa-status ${person.hidden ? 'muted' : person.deathDate ? 'pending' : 'approved'}`}>
                            {person.hidden ? 'Đã ẩn' : person.deathDate ? 'Đã mất' : 'Còn sống'}
                          </span>
                        </td>
                        <td>
                          <span className="fa-status muted">
                            {person.visibility === 'family' ? 'Nội tộc' : person.visibility === 'private' ? 'Riêng tư' : 'Quản trị viên'}
                          </span>
                        </td>
                        <td>
                          <div className="fa-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setEditPersonId(person.id);
                                setPersonForm({ ...person });
                              }}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => run(() => togglePersonHidden(person.id), 'Đã cập nhật trạng thái hiển thị của thành viên.')}
                            >
                              {person.hidden ? 'Khôi phục' : 'Ẩn'}
                            </button>
                            <button
                              type="button"
                              style={{ color: '#dc2626' }}
                              title="Xóa nhân vật khỏi cây gia phả"
                              onClick={() => setDeletePersonTarget({ id: person.id, name: person.fullName })}
                            >
                              Xóa khỏi cây
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal xác nhận xóa nhân vật khỏi cây gia phả */}
          {deletePersonTarget && (
            <div className="fa-modal-backdrop" onClick={() => !deletingPerson && setDeletePersonTarget(null)}>
              <div className="fa-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
                <div className="fa-modal-title">
                  <h2>Xóa nhân vật khỏi cây gia phả</h2>
                  <button type="button" onClick={() => !deletingPerson && setDeletePersonTarget(null)}>×</button>
                </div>
                <div style={{ padding: '8px 0' }}>
                  <p style={{ margin: '0 0 12px 0', fontSize: '14px', lineHeight: 1.6 }}>
                    Bạn có chắc chắn muốn xóa nhân vật <strong>{deletePersonTarget.name}</strong> khỏi sơ đồ cây gia phả không?
                  </p>
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', color: '#991b1b', fontSize: '13px' }}>
                    <strong>Lưu ý:</strong>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', lineHeight: 1.5 }}>
                      <li>Hồ sơ nhân vật và các quan hệ cha-con, vợ-chồng trên cây sẽ được giải phóng.</li>
                      <li>Tài khoản người dùng liên kết (nếu có) vẫn được bảo lưu trong dòng họ ở trạng thái chưa nối phả hệ.</li>
                      <li>Để khai trừ hoàn toàn tài khoản ra khỏi tộc, vui lòng thực hiện trong mục <em>Phân quyền &amp; Tài khoản</em>.</li>
                    </ul>
                  </div>
                </div>
                <div className="fa-modal-actions">
                  <button type="button" disabled={deletingPerson} onClick={() => setDeletePersonTarget(null)}>Hủy bỏ</button>
                  <button
                    type="button"
                    className="fa-primary"
                    style={{ background: '#dc2626', borderColor: '#b91c1c' }}
                    disabled={deletingPerson}
                    onClick={handleConfirmDeletePerson}
                  >
                    {deletingPerson ? 'Đang xóa...' : 'Xác nhận xóa khỏi cây'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Thêm/Sửa Person */}
          {personForm && (
            <div className="fa-modal-backdrop" onClick={() => !savingPerson && setPersonForm(null)}>
              <div className="fa-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="fa-modal-title">
                  <h2>{editPersonId ? 'Chỉnh sửa hồ sơ thành viên' : 'Thêm thành viên mới'}</h2>
                  <button type="button" onClick={() => !savingPerson && setPersonForm(null)} aria-label="Đóng">×</button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const todayStr = new Date().toISOString().split('T')[0];
                    if (personForm.birthDate && personForm.birthDate > todayStr) {
                      setNotice({ text: 'Ngày sinh không thể lớn hơn ngày hiện tại.', error: true });
                      return;
                    }
                    if (personForm.deathDate && personForm.birthDate && personForm.deathDate < personForm.birthDate) {
                      setNotice({ text: 'Ngày mất phải sau hoặc bằng ngày sinh.', error: true });
                      return;
                    }
                    try {
                      setSavingPerson(true);
                      await savePersonToBackend(clanId, personForm, editPersonId);
                      await recordClanAuditLog(clanId, {
                        action: editPersonId ? 'Chỉnh sửa thành viên' : 'Thêm thành viên mới',
                        action_type: 'MEMBER',
                        details: `Họ tên: ${personForm.fullName} (Đời ${personForm.generation}).`,
                      });
                      setPersonForm(null);
                      setNotice({ text: 'Đã lưu thông tin thành viên vào cơ sở dữ liệu thành công.', error: false });
                      await syncFamilyAdminFromBackend(clanId);
                    } catch (error) {
                      setNotice({ text: error instanceof Error ? error.message : 'Không thể lưu thông tin thành viên.', error: true });
                    } finally {
                      setSavingPerson(false);
                    }
                  }}
                >
                  <div className="fa-form-grid">
                    <label>
                      Họ và tên *
                      <input
                        required
                        value={personForm.fullName}
                        onChange={(e) => setPersonForm({ ...personForm, fullName: e.target.value })}
                        placeholder="Ví dụ: Mai Văn An"
                      />
                    </label>

                    <label>
                      Giới tính
                      <select
                        value={personForm.gender}
                        onChange={(e) => setPersonForm({ ...personForm, gender: e.target.value as FamilyPerson['gender'] })}
                      >
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                        <option value="other">Khác</option>
                      </select>
                    </label>

                    <label>
                      Ngày sinh
                      <input
                        type="date"
                        max={new Date().toISOString().split('T')[0]}
                        value={personForm.birthDate}
                        onChange={(e) => setPersonForm({ ...personForm, birthDate: e.target.value })}
                      />
                    </label>

                    <label>
                      Ngày mất (nếu đã qua đời)
                      <input
                        type="date"
                        min={personForm.birthDate || undefined}
                        value={personForm.deathDate}
                        onChange={(e) => setPersonForm({ ...personForm, deathDate: e.target.value })}
                      />
                    </label>

                    <label>
                      Thuộc Chi / Nhánh
                      <select
                        value={personForm.branchId}
                        onChange={(e) => setPersonForm({ ...personForm, branchId: e.target.value })}
                      >
                        {data.branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Đời thứ (Thế hệ) *
                      <input
                        type="number"
                        min="1"
                        required
                        value={personForm.generation}
                        onChange={(e) => setPersonForm({ ...personForm, generation: Number(e.target.value) })}
                      />
                    </label>

                    <label>
                      Email liên hệ
                      <input
                        type="email"
                        value={personForm.email}
                        onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })}
                        placeholder="email@example.com"
                      />
                    </label>

                    <label>
                      Số điện thoại
                      <input
                        value={personForm.phone}
                        onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })}
                        placeholder="0912..."
                      />
                    </label>

                    <label className="fa-wide">
                      Quyền hiển thị hồ sơ
                      <select
                        value={personForm.visibility}
                        onChange={(e) => setPersonForm({ ...personForm, visibility: e.target.value as FamilyPerson['visibility'] })}
                      >
                        <option value="family">Trong dòng họ (Thành viên chính thức)</option>
                        <option value="admin">Chỉ Người quản trị (Trưởng tộc / Family Admin)</option>
                        <option value="private">Riêng tư hoàn toàn</option>
                      </select>
                    </label>

                    <label className="fa-wide">
                      Tiểu sử & Ghi chú
                      <textarea
                        value={personForm.bio}
                        onChange={(e) => setPersonForm({ ...personForm, bio: e.target.value })}
                        rows={3}
                        placeholder="Nghề nghiệp, công trạng, chức vụ..."
                      />
                    </label>
                  </div>

                  <div className="fa-modal-actions">
                    <button type="button" disabled={savingPerson} onClick={() => setPersonForm(null)}>Hủy</button>
                    <button type="submit" className="fa-primary" disabled={savingPerson}>
                      {savingPerson ? 'Đang lưu...' : 'Lưu thành viên'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================
          3. QUAN HỆ GIA PHẢ (VIEW: RELATIONS)
      ======================================================== */}
      {view === 'relations' && (
        <>
          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>{editRelationId ? 'Chỉnh sửa quan hệ' : 'Thiết lập quan hệ mới'}</h2>
                <p>Nối quan hệ cha/mẹ - con, hôn phối vợ/chồng trực tiếp vào cây phả hệ.</p>
              </div>
            </div>

            <form
              className="fa-form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                const parentTypes = ['father', 'mother', 'adoptive_parent', 'step_parent'];
                if (parentTypes.includes(relationForm.type)) {
                  const pPerson = data.persons.find((p) => p.id === relationForm.fromId);
                  const cPerson = data.persons.find((p) => p.id === relationForm.toId);
                  if (pPerson?.birthDate && cPerson?.birthDate) {
                    const pYear = parseInt(pPerson.birthDate.slice(0, 4), 10);
                    const cYear = parseInt(cPerson.birthDate.slice(0, 4), 10);
                    if (!isNaN(pYear) && !isNaN(cYear) && cYear - pYear < 13) {
                      if (!window.confirm('Khoảng cách tuổi sinh học bất thường (< 13 tuổi). Bạn có chắc chắn muốn lưu quan hệ này?')) {
                        return;
                      }
                    }
                  }
                }
                try {
                  setSavingRelation(true);
                  await saveRelationToBackend(clanId, relationForm, editRelationId);
                  await recordClanAuditLog(clanId, {
                    action: editRelationId ? 'Sửa quan hệ gia phả' : 'Thiết lập quan hệ mới',
                    action_type: 'RELATION',
                    details: `${relationLabels[relationForm.type]} giữa ${personName(relationForm.fromId)} và ${personName(relationForm.toId)}.`,
                  });
                  setRelationForm({ type: 'father', fromId: '', toId: '', since: '' });
                  setEditRelationId(undefined);
                  setNotice({ text: 'Đã lưu quan hệ gia phả vào cơ sở dữ liệu thành công.', error: false });
                  await syncFamilyAdminFromBackend(clanId);
                } catch (error) {
                  setNotice({ text: error instanceof Error ? error.message : 'Không thể lưu quan hệ.', error: true });
                } finally {
                  setSavingRelation(false);
                }
              }}
            >
              <label>
                Loại quan hệ *
                <select
                  value={relationForm.type}
                  onChange={(e) => setRelationForm({ ...relationForm, type: e.target.value as RelationType })}
                >
                  {Object.entries(relationLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label>
                Người thứ nhất (Cha/Mẹ hoặc Chồng) *
                <select
                  required
                  value={relationForm.fromId}
                  onChange={(e) => setRelationForm({ ...relationForm, fromId: e.target.value })}
                >
                  <option value="">-- Chọn thành viên --</option>
                  {data.persons.filter((p) => !p.hidden).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} (Đời {p.generation} · {genderLabels[p.gender]})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Người thứ hai (Con hoặc Vợ) *
                <select
                  required
                  value={relationForm.toId}
                  onChange={(e) => setRelationForm({ ...relationForm, toId: e.target.value })}
                >
                  <option value="">-- Chọn thành viên --</option>
                  {data.persons.filter((p) => !p.hidden).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} (Đời {p.generation} · {genderLabels[p.gender]})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Từ ngày (kết hôn / sinh con)
                <input
                  type="date"
                  value={relationForm.since}
                  onChange={(e) => setRelationForm({ ...relationForm, since: e.target.value })}
                />
              </label>

              <div className="fa-wide fa-actions">
                <button className="fa-primary" type="submit" disabled={savingRelation}>
                  {savingRelation ? 'Đang lưu...' : 'Lưu quan hệ'}
                </button>
                {editRelationId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditRelationId(undefined);
                      setRelationForm({ type: 'father', fromId: '', toId: '', since: '' });
                    }}
                  >
                    Hủy sửa
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>Danh sách quan hệ đã ghi ({data.relations.length})</h2>
                <p>Các liên kết huyết thống và hôn phối hiện có trong cơ sở dữ liệu phả hệ.</p>
              </div>
            </div>

            <div className="fa-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Loại quan hệ</th>
                    <th>Người thứ nhất</th>
                    <th>Liên kết</th>
                    <th>Người thứ hai</th>
                    <th>Thời điểm</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.relations.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '16px' }}>
                        <EmptyState
                          variant="tree"
                          compact
                          title="Chưa thiết lập mối liên kết phả hệ nào"
                          subMessage="Hãy chọn thành viên nguồn, quan hệ và thành viên đích ở biểu mẫu bên trên để kết nối."
                        />
                      </td>
                    </tr>
                  ) : (
                    data.relations.map((relation) => (
                      <tr key={relation.id}>
                        <td>
                          <span className={`fa-status ${relation.type === 'spouse' ? 'pending' : 'approved'}`}>
                            {relationLabels[relation.type]}
                          </span>
                        </td>
                        <td><strong>{personName(relation.fromId)}</strong></td>
                        <td style={{ textAlign: 'center', color: '#94a3b8' }}>➔</td>
                        <td><strong>{personName(relation.toId)}</strong></td>
                        <td>{relation.since || '—'}</td>
                        <td>
                          <div className="fa-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setEditRelationId(relation.id);
                                setRelationForm({ ...relation });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              style={{ color: '#dc2626' }}
                              onClick={async () => {
                                if (window.confirm('Bạn có chắc chắn muốn xóa quan hệ này khỏi cơ sở dữ liệu?')) {
                                  try {
                                    await removeRelationFromBackend(clanId, relation.id);
                                    setNotice({ text: 'Đã xóa quan hệ thành công.', error: false });
                                    await syncFamilyAdminFromBackend(clanId);
                                  } catch (err) {
                                    setNotice({ text: 'Không thể xóa quan hệ.', error: true });
                                  }
                                }
                              }}
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================
          4. CÂY THEO QUAN HỆ (VIEW: TREE)
      ======================================================== */}
      {view === 'tree' && (
        <div className="fa-panel">
          <div className="fa-panel-heading">
            <div>
              <h2>Cây gia phả trực quan</h2>
              <p>Xem toàn bộ sơ đồ gia phả theo cấu trúc trực hệ và chi nhánh.</p>
            </div>
            <button
              type="button"
              className="fa-primary"
              onClick={() => onNavigate?.('tree')}
            >
              Mở Cây gia phả tương tác 2D →
            </button>
          </div>
          <p className="fa-muted">
            Hệ thống cây gia phả tương tác đã được kích hoạt đầy đủ với tính năng kéo thả, phóng to thu nhỏ, di chuyển nhánh và thêm con/vợ chồng. Bấm nút phía trên để trải nghiệm trên toàn màn hình.
          </p>
        </div>
      )}

      {/* ========================================================
          5. TÌM ĐƯỜNG QUAN HỆ (VIEW: SEARCH)
      ======================================================== */}
      {view === 'search' && (
        <RelationshipFinder
          familyId={clanId}
          canManage={true}
          onNavigateTab={(tab) => onNavigate?.(tab as any)}
        />
      )}

      {/* ========================================================
          6. QUẢN LÝ CHI & NHÁNH (VIEW: BRANCHES)
      ======================================================== */}
      {view === 'branches' && (
        <div className="fa-panel">
          <div className="fa-panel-heading">
            <div>
              <h2>Chi & Nhánh của {clanDisplayName} ({data.branches.length})</h2>
              <p>Quản lý các chi nhánh, người lập chi và số lượng thành viên trực thuộc.</p>
            </div>
            <button
              className="fa-primary"
              type="button"
              onClick={() => {
                setEditBranchId(undefined);
                setBranchForm({ ...emptyBranch });
              }}
            >
              + Thêm Chi/Nhánh
            </button>
          </div>

          <div className="fa-card-grid">
            {data.branches.map((branch) => {
              const membersInBranch = data.persons.filter((p) => p.branchId === branch.id);
              return (
                <article className="fa-card" key={branch.id}>
                  <div>
                    <span className="fa-card-eyebrow">CHI NHÁNH TRỰC HỆ</span>
                    <h3>{branch.name}</h3>
                    <p>{branch.description || 'Chi phái trực hệ - Chưa cập nhật ghi chép lịch sử hình thành.'}</p>
                    <dl>
                      <div>
                        <dt>Người lập chi</dt>
                        <dd>{branch.founderId ? personName(branch.founderId) : 'Thủy tổ dòng họ'}</dd>
                      </div>
                      <div>
                        <dt>Số thành viên</dt>
                        <dd><strong>{membersInBranch.length}</strong> Person</dd>
                      </div>
                    </dl>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditBranchId(branch.id);
                      setBranchForm({ ...branch });
                    }}
                  >
                    Chỉnh sửa
                  </button>
                </article>
              );
            })}
          </div>

          {branchForm && (
            <div className="fa-modal-backdrop" onClick={() => !savingBranch && setBranchForm(null)}>
              <div className="fa-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="fa-modal-title">
                  <h2>{editBranchId ? 'Sửa thông tin Chi/Nhánh' : 'Thêm Chi/Nhánh mới'}</h2>
                  <button type="button" onClick={() => !savingBranch && setBranchForm(null)} aria-label="Đóng">×</button>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      setSavingBranch(true);
                      await saveBranchToBackend(clanId, branchForm, editBranchId);
                      await recordClanAuditLog(clanId, {
                        action: editBranchId ? 'Chỉnh sửa Chi/Nhánh' : 'Khởi tạo Chi/Nhánh mới',
                        action_type: 'BRANCH',
                        details: `Tên Chi/Nhánh: ${branchForm.name}.`,
                      });
                      setBranchForm(null);
                      setNotice({ text: 'Đã lưu Chi/Nhánh vào cơ sở dữ liệu thành công.', error: false });
                      await syncFamilyAdminFromBackend(clanId);
                    } catch (error) {
                      setNotice({ text: error instanceof Error ? error.message : 'Không thể lưu Chi/Nhánh.', error: true });
                    } finally {
                      setSavingBranch(false);
                    }
                  }}
                >
                  <div className="fa-form-grid">
                    <label>
                      Tên Chi/Nhánh *
                      <input
                        required
                        value={branchForm.name}
                        onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                        placeholder="Ví dụ: Chi Trưởng - Phụng thờ Từ Đường"
                      />
                    </label>
                    <label>
                      Người lập chi (Thủy tổ chi)
                      <select
                        value={branchForm.founderId}
                        onChange={(e) => setBranchForm({ ...branchForm, founderId: e.target.value })}
                      >
                        <option value="">-- Chưa chọn --</option>
                        {data.persons.map((person) => (
                          <option key={person.id} value={person.id}>{person.fullName} (Đời {person.generation})</option>
                        ))}
                      </select>
                    </label>
                    <label className="fa-wide">
                      Mô tả chi nhánh
                      <textarea
                        rows={3}
                        value={branchForm.description}
                        onChange={(e) => setBranchForm({ ...branchForm, description: e.target.value })}
                        placeholder="Lịch sử phát triển, địa bàn cư trú..."
                      />
                    </label>
                  </div>
                  <div className="fa-modal-actions">
                    <button type="button" disabled={savingBranch} onClick={() => setBranchForm(null)}>Hủy</button>
                    <button className="fa-primary" type="submit" disabled={savingBranch}>
                      {savingBranch ? 'Đang lưu...' : 'Lưu Chi/Nhánh'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          7. PHÊ DUYỆT ĐỀ XUẤT (VIEW: APPROVALS)
      ======================================================== */}
      {view === 'approvals' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              className={approvalsTab === 'join-requests' ? 'fa-primary' : ''}
              onClick={() => setApprovalsTab('join-requests')}
              style={{ padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
            >
              Gia nhập dòng tộc ({joinRequests.filter((r) => r.status === 'PENDING' || r.status === 'NEED_INFO').length})
            </button>
            <button
              type="button"
              className={approvalsTab === 'proposals' ? 'fa-primary' : ''}
              onClick={() => setApprovalsTab('proposals')}
              style={{ padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
            >
              Đề xuất chỉnh sửa gia phả ({data.proposals.filter((p) => p.status === 'pending').length})
            </button>
          </div>

          {approvalsTab === 'join-requests' && (
            <div className="fa-panel">
              <div className="fa-panel-heading">
                <div>
                  <h2>Xét duyệt hồ sơ xin gia nhập dòng tộc</h2>
                  <p>Xác minh người xin gia nhập và liên kết với hồ sơ Person trong cây gia phả.</p>
                </div>
                <button type="button" onClick={loadJoinRequests} disabled={loadingJoinReqs}>
                  {loadingJoinReqs ? 'Đang tải...' : 'Làm mới'}
                </button>
              </div>

              {joinRequests.length === 0 ? (
                <EmptyState
                  variant="requests"
                  title="Không có yêu cầu xin gia nhập nào đang chờ duyệt"
                  subMessage="Tất cả các hồ sơ xin gia nhập dòng họ của thành viên và con cháu gia tộc đã được xét duyệt hoàn tất."
                />
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
                                {req.status === 'PENDING' || req.status === 'NEED_INFO' ? 'Xét duyệt' : 'Chi tiết'}
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
              <div className="fa-panel-heading">
                <div>
                  <h2>Đề xuất chỉnh sửa gia phả ({data.proposals.length})</h2>
                  <p>Các đề xuất đính chính ngày sinh, tên hoặc quan hệ từ các thành viên trong dòng tộc.</p>
                </div>
              </div>
              {data.proposals.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {data.proposals.map((proposal) => (
                    <article key={proposal.id} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div>
                          <strong>{proposal.summary}</strong>
                          <small style={{ display: 'block', color: '#64748b' }}>Người gửi: {proposal.proposer}</small>
                        </div>
                        <span className={`fa-status ${proposal.status}`}>
                          {proposal.status === 'pending' ? 'Chờ duyệt' : proposal.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
                        </span>
                      </div>
                      {proposal.status === 'pending' && (
                        <div className="fa-actions" style={{ marginTop: '12px' }}>
                          <button
                            type="button"
                            className="fa-primary"
                            onClick={() => run(() => reviewProposal(proposal.id, 'approved', reviewNote[proposal.id] || ''), 'Đã duyệt đề xuất.')}
                          >
                            Chấp thuận
                          </button>
                          <button
                            type="button"
                            onClick={() => run(() => reviewProposal(proposal.id, 'rejected', reviewNote[proposal.id] || ''), 'Đã từ chối đề xuất.')}
                          >
                            Từ chối
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  variant="requests"
                  title="Không có đề xuất chỉnh sửa phả hệ nào"
                  subMessage="Hiện tại không có đề xuất bổ sung nhân khẩu hoặc đính chính thông tin nào từ các thành viên."
                />
              )}
            </div>
          )}

          {/* Modal duyệt hồ sơ xin gia nhập */}
          {selectedJoinReq && (() => {
            const reqNameClean = selectedJoinReq.full_name.trim().toLowerCase();
            const smartMatchedPerson = data.persons.find(
              (p) => p.fullName.trim().toLowerCase() === reqNameClean && !linkedPersonIds.has(p.id)
            );
            const isFemaleGuess = reqNameClean.includes(' thị ') || reqNameClean.includes('thi ') || reqNameClean.endsWith(' thảo');

            return (
              <div className="fa-modal-backdrop" onClick={() => !isSubmittingReview && setSelectedJoinReq(null)}>
                <div className="fa-modal" role="dialog" aria-modal="true" style={{ maxWidth: '680px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
                  <div className="fa-modal-title" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f172a' }}>Xét duyệt hồ sơ xin gia nhập</h2>
                      <span className="fa-status pending" style={{ fontSize: '11px', padding: '2px 8px' }}>Chờ phê duyệt</span>
                    </div>
                    <button type="button" onClick={() => !isSubmittingReview && setSelectedJoinReq(null)} aria-label="Đóng" style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: '20px', color: '#94a3b8' }}>×</button>
                  </div>

                  <div style={{ maxHeight: '72vh', overflowY: 'auto', paddingRight: '4px' }}>
                    {/* Thẻ tóm tắt thông tin người nộp đơn */}
                    <div className="review-modal-applicant-card">
                      <div className="review-modal-applicant-header">
                        <div className="review-applicant-profile">
                          <GenderAvatar
                            gender={isFemaleGuess ? 'female' : 'male'}
                            name={selectedJoinReq.full_name}
                            size={44}
                          />
                          <div>
                            <div className="review-applicant-name">{selectedJoinReq.full_name}</div>
                            <div className="review-applicant-email">
                              Tài khoản: <strong>{selectedJoinReq.user_display_name}</strong> • {selectedJoinReq.user_email || 'Chưa có email'}
                            </div>
                          </div>
                        </div>
                        <div>
                          <span className={`fa-status ${selectedJoinReq.lineage_type === 'PATERNAL' ? 'approved' : 'pending'}`}>
                            {selectedJoinReq.lineage_type === 'PATERNAL' ? 'Bên nội (Họ cha)' : 'Bên ngoại (Họ mẹ)'}
                          </span>
                        </div>
                      </div>

                      <div className="review-claim-box">
                        <div className="review-claim-item">
                          <span className="review-claim-label">Ngày sinh khai báo:</span>
                          <span className="review-claim-value">{selectedJoinReq.birth_date || 'Chưa cung cấp'}</span>
                        </div>
                        <div className="review-claim-item">
                          <span className="review-claim-label">Người thân trong dòng họ:</span>
                          <span className="review-claim-value">
                            {selectedJoinReq.relative_name} ({selectedJoinReq.relative_relation})
                          </span>
                        </div>
                        {selectedJoinReq.verification_notes && (
                          <div className="review-applicant-notes">
                            <strong>Lời nhắn của thành viên:</strong> "{selectedJoinReq.verification_notes}"
                          </div>
                        )}
                      </div>
                    </div>

                    {(selectedJoinReq.status === 'PENDING' || selectedJoinReq.status === 'NEED_INFO') && (
                      <div>
                        {/* 3 Nút Quyết định xử lý */}
                        <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px' }}>
                          Quyết định xử lý của Trưởng tộc:
                        </label>
                        <div className="review-decision-group">
                          <button
                            type="button"
                            className={`review-decision-btn ${reviewActionType === 'APPROVE' ? 'active approve' : ''}`}
                            onClick={() => setReviewActionType('APPROVE')}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Chấp thuận hồ sơ
                          </button>
                          <button
                            type="button"
                            className={`review-decision-btn ${reviewActionType === 'NEED_INFO' ? 'active need-info' : ''}`}
                            onClick={() => setReviewActionType('NEED_INFO')}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            Yêu cầu bổ sung
                          </button>
                          <button
                            type="button"
                            className={`review-decision-btn ${reviewActionType === 'REJECT' ? 'active reject' : ''}`}
                            onClick={() => setReviewActionType('REJECT')}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            Từ chối
                          </button>
                        </div>

                        {reviewActionType === 'APPROVE' && (
                          <div className="review-form-card">
                            {/* Smart Match Banner */}
                            {smartMatchedPerson ? (
                              <div className="review-smart-banner matched">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                <div>
                                  <strong>Phát hiện hồ sơ trùng khớp trên cây:</strong>
                                  <div>
                                    Hồ sơ <strong>"{smartMatchedPerson.fullName}"</strong> (Đời {smartMatchedPerson.generation} • {branchName(smartMatchedPerson.branchId)}) đang chưa có tài khoản. Hệ thống đã chọn sẵn để bạn duyệt liên kết ngay.
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="review-smart-banner new-person">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                  <circle cx="8.5" cy="7" r="4" />
                                  <line x1="20" y1="8" x2="20" y2="14" />
                                  <line x1="23" y1="11" x2="17" y2="11" />
                                </svg>
                                <div>
                                  <strong>Thành viên mới gia nhập dòng họ:</strong>
                                  <div>
                                    Chưa có hồ sơ trùng tên trên cây. Hệ thống đã tự động lấy dữ liệu từ đơn khai báo để tạo hồ sơ mới trên cây và liên kết với tài khoản này.
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Tab Switcher */}
                            <div className="review-tabs-bar">
                              <button
                                type="button"
                                className={`review-tab-pill ${linkPersonMode === 'new' ? 'active' : ''}`}
                                onClick={() => setLinkPersonMode('new')}
                              >
                                Tạo hồ sơ Person mới theo đơn
                              </button>
                              <button
                                type="button"
                                className={`review-tab-pill ${linkPersonMode === 'existing' ? 'active' : ''}`}
                                onClick={() => setLinkPersonMode('existing')}
                              >
                                Chọn hồ sơ Person có sẵn trong cây
                              </button>
                            </div>

                            {linkPersonMode === 'new' ? (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    Họ và tên Person mới:
                                  </label>
                                  <input
                                    type="text"
                                    className="review-input-field"
                                    value={newPersonName}
                                    onChange={(e) => setNewPersonName(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    Giới tính:
                                  </label>
                                  <select
                                    className="review-input-field"
                                    value={newPersonGender}
                                    onChange={(e) => setNewPersonGender(e.target.value as any)}
                                  >
                                    <option value="female">Nữ giới</option>
                                    <option value="male">Nam giới</option>
                                  </select>
                                </div>
                                <div>
                                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    Ngày sinh:
                                  </label>
                                  <input
                                    type="date"
                                    className="review-input-field"
                                    value={newPersonBirthDate}
                                    onChange={(e) => setNewPersonBirthDate(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    Chi / Nhánh:
                                  </label>
                                  <select
                                    className="review-input-field"
                                    value={newPersonBranchId}
                                    onChange={(e) => setNewPersonBranchId(e.target.value)}
                                  >
                                    {data.branches.map((b) => (
                                      <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    Cha / Mẹ trực hệ trên cây phả hệ (để gắn vào đúng cành thế hệ):
                                  </label>
                                  <select
                                    className="review-input-field"
                                    value={selectedParentId}
                                    onChange={(e) => setSelectedParentId(e.target.value)}
                                  >
                                    <option value="">-- Để trống nếu là thế hệ đầu hoặc chưa xác định cha/mẹ --</option>
                                    {data.persons.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.fullName} (Đời {p.generation} • {p.gender === 'female' ? 'Nữ' : 'Nam'} • {branchName(p.branchId)})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ marginBottom: '8px' }}>
                                  <input
                                    type="text"
                                    className="review-input-field"
                                    placeholder="Tìm kiếm theo họ tên Person trong dòng họ..."
                                    value={personSearchText}
                                    onChange={(e) => setPersonSearchText(e.target.value)}
                                  />
                                </div>
                                <select
                                  className="review-input-field"
                                  value={selectedPersonId}
                                  onChange={(e) => setSelectedPersonId(e.target.value)}
                                >
                                  <option value="">-- Chọn một hồ sơ Person để gán cho tài khoản này --</option>
                                  {data.persons
                                    .filter((p) => !personSearchText.trim() || p.fullName.toLowerCase().includes(personSearchText.toLowerCase()))
                                    .map((p) => {
                                      const isLinked = linkedPersonIds.has(p.id);
                                      return (
                                        <option key={p.id} value={p.id} disabled={isLinked}>
                                          {p.fullName} (Đời {p.generation} • {p.gender === 'female' ? 'Nữ' : 'Nam'} • {branchName(p.branchId)}) {isLinked ? ' [ĐÃ LIÊN KẾT VỚI TÀI KHOẢN KHÁC]' : ''}
                                        </option>
                                      );
                                    })}
                                </select>
                                <small style={{ color: '#64748b', display: 'block', marginTop: '6px', fontSize: '12px' }}>
                                  Lưu ý: Chỉ hồ sơ chưa liên kết mới có thể chọn. Các hồ sơ đã có tài khoản (như Tộc trưởng) sẽ bị vô hiệu hóa để bảo đảm tính duy nhất 1-1.
                                </small>
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ marginTop: '14px' }}>
                          <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                            Ghi chú / Phản hồi gửi tới người nộp:
                          </label>
                          <textarea
                            rows={3}
                            className="review-input-field"
                            value={reviewerNote}
                            onChange={(e) => setReviewerNote(e.target.value)}
                            placeholder={reviewActionType === 'APPROVE' ? 'Lời nhắn chúc mừng gia nhập (tùy chọn)...' : 'Lý do yêu cầu bổ sung hoặc từ chối...'}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="fa-modal-actions" style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                    <button type="button" disabled={isSubmittingReview} onClick={() => setSelectedJoinReq(null)}>
                      Đóng
                    </button>
                    {(selectedJoinReq.status === 'PENDING' || selectedJoinReq.status === 'NEED_INFO') && (
                      <button
                        type="button"
                        className="fa-primary"
                        disabled={isSubmittingReview}
                        onClick={handleExecuteReview}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        {isSubmittingReview ? (
                          <>
                            <svg className="fa-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                            </svg>
                            <span>Đang xử lý...</span>
                          </>
                        ) : reviewActionType === 'APPROVE' ? (
                          'Xác nhận Chấp thuận & Liên kết'
                        ) : reviewActionType === 'NEED_INFO' ? (
                          'Gửi yêu cầu bổ sung'
                        ) : (
                          'Xác nhận Từ chối'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          </>
      )}

      {/* ========================================================
          8. PHÂN QUYỀN & TÀI KHOẢN (VIEW: ACCOUNTS)
      ======================================================== */}
      {view === 'accounts' && (
        <>
          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>Phân quyền Quản trị viên dòng họ (Family Admin)</h2>
                <p>Trưởng tộc bổ nhiệm và phân quyền Family Admin từ các thành viên thuộc dòng họ.</p>
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
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {clanUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '16px' }}>
                        {loadingUsers ? (
                          <LoadingState compact message="Đang truy xuất danh sách tài khoản gia tộc..." />
                        ) : (
                          <EmptyState
                            variant="members"
                            compact
                            title="Chưa có tài khoản thành viên nào"
                            subMessage="Các tài khoản đã được liên kết với hồ sơ dòng họ sẽ xuất hiện tại đây."
                          />
                        )}
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
                              <span className="fa-status approved">Trưởng tộc</span>
                            ) : u.is_family_admin ? (
                              <span className="fa-status approved" style={{ background: '#dcfce7', color: '#15803d' }}>
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
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {isOwner ? (
                                <small style={{ color: '#64748b' }}>Chủ sở hữu</small>
                              ) : (
                                <>
                                  {u.is_family_admin ? (
                                    <button
                                      type="button"
                                      style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #f87171' }}
                                      disabled={!isLeader || actionUserId === u.user_id}
                                      onClick={() => setConfirmAction({ type: 'revoke', userId: u.user_id, userName: u.display_name })}
                                    >
                                      {actionUserId === u.user_id ? 'Đang xử lý...' : 'Thu hồi FA'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="fa-primary"
                                      disabled={!isLeader || actionUserId === u.user_id}
                                      onClick={() => setConfirmAction({ type: 'assign', userId: u.user_id, userName: u.display_name })}
                                    >
                                      {actionUserId === u.user_id ? 'Đang xử lý...' : 'Nâng quyền FA'}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    style={{
                                      background: '#fff1f2',
                                      color: '#be123c',
                                      border: '1px solid #fda4af',
                                      padding: '4px 10px',
                                      borderRadius: '6px',
                                      cursor: isLeader ? 'pointer' : 'not-allowed',
                                      fontSize: '13px',
                                      fontWeight: 500,
                                    }}
                                    disabled={!isLeader || actionUserId === u.user_id}
                                    title="Khai trừ thành viên ra khỏi dòng họ"
                                    onClick={() => setConfirmAction({ type: 'expel', userId: u.user_id, userName: u.display_name })}
                                  >
                                    Khai trừ khỏi tộc
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal xác nhận bổ nhiệm / thu hồi / khai trừ */}
          {confirmAction && (
            <div className="fa-modal-backdrop" onClick={() => !actionUserId && setConfirmAction(null)}>
              <div className="fa-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
                <div className="fa-modal-title">
                  <h2>
                    {confirmAction.type === 'assign'
                      ? 'Bổ nhiệm Quản trị viên'
                      : confirmAction.type === 'revoke'
                      ? 'Thu hồi quyền Quản trị viên'
                      : 'Khai trừ thành viên khỏi dòng họ'}
                  </h2>
                  <button type="button" onClick={() => !actionUserId && setConfirmAction(null)}>×</button>
                </div>
                <div style={{ padding: '8px 0' }}>
                  {confirmAction.type === 'assign' && (
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6 }}>
                      Bạn có chắc chắn muốn nâng quyền Quản trị viên dòng họ (Family Admin) cho thành viên <strong>{confirmAction.userName}</strong> không?
                    </p>
                  )}
                  {confirmAction.type === 'revoke' && (
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6 }}>
                      Bạn có chắc chắn muốn thu hồi quyền Family Admin của thành viên <strong>{confirmAction.userName}</strong> không?
                    </p>
                  )}
                  {confirmAction.type === 'expel' && (
                    <div>
                      <p style={{ margin: '0 0 12px 0', fontSize: '14px', lineHeight: 1.6 }}>
                        Bạn có chắc chắn muốn khai trừ tài khoản của thành viên <strong>{confirmAction.userName}</strong> ra khỏi dòng họ không?
                      </p>
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '12px', color: '#991b1b', fontSize: '13px' }}>
                        <strong>Quy tắc hệ thống:</strong>
                        <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px', lineHeight: 1.5 }}>
                          <li>Tài khoản sẽ bị hủy tư cách thành viên và không thể truy cập vào dữ liệu nội bộ dòng họ nữa.</li>
                          <li>Nếu người này đã có hồ sơ trên Cây gia phả, hồ sơ nhân vật và các quan hệ phả hệ vẫn được giữ nguyên vẹn (chỉ hủy liên kết tài khoản).</li>
                          <li>Giải phóng 1 vị trí tham gia dòng họ cho người dùng này.</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
                <div className="fa-modal-actions">
                  <button type="button" disabled={!!actionUserId} onClick={() => setConfirmAction(null)}>Hủy bỏ</button>
                  <button
                    type="button"
                    className="fa-primary"
                    style={confirmAction.type === 'expel' ? { background: '#dc2626', borderColor: '#b91c1c' } : undefined}
                    disabled={!!actionUserId}
                    onClick={handleExecuteConfirmAction}
                  >
                    {actionUserId ? 'Đang xử lý...' : confirmAction.type === 'expel' ? 'Xác nhận khai trừ' : 'Xác nhận'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================
          9. YÊU CẦU LIÊN HỌ (VIEW: LINKS)
      ======================================================== */}
      {view === 'links' && (
        <ClanNetworkManagement clanId={clanId} />
      )}

      {/* ========================================================
          10. NHẬP XUẤT DỮ LIỆU (VIEW: EXCHANGE)
      ======================================================== */}
      {view === 'exchange' && (
        <>
          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>Xuất dữ liệu gia tộc</h2>
                <p>Tải xuống toàn bộ danh sách thành viên dòng họ ra file Excel/CSV chuẩn UTF-8.</p>
              </div>
              <button
                type="button"
                className="fa-primary"
                onClick={handleExportClanMembers}
              >
                Xuất file Excel / CSV
              </button>
            </div>
          </div>

          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>Nhập phả hệ từ file Excel (.xlsx)</h2>
                <p>Nhập hàng loạt thành viên, quan hệ thế hệ và chi nhánh vào cây gia phả với cơ chế kiểm tra tự động.</p>
              </div>
              <div className="fa-actions">
                <button
                  type="button"
                  className="fa-primary"
                  onClick={handleDownloadTemplate}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Tải file Excel mẫu chuẩn (.xlsx)
                </button>
              </div>
            </div>

            {/* Guide Banner: Person - User Separation */}
            <div className="fa-import-guide-banner">
              <div className="fa-import-guide-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="fa-import-guide-content">
                <h4>Quy tắc tách biệt Nhân khẩu (Person) & Tài khoản (User):</h4>
                <p>
                  Dữ liệu nhập từ file Excel chỉ dùng để xây dựng cây phả hệ (Hồ sơ Person, Mối quan hệ, Chi nhánh) và <strong>tuyệt đối KHÔNG tạo tài khoản User đăng nhập</strong>. Mọi người mới trên cây sẽ mang nhãn <em>"Chưa liên kết tài khoản"</em>. Sau này khi con cháu tạo tài khoản thật và xin gia nhập, Trưởng tộc sẽ duyệt và liên kết với hồ sơ trên cây.
                </p>
              </div>
            </div>

            {/* Dropzone Area */}
            {!validationResult && (
              <div className="fa-dropzone" style={{ cursor: 'pointer' }} onClick={() => document.getElementById('fa-excel-file-input')?.click()}>
                <div className="fa-dropzone-icon">
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <div className="fa-dropzone-text" style={{ fontSize: '15px', fontWeight: 600 }}>
                  {isValidating ? 'Đang phân tích và kiểm tra logic phả hệ...' : 'Bấm để chọn hoặc kéo thả tệp Excel (.xlsx) vào đây'}
                </div>
                <div className="fa-dropzone-hint">
                  Hỗ trợ định dạng .xlsx chuẩn 4 sheets: THÀNH VIÊN, QUAN HỆ, CHI NHÁNH, HƯỚNG DẪN (Tối đa 10MB)
                </div>
                <input
                  id="fa-excel-file-input"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelected(f);
                    e.target.value = '';
                  }}
                />
              </div>
            )}

            {/* Template Requirements & Specifications Guide */}
            <ExcelTemplateRequirementsGuide
              onDownloadTemplate={handleDownloadTemplate}
              defaultExpanded={!validationResult}
            />

            {/* Validation & Preview Section */}
            {validationResult && (
              <div style={{ marginTop: '20px' }}>
                {aiAuditReport ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#0369a1' }}>
                        Chế độ xem: AI Thẩm Định Chuyên Sâu (Giai đoạn 6)
                      </span>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setAiAuditReport(null)}
                        style={{ fontSize: '12.5px', padding: '6px 14px' }}
                      >
                        Chuyển sang Bảng xem trước chuẩn
                      </button>
                    </div>
                    <AIExcelAuditView
                      report={aiAuditReport}
                      onConfirmImport={handleExecuteImport}
                      onCancel={() => {
                        setImportFile(null);
                        setValidationResult(null);
                        setAiAuditReport(null);
                      }}
                      isExecuting={isExecutingImport}
                    />
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'linear-gradient(90deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1px solid #a7f3d0', borderRadius: '12px', padding: '14px 20px', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: '#ffffff', padding: '2px 8px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>AI GIAI ĐOẠN 6</span>
                          <strong style={{ fontSize: '14px', color: '#065f46' }}>Đối soát chuyên sâu & Thẩm định gia phả bằng AI</strong>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#047857' }}>
                          Kiểm tra hồ sơ nghi trùng trong file & cơ sở dữ liệu Neon, quét mâu thuẫn thế hệ, gợi ý liên kết phối ngẫu và nhận báo cáo cố vấn từ Gemini AI.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunAIAnalysis}
                        disabled={isAnalyzingAI}
                        style={{
                          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '10px 20px',
                          fontWeight: 700,
                          fontSize: '13.5px',
                          cursor: isAnalyzingAI ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
                        }}
                      >
                        {isAnalyzingAI ? (
                          <>
                            <span className="spinner-small" />
                            AI đang đối soát...
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                            Phân tích dữ liệu bằng AI
                          </>
                        )}
                      </button>
                    </div>
                {/* Stats Grid */}
                <div className="fa-import-stats-grid">
                  <div className="fa-import-stat-card">
                    <span className="fa-import-stat-label">Thành viên đọc được</span>
                    <span className="fa-import-stat-val">{validationResult.summary.total_persons}</span>
                  </div>
                  <div className="fa-import-stat-card">
                    <span className="fa-import-stat-label">Mối quan hệ</span>
                    <span className="fa-import-stat-val">{validationResult.summary.total_relationships}</span>
                  </div>
                  <div className="fa-import-stat-card">
                    <span className="fa-import-stat-label">Chi nhánh</span>
                    <span className="fa-import-stat-val">{validationResult.summary.total_branches}</span>
                  </div>
                  <div className={`fa-import-stat-card ${validationResult.summary.warning_count > 0 ? 'warning' : ''}`}>
                    <span className="fa-import-stat-label">Cảnh báo</span>
                    <span className="fa-import-stat-val">{validationResult.summary.warning_count}</span>
                  </div>
                  <div className={`fa-import-stat-card ${validationResult.summary.fatal_count > 0 ? 'fatal' : 'success'}`}>
                    <span className="fa-import-stat-label">Lỗi chặn dữ liệu</span>
                    <span className="fa-import-stat-val">{validationResult.summary.fatal_count}</span>
                  </div>
                </div>

                {/* Fatal Errors Box */}
                {validationResult.fatal_errors.length > 0 && (
                  <div className="fa-alert-box fatal">
                    <div className="fa-alert-box-header">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      Phát hiện {validationResult.fatal_errors.length} lỗi chặn dữ liệu (Cần chỉnh sửa trong file Excel):
                    </div>
                    <table className="fa-err-table">
                      <thead>
                        <tr>
                          <th style={{ width: '130px' }}>Sheet</th>
                          <th style={{ width: '80px' }}>Dòng</th>
                          <th style={{ width: '150px' }}>Vị trí / Cột</th>
                          <th>Chi tiết lỗi và hướng dẫn khắc phục</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResult.fatal_errors.map((err, idx) => (
                          <tr key={idx}>
                            <td><strong>{err.sheet}</strong></td>
                            <td>{err.row > 0 ? `Dòng ${err.row}` : 'Toàn cục'}</td>
                            <td><span style={{ color: '#dc2626', fontWeight: 600 }}>{err.column || 'Logic'}</span></td>
                            <td>{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Warnings Box */}
                {validationResult.warnings.length > 0 && (
                  <div className="fa-alert-box warning">
                    <div className="fa-alert-box-header">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      Lưu ý & Cảnh báo ({validationResult.warnings.length}):
                    </div>
                    <table className="fa-err-table">
                      <thead>
                        <tr>
                          <th style={{ width: '130px' }}>Sheet</th>
                          <th style={{ width: '80px' }}>Dòng</th>
                          <th style={{ width: '150px' }}>Vị trí</th>
                          <th>Nội dung cảnh báo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResult.warnings.map((w, idx) => (
                          <tr key={idx}>
                            <td><strong>{w.sheet}</strong></td>
                            <td>{w.row > 0 ? `Dòng ${w.row}` : 'Toàn cục'}</td>
                            <td><span style={{ color: '#d97706', fontWeight: 600 }}>{w.column}</span></td>
                            <td>{w.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Interactive Preview Tabs */}
                <div className="fa-preview-tabs-container">
                  <div className="fa-preview-tabs-header">
                    <button
                      type="button"
                      className={`fa-preview-tab-pill ${activePreviewTab === 'persons' ? 'active' : ''}`}
                      onClick={() => setActivePreviewTab('persons')}
                    >
                      Thành viên
                      <span className="fa-preview-badge">{validationResult.preview.persons.length}</span>
                    </button>
                    <button
                      type="button"
                      className={`fa-preview-tab-pill ${activePreviewTab === 'relations' ? 'active' : ''}`}
                      onClick={() => setActivePreviewTab('relations')}
                    >
                      Mối quan hệ
                      <span className="fa-preview-badge">{validationResult.preview.relationships.length}</span>
                    </button>
                    <button
                      type="button"
                      className={`fa-preview-tab-pill ${activePreviewTab === 'branches' ? 'active' : ''}`}
                      onClick={() => setActivePreviewTab('branches')}
                    >
                      Chi nhánh
                      <span className="fa-preview-badge">{validationResult.preview.branches.length}</span>
                    </button>
                  </div>

                  <div className="fa-preview-content-body">
                    {activePreviewTab === 'persons' && (
                      <div className="fa-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Mã</th>
                              <th>Họ và tên</th>
                              <th>Giới tính</th>
                              <th>Đời thứ</th>
                              <th>Tình trạng</th>
                              <th>Ngày sinh</th>
                              <th>Ngày mất</th>
                              <th>Chi nhánh</th>
                              <th>Quê quán</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validationResult.preview.persons.map((p, idx) => (
                              <tr key={idx}>
                                <td><code style={{ fontWeight: 700, color: '#0284c7' }}>{p.code}</code></td>
                                <td><strong>{p.fullName}</strong></td>
                                <td>{p.gender === 'MALE' ? 'Nam' : 'Nữ'}</td>
                                <td><span style={{ padding: '2px 8px', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>Đời {p.generation}</span></td>
                                <td>
                                  <span style={{ color: p.isLiving ? '#166534' : '#64748b', fontWeight: 600 }}>
                                    {p.isLiving ? 'Còn sống' : 'Đã mất'}
                                  </span>
                                </td>
                                <td>{p.birthDate || '—'}</td>
                                <td>{p.deathDate || '—'}</td>
                                <td>{p.branchCode || '—'}</td>
                                <td>{p.originPlace || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activePreviewTab === 'relations' && (
                      <div className="fa-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Người thứ nhất</th>
                              <th>Người thứ hai</th>
                              <th>Loại quan hệ</th>
                              <th>Thứ tự con</th>
                              <th>Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validationResult.preview.relationships.length === 0 ? (
                              <tr>
                                <td colSpan={5} style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                                  Không có mối quan hệ nào được định nghĩa trong sheet QUAN HỆ
                                </td>
                              </tr>
                            ) : (
                              validationResult.preview.relationships.map((r, idx) => (
                                <tr key={idx}>
                                  <td><code style={{ fontWeight: 700, color: '#0284c7' }}>{r.person1}</code></td>
                                  <td><code style={{ fontWeight: 700, color: '#059669' }}>{r.person2}</code></td>
                                  <td>
                                    <span style={{ fontWeight: 700, color: r.relationshipType === 'PARENT_CHILD' ? '#2563eb' : '#d97706' }}>
                                      {r.relationshipType === 'PARENT_CHILD' ? 'Cha/Mẹ → Con' : 'Vợ ↔ Chồng'}
                                    </span>
                                  </td>
                                  <td>{r.childOrder ? `Con thứ ${r.childOrder}` : '—'}</td>
                                  <td>{r.notes || '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activePreviewTab === 'branches' && (
                      <div className="fa-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Mã Chi</th>
                              <th>Tên Chi/Nhánh</th>
                              <th>Trực thuộc</th>
                              <th>Thứ tự</th>
                              <th>Mô tả</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validationResult.preview.branches.length === 0 ? (
                              <tr>
                                <td colSpan={5} style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                                  Không có chi nhánh mới nào trong sheet CHI NHÁNH
                                </td>
                              </tr>
                            ) : (
                              validationResult.preview.branches.map((b, idx) => (
                                <tr key={idx}>
                                  <td><code style={{ fontWeight: 700, color: '#d97706' }}>{b.code}</code></td>
                                  <td><strong>{b.name}</strong></td>
                                  <td>{b.parent_code || 'Gốc'}</td>
                                  <td>{b.order}</td>
                                  <td>{b.description || '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="fa-import-actions-bar">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setImportFile(null);
                      setValidationResult(null);
                    }}
                    disabled={isExecutingImport}
                  >
                    Hủy / Chọn file khác
                  </button>

                  <button
                    type="button"
                    className="fa-primary"
                    disabled={!validationResult.is_valid || isExecutingImport}
                    onClick={handleExecuteImport}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: !validationResult.is_valid ? 0.5 : 1,
                      cursor: !validationResult.is_valid ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isExecutingImport ? (
                      <>
                        <span className="spinner-small" />
                        Đang lưu vào Neon DB...
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Xác nhận nhập vào cơ sở dữ liệu
                      </>
                    )}
                  </button>
                </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================
          11. NHẬT KÝ HOẠT ĐỘNG (VIEW: AUDIT)
      ======================================================== */}
      {view === 'locations' && (
        <ClanLocationsModule clanId={clanId} canManage={true} />
      )}



      {view === 'audit' && (
        <>
          <div className="fa-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div className="fa-stat-card">
              <span>Tổng số hoạt động</span>
              <strong style={{ color: '#2563eb' }}>{clanAuditLogs.length}</strong>
              <small>Ghi nhận từ cơ sở dữ liệu hệ thống</small>
            </div>
            <div className="fa-stat-card">
              <span>Thao tác phả hệ</span>
              <strong style={{ color: '#7c3aed' }}>
                {clanAuditLogs.filter((l) => ['MEMBER', 'RELATION', 'BRANCH'].includes(l.actionType)).length}
              </strong>
              <small>Thêm/Sửa thành viên, quan hệ, chi nhánh</small>
            </div>
            <div className="fa-stat-card">
              <span>Xét duyệt & Quyền hạn</span>
              <strong style={{ color: '#059669' }}>
                {clanAuditLogs.filter((l) => ['APPROVAL', 'PERMISSION', 'LINK'].includes(l.actionType)).length}
              </strong>
              <small>Duyệt hồ sơ, phân quyền, liên họ</small>
            </div>
          </div>

          <div className="fa-panel">
            <div className="fa-panel-heading">
              <div>
                <h2>Lịch sử hoạt động & Nhật ký kiểm toán</h2>
                <p>Theo dõi minh bạch mọi thay đổi dữ liệu trong dòng họ theo thời gian thực.</p>
              </div>
              <button type="button" onClick={loadClanAuditLogs} disabled={loadingAuditLogs}>
                {loadingAuditLogs ? 'Đang tải...' : 'Làm mới'}
              </button>
            </div>

            {/* Filter Pills */}
            <div className="fa-filter-pills">
              <button
                type="button"
                className={`fa-filter-pill ${auditCategoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setAuditCategoryFilter('all')}
              >
                Tất cả ({clanAuditLogs.length})
              </button>
              <button
                type="button"
                className={`fa-filter-pill ${auditCategoryFilter === 'MEMBER' ? 'active' : ''}`}
                onClick={() => setAuditCategoryFilter('MEMBER')}
              >
                Thành viên ({clanAuditLogs.filter((l) => l.actionType === 'MEMBER').length})
              </button>
              <button
                type="button"
                className={`fa-filter-pill ${auditCategoryFilter === 'RELATION' ? 'active' : ''}`}
                onClick={() => setAuditCategoryFilter('RELATION')}
              >
                Quan hệ ({clanAuditLogs.filter((l) => l.actionType === 'RELATION').length})
              </button>
              <button
                type="button"
                className={`fa-filter-pill ${auditCategoryFilter === 'BRANCH' ? 'active' : ''}`}
                onClick={() => setAuditCategoryFilter('BRANCH')}
              >
                Chi/Nhánh ({clanAuditLogs.filter((l) => l.actionType === 'BRANCH').length})
              </button>
              <button
                type="button"
                className={`fa-filter-pill ${auditCategoryFilter === 'APPROVAL' ? 'active' : ''}`}
                onClick={() => setAuditCategoryFilter('APPROVAL')}
              >
                Xét duyệt ({clanAuditLogs.filter((l) => l.actionType === 'APPROVAL').length})
              </button>
              <button
                type="button"
                className={`fa-filter-pill ${auditCategoryFilter === 'PERMISSION' ? 'active' : ''}`}
                onClick={() => setAuditCategoryFilter('PERMISSION')}
              >
                Phân quyền ({clanAuditLogs.filter((l) => l.actionType === 'PERMISSION').length})
              </button>
              <button
                type="button"
                className={`fa-filter-pill ${auditCategoryFilter === 'LINK' ? 'active' : ''}`}
                onClick={() => setAuditCategoryFilter('LINK')}
              >
                Liên họ ({clanAuditLogs.filter((l) => l.actionType === 'LINK').length})
              </button>
              <button
                type="button"
                className={`fa-filter-pill ${auditCategoryFilter === 'EXPORT' ? 'active' : ''}`}
                onClick={() => setAuditCategoryFilter('EXPORT')}
              >
                Xuất tệp ({clanAuditLogs.filter((l) => l.actionType === 'EXPORT').length})
              </button>
            </div>

            {/* Search toolbar */}
            <div className="fa-toolbar" style={{ marginBottom: '24px' }}>
              <input
                type="search"
                value={auditSearchTerm}
                onChange={(e) => setAuditSearchTerm(e.target.value)}
                placeholder="Tìm theo nội dung thao tác, tên người thực hiện, thành viên..."
                aria-label="Tìm kiếm nhật ký"
              />
              <span>
                Hiển thị{' '}
                {
                  clanAuditLogs.filter((l) => {
                    const matchCat = auditCategoryFilter === 'all' || l.actionType === auditCategoryFilter;
                    const matchSearch =
                      !auditSearchTerm.trim() ||
                      [l.action, l.details, l.actorName].join(' ').toLowerCase().includes(auditSearchTerm.trim().toLowerCase());
                    return matchCat && matchSearch;
                  }).length
                }{' '}
                hoạt động
              </span>
            </div>

            {/* Timeline */}
            <div className="fa-timeline">
              {clanAuditLogs.filter((l) => {
                const matchCat = auditCategoryFilter === 'all' || l.actionType === auditCategoryFilter;
                const matchSearch =
                  !auditSearchTerm.trim() ||
                  [l.action, l.details, l.actorName].join(' ').toLowerCase().includes(auditSearchTerm.trim().toLowerCase());
                return matchCat && matchSearch;
              }).length === 0 ? (
                loadingAuditLogs ? (
                  <LoadingState
                    message="Đang truy xuất nhật ký phả hệ dòng tộc..."
                    subMessage="Hệ thống đang tải lịch sử các thao tác quản trị từ cơ sở dữ liệu."
                  />
                ) : (
                  <EmptyState
                    variant="history"
                    title="Không tìm thấy nhật ký hoạt động phù hợp"
                    subMessage="Hãy thử thay đổi danh mục hoạt động hoặc xóa từ khóa tìm kiếm để xem tất cả lịch sử."
                  />
                )
              ) : (
                clanAuditLogs
                  .filter((l) => {
                    const matchCat = auditCategoryFilter === 'all' || l.actionType === auditCategoryFilter;
                    const matchSearch =
                      !auditSearchTerm.trim() ||
                      [l.action, l.details, l.actorName].join(' ').toLowerCase().includes(auditSearchTerm.trim().toLowerCase());
                    return matchCat && matchSearch;
                  })
                  .map((log) => {
                    const typeKey = (log.actionType || 'member').toLowerCase();
                    const formattedDate = new Date(log.occurredAt).toLocaleString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    });
                    return (
                      <div key={log.id} className="fa-timeline-item">
                        <div
                          className="fa-timeline-node"
                          style={{
                            background:
                              log.actionType === 'RELATION'
                                ? '#7c3aed'
                                : log.actionType === 'APPROVAL'
                                ? '#059669'
                                : log.actionType === 'PERMISSION'
                                ? '#d97706'
                                : log.actionType === 'BRANCH'
                                ? '#ea580c'
                                : log.actionType === 'LINK'
                                ? '#0284c7'
                                : log.actionType === 'EXPORT'
                                ? '#64748b'
                                : '#2563eb',
                          }}
                        />
                        <div className="fa-audit-card">
                          <div className="fa-audit-header">
                            <span className={`fa-audit-type-badge ${typeKey}`}>
                              {log.actionType === 'MEMBER'
                                ? 'Thành viên'
                                : log.actionType === 'RELATION'
                                ? 'Quan hệ'
                                : log.actionType === 'BRANCH'
                                ? 'Chi/Nhánh'
                                : log.actionType === 'APPROVAL'
                                ? 'Xét duyệt'
                                : log.actionType === 'PERMISSION'
                                ? 'Phân quyền'
                                : log.actionType === 'LINK'
                                ? 'Liên họ'
                                : 'Xuất dữ liệu'}
                            </span>
                            <span className="fa-timeline-time">{formattedDate}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <strong style={{ fontSize: '15px', color: '#0f172a' }}>{log.action}</strong>
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>•</span>
                            <span className="fa-audit-actor">{log.actorName}</span>
                          </div>
                          <div className="fa-audit-details">{log.details}</div>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default FamilyAdminModule;
