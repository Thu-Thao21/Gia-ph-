import React, { useEffect, useMemo, useState } from 'react';
import {
  ConfirmDialog,
  FeatureEmptyState,
  FeatureIcon,
  FeatureModal,
  FeaturePagination,
  FeatureToast,
} from '../common/FeatureUI/FeatureUI';
import { useAuth } from '../../context/AuthContext';
import { useClanContext } from '../../context/ClanContext';
import {
  type BankAccountInfo,
  type DonationItem,
  type DonationStatus,
  type FundItem,
  type FundSummary,
  cancelDonation,
  createClanFund,
  createDonation,
  createDonationWithEvidence,
  deleteClanFund,
  fetchClanBankAccount,
  fetchClanDonations,
  fetchClanFunds,
  fetchFundsSummary,
  fetchMyDonations,
  rejectDonation,
  submitDonationVerification,
  updateClanBankAccount,
  updateClanFund,
  uploadClanBankQr,
  uploadDonationEvidence,
  verifyDonation,
} from '../../services/fund.service';
import './ClanFundsModule.css';

const PAGE_SIZE = 8;
const formatVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

// Trạng thái bên lịch sử đóng góp chỉ có: Đã xác nhận, Đang chờ duyệt, Từ chối
const statusLabels: Record<DonationStatus, string> = {
  AWAITING_VERIFICATION: 'Đang chờ duyệt',
  SUCCESS: 'Đã xác nhận',
  REJECTED: 'Từ chối',
  PENDING: 'Đang chờ duyệt',
  CANCELLED: 'Từ chối',
};

interface DonationDraft {
  fundId: string;
  fundName: string;
  amount: number;
  donorName: string;
  donationCode: string;
  note: string;
}

