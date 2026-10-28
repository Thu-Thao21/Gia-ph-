import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useClanContext } from '../../../context/ClanContext';
import {
  getMyClansSummary,
  searchPublicClans,
  createJoinRequest,
  supplementJoinRequest,
  cancelJoinRequest,
  leaveClan,
  type JoinedClanSummaryItem,
  type ClanJoinRequestItem,
  type PublicClanItem,
} from '../../../services/clanJoin.service';
import './MyClans.css';

const RELATION_OPTIONS = [
  { value: 'Con', label: 'Con (Hậu duệ trực hệ)' },
  { value: 'Cháu', label: 'Cháu (Nội/Ngoại)' },
  { value: 'Anh/chị/em', label: 'Anh / Chị / Em' },
  { value: 'Khác', label: 'Quan hệ khác (Ghi rõ bên dưới)' },
];

export const MyClans: React.FC = () => {
  const { account, refreshAccount } = useAuth();
  const { activeClanId, selectClan, setActiveClanId } = useClanContext();

  const [loading, setLoading] = useState(true);
  const [joinedClans, setJoinedClans] = useState<JoinedClanSummaryItem[]>([]);
  const [myRequests, setMyRequests] = useState<ClanJoinRequestItem[]>([]);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  // Leave clan modal state
  const [leavingClan, setLeavingClan] = useState<JoinedClanSummaryItem | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  // Modals state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  // Step 1: Clan Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicClanItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedClan, setSelectedClan] = useState<PublicClanItem | null>(null);

  // Step 2: Form Data
  const [lineageType, setLineageType] = useState<'PATERNAL' | 'MATERNAL'>('PATERNAL');
  const [fullName, setFullName] = useState(account?.name || '');
  const [birthDate, setBirthDate] = useState('');
  const [relativeName, setRelativeName] = useState('');
  const [relativeRelation, setRelativeRelation] = useState('Con');
  const [relationDescription, setRelationDescription] = useState('');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // View Details Modal
  const [viewingRequest, setViewingRequest] = useState<ClanJoinRequestItem | null>(null);

  // Supplement Modal
  const [supplementingRequest, setSupplementingRequest] = useState<ClanJoinRequestItem | null>(null);
  const [supplementNotes, setSupplementNotes] = useState('');
  const [supplementRelative, setSupplementRelative] = useState('');
  const [supplementRelation, setSupplementRelation] = useState('');
  const [isSupplementing, setIsSupplementing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMyClansSummary();
      setJoinedClans(data.joined_clans || []);
      setMyRequests(data.my_requests || []);
    } catch (err: any) {
      console.error('Failed to load my clans summary:', err);
      setNotice({ text: 'Không thể tải danh sách dòng họ. Vui lòng thử lại sau.', error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSwitchClan = useCallback(
    (clanId: string, clanName: string) => {
      const ok = selectClan ? selectClan(clanId) : false;
      if (ok) {
        setNotice({ text: `Đã chuyển sang thao tác tại "${clanName}".`, error: false });
        setTimeout(() => setNotice(null), 3000);
      } else if (setActiveClanId) {
        setActiveClanId(clanId);
        setNotice({ text: `Đã chuyển sang thao tác tại "${clanName}".`, error: false });
        setTimeout(() => setNotice(null), 3000);
      }
    },
    [selectClan, setActiveClanId]
  );

  const handleConfirmLeaveClan = async () => {
    if (!leavingClan) return;
    try {
      setIsLeaving(true);
      const res = await leaveClan(leavingClan.clan_id);
      setNotice({ text: res.message || `Đã rời dòng họ "${leavingClan.clan_name}" thành công.`, error: false });

      const remaining = joinedClans.filter((c) => c.clan_id !== leavingClan.clan_id);
      if (activeClanId === leavingClan.clan_id) {
        if (remaining.length > 0) {
          selectClan(remaining[0].clan_id);
        } else if (setActiveClanId) {
          setActiveClanId(null);
        }
      }

      await loadData();
      if (refreshAccount) {
        await refreshAccount();
      }
      setLeavingClan(null);
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      console.error('Leave clan failed:', err);
      const msg =
        err?.response?.data?.detail?.message ||
        err?.response?.data?.detail ||
        err?.message ||
        'Có lỗi xảy ra khi rời dòng họ.';
      setNotice({ text: msg, error: true });
    } finally {
      setIsLeaving(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Search in Step 1
  useEffect(() => {
    if (!showJoinModal || wizardStep !== 1) return;
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await searchPublicClans(searchQuery.trim());
        setSearchResults(res);
      } catch (err) {
        console.error('Failed to search public clans:', err);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, showJoinModal, wizardStep]);

  const openJoinModal = () => {
    setWizardStep(1);
    setSelectedClan(null);
    setSearchQuery('');
    setLineageType('PATERNAL');
    setFullName(account?.name || '');
    setBirthDate('');
    setRelativeName('');
    setRelativeRelation('Con');
    setRelationDescription('');
    setVerificationNotes('');
    setConsentGiven(false);
    setShowJoinModal(true);
  };

  const handleSelectClan = (clan: PublicClanItem) => {
    if (clan.is_joined) {
      alert('Bạn đã là thành viên chính thức của dòng họ này.');
      return;
    }
    if (clan.active_request_id) {
      alert('Bạn đã có yêu cầu gia nhập đang chờ xử lý cho dòng họ này.');
      return;
    }
    setSelectedClan(clan);
    setWizardStep(2);
  };

  const handleStep2Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !relativeName.trim() || !verificationNotes.trim()) {
      alert('Vui lòng điền đầy đủ các thông tin bắt buộc.');
      return;
    }
    if (relativeRelation === 'Khác' && !relationDescription.trim()) {
      alert('Vui lòng mô tả quan hệ cụ thể khi chọn "Khác".');
      return;
    }
    if (!consentGiven) {
      alert('Bạn phải đồng ý gửi thông tin xác minh tới Quản trị viên dòng họ.');
      return;
    }
    setWizardStep(3);
  };

  const handleSubmitJoinRequest = async () => {
    if (!selectedClan) return;
    try {
      setIsSubmitting(true);
      await createJoinRequest({
        clan_id: selectedClan.clan_id,
        lineage_type: lineageType,
        full_name: fullName.trim(),
        birth_date: birthDate || null,
        relative_name: relativeName.trim(),
        relative_relation: relativeRelation === 'Khác' ? relationDescription.trim() : relativeRelation,
        relation_description: relativeRelation === 'Khác' ? relationDescription.trim() : null,
        verification_notes: verificationNotes.trim(),
        consent_given: consentGiven,
      });

      setShowJoinModal(false);
      setNotice({
        text: `Đã gửi yêu cầu gia nhập tới dòng họ "${selectedClan.name}". Trạng thái hiện tại: Chờ xác minh.`,
        error: false,
      });
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || err.response?.data?.detail || 'Không thể gửi yêu cầu.';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelRequest = async (req: ClanJoinRequestItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn hủy yêu cầu gia nhập dòng họ "${req.clan_name}"?`)) {
      return;
    }
    try {
      await cancelJoinRequest(req.request_id);
      setNotice({ text: 'Đã hủy yêu cầu gia nhập thành công.', error: false });
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || 'Không thể hủy yêu cầu.';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const handleOpenSupplement = (req: ClanJoinRequestItem) => {
    setSupplementingRequest(req);
    setSupplementRelative(req.relative_name);
    setSupplementRelation(req.relative_relation);
    setSupplementNotes('');
  };

  const handleSubmitSupplement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplementingRequest || !supplementNotes.trim()) {
      alert('Vui lòng nhập nội dung giải trình bổ sung.');
      return;
    }
    try {
      setIsSupplementing(true);
      await supplementJoinRequest(supplementingRequest.request_id, {
        relative_name: supplementRelative.trim() || undefined,
        relative_relation: supplementRelation.trim() || undefined,
        verification_notes: supplementNotes.trim(),
      });
      setSupplementingRequest(null);
      setNotice({ text: 'Đã gửi bổ sung thông tin thành công. Yêu cầu đã chuyển về Chờ xác minh.', error: false });
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.detail?.message || 'Không thể gửi bổ sung.';
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsSupplementing(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Chờ xác minh';
      case 'NEED_INFO': return 'Cần bổ sung';
      case 'APPROVED': return 'Đã chấp thuận';
      case 'REJECTED': return 'Đã từ chối';
      case 'CANCELLED': return 'Đã hủy';
      default: return status;
    }
  };

  const getLineageBadge = (lineage?: string | null) => {
    if (lineage === 'PATERNAL') {
      return <span className="lineage-tag paternal">Bên nội</span>;
    }
    if (lineage === 'MATERNAL') {
      return <span className="lineage-tag maternal">Bên ngoại</span>;
    }
    return <span className="lineage-tag unset">Chưa xác định</span>;
  };

  const getRoleBadge = (roles: Array<{ code: string; name: string }>) => {
    const codes = roles.map((r) => r.code);
    if (codes.includes('BUSINESS_OWNER')) {
      return <span className="role-badge-pill leader">Trưởng tộc</span>;
    }
    if (codes.includes('FAMILY_ADMIN')) {
      return <span className="role-badge-pill fa">Quản trị viên (FA)</span>;
    }
    return <span className="role-badge-pill">Thành viên</span>;
  };

  return (
    <div className="my-clans-container">
      {notice && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '20px',
            borderRadius: '8px',
            background: notice.error ? '#fef2f2' : '#f0fdf4',
            color: notice.error ? '#991b1b' : '#166534',
            border: `1px solid ${notice.error ? '#fecaca' : '#bbf7d0'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ×
          </button>
        </div>
      )}

      <div className="my-clans-header">
        <div className="my-clans-header-left">
          <h1>Dòng tộc của tôi</h1>
          <p>Quản lý các cây gia phả bạn đã tham gia (nội/ngoại) và theo dõi các yêu cầu xin gia nhập dòng họ mới.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-secondary" onClick={loadData} disabled={loading} title="Làm mới trạng thái">
            {loading ? 'Đang tải...' : 'Làm mới'}
          </button>
          <button type="button" className="btn-join-clan-primary" onClick={openJoinModal}>
            <span>+</span> Gia nhập dòng tộc
          </button>
        </div>
      </div>

      {/* SECTION 1: DÒNG TỘC ĐÃ THAM GIA */}
      <section className="my-clans-section">
        <div className="section-title-row">
          <h2>
            Dòng tộc đã tham gia
            <span className="badge-count">{joinedClans.length}</span>
          </h2>
        </div>

        {joinedClans.length === 0 ? (
          <p style={{ color: '#64748b', fontStyle: 'italic', margin: '8px 0' }}>
            Bạn chưa tham gia dòng tộc nào. Hãy nhấn "Gia nhập dòng tộc" để gửi yêu cầu tham gia cây gia phả bên nội hoặc bên ngoại.
          </p>
        ) : (
          <div className="clans-grid">
            {joinedClans.map((clan) => {
              const isActive = String(clan.clan_id).toLowerCase() === String(activeClanId || '').toLowerCase();
              return (
                <div key={clan.clan_id} className={`clan-card ${isActive ? 'active-clan' : ''}`}>
                  <div className="clan-card-header">
                    <div>
                      <h3 className="clan-card-title">{clan.clan_name}</h3>
                      <span className="clan-card-code">Mã: {clan.clan_code}</span>
                    </div>
                    {getLineageBadge(clan.lineage_type)}
                  </div>

                  <div className="clan-card-body">
                    <div className="clan-card-meta">
                      <div className="meta-row">
                        <span className="meta-label">Địa phương:</span>
                        <span>{clan.origin_place || 'Chưa cập nhật'}</span>
                      </div>
                      <div className="meta-row">
                        <span className="meta-label">Vai trò của bạn:</span>
                        {getRoleBadge(clan.roles)}
                      </div>
                      <div className="meta-row">
                        <span className="meta-label">Trạng thái:</span>
                        <span style={{ color: clan.membership_status === 'ACTIVE' ? '#166534' : '#b45309', fontWeight: 600 }}>
                          {clan.membership_status === 'ACTIVE' ? 'Đang hoạt động' : clan.membership_status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="clan-card-actions">
                    {isActive ? (
                      <span className="active-indicator">
                        <span className="active-dot" /> Đang thao tác cây này
                      </span>
                    ) : (
                      <span style={{ fontSize: '12.5px', color: '#64748b' }}>Đã tham gia</span>
                    )}

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {!isActive && clan.membership_status === 'ACTIVE' && (
                        <button
                          type="button"
                          className="btn-switch-clan"
                          onClick={() => handleSwitchClan(clan.clan_id, clan.clan_name)}
                        >
                          Chuyển sang cây này
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn-leave-clan"
                        onClick={() => setLeavingClan(clan)}
                        title="Rời khỏi dòng họ nếu vào nhầm"
                      >
                        Rời dòng họ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: YÊU CẦU GIA NHẬP */}
      <section className="my-clans-section">
        <div className="section-title-row">
          <h2>
            Yêu cầu gia nhập dòng tộc
            <span className="badge-count">{myRequests.length}</span>
          </h2>
        </div>

        {myRequests.length === 0 ? (
          <p style={{ color: '#64748b', fontStyle: 'italic', margin: '8px 0' }}>
            Chưa có yêu cầu gia nhập nào được gửi đi.
          </p>
        ) : (
          <div className="requests-table-wrap">
            <table className="requests-table">
              <thead>
                <tr>
                  <th>Dòng tộc đích</th>
                  <th>Phía gia đình</th>
                  <th>Người thân khai báo</th>
                  <th>Ngày gửi</th>
                  <th>Trạng thái</th>
                  <th>Phản hồi người duyệt</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.map((req) => (
                  <tr key={req.request_id}>
                    <td>
                      <strong>{req.clan_name}</strong>
                      <div style={{ fontSize: '11.5px', color: '#64748b' }}>Mã: {req.clan_code}</div>
                    </td>
                    <td>{getLineageBadge(req.lineage_type)}</td>
                    <td>
                      <div>{req.relative_name}</div>
                      <small style={{ color: '#64748b' }}>Quan hệ: {req.relative_relation}</small>
                    </td>
                    <td>{new Date(req.created_at).toLocaleDateString('vi-VN')}</td>
                    <td>
                      <span className={`status-badge ${req.status}`}>{getStatusLabel(req.status)}</span>
                    </td>
                    <td style={{ maxWidth: '240px' }}>
                      {req.review_note ? (
                        <div style={{ fontSize: '13px', color: '#334155', fontStyle: 'italic' }}>
                          "{req.review_note}"
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="req-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-action-sm"
                          onClick={() => setViewingRequest(req)}
                        >
                          Chi tiết
                        </button>

                        {req.status === 'NEED_INFO' && (
                          <button
                            type="button"
                            className="btn-action-sm btn-supplement"
                            onClick={() => handleOpenSupplement(req)}
                          >
                            Bổ sung
                          </button>
                        )}

                        {(req.status === 'PENDING' || req.status === 'NEED_INFO') && (
                          <button
                            type="button"
                            className="btn-action-sm btn-cancel"
                            onClick={() => handleCancelRequest(req)}
                          >
                            Hủy
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: GIA NHẬP DÒNG TỘC (3-STEP WIZARD) */}
      {/* ------------------------------------------------------------- */}
      {showJoinModal && (
        <div className="modal-backdrop-clan">
          <div className="modal-dialog-clan wide">
            <div className="modal-header-clan">
              <h3>Xin gia nhập dòng tộc thứ hai</h3>
              <button type="button" className="btn-close-modal" onClick={() => setShowJoinModal(false)}>
                ×
              </button>
            </div>

            <div className="modal-body-clan">
              {/* Wizard Steps */}
              <div className="wizard-steps-header">
                <div className={`wizard-step-item ${wizardStep === 1 ? 'active' : wizardStep > 1 ? 'completed' : ''}`}>
                  <div className="step-circle">{wizardStep > 1 ? '✓' : '1'}</div>
                  <div className="step-label">1. Tìm dòng tộc</div>
                </div>
                <div className={`wizard-step-item ${wizardStep === 2 ? 'active' : wizardStep > 2 ? 'completed' : ''}`}>
                  <div className="step-circle">{wizardStep > 2 ? '✓' : '2'}</div>
                  <div className="step-label">2. Khai thông tin xác minh</div>
                </div>
                <div className={`wizard-step-item ${wizardStep === 3 ? 'active' : ''}`}>
                  <div className="step-circle">3</div>
                  <div className="step-label">3. Kiểm tra & Gửi</div>
                </div>
              </div>

              {/* STEP 1: TÌM DÒNG TỘC */}
              {wizardStep === 1 && (
                <div>
                  <div className="form-group-clan">
                    <label>Nhập tên hoặc mã định danh dòng họ cần tìm:</label>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ví dụ: Họ Võ, Họ Mai, CLAN-VO..."
                      autoFocus
                    />
                  </div>

                  {searching ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>Đang tìm kiếm...</div>
                  ) : searchResults.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 16px', background: '#f8fafc', borderRadius: '8px' }}>
                      <p style={{ margin: '0 0 6px 0', color: '#475569', fontWeight: 500 }}>
                        {searchQuery.trim() ? `Không tìm thấy dòng họ nào khớp với từ khóa "${searchQuery}".` : 'Nhập từ khóa để tra cứu dòng họ.'}
                      </p>
                      <small style={{ color: '#94a3b8' }}>
                        Lưu ý: Các dòng họ riêng tư không nằm trong danh sách tra cứu công khai.
                      </small>
                    </div>
                  ) : (
                    <div className="search-results-list">
                      {searchResults.map((clan) => (
                        <div key={clan.clan_id} className="search-result-row">
                          <div className="search-result-info">
                            <h4>{clan.name}</h4>
                            <p>
                              Mã: <strong>{clan.code}</strong> {clan.origin_place ? `· Địa phương: ${clan.origin_place}` : ''} · Quy mô: {clan.member_count} thành viên
                            </p>
                            {clan.description && (
                              <p style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>{clan.description}</p>
                            )}
                          </div>

                          <div>
                            {clan.is_joined ? (
                              <span style={{ fontSize: '12.5px', color: '#166534', fontWeight: 600 }}>Đã tham gia</span>
                            ) : clan.active_request_id ? (
                              <span style={{ fontSize: '12.5px', color: '#b45309', fontWeight: 600 }}>Đã gửi yêu cầu</span>
                            ) : (
                              <button
                                type="button"
                                className="btn-primary-clan"
                                onClick={() => handleSelectClan(clan)}
                              >
                                Chọn dòng tộc →
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: KHAI THÔNG TIN */}
              {wizardStep === 2 && selectedClan && (
                <form id="join-request-step2-form" onSubmit={handleStep2Next}>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', marginBottom: '18px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12.5px', color: '#64748b' }}>Dòng họ đích xin gia nhập:</div>
                    <strong style={{ fontSize: '16px', color: '#0f172a' }}>{selectedClan.name}</strong> ({selectedClan.code})
                  </div>

                  <div className="form-group-clan">
                    <label>Dòng họ này là bên nội hay bên ngoại đối với bạn? *</label>
                    <div className="radio-group-lineage">
                      <div
                        className={`lineage-radio-card ${lineageType === 'PATERNAL' ? 'selected' : ''}`}
                        onClick={() => setLineageType('PATERNAL')}
                      >
                        <input
                          type="radio"
                          name="lineageType"
                          checked={lineageType === 'PATERNAL'}
                          onChange={() => setLineageType('PATERNAL')}
                        />
                        <div>
                          <strong>Bên nội</strong>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Họ theo bên Cha</div>
                        </div>
                      </div>

                      <div
                        className={`lineage-radio-card ${lineageType === 'MATERNAL' ? 'selected' : ''}`}
                        onClick={() => setLineageType('MATERNAL')}
                      >
                        <input
                          type="radio"
                          name="lineageType"
                          checked={lineageType === 'MATERNAL'}
                          onChange={() => setLineageType('MATERNAL')}
                        />
                        <div>
                          <strong>Bên ngoại</strong>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Họ theo bên Mẹ</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div className="form-group-clan">
                      <label>Họ và tên của bạn *</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Nhập họ và tên đầy đủ"
                      />
                    </div>
                    <div className="form-group-clan">
                      <label>Ngày sinh (nếu biết)</label>
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div className="form-group-clan">
                      <label>Tên người thân trong dòng họ này *</label>
                      <input
                        type="text"
                        required
                        value={relativeName}
                        onChange={(e) => setRelativeName(e.target.value)}
                        placeholder="Ví dụ: Ông Nguyễn Văn X, Bác Mai Văn Y..."
                      />
                    </div>
                    <div className="form-group-clan">
                      <label>Quan hệ của bạn với người thân đó *</label>
                      <select
                        value={relativeRelation}
                        onChange={(e) => setRelativeRelation(e.target.value)}
                      >
                        {RELATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {relativeRelation === 'Khác' && (
                    <div className="form-group-clan">
                      <label>Mô tả quan hệ cụ thể *</label>
                      <input
                        type="text"
                        required
                        value={relationDescription}
                        onChange={(e) => setRelationDescription(e.target.value)}
                        placeholder="Ví dụ: Cháu rể đời thứ 4, con nuôi..."
                      />
                    </div>
                  )}

                  <div className="form-group-clan">
                    <label>Thông tin giải thích / lời khai để xác minh *</label>
                    <textarea
                      required
                      rows={3}
                      value={verificationNotes}
                      onChange={(e) => setVerificationNotes(e.target.value)}
                      placeholder="Cung cấp các chi tiết giúp Quản trị viên/Trưởng tộc nhận diện (như quê quán, nhánh họ, tên cha mẹ, kỷ niệm gia đình...)"
                    />
                  </div>

                  <div className="form-group-clan" style={{ marginTop: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={consentGiven}
                        onChange={(e) => setConsentGiven(e.target.checked)}
                        style={{ marginTop: '3px' }}
                      />
                      <span>
                        Tôi xác nhận các thông tin trên là chính xác và đồng ý chuyển thông tin này tới Quản trị viên/Trưởng tộc của dòng họ để phục vụ việc xét duyệt.
                      </span>
                    </label>
                  </div>
                </form>
              )}

              {/* STEP 3: XÁC NHẬN VÀ GỬI */}
              {wizardStep === 3 && selectedClan && (
                <div>
                  <div className="review-summary-box">
                    <dl>
                      <dt>Dòng họ đích:</dt>
                      <dd>{selectedClan.name} ({selectedClan.code})</dd>

                      <dt>Quan hệ phía gia đình:</dt>
                      <dd>{lineageType === 'PATERNAL' ? 'Bên nội (Họ cha)' : 'Bên ngoại (Họ mẹ)'}</dd>

                      <dt>Họ và tên người xin gia nhập:</dt>
                      <dd>{fullName} {birthDate ? `(Sinh ngày: ${birthDate})` : ''}</dd>

                      <dt>Người thân & Quan hệ:</dt>
                      <dd>{relativeName} — {relativeRelation === 'Khác' ? relationDescription : relativeRelation}</dd>

                      <dt>Thông tin giải thích xác minh:</dt>
                      <dd style={{ whiteSpace: 'pre-wrap' }}>{verificationNotes}</dd>

                      <dt>Quyền sau khi được chấp thuận:</dt>
                      <dd style={{ color: '#0369a1', fontWeight: 600 }}>Thành viên (Member) của {selectedClan.name}</dd>
                    </dl>
                  </div>

                  <div style={{ marginTop: '14px', fontSize: '13px', color: '#64748b', background: '#fffbeb', padding: '10px 14px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                    <strong>Lưu ý:</strong> Sau khi gửi, yêu cầu sẽ chuyển sang trạng thái <em>Chờ xác minh</em>. Người duyệt của dòng họ đích sẽ kiểm tra thông tin và liên kết hồ sơ Person trước khi chính thức chấp thuận.
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer-clan">
              {wizardStep === 1 && (
                <button type="button" className="btn-secondary" onClick={() => setShowJoinModal(false)}>
                  Đóng
                </button>
              )}

              {wizardStep === 2 && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setWizardStep(1)}>
                    ← Quay lại tìm dòng họ
                  </button>
                  <button type="submit" form="join-request-step2-form" className="btn-primary-clan">
                    Tiếp tục kiểm tra →
                  </button>
                </>
              )}

              {wizardStep === 3 && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setWizardStep(2)} disabled={isSubmitting}>
                    ← Sửa thông tin
                  </button>
                  <button
                    type="button"
                    className="btn-primary-clan"
                    onClick={handleSubmitJoinRequest}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Đang gửi yêu cầu...' : 'Xác nhận & Gửi yêu cầu'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: XEM CHI TIẾT YÊU CẦU */}
      {/* ------------------------------------------------------------- */}
      {viewingRequest && (
        <div className="modal-backdrop-clan">
          <div className="modal-dialog-clan">
            <div className="modal-header-clan">
              <h3>Chi tiết yêu cầu gia nhập</h3>
              <button type="button" className="btn-close-modal" onClick={() => setViewingRequest(null)}>
                ×
              </button>
            </div>
            <div className="modal-body-clan">
              <div className="review-summary-box">
                <dl>
                  <dt>Dòng họ đích:</dt>
                  <dd>
                    <strong>{viewingRequest.clan_name}</strong> (Mã: {viewingRequest.clan_code})
                  </dd>

                  <dt>Phía gia đình:</dt>
                  <dd>{getLineageBadge(viewingRequest.lineage_type)}</dd>

                  <dt>Trạng thái hiện tại:</dt>
                  <dd>
                    <span className={`status-badge ${viewingRequest.status}`}>{getStatusLabel(viewingRequest.status)}</span>
                  </dd>

                  <dt>Người xin gia nhập:</dt>
                  <dd>{viewingRequest.full_name} {viewingRequest.birth_date ? `(Sinh: ${viewingRequest.birth_date})` : ''}</dd>

                  <dt>Người thân & Quan hệ:</dt>
                  <dd>{viewingRequest.relative_name} ({viewingRequest.relative_relation})</dd>

                  <dt>Lời khai xác minh:</dt>
                  <dd style={{ whiteSpace: 'pre-wrap' }}>{viewingRequest.verification_notes}</dd>

                  {viewingRequest.review_note && (
                    <>
                      <dt style={{ color: '#b91c1c' }}>Phản hồi từ người duyệt:</dt>
                      <dd style={{ color: '#b91c1c', fontWeight: 600 }}>{viewingRequest.review_note}</dd>
                    </>
                  )}

                  {viewingRequest.linked_person_name && (
                    <>
                      <dt style={{ color: '#166534' }}>Hồ sơ Person được liên kết:</dt>
                      <dd style={{ color: '#166534', fontWeight: 600 }}>{viewingRequest.linked_person_name}</dd>
                    </>
                  )}
                </dl>
              </div>

              {viewingRequest.history && viewingRequest.history.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ fontSize: '14px', margin: '0 0 8px 0', color: '#334155' }}>Lịch sử xử lý:</h4>
                  <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '12.5px', color: '#64748b' }}>
                    {viewingRequest.history.map((h, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>
                        <strong>{getStatusLabel(h.event)}</strong> — <time>{new Date(h.at).toLocaleString('vi-VN')}</time>
                        {h.note && ` (${h.note})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-footer-clan">
              <button type="button" className="btn-secondary" onClick={() => setViewingRequest(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: BỔ SUNG THÔNG TIN KHI NEED_INFO */}
      {/* ------------------------------------------------------------- */}
      {supplementingRequest && (
        <div className="modal-backdrop-clan">
          <div className="modal-dialog-clan">
            <div className="modal-header-clan">
              <h3>Bổ sung thông tin xác minh</h3>
              <button type="button" className="btn-close-modal" onClick={() => setSupplementingRequest(null)}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmitSupplement}>
              <div className="modal-body-clan">
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '8px', marginBottom: '16px', color: '#991b1b', fontSize: '13.5px' }}>
                  <strong>Yêu cầu từ người duyệt:</strong> {supplementingRequest.review_note || 'Vui lòng bổ sung thêm thông tin xác minh.'}
                </div>

                <div className="form-group-clan">
                  <label>Tên người thân (nếu cần chỉnh sửa):</label>
                  <input
                    type="text"
                    value={supplementRelative}
                    onChange={(e) => setSupplementRelative(e.target.value)}
                  />
                </div>

                <div className="form-group-clan">
                  <label>Quan hệ với người thân (nếu cần chỉnh sửa):</label>
                  <input
                    type="text"
                    value={supplementRelation}
                    onChange={(e) => setSupplementRelation(e.target.value)}
                  />
                </div>

                <div className="form-group-clan">
                  <label>Nội dung giải trình bổ sung *:</label>
                  <textarea
                    required
                    rows={4}
                    value={supplementNotes}
                    onChange={(e) => setSupplementNotes(e.target.value)}
                    placeholder="Nhập thông tin chi tiết làm rõ các điểm mà người duyệt yêu cầu..."
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer-clan">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSupplementingRequest(null)}
                  disabled={isSupplementing}
                >
                  Hủy
                </button>
                <button type="submit" className="btn-primary-clan" disabled={isSupplementing}>
                  {isSupplementing ? 'Đang gửi...' : 'Gửi lại yêu cầu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Leave Clan Confirmation Modal */}
      {leavingClan && (
        <div className="modal-backdrop-clan" onClick={() => !isLeaving && setLeavingClan(null)}>
          <div className="modal-dialog-clan modal-leave-clan" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-clan">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ color: '#0f172a', margin: 0, fontSize: '17px', fontWeight: 700 }}>
                  Xác nhận rời khỏi dòng họ
                </h3>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#991b1b', textTransform: 'uppercase' }}>
                  Cảnh báo
                </span>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => !isLeaving && setLeavingClan(null)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <div className="modal-body-clan" style={{ background: '#ffffff' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Dòng họ rời đi
                </div>
                <div style={{ fontSize: '15.5px', fontWeight: 700, color: '#0f172a' }}>
                  {leavingClan.clan_name}
                </div>
                <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '3px' }}>
                  Mã định danh: <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>{leavingClan.clan_code}</span>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a', margin: '0 0 8px' }}>
                  Các thay đổi sau khi bạn rời dòng họ:
                </p>
                <ul style={{ fontSize: '13.5px', color: '#334155', paddingLeft: '20px', margin: 0, lineHeight: '1.7' }}>
                  <li>Hồ sơ của bạn sẽ không còn xuất hiện trong Cây gia phả của dòng họ này.</li>
                  <li>Toàn bộ vai trò và quyền truy cập dữ liệu nội bộ sẽ bị thu hồi ngay lập tức.</li>
                  <li>Nếu vào nhầm, bạn có thể gửi lại yêu cầu xin gia nhập bất cứ lúc nào.</li>
                </ul>
              </div>

              <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '12px 14px' }}>
                <p style={{ fontSize: '12.5px', color: '#92400e', margin: 0, lineHeight: '1.5' }}>
                  <strong>Lưu ý:</strong> Nếu bạn đang là Trưởng tộc duy nhất, hệ thống sẽ yêu cầu bạn chuyển giao quyền quản trị trước khi rời dòng họ.
                </p>
              </div>
            </div>
            <div className="modal-footer-clan">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setLeavingClan(null)}
                disabled={isLeaving}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn-danger-leave"
                onClick={handleConfirmLeaveClan}
                disabled={isLeaving}
              >
                {isLeaving ? 'Đang xử lý...' : 'Xác nhận rời dòng họ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyClans;
