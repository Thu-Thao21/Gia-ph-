import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useClanContext } from '../../../context/ClanContext';
import { fetchFamilies } from '../../../services/member.service';
import { buildErgoTreeFromDB } from '../../../services/tree.service';
import type { Family, Member } from '../../../types/member';
import type { ErgoTreeNode, TreeContextMenuState } from '../../../types/tree';
import { ErgoTreeCanvas } from '../ErgoTreeCanvas';
import { TreeContextMenu } from '../TreeContextMenu';
import TreeActionModals, { type ModalType } from '../TreeActionModals/TreeActionModals';
import { NotificationModal } from '../../common/NotificationModal';
import { BurialQuickViewModal } from '../../../components/common/BurialQuickViewModal';
import { DualLineageModal } from '../../../components/network/DualLineageModal';
import { fetchMyFamilyNetwork, fetchFamilyNetwork } from '../../../services/network.service';
import type { MyFamilyNetworkResponse } from '../../../types/network';
import { MyFamilyNetworkView } from '../../../components/network/MyFamilyNetwork';
import { LineageAccessRequestModal } from '../../../components/network/LineageAccessRequestModal';
import '../Tree.css';
import './TreeLayout.css';

export interface TreeLayoutProps {
  onSelectMemberProfile?: (memberId: string) => void;
  initialMode?: 'vertical' | 'horizontal' | 'focus';
  familyId?: string;
  initialScope?: 'clan' | 'network';
}

