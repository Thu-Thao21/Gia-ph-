import React, { useEffect, useState } from 'react';
import { fetchFamilies } from '../../../services/member.service';
import { buildErgoTreeFromDB } from '../../../services/tree.service';
import type { Family, Member } from '../../../types/member';
import type { ErgoTreeNode, TreeContextMenuState } from '../../../types/tree';
import { ErgoTreeCanvas } from '../ErgoTreeCanvas';
import { TreeContextMenu } from '../TreeContextMenu';
import { NotificationModal } from '../../common/NotificationModal';
import '../Tree.css';
import './TreeLayout.css';

export interface TreeLayoutProps {
  onSelectMemberProfile?: (memberId: string) => void;
}

export const TreeLayout: React.FC<TreeLayoutProps> = ({
  onSelectMemberProfile,
}) => {
  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string>('9316f9b9-6d70-4d08-bce1-9911dc117a24');
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [treeNodes, setTreeNodes] = useState<ErgoTreeNode[]>([]);
  const [focusMemberId, setFocusMemberId] = useState<string | undefined>(undefined);
  const [treeDirection, setTreeDirection] = useState<'vertical' | 'horizontal'>('vertical');
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
      setFamilies(fams);
      if (fams.length > 0) {
        const activeFam =
          fams.find((f) => f.id === '9316f9b9-6d70-4d08-bce1-9911dc117a24' || f.name.includes('Gia đình A')) ||
          fams[0];
        setSelectedFamilyId(activeFam.id);
      }
    });
  }, []);

  const requestCounterRef = React.useRef<number>(0);

  useEffect(() => {
    if (!selectedFamilyId) return;
    const currentReqId = ++requestCounterRef.current;

    // Chỉ bật loading ở lần đầu tải dữ liệu (tránh chớp tắt / nháy màn khi chuyển người trung tâm)
    if (allMembers.length === 0) {
      setLoading(true);
    }
    buildErgoTreeFromDB(selectedFamilyId, focusMemberId)
      .then(({ rootNodes, allMembers: mems }) => {
        // Chống race condition: Chỉ áp dụng kết quả của request mới nhất
        if (currentReqId === requestCounterRef.current) {
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
    // Tự động phóng to lên 1.15x để làm nổi bật người trung tâm và sơ đồ 3 đời
    setZoomScale(1.15);
    setFocusMemberId(node.id);
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
    setZoomScale(1.15);
    setFocusMemberId(node.id);
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
              ➔ Ngang
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
            onChange={(e) => setSelectedFamilyId(e.target.value)}
          >
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.memberCount || allMembers.length} thành viên)
              </option>
            ))}
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

      {/* Focus View Clean Notification */}
      {focusMemberId && (
        <div
          className="focus-view-banner"
          style={{
            margin: '0 24px 12px 24px',
            padding: '10px 18px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
              🌿 Đang chọn làm trung tâm mạng lưới:
            </span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#15803d' }}>
              {allMembers.find((m) => m.id === focusMemberId)?.fullName || 'Thành viên'}
            </span>
            <span style={{ fontSize: '12px', color: '#16a34a' }}>
              (Camera lướt mượt căn giữa & phóng to 115%)
            </span>
          </div>
          <button
            onClick={() => {
              setZoomScale(1.0);
              setFocusMemberId(undefined);
            }}
            style={{
              background: '#ffffff',
              border: '1px solid #86efac',
              color: '#166534',
              borderRadius: '8px',
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            ✕ Bỏ chọn tâm điểm (Quay lại xem toàn bộ cây)
          </button>
        </div>
      )}

      {/* Canvas Area */}
      {loading ? (
        <div className="tree-canvas-prompt-loading">
          Đang tính toán sơ đồ trực hệ gia phả...
        </div>
      ) : displayedTreeNodes.length === 0 ? (
        <div className="tree-canvas-prompt-empty">
          Chưa có dữ liệu cây gia phả phù hợp với điều kiện lọc.
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
      <TreeContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        node={contextMenu.member as ErgoTreeNode}
        onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        onSelectFocus={handleSelectFocus}
        onViewBio={handleViewBio}
        onActionToast={handleActionToast}
      />

      {/* Notification Toast */}
      <NotificationModal
        isOpen={isToastOpen}
        onClose={() => setIsToastOpen(false)}
      />
    </div>
  );
};

export default TreeLayout;
