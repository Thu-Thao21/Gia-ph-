import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { fetchFamilies } from '../../../services/member.service';
import { buildErgoTreeFromDB } from '../../../services/tree.service';
import type { Family, Member } from '../../../types/member';
import type { ErgoTreeNode, TreeContextMenuState } from '../../../types/tree';
import { ErgoTreeCanvas } from '../ErgoTreeCanvas';
import { TreeContextMenu } from '../TreeContextMenu';
import TreeActionModals, { type ModalType } from '../TreeActionModals/TreeActionModals';
import { NotificationModal } from '../../common/NotificationModal';
import '../Tree.css';
import './TreeLayout.css';

export interface TreeLayoutProps {
  onSelectMemberProfile?: (memberId: string) => void;
  initialMode?: 'vertical' | 'horizontal' | 'focus';
  familyId?: string;
}

export const TreeLayout: React.FC<TreeLayoutProps> = ({
  onSelectMemberProfile,
  initialMode = 'vertical',
  familyId,
}) => {
  const { account } = useAuth();
  const roleLower = (account?.primary_role || '').toLowerCase();
  const activeRoles = (account?.roles || [])
    .filter((r) => r.status === 'active')
    .map((r) => r.role.toLowerCase());

  const isClanAdmin = [
    'trưởng tộc', 'chủ dòng họ', 'clan admin', 'clan_admin', 'family_head', 'business_owner'
  ].includes(roleLower) || activeRoles.some((r) => ['clan_admin', 'family_head', 'business_owner'].includes(r));

  const isFamilyAdmin = [
    'family admin', 'family_admin', 'manager'
  ].includes(roleLower) || activeRoles.some((r) => ['family_admin', 'manager'].includes(r));

  const isAdmin = roleLower === 'admin' || activeRoles.includes('admin');

  // Trưởng tộc, Family Admin và Hệ thống Admin có toàn quyền quản trị cây gia phả:
  const canManageTree = isClanAdmin || isFamilyAdmin || isAdmin;
  const effectiveFamilyId = familyId || account?.clan_id || account?.memberships?.[0]?.clan_id;

  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>(effectiveFamilyId || '');
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [treeNodes, setTreeNodes] = useState<ErgoTreeNode[]>([]);
  const [focusMemberId, setFocusMemberId] = useState<string | undefined>(undefined);
  const [treeDirection, setTreeDirection] = useState<'vertical' | 'horizontal'>(
    initialMode === 'horizontal' ? 'horizontal' : 'vertical'
  );
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

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
    fetchFamilies().then((fams) => {
      const allowedFams = isAdmin
        ? fams
        : effectiveFamilyId
        ? fams.filter((f) => f.id === effectiveFamilyId)
        : fams;
      setFamilies(allowedFams.length > 0 ? allowedFams : fams);
      if (effectiveFamilyId && fams.some((f) => f.id === effectiveFamilyId)) {
        setSelectedFamilyId(effectiveFamilyId);
      } else if (fams.length > 0) {
        // Tự động chọn gia tộc đầu tiên đã có thành viên để người dùng xem ngay
        const famWithMembers = fams.find((f) => (f.memberCount || 0) > 0);
        setSelectedFamilyId(famWithMembers ? famWithMembers.id : fams[0].id);
      }
    });
  }, [effectiveFamilyId, isAdmin]);

  const requestCounterRef = React.useRef<number>(0);
  const allMembersCacheRef = React.useRef<Member[]>([]);
  const lastFetchedFamilyIdRef = React.useRef<string>('');

  useEffect(() => {
    if (!selectedFamilyId) return;
    const currentReqId = ++requestCounterRef.current;

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

    setLoading(true);

    buildErgoTreeFromDB(selectedFamilyId, focusMemberId, cached)
      .then(({ rootNodes, allMembers: mems }) => {
        // Chống race condition: Chỉ áp dụng kết quả của request mới nhất
        if (currentReqId === requestCounterRef.current) {
          allMembersCacheRef.current = mems;
          setTreeNodes(rootNodes);
          setAllMembers(mems);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (currentReqId === requestCounterRef.current) {
          console.error('[TreeLayout] Focus view tree loading error:', err);
          setLoading(false);
        }
      });
  }, [selectedFamilyId, focusMemberId]);

  const handleCardClick = (e: React.MouseEvent, node: ErgoTreeNode) => {
    e.stopPropagation();
    console.log('[TreeLayout] handleCardClick on:', node.id, node.fullName);

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
    const currentReqId = ++requestCounterRef.current;
    allMembersCacheRef.current = [];
    buildErgoTreeFromDB(selectedFamilyId, focusMemberId)
      .then(({ rootNodes, allMembers: mems }) => {
        if (currentReqId === requestCounterRef.current) {
          allMembersCacheRef.current = mems;
          setTreeNodes(rootNodes);
          setAllMembers(mems);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[TreeLayout] Reload error:', err);
      });
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
            </div>
          </div>
          <div className="tree-toolbar-subtitle-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <p className="tree-toolbar-subtitle" style={{ margin: 0 }}>
              {focusMemberId
                ? 'Đang làm tâm điểm trên mạng lưới gia phả: Camera tự động phóng to và căn giữa màn hình.'
                : selectedBranch || selectedGeneration !== undefined
                ? 'Đang áp dụng bộ lọc chi nhánh và thế hệ gia phả.'
                : 'Hiển thị sơ đồ trực hệ đa thế hệ kết nối gia tộc.'}
            </p>
          </div>
        </div>

        <div className="tree-toolbar-right">
          {/* Tree Direction Toggle: Vertical (Dọc) vs Horizontal (Ngang) */}
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

          {/* Family Dropdown */}
          <select
            className="tree-control-select"
            value={selectedFamilyId}
            onChange={(e) => {
              const newFamId = e.target.value;
              setSelectedFamilyId(newFamId);
              allMembersCacheRef.current = [];
              setFocusMemberId(undefined);
              setSelectedBranch(undefined);
              setSelectedGeneration(undefined);
              setLoading(true);
            }}
          >
            {families.map((f) => {
              const count = f.memberCount !== undefined
                ? f.memberCount
                : f.id === selectedFamilyId
                ? allMembers.length
                : 0;
              return (
                <option key={f.id} value={f.id}>
                  {f.name} ({count} thành viên)
                </option>
              );
            })}
          </select>

          {/* Branch Filter Dropdown (FR-BO-44) */}
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

          {/* Generation Filter Dropdown (FR-BO-44) */}
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

          {/* Focus Member Dropdown (FR-BO-41) */}
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

          {/* Zoom Buttons */}
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
      {/* Canvas Area */}
      {loading ? (
        <div className="tree-canvas-prompt-loading">
          Đang tính toán sơ đồ trực hệ gia phả...
        </div>
      ) : displayedTreeNodes.length === 0 ? (
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
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddChild={handleAddChild}
            onAddSpouse={handleAddSpouse}
            onRelocate={handleRelocate}
            onTogglePrivacy={handleTogglePrivacy}
            onProposeEdit={handleProposeEdit}
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
                  className="tree-action-btn secondary"
                  onClick={() => setProposeModal({ isOpen: false, node: null, content: '' })}
                >
                  Hủy
                </button>
                <button type="submit" className="tree-action-btn primary">
                  Gửi đề xuất tới Ban quản trị
                </button>
              </div>
            </form>
          </div>
        </div>
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
    </div>
  );
};

export default TreeLayout;