const generateDraftDonationCode = (fundName: string): string => {
  const clean = fundName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  let prefix = parts.map((p) => p[0].toUpperCase()).join('').slice(0, 5);
  if (!prefix.startsWith('Q')) prefix = 'Q' + prefix;
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-2026-${rand}`;
};

const resolveMediaUrl = (path?: string | null): string => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return baseUrl ? `${baseUrl}${cleanPath}` : cleanPath;
};

export interface ClanFundsModuleProps {
  canManage?: boolean;
  clanId?: string;
  isClanLeader?: boolean;
  isFamilyAdmin?: boolean;
}

export const ClanFundsModule: React.FC<ClanFundsModuleProps> = ({
  canManage = false,
  clanId: propClanId,
  isClanLeader = false,
  isFamilyAdmin = false,
}) => {
  const { account } = useAuth();
  const { activeClanId, activeClanName, activeClanRole } = useClanContext();

  // Xác định dòng họ và quyền hạn
  const effectiveClanId = propClanId || activeClanId || account?.clan_id || '';
  const clanName = activeClanName || account?.clan_name || 'Dòng họ';
  const isLeader = isClanLeader || activeClanRole === 'clan_admin' || account?.primary_role === 'admin';
  const hasManageRights = canManage || isLeader || isFamilyAdmin || activeClanRole === 'family_admin';

  // State dữ liệu thực tế từ PostgreSQL
  const [funds, setFunds] = useState<FundItem[]>([]);
  const [bankAccount, setBankAccount] = useState<BankAccountInfo | null>(null);
  const [donations, setDonations] = useState<DonationItem[]>([]);
  const [summary, setSummary] = useState<FundSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'error' | 'info' } | null>(null);

  // Tab điều hướng
  type TabType = 'ledger' | 'pending' | 'funds' | 'bank' | 'donate' | 'history';
  const [currentTab, setCurrentTab] = useState<TabType>(hasManageRights ? 'ledger' : 'funds');

  // Bộ lọc sổ cái
  const [search, setSearch] = useState('');
  const [fundFilter, setFundFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Modal & Form States
  const [selectedDonation, setSelectedDonation] = useState<DonationItem | null>(null);
  const [previewEvidenceUrl, setPreviewEvidenceUrl] = useState<string | null>(null);

  // Modal Tạo/Sửa Quỹ
  const [editingFund, setEditingFund] = useState<Partial<FundItem> | 'new' | null>(null);
  const [fundFormData, setFundFormData] = useState({
    name: '',
    purpose: '',
    description: '',
    target_amount: '',
    status: 'ACTIVE',
    visibility: 'PUBLIC',
  });

  // Form Cấu hình Tài khoản Ngân hàng
  const [bankFormData, setBankFormData] = useState({
    bank_name: '',
    account_holder: '',
    account_number: '',
    transfer_instruction: '',
    is_active: true,
  });
  const [bankQrFile, setBankQrFile] = useState<File | null>(null);
  const [bankQrPreview, setBankQrPreview] = useState<string | null>(null);
  const [savingBank, setSavingBank] = useState(false);

  // Quy trình đóng góp của Thành viên
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [donateAmount, setDonateAmount] = useState<number | ''>('');
  const [donorName, setDonorName] = useState(account?.display_name || '');
  const [donateNote, setDonateNote] = useState('');
  const [donationDraft, setDonationDraft] = useState<DonationDraft | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [bankRefCode, setBankRefCode] = useState('');
  const [submittingDonation, setSubmittingDonation] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modal duyệt / từ chối của Tộc trưởng
  const [verifyingTarget, setVerifyingTarget] = useState<DonationItem | null>(null);
  const [rejectingTarget, setRejectingTarget] = useState<DonationItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  // Xóa quỹ dòng họ
  const [deletingFund, setDeletingFund] = useState<FundItem | null>(null);
  const [isDeletingFund, setIsDeletingFund] = useState(false);

  // Tải dữ liệu từ Backend
  const reloadAllData = async () => {
    if (!effectiveClanId) return;
    setLoading(true);
    try {
      const [fundsData, bankData, sumData] = await Promise.all([
        fetchClanFunds(effectiveClanId).catch(() => []),
        fetchClanBankAccount(effectiveClanId).catch(() => null),
        fetchFundsSummary(effectiveClanId).catch(() => null),
      ]);

      setFunds(fundsData);
      setBankAccount(bankData);
      setSummary(sumData);

      if (bankData) {
        setBankFormData({
          bank_name: bankData.bank_name || '',
          account_holder: bankData.account_holder || '',
          account_number: bankData.account_number || '',
          transfer_instruction: bankData.transfer_instruction || '',
          is_active: bankData.is_active,
        });
        setBankQrPreview(bankData.qr_image_path || null);
      }

      if (hasManageRights) {
        const clanDonations = await fetchClanDonations(effectiveClanId).catch(() => []);
        setDonations(clanDonations);
      } else {
        const myDonations = await fetchMyDonations(effectiveClanId).catch(() => []);
        setDonations(myDonations);
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu quỹ:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadAllData();
  }, [effectiveClanId, hasManageRights]);

  // Bộ lọc giao dịch
  const filteredDonations = useMemo(() => {
    return donations.filter((item) => {
      // Ẩn các đơn nháp PENDING chưa nộp minh chứng khỏi Sổ cái chung
      if (statusFilter !== 'PENDING' && item.status === 'PENDING') return false;
      const text = `${item.donation_code} ${item.donor_name} ${item.fund_name || ''} ${item.note || ''}`.toLowerCase();
      const matchSearch = !search || text.includes(search.trim().toLowerCase());
      const matchFund = fundFilter === 'all' || item.fund_id === fundFilter;
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchSearch && matchFund && matchStatus;
    });
  }, [donations, search, fundFilter, statusFilter]);

  // Tab Chờ xác nhận: CHỈ hiển thị các giao dịch đã nộp ảnh minh chứng (AWAITING_VERIFICATION)
  const pendingDonations = useMemo(() => {
    return donations.filter((item) => item.status === 'AWAITING_VERIFICATION');
  }, [donations]);

  const totalPages = Math.max(1, Math.ceil(filteredDonations.length / PAGE_SIZE));
  const visibleDonations = filteredDonations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Xử lý sao chép vào Clipboard
  const handleCopy = (textToCopy: string, fieldName: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // =========================================================================
  // HÀNH ĐỘNG QUẢN LÝ QUỸ (TỘC TRƯỞNG & FAMILY ADMIN)
  // =========================================================================

  const handleOpenFundModal = (fund?: FundItem) => {
    if (fund) {
      setEditingFund(fund);
      setFundFormData({
        name: fund.name,
        purpose: fund.purpose || '',
        description: fund.description || '',
        target_amount: fund.target_amount ? String(fund.target_amount) : '',
        status: fund.status === 'ACTIVE' ? 'ACTIVE' : 'CLOSED',
        visibility: fund.visibility,
      });
    } else {
      setEditingFund('new');
      setFundFormData({
        name: '',
        purpose: '',
        description: '',
        target_amount: '',
        status: 'ACTIVE',
        visibility: 'PUBLIC',
      });
    }
  };

  const handleSaveFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundFormData.name.trim() || !fundFormData.purpose.trim()) {
      setToast({ message: 'Vui lòng nhập tên quỹ và mục đích thành lập.', tone: 'error' });
      return;
    }

    try {
      if (editingFund === 'new') {
        await createClanFund(effectiveClanId, {
          name: fundFormData.name.trim(),
          purpose: fundFormData.purpose.trim(),
          description: fundFormData.description.trim() || undefined,
          target_amount: fundFormData.target_amount ? Number(fundFormData.target_amount) : undefined,
          status: fundFormData.status,
          visibility: fundFormData.visibility,
        });
        setToast({ message: 'Đã tạo quỹ dòng họ mới thành công!', tone: 'success' });
      } else if (editingFund && typeof editingFund === 'object') {
        await updateClanFund(effectiveClanId, editingFund.id!, {
          name: fundFormData.name.trim(),
          purpose: fundFormData.purpose.trim(),
          description: fundFormData.description.trim() || undefined,
          target_amount: fundFormData.target_amount ? Number(fundFormData.target_amount) : undefined,
          status: fundFormData.status as any,
          visibility: fundFormData.visibility as any,
        });
        setToast({ message: 'Đã cập nhật thông tin quỹ thành công!', tone: 'success' });
      }
      setEditingFund(null);
      await reloadAllData();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.detail || 'Lỗi khi lưu quỹ.', tone: 'error' });
    }
  };

  const handleConfirmDeleteFund = async () => {
    if (!deletingFund || !effectiveClanId) return;
    setIsDeletingFund(true);
    try {
      await deleteClanFund(effectiveClanId, deletingFund.id);
      setToast({ message: `Đã xóa quỹ "${deletingFund.name}" thành công!`, tone: 'success' });
      setDeletingFund(null);
      await reloadAllData();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.detail || 'Không thể xóa quỹ này.', tone: 'error' });
    } finally {
      setIsDeletingFund(false);
    }
  };

  // Cập nhật cấu hình Tài khoản ngân hàng & QR
  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankFormData.bank_name.trim() || !bankFormData.account_holder.trim() || !bankFormData.account_number.trim()) {
      setToast({ message: 'Vui lòng điền đầy đủ tên ngân hàng, chủ tài khoản và số tài khoản.', tone: 'error' });
      return;
    }

    setSavingBank(true);
    try {
      let qrPath = bankAccount?.qr_image_path;
      if (bankQrFile) {
        const uploadRes = await uploadClanBankQr(effectiveClanId, bankQrFile);
        qrPath = uploadRes.qr_image_path;
      }

      await updateClanBankAccount(effectiveClanId, {
        bank_name: bankFormData.bank_name.trim(),
        account_holder: bankFormData.account_holder.trim().toUpperCase(),
        account_number: bankFormData.account_number.trim(),
        qr_image_path: qrPath,
        transfer_instruction: bankFormData.transfer_instruction.trim() || undefined,
        is_active: bankFormData.is_active,
      });

      setToast({ message: 'Đã lưu cấu hình tài khoản nhận đóng góp thành công!', tone: 'success' });
      await reloadAllData();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.detail || 'Lỗi lưu tài khoản ngân hàng.', tone: 'error' });
    } finally {
      setSavingBank(false);
    }
  };

  // =========================================================================
  // QUY TRÌNH ĐỐI SOÁT & XÁC NHẬN (ĐỘC QUYỀN TỘC TRƯỞNG)
  // =========================================================================

  const handleConfirmVerification = async () => {
    if (!verifyingTarget) return;
    if (!isLeader) {
      setToast({ message: 'Chỉ Tộc trưởng mới có thẩm quyền xác nhận đã nhận tiền.', tone: 'error' });
      return;
    }

    setProcessingAction(true);
    try {
      await verifyDonation(effectiveClanId, verifyingTarget.id);
      setToast({
        message: `Đã xác nhận khoản đóng góp ${verifyingTarget.donation_code} (${formatVnd(verifyingTarget.amount)}) vào quỹ dòng họ!`,
        tone: 'success',
      });
      setVerifyingTarget(null);
      setSelectedDonation(null);
      await reloadAllData();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.detail || 'Lỗi khi xác nhận giao dịch.', tone: 'error' });
    } finally {
      setProcessingAction(false);
    }
  };

  const handleConfirmRejection = async () => {
    if (!rejectingTarget) return;
    if (!isLeader) {
      setToast({ message: 'Chỉ Tộc trưởng mới có quyền từ chối giao dịch.', tone: 'error' });
      return;
    }
    if (!rejectReason.trim()) {
      setToast({ message: 'Vui lòng nhập lý do từ chối giao dịch.', tone: 'error' });
      return;
    }

    setProcessingAction(true);
    try {
      await rejectDonation(effectiveClanId, rejectingTarget.id, rejectReason.trim());
      setToast({ message: `Đã từ chối giao dịch ${rejectingTarget.donation_code}.`, tone: 'info' });
      setRejectingTarget(null);
      setRejectReason('');
      setSelectedDonation(null);
      await reloadAllData();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.detail || 'Lỗi từ chối giao dịch.', tone: 'error' });
    } finally {
      setProcessingAction(false);
    }
  };

  // Thành viên hủy đơn PENDING
  const handleCancelMyDonation = async (donation: DonationItem) => {
    try {
      await cancelDonation(effectiveClanId, donation.id, 'Người gửi đã hủy yêu cầu');
      setToast({ message: 'Đã hủy yêu cầu đóng góp.', tone: 'info' });
      setSelectedDonation(null);
      await reloadAllData();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.detail || 'Lỗi khi hủy yêu cầu.', tone: 'error' });
    }
  };

  // =========================================================================
  // QUY TRÌNH ĐÓNG GÓP CỦA THÀNH VIÊN (CHỈ TẠO ĐƠN KHI ĐÃ CÓ ẢNH MINH CHỨNG)
  // =========================================================================

  const handleStartDonation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFundId) {
      setToast({ message: 'Vui lòng chọn quỹ dòng họ muốn đóng góp.', tone: 'error' });
      return;
    }
    const targetFund = funds.find((f) => f.id === selectedFundId);
    if (!targetFund || targetFund.status !== 'ACTIVE') {
      setToast({ message: 'Quỹ này hiện đã ngưng nhận quỹ. Vui lòng chọn quỹ khác đang hoạt động.', tone: 'error' });
      return;
    }
    if (!donateAmount || Number(donateAmount) <= 0) {
      setToast({ message: 'Số tiền đóng góp phải lớn hơn 0 VNĐ.', tone: 'error' });
      return;
    }
    if (!bankAccount || !bankAccount.account_number) {
      setToast({
        message: 'Dòng họ chưa cấu hình tài khoản nhận đóng góp. Vui lòng liên hệ Tộc trưởng.',
        tone: 'error',
      });
      return;
    }

    // TẠO CLIENT DRAFT - TUYỆT ĐỐI KHÔNG GỌI API / KHÔNG TẠO BẢN GHI VÀO DB
    const code = generateDraftDonationCode(targetFund.name);
    setDonationDraft({
      fundId: selectedFundId,
      fundName: targetFund.name,
      amount: Number(donateAmount),
      donorName: donorName.trim() || account?.display_name || 'Thành viên dòng họ',
      donationCode: code,
      note: donateNote.trim(),
    });
    setEvidenceFile(null);
    setEvidencePreview(null);
    setBankRefCode('');
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!donationDraft) return;
    if (!evidenceFile) {
      setToast({ message: 'Vui lòng đính kèm ảnh chụp màn hình biên lai chuyển khoản thành công.', tone: 'error' });
      return;
    }

    setSubmittingDonation(true);
    try {
      const formData = new FormData();
      formData.append('fund_id', donationDraft.fundId);
      formData.append('amount', String(donationDraft.amount));
      if (donationDraft.donorName) formData.append('donor_name', donationDraft.donorName);
      if (donationDraft.donationCode) formData.append('donation_code', donationDraft.donationCode);
      if (donationDraft.note) formData.append('note', donationDraft.note);
      if (bankRefCode.trim()) formData.append('bank_transaction_reference', bankRefCode.trim());
      formData.append('file', evidenceFile);

      await createDonationWithEvidence(effectiveClanId, formData);

      setToast({
        message: 'Minh chứng đóng góp đã được gửi thành công! Vui lòng chờ Tộc trưởng đối soát và xác nhận.',
        tone: 'success',
      });
      setDonationDraft(null);
      setEvidenceFile(null);
      setEvidencePreview(null);
      setBankRefCode('');
      setDonateAmount('');
      setDonateNote('');
      await reloadAllData();
      setCurrentTab(hasManageRights ? 'pending' : 'history');
    } catch (err: any) {
      setToast({ message: err?.response?.data?.detail || 'Lỗi gửi minh chứng đóng góp.', tone: 'error' });
    } finally {
      setSubmittingDonation(false);
    }
  };

  return (
    <section className="family-fund-page" aria-labelledby="fund-title">
      {/* Header Banner */}
      <header className="fund-hero">
        <div>
          <span className="fund-badge">QUẢN LÝ QUỸ & TÀI CHÍNH DÒNG TỘC</span>
          <h1 id="fund-title">Quỹ Dòng Họ {clanName}</h1>
          <p>
            {hasManageRights
              ? 'Hệ thống quản lý quỹ, đối soát chuyển khoản ngân hàng và sổ cái tài chính gia tộc.'
              : 'Chung tay đóng góp, vun đắp các quỹ khuyến học, xây dựng từ đường và nghĩa tình gia tộc.'}
          </p>
        </div>
        {hasManageRights && (
          <button type="button" className="fund-primary" onClick={() => handleOpenFundModal()}>
            <FeatureIcon name="plus" size={16} /> Tạo quỹ mới
          </button>
        )}
      </header>

      {/* 4 Thẻ KPI Tài Chính (Neon DB) */}
      <div className="fund-kpis">
        <article>
          <span>Tổng số quỹ hoạt động</span>
          <strong>{summary?.total_funds_count || funds.filter((f) => f.status === 'ACTIVE').length} Quỹ</strong>
          <small>Đang mở tiếp nhận đóng góp</small>
        </article>
        <article className="income">
          <span>Tổng tiền đã xác nhận</span>
          <strong>{formatVnd(summary?.total_collected_amount || 0)}</strong>
          <small>{summary?.confirmed_donations_count || 0} khoản đóng góp đã ghi nhận</small>
        </article>
        <article>
          <span>Tổng mục tiêu các quỹ</span>
          <strong>{formatVnd(summary?.total_target_amount || 0)}</strong>
          <small>Chỉ tiêu xây dựng & phát triển</small>
        </article>
        <article style={{ borderColor: (summary?.awaiting_verification_count || 0) > 0 ? '#f59e0b' : '#e2e8f0' }}>
          <span>Chờ xác nhận</span>
          <strong style={{ color: (summary?.awaiting_verification_count || 0) > 0 ? '#b45309' : '#0f172a' }}>
            {summary?.awaiting_verification_count || 0} khoản
          </strong>
          <small>Thành viên đã gửi ảnh minh chứng</small>
        </article>
      </div>

      {/* Thanh Menu Tabs */}
      <nav className="fund-tabs-nav" aria-label="Menu chức năng quỹ">
        {hasManageRights ? (
          <>
            <button
              type="button"
              className={`fund-tab-item ${currentTab === 'ledger' ? 'active' : ''}`}
              onClick={() => setCurrentTab('ledger')}
            >
              Sổ cái & Giao dịch
            </button>
            <button
              type="button"
              className={`fund-tab-item ${currentTab === 'pending' ? 'active' : ''}`}
              onClick={() => setCurrentTab('pending')}
            >
              Chờ xác nhận
              {(summary?.awaiting_verification_count || 0) > 0 && (
                <span className="fund-tab-badge">{summary?.awaiting_verification_count}</span>
              )}
            </button>
            <button
              type="button"
              className={`fund-tab-item ${currentTab === 'funds' ? 'active' : ''}`}
              onClick={() => setCurrentTab('funds')}
            >
              Quản lý các quỹ
            </button>
            <button
              type="button"
              className={`fund-tab-item ${currentTab === 'bank' ? 'active' : ''}`}
              onClick={() => setCurrentTab('bank')}
            >
              Cấu hình tài khoản & QR
            </button>
            <button
              type="button"
              className={`fund-tab-item ${currentTab === 'donate' ? 'active' : ''}`}
              onClick={() => setCurrentTab('donate')}
            >
              Đóng góp quỹ
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`fund-tab-item ${currentTab === 'funds' ? 'active' : ''}`}
              onClick={() => setCurrentTab('funds')}
            >
              Các quỹ dòng họ
            </button>
            <button
              type="button"
              className={`fund-tab-item ${currentTab === 'donate' ? 'active' : ''}`}
              onClick={() => setCurrentTab('donate')}
            >
              Chuyển khoản & Đóng góp
            </button>
            <button
              type="button"
              className={`fund-tab-item ${currentTab === 'history' ? 'active' : ''}`}
              onClick={() => setCurrentTab('history')}
            >
              Lịch sử đóng góp của tôi
            </button>
          </>
        )}
      </nav>

      {/* =====================================================================
          TAB 1: SỔ CÁI & TOÀN BỘ GIAO DỊCH (ADMIN / TỘC TRƯỞNG)
          ===================================================================== */}
      {currentTab === 'ledger' && hasManageRights && (
        <div className="fund-table-card">
          <div className="fund-table-heading">
            <div>
              <h2>Sổ cái giao dịch dòng tộc</h2>
              <span>Danh sách các khoản đóng góp đã ghi nhận vào quỹ từ Neon DB</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFundFilter('all');
                setStatusFilter('all');
                setPage(1);
              }}
            >
              Đặt lại bộ lọc
            </button>
          </div>

          <div className="fund-toolbar">
            <label className="fund-search">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm mã giao dịch, người gửi..."
              />
            </label>
            <select value={fundFilter} onChange={(e) => setFundFilter(e.target.value)}>
              <option value="all">Tất cả các quỹ</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="SUCCESS">Đã xác nhận (SUCCESS)</option>
              <option value="AWAITING_VERIFICATION">Chờ Tộc trưởng duyệt</option>
              <option value="PENDING">Chưa gửi minh chứng</option>
              <option value="REJECTED">Đã từ chối</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </div>

          <div className="fund-table-wrap">
            <table className="fund-table">
              <thead>
                <tr>
                  <th>Mã đóng góp</th>
                  <th>Quỹ đóng góp</th>
                  <th>Người gửi</th>
                  <th>Số tiền</th>
                  <th>Minh chứng</th>
                  <th>Ngày tạo</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {visibleDonations.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.donation_code}</strong>
                    </td>
                    <td>{d.fund_name || 'Quỹ dòng họ'}</td>
                    <td>{d.donor_name}</td>
                    <td className="fund-amount-val income">+{formatVnd(d.amount)}</td>
                    <td>
                      {d.evidence_items && d.evidence_items.length > 0 ? (
                        <img
                          src={resolveMediaUrl(d.evidence_items[0].image_path)}
                          alt="Biên lai"
                          className="evidence-thumbnail"
                          title="Nhấp để xem ảnh to"
                          onClick={() => setPreviewEvidenceUrl(resolveMediaUrl(d.evidence_items![0].image_path))}
                        />
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '11px' }}>Chưa có</span>
                      )}
                    </td>
                    <td>{new Date(d.created_at).toLocaleDateString('vi-VN')}</td>
                    <td>
                      <span className={`status-badge status-${d.status}`}>{statusLabels[d.status]}</span>
                    </td>
                    <td>
                      <div className="fund-actions">
                        <button type="button" onClick={() => setSelectedDonation(d)}>
                          Chi tiết
                        </button>
                        {d.status === 'AWAITING_VERIFICATION' && isLeader && (
                          <button
                            type="button"
                            className="fund-btn-approve"
                            onClick={() => setVerifyingTarget(d)}
                          >
                            Xác nhận
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleDonations.length && (
              <div className="fund-empty-box">
                <p>Không có giao dịch nào phù hợp với bộ lọc.</p>
              </div>
            )}
          </div>

          <div className="fund-table-footer">
            <span>
              Hiển thị {visibleDonations.length} / {filteredDonations.length} giao dịch
            </span>
            <FeaturePagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: GIAO DỊCH CHỜ XÁC NHẬN (ĐỐI SOÁT TỘC TRƯỞNG & FAMILY ADMIN)
          ===================================================================== */}
      {currentTab === 'pending' && hasManageRights && (
        <div className="fund-table-card">
          <div className="fund-table-heading">
            <div>
              <h2>Giao dịch chờ xác nhận đối soát</h2>
              <span>
                Thành viên đã chuyển khoản và gửi ảnh minh chứng. Tộc trưởng kiểm tra tiền thực nhận tại ngân hàng để
                xác nhận.
              </span>
            </div>
            {!isLeader && (
              <span className="status-badge status-AWAITING_VERIFICATION" title="Chỉ Tộc trưởng mới có quyền xác nhận">
                Quyền xem: Family Admin (Chỉ Tộc trưởng mới có nút Xác nhận)
              </span>
            )}
          </div>

          <div className="fund-table-wrap">
            <table className="fund-table">
              <thead>
                <tr>
                  <th>Mã đóng góp</th>
                  <th>Quỹ</th>
                  <th>Người đóng góp</th>
                  <th>Số tiền</th>
                  <th>Mã tham chiếu NH</th>
                  <th>Ảnh minh chứng</th>
                  <th>Thời gian gửi</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {pendingDonations.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.donation_code}</strong>
                    </td>
                    <td>{d.fund_name}</td>
                    <td>{d.donor_name}</td>
                    <td className="fund-amount-val income">+{formatVnd(d.amount)}</td>
                    <td>{d.bank_transaction_reference || <span style={{ color: '#94a3b8' }}>Không có</span>}</td>
                    <td>
                      {d.evidence_items && d.evidence_items.length > 0 ? (
                        <img
                          src={resolveMediaUrl(d.evidence_items[0].image_path)}
                          alt="Minh chứng"
                          className="evidence-thumbnail"
                          title="Nhấp để phóng to ảnh biên lai"
                          onClick={() => setPreviewEvidenceUrl(resolveMediaUrl(d.evidence_items![0].image_path))}
                        />
                      ) : (
                        <span style={{ color: '#ef4444', fontSize: '12px' }}>Chờ ảnh</span>
                      )}
                    </td>
                    <td>{d.submitted_at ? new Date(d.submitted_at).toLocaleString('vi-VN') : 'Mới tạo'}</td>
                    <td>
                      <div className="fund-actions">
                        <button type="button" onClick={() => setSelectedDonation(d)}>
                          Chi tiết
                        </button>
                        {isLeader ? (
                          <>
                            <button
                              type="button"
                              className="fund-btn-approve"
                              onClick={() => setVerifyingTarget(d)}
                              title="Xác nhận tiền đã vào tài khoản ngân hàng"
                            >
                              Xác nhận đã nhận tiền
                            </button>
                            <button
                              type="button"
                              style={{ color: '#dc2626', border: '1px solid #fecaca', background: '#fff' }}
                              onClick={() => {
                                setRejectingTarget(d);
                                setRejectReason('');
                              }}
                              title="Từ chối sau khi đối soát"
                            >
                              Từ chối
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                            Chờ Tộc trưởng duyệt
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!pendingDonations.length && (
              <div className="fund-empty-box">
                <p>Hiện không có giao dịch nào đang chờ đối soát.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: DANH SÁCH QUỸ (CHO CẢ THÀNH VIÊN VÀ QUẢN TRỊ)
          ===================================================================== */}
      {currentTab === 'funds' && (
        <div className="fund-cards-grid">
          {funds.map((fund) => {
            const current = fund.current_amount || 0;
            const target = fund.target_amount || 0;
            const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

            return (
              <div key={fund.id} className="fund-item-card">
                <div>
                  <div className="fund-item-header">
                    <div>
                      <h3>{fund.name}</h3>
                      <span className={`status-badge ${fund.status === 'ACTIVE' ? 'status-ACTIVE' : 'status-CLOSED'}`}>
                        {fund.status === 'ACTIVE' ? 'Hoạt động' : 'Ngưng nhận quỹ'}
                      </span>
                    </div>
                  </div>
                  <p className="fund-item-purpose">
                    <strong>Mục đích:</strong> {fund.purpose || 'Gây quỹ hoạt động dòng họ'}
                  </p>
                  {fund.description && <p className="fund-item-desc">{fund.description}</p>}
                </div>

                <div className="fund-item-stats">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>Đã quyên góp:</span>
                    <strong style={{ color: '#15803d' }}>{formatVnd(current)}</strong>
                  </div>
                  {target > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: '#64748b' }}>Mục tiêu:</span>
                      <strong>{formatVnd(target)}</strong>
                    </div>
                  )}

                  {target > 0 && (
                    <div className="fund-progress-container">
                      <div className="fund-progress-track">
                        <div className="fund-progress-fill" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="fund-progress-label">
                        <span>Tiến độ đạt được</span>
                        <strong>{percent}%</strong>
                      </div>
                    </div>
                  )}
                </div>

                <div className="fund-item-actions">
                  {fund.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      className="btn-donate-now"
                      onClick={() => {
                        setSelectedFundId(fund.id);
                        setCurrentTab('donate');
                      }}
                    >
                      Đóng góp quỹ này
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-donate-disabled"
                      disabled
                      title="Quỹ này đã ngưng tiếp nhận đóng góp"
                    >
                      Ngưng nhận quỹ
                    </button>
                  )}
                  {hasManageRights && (
                    <>
                      <button type="button" className="btn-edit-fund" onClick={() => handleOpenFundModal(fund)}>
                        Chỉnh sửa
                      </button>
                      <button
                        type="button"
                        className="btn-delete-fund"
                        onClick={() => setDeletingFund(fund)}
                        title="Xóa quỹ này"
                      >
                        <FeatureIcon name="delete" size={14} /> Xóa
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {!funds.length && (
            <div className="fund-empty-box" style={{ gridColumn: '1 / -1' }}>
              <p>Dòng họ chưa tạo quỹ nào.</p>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 4: CẤU HÌNH TÀI KHOẢN & QR NGÂN HÀNG (TỘC TRƯỞNG & FAMILY ADMIN)
          ===================================================================== */}
      {currentTab === 'bank' && hasManageRights && (
        <div className="member-donate-grid">
          <div className="member-donate-card form-card">
            <div className="card-header">
              <h3>Cấu hình tài khoản nhận đóng góp</h3>
              <p>Thông tin ngân hàng và mã QR chính thức để thành viên chuyển khoản trực tiếp.</p>
            </div>

            <form className="donate-confirm-form" onSubmit={handleSaveBankAccount}>
              <div className="form-group">
                <label>Tên ngân hàng *</label>
                <input
                  type="text"
                  required
                  value={bankFormData.bank_name}
                  onChange={(e) => setBankFormData({ ...bankFormData, bank_name: e.target.value })}
                  placeholder="Ví dụ: Vietcombank, Techcombank, MB Bank..."
                />
              </div>

              <div className="form-group">
                <label>Tên chủ tài khoản (In hoa không dấu) *</label>
                <input
                  type="text"
                  required
                  value={bankFormData.account_holder}
                  onChange={(e) => setBankFormData({ ...bankFormData, account_holder: e.target.value })}
                  placeholder="Ví dụ: NGUYEN VAN A hoặc QUY DONG HO..."
                />
              </div>

              <div className="form-group">
                <label>Số tài khoản ngân hàng *</label>
                <input
                  type="text"
                  required
                  value={bankFormData.account_number}
                  onChange={(e) => setBankFormData({ ...bankFormData, account_number: e.target.value })}
                  placeholder="Ví dụ: 0123456789"
                />
              </div>

              <div className="form-group">
                <label>Tải lên ảnh mã QR ngân hàng (PNG, JPEG, WebP &le; 2MB)</label>
                <label className="qr-upload-box">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setBankQrFile(file);
                        setBankQrPreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                  <span>
                    <FeatureIcon name="upload" size={20} />
                    <br />
                    <strong>Chọn tệp ảnh mã QR</strong> từ thiết bị
                  </span>
                </label>
              </div>

              <div className="form-group">
                <label>Hướng dẫn chuyển khoản bổ sung</label>
                <textarea
                  rows={2}
                  value={bankFormData.transfer_instruction}
                  onChange={(e) => setBankFormData({ ...bankFormData, transfer_instruction: e.target.value })}
                  placeholder="Ví dụ: Quý bà con chuyển khoản nhớ ghi đúng mã đóng góp..."
                />
              </div>

              <button type="submit" className="donate-submit-btn" disabled={savingBank}>
                {savingBank ? 'Đang lưu cấu hình...' : 'Lưu cấu hình tài khoản'}
              </button>
            </form>
          </div>

          {/* Xem trước thông tin tài khoản hiển thị cho thành viên */}
          <div className="member-donate-card qr-card">
            <div className="card-header">
              <h3>Xem trước hiển thị</h3>
              <p>Màn hình thành viên sẽ thấy khi thực hiện chuyển khoản</p>
            </div>

            <div className="qr-container">
              {bankQrPreview ? (
                <img src={resolveMediaUrl(bankQrPreview)} alt="Mã QR ngân hàng" className="qr-image" />
              ) : (
                <div style={{ padding: '40px 20px', color: '#94a3b8', textAlign: 'center' }}>
                  <FeatureIcon name="lock" size={32} />
                  <p>Chưa tải lên ảnh mã QR</p>
                </div>
              )}
            </div>

            <div className="bank-info-table">
              <div className="bank-row">
                <span className="bank-label">Ngân hàng:</span>
                <span className="bank-value">{bankFormData.bank_name || 'Chưa thiết lập'}</span>
              </div>
              <div className="bank-row">
                <span className="bank-label">Chủ tài khoản:</span>
                <span className="bank-value">{bankFormData.account_holder || 'Chưa thiết lập'}</span>
              </div>
              <div className="bank-row">
                <span className="bank-label">Số tài khoản:</span>
                <span className="bank-value highlight">{bankFormData.account_number || 'Chưa thiết lập'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: QUY TRÌNH CHUYỂN KHOẢN & ĐÓNG GÓP (CHO THÀNH VIÊN)
          ===================================================================== */}
      {currentTab === 'donate' && (
        <div className="member-donate-grid">
          {/* Cột 1: Thông tin tài khoản ngân hàng & QR */}
          <div className="member-donate-card qr-card">
            <div className="card-header">
              <h3>Tài khoản nhận đóng góp {clanName}</h3>
              <p>Chuyển khoản trực tiếp vào tài khoản ngân hàng chính thức của dòng họ.</p>
            </div>

            <div className="qr-container">
              {bankAccount?.qr_image_path ? (
                <img
                  src={resolveMediaUrl(bankAccount.qr_image_path)}
                  alt="Mã QR chuyển khoản dòng họ"
                  className="qr-image"
                  onClick={() => setPreviewEvidenceUrl(resolveMediaUrl(bankAccount.qr_image_path!))}
                  style={{ cursor: 'pointer' }}
                  title="Nhấp để xem to / quét mã"
                />
              ) : (
                <div style={{ padding: '40px 20px', color: '#94a3b8', textAlign: 'center' }}>
                  <p>Dòng họ chưa tải ảnh QR ngân hàng.</p>
                  <small>Vui lòng chuyển khoản theo số tài khoản bên dưới.</small>
                </div>
              )}
            </div>

            <div className="bank-info-table">
              <div className="bank-row">
                <span className="bank-label">Ngân hàng:</span>
                <span className="bank-value">{bankAccount?.bank_name || 'Liên hệ Tộc trưởng'}</span>
              </div>
              <div className="bank-row">
                <span className="bank-label">Chủ tài khoản:</span>
                <span className="bank-value">{bankAccount?.account_holder || 'Liên hệ Tộc trưởng'}</span>
              </div>
              <div className="bank-row">
                <span className="bank-label">Số tài khoản:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="bank-value highlight">{bankAccount?.account_number || '---'}</span>
                  {bankAccount?.account_number && (
                    <button
                      type="button"
                      className={`btn-copy ${copiedField === 'stk' ? 'copied' : ''}`}
                      onClick={() => handleCopy(bankAccount.account_number, 'stk')}
                    >
                      {copiedField === 'stk' ? 'Đã chép!' : 'Sao chép'}
                    </button>
                  )}
                </div>
              </div>
              {donationDraft && (
                <div className="bank-row" style={{ background: '#eff6ff', padding: '8px', borderRadius: '6px' }}>
                  <span className="bank-label">Nội dung chuyển:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ color: '#1e40af' }}>{donationDraft.donationCode}</strong>
                    <button
                      type="button"
                      className={`btn-copy ${copiedField === 'code' ? 'copied' : ''}`}
                      onClick={() => handleCopy(donationDraft.donationCode, 'code')}
                    >
                      {copiedField === 'code' ? 'Đã chép!' : 'Sao chép'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cột 2: Form nhập thông tin hoặc nộp minh chứng */}
          <div className="member-donate-card form-card">
            {!donationDraft ? (
              <>
                <div className="card-header">
                  <h3>Chọn quỹ & nhập số tiền</h3>
                  <p>Hệ thống sẽ sinh mã đóng góp để đối soát chính xác.</p>
                </div>

                <form className="donate-confirm-form" onSubmit={handleStartDonation}>
                  {funds.filter((f) => f.status === 'ACTIVE').length === 0 && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '14px' }}>
                      Hiện các quỹ của dòng họ đang ngưng nhận đóng góp. Vui lòng liên hệ Tộc trưởng để mở tiếp nhận.
                    </div>
                  )}

                  <div className="form-group">
                    <label>Chọn mục đích quỹ *</label>
                    <select
                      value={selectedFundId}
                      required
                      onChange={(e) => setSelectedFundId(e.target.value)}
                    >
                      <option value="">-- Chọn quỹ dòng họ --</option>
                      {funds.filter((f) => f.status === 'ACTIVE').length === 0 ? (
                        <option value="" disabled>-- Hiện tất cả các quỹ đang ngưng nhận đóng góp --</option>
                      ) : (
                        funds
                          .filter((f) => f.status === 'ACTIVE')
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name} ({f.purpose})
                            </option>
                          ))
                      )}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Họ và tên người đóng góp</label>
                    <input
                      type="text"
                      value={donorName}
                      onChange={(e) => setDonorName(e.target.value)}
                      placeholder="Nhập họ và tên..."
                    />
                  </div>

                  <div className="form-group">
                    <label>Số tiền đóng góp (VNĐ) *</label>
                    <input
                      type="number"
                      required
                      min="10000"
                      step="10000"
                      value={donateAmount}
                      onChange={(e) => setDonateAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Nhập số tiền..."
                    />
                    <div className="amount-presets">
                      {[50000, 100000, 200000, 500000, 1000000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          className={`amount-preset-btn ${donateAmount === amt ? 'active' : ''}`}
                          onClick={() => setDonateAmount(amt)}
                        >
                          {formatVnd(amt)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Lời chúc / Lời nhắn tới gia tộc</label>
                    <textarea
                      rows={2}
                      value={donateNote}
                      onChange={(e) => setDonateNote(e.target.value)}
                      placeholder="Con cháu kính cẩn đóng góp chút lòng thành..."
                    />
                  </div>

                  <button
                    type="submit"
                    className="donate-submit-btn"
                    disabled={submittingDonation || funds.filter((f) => f.status === 'ACTIVE').length === 0}
                  >
                    Tạo mã đóng góp & Lấy thông tin chuyển khoản
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="card-header">
                  <h3>Nộp ảnh minh chứng chuyển khoản</h3>
                  <p>
                    Mã đóng góp của bạn: <strong>{donationDraft.donationCode}</strong> ({formatVnd(donationDraft.amount)})
                  </p>
                </div>

                <form className="donate-confirm-form" onSubmit={handleSubmitEvidence}>
                  <div className="form-group">
                    <label>Ảnh chụp màn hình chuyển khoản thành công (Biên lai) *</label>
                    <label className="qr-upload-box">
                      <input
                        type="file"
                        required
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setEvidenceFile(file);
                            setEvidencePreview(URL.createObjectURL(file));
                          }
                        }}
                      />
                      <span>
                        <FeatureIcon name="upload" size={24} />
                        <br />
                        <strong>Tải lên ảnh biên lai giao dịch</strong>
                        <br />
                        <small style={{ color: '#64748b' }}>PNG, JPEG, WebP &le; 2MB</small>
                      </span>
                    </label>
                  </div>

                  {evidencePreview && (
                    <div style={{ textAlign: 'center' }}>
                      <img
                        src={evidencePreview}
                        alt="Xem trước biên lai"
                        style={{ maxHeight: '180px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label>Mã giao dịch ngân hàng / Mã tham chiếu (nếu có)</label>
                    <input
                      type="text"
                      value={bankRefCode}
                      onChange={(e) => setBankRefCode(e.target.value)}
                      placeholder="Ví dụ: FT26034871923..."
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px', cursor: 'pointer' }}
                      onClick={() => {
                        setDonationDraft(null);
                        setEvidenceFile(null);
                        setEvidencePreview(null);
                      }}
                    >
                      Quay lại
                    </button>
                    <button
                      type="submit"
                      className="donate-submit-btn"
                      style={{ flex: 1, marginTop: 0 }}
                      disabled={submittingDonation}
                    >
                      {submittingDonation ? 'Đang gửi...' : 'Gửi minh chứng đóng góp'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 6: LỊCH SỬ ĐÓNG GÓP CỦA TÔI (CHO THÀNH VIÊN)
          ===================================================================== */}
      {currentTab === 'history' && !hasManageRights && (
        <div className="fund-table-card">
          <div className="fund-table-heading">
            <div>
              <h2>Lịch sử đóng góp của tôi</h2>
              <span>Danh sách các khoản đóng góp bạn đã gửi cho dòng họ {clanName}</span>
            </div>
          </div>

          <div className="fund-table-wrap">
            <table className="fund-table">
              <thead>
                <tr>
                  <th>Mã đóng góp</th>
                  <th>Quỹ</th>
                  <th>Số tiền</th>
                  <th>Ngày gửi</th>
                  <th>Biên lai</th>
                  <th>Trạng thái</th>
                  <th>Ghi chú</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {donations
                  .filter((d) => ['AWAITING_VERIFICATION', 'SUCCESS', 'REJECTED'].includes(d.status))
                  .map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.donation_code}</strong>
                      </td>
                      <td>{d.fund_name}</td>
                      <td className="fund-amount-val income">+{formatVnd(d.amount)}</td>
                      <td>{new Date(d.submitted_at || d.created_at).toLocaleDateString('vi-VN')}</td>
                      <td>
                        {d.evidence_items && d.evidence_items.length > 0 ? (
                          <img
                            src={resolveMediaUrl(d.evidence_items[0].image_path)}
                            alt="Biên lai"
                            className="evidence-thumbnail"
                            onClick={() => setPreviewEvidenceUrl(resolveMediaUrl(d.evidence_items![0].image_path))}
                            title="Xem biên lai"
                          />
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Chưa có</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge status-${d.status}`}>{statusLabels[d.status]}</span>
                      </td>
                      <td>
                        {d.status === 'REJECTED' && (
                          <span style={{ color: '#dc2626', fontSize: '12px' }}>
                            Lý do: {d.rejection_reason || 'Không khớp'}
                          </span>
                        )}
                        {d.status === 'SUCCESS' && (
                          <span style={{ color: '#15803d', fontSize: '12px' }}>
                            Tộc trưởng đã xác nhận
                          </span>
                        )}
                        {d.status === 'AWAITING_VERIFICATION' && (
                          <span style={{ color: '#b45309', fontSize: '12px' }}>
                            Đang chờ duyệt
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="fund-actions">
                          <button type="button" onClick={() => setSelectedDonation(d)}>
                            Chi tiết
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!donations.filter((d) => ['AWAITING_VERIFICATION', 'SUCCESS', 'REJECTED'].includes(d.status)).length && (
              <div className="fund-empty-box">
                <p>Bạn chưa có khoản đóng góp nào.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          CÁC MODAL HỆ THỐNG
          ===================================================================== */}

      {/* Modal Tạo/Sửa Quỹ */}
      {editingFund && (
        <FeatureModal
          title={editingFund === 'new' ? 'Tạo quỹ dòng họ mới' : 'Chỉnh sửa quỹ dòng họ'}
          eyebrow="QUẢN LÝ QUỸ GIA TỘC"
          onClose={() => setEditingFund(null)}
          wide
          footer={
            <>
              <button type="button" className="feature-button secondary" onClick={() => setEditingFund(null)}>
                Hủy
              </button>
              <button type="submit" form="fund-manage-form" className="feature-button primary">
                Lưu thông tin quỹ
              </button>
            </>
          }
        >
          <form id="fund-manage-form" className="feature-form-grid" onSubmit={handleSaveFund}>
            <div className="feature-field full">
              <label>Tên quỹ dòng họ *</label>
              <input
                required
                value={fundFormData.name}
                onChange={(e) => setFundFormData({ ...fundFormData, name: e.target.value })}
                placeholder="Ví dụ: Quỹ Khuyến học Nguyễn Tộc..."
              />
            </div>
            <div className="feature-field full">
              <label>Mục đích thành lập quỹ *</label>
              <input
                required
                value={fundFormData.purpose}
                onChange={(e) => setFundFormData({ ...fundFormData, purpose: e.target.value })}
                placeholder="Ví dụ: Trao học bổng con cháu, Tu bổ từ đường..."
              />
            </div>
            <div className="feature-field">
              <label>Số tiền mục tiêu (VNĐ)</label>
              <input
                type="number"
                min="0"
                value={fundFormData.target_amount}
                onChange={(e) => setFundFormData({ ...fundFormData, target_amount: e.target.value })}
                placeholder="Ví dụ: 100000000"
              />
            </div>
            <div className="feature-field">
              <label>Trạng thái hoạt động</label>
              <select
                value={fundFormData.status === 'ACTIVE' ? 'ACTIVE' : 'CLOSED'}
                onChange={(e) => setFundFormData({ ...fundFormData, status: e.target.value })}
              >
                <option value="ACTIVE">Hoạt động</option>
                <option value="CLOSED">Ngưng nhận quỹ</option>
              </select>
            </div>
            <div className="feature-field full">
              <label>Mô tả chi tiết quỹ</label>
              <textarea
                rows={3}
                value={fundFormData.description}
                onChange={(e) => setFundFormData({ ...fundFormData, description: e.target.value })}
                placeholder="Quy chế thu chi, đối tượng khen thưởng..."
              />
            </div>
          </form>
        </FeatureModal>
      )}

      {/* Modal Chi tiết Giao dịch */}
      {selectedDonation && (
        <FeatureModal
          title={`Chi tiết giao dịch ${selectedDonation.donation_code}`}
          eyebrow="ĐỐI SOÁT TÀI CHÍNH"
          onClose={() => setSelectedDonation(null)}
          footer={
            <>
              <button type="button" className="feature-button secondary" onClick={() => setSelectedDonation(null)}>
                Đóng
              </button>
              {selectedDonation.status === 'AWAITING_VERIFICATION' && isLeader && (
                <>
                  <button
                    type="button"
                    className="feature-button danger"
                    onClick={() => {
                      setRejectingTarget(selectedDonation);
                      setRejectReason('');
                    }}
                  >
                    Từ chối
                  </button>
                  <button
                    type="button"
                    className="feature-button primary"
                    onClick={() => setVerifyingTarget(selectedDonation)}
                  >
                    Xác nhận đã nhận tiền
                  </button>
                </>
              )}
            </>
          }
        >
          <div className="fund-detail-box">
            <div className="fund-detail-header income">
              <span>Đóng góp quỹ {selectedDonation.fund_name}</span>
              <strong>+{formatVnd(selectedDonation.amount)}</strong>
            </div>
            <div className="fund-detail-rows">
              <div>
                <span>Người đóng góp:</span>
                <strong>{selectedDonation.donor_name}</strong>
              </div>
              <div>
                <span>Mã đóng góp:</span>
                <strong>{selectedDonation.donation_code}</strong>
              </div>
              <div>
                <span>Trạng thái:</span>
                <strong>{statusLabels[selectedDonation.status]}</strong>
              </div>
              <div>
                <span>Mã giao dịch ngân hàng:</span>
                <strong>{selectedDonation.bank_transaction_reference || 'Không có'}</strong>
              </div>
              <div>
                <span>Lời nhắn / Ghi chú:</span>
                <strong>{selectedDonation.note || 'Không có'}</strong>
              </div>
              <div>
                <span>Thời gian tạo:</span>
                <strong>{new Date(selectedDonation.created_at).toLocaleString('vi-VN')}</strong>
              </div>
              {selectedDonation.verified_at && (
                <div>
                  <span>Thời gian duyệt:</span>
                  <strong>{new Date(selectedDonation.verified_at).toLocaleString('vi-VN')}</strong>
                </div>
              )}
              {selectedDonation.rejection_reason && (
                <div>
                  <span>Lý do từ chối:</span>
                  <strong style={{ color: '#dc2626' }}>{selectedDonation.rejection_reason}</strong>
                </div>
              )}
            </div>

            {selectedDonation.evidence_items && selectedDonation.evidence_items.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Ảnh biên lai chuyển khoản:
                </span>
                <img
                  src={resolveMediaUrl(selectedDonation.evidence_items[0].image_path)}
                  alt="Ảnh biên lai"
                  style={{ maxWidth: '100%', maxHeight: '240px', borderRadius: '6px', border: '1px solid #cbd5e1', cursor: 'pointer' }}
                  onClick={() => setPreviewEvidenceUrl(resolveMediaUrl(selectedDonation.evidence_items![0].image_path))}
                  title="Nhấp để xem to"
                />
              </div>
            )}
          </div>
        </FeatureModal>
      )}

      {/* Modal Xác nhận xóa quỹ dòng họ */}
      {deletingFund && (
        <ConfirmDialog
          title="Xác nhận xóa quỹ dòng họ?"
          description={`Bạn có chắc chắn muốn xóa vĩnh viễn quỹ "${deletingFund.name}" (${deletingFund.purpose}) không? Hành động này sẽ loại bỏ quỹ khỏi danh sách của dòng họ.`}
          confirmLabel={isDeletingFund ? 'Đang xóa...' : 'Xác nhận xóa quỹ'}
          cancelLabel="Hủy"
          danger={true}
          onConfirm={handleConfirmDeleteFund}
          onCancel={() => setDeletingFund(null)}
        />
      )}

      {/* Modal Xác nhận đã nhận tiền (Dành riêng cho Tộc trưởng) */}
      {verifyingTarget && (
        <ConfirmDialog
          title="Xác nhận đã nhận tiền vào tài khoản ngân hàng?"
          description={`Bạn xác nhận đã nhận được ${formatVnd(verifyingTarget.amount)} từ giao dịch ${verifyingTarget.donation_code} (Người gửi: ${verifyingTarget.donor_name}) vào tài khoản ngân hàng thực tế?`}
          confirmLabel={processingAction ? 'Đang xác nhận...' : 'Xác nhận đã nhận tiền'}
          cancelLabel="Hủy"
          onConfirm={handleConfirmVerification}
          onCancel={() => setVerifyingTarget(null)}
        />
      )}

      {/* Modal Từ chối giao dịch (Bắt buộc nhập lý do) */}
      {rejectingTarget && (
        <FeatureModal
          title={`Từ chối giao dịch ${rejectingTarget.donation_code}`}
          eyebrow="ĐỐI SOÁT TỘC TRƯỞNG"
          onClose={() => setRejectingTarget(null)}
          footer={
            <>
              <button type="button" className="feature-button secondary" onClick={() => setRejectingTarget(null)}>
                Hủy
              </button>
              <button
                type="button"
                className="feature-button danger"
                disabled={processingAction || !rejectReason.trim()}
                onClick={handleConfirmRejection}
              >
                {processingAction ? 'Đang từ chối...' : 'Xác nhận từ chối'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
              Vui lòng nhập lý do từ chối để thành viên đối soát lại (Ví dụ: Chưa thấy tiền vào tài khoản, Số tiền không
              khớp, v.v.):
            </p>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Nhập lý do từ chối (bắt buộc)..."
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
          </div>
        </FeatureModal>
      )}

      {/* Modal Phóng to Ảnh Minh Chứng / QR */}
      {previewEvidenceUrl && (
        <FeatureModal title="Xem chi tiết hình ảnh" eyebrow="MINH CHỨNG ĐÓNG GÓP" onClose={() => setPreviewEvidenceUrl(null)}>
          <div style={{ textAlign: 'center' }}>
            <img src={resolveMediaUrl(previewEvidenceUrl)} alt="Minh chứng" className="evidence-preview-modal-img" />
          </div>
        </FeatureModal>
      )}

      {/* Toast thông báo */}
      {toast && <FeatureToast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </section>
  );
};

export default ClanFundsModule;
