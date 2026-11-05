
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useClanContext } from '../../context/ClanContext';
import type { FamilyLinkRequest, InterClanLinkItem, FamilyNetwork, PersonMappingItem, InterClanSharedPolicyItem, SharedTreeResponse } from '../../types/network';
import {
  fetchLinkRequests,
  fetchInterClanLinks,
  sendLinkRequest,
  reviewLinkRequest,
  terminateInterClanLink,
  fetchFamilyNetwork,
  fetchPersonMappings,
  createPersonMapping,
  reviewPersonMapping,
  revokePersonMapping,
  fetchSharingPolicies,
  updateSharingPolicy,
  fetchSharedTree,
} from '../../services/network.service';
import { fetchMembers } from '../../services/member.service';
import type { MemberItem } from '../../types/member';
import './ClanNetworkManagement.css';
import { NetworkTopologyDiagram } from './NetworkTopologyDiagram';
import { HybridTreeView } from './HybridTreeView';

interface ClanNetworkManagementProps {
  clanId?: string;
}

export const ClanNetworkManagement: React.FC<ClanNetworkManagementProps> = ({ clanId }) => {
  const { account } = useAuth();
  const { activeClanId, activeClanName } = useClanContext();
  const effectiveClanId = clanId || activeClanId || '';

  const [activeTab, setActiveTab] = useState<'links' | 'incoming' | 'outgoing' | 'diagram'>('links');
  const [viewingHybridLinkId, setViewingHybridLinkId] = useState<string | null>(null);
  const [links, setLinks] = useState<InterClanLinkItem[]>([]);
  const [requests, setRequests] = useState<FamilyLinkRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Available target clans
  const [availableClans, setAvailableClans] = useState<FamilyNetwork[]>([]);

  // Source clan members
  const [sourceMembers, setSourceMembers] = useState<MemberItem[]>([]);

  // Create Request Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [targetClanId, setTargetClanId] = useState('');
  const [connectionType, setConnectionType] = useState<'IN_LAW' | 'ANCESTRAL' | 'ALLIED'>('IN_LAW');
  const [sourcePersonId, setSourcePersonId] = useState('');
  const [targetPersonId, setTargetPersonId] = useState('');
  const [message, setMessage] = useState('');
  const [targetClanMembers, setTargetClanMembers] = useState<MemberItem[]>([]);
  const [loadingTargetMembers, setLoadingTargetMembers] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Terminate Link Modal State
  const [terminatingLink, setTerminatingLink] = useState<InterClanLinkItem | null>(null);
  const [terminateReason, setTerminateReason] = useState('');
  const [submittingTerminate, setSubmittingTerminate] = useState(false);

  // Reviewing Request State
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // ==========================================
  // GIAI ĐOẠN 2: PERSON MAPPINGS STATE
  // ==========================================
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [mappingsByLink, setMappingsByLink] = useState<Record<string, PersonMappingItem[]>>({});
  const [loadingMappings, setLoadingMappings] = useState<Record<string, boolean>>({});

  // Add Mapping Modal State
  const [mappingModalLink, setMappingModalLink] = useState<InterClanLinkItem | null>(null);
  const [mappingSourcePersonId, setMappingSourcePersonId] = useState('');
  const [mappingTargetPersonId, setMappingTargetPersonId] = useState('');
  const [mappingPartnerMembers, setMappingPartnerMembers] = useState<MemberItem[]>([]);
  const [loadingPartnerMembers, setLoadingPartnerMembers] = useState(false);
  const [mappingNotes, setMappingNotes] = useState('');
  const [submittingMapping, setSubmittingMapping] = useState(false);

  // Revoke Mapping Modal State
  const [revokingMapping, setRevokingMapping] = useState<PersonMappingItem | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [submittingRevoke, setSubmittingRevoke] = useState(false);

  // ==========================================
  // GIAI ĐOẠN 3: DATA SHARING POLICY STATE
  // ==========================================
  const [policyModalLink, setPolicyModalLink] = useState<InterClanLinkItem | null>(null);
  const [policySubTab, setPolicySubTab] = useState<'mine' | 'partner' | 'preview'>('mine');
  const [myPolicy, setMyPolicy] = useState<InterClanSharedPolicyItem | null>(null);
  const [partnerPolicy, setPartnerPolicy] = useState<InterClanSharedPolicyItem | null>(null);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Policy Form State
  const [policyScope, setPolicyScope] = useState<'BASIC' | 'EXTENDED' | 'FULL'>('BASIC');
  const [policyAllowedFields, setPolicyAllowedFields] = useState<Record<string, boolean>>({
    full_name: true,
    gender: true,
    generation: true,
    avatar_url: true,
    branch_id: false,
    birth_date: false,
    death_date: false,
    bio: false,
    burial_location: false,
    living_persons: false,
  });
  const [policyCanExport, setPolicyCanExport] = useState(false);

  // Shared Tree Preview State
  const [previewTree, setPreviewTree] = useState<SharedTreeResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handleOpenPolicyModal = async (link: InterClanLinkItem) => {
    setPolicyModalLink(link);
    setPolicySubTab('mine');
    setLoadingPolicies(true);
    setPreviewTree(null);

    try {
      const policies = await fetchSharingPolicies(link.id);
      const isClanA = link.clanAId.toLowerCase() === effectiveClanId.toLowerCase();
      const myClanId = isClanA ? link.clanAId : link.clanBId;
      const partnerClanId = isClanA ? link.clanBId : link.clanAId;

      const mine = policies.find((p) => p.ownerClanId.toLowerCase() === myClanId.toLowerCase()) || null;
      const partner = policies.find((p) => p.ownerClanId.toLowerCase() === partnerClanId.toLowerCase()) || null;

      setMyPolicy(mine);
      setPartnerPolicy(partner);

      if (mine) {
        const scope = (mine.dataScope || 'BASIC').toUpperCase() as 'BASIC' | 'EXTENDED' | 'FULL';
        setPolicyScope(scope);
        setPolicyAllowedFields({
          full_name: true,
          gender: mine.allowedFields?.gender ?? true,
          generation: mine.allowedFields?.generation ?? true,
          avatar_url: mine.allowedFields?.avatar_url ?? true,
          branch_id: mine.allowedFields?.branch_id ?? false,
          birth_date: mine.allowedFields?.birth_date ?? false,
          death_date: mine.allowedFields?.death_date ?? false,
          bio: mine.allowedFields?.bio ?? false,
          burial_location: mine.allowedFields?.burial_location ?? false,
          living_persons: mine.allowedFields?.living_persons ?? false,
        });
        setPolicyCanExport(Boolean(mine.canExport));
      } else {
        setPolicyScope('BASIC');
        setPolicyAllowedFields({
          full_name: true,
          gender: true,
          generation: true,
          avatar_url: true,
          branch_id: false,
          birth_date: false,
          death_date: false,
          bio: false,
          burial_location: false,
          living_persons: false,
        });
        setPolicyCanExport(false);
      }
    } catch (err) {
      console.error('Failed to load sharing policies:', err);
      showToast('Khong the tai chinh sach chia se du lieu', 'error');
    } finally {
      setLoadingPolicies(false);
    }
  };

  const handleSelectScope = (scope: 'BASIC' | 'EXTENDED' | 'FULL') => {
    setPolicyScope(scope);
    if (scope === 'BASIC') {
      setPolicyAllowedFields({
        full_name: true,
        gender: true,
        generation: true,
        avatar_url: true,
        branch_id: false,
        birth_date: false,
        death_date: false,
        bio: false,
        burial_location: false,
        living_persons: false,
      });
    } else if (scope === 'EXTENDED') {
      setPolicyAllowedFields({
        full_name: true,
        gender: true,
        generation: true,
        avatar_url: true,
        branch_id: true,
        birth_date: true,
        death_date: true,
        bio: false,
        burial_location: false,
        living_persons: false,
      });
    } else if (scope === 'FULL') {
      setPolicyAllowedFields({
        full_name: true,
        gender: true,
        generation: true,
        avatar_url: true,
        branch_id: true,
        birth_date: true,
        death_date: true,
        bio: true,
        burial_location: true,
        living_persons: true,
      });
    }
  };

  const handleToggleField = (key: string) => {
    if (key === 'full_name') return;
    setPolicyAllowedFields((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSavePolicySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyModalLink) return;

    try {
      setSavingPolicy(true);
      await updateSharingPolicy(policyModalLink.id, {
        dataScope: policyScope,
        allowedFields: policyAllowedFields,
        canExport: policyCanExport,
        ownerClanId: effectiveClanId,
      });

      showToast('Da luu chinh sach chia se du lieu thanh cong', 'success');
      const updatedPolicies = await fetchSharingPolicies(policyModalLink.id);
      const isClanA = policyModalLink.clanAId.toLowerCase() === effectiveClanId.toLowerCase();
      const myClanId = isClanA ? policyModalLink.clanAId : policyModalLink.clanBId;
      const mine = updatedPolicies.find((p) => p.ownerClanId.toLowerCase() === myClanId.toLowerCase()) || null;
      setMyPolicy(mine);
    } catch (err: any) {
      console.error('Failed to update sharing policy:', err);
      const msg = err.response?.data?.detail || 'Loi khi cap nhat chinh sach chia se';
      showToast(msg, 'error');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleLoadSharedTreePreview = async () => {
    if (!policyModalLink) return;
    const isClanA = policyModalLink.clanAId.toLowerCase() === effectiveClanId.toLowerCase();
    const partnerClanId = isClanA ? policyModalLink.clanBId : policyModalLink.clanAId;

    try {
      setLoadingPreview(true);
      const treeData = await fetchSharedTree(partnerClanId);
      setPreviewTree(treeData);
    } catch (err: any) {
      console.error('Failed to load shared tree preview:', err);
      const msg = err.response?.data?.detail || 'Khong the tai cay gia pha chia se';
      showToast(msg, 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    if (!effectiveClanId) return;
    try {
      setLoading(true);
      const [reqsData, linksData] = await Promise.all([
        fetchLinkRequests(),
        fetchInterClanLinks('ACTIVE'),
      ]);
      setRequests(reqsData || []);
      setLinks(linksData || []);
    } catch (err) {
      console.error('Failed to load network data:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveClanId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load available clans & source clan members once
  useEffect(() => {
    if (!effectiveClanId) return;
    fetchFamilyNetwork('all').then((clans) => {
      setAvailableClans(clans.filter((c) => c.id.toLowerCase() !== effectiveClanId.toLowerCase()));
    }).catch(console.error);

    fetchMembers({ familyId: effectiveClanId, limit: 1000 }).then((res) => {
      setSourceMembers(res.items || []);
    }).catch(console.error);
  }, [effectiveClanId]);

  // When target clan changes in Create Modal, load its members for IN_LAW selection
  useEffect(() => {
    if (!targetClanId || connectionType !== 'IN_LAW') {
      setTargetClanMembers([]);
      setTargetPersonId('');
      return;
    }
    setLoadingTargetMembers(true);
    fetchMembers({ familyId: targetClanId, limit: 1000 })
      .then((res) => {
        setTargetClanMembers(res.items || []);
      })
      .catch((err) => {
        console.error('Lỗi tải thành viên dòng họ đối tác:', err);
        setTargetClanMembers([]);
      })
      .finally(() => {
        setLoadingTargetMembers(false);
      });
  }, [targetClanId, connectionType]);

  // Load Person Mappings for expanded link
  const loadLinkMappings = useCallback(async (linkId: string) => {
    try {
      setLoadingMappings((prev) => ({ ...prev, [linkId]: true }));
      const items = await fetchPersonMappings(linkId);
      setMappingsByLink((prev) => ({ ...prev, [linkId]: items }));
    } catch (err) {
      console.error('Lỗi tải danh sách ánh xạ Person:', err);
    } finally {
      setLoadingMappings((prev) => ({ ...prev, [linkId]: false }));
    }
  }, []);

  const handleToggleExpandLink = (linkId: string) => {
    if (expandedLinkId === linkId) {
      setExpandedLinkId(null);
    } else {
      setExpandedLinkId(linkId);
      loadLinkMappings(linkId);
    }
  };

  // Open modal to add a new person mapping
  const handleOpenAddMapping = (link: InterClanLinkItem) => {
    const isClanA = link.clanAId.toLowerCase() === effectiveClanId.toLowerCase();
    const partnerClanId = isClanA ? link.clanBId : link.clanAId;

    setMappingModalLink(link);
    setMappingSourcePersonId('');
    setMappingTargetPersonId('');
    setMappingNotes('');
    setMappingPartnerMembers([]);

    setLoadingPartnerMembers(true);
    fetchMembers({ familyId: partnerClanId, limit: 1000 })
      .then((res) => {
        setMappingPartnerMembers(res.items || []);
      })
      .catch((err) => {
        console.error('Lỗi tải thành viên họ đối tác:', err);
        setMappingPartnerMembers([]);
      })
      .finally(() => {
        setLoadingPartnerMembers(false);
      });
  };

  const handleCreateMappingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mappingModalLink || !mappingSourcePersonId || !mappingTargetPersonId) {
      showToast('Vui lòng chọn đầy đủ cặp thành viên thông gia hai bên.', 'error');
      return;
    }
    try {
      setSubmittingMapping(true);
      await createPersonMapping(mappingModalLink.id, {
        sourcePersonId: mappingSourcePersonId,
        targetPersonId: mappingTargetPersonId,
        relationshipType: 'SPOUSE',
        notes: mappingNotes.trim() || undefined,
      });
      showToast('Đã gửi đề xuất xác minh cặp thông gia sang Trưởng tộc đối tác!');
      setMappingModalLink(null);
      loadLinkMappings(mappingModalLink.id);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Lỗi khi gửi yêu cầu xác minh cặp thông gia.', 'error');
    } finally {
      setSubmittingMapping(false);
    }
  };

  const handleReviewMapping = async (mapping: PersonMappingItem, action: 'VERIFY' | 'REJECT') => {
    try {
      await reviewPersonMapping(mapping.id, action);
      showToast(action === 'VERIFY' ? 'Đã xác nhận chính danh cặp thành viên thông gia!' : 'Đã từ chối đề xuất thông gia.');
      loadLinkMappings(mapping.linkId);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Lỗi khi phê duyệt xác minh.', 'error');
    }
  };

  const handleRevokeMappingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokingMapping) return;
    try {
      setSubmittingRevoke(true);
      await revokePersonMapping(revokingMapping.id, revokeReason.trim() || undefined);
      showToast('Đã thu hồi liên kết cặp Person thông gia này.');
      loadLinkMappings(revokingMapping.linkId);
      setRevokingMapping(null);
      setRevokeReason('');
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Lỗi khi thu hồi liên kết.', 'error');
    } finally {
      setSubmittingRevoke(false);
    }
  };

  const handleOpenCreateModal = () => {
    setTargetClanId('');
    setConnectionType('IN_LAW');
    setSourcePersonId('');
    setTargetPersonId('');
    setMessage('');
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClanId) {
      showToast('Vui lòng chọn dòng họ muốn kết nối.', 'error');
      return;
    }
    if (connectionType === 'IN_LAW' && (!sourcePersonId || !targetPersonId)) {
      showToast('Liên kết thông gia (IN_LAW) bắt buộc chọn cặp thành viên kết hôn.', 'error');
      return;
    }

    try {
      setSubmittingCreate(true);
      await sendLinkRequest({
        targetFamilyId: targetClanId,
        sourceFamilyId: effectiveClanId,
        connectionType,
        sourcePersonId: connectionType === 'IN_LAW' ? sourcePersonId : null,
        targetPersonId: connectionType === 'IN_LAW' ? targetPersonId : null,
        message: message.trim() || undefined,
      });

      showToast('Đã gửi yêu cầu liên họ thành công. Vui lòng chờ Trưởng tộc đối tác duyệt.');
      setIsCreateModalOpen(false);
      loadData();
      setActiveTab('outgoing');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Lỗi khi gửi yêu cầu liên họ.';
      showToast(msg, 'error');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleReview = async (requestId: string, action: 'APPROVE' | 'REJECT') => {
    setReviewingId(requestId);
    try {
      await reviewLinkRequest(requestId, action);
      showToast(action === 'APPROVE' ? 'Đã chấp thuận yêu cầu liên họ thành công!' : 'Đã từ chối yêu cầu liên họ.');
      loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Lỗi khi xử lý yêu cầu.';
      showToast(msg, 'error');
    } finally {
      setReviewingId(null);
    }
  };

  const handleOpenTerminateModal = (link: InterClanLinkItem) => {
    setTerminatingLink(link);
    setTerminateReason('');
  };

  const handleTerminateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminatingLink) return;
    try {
      setSubmittingTerminate(true);
      await terminateInterClanLink(terminatingLink.id, terminateReason.trim() || undefined);
      showToast('Đã hủy liên kết liên họ. Quyền truy cập phả hệ chung đã được thu hồi ngay lập tức.');
      setTerminatingLink(null);
      loadData();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Lỗi khi hủy liên kết.';
      showToast(msg, 'error');
    } finally {
      setSubmittingTerminate(false);
    }
  };

  const incomingRequests = requests.filter(
    (r) => r.targetFamilyId.toLowerCase() === effectiveClanId.toLowerCase()
  );
  const outgoingRequests = requests.filter(
    (r) => r.sourceFamilyId.toLowerCase() === effectiveClanId.toLowerCase()
  );
  const pendingIncomingCount = incomingRequests.filter((r) => r.status === 'PENDING').length;

  const renderTypeTag = (type?: string) => {
    const t = (type || 'IN_LAW').toUpperCase();
    if (t === 'IN_LAW') return <span className="cnm-tag cnm-tag-inlaw">Thông gia (Hôn phối)</span>;
    if (t === 'ANCESTRAL') return <span className="cnm-tag cnm-tag-ancestral">Cùng tổ tiên (Chi phái)</span>;
    return <span className="cnm-tag cnm-tag-allied">Liên kết hợp tác (Giao hảo)</span>;
  };

  return (
    <div className="cnm-container">
      {toast && (
        <div style={{
          padding: '12px 20px',
          background: toast.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          color: toast.type === 'error' ? '#991b1b' : '#166534',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 600,
        }}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="cnm-header-card">
        <div>
          <h2 className="cnm-title">Quản lý Liên kết Mạng lưới Liên họ</h2>
          <p className="cnm-subtitle">
            Cơ chế xác thực hai chiều giữa hai Trưởng tộc để chia sẻ phả hệ thông gia và xác minh cặp Person chính danh
          </p>
        </div>

        <button type="button" className="cnm-add-btn" onClick={handleOpenCreateModal}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Gửi yêu cầu liên họ mới
        </button>
      </div>

      {/* Tabs */}
      <div className="cnm-tabs-bar">
        <button
          type="button"
          className={`cnm-tab-btn ${activeTab === 'links' ? 'active' : ''}`}
          onClick={() => setActiveTab('links')}
        >
          Liên kết đang hoạt động
          <span className="cnm-badge cnm-badge-primary">{links.length}</span>
        </button>

        <button
          type="button"
          className={`cnm-tab-btn ${activeTab === 'incoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('incoming')}
        >
          Yêu cầu nhận được
          {pendingIncomingCount > 0 ? (
            <span className="cnm-badge cnm-badge-danger">{pendingIncomingCount}</span>
          ) : (
            <span className="cnm-badge cnm-badge-primary">{incomingRequests.length}</span>
          )}
        </button>

        <button
          type="button"
          className={`cnm-tab-btn ${activeTab === 'outgoing' ? 'active' : ''}`}
          onClick={() => setActiveTab('outgoing')}
        >
          Yêu cầu đã gửi
          <span className="cnm-badge cnm-badge-primary">{outgoingRequests.length}</span>
        </button>

        <button
          type="button"
          className={`cnm-tab-btn ${activeTab === 'diagram' ? 'active' : ''}`}
          onClick={() => setActiveTab('diagram')}
        >
          Sơ đồ mạng lưới liên tộc
          <span className="cnm-badge cnm-badge-primary">{links.length}</span>
        </button>
      </div>

      {/* Tab 1: Active Links */}
      {activeTab === 'links' && (
        <div className="cnm-content-card">
          <div className="cnm-table-wrap">
            <table className="cnm-table">
              <thead>
                <tr>
                  <th>Dòng họ đối tác</th>
                  <th>Loại liên kết</th>
                  <th>Ngày kích hoạt</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {links.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      Chưa có liên kết liên họ nào đang hoạt động. Hãy bấm "Gửi yêu cầu liên họ mới" để kết nối với dòng tộc đối tác.
                    </td>
                  </tr>
                ) : (
                  links.map((link) => {
                    const isClanA = link.clanAId.toLowerCase() === effectiveClanId.toLowerCase();
                    const partnerName = isClanA ? link.clanBName : link.clanAName;
                    const isExpanded = expandedLinkId === link.id;
                    const mappings = mappingsByLink[link.id] || [];
                    const isLoadingMappings = loadingMappings[link.id];

                    return (
                      <React.Fragment key={link.id}>
                        <tr>
                          <td>
                            <strong>{partnerName}</strong>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              {isClanA ? `Mã: ${link.clanBId.substring(0, 8)}...` : `Mã: ${link.clanAId.substring(0, 8)}...`}
                            </div>
                          </td>
                          <td>{renderTypeTag(link.connectionType)}</td>
                          <td>{new Date(link.linkedAt).toLocaleDateString('vi-VN')}</td>
                          <td><span className="cnm-status-active">Đang hoạt động</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px' }}>
                              {link.connectionType === 'IN_LAW' && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleExpandLink(link.id)}
                                  style={{
                                    background: isExpanded ? '#dbeafe' : '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    color: '#1e40af',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12.5px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isExpanded ? 'Đóng cặp thông gia' : 'Xem cặp thông gia'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewingHybridLinkId(link.id)}
                                style={{
                                  background: '#f5f3ff',
                                  border: '1px solid #ddd6fe',
                                  color: '#6d28d9',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '12.5px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="5" r="3" />
                                  <circle cx="5" cy="19" r="3" />
                                  <circle cx="19" cy="19" r="3" />
                                  <path d="M5 16l7-8 7 8" />
                                </svg>
                                Xem cay lien ho
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenPolicyModal(link)}
                                style={{
                                  background: '#f0fdf4',
                                  border: '1px solid #bbf7d0',
                                  color: '#15803d',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '12.5px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Chinh sach chia se
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenTerminateModal(link)}
                                style={{
                                  background: '#fff1f2',
                                  border: '1px solid #fecdd3',
                                  color: '#e11d48',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '12.5px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Hủy liên kết
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Giai đoạn 2: Expandable Person Mappings Panel */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} style={{ padding: 0, background: '#f8fafc' }}>
                              <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                      <circle cx="8.5" cy="7" r="4" />
                                      <line x1="20" y1="8" x2="20" y2="14" />
                                      <line x1="23" y1="11" x2="17" y2="11" />
                                    </svg>
                                    <strong style={{ fontSize: '14.5px', color: '#0f172a' }}>
                                      Cặp Person Thông gia Xác minh giữa hai dòng tộc ({mappings.length})
                                    </strong>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenAddMapping(link)}
                                    style={{
                                      background: '#2563eb',
                                      color: '#ffffff',
                                      border: 'none',
                                      padding: '6px 14px',
                                      borderRadius: '6px',
                                      fontSize: '12.5px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    + Thêm cặp thông gia xác minh
                                  </button>
                                </div>

                                {isLoadingMappings ? (
                                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                                    Đang tải danh sách cặp thông gia...
                                  </div>
                                ) : mappings.length === 0 ? (
                                  <div style={{
                                    background: '#ffffff',
                                    border: '1px dashed #cbd5e1',
                                    borderRadius: '8px',
                                    padding: '24px',
                                    textAlign: 'center',
                                    color: '#64748b',
                                    fontSize: '13.5px',
                                  }}>
                                    Chưa có cặp Person thông gia nào được xác minh giữa hai dòng họ. Bấm "+ Thêm cặp thông gia xác minh" để liên kết hồ sơ cô dâu / chú rể.
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {mappings.map((m) => {
                                      const isRequestedByMe = m.requestedClanId.toLowerCase() === effectiveClanId.toLowerCase();
                                      const pAName = m.personAName;
                                      const pBName = m.personBName;

                                      return (
                                        <div
                                          key={m.id}
                                          style={{
                                            background: '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                          }}
                                        >
                                          {/* Person Pair Display */}
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                              padding: '4px 10px',
                                              background: m.personAGender === 'male' ? '#eff6ff' : '#fdf2f8',
                                              color: m.personAGender === 'male' ? '#1d4ed8' : '#be185d',
                                              borderRadius: '6px',
                                              fontWeight: 600,
                                              fontSize: '13px',
                                            }}>
                                              {pAName} ({m.clanAName})
                                            </div>

                                            <span style={{ color: '#94a3b8', fontWeight: 700 }}>⟷ (Vợ/Chồng) ⟷</span>

                                            <div style={{
                                              padding: '4px 10px',
                                              background: m.personBGender === 'male' ? '#eff6ff' : '#fdf2f8',
                                              color: m.personBGender === 'male' ? '#1d4ed8' : '#be185d',
                                              borderRadius: '6px',
                                              fontWeight: 600,
                                              fontSize: '13px',
                                            }}>
                                              {pBName} ({m.clanBName})
                                            </div>
                                          </div>

                                          {/* Status & Review Actions */}
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {m.status === 'VERIFIED' && (
                                              <span style={{
                                                background: '#f0fdf4',
                                                border: '1px solid #bbf7d0',
                                                color: '#166534',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                              }}>
                                                Đã xác minh chính danh
                                              </span>
                                            )}

                                            {m.status === 'PENDING' && (
                                              isRequestedByMe ? (
                                                <span style={{
                                                  background: '#fffbeb',
                                                  border: '1px solid #fde68a',
                                                  color: '#b45309',
                                                  padding: '3px 8px',
                                                  borderRadius: '6px',
                                                  fontSize: '12px',
                                                  fontWeight: 700,
                                                }}>
                                                  Chờ Trưởng tộc họ bạn xác nhận
                                                </span>
                                              ) : (
                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleReviewMapping(m, 'VERIFY')}
                                                    style={{
                                                      background: '#16a34a',
                                                      color: '#ffffff',
                                                      border: 'none',
                                                      padding: '5px 10px',
                                                      borderRadius: '6px',
                                                      fontSize: '12px',
                                                      fontWeight: 600,
                                                      cursor: 'pointer',
                                                    }}
                                                  >
                                                    Xác nhận chính danh
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleReviewMapping(m, 'REJECT')}
                                                    style={{
                                                      background: '#ffffff',
                                                      border: '1px solid #cbd5e1',
                                                      color: '#dc2626',
                                                      padding: '5px 10px',
                                                      borderRadius: '6px',
                                                      fontSize: '12px',
                                                      fontWeight: 600,
                                                      cursor: 'pointer',
                                                    }}
                                                  >
                                                    Từ chối
                                                  </button>
                                                </div>
                                              )
                                            )}

                                            {m.status === 'REJECTED' && (
                                              <span style={{
                                                background: '#fef2f2',
                                                border: '1px solid #fecaca',
                                                color: '#991b1b',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                              }}>
                                                Đã từ chối xác minh
                                              </span>
                                            )}

                                            {m.status === 'REVOKED' && (
                                              <span style={{
                                                background: '#f1f5f9',
                                                color: '#64748b',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                fontWeight: 600,
                                              }}>
                                                Đã thu hồi liên kết
                                              </span>
                                            )}

                                            {/* Action to revoke verified pair */}
                                            {m.status === 'VERIFIED' && (
                                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                <button
                                                  type="button"
                                                  onClick={() => setViewingHybridLinkId(link.id)}
                                                  style={{
                                                    background: '#f5f3ff',
                                                    border: '1px solid #ddd6fe',
                                                    color: '#6d28d9',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '11.5px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                  }}
                                                >
                                                  Xem cay lien ho
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => { setRevokingMapping(m); setRevokeReason(''); }}
                                                  style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#dc2626',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    textDecoration: 'underline',
                                                  }}
                                                >
                                                  Hủy liên kết
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Incoming Requests */}
      {activeTab === 'incoming' && (
        <div className="cnm-content-card">
          <div className="cnm-table-wrap">
            <table className="cnm-table">
              <thead>
                <tr>
                  <th>Dòng họ gửi</th>
                  <th>Loại liên kết</th>
                  <th>Cặp thành viên thông gia</th>
                  <th>Lời nhắn</th>
                  <th>Ngày gửi</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {incomingRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      Không có yêu cầu liên họ nào gửi đến dòng tộc của bạn.
                    </td>
                  </tr>
                ) : (
                  incomingRequests.map((req) => (
                    <tr key={req.id}>
                      <td><strong>{req.sourceFamilyName}</strong></td>
                      <td>{renderTypeTag(req.connectionType)}</td>
                      <td>
                        {req.connectionType === 'IN_LAW' ? (
                          <div style={{ fontSize: '13px' }}>
                            <span style={{ color: '#2563eb', fontWeight: 600 }}>{req.sourcePersonName || 'Thành viên nguồn'}</span>
                            <span style={{ color: '#94a3b8', margin: '0 6px' }}>⟷</span>
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>{req.targetPersonName || 'Thành viên đích'}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Toàn tộc</span>
                        )}
                      </td>
                      <td style={{ maxWidth: '200px' }}>{req.message || '—'}</td>
                      <td>{req.createdAt ? new Date(req.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
                      <td>
                        {req.status === 'PENDING' && <span className="cnm-status-pending">Chờ bạn duyệt</span>}
                        {req.status === 'APPROVED' && <span className="cnm-status-active">Đã chấp thuận</span>}
                        {req.status === 'REJECTED' && <span className="cnm-status-rejected">Đã từ chối</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {req.status === 'PENDING' && (
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button
                              type="button"
                              disabled={reviewingId === req.id}
                              onClick={() => handleReview(req.id, 'APPROVE')}
                              style={{
                                background: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Chấp thuận
                            </button>
                            <button
                              type="button"
                              disabled={reviewingId === req.id}
                              onClick={() => handleReview(req.id, 'REJECT')}
                              style={{
                                background: '#ffffff',
                                border: '1px solid #cbd5e1',
                                color: '#dc2626',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Từ chối
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Outgoing Requests */}
      {activeTab === 'outgoing' && (
        <div className="cnm-content-card">
          <div className="cnm-table-wrap">
            <table className="cnm-table">
              <thead>
                <tr>
                  <th>Dòng họ nhận</th>
                  <th>Loại liên kết</th>
                  <th>Cặp thành viên thông gia</th>
                  <th>Lời nhắn</th>
                  <th>Ngày gửi</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {outgoingRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      Bạn chưa gửi yêu cầu liên họ nào.
                    </td>
                  </tr>
                ) : (
                  outgoingRequests.map((req) => (
                    <tr key={req.id}>
                      <td><strong>{req.targetFamilyName}</strong></td>
                      <td>{renderTypeTag(req.connectionType)}</td>
                      <td>
                        {req.connectionType === 'IN_LAW' ? (
                          <div style={{ fontSize: '13px' }}>
                            <span style={{ color: '#2563eb', fontWeight: 600 }}>{req.sourcePersonName || 'Thành viên nguồn'}</span>
                            <span style={{ color: '#94a3b8', margin: '0 6px' }}>⟷</span>
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>{req.targetPersonName || 'Thành viên đích'}</span>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Toàn tộc</span>
                        )}
                      </td>
                      <td style={{ maxWidth: '200px' }}>{req.message || '—'}</td>
                      <td>{req.createdAt ? new Date(req.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
                      <td>
                        {req.status === 'PENDING' && <span className="cnm-status-pending">Chờ họ duyệt</span>}
                        {req.status === 'APPROVED' && <span className="cnm-status-active">Đã chấp thuận</span>}
                        {req.status === 'REJECTED' && <span className="cnm-status-rejected">Bị từ chối</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Network Topology Diagram */}
      {activeTab === 'diagram' && (
        <NetworkTopologyDiagram
          clanId={effectiveClanId}
          onOpenHybridTree={(linkId) => setViewingHybridLinkId(linkId)}
          onOpenPolicyModal={(linkId) => {
            const l = links.find((x) => x.id === linkId);
            if (l) handleOpenPolicyModal(l);
          }}
          onOpenPersonMappings={(linkId) => {
            setActiveTab('links');
            handleToggleExpandLink(linkId);
          }}
        />
      )}

      {/* Create Request Modal */}
      {isCreateModalOpen && (
        <div className="cnm-modal-backdrop">
          <div className="cnm-modal-card">
            <div className="cnm-modal-header">
              <h3>Gửi yêu cầu liên họ mới</h3>
              <button type="button" className="cnm-modal-close" onClick={() => setIsCreateModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="cnm-modal-body">
                <div className="cnm-form-group">
                  <label>Chọn dòng họ đối tác *</label>
                  <select
                    className="cnm-select"
                    value={targetClanId}
                    onChange={(e) => setTargetClanId(e.target.value)}
                    required
                  >
                    <option value="">-- Chọn dòng họ trong hệ thống --</option>
                    {availableClans.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.originPlace ? `(${c.originPlace})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cnm-form-group">
                  <label>Loại liên kết dòng họ *</label>
                  <select
                    className="cnm-select"
                    value={connectionType}
                    onChange={(e) => setConnectionType(e.target.value as any)}
                  >
                    <option value="IN_LAW">Thông gia (Có quan hệ hôn nhân giữa hai họ)</option>
                    <option value="ANCESTRAL">Cùng tổ tiên (Chi phái cùng nguồn cội)</option>
                    <option value="ALLIED">Liên kết hợp tác (Giao hảo, tương trợ)</option>
                  </select>
                </div>

                {connectionType === 'IN_LAW' && (
                  <div style={{
                    background: '#f8fafc',
                    padding: '14px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}>
                    <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                      Xác định cặp Person thông gia kết nối hai dòng họ *
                    </strong>

                    <div className="cnm-form-group">
                      <label>1. Thành viên thuộc dòng họ của bạn ({activeClanName || 'Họ nguồn'}):</label>
                      <select
                        className="cnm-select"
                        value={sourcePersonId}
                        onChange={(e) => setSourcePersonId(e.target.value)}
                        required
                      >
                        <option value="">-- Chọn thành viên --</option>
                        {sourceMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fullName} ({m.gender === 'male' ? 'Nam' : 'Nữ'}, Đời {m.generation})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="cnm-form-group">
                      <label>2. Thành viên thuộc dòng họ đối tác:</label>
                      {loadingTargetMembers ? (
                        <div style={{ fontSize: '13px', color: '#64748b' }}>Đang tải danh sách thành viên đối tác...</div>
                      ) : (
                        <select
                          className="cnm-select"
                          value={targetPersonId}
                          onChange={(e) => setTargetPersonId(e.target.value)}
                          required
                          disabled={!targetClanId}
                        >
                          <option value="">-- Chọn thành viên đối tác --</option>
                          {targetClanMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.fullName} ({m.gender === 'male' ? 'Nam' : 'Nữ'}, Đời {m.generation})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )}

                <div className="cnm-form-group">
                  <label>Lời nhắn gửi Trưởng tộc đối tác (Tùy chọn):</label>
                  <textarea
                    className="cnm-textarea"
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ví dụ: Kính gửi Trưởng tộc quý họ, hai dòng họ chúng ta có quan hệ thông gia gắn bó lâu đời..."
                  />
                </div>
              </div>

              <div className="cnm-modal-footer">
                <button type="button" className="cnm-btn-secondary" onClick={() => setIsCreateModalOpen(false)}>
                  Hủy
                </button>
                <button type="submit" className="cnm-btn-primary" disabled={submittingCreate}>
                  {submittingCreate ? 'Đang gửi...' : 'Gửi yêu cầu liên họ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add marriage pair for verification (Giai đoạn 2) */}
      {mappingModalLink && (
        <div className="cnm-modal-backdrop">
          <div className="cnm-modal-card">
            <div className="cnm-modal-header">
              <h3>Đề xuất xác minh cặp Person thông gia</h3>
              <button type="button" className="cnm-modal-close" onClick={() => setMappingModalLink(null)}>✕</button>
            </div>
            <form onSubmit={handleCreateMappingSubmit}>
              <div className="cnm-modal-body">
                <p style={{ margin: 0, fontSize: '13.5px', color: '#475569' }}>
                  Thiết lập ánh xạ chính danh giữa một thành viên thuộc dòng họ của bạn với một thành viên thuộc dòng họ đối tác.
                  Hồ sơ chỉ có hiệu lực sau khi Trưởng tộc đối tác xác nhận.
                </p>

                <div className="cnm-form-group">
                  <label>1. Thành viên thuộc dòng họ của bạn ({activeClanName || 'Họ nguồn'}) *</label>
                  <select
                    className="cnm-select"
                    value={mappingSourcePersonId}
                    onChange={(e) => setMappingSourcePersonId(e.target.value)}
                    required
                  >
                    <option value="">-- Chọn thành viên --</option>
                    {sourceMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName} ({m.gender === 'male' ? 'Nam' : 'Nữ'}, Đời {m.generation})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="cnm-form-group">
                  <label>2. Thành viên thuộc dòng họ đối tác *</label>
                  {loadingPartnerMembers ? (
                    <div style={{ fontSize: '13px', color: '#64748b' }}>Đang tải danh sách thành viên đối tác...</div>
                  ) : (
                    <select
                      className="cnm-select"
                      value={mappingTargetPersonId}
                      onChange={(e) => setMappingTargetPersonId(e.target.value)}
                      required
                    >
                      <option value="">-- Chọn thành viên --</option>
                      {mappingPartnerMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName} ({m.gender === 'male' ? 'Nam' : 'Nữ'}, Đời {m.generation})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="cnm-form-group">
                  <label>Ghi chú hôn nhân / Đối chiếu (Tùy chọn):</label>
                  <textarea
                    className="cnm-textarea"
                    rows={2}
                    value={mappingNotes}
                    onChange={(e) => setMappingNotes(e.target.value)}
                    placeholder="Ví dụ: Đã kết hôn năm 1995, hiện sinh sống tại Thừa Thiên Huế..."
                  />
                </div>
              </div>

              <div className="cnm-modal-footer">
                <button type="button" className="cnm-btn-secondary" onClick={() => setMappingModalLink(null)}>
                  Hủy
                </button>
                <button type="submit" className="cnm-btn-primary" disabled={submittingMapping}>
                  {submittingMapping ? 'Đang gửi...' : 'Gửi đề xuất xác minh'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Revoke Person Mapping (Giai đoạn 2) */}
      {revokingMapping && (
        <div className="cnm-modal-backdrop">
          <div className="cnm-modal-card">
            <div className="cnm-modal-header">
              <h3 style={{ color: '#dc2626' }}>Thu hồi liên kết cặp Person thông gia</h3>
              <button type="button" className="cnm-modal-close" onClick={() => setRevokingMapping(null)}>✕</button>
            </div>
            <form onSubmit={handleRevokeMappingSubmit}>
              <div className="cnm-modal-body">
                <div className="cnm-alert-box">
                  Hành động này sẽ ngắt liên kết thông gia giữa hồ sơ <strong>{revokingMapping.personAName}</strong> và <strong>{revokingMapping.personBName}</strong>. Hồ sơ gốc của mỗi dòng họ vẫn được giữ nguyên vẹn.
                </div>

                <div className="cnm-form-group">
                  <label>Lý do thu hồi (Bắt buộc):</label>
                  <textarea
                    className="cnm-textarea"
                    rows={3}
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="Nhập lý do thu hồi liên kết này..."
                    required
                  />
                </div>
              </div>

              <div className="cnm-modal-footer">
                <button type="button" className="cnm-btn-secondary" onClick={() => setRevokingMapping(null)}>
                  Hủy
                </button>
                <button type="submit" className="cnm-btn-danger" disabled={submittingRevoke}>
                  {submittingRevoke ? 'Đang xử lý...' : 'Xác nhận thu hồi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminate Link Modal */}
      {terminatingLink && (
        <div className="cnm-modal-backdrop">
          <div className="cnm-modal-card">
            <div className="cnm-modal-header">
              <h3 style={{ color: '#dc2626' }}>Xác nhận hủy liên kết dòng tộc</h3>
              <button type="button" className="cnm-modal-close" onClick={() => setTerminatingLink(null)}>✕</button>
            </div>
            <form onSubmit={handleTerminateSubmit}>
              <div className="cnm-modal-body">
                <div className="cnm-alert-box">
                  Bạn đang chuẩn bị hủy liên kết liên họ với dòng họ{' '}
                  <strong>
                    {terminatingLink.clanAId.toLowerCase() === effectiveClanId.toLowerCase()
                      ? terminatingLink.clanBName
                      : terminatingLink.clanAName}
                  </strong>.
                  <br /><br />
                  Hệ thống sẽ ngay lập tức thu hồi toàn bộ quyền xem cây phả hệ chung giữa hai bên. Hồ sơ Person và cây gia phả riêng của mỗi dòng tộc vẫn được bảo toàn nguyên vẹn.
                </div>

                <div className="cnm-form-group">
                  <label>Lý do hủy liên kết (Bắt buộc):</label>
                  <textarea
                    className="cnm-textarea"
                    rows={3}
                    value={terminateReason}
                    onChange={(e) => setTerminateReason(e.target.value)}
                    placeholder="Nhập lý do hủy liên kết để lưu vết lịch sử quản trị..."
                    required
                  />
                </div>
              </div>

              <div className="cnm-modal-footer">
                <button type="button" className="cnm-btn-secondary" onClick={() => setTerminatingLink(null)}>
                  Quay lại
                </button>
                <button type="submit" className="cnm-btn-danger" disabled={submittingTerminate}>
                  {submittingTerminate ? 'Đang xử lý...' : 'Xác nhận hủy liên kết'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Giai doan 3: Data Sharing Policy Modal */}
      {policyModalLink && (
        <div className="cnm-modal-backdrop">
          <div className="cnm-modal-card cnm-modal-large">
            <div className="cnm-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a' }}>
                  Chinh sach chia se du lieu lien toc
                </h3>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  Lien ket voi dong ho{' '}
                  <strong>
                    {policyModalLink.clanAId.toLowerCase() === effectiveClanId.toLowerCase()
                      ? policyModalLink.clanBName
                      : policyModalLink.clanAName}
                  </strong>
                </div>
              </div>
              <button type="button" className="cnm-modal-close" onClick={() => setPolicyModalLink(null)}>
                X
              </button>
            </div>

            <div className="cnm-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {/* Subtabs: Mine vs Partner vs Preview */}
              <div className="cnm-policy-subtabs">
                <button
                  type="button"
                  className={`cnm-policy-subtab ${policySubTab === 'mine' ? 'active' : ''}`}
                  onClick={() => setPolicySubTab('mine')}
                >
                  Chinh sach cua dong ho toi
                </button>
                <button
                  type="button"
                  className={`cnm-policy-subtab ${policySubTab === 'partner' ? 'active' : ''}`}
                  onClick={() => setPolicySubTab('partner')}
                >
                  Chinh sach doi tac chia se
                </button>
                <button
                  type="button"
                  className={`cnm-policy-subtab ${policySubTab === 'preview' ? 'active' : ''}`}
                  onClick={() => {
                    setPolicySubTab('preview');
                    if (!previewTree) handleLoadSharedTreePreview();
                  }}
                >
                  Xem truoc cay chia se
                </button>
              </div>

              {loadingPolicies ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  Dang tai chinh sach chia se...
                </div>
              ) : (
                <>
                  {/* Tab 1: My Clan Policy (Editable) */}
                  {policySubTab === 'mine' && (
                    <form onSubmit={handleSavePolicySubmit}>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                          Pham vi chia se du lieu (Data Scope)
                        </label>
                        <div className="cnm-scope-grid">
                          <div
                            className={`cnm-scope-card ${policyScope === 'BASIC' ? 'active' : ''}`}
                            onClick={() => handleSelectScope('BASIC')}
                          >
                            <div className="cnm-scope-header">
                              <span className="cnm-scope-title">Co ban</span>
                              <span className="cnm-scope-badge">BASIC</span>
                            </div>
                            <span className="cnm-scope-desc">
                              Chi chia se ho ten, gioi tinh va doi cua nguoi da mat. Mac dinh an toan bo nguoi con song.
                            </span>
                          </div>

                          <div
                            className={`cnm-scope-card ${policyScope === 'EXTENDED' ? 'active' : ''}`}
                            onClick={() => handleSelectScope('EXTENDED')}
                          >
                            <div className="cnm-scope-header">
                              <span className="cnm-scope-title">Mo rong</span>
                              <span className="cnm-scope-badge">EXTENDED</span>
                            </div>
                            <span className="cnm-scope-desc">
                              Bo sung nam sinh, nam mat va chi nhanh cua nguoi da mat. Bao ve nguoi con song.
                            </span>
                          </div>

                          <div
                            className={`cnm-scope-card ${policyScope === 'FULL' ? 'active' : ''}`}
                            onClick={() => handleSelectScope('FULL')}
                          >
                            <div className="cnm-scope-header">
                              <span className="cnm-scope-title">Toan phan</span>
                              <span className="cnm-scope-badge">FULL</span>
                            </div>
                            <span className="cnm-scope-desc">
                              Bo sung tieu su, mo phan. Cho phep hien thi nguoi con song neu khong cai rieng tu ca nhan.
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Granular Field Toggles */}
                      <div className="cnm-fields-section">
                        <div className="cnm-fields-title">Cau hinh chi tiet truong du lieu chia se</div>
                        <div className="cnm-fields-grid">
                          <label className="cnm-field-toggle">
                            <input type="checkbox" checked={policyAllowedFields.full_name} disabled />
                            <span>Ho va ten (Bat buoc de nhan dien)</span>
                          </label>

                          <label className="cnm-field-toggle">
                            <input
                              type="checkbox"
                              checked={policyAllowedFields.gender}
                              onChange={() => handleToggleField('gender')}
                            />
                            <span>Gioi tinh</span>
                          </label>

                          <label className="cnm-field-toggle">
                            <input
                              type="checkbox"
                              checked={policyAllowedFields.generation}
                              onChange={() => handleToggleField('generation')}
                            />
                            <span>Thu tu doi (The he)</span>
                          </label>

                          <label className="cnm-field-toggle">
                            <input
                              type="checkbox"
                              checked={policyAllowedFields.avatar_url}
                              onChange={() => handleToggleField('avatar_url')}
                            />
                            <span>Anh dai dien</span>
                          </label>

                          <label className="cnm-field-toggle">
                            <input
                              type="checkbox"
                              checked={policyAllowedFields.branch_id}
                              onChange={() => handleToggleField('branch_id')}
                            />
                            <span>Chi phai / Phan nhanh</span>
                          </label>

                          <label className="cnm-field-toggle">
                            <input
                              type="checkbox"
                              checked={policyAllowedFields.birth_date}
                              onChange={() => handleToggleField('birth_date')}
                            />
                            <span>Ngay / Nam sinh</span>
                          </label>

                          <label className="cnm-field-toggle">
                            <input
                              type="checkbox"
                              checked={policyAllowedFields.death_date}
                              onChange={() => handleToggleField('death_date')}
                            />
                            <span>Ngay / Nam mat</span>
                          </label>

                          <label className="cnm-field-toggle">
                            <input
                              type="checkbox"
                              checked={policyAllowedFields.burial_location}
                              onChange={() => handleToggleField('burial_location')}
                            />
                            <span>Vi tri mo phan / Noi an tang</span>
                          </label>

                          <label className="cnm-field-toggle">
                            <input
                              type="checkbox"
                              checked={policyAllowedFields.bio}
                              onChange={() => handleToggleField('bio')}
                            />
                            <span>Tieu su / Ghi chu lich su</span>
                          </label>

                          <label className="cnm-field-toggle">
                            <input
                              type="checkbox"
                              checked={policyAllowedFields.living_persons}
                              onChange={() => handleToggleField('living_persons')}
                            />
                            <strong style={{ color: policyAllowedFields.living_persons ? '#1e40af' : '#475569' }}>
                              Cho phep xem nguoi con song
                            </strong>
                          </label>
                        </div>

                        {/* Privacy boundary callout */}
                        <div className="cnm-privacy-notice">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                          <div>
                            <strong>Nguyen tac bao mat rieng tu ca nhan:</strong> Cai dat rieng tu cua tung Person ca nhan (CLAN_ONLY / PRIVATE) khong bao gio bi chinh sach chung cua dong ho ghi de. Thong tin cua nguoi con song co cai dat rieng tu se luon duoc he thong che giau (masked) bao mat tuyet doi.
                          </div>
                        </div>
                      </div>

                      {/* Export Permission Toggle */}
                      <div style={{ marginBottom: '20px', padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                        <label className="cnm-field-toggle" style={{ fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={policyCanExport}
                            onChange={(e) => setPolicyCanExport(e.target.checked)}
                          />
                          <span>Cho phep dong ho doi tac tai xuat file du lieu cay gia pha chia se</span>
                        </label>
                      </div>

                      <div className="cnm-modal-footer" style={{ padding: 0 }}>
                        <button type="button" className="cnm-btn-secondary" onClick={() => setPolicyModalLink(null)}>
                          Dong
                        </button>
                        <button type="submit" className="cnm-btn-primary" disabled={savingPolicy}>
                          {savingPolicy ? 'Dang luu...' : 'Luu chinh sach chia se'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Tab 2: Partner Clan Policy (Read-Only) */}
                  {policySubTab === 'partner' && (
                    <div>
                      {partnerPolicy ? (
                        <div>
                          <div style={{ marginBottom: '16px', padding: '14px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                            <div style={{ fontSize: '13.5px', color: '#1e40af' }}>
                              Doi tac dang ap dung pham vi:{' '}
                              <strong>{partnerPolicy.dataScope}</strong> | Cho phep xuat du lieu:{' '}
                              <strong>{partnerPolicy.canExport ? 'Co' : 'Khong'}</strong>
                            </div>
                          </div>

                          <div className="cnm-fields-section">
                            <div className="cnm-fields-title">Cac truong du lieu doi tac cho phep xem:</div>
                            <div className="cnm-fields-grid">
                              {Object.entries(partnerPolicy.allowedFields || {}).map(([key, val]) => (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                  <span style={{ color: val ? '#16a34a' : '#94a3b8', fontWeight: 'bold' }}>
                                    {val ? '[x]' : '[ ]'}
                                  </span>
                                  <span style={{ color: val ? '#0f172a' : '#94a3b8' }}>{key}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                          Doi tac dang su dung chinh sach mac dinh (Co ban).
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 3: Preview Shared Tree */}
                  {policySubTab === 'preview' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13.5px', color: '#475569' }}>
                          Ket qua tra cuu thuc te khi xem cay phao cua doi tac duoi chinh sach chia se:
                        </span>
                        <button
                          type="button"
                          className="cnm-btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                          onClick={handleLoadSharedTreePreview}
                          disabled={loadingPreview}
                        >
                          {loadingPreview ? 'Dang tai...' : 'Lam moi'}
                        </button>
                      </div>

                      {loadingPreview ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                          Dang tai cay du lieu chia se...
                        </div>
                      ) : previewTree && previewTree.nodes ? (
                        <div className="cnm-preview-table-wrap">
                          <table className="cnm-table" style={{ fontSize: '12.5px' }}>
                            <thead>
                              <tr>
                                <th>Ho va ten</th>
                                <th>Doi</th>
                                <th>Gioi tinh</th>
                                <th>Trang thai</th>
                                <th>Quyen rieng tu</th>
                              </tr>
                            </thead>
                            <tbody>
                              {previewTree.nodes.length === 0 ? (
                                <tr>
                                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                                    Khong co thanh vien nao trong pham vi chia se.
                                  </td>
                                </tr>
                              ) : (
                                previewTree.nodes.map((node) => {
                                  const isMasked = node.privacyLevel === 'MASKED' || node.fullName.includes('(Bao mat)');
                                  return (
                                    <tr key={node.id}>
                                      <td>
                                        <strong style={{ color: isMasked ? '#b45309' : '#0f172a' }}>
                                          {node.fullName}
                                        </strong>
                                      </td>
                                      <td>{node.generation > 0 ? 'Doi ' + node.generation : '—'}</td>
                                      <td>{node.gender}</td>
                                      <td>{node.isLiving ? 'Con song' : 'Da mat'}</td>
                                      <td>
                                        {isMasked ? (
                                          <span className="cnm-badge-masked">Da bao mat (Masked)</span>
                                        ) : (
                                          <span className="cnm-badge-shared">Duoc chia se (Shared)</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                          Nhan Lam moi de tai du lieu xem truoc.
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Giai đoạn 5: Hybrid Tree Modal */}
      {viewingHybridLinkId && (
        <HybridTreeView
          linkId={viewingHybridLinkId}
          onClose={() => setViewingHybridLinkId(null)}
          onOpenPolicyModal={(lid) => {
            setViewingHybridLinkId(null);
            const l = links.find((x) => x.id === lid);
            if (l) handleOpenPolicyModal(l);
          }}
        />
      )}
    </div>
  );
};

export default ClanNetworkManagement;