export const TreeLayout: React.FC<TreeLayoutProps> = ({
  onSelectMemberProfile,
  initialMode = 'vertical',
  familyId,
  initialScope,
}) => {
  const { account } = useAuth();
  const { activeClanId, activeClanName, activeMembership, availableClans, selectClan } = useClanContext();
  const roleLower = (account?.primary_role || '').toLowerCase();
  const isAdmin = roleLower === 'admin';

  const effectiveFamilyId = familyId || activeClanId || account?.clan_id || account?.memberships?.[0]?.clan_id;

  // Xác định quyền quản lý cây DỰA TRÊN CHÍNH DÒNG HỌ ĐANG XEM, không dùng vai trò của dòng họ khác:
  const currentMembership = availableClans.find((c) => c.clan_id === (effectiveFamilyId)) 
    || (activeClanId === effectiveFamilyId ? activeMembership : null);
  const clanRoles = currentMembership?.roles || [];
  const isClanAdmin = clanRoles.includes('BUSINESS_OWNER');
  const isFamilyAdmin = clanRoles.includes('FAMILY_ADMIN');
  const canManageTree = isAdmin || isClanAdmin || isFamilyAdmin;

  const [viewScope, setViewScope] = useState<'clan' | 'network'>(initialScope || 'clan');
  const [myNetworkData, setMyNetworkData] = useState<MyFamilyNetworkResponse | null>(null);
  const [expandedInLawPersonId, setExpandedInLawPersonId] = useState<string | null>(null);

  const myPersonId = activeMembership?.person_id || (account as any)?.person_id || myNetworkData?.ego?.id;
  const isBilateralMode = Boolean(
    (viewScope === 'network' || expandedInLawPersonId) &&
    myNetworkData?.hasCrossClanLink &&
    myNetworkData?.nodes &&
    myNetworkData.nodes.length > 0
  );

  useEffect(() => {
    if (initialScope) {
      setViewScope(initialScope);
    }
  }, [initialScope]);

  useEffect(() => {
    if (viewScope === 'network') {
      const egoId = myPersonId || myNetworkData?.ego?.id;
      if (egoId && myNetworkData?.hasCrossClanLink) {
        setExpandedInLawPersonId(egoId);
      } else {
        setExpandedInLawPersonId(null);
        setViewScope('clan');
      }
    } else {
      setExpandedInLawPersonId(null);
    }
  }, [viewScope, myNetworkData, myPersonId]);

  const handleToggleInLawExpand = (personId: string) => {
    if (expandedInLawPersonId === personId || isBilateralMode) {
      setExpandedInLawPersonId(null);
      setViewScope('clan');
    } else {
      if (!myNetworkData?.hasCrossClanLink) {
        setSuccessToastMessage('Tài khoản của bạn chưa có liên kết thông gia / hôn nhân liên họ với dòng họ khác.');
        setTimeout(() => setSuccessToastMessage(null), 4000);
        return;
      }
      setExpandedInLawPersonId(personId);
      setViewScope('network');
    }
  };
  const [networkLoading, setNetworkLoading] = useState<boolean>(false);

  const [families, setFamilies] = useState<(Family & { lineageType?: string | null })[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>(effectiveFamilyId || '');
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [treeNodes, setTreeNodes] = useState<ErgoTreeNode[]>([]);
  const [focusMemberId, setFocusMemberId] = useState<string | undefined>(undefined);
  const [treeDirection, setTreeDirection] = useState<'vertical' | 'horizontal'>(
    initialMode === 'horizontal' ? 'horizontal' : 'vertical'
  );
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [dualLineagePersonId, setDualLineagePersonId] = useState<string | null>(null);

  // Tải thông tin mạng lưới liên họ cá nhân (Ego Network)
  useEffect(() => {
    let isCancelled = false;
    setNetworkLoading(true);
    fetchMyFamilyNetwork(selectedFamilyId || undefined)
      .then((res) => {
        if (isCancelled) return;
        setMyNetworkData(res);
      })
      .catch((err) => {
        console.warn('[TreeLayout] fetchMyFamilyNetwork error:', err);
      })
      .finally(() => {
        if (!isCancelled) setNetworkLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedFamilyId]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<TreeContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    member: null,
  });

  // Toast state for action feedback
  const [isToastOpen, setIsToastOpen] = useState(false);

  // Propose Edit Modal state for regular members
  const [proposeModal, setProposeModal] = useState<{
    isOpen: boolean;
    node: ErgoTreeNode | null;
    content: string;
  }>({ isOpen: false, node: null, content: '' });

  // Tree Action Modals State (Edit, Delete, Add Child, Add Spouse, Relocate)
  const [actionModal, setActionModal] = useState<{
    type: ModalType;
    node: ErgoTreeNode | null;
  }>({ type: null, node: null });
  const [successToastMessage, setSuccessToastMessage] = useState<string | null>(null);
  const [burialModalNode, setBurialModalNode] = useState<ErgoTreeNode | null>(null);
  const [lineageModal, setLineageModal] = useState<{
    isOpen: boolean;
    ownerClanId: string;
    ownerClanName: string;
    anchorPersonId: string;
    anchorPersonName: string;
  }>({
    isOpen: false,
    ownerClanId: '',
    ownerClanName: '',
    anchorPersonId: '',
    anchorPersonName: '',
  });

  const [selectedBranch, setSelectedBranch] = useState<string | undefined>(undefined);
  const [selectedGeneration, setSelectedGeneration] = useState<number | undefined>(undefined);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  useEffect(() => {
    Promise.all([
      fetchFamilies(),
      fetchFamilyNetwork('all'),
      fetchMyFamilyNetwork(effectiveFamilyId || undefined).catch(() => null),
    ]).then(([fams, netFams, myNet]) => {
      let allowedFams: (Family & { lineageType?: string | null })[] = [];
      if (isAdmin) {
        allowedFams = fams;
      } else if (availableClans && availableClans.length > 0) {
        // Cho phép người dùng chọn tất cả các dòng họ mà họ tham gia (nội / ngoại)
        const hasMaternal = availableClans.some((c) => c.lineage_type === 'MATERNAL');
        allowedFams = availableClans.map((c) => {
          const matched = fams.find((f) => String(f.id).toLowerCase() === String(c.clan_id).toLowerCase());
          let inferredLineage = c.lineage_type;
          if (!inferredLineage && hasMaternal && availableClans.length > 1) {
            inferredLineage = 'PATERNAL';
          }
          return {
            id: c.clan_id,
            name: c.clan_name,
            code: matched?.code,
            status: c.clan_status || 'ACTIVE',
            memberCount: matched?.memberCount ?? 0,
            lineageType: inferredLineage,
          };
        });
      } else if (effectiveFamilyId) {
        allowedFams = fams.filter((f) => String(f.id).toLowerCase() === String(effectiveFamilyId).toLowerCase());
      } else {
        allowedFams = fams;
      }

      // Bổ sung dòng họ bên phối ngẫu / thông gia đã liên kết (IN_LAW)
      if (myNet?.hasCrossClanLink && myNet.spouseClan) {
        const spId = String(myNet.spouseClan.id).toLowerCase();
        if (!allowedFams.some((f) => String(f.id).toLowerCase() === spId)) {
          const matched = fams.find((f) => String(f.id).toLowerCase() === spId);
          allowedFams.push({
            id: myNet.spouseClan.id,
            name: myNet.spouseClan.name,
            code: matched?.code,
            status: 'ACTIVE',
            memberCount: matched?.memberCount ?? 0,
            lineageType: 'IN_LAW',
          });
        }
      }

      if (Array.isArray(netFams)) {
        netFams.forEach((nf) => {
          if (nf.status === 'connected') {
            const nfId = String(nf.id).toLowerCase();
            if (!allowedFams.some((f) => String(f.id).toLowerCase() === nfId)) {
              const matched = fams.find((f) => String(f.id).toLowerCase() === nfId);
              allowedFams.push({
                id: nf.id,
                name: nf.name,
                code: nf.code || matched?.code,
                status: 'ACTIVE',
                memberCount: nf.memberCount || (matched?.memberCount ?? 0),
                lineageType: 'IN_LAW',
              });
            }
          }
        });
      }

      setFamilies(allowedFams.length > 0 ? allowedFams : fams);

      const targetId = effectiveFamilyId || selectedFamilyId;
      if (targetId && allowedFams.some((f) => String(f.id).toLowerCase() === String(targetId).toLowerCase())) {
        setSelectedFamilyId(targetId);
      } else if (allowedFams.length > 0) {
        setSelectedFamilyId(allowedFams[0].id);
      }
    });
  }, [effectiveFamilyId, isAdmin, availableClans]);

  // Đồng bộ selectedFamilyId và reset state khi người dùng đổi cây trên TopBar
  const prevEffectiveFamilyIdRef = React.useRef(effectiveFamilyId);
  useEffect(() => {
    if (effectiveFamilyId && effectiveFamilyId !== prevEffectiveFamilyIdRef.current) {
      prevEffectiveFamilyIdRef.current = effectiveFamilyId;
      setSelectedFamilyId(effectiveFamilyId);
      setFocusMemberId(undefined);
      setContextMenu({ isOpen: false, x: 0, y: 0, member: null });
      setActionModal({ type: null, node: null });
    }
  }, [effectiveFamilyId]);

  const requestCounterRef = React.useRef<number>(0);
  const allMembersCacheRef = React.useRef<Member[]>([]);
  const lastFetchedFamilyIdRef = React.useRef<string>('');

  useEffect(() => {
    if (!selectedFamilyId) return;
    let isCancelled = false;

    // Khi đổi sang gia tộc khác, xóa sạch cache thành viên của gia tộc cũ
    const isDifferentFamily = selectedFamilyId !== lastFetchedFamilyIdRef.current;
    if (isDifferentFamily) {
      allMembersCacheRef.current = [];
      lastFetchedFamilyIdRef.current = selectedFamilyId;
    }

    // Chỉ dùng cached khi click vào người trung tâm TRONG CÙNG MỘT GIA TỘC
    const cached = (!isDifferentFamily && allMembersCacheRef.current.length > 0)
      ? allMembersCacheRef.current
      : undefined;

    // Chỉ hiện loading trắng khi đổi hẳn sang gia tộc khác hoặc chưa nạp cây ban đầu
    if (isDifferentFamily || treeNodes.length === 0) {
      setLoading(true);
    }

// myPersonId is defined at component level
    const myUserId = account?.id || (account as any)?.user_id;

    buildErgoTreeFromDB(selectedFamilyId, focusMemberId, cached, myPersonId, myUserId)
      .then(({ rootNodes, allMembers: mems }) => {
        // Chống race condition: Chỉ áp dụng kết quả của request mới nhất
        if (!isCancelled) {
          allMembersCacheRef.current = mems;
          setTreeNodes(rootNodes);
          setAllMembers(mems);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('[TreeLayout] Focus view tree loading error:', err);
          setLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [selectedFamilyId, focusMemberId]);

  const handleCardClick = (e: React.MouseEvent, node: ErgoTreeNode) => {
    e.stopPropagation();
    console.log('[TreeLayout] handleCardClick on:', node.id, node.fullName);

    const isCurrentlyFocused = Boolean(
      (focusMemberId && (focusMemberId === node.id || (node.spouses && node.spouses.some((s) => s.id === focusMemberId)))) ||
      (expandedInLawPersonId && (expandedInLawPersonId === node.id || (node.spouses && node.spouses.some((s) => s.id === expandedInLawPersonId))))
    );

    const isEgo = Boolean(
      (myNetworkData?.hasCrossClanLink && node.id === myNetworkData?.ego?.id) ||
      (myNetworkData?.hasCrossClanLink && myPersonId && node.id === myPersonId) ||
      (myNetworkData?.hasCrossClanLink && node.isCurrentUser)
    );
    const hasCrossSpouse = Boolean(
      node.spouses && node.spouses.some((s) => s.isCrossClan)
    );

    if (isBilateralMode) {
      // Đang xem mạng lưới liên họ mà bấm vào Ego hoặc phối ngẫu -> đóng mạng lưới mượt mà, về lại cây toàn họ
      if (isEgo || hasCrossSpouse) {
        setViewScope('clan');
        setExpandedInLawPersonId(null);
      }
    } else {
      // Đang xem cây toàn họ mà bấm vào Ego hoặc phối ngẫu (khi có liên kết liên họ) -> mở mạng lưới liên họ mượt mà ngay trên canvas
      if (isEgo || hasCrossSpouse) {
        setViewScope('network');
        setExpandedInLawPersonId(node.id);
      } else {
        // Chọn người trung tâm bình thường trong cây toàn họ
        setFocusMemberId((prev) => (prev === node.id ? undefined : node.id));
      }
    }
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleContextMenu = (e: React.MouseEvent, node: ErgoTreeNode) => {
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      member: node,
    });
  };

  const handleSelectFocus = (node: ErgoTreeNode) => {
    const isCurrentlyFocused = Boolean(
      node.isFocusPerson ||
      (focusMemberId && (
        focusMemberId === node.id ||
        (node.spouses && node.spouses.some((s) => s.id === focusMemberId))
      ))
    );

    // Ấn lần đầu là chọn làm người trung tâm, ấn lần 2 thì thoát khỏi người trung tâm
    if (isCurrentlyFocused) {
      setFocusMemberId(undefined);
      setZoomScale(1.0);
    } else {
      setZoomScale(1.15);
      setFocusMemberId(node.id);
    }
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleViewBio = (node: ErgoTreeNode) => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
    if (onSelectMemberProfile) {
      onSelectMemberProfile(node.id);
    }
  };

  const handleActionToast = () => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
    setIsToastOpen(true);
  };

  const reloadTree = React.useCallback(() => {
    if (!selectedFamilyId) return;
    let isCancelled = false;
    allMembersCacheRef.current = [];
    buildErgoTreeFromDB(selectedFamilyId, focusMemberId)
      .then(({ rootNodes, allMembers: mems }) => {
        if (!isCancelled) {
          allMembersCacheRef.current = mems;
          setTreeNodes(rootNodes);
          setAllMembers(mems);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[TreeLayout] Reload error:', err);
      });
    return () => {
      isCancelled = true;
    };
  }, [selectedFamilyId, focusMemberId]);

  const handleEdit = (node: ErgoTreeNode) => {
    setActionModal({ type: 'edit', node });
  };

  const handleDelete = (node: ErgoTreeNode) => {
    setActionModal({ type: 'delete', node });
  };

  const handleAddChild = (node: ErgoTreeNode) => {
    setActionModal({ type: 'addChild', node });
  };

  const handleAddSpouse = (node: ErgoTreeNode) => {
    setActionModal({ type: 'addSpouse', node });
  };

  const handleRelocate = (node: ErgoTreeNode) => {
    setActionModal({ type: 'relocate', node });
  };

  const handleTogglePrivacy = (node: ErgoTreeNode) => {
    const nextPrivate = !node.isPrivate;
    localStorage.setItem(`privacy_setting_${node.id}`, nextPrivate ? 'private' : 'public');

    // Update local tree nodes
    setTreeNodes((prev) => {
      const updatePrivacyRecursive = (list: ErgoTreeNode[]): ErgoTreeNode[] => {
        return list.map((n) => {
          const updatedChildren = n.children ? updatePrivacyRecursive(n.children) : [];
          if (n.id === node.id) {
            return { ...n, isPrivate: nextPrivate, children: updatedChildren };
          }
          return { ...n, children: updatedChildren };
        });
      };
      return updatePrivacyRecursive(prev);
    });

    const msg = nextPrivate
      ? `Đã chuyển thông tin '${node.fullName}' sang chế độ Riêng tư (Ẩn SĐT/Email với thành viên khác).`
      : `Đã chuyển thông tin '${node.fullName}' sang chế độ Công khai trong dòng họ.`;
    setSuccessToastMessage(msg);
    setTimeout(() => setSuccessToastMessage(null), 4000);
  };

  const handleProposeEdit = (node: ErgoTreeNode) => {
    setProposeModal({
      isOpen: true,
      node,
      content: '',
    });
  };

  const handleProposeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposeModal.content.trim()) return;
    setSuccessToastMessage(`Đã gửi đề xuất chỉnh sửa thông tin thành viên '${proposeModal.node?.fullName}' tới Trưởng tộc & Ban quản trị!`);
    setProposeModal({ isOpen: false, node: null, content: '' });
    setTimeout(() => setSuccessToastMessage(null), 4000);
  };

  // Quick stats calculation
  const maleCount = allMembers.filter((m) => m.gender === 'male').length;
  const femaleCount = allMembers.filter((m) => m.gender === 'female').length;
  const maxGen = allMembers.length > 0 ? Math.max(...allMembers.map((m) => m.generation || 1)) : 1;

  // Extract unique branches for filtering (FR-BO-44)
  const branches = Array.from(
    new Set(allMembers.map((m) => m.branch).filter((b): b is string => Boolean(b)))
  );

  // Filter nodes according to selected branch / generation
  const filterNodeRecursive = (node: ErgoTreeNode): ErgoTreeNode | null => {
    let match = true;
    if (selectedBranch && node.branch !== selectedBranch) match = false;
    if (selectedGeneration !== undefined && node.generation !== selectedGeneration) match = false;

    const filteredChildren = node.children
      .map(filterNodeRecursive)
      .filter((c): c is ErgoTreeNode => c !== null);

    if (match || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      };
    }
    return null;
  };

  const myNatalClanId = account?.clan_id || account?.memberships?.[0]?.clan_id || activeClanId;
  const isViewingInLaw = Boolean(
    selectedFamilyId &&
    myNatalClanId &&
    String(selectedFamilyId).toLowerCase() !== String(myNatalClanId).toLowerCase()
  );

  const myClanObj = families.find((f) => String(f.id).toLowerCase() === String(myNatalClanId).toLowerCase());
  const currentClanObj = families.find((f) => String(f.id).toLowerCase() === String(selectedFamilyId).toLowerCase());

  const spouseRelationLabel = (myNetworkData?.ego?.gender === 'female' || (account as any)?.gender === 'female')
    ? 'chồng'
    : 'vợ';

  const handleViewInLawTree = (clanId: string, personId: string) => {
    setSelectedFamilyId(clanId);
    allMembersCacheRef.current = [];
    setFocusMemberId(personId);
    setSelectedBranch(undefined);
    setSelectedGeneration(undefined);
    setLoading(true);
  };

  const handleReturnToMyClan = () => {
    if (myNatalClanId) {
      setSelectedFamilyId(myNatalClanId);
      allMembersCacheRef.current = [];
  // myPersonId is defined at component level
      setFocusMemberId(myPersonId || undefined);
      setSelectedBranch(undefined);
      setSelectedGeneration(undefined);
      setLoading(true);
    }
  };

  const displayedTreeNodes = focusMemberId
    ? treeNodes
    : (selectedBranch || selectedGeneration !== undefined)
    ? treeNodes.map(filterNodeRecursive).filter((n): n is ErgoTreeNode => n !== null)
    : treeNodes;

  return (
    <div className={`tree-page-layout ${isFullscreen ? 'is-fullscreen' : ''}`} ref={containerRef}>
      {/* Top Controls Toolbar */}
      <div className="tree-toolbar-card">
        <div className="tree-toolbar-header-info">
          <div className="tree-toolbar-title-row">
            <h2 className="tree-toolbar-title">
              Cây Gia Phả Trực Hệ
            </h2>
            <div className="tree-stats-pill-group">
              <span className="tree-stat-pill blue">{allMembers.length} Thành viên</span>
              <span className="tree-stat-pill purple">{maxGen} Thế hệ</span>
              <span className="tree-stat-pill teal">{maleCount} Nam</span>
              <span className="tree-stat-pill pink">{femaleCount} Nữ</span>
              {isViewingInLaw && (
                <span className="tree-stat-pill purple" style={{ fontWeight: 600 }}>
                  Nhánh 4 đời bên {spouseRelationLabel}
                </span>
              )}
            </div>
          </div>
          <div className="tree-toolbar-subtitle-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <p className="tree-toolbar-subtitle" style={{ margin: 0 }}>
              {expandedInLawPersonId && myNetworkData?.hasCrossClanLink
                ? `Đang lấy bạn (${account?.display_name || 'Ego'}) làm trung tâm: Vẫn giữ nguyên toàn bộ nhánh nội tộc và mở rộng nhánh gia phả bên chồng (${myNetworkData.spouseClan?.name || 'Mai Thế Tộc'}) ngay tại node phối ngẫu trong cùng một canvas.`
                : isViewingInLaw
                ? `Đang khám phá cây gia phả bên ${spouseRelationLabel}: ${currentClanObj?.name || 'Gia tộc liên kết'} (Phạm vi 4 thế hệ chia sẻ).`
                : focusMemberId
                ? 'Đang làm tâm điểm trên mạng lưới gia phả: Camera tự động phóng to và căn giữa màn hình.'
                : selectedBranch || selectedGeneration !== undefined
                ? 'Đang áp dụng bộ lọc chi nhánh và thế hệ gia phả.'
                : 'Hiển thị sơ đồ trực hệ đa thế hệ kết nối gia tộc. Nhấp vào bản thân để mở rộng mạng lưới phả hệ thông gia.'}
            </p>
          </div>
        </div>

        <div className="tree-toolbar-right">
          {/* View Scope Toggle: Cây toàn dòng họ vs Lấy tôi làm trung tâm (Ego) */}
          <div className="tree-view-scope-toggle">
            <button
              type="button"
              className={`tree-scope-btn ${!isBilateralMode ? 'active' : ''}`}
              onClick={() => {
                setViewScope('clan');
                setExpandedInLawPersonId(null);
                setFocusMemberId(undefined);
              }}
              title="Xem sơ đồ cây gia phả toàn dòng họ"
            >
              <span>Cây toàn dòng họ</span>
            </button>
            {myNetworkData?.hasCrossClanLink && (
              <button
                type="button"
                className={`tree-scope-btn ${isBilateralMode ? 'active' : ''}`}
                onClick={() => {
                  const egoId = myPersonId || myNetworkData?.ego?.id;
                  if (egoId) {
                    setViewScope('network');
                    setExpandedInLawPersonId(egoId);
                    setFocusMemberId(egoId);
                  }
                }}
                title="Xem sơ đồ gia phả liên họ 4 đời lấy bạn làm trung tâm (Ego)"
              >
                <span>Lấy tôi làm trung tâm (Ego)</span>
                <span className="tree-scope-badge-dot" />
              </button>
            )}
          </div>

          {/* Family Dropdown */}
          <select
            className="tree-control-select tree-clan-select"
            value={selectedFamilyId}
            onChange={(e) => {
              const newFamId = e.target.value;
              setSelectedFamilyId(newFamId);
              allMembersCacheRef.current = [];
              setFocusMemberId(undefined);
              setSelectedBranch(undefined);
              setSelectedGeneration(undefined);
              setLoading(true);
              const isDirectClan = availableClans.some(
                (c) => String(c.clan_id).toLowerCase() === String(newFamId).toLowerCase()
              );
              if (isDirectClan && selectClan) {
                selectClan(newFamId);
              }
            }}
            title="Chọn dòng tộc hiển thị cây gia phả"
          >
            {families.map((f: any) => {
              const count = f.memberCount !== undefined
                ? f.memberCount
                : f.id === selectedFamilyId
                ? allMembers.length
                : 0;

              const mClan = availableClans.find(
                (c) => String(c.clan_id).toLowerCase() === String(f.id).toLowerCase()
              );
              const hasMaternal = availableClans.some((c) => c.lineage_type === 'MATERNAL');
              let lineage = f.lineageType || mClan?.lineage_type;
              if (!lineage && hasMaternal && availableClans.length > 1) {
                lineage = 'PATERNAL';
              }

              const lineageTag = lineage === 'PATERNAL'
                ? ' [Bên nội]'
                : lineage === 'MATERNAL'
                ? ' [Bên ngoại]'
                : lineage === 'IN_LAW'
                ? ' [Bên chồng / Thông gia]'
                : '';

              return (
                <option key={f.id} value={f.id}>
                  {f.name}{lineageTag} ({count} thành viên)
                </option>
              );
            })}
          </select>

          {/* Tree Direction Toggle */}
          <div className="tree-dir-toggle-group">
            <button
              className={`tree-dir-btn ${treeDirection === 'vertical' ? 'active' : ''}`}
              onClick={() => setTreeDirection('vertical')}
              title="Chuyển sơ đồ dọc (Từ trên xuống)"
            >
               Dọc
            </button>
            <button
              className={`tree-dir-btn ${treeDirection === 'horizontal' ? 'active' : ''}`}
              onClick={() => setTreeDirection('horizontal')}
              title="Chuyển sơ đồ ngang (Từ trái sang phải)"
            >
              Ngang
            </button>
          </div>

          {/* Legend Badges */}
          <div className="tree-legend-group">
            <span className="tree-legend-item male">Nam</span>
            <span className="tree-legend-item female">Nữ (Dâu)</span>
            <span className="tree-legend-item focus">Đang chọn</span>
          </div>

          {branches.length > 0 && (
            <select
              className="tree-control-select"
              value={selectedBranch || ''}
              onChange={(e) => setSelectedBranch(e.target.value || undefined)}
            >
              <option value="">-- Tất cả chi nhánh --</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  Chi: {b}
                </option>
              ))}
            </select>
          )}

          <select
            className="tree-control-select"
            value={selectedGeneration !== undefined ? String(selectedGeneration) : ''}
            onChange={(e) =>
              setSelectedGeneration(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">-- Tất cả thế hệ --</option>
            {Array.from({ length: maxGen }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>
                Đời thứ {g}
              </option>
            ))}
          </select>

          <select
            className="tree-control-select focus-select"
            value={focusMemberId || ''}
            onChange={(e) => {
              const val = e.target.value || undefined;
              if (val) {
                setZoomScale(1.15);
              } else {
                setZoomScale(1.0);
              }
              setFocusMemberId(val);
            }}
          >
            <option value="">-- Người làm trung tâm (Focus) --</option>
            {allMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName} (Đời {m.generation})
              </option>
            ))}
          </select>

          <div className="tree-zoom-btn-group">
            <button
              className="tree-control-btn"
              onClick={() => setZoomScale((z) => Math.min(1.6, z + 0.15))}
              title="Phóng to"
            >
              +
            </button>
            <button
              className="tree-control-btn"
              onClick={() => setZoomScale((z) => Math.max(0.5, z - 0.15))}
              title="Thu nhỏ"
            >
              -
            </button>
            <button
              className="tree-control-btn reset"
              onClick={() => {
                setZoomScale(1);
                setFocusMemberId(undefined);
                setSelectedBranch(undefined);
                setSelectedGeneration(undefined);
              }}
              title="Đặt lại góc nhìn và xóa bộ lọc"
            >
              {Math.round(zoomScale * 100)}%
            </button>
            <button
              className={`tree-control-btn ${isFullscreen ? 'active' : ''}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'}
            >
              {isFullscreen ? '✕' : '⛶'}
            </button>
          </div>
        </div>
      </div>

      {/* Canvas Area - Always renders ErgoTreeCanvas (Giữ nguyên canvas không bị chớp màn hình) */}
      {loading && treeNodes.length === 0 && !isBilateralMode ? (
        <div className="tree-canvas-prompt-loading">
          Đang tính toán sơ đồ trực hệ gia phả...
        </div>
      ) : displayedTreeNodes.length === 0 && !isBilateralMode ? (
        <div className="tree-canvas-prompt-empty">
          {allMembers.length === 0 ? (
            <div>
              <p style={{ fontWeight: 600, color: '#475569' }}>Dòng họ này hiện chưa có thành viên nào trong cây gia phả (0 thành viên).</p>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 6 }}>
                Quý quản trị viên vui lòng chọn dòng họ có thành viên từ danh sách phía trên để xem sơ đồ gia phả.
              </p>
            </div>
          ) : (
            'Chưa có dữ liệu cây gia phả phù hợp với điều kiện lọc chi nhánh hoặc thế hệ.'
          )}
        </div>
      ) : (
        <ErgoTreeCanvas
          nodes={displayedTreeNodes}
          onCardClick={handleCardClick}
          onContextMenu={handleContextMenu}
          zoomScale={zoomScale}
          direction={treeDirection}
          onViewInLawTree={handleViewInLawTree}
          inLawNetwork={myNetworkData}
          expandedInLawPersonId={expandedInLawPersonId}
          onToggleInLawExpand={handleToggleInLawExpand}
          isBilateralMode={isBilateralMode}
          onRequestLineageAccess={(ownerClanId, ownerClanName, anchorPersonId, anchorPersonName) => {
            setLineageModal({
              isOpen: true,
              ownerClanId,
              ownerClanName,
              anchorPersonId,
              anchorPersonName,
            });
          }}
          onBackToClanTree={() => {
            setViewScope('clan');
            setExpandedInLawPersonId(null);
            setFocusMemberId(undefined);
          }}
          onViewBurial={(node) => setBurialModalNode(node)}
        />
      )}

      {/* Popup Context Menu */}
      {(() => {
        const currentContextMenuNode = contextMenu.member as ErgoTreeNode | null;
        const isContextMenuSelf = Boolean(
          currentContextMenuNode && (
            (currentContextMenuNode.userId && currentContextMenuNode.userId === account?.id) ||
            ((account as any)?.person_id && currentContextMenuNode.id === (account as any).person_id) ||
            (account?.display_name && currentContextMenuNode.fullName &&
              currentContextMenuNode.fullName.trim().toLowerCase() === account.display_name.trim().toLowerCase()) ||
            (account?.email && (currentContextMenuNode as any).email &&
              (currentContextMenuNode as any).email.trim().toLowerCase() === account.email.trim().toLowerCase())
          )
        );

        return (
          <TreeContextMenu
            isOpen={contextMenu.isOpen}
            x={contextMenu.x}
            y={contextMenu.y}
            node={contextMenu.member as ErgoTreeNode}
            focusMemberId={focusMemberId}
            canManageTree={canManageTree}
            isSelf={isContextMenuSelf}
            onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
            onSelectFocus={handleSelectFocus}
            onViewBio={handleViewBio}
            onViewBurial={(node) => setBurialModalNode(node)}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddChild={handleAddChild}
            onAddSpouse={handleAddSpouse}
            onRelocate={handleRelocate}
            onTogglePrivacy={handleTogglePrivacy}
            onProposeEdit={handleProposeEdit}
            onViewInLawTree={handleViewInLawTree}
            onViewMyNetwork={() => setViewScope('network')}
            onActionToast={handleActionToast}
          />
        );
      })()}

      {/* Tree Action Modals (Edit, Delete, Add Child, Add Spouse, Relocate) */}
      {(() => {
        const currentActionNode = actionModal.node;
        const isActionModalSelf = Boolean(
          currentActionNode && (
            (currentActionNode.userId && currentActionNode.userId === account?.id) ||
            ((account as any)?.person_id && currentActionNode.id === (account as any).person_id) ||
            (account?.display_name && currentActionNode.fullName &&
              currentActionNode.fullName.trim().toLowerCase() === account.display_name.trim().toLowerCase()) ||
            (account?.email && (currentActionNode as any).email &&
              (currentActionNode as any).email.trim().toLowerCase() === account.email.trim().toLowerCase())
          )
        );

        return (
          <TreeActionModals
            type={actionModal.type}
            node={actionModal.node}
            familyId={selectedFamilyId}
            familyName={activeClanName || undefined}
            allMembers={allMembers}
            canManageTree={canManageTree}
            isSelf={isActionModalSelf}
            onClose={() => setActionModal({ type: null, node: null })}
            onSuccess={(msg) => {
              setSuccessToastMessage(msg);
              reloadTree();
              setTimeout(() => setSuccessToastMessage(null), 4000);
            }}
          />
        );
      })()}

      {/* Propose Edit Modal for Regular Members */}
      {proposeModal.isOpen && proposeModal.node && (
        <div
          className="tree-action-modal-backdrop"
          onClick={() => setProposeModal({ isOpen: false, node: null, content: '' })}
        >
          <div className="tree-action-modal-card" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleProposeSubmit}>
              <div className="tree-action-modal-header">
                <h3 className="tree-action-modal-title">Gửi đề xuất chỉnh sửa thông tin</h3>
                <button
                  type="button"
                  className="tree-action-modal-close-btn"
                  onClick={() => setProposeModal({ isOpen: false, node: null, content: '' })}
                >
                  ✕
                </button>
              </div>
              <div className="tree-action-modal-body">
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#64748b' }}>
                  Thành viên: <strong style={{ color: '#0f172a' }}>{proposeModal.node.fullName}</strong>
                </p>
                <div className="tree-action-form-group">
                  <label className="tree-action-form-label">Nội dung đề xuất chỉnh sửa *</label>
                  <textarea
                    className="tree-action-form-input"
                    rows={4}
                    value={proposeModal.content}
                    onChange={(e) => setProposeModal((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder="Mô tả các thông tin cần sửa đổi hoặc đính chính (ví dụ: ngày sinh, nơi an táng, mối quan hệ...)"
                    required
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
              <div className="tree-action-modal-footer">
                <button
                  type="button"
                  className="tree-action-btn-secondary"
                  onClick={() => setProposeModal({ isOpen: false, node: null, content: '' })}
                >
                  Hủy
                </button>
                <button type="submit" className="tree-action-btn-primary">
                  Gửi đề xuất tới Ban quản trị
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sơ đồ Huyết thống Liên họ 2-3 đời Bên Nội & Bên Ngoại */}
      {dualLineagePersonId && (
        <DualLineageModal
          personId={dualLineagePersonId}
          onClose={() => setDualLineagePersonId(null)}
        />
      )}

      {/* Notification Toast */}
      <NotificationModal
        isOpen={isToastOpen}
        onClose={() => setIsToastOpen(false)}
      />

      {/* Interactive Success Alert Banner */}
      {successToastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            background: 'linear-gradient(135deg, #15803d, #16a34a)',
            color: '#ffffff',
            padding: '14px 22px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(22, 163, 74, 0.4)',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 10000,
            animation: 'modalScaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
            <span>{successToastMessage}</span>
          <button
            onClick={() => setSuccessToastMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '16px',
              cursor: 'pointer',
              marginLeft: '8px',
              padding: 0,
              opacity: 0.8,
            }}
          >
            ✕
          </button>
        </div>
      )}
      {burialModalNode && (
        <BurialQuickViewModal
          isOpen={Boolean(burialModalNode)}
          onClose={() => setBurialModalNode(null)}
          personId={burialModalNode.id}
          personName={burialModalNode.fullName}
          deathDate={burialModalNode.deathDate}
          clanId={familyId}
          onViewFullProfile={() => {
            if (onSelectMemberProfile) onSelectMemberProfile(burialModalNode.id);
          }}
        />
      )}
      {lineageModal.isOpen && (
        <LineageAccessRequestModal
          isOpen={lineageModal.isOpen}
          onClose={() => setLineageModal((prev) => ({ ...prev, isOpen: false }))}
          ownerClanId={lineageModal.ownerClanId}
          ownerClanName={lineageModal.ownerClanName}
          anchorPersonId={lineageModal.anchorPersonId}
          anchorPersonName={lineageModal.anchorPersonName}
          onSuccess={() => {
            setSuccessToastMessage('Yêu cầu xem gia phả liên họ đã được gửi tới Trưởng tộc phê duyệt.');
            fetchMyFamilyNetwork(selectedFamilyId || undefined).then((res) => {
              if (res) setMyNetworkData(res);
            });
          }}
        />
      )}
    </div>
  );
};

export default TreeLayout;
