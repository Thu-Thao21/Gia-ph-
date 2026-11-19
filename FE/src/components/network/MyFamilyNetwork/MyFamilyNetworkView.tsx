import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MyFamilyNetworkResponse,
  MyFamilyNetworkNode,
  MyFamilyNetworkEdge,
} from '../../../types/network';
import { fetchMyFamilyNetwork } from '../../../services/network.service';
import { GenderAvatar } from '../../common/GenderAvatar';
import './MyFamilyNetworkView.css';

export interface MyFamilyNetworkViewProps {
  clanId?: string;
  onNavigateToLinks?: () => void;
  onBackToClanTree?: () => void;
}

export const MyFamilyNetworkView: React.FC<MyFamilyNetworkViewProps> = ({
  clanId,
  onNavigateToLinks,
  onBackToClanTree,
}) => {
  const [data, setData] = useState<MyFamilyNetworkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & Search
  const [filterMode, setFilterMode] = useState<'ALL' | 'NATAL' | 'SPOUSE'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<MyFamilyNetworkNode | null>(null);

  // Canvas Pan & Zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const loadNetwork = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetchMyFamilyNetwork(clanId);
      setData(res);
    } catch (err: any) {
      console.error('[MyFamilyNetworkView] loadNetwork error:', err);
      setErrorMsg(err?.message || 'Không thể tải dữ liệu mạng lưới liên họ');
    } finally {
      setLoading(false);
    }
  }, [clanId]);

  useEffect(() => {
    loadNetwork();
  }, [loadNetwork]);

  // Initial center on viewport
  useEffect(() => {
    if (data && containerRef.current) {
      const vW = containerRef.current.clientWidth || 1200;
      const vH = containerRef.current.clientHeight || 750;
      setPan({
        x: Math.round(vW / 2 - 800),
        y: Math.max(20, Math.round(vH / 2 - 500)),
      });
      setZoom(1.0);
    }
  }, [data]);

  // Dynamic 2D Layout Computation for Bilateral Network
  const layout = useMemo(() => {
    if (!data || !data.nodes || data.nodes.length === 0) {
      return {
        positions: {} as Record<string, { x: number; y: number }>,
        nodes: [] as MyFamilyNetworkNode[],
        edges: [] as MyFamilyNetworkEdge[],
        canvasWidth: 1600,
        canvasHeight: 1100,
        sharedChildren: [] as MyFamilyNetworkNode[],
        LEVEL_Y: {} as Record<number, number>,
        EGO_X: 580,
        SPOUSE_X: 1020,
      };
    }

    const LEVEL_Y: Record<number, number> = {
      [-2]: 140, // Grandparents
      [-1]: 390, // Parents
      [0]: 650,  // Ego, Spouse, Siblings
      [1]: 910,  // Children
    };

    const CX = 800; // Global horizontal center line
    const EGO_X = CX - 220;   // 580 (Left branch center)
    const SPOUSE_X = CX + 220; // 1020 (Right branch center)
    const positions: Record<string, { x: number; y: number }> = {};

    // Group nodes by side and relative level
    const natalByLevel: Record<number, MyFamilyNetworkNode[]> = { [-2]: [], [-1]: [], [0]: [], [1]: [] };
    const spouseByLevel: Record<number, MyFamilyNetworkNode[]> = { [-2]: [], [-1]: [], [0]: [], [1]: [] };
    const sharedChildren: MyFamilyNetworkNode[] = [];

    data.nodes.forEach((n) => {
      const lvl = n.relativeLevel;
      if (lvl === 1) {
        sharedChildren.push(n);
      } else if (n.isCrossClan) {
        if (!spouseByLevel[lvl]) spouseByLevel[lvl] = [];
        spouseByLevel[lvl].push(n);
      } else {
        if (!natalByLevel[lvl]) natalByLevel[lvl] = [];
        natalByLevel[lvl].push(n);
      }
    });

    // 1. Position Level 0: Ego (Left) & Spouse (Right)
    const egoNode = data.nodes.find((n) => n.isEgo) || natalByLevel[0].find((n) => n.isEgo);
    const spouseNode = data.nodes.find((n) => n.isSpouse) || spouseByLevel[0].find((n) => n.isSpouse);
    const egoSiblings = (natalByLevel[0] || []).filter((n) => !n.isEgo && !n.isSpouse);
    const spouseSiblings = (spouseByLevel[0] || []).filter((n) => !n.isEgo && !n.isSpouse);

    if (egoNode) {
      positions[egoNode.id] = { x: EGO_X, y: LEVEL_Y[0] };
    }
    if (spouseNode) {
      positions[spouseNode.id] = { x: SPOUSE_X, y: LEVEL_Y[0] };
    }

    // Ego Siblings placed outwards to the left
    egoSiblings.forEach((s, idx) => {
      positions[s.id] = { x: EGO_X - (idx + 1) * 190, y: LEVEL_Y[0] };
    });

    // Spouse Siblings placed outwards to the right
    spouseSiblings.forEach((s, idx) => {
      positions[s.id] = { x: SPOUSE_X + (idx + 1) * 190, y: LEVEL_Y[0] };
    });

    // 2. Position Level -1 (Parents)
    // Natal Parents: placed directly above Ego
    const natalParents = natalByLevel[-1] || [];
    if (natalParents.length === 1) {
      positions[natalParents[0].id] = { x: EGO_X, y: LEVEL_Y[-1] };
    } else if (natalParents.length >= 2) {
      const sorted = [...natalParents].sort((a, b) => (a.gender === 'MALE' ? -1 : 1));
      positions[sorted[0].id] = { x: EGO_X - 110, y: LEVEL_Y[-1] };
      positions[sorted[1].id] = { x: EGO_X + 110, y: LEVEL_Y[-1] };
    }

    // Spouse Parents: placed directly above Spouse
    const spouseParents = spouseByLevel[-1] || [];
    if (spouseParents.length === 1) {
      positions[spouseParents[0].id] = { x: SPOUSE_X, y: LEVEL_Y[-1] };
    } else if (spouseParents.length >= 2) {
      const sorted = [...spouseParents].sort((a, b) => (a.gender === 'MALE' ? -1 : 1));
      positions[sorted[0].id] = { x: SPOUSE_X - 110, y: LEVEL_Y[-1] };
      positions[sorted[1].id] = { x: SPOUSE_X + 110, y: LEVEL_Y[-1] };
    }

    // 3. Position Level -2 (Grandparents)
    // Natal Grandparents (Ông Bà bên Ego)
    const natalGPs = natalByLevel[-2] || [];
    if (natalGPs.length === 1) {
      positions[natalGPs[0].id] = { x: EGO_X, y: LEVEL_Y[-2] };
    } else if (natalGPs.length >= 2) {
      const sorted = [...natalGPs].sort((a, b) => (a.gender === 'MALE' ? -1 : 1));
      positions[sorted[0].id] = { x: EGO_X - 110, y: LEVEL_Y[-2] };
      positions[sorted[1].id] = { x: EGO_X + 110, y: LEVEL_Y[-2] };
    }

    // Spouse Grandparents (Ông Bà bên Spouse)
    const spouseGPs = spouseByLevel[-2] || [];
    if (spouseGPs.length === 1) {
      positions[spouseGPs[0].id] = { x: SPOUSE_X, y: LEVEL_Y[-2] };
    } else if (spouseGPs.length >= 2) {
      const sorted = [...spouseGPs].sort((a, b) => (a.gender === 'MALE' ? -1 : 1));
      positions[sorted[0].id] = { x: SPOUSE_X - 110, y: LEVEL_Y[-2] };
      positions[sorted[1].id] = { x: SPOUSE_X + 110, y: LEVEL_Y[-2] };
    }

    // 4. Position Level +1 (Children)
    if (sharedChildren.length === 1) {
      positions[sharedChildren[0].id] = { x: CX, y: LEVEL_Y[1] };
    } else if (sharedChildren.length > 1) {
      const totalW = (sharedChildren.length - 1) * 190;
      const startX = CX - totalW / 2;
      sharedChildren.forEach((ch, idx) => {
        positions[ch.id] = { x: startX + idx * 190, y: LEVEL_Y[1] };
      });
    }

    // Filter nodes by mode
    let filteredNodes = data.nodes;
    if (filterMode === 'NATAL') {
      filteredNodes = data.nodes.filter((n) => !n.isCrossClan);
    } else if (filterMode === 'SPOUSE') {
      filteredNodes = data.nodes.filter((n) => n.isCrossClan || n.relativeLevel === 1);
    }

    const filteredIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = data.edges.filter(
      (e) => filteredIds.has(e.source) && filteredIds.has(e.target)
    );

    // Compute bounding box
    const allX = Object.values(positions).map((p) => p.x);
    const minX = allX.length > 0 ? Math.min(...allX) - 180 : 0;
    const maxX = allX.length > 0 ? Math.max(...allX) + 180 : 1600;
    const canvasWidth = Math.max(1600, maxX - minX + 240);

    // Nhóm các cặp vợ chồng cha mẹ và con cái để vẽ đường nối liên họ chính xác:
    // Quy tắc: Nếu có vợ chồng thì nối từ GIỮA 2 vợ chồng chĩa xuống; nếu chưa có vợ thì nối 1 từ đáy thẻ
    const marriageEdges = filteredEdges.filter((e) => e.type === 'MARRIAGE');
    const spouseMap = new Map<string, string>();
    marriageEdges.forEach((e) => {
      spouseMap.set(e.source, e.target);
      spouseMap.set(e.target, e.source);
    });

    const bloodEdges = filteredEdges.filter((e) => e.type === 'BLOODLINE');
    const parentsOfChild = new Map<string, Set<string>>();
    bloodEdges.forEach((e) => {
      const cur = parentsOfChild.get(e.target) || new Set<string>();
      cur.add(e.source);
      parentsOfChild.set(e.target, cur);
    });

    interface MfnFamilyUnit {
      id: string;
      level: number;
      stemX: number;
      stemY: number;
      parentBracket?: {
        leftX: number;
        rightX: number;
        bracketY: number;
        parentBottomY: number;
      };
      children: Array<{
        id: string;
        targetX: number;
        targetY: number;
        hasSpouse?: boolean;
        childBracket?: {
          leftX: number;
          rightX: number;
          forkY: number;
          childTopY: number;
        };
      }>;
    }

    const familyUnits: MfnFamilyUnit[] = [];
    const processedParents = new Set<string>();

    [-2, -1].forEach((lvl) => {
      const nodesAtLevel = filteredNodes.filter((n) => n.relativeLevel === lvl);
      nodesAtLevel.forEach((p) => {
        if (processedParents.has(p.id)) return;

        const pPos = positions[p.id];
        if (!pPos) return;

        const spouseId = spouseMap.get(p.id);
        const spouseNode = spouseId ? filteredNodes.find((n) => n.id === spouseId) : undefined;
        const sPos = spouseNode ? positions[spouseNode.id] : undefined;

        let stemX: number;
        let stemY: number;
        let parentBracket: MfnFamilyUnit['parentBracket'] = undefined;

        const parentBottomY = pPos.y + 90;
        const bracketY = parentBottomY + 20;

        if (spouseNode && sPos) {
          // Bố mẹ là cặp vợ chồng -> Nối ở chính giữa 2 vợ chồng
          processedParents.add(p.id);
          processedParents.add(spouseNode.id);
          const leftX = Math.min(pPos.x, sPos.x);
          const rightX = Math.max(pPos.x, sPos.x);
          stemX = (pPos.x + sPos.x) / 2;
          stemY = bracketY;
          parentBracket = {
            leftX,
            rightX,
            bracketY,
            parentBottomY,
          };
        } else {
          // Bố hoặc mẹ độc thân (chưa có vợ) -> Nối 1 từ đáy thẻ
          processedParents.add(p.id);
          stemX = pPos.x;
          stemY = parentBottomY;
        }

        const parentIds = spouseNode ? [p.id, spouseNode.id] : [p.id];
        const childrenNodes = filteredNodes.filter((n) => {
          if (n.relativeLevel !== lvl + 1) return false;
          const pars = parentsOfChild.get(n.id);
          return pars ? parentIds.some((pid) => pars.has(pid)) : false;
        });

        if (childrenNodes.length === 0) return;

        const processedChildrenInGroup = new Set<string>();
        const childrenTargets: MfnFamilyUnit['children'] = [];

        childrenNodes.forEach((ch) => {
          if (processedChildrenInGroup.has(ch.id)) return;
          processedChildrenInGroup.add(ch.id);

          const chPos = positions[ch.id];
          if (!chPos) return;

          const chSpouseId = spouseMap.get(ch.id);
          const chSpouseNode = chSpouseId ? filteredNodes.find((n) => n.id === chSpouseId) : undefined;
          const chSpousePos = chSpouseNode ? positions[chSpouseNode.id] : undefined;

          const childTopY = chPos.y - 90;
          const forkY = childTopY - 20;

          if (chSpouseNode && chSpousePos) {
            // Con đã có vợ/chồng -> Nối ở chính giữa 2 vợ chồng con và chỉa xuống 2 vợ chồng
            processedChildrenInGroup.add(chSpouseNode.id);
            const leftX = Math.min(chPos.x, chSpousePos.x);
            const rightX = Math.max(chPos.x, chSpousePos.x);
            const targetX = (chPos.x + chSpousePos.x) / 2;
            childrenTargets.push({
              id: ch.id,
              targetX,
              targetY: forkY,
              hasSpouse: true,
              childBracket: {
                leftX,
                rightX,
                forkY,
                childTopY,
              },
            });
          } else {
            // Con chưa có vợ/chồng -> Nối 1 thẳng vào đỉnh thẻ con
            childrenTargets.push({
              id: ch.id,
              targetX: chPos.x,
              targetY: childTopY,
              hasSpouse: false,
            });
          }
        });

        familyUnits.push({
          id: `unit_${p.id}`,
          level: lvl,
          stemX,
          stemY,
          parentBracket,
          children: childrenTargets,
        });
      });
    });

    return {
      positions,
      nodes: filteredNodes,
      edges: filteredEdges,
      familyUnits,
      canvasWidth,
      canvasHeight: 1100,
      sharedChildren,
      LEVEL_Y,
      EGO_X,
      SPOUSE_X,
    };
  }, [data, filterMode]);

  // Pan & Zoom Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoom((z) => Math.min(2.0, Number((z + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))));
  const handleReset = () => {
    setZoom(1);
    if (containerRef.current) {
      const vW = containerRef.current.clientWidth || 1200;
      const vH = containerRef.current.clientHeight || 750;
      setPan({
        x: Math.round(vW / 2 - 800),
        y: Math.max(20, Math.round(vH / 2 - 500)),
      });
    } else {
      setPan({ x: 0, y: 0 });
    }
  };

  const handleRecenterEgo = () => {
    const container = containerRef.current;
    if (!container) return;
    const vW = container.clientWidth;
    const vH = container.clientHeight;
    setZoom(1.0);
    setPan({
      x: Math.round(vW / 2 - 800),
      y: Math.max(20, Math.round(vH / 2 - 520)),
    });
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const getRoleLabel = (role: string, gender: string) => {
    switch (role) {
      case 'EGO':
        return 'BẢN THÂN (EGO)';
      case 'SPOUSE':
        return gender === 'MALE' ? 'CHỒNG (PHỐI NGẪU)' : 'VỢ (PHỐI NGẪU)';
      case 'FATHER':
        return 'THÂN PHỤ (CHA)';
      case 'MOTHER':
        return 'THÂN MẪU (MẸ)';
      case 'GRANDFATHER':
        return 'ÔNG NỘI / NGOẠI';
      case 'GRANDMOTHER':
        return 'BÀ NỘI / NGOẠI';
      case 'SIBLING':
        return gender === 'MALE' ? 'ANH / EM TRAI' : 'CHỊ / EM GÁI';
      case 'CHILD':
        return gender === 'MALE' ? 'CON TRAI' : 'CON GÁI';
      default:
        return 'THÀNH VIÊN';
    }
  };

  if (loading) {
    return (
      <div className="mfn-root-container">
        <div className="mfn-loading-state">
          <div className="mfn-spinner" />
          <p>Đang tải mạng lưới liên họ 4 đời lấy bạn làm trung tâm...</p>
        </div>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="mfn-root-container">
        <div className="mfn-empty-state">
          <p>{errorMsg || 'Không tìm thấy dữ liệu mạng lưới của bạn.'}</p>
          <button type="button" className="mfn-btn-primary" onClick={loadNetwork}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (!data.hasCrossClanLink) {
    return (
      <div className="mfn-root-container">
        <div className="mfn-empty-state">
          <h3>Chưa có liên kết thông gia đa dòng họ</h3>
          <p>
            Tài khoản của bạn ({data.ego.fullName}) hiện chưa có liên kết thông gia với dòng họ đối tác
            hoặc liên kết đang chờ Trưởng tộc phê duyệt.
          </p>
          {onNavigateToLinks && (
            <button type="button" className="mfn-btn-primary" onClick={onNavigateToLinks}>
              Quản lý liên kết dòng họ
            </button>
          )}
        </div>
      </div>
    );
  }

  const natalClan = data.natalClan;
  const spouseClan = data.spouseClan;
  const CX = 800;

  return (
    <div className={`mfn-root-container ${isFullscreen ? 'is-fullscreen' : ''}`} ref={containerRef}>
      {/* 1. Header Toolbar */}
      <div className="mfn-top-toolbar">
        <div className="mfn-toolbar-left">
          <div className="mfn-toolbar-title-row">
            <h2 className="mfn-title">Cây Mạng Lưới Gia Phả Liên Họ (Bilateral Network)</h2>
            <div className="mfn-badge-group">
              <span className="mfn-pill blue">{natalClan?.name} (Bên bạn)</span>
              <span className="mfn-pill purple">
                {spouseClan ? `${spouseClan.name} (Bên phối ngẫu)` : 'Chưa có dòng họ thông gia'}
              </span>
              <span className="mfn-pill green">Phạm vi 4 thế hệ</span>
            </div>
          </div>
          <p className="mfn-subtitle">
            Sơ đồ thống nhất hiển thị đồng thời hai nhánh gia tộc qua quan hệ hôn nhân của{' '}
            <strong>{data.ego.fullName}</strong> và{' '}
            <strong>{spouseClan ? data.bridges[0]?.spouseName || 'Phối ngẫu' : 'Phối ngẫu'}</strong>.
          </p>
        </div>

        <div className="mfn-toolbar-right">
          {/* Filter segment */}
          <div className="mfn-segment-toggle">
            <button
              className={`mfn-segment-btn ${filterMode === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterMode('ALL')}
            >
              Cả hai họ
            </button>
            <button
              className={`mfn-segment-btn ${filterMode === 'NATAL' ? 'active' : ''}`}
              onClick={() => setFilterMode('NATAL')}
            >
              Chỉ bên bạn
            </button>
            <button
              className={`mfn-segment-btn ${filterMode === 'SPOUSE' ? 'active' : ''}`}
              onClick={() => setFilterMode('SPOUSE')}
            >
              Chỉ bên phối ngẫu
            </button>
          </div>

          {/* Quick Search */}
          <div className="mfn-search-wrap">
            <input
              type="text"
              className="mfn-search-input"
              placeholder="Tìm kiếm thành viên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Zoom and Center Actions */}
          <div className="mfn-zoom-group">
            <button type="button" className="mfn-ctrl-btn" onClick={handleZoomOut} title="Thu nhỏ">
              -
            </button>
            <button type="button" className="mfn-ctrl-btn" onClick={handleReset} title="Đặt lại 100%">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="mfn-ctrl-btn" onClick={handleZoomIn} title="Phóng to">
              +
            </button>
            <button
              type="button"
              className="mfn-ctrl-btn ego-center"
              onClick={handleRecenterEgo}
              title="Căn giữa màn hình lấy Ego làm trọng tâm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
              </svg>
              <span>Tâm Ego</span>
            </button>
            <button type="button" className="mfn-ctrl-btn" onClick={toggleFullscreen} title="Toàn màn hình">
              [ ]
            </button>
          </div>

          {onBackToClanTree && (
            <button
              type="button"
              className="mfn-back-clan-btn"
              onClick={onBackToClanTree}
              title="Quay lại cây toàn dòng họ"
            >
              &larr; Quay về cây toàn họ
            </button>
          )}
        </div>
      </div>

      {/* 2. Canvas Container with Pan & Zoom */}
      <div
        className={`mfn-viewport ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div
          className="mfn-canvas-stage"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: `${layout.canvasWidth}px`,
            height: `${layout.canvasHeight}px`,
            position: 'relative',
          }}
        >
          {/* Dual-Lineage Header Banners at Top */}
          <div
            className="mfn-lineage-header natal"
            style={{
              position: 'absolute',
              left: `${layout.EGO_X - 170}px`,
              top: '40px',
              width: '340px',
              textAlign: 'center',
            }}
          >
            <div className="mfn-lineage-title">DÒNG HỌ CỦA BẠN</div>
            <div className="mfn-lineage-name">{natalClan?.name?.toUpperCase() || 'DÒNG HỌ DƯƠNG'}</div>
          </div>

          <div
            className="mfn-lineage-header spouse"
            style={{
              position: 'absolute',
              left: `${layout.SPOUSE_X - 170}px`,
              top: '40px',
              width: '340px',
              textAlign: 'center',
            }}
          >
            <div className="mfn-lineage-title">DÒNG HỌ BÊN PHỐI NGẪU</div>
            <div className="mfn-lineage-name">
              {spouseClan?.name?.toUpperCase() || 'MAI THẾ TỘC'} [4 ĐỜI CHIA SẺ]
            </div>
          </div>

          {/* Background SVG Connectors Layer */}
          <svg
            className="mfn-svg-layer"
            width={layout.canvasWidth}
            height={layout.canvasHeight}
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 1 }}
          >
            <defs>
              <linearGradient id="bridgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="50%" stopColor="#7c3aed" />
                <stop offset="100%" stopColor="#9333ea" />
              </linearGradient>
            </defs>

            {/* Render Connecting Lines from Edges */}
            {layout.edges.map((edge) => {
              const src = layout.positions[edge.source];
              const tgt = layout.positions[edge.target];
              if (!src || !tgt) return null;

              if (edge.type === 'INTER_CLAN_BRIDGE') {
                // Horizontal Marriage Bridge between Ego & Spouse at card vertical center (src.y)
                const x1 = Math.min(src.x, tgt.x) + 75;
                const x2 = Math.max(src.x, tgt.x) - 75;
                const y = src.y;

                return (
                  <g key={edge.id} className="mfn-bridge-connector">
                    {/* Shadow / Glow line */}
                    <line x1={x1} y1={y} x2={x2} y2={y} stroke="#c4b5fd" strokeWidth="8" strokeOpacity="0.4" />
                    {/* Main gradient line */}
                    <line x1={x1} y1={y} x2={x2} y2={y} stroke="url(#bridgeGradient)" strokeWidth="3.5" />

                    {/* Central Wedding Badge */}
                    <g transform={`translate(${CX}, ${y})`}>
                      <rect
                        x="-85"
                        y="-15"
                        width="170"
                        height="30"
                        rx="15"
                        fill="#ffffff"
                        stroke="#7c3aed"
                        strokeWidth="2"
                        filter="drop-shadow(0 2px 6px rgba(124, 58, 237, 0.25))"
                      />
                      <circle cx="-60" cy="0" r="5" fill="none" stroke="#7c3aed" strokeWidth="2" />
                      <circle cx="-54" cy="0" r="5" fill="none" stroke="#db2777" strokeWidth="2" />
                      <text x="10" y="4.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#6d28d9">
                        HÔN PHỐI LIÊN TỘC
                      </text>
                    </g>
                  </g>
                );
              }

              if (edge.type === 'MARRIAGE') {
                // Intra-clan horizontal marriage connector at card vertical center (src.y)
                const x1 = Math.min(src.x, tgt.x) + 75;
                const x2 = Math.max(src.x, tgt.x) - 75;
                const y = src.y;
                const midX = (x1 + x2) / 2;

                return (
                  <g key={edge.id} className="mfn-marriage-connector">
                    <line x1={x1} y1={y} x2={x2} y2={y} stroke="#e2e8f0" strokeWidth="5" />
                    <line x1={x1} y1={y} x2={x2} y2={y} stroke="#db2777" strokeWidth="2.5" />
                    {/* Marriage Badge */}
                    <g transform={`translate(${midX}, ${y})`}>
                      <circle cx="0" cy="0" r="11" fill="#fdf2f8" stroke="#db2777" strokeWidth="1.5" />
                      <text x="0" y="3.5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#be185d">
                        Vợ
                      </text>
                    </g>
                  </g>
                );
              }

                return null;
              })}

            {/* Render Precision Inter-Family Bloodlines from Family Units */}
            {/* Quy tắc: Bố mẹ có vợ chồng thì nối ở giữa 2 vợ chồng rồi chỉa xuống; chưa có vợ thì nối 1 */}
            {layout.familyUnits.map((unit) => {
              const chCount = unit.children.length;
              if (chCount === 0) return null;

              const minChildTargetY = Math.min(...unit.children.map((c) => c.targetY));
              const midY = (unit.stemY + minChildTargetY) / 2;
              const minX = Math.min(unit.stemX, ...unit.children.map((c) => c.targetX));
              const maxX = Math.max(unit.stemX, ...unit.children.map((c) => c.targetX));

              return (
                <g key={unit.id} className="mfn-family-unit-connector">
                  {/* 1. Parent Bracket: Nếu có vợ chồng thì nối từ đáy 2 vợ chồng vào thanh ngang ở bracketY, nút giao ở giữa */}
                  {unit.parentBracket && (
                    <>
                      <line
                        x1={unit.parentBracket.leftX}
                        y1={unit.parentBracket.parentBottomY}
                        x2={unit.parentBracket.leftX}
                        y2={unit.parentBracket.bracketY}
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <line
                        x1={unit.parentBracket.rightX}
                        y1={unit.parentBracket.parentBottomY}
                        x2={unit.parentBracket.rightX}
                        y2={unit.parentBracket.bracketY}
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <line
                        x1={unit.parentBracket.leftX}
                        y1={unit.parentBracket.bracketY}
                        x2={unit.parentBracket.rightX}
                        y2={unit.parentBracket.bracketY}
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={unit.stemX}
                        cy={unit.stemY}
                        r="3.5"
                        fill="#2563eb"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </>
                  )}

                  {/* 2. Đường thả từ giữa 2 vợ chồng xuống các con */}
                  {chCount === 1 && Math.abs(unit.stemX - unit.children[0].targetX) < 3 ? (
                    // Thẳng đứng từ giữa 2 vợ chồng cha mẹ xuống giữa 2 vợ chồng con
                    <line
                      x1={unit.stemX}
                      y1={unit.stemY}
                      x2={unit.stemX}
                      y2={unit.children[0].targetY}
                      stroke="#2563eb"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  ) : chCount === 1 ? (
                    // Gấp khúc từ giữa 2 vợ chồng cha mẹ sang trục của con
                    <path
                      d={`M ${unit.stemX} ${unit.stemY} L ${unit.stemX} ${midY} L ${unit.children[0].targetX} ${midY} L ${unit.children[0].targetX} ${unit.children[0].targetY}`}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  ) : (
                    // Nhiều con: đường đứng từ giữa 2 vợ chồng xuống xà ngang bus bar, rồi thả xuống từng con
                    <>
                      <line
                        x1={unit.stemX}
                        y1={unit.stemY}
                        x2={unit.stemX}
                        y2={midY}
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <line
                        x1={minX}
                        y1={midY}
                        x2={maxX}
                        y2={midY}
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      {unit.children.map((ch) => (
                        <line
                          key={`drop-${ch.id}`}
                          x1={ch.targetX}
                          y1={midY}
                          x2={ch.targetX}
                          y2={ch.targetY}
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      ))}
                    </>
                  )}

                  {/* 3. Child Bracket: Nếu con có vợ chồng thì chỉa xuống cả 2 vợ chồng con */}
                  {unit.children.map((ch) => {
                    if (!ch.childBracket) {
                      // Con chưa có vợ: nút tròn ngay đỉnh thẻ
                      return (
                        <circle
                          key={`dot-${ch.id}`}
                          cx={ch.targetX}
                          cy={ch.targetY}
                          r="3.5"
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      );
                    }

                    // Con đã có vợ: chỉa xuống 2 vợ chồng
                    return (
                      <g key={`bracket-${ch.id}`} className="mfn-child-bracket">
                        <line
                          x1={ch.childBracket.leftX}
                          y1={ch.childBracket.forkY}
                          x2={ch.childBracket.rightX}
                          y2={ch.childBracket.forkY}
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                        <line
                          x1={ch.childBracket.leftX}
                          y1={ch.childBracket.forkY}
                          x2={ch.childBracket.leftX}
                          y2={ch.childBracket.childTopY}
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                        <line
                          x1={ch.childBracket.rightX}
                          y1={ch.childBracket.forkY}
                          x2={ch.childBracket.rightX}
                          y2={ch.childBracket.childTopY}
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                        <circle
                          cx={ch.targetX}
                          cy={ch.targetY}
                          r="3.5"
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx={ch.childBracket.leftX}
                          cy={ch.childBracket.childTopY}
                          r="3"
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth="1.2"
                        />
                        <circle
                          cx={ch.childBracket.rightX}
                          cy={ch.childBracket.childTopY}
                          r="3"
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth="1.2"
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Stem connecting Marriage Bridge down to Shared Children (if any) */}
            {layout.sharedChildren.length > 0 && (
              <g className="mfn-children-stem">
                <line
                  x1={CX}
                  y1={layout.LEVEL_Y[0] + 15}
                  x2={CX}
                  y2={layout.LEVEL_Y[0] + 130}
                  stroke="#7c3aed"
                  strokeWidth="2.5"
                />
                {layout.sharedChildren.length === 1 ? (
                  <line
                    x1={CX}
                    y1={layout.LEVEL_Y[0] + 130}
                    x2={CX}
                    y2={layout.LEVEL_Y[1] - 90}
                    stroke="#7c3aed"
                    strokeWidth="2.5"
                  />
                ) : (
                  <>
                    <line
                      x1={layout.positions[layout.sharedChildren[0].id]?.x || CX}
                      y1={layout.LEVEL_Y[0] + 130}
                      x2={layout.positions[layout.sharedChildren[layout.sharedChildren.length - 1].id]?.x || CX}
                      y2={layout.LEVEL_Y[0] + 130}
                      stroke="#7c3aed"
                      strokeWidth="2.5"
                    />
                    {layout.sharedChildren.map((ch) => {
                      const chPos = layout.positions[ch.id];
                      if (!chPos) return null;
                      return (
                        <line
                          key={`stem-${ch.id}`}
                          x1={chPos.x}
                          y1={layout.LEVEL_Y[0] + 130}
                          x2={chPos.x}
                          y2={layout.LEVEL_Y[1] - 90}
                          stroke="#7c3aed"
                          strokeWidth="2.5"
                        />
                      );
                    })}
                  </>
                )}
              </g>
            )}
          </svg>

          {/* Foreground Person Cards Layer */}
          {layout.nodes.map((node) => {
            const pos = layout.positions[node.id];
            if (!pos) return null;

            const isSelected = selectedNode?.id === node.id;
            const isMatch = searchTerm.trim() !== '' && node.fullName.toLowerCase().includes(searchTerm.toLowerCase());
            const roleLabel = getRoleLabel(node.relativeRole, node.gender);

            return (
              <div
                key={node.id}
                className={`mfn-card ${node.gender.toLowerCase()} ${node.isEgo ? 'is-ego' : ''} ${node.isSpouse ? 'is-spouse' : ''} ${isSelected ? 'selected' : ''} ${isMatch ? 'match' : ''}`}
                style={{
                  position: 'absolute',
                  left: `${pos.x - 75}px`,
                  top: `${pos.y - 90}px`,
                  width: '150px',
                  height: '180px',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode(node);
                }}
                title={`Nhấp để xem hồ sơ phả hệ của ${node.fullName}`}
              >
                {/* Generation Badge */}
                <div className="mfn-card-gen-badge">
                  {node.generation ? `ĐỜI ${node.generation}` : 'TIỀN NHÂN'}
                </div>

                {/* Avatar */}
                <div className="mfn-card-avatar-wrap">
                  <GenderAvatar
                    gender={node.gender === 'MALE' ? 'male' : 'female'}
                    size={48}
                    avatarUrl={node.avatarUrl}
                    name={node.fullName}
                  />
                </div>

                {/* Full Name */}
                <div className="mfn-card-name" title={node.fullName}>
                  {node.fullName}
                </div>

                {/* Relative Role Pill */}
                <div className={`mfn-card-role-pill ${node.isEgo ? 'blue bold' : node.isSpouse ? 'purple bold' : ''}`}>
                  {roleLabel}
                </div>

                {/* Clan Pill */}
                <div className={`mfn-card-clan-pill ${node.isCrossClan ? 'spouse-clan' : 'natal-clan'}`}>
                  {node.isCrossClan ? spouseClan?.name || 'Mai Thế Tộc' : natalClan?.name || 'Họ Dương'}
                </div>

                {/* Account / Living indicator */}
                {node.userId ? (
                  <div className="mfn-card-account-badge" title="Đã liên kết tài khoản hệ thống">
                    <span>&bull; Đã liên kết</span>
                  </div>
                ) : (
                  <div className="mfn-card-year">
                    {node.birthDate ? `${node.birthDate.substring(0, 4)}` : '19XX'}
                    {node.isLiving === false ? ' (Đã mất)' : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Slide-Over Profile Detail Drawer */}
      {selectedNode && (
        <div className="mfn-detail-drawer">
          <div className="mfn-drawer-header">
            <div className="mfn-drawer-title-group">
              <GenderAvatar
                gender={selectedNode.gender === 'MALE' ? 'male' : 'female'}
                size={44}
                avatarUrl={selectedNode.avatarUrl}
                name={selectedNode.fullName}
              />
              <div>
                <div className="mfn-drawer-name">{selectedNode.fullName}</div>
                <span className={`mfn-drawer-gender-tag ${selectedNode.gender.toLowerCase()}`}>
                  {selectedNode.gender === 'MALE' ? 'Nam' : 'Nữ'} - Thế hệ {selectedNode.generation || '—'}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="mfn-drawer-close-btn"
              onClick={() => setSelectedNode(null)}
              title="Đóng chi tiết"
            >
              &times;
            </button>
          </div>

          <div className="mfn-drawer-body">
            <div className="mfn-drawer-field">
              <span className="mfn-field-label">Quan hệ với bạn (Ego):</span>
              <span className="mfn-field-value highlight">
                {getRoleLabel(selectedNode.relativeRole, selectedNode.gender)}
              </span>
            </div>

            <div className="mfn-drawer-field">
              <span className="mfn-field-label">Dòng tộc trực thuộc:</span>
              <span className="mfn-field-value">
                {selectedNode.isCrossClan
                  ? `${spouseClan?.name || 'Mai Thế Tộc'} (Gia tộc thông gia / Phối ngẫu)`
                  : `${natalClan?.name || 'Dòng Họ Dương'} (Gia tộc của bạn)`}
              </span>
            </div>

            <div className="mfn-drawer-field">
              <span className="mfn-field-label">Năm sinh / Năm mất:</span>
              <span className="mfn-field-value">
                {selectedNode.birthDate || 'Chưa cập nhật'}
                {selectedNode.deathDate ? ` - ${selectedNode.deathDate}` : ''}
                {selectedNode.isLiving === false ? ' (Đã mất)' : ' (Còn sống)'}
              </span>
            </div>

            {selectedNode.occupation && (
              <div className="mfn-drawer-field">
                <span className="mfn-field-label">Nghề nghiệp / Quản trị:</span>
                <span className="mfn-field-value">{selectedNode.occupation}</span>
              </div>
            )}

            <div className="mfn-drawer-field">
              <span className="mfn-field-label">Trạng thái tài khoản:</span>
              <span className="mfn-field-value">
                {selectedNode.userId ? 'Đã liên kết tài khoản người dùng' : 'Chưa liên kết tài khoản'}
              </span>
            </div>

            <div className="mfn-drawer-field">
              <span className="mfn-field-label">Phạm vi chia sẻ thông gia:</span>
              <span className="mfn-field-value">
                {selectedNode.isCrossClan
                  ? 'Được cấp quyền chia sẻ trong phạm vi 4 thế hệ thông gia.'
                  : 'Dữ liệu nội bộ dòng họ của bạn.'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyFamilyNetworkView;
