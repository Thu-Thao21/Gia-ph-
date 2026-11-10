import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import type { MyFamilyNetworkResponse, MyFamilyNetworkNode } from '../../../types/network';
import { TreeNodeCard } from '../TreeNodeCard';
import { calculateTreeLayout, type TreeDirection } from '../treeLayoutAlgorithm';
import './ErgoTreeCanvas.css';

export const CARD_WIDTH = 140;
export const CARD_HEIGHT = 172;

export interface ErgoTreeCanvasProps {
  nodes: ErgoTreeNode[];
  onCardClick: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  zoomScale: number;
  direction?: TreeDirection;
  onViewInLawTree?: (clanId: string, personId: string) => void;
  inLawNetwork?: MyFamilyNetworkResponse | null;
  expandedInLawPersonId?: string | null;
  onToggleInLawExpand?: (personId: string) => void;
  isBilateralMode?: boolean;
  onBackToClanTree?: () => void;
  onRequestLineageAccess?: (
    ownerClanId: string,
    ownerClanName: string,
    anchorPersonId: string,
    anchorPersonName: string
  ) => void;
  onViewBurial?: (node: ErgoTreeNode) => void;
}

export const ErgoTreeCanvas: React.FC<ErgoTreeCanvasProps> = ({
  nodes,
  onCardClick,
  onContextMenu,
  zoomScale,
  direction = 'vertical',
  onViewInLawTree,
  inLawNetwork,
  expandedInLawPersonId,
  onToggleInLawExpand,
  isBilateralMode = false,
  onBackToClanTree,
  onRequestLineageAccess,
  onViewBurial,
}) => {
  // Set of explicitly expanded node IDs (all expanded by default in clan mode)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Canvas viewport drag-to-pan state
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    // Tự động mở rộng toàn bộ các tầng ở lần đầu nạp danh sách nút
    setExpandedIds((prev) => {
      if (prev.size > 0) return prev;
      const initialExpanded = new Set<string>();
      const expandRecursive = (n: ErgoTreeNode) => {
        initialExpanded.add(n.id);
        if (n.children && n.children.length > 0) {
          n.children.forEach(expandRecursive);
        }
      };
      nodes.forEach(expandRecursive);
      return initialExpanded;
    });
  }, [nodes]);

  const toggleNodeExpansion = (nodeId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // 1. STANDARD CLAN TREE LAYOUT (Bố cục toán học toàn dòng họ)
  const clanLayout = useMemo(() => {
    if (isBilateralMode) {
      return {
        units: [],
        flatUnits: [],
        busGroups: [],
        totalWidth: 1700,
        totalHeight: 1350,
        minX: 0,
        minY: 0,
        direction,
      };
    }
    return calculateTreeLayout(nodes, expandedIds, direction);
  }, [nodes, expandedIds, direction, isBilateralMode]);

  // Danh sách các thế hệ để vẽ thước đo thế hệ (Generation Ruler) và đường gióng ngang
  const generationList = useMemo(() => {
    if (isBilateralMode || !clanLayout.flatUnits || clanLayout.flatUnits.length === 0) return [];
    const gens = Array.from(new Set(clanLayout.flatUnits.map((u) => u.generation))).sort((a, b) => a - b);
    const titles: Record<number, string> = {
      1: 'Khởi Tổ',
      2: 'Tiền Nhân',
      3: 'Kế Thừa',
      4: 'Phát Triển',
      5: 'Hậu Duệ',
    };
    return gens.map((g) => ({
      generation: g,
      title: titles[g] || 'Tiếp Nối',
      topY: 60 + (g - 1) * 256,
    }));
  }, [clanLayout.flatUnits, isBilateralMode]);

  // 2. BILATERAL TREE NETWORK LAYOUT (Mạng lưới liên họ lấy Ego làm trung tâm)
  const bilateralLayout = useMemo(() => {
    if (!isBilateralMode || !inLawNetwork || !inLawNetwork.nodes || inLawNetwork.nodes.length === 0) {
      return null;
    }

    // Tọa độ Y các thế hệ: chừa khoảng trống phía trên cho tiêu đề dòng họ (top 24px, cao 60px)
    // LEVEL_Y[-2] = 230px -> Card top tại 230 - 86 = 144px -> Cách đáy tiêu đề đúng 60px khoảng trống rõ ràng
    const LEVEL_Y: Record<number, number> = {
      [-2]: 230, // Ông bà (Grandparents)
      [-1]: 490, // Cha mẹ (Parents)
      [0]: 750,  // Ego, Phối ngẫu, Anh chị em (Generation 0)
      [1]: 1010, // Con cái (Children)
    };

    const CX = 850;            // Global Center
    const EGO_X = CX - 270;    // 580 (Tâm nhánh dòng họ của bạn)
    const SPOUSE_X = CX + 270; // 1120 (Tâm nhánh dòng họ bên phối ngẫu)

    const positions: Record<string, { x: number; y: number }> = {};
    const natalByLevel: Record<number, MyFamilyNetworkNode[]> = { [-2]: [], [-1]: [], [0]: [], [1]: [] };
    const spouseByLevel: Record<number, MyFamilyNetworkNode[]> = { [-2]: [], [-1]: [], [0]: [], [1]: [] };
    const sharedChildren: MyFamilyNetworkNode[] = [];

    inLawNetwork.nodes.forEach((n) => {
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

    // 2.1. Level 0: Ego (Left) & Spouse (Right)
    const egoNode = inLawNetwork.nodes.find((n) => n.isEgo) || natalByLevel[0].find((n) => n.isEgo);
    const spouseNode = inLawNetwork.nodes.find((n) => n.isSpouse) || spouseByLevel[0].find((n) => n.isSpouse);
    const egoSiblings = (natalByLevel[0] || []).filter((n) => !n.isEgo && !n.isSpouse);
    const spouseSiblings = (spouseByLevel[0] || []).filter((n) => !n.isEgo && !n.isSpouse);

    if (egoNode) {
      positions[egoNode.id] = { x: EGO_X, y: LEVEL_Y[0] };
    }
    if (spouseNode) {
      positions[spouseNode.id] = { x: SPOUSE_X, y: LEVEL_Y[0] };
    }

    // Siblings đặt dịch chuyển ra ngoài
    egoSiblings.forEach((s, idx) => {
      positions[s.id] = { x: EGO_X - (idx + 1) * 220, y: LEVEL_Y[0] };
    });
    spouseSiblings.forEach((s, idx) => {
      positions[s.id] = { x: SPOUSE_X + (idx + 1) * 220, y: LEVEL_Y[0] };
    });

    // 2.2. Level -1: Parents
    const natalParents = natalByLevel[-1] || [];
    if (natalParents.length === 1) {
      positions[natalParents[0].id] = { x: EGO_X, y: LEVEL_Y[-1] };
    } else if (natalParents.length >= 2) {
      const sorted = [...natalParents].sort((a, b) => (a.gender === 'MALE' ? -1 : 1));
      positions[sorted[0].id] = { x: EGO_X - 110, y: LEVEL_Y[-1] };
      positions[sorted[1].id] = { x: EGO_X + 110, y: LEVEL_Y[-1] };
    }

    const spouseParents = spouseByLevel[-1] || [];
    if (spouseParents.length === 1) {
      positions[spouseParents[0].id] = { x: SPOUSE_X, y: LEVEL_Y[-1] };
    } else if (spouseParents.length >= 2) {
      const sorted = [...spouseParents].sort((a, b) => (a.gender === 'MALE' ? -1 : 1));
      positions[sorted[0].id] = { x: SPOUSE_X - 110, y: LEVEL_Y[-1] };
      positions[sorted[1].id] = { x: SPOUSE_X + 110, y: LEVEL_Y[-1] };
    }

    // 2.3. Level -2: Grandparents
    const natalGPs = natalByLevel[-2] || [];
    if (natalGPs.length === 1) {
      positions[natalGPs[0].id] = { x: EGO_X, y: LEVEL_Y[-2] };
    } else if (natalGPs.length >= 2) {
      const sorted = [...natalGPs].sort((a, b) => (a.gender === 'MALE' ? -1 : 1));
      positions[sorted[0].id] = { x: EGO_X - 110, y: LEVEL_Y[-2] };
      positions[sorted[1].id] = { x: EGO_X + 110, y: LEVEL_Y[-2] };
    }

    const spouseGPs = spouseByLevel[-2] || [];
    if (spouseGPs.length === 1) {
      positions[spouseGPs[0].id] = { x: SPOUSE_X, y: LEVEL_Y[-2] };
    } else if (spouseGPs.length >= 2) {
      const sorted = [...spouseGPs].sort((a, b) => (a.gender === 'MALE' ? -1 : 1));
      positions[sorted[0].id] = { x: SPOUSE_X - 110, y: LEVEL_Y[-2] };
      positions[sorted[1].id] = { x: SPOUSE_X + 110, y: LEVEL_Y[-2] };
    }

    // 2.4. Level 1: Shared Children
    if (sharedChildren.length === 1) {
      positions[sharedChildren[0].id] = { x: CX, y: LEVEL_Y[1] };
    } else if (sharedChildren.length > 1) {
      const totalW = (sharedChildren.length - 1) * 220;
      const startX = CX - totalW / 2;
      sharedChildren.forEach((ch, idx) => {
        positions[ch.id] = { x: startX + idx * 220, y: LEVEL_Y[1] };
      });
    }

    // Chuyển đổi từng node sang chuẩn ErgoTreeNode
    const renderedNodes = inLawNetwork.nodes.map((n) => {
      const pos = positions[n.id] || { x: CX, y: LEVEL_Y[0] };
      let roleTag = 'Thành viên';
      if (n.isEgo) roleTag = 'Bản thân (Ego)';
      else if (n.isSpouse) roleTag = n.gender === 'MALE' ? 'Chồng (Phối ngẫu)' : 'Vợ (Phối ngẫu)';
      else if (n.relativeRole === 'FATHER') roleTag = 'Thân phụ (Cha)';
      else if (n.relativeRole === 'MOTHER') roleTag = 'Thân mẫu (Mẹ)';
      else if (n.relativeRole === 'GRANDFATHER') roleTag = 'Ông nội / ngoại';
      else if (n.relativeRole === 'GRANDMOTHER') roleTag = 'Bà nội / ngoại';
      else if (n.relativeRole === 'SIBLING') roleTag = n.gender === 'MALE' ? 'Anh / Em trai' : 'Chị / Em gái';
      else if (n.relativeRole === 'CHILD') roleTag = n.gender === 'MALE' ? 'Con trai' : 'Con gái';

      const ergoNode: ErgoTreeNode = {
        id: n.id,
        fullName: n.fullName,
        gender: n.gender.toLowerCase(),
        generation: n.generation || (n.relativeLevel === -2 ? 3 : n.relativeLevel === -1 ? 4 : n.relativeLevel === 0 ? 5 : 6),
        isAlive: n.isLiving,
        avatarUrl: n.avatarUrl || undefined,
        birthDate: n.birthDate || undefined,
        deathDate: n.deathDate || undefined,
        occupation: n.occupation || undefined,
        focusRole: roleTag,
        isFocusPerson: n.isEgo || n.isSpouse,
        isCurrentUser: n.isCurrentUser || n.isEgo,
        userId: n.userId || undefined,
        spouses: [],
        children: [],
      };
      return {
        node: ergoNode,
        networkNode: n,
        x: pos.x,
        y: pos.y,
      };
    });

    // Nhóm các cặp vợ chồng cha mẹ và con cái để vẽ đường nối gia phả chính xác
    // Quy tắc: Nếu có vợ chồng thì nối từ GIỮA 2 vợ chồng chĩa xuống; nếu chưa có vợ thì nối 1 từ đáy thẻ
    const marriageEdges = (inLawNetwork.edges || []).filter((e) => e.type === 'MARRIAGE');
    const spouseMap = new Map<string, string>();
    marriageEdges.forEach((e) => {
      spouseMap.set(e.source, e.target);
      spouseMap.set(e.target, e.source);
    });

    const bloodEdges = (inLawNetwork.edges || []).filter((e) => e.type === 'BLOODLINE');
    const parentsOfChild = new Map<string, Set<string>>();
    bloodEdges.forEach((e) => {
      const cur = parentsOfChild.get(e.target) || new Set<string>();
      cur.add(e.source);
      parentsOfChild.set(e.target, cur);
    });

    interface BilateralFamilyUnit {
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

    const familyUnits: BilateralFamilyUnit[] = [];
    const processedParents = new Set<string>();

    [-2, -1].forEach((lvl) => {
      const nodesAtLevel = inLawNetwork.nodes.filter((n) => n.relativeLevel === lvl);
      nodesAtLevel.forEach((p) => {
        if (processedParents.has(p.id)) return;

        const pPos = positions[p.id];
        if (!pPos) return;

        const spouseId = spouseMap.get(p.id);
        const spouseNode = spouseId ? inLawNetwork.nodes.find((n) => n.id === spouseId) : undefined;
        const sPos = spouseNode ? positions[spouseNode.id] : undefined;

        let stemX: number;
        let stemY: number;
        let parentBracket: BilateralFamilyUnit['parentBracket'] = undefined;

        const parentBottomY = pPos.y + CARD_HEIGHT / 2;
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
        const childrenNodes = inLawNetwork.nodes.filter((n) => {
          if (n.relativeLevel !== lvl + 1) return false;
          const pars = parentsOfChild.get(n.id);
          return pars ? parentIds.some((pid) => pars.has(pid)) : false;
        });

        if (childrenNodes.length === 0) return;

        const processedChildrenInGroup = new Set<string>();
        const childrenTargets: BilateralFamilyUnit['children'] = [];

        childrenNodes.forEach((ch) => {
          if (processedChildrenInGroup.has(ch.id)) return;
          processedChildrenInGroup.add(ch.id);

          const chPos = positions[ch.id];
          if (!chPos) return;

          const chSpouseId = spouseMap.get(ch.id);
          const chSpouseNode = chSpouseId ? inLawNetwork.nodes.find((n) => n.id === chSpouseId) : undefined;
          const chSpousePos = chSpouseNode ? positions[chSpouseNode.id] : undefined;

          const childTopY = chPos.y - CARD_HEIGHT / 2;
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

    const allX = Object.values(positions).map((p) => p.x);
    const minX = allX.length > 0 ? Math.min(...allX) - 180 : 0;
    const maxX = allX.length > 0 ? Math.max(...allX) + 180 : 1700;
    const canvasWidth = Math.max(1700, maxX - minX + 300);
    const canvasHeight = 1350;

    return {
      positions,
      renderedNodes,
      edges: inLawNetwork.edges || [],
      familyUnits,
      sharedChildren,
      canvasWidth,
      canvasHeight,
      CX,
      EGO_X,
      SPOUSE_X,
      LEVEL_Y,
      egoNode,
      spouseNode,
      natalClan: inLawNetwork.natalClan,
      spouseClan: inLawNetwork.spouseClan,
    };
  }, [isBilateralMode, inLawNetwork]);

  // Kích thước canvas thực tế
  const totalCanvasWidth = isBilateralMode && bilateralLayout
    ? bilateralLayout.canvasWidth
    : clanLayout.totalWidth;
  const totalCanvasHeight = isBilateralMode && bilateralLayout
    ? bilateralLayout.canvasHeight
    : clanLayout.totalHeight;

  // Tự động căn giữa viewport mượt mà không nhấp nháy
  useEffect(() => {
    if (!viewportRef.current) return;

    const timer = setTimeout(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      if (isBilateralMode && bilateralLayout) {
        const targetX = bilateralLayout.CX;
        const targetY = bilateralLayout.LEVEL_Y[0];
        const vW = viewport.clientWidth;
        const vH = viewport.clientHeight;
        viewport.scrollTo({
          left: Math.max(0, targetX * zoomScale - vW / 2),
          top: Math.max(0, (targetY - 120) * zoomScale - vH / 2),
          behavior: 'smooth',
        });
        return;
      }

      const focusCard = viewport.querySelector('.tree-person-card.is-focus-card') as HTMLElement;
      if (focusCard) {
        focusCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } else {
        if (direction === 'horizontal') {
          viewport.scrollLeft = 0;
          const contentHeight = totalCanvasHeight * zoomScale;
          const viewportHeight = viewport.clientHeight;
          if (contentHeight > viewportHeight) {
            viewport.scrollTop = (contentHeight - viewportHeight) / 2;
          } else {
            viewport.scrollTop = 0;
          }
        } else {
          const contentWidth = totalCanvasWidth * zoomScale;
          const viewportWidth = viewport.clientWidth;
          if (contentWidth > viewportWidth) {
            viewport.scrollLeft = (contentWidth - viewportWidth) / 2;
          } else {
            viewport.scrollLeft = 0;
          }
          viewport.scrollTop = 0;
        }
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [isBilateralMode, zoomScale, totalCanvasWidth, totalCanvasHeight, direction, bilateralLayout]);

  const handleNodeClick = (e: React.MouseEvent, node: ErgoTreeNode) => {
    onCardClick(e, node);
  };

  // Drag to pan viewport handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('.tree-person-card') ||
      (e.target as HTMLElement).closest('.tree-node-toggle-btn') ||
      (e.target as HTMLElement).closest('.tree-toggle-inlaw-btn')
    ) {
      return;
    }
    setIsDragging(true);
    if (viewportRef.current) {
      setStartX(e.pageX - viewportRef.current.offsetLeft);
      setStartY(e.pageY - viewportRef.current.offsetTop);
      setScrollLeft(viewportRef.current.scrollLeft);
      setScrollTop(viewportRef.current.scrollTop);
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !viewportRef.current) return;
    e.preventDefault();
    const x = e.pageX - viewportRef.current.offsetLeft;
    const y = e.pageY - viewportRef.current.offsetTop;
    const walkX = (x - startX) * 1.5;
    const walkY = (y - startY) * 1.5;
    viewportRef.current.scrollLeft = scrollLeft - walkX;
    viewportRef.current.scrollTop = scrollTop - walkY;
  };

  return (
    <div
      ref={viewportRef}
      className={`tree-canvas-viewport ${isDragging ? 'is-panning' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      <div
        className={`tree-canvas-inner direction-${direction} ${isBilateralMode ? 'is-bilateral-mode' : ''}`}
        style={{
          position: 'relative',
          width: `${totalCanvasWidth}px`,
          height: `${totalCanvasHeight}px`,
          transform: `scale(${zoomScale})`,
          transformOrigin: 'top center',
          transition: 'transform 0.25s ease-out',
        }}
      >
        {/* ========================================================================= */}
        {/* CASE A: BILATERAL NETWORK CANVAS (MẠNG LƯỚI LIÊN HỌ THỐNG NHẤT 4 ĐỜI)     */}
        {/* ========================================================================= */}
        {isBilateralMode && bilateralLayout ? (
          <>
            {/* 1. Dual Lineage Header Banners at Top (Chừa khoảng trống 60px trên nhánh) */}
            <div
              className="tree-bilateral-column-header natal"
              style={{
                position: 'absolute',
                left: `${bilateralLayout.EGO_X - 180}px`,
                top: '24px',
                width: '360px',
                textAlign: 'center',
                padding: '10px 18px',
                background: '#eff6ff',
                border: '1.5px solid #93c5fd',
                borderRadius: '16px',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.08)',
                zIndex: 3,
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                Dòng họ của bạn (Nội tộc)
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e3a8a', marginTop: '2px' }}>
                {bilateralLayout.natalClan?.name?.toUpperCase() || 'DÒNG HỌ DƯƠNG'}
              </div>
            </div>

            <div
              className="tree-bilateral-column-header spouse"
              style={{
                position: 'absolute',
                left: `${bilateralLayout.SPOUSE_X - 180}px`,
                top: '24px',
                width: '360px',
                textAlign: 'center',
                padding: '10px 18px',
                background: '#f5f3ff',
                border: '1.5px solid #c4b5fd',
                borderRadius: '16px',
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.08)',
                zIndex: 3,
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                Dòng họ bên phối ngẫu (Thông gia)
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#5b21b6', marginTop: '2px' }}>
                {bilateralLayout.spouseClan?.name?.toUpperCase() || 'MAI THẾ TỘC'} [4 ĐỜI CHIA SẺ]
              </div>
            </div>

            {/* 2. SVG Connectors Layer */}
            <svg
              className="tree-svg-connector-canvas bilateral"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${totalCanvasWidth}px`,
                height: `${totalCanvasHeight}px`,
                pointerEvents: 'none',
                zIndex: 1,
                overflow: 'visible',
              }}
            >
              <defs>
                <linearGradient id="bilateralBridgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2563eb" />
                  <stop offset="50%" stopColor="#7c3aed" />
                  <stop offset="100%" stopColor="#9333ea" />
                </linearGradient>
              </defs>

              {/* Render edges */}
              {bilateralLayout.edges.map((edge) => {
                const src = bilateralLayout.positions[edge.source];
                const tgt = bilateralLayout.positions[edge.target];
                if (!src || !tgt) return null;

                if (edge.type === 'INTER_CLAN_BRIDGE') {
                  const x1 = Math.min(src.x, tgt.x) + CARD_WIDTH / 2;
                  const x2 = Math.max(src.x, tgt.x) - CARD_WIDTH / 2;
                  const y = src.y;

                  return (
                    <g key={edge.id} className="mfn-bridge-connector">
                      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#c4b5fd" strokeWidth="8" strokeOpacity="0.4" />
                      <line x1={x1} y1={y} x2={x2} y2={y} stroke="url(#bilateralBridgeGrad)" strokeWidth="3.5" />
                      {/* Marriage Ring Badge */}
                      <g transform={`translate(${bilateralLayout.CX}, ${y})`}>
                        <rect
                          x="-88"
                          y="-16"
                          width="176"
                          height="32"
                          rx="16"
                          fill="#ffffff"
                          stroke="#7c3aed"
                          strokeWidth="2"
                          filter="drop-shadow(0 3px 8px rgba(124, 58, 237, 0.22))"
                        />
                        <circle cx="-62" cy="0" r="5.5" fill="none" stroke="#7c3aed" strokeWidth="2.2" />
                        <circle cx="-56" cy="0" r="5.5" fill="none" stroke="#db2777" strokeWidth="2.2" />
                        <text x="10" y="4.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#6d28d9">
                          HÔN PHỐI LIÊN TỘC
                        </text>
                      </g>
                    </g>
                  );
                }

                if (edge.type === 'MARRIAGE') {
                  const x1 = Math.min(src.x, tgt.x) + CARD_WIDTH / 2;
                  const x2 = Math.max(src.x, tgt.x) - CARD_WIDTH / 2;
                  const y = src.y;
                  const midX = (x1 + x2) / 2;

                  return (
                    <g key={edge.id} className="mfn-marriage-connector">
                      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#e2e8f0" strokeWidth="5" />
                      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#db2777" strokeWidth="2.5" />
                      <g transform={`translate(${midX}, ${y})`}>
                        <circle cx="0" cy="0" r="12" fill="#fdf2f8" stroke="#db2777" strokeWidth="1.5" />
                        <text x="0" y="3.5" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#be185d">
                          Vợ
                        </text>
                      </g>
                    </g>
                  );
                }

                return null;
              })}

              {/* 3. Đường nối thế hệ: Nối từ giữa 2 vợ chồng chĩa xuống con/cặp vợ chồng con */}
              {bilateralLayout.familyUnits.map((unit) => {
                const chCount = unit.children.length;
                if (chCount === 0) return null;

                const minTargetY = Math.min(...unit.children.map((c) => c.targetY));
                const midY = (unit.stemY + minTargetY) / 2;
                const minX = Math.min(...unit.children.map((c) => c.targetX), unit.stemX);
                const maxX = Math.max(...unit.children.map((c) => c.targetX), unit.stemX);

                return (
                  <g key={unit.id} className="mfn-family-unit-connector">
                    {/* 1. Parent Bracket: Bố mẹ có vợ chồng thì nối từ đáy 2 vợ chồng vào thanh ngang, nút giao ở chính giữa */}
                    {unit.parentBracket && (
                      <>
                        <line
                          x1={unit.parentBracket.leftX}
                          y1={unit.parentBracket.parentBottomY}
                          x2={unit.parentBracket.leftX}
                          y2={unit.parentBracket.bracketY}
                          stroke="#ffffff"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
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
                          stroke="#ffffff"
                          strokeWidth="5"
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
                          stroke="#ffffff"
                          strokeWidth="5"
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

                    {/* 2. Đường thả từ giữa 2 vợ chồng xuống con */}
                    {chCount === 1 && Math.abs(unit.stemX - unit.children[0].targetX) < 3 ? (
                      <>
                        <line
                          x1={unit.stemX}
                          y1={unit.stemY}
                          x2={unit.stemX}
                          y2={unit.children[0].targetY}
                          stroke="#ffffff"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                        <line
                          x1={unit.stemX}
                          y1={unit.stemY}
                          x2={unit.stemX}
                          y2={unit.children[0].targetY}
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </>
                    ) : chCount === 1 ? (
                      <>
                        <path
                          d={`M ${unit.stemX} ${unit.stemY} L ${unit.stemX} ${midY} L ${unit.children[0].targetX} ${midY} L ${unit.children[0].targetX} ${unit.children[0].targetY}`}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                        <path
                          d={`M ${unit.stemX} ${unit.stemY} L ${unit.stemX} ${midY} L ${unit.children[0].targetX} ${midY} L ${unit.children[0].targetX} ${unit.children[0].targetY}`}
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </>
                    ) : (
                      <>
                        <line
                          x1={unit.stemX}
                          y1={unit.stemY}
                          x2={unit.stemX}
                          y2={midY}
                          stroke="#ffffff"
                          strokeWidth="5"
                          strokeLinecap="round"
                        />
                        <line
                          x1={unit.stemX}
                          y1={unit.stemY}
                          x2={unit.stemX}
                          y2={midY}
                          stroke="#2563eb"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                        <circle cx={unit.stemX} cy={midY} r="3.5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
                        <line
                          x1={minX}
                          y1={midY}
                          x2={maxX}
                          y2={midY}
                          stroke="#ffffff"
                          strokeWidth="5"
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
                          <React.Fragment key={`drop-${ch.id}`}>
                            <line
                              x1={ch.targetX}
                              y1={midY}
                              x2={ch.targetX}
                              y2={ch.targetY}
                              stroke="#ffffff"
                              strokeWidth="5"
                              strokeLinecap="round"
                            />
                            <line
                              x1={ch.targetX}
                              y1={midY}
                              x2={ch.targetX}
                              y2={ch.targetY}
                              stroke="#2563eb"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
                          </React.Fragment>
                        ))}
                      </>
                    )}

                    {/* 3. Child Bracket: Nếu con đã có vợ chồng thì chỉa xuống cả 2 vợ chồng con */}
                    {unit.children.map((ch) => {
                      if (!ch.childBracket) {
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

                      return (
                        <g key={`bracket-${ch.id}`} className="mfn-child-bracket">
                          <line
                            x1={ch.childBracket.leftX}
                            y1={ch.childBracket.forkY}
                            x2={ch.childBracket.rightX}
                            y2={ch.childBracket.forkY}
                            stroke="#ffffff"
                            strokeWidth="5"
                            strokeLinecap="round"
                          />
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
                            stroke="#ffffff"
                            strokeWidth="5"
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
                            stroke="#ffffff"
                            strokeWidth="5"
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

              {/* Children stem from Ego-Spouse marriage bridge */}
              {bilateralLayout.sharedChildren.length > 0 && (
                <g className="mfn-children-stem">
                  <line
                    x1={bilateralLayout.CX}
                    y1={bilateralLayout.LEVEL_Y[0] + 16}
                    x2={bilateralLayout.CX}
                    y2={880}
                    stroke="#ffffff"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  <line
                    x1={bilateralLayout.CX}
                    y1={bilateralLayout.LEVEL_Y[0] + 16}
                    x2={bilateralLayout.CX}
                    y2={880}
                    stroke="#7c3aed"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {bilateralLayout.sharedChildren.length === 1 ? (
                    <>
                      <line
                        x1={bilateralLayout.CX}
                        y1={880}
                        x2={bilateralLayout.CX}
                        y2={bilateralLayout.LEVEL_Y[1] - CARD_HEIGHT / 2}
                        stroke="#ffffff"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                      <line
                        x1={bilateralLayout.CX}
                        y1={880}
                        x2={bilateralLayout.CX}
                        y2={bilateralLayout.LEVEL_Y[1] - CARD_HEIGHT / 2}
                        stroke="#7c3aed"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={bilateralLayout.CX}
                        cy={bilateralLayout.LEVEL_Y[1] - CARD_HEIGHT / 2}
                        r="3.5"
                        fill="#7c3aed"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </>
                  ) : (
                    <>
                      <line
                        x1={bilateralLayout.positions[bilateralLayout.sharedChildren[0].id]?.x || bilateralLayout.CX}
                        y1={880}
                        x2={bilateralLayout.positions[bilateralLayout.sharedChildren[bilateralLayout.sharedChildren.length - 1].id]?.x || bilateralLayout.CX}
                        y2={880}
                        stroke="#ffffff"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                      <line
                        x1={bilateralLayout.positions[bilateralLayout.sharedChildren[0].id]?.x || bilateralLayout.CX}
                        y1={880}
                        x2={bilateralLayout.positions[bilateralLayout.sharedChildren[bilateralLayout.sharedChildren.length - 1].id]?.x || bilateralLayout.CX}
                        y2={880}
                        stroke="#7c3aed"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      {bilateralLayout.sharedChildren.map((ch) => {
                        const chPos = bilateralLayout.positions[ch.id];
                        if (!chPos) return null;
                        return (
                          <React.Fragment key={`ch-line-${ch.id}`}>
                            <line
                              x1={chPos.x}
                              y1={880}
                              x2={chPos.x}
                              y2={bilateralLayout.LEVEL_Y[1] - CARD_HEIGHT / 2}
                              stroke="#ffffff"
                              strokeWidth="5"
                              strokeLinecap="round"
                            />
                            <line
                              x1={chPos.x}
                              y1={880}
                              x2={chPos.x}
                              y2={bilateralLayout.LEVEL_Y[1] - CARD_HEIGHT / 2}
                              stroke="#7c3aed"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
                            <circle
                              cx={chPos.x}
                              cy={bilateralLayout.LEVEL_Y[1] - CARD_HEIGHT / 2}
                              r="3.5"
                              fill="#7c3aed"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                            />
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}
                </g>
              )}
            </svg>

            {/* 3. Render Person Cards (Chừa khoảng trống 60px so với tiêu đề, tuyệt đối không đè) */}
            {bilateralLayout.renderedNodes.map((item) => (
              <div
                key={item.node.id}
                className="tree-layout-unit-wrapper bilateral-unit"
                style={{
                  position: 'absolute',
                  left: `${item.x - CARD_WIDTH / 2}px`,
                  top: `${item.y - CARD_HEIGHT / 2}px`,
                  width: `${CARD_WIDTH}px`,
                  minHeight: `${CARD_HEIGHT}px`,
                  zIndex: 2,
                }}
              >
                <TreeNodeCard
                  node={item.node}
                  onCardClick={handleNodeClick}
                  onContextMenu={onContextMenu}
                  hasChildren={
                    item.networkNode.relativeLevel === -2 ||
                    item.networkNode.relativeLevel === -1 ||
                    (item.networkNode.relativeLevel === 0 && Boolean(bilateralLayout.sharedChildren.length))
                  }
                  isExpanded={true}
                  onViewInLawTree={onViewInLawTree}
                  onViewBurial={onViewBurial}
                />

                {/* Badge trạng thái quyền xem phả hệ bên phối ngẫu */}
                {item.networkNode.isSpouse && (
                  <div
                    style={{
                      marginTop: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {item.networkNode.grantStatus === 'AWAITING_SPOUSE' ? (
                      <span
                        style={{
                          fontSize: '9.5px',
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          textAlign: 'center',
                          display: 'inline-block',
                        }}
                      >
                        Chờ phối ngẫu xác nhận
                      </span>
                    ) : item.networkNode.grantStatus === 'PENDING_ADMIN_VERIFICATION' ? (
                      <span
                        style={{
                          fontSize: '9.5px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          textAlign: 'center',
                          display: 'inline-block',
                        }}
                      >
                        Chờ Trưởng tộc xác minh
                      </span>
                    ) : item.networkNode.grantStatus === 'MARRIAGE_REJECTED' ? (
                      <span
                        style={{
                          fontSize: '9.5px',
                          background: '#fef2f2',
                          color: '#b91c1c',
                          border: '1px solid #fecaca',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          textAlign: 'center',
                          display: 'inline-block',
                        }}
                      >
                        Hôn phối chưa xác minh
                      </span>
                    ) : item.networkNode.grantStatus === 'APPROVED' ? (
                      <span
                        style={{
                          fontSize: '10px',
                          background: '#ecfdf5',
                          color: '#047857',
                          border: '1px solid #a7f3d0',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          textAlign: 'center',
                          display: 'inline-block',
                        }}
                      >
                        ✓ Đã cấp quyền 4 đời
                      </span>
                    ) : item.networkNode.grantStatus === 'PENDING' ? (
                      <span
                        style={{
                          fontSize: '10px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          textAlign: 'center',
                          display: 'inline-block',
                        }}
                      >
                        Đang chờ duyệt xem gia phả
                      </span>
                    ) : item.networkNode.grantStatus === 'REJECTED' ? (
                      <>
                        <span
                          style={{
                            fontSize: '9.5px',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            textAlign: 'center',
                            maxWidth: '136px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={`Từ chối: ${item.networkNode.rejectionReason || 'Chưa đủ điều kiện'}`}
                        >
                          Từ chối: {item.networkNode.rejectionReason || 'Chưa duyệt'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRequestLineageAccess?.(
                              item.networkNode.clanId,
                              item.networkNode.clanName,
                              item.networkNode.id,
                              item.networkNode.fullName
                            );
                          }}
                          style={{
                            background: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Gửi lại yêu cầu
                        </button>
                      </>
                    ) : item.networkNode.grantStatus === 'REVOKED' ? (
                      <>
                        <span
                          style={{
                            fontSize: '9.5px',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            border: '1px solid #fecaca',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            textAlign: 'center',
                            maxWidth: '136px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={`Đã thu hồi: ${item.networkNode.revocationReason || 'Trưởng tộc thu hồi'}`}
                        >
                          Đã thu hồi quyền xem
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRequestLineageAccess?.(
                              item.networkNode.clanId,
                              item.networkNode.clanName,
                              item.networkNode.id,
                              item.networkNode.fullName
                            );
                          }}
                          style={{
                            background: '#4f46e5',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Xin cấp lại quyền
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          style={{
                            fontSize: '9.5px',
                            background: '#fef3c7',
                            color: '#b45309',
                            border: '1px solid #fde68a',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            textAlign: 'center',
                          }}
                        >
                          Chưa cấp quyền xem phả hệ
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRequestLineageAccess?.(
                              item.networkNode.clanId,
                              item.networkNode.clanName,
                              item.networkNode.id,
                              item.networkNode.fullName
                            );
                          }}
                          style={{
                            background: '#4f46e5',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                          }}
                        >
                          Xin cấp quyền 4 đời
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        ) : (
          /* ========================================================================= */
          /* CASE B: STANDARD CLAN TREE CANVAS (CÂY PHẢ HỆ TOÀN DÒNG HỌ NỘI TỘC)       */
          /* ========================================================================= */
          <>
            {/* SVG Connector Layer */}
            <svg
              className="tree-svg-connector-canvas"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${totalCanvasWidth}px`,
                height: `${totalCanvasHeight}px`,
                pointerEvents: 'none',
                zIndex: 1,
                overflow: 'visible',
              }}
            >
              <defs>
                <filter id="junctionShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#1e3a8a" floodOpacity="0.28" />
                </filter>
              </defs>

              {/* Đường gióng ngang mờ phân cách giữa các thế hệ */}
              {generationList.map((gen) => (
                <g key={`gen-guide-${gen.generation}`} className="tree-generation-guideline">
                  <line
                    x1="0"
                    y1={gen.topY - 14}
                    x2={totalCanvasWidth}
                    y2={gen.topY - 14}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                    strokeDasharray="6 6"
                    strokeOpacity="0.45"
                  />
                </g>
              ))}

              {clanLayout.busGroups.map((bus) => (
                <g key={bus.id} className="tree-bus-group">
                  {/* Trunk Line */}
                  {bus.trunkPath && (
                    <>
                      <path
                        d={bus.trunkPath}
                        stroke="#ffffff"
                        strokeWidth="5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={bus.trunkPath}
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}

                  {/* Bus Bar */}
                  {bus.busBarPath && (
                    <>
                      <path
                        d={bus.busBarPath}
                        stroke="#ffffff"
                        strokeWidth="5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <path
                        d={bus.busBarPath}
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={bus.trunkJunction.x}
                        cy={bus.trunkJunction.y}
                        r="4"
                        fill="#2563eb"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        filter="url(#junctionShadow)"
                      />
                    </>
                  )}

                  {/* Drop Lines */}
                  {bus.dropPaths.map((dp, dpIdx) => (
                    <React.Fragment key={dpIdx}>
                      <path
                        d={dp}
                        stroke="#ffffff"
                        strokeWidth="5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={dp}
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </React.Fragment>
                  ))}

                  {/* Drop Junction Dots */}
                  {bus.dropJunctions.map((dj, djIdx) => (
                    <circle
                      key={djIdx}
                      cx={dj.x}
                      cy={dj.y}
                      r="3.5"
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      filter="url(#junctionShadow)"
                    />
                  ))}
                </g>
              ))}
            </svg>

            {/* Thước đo mốc thế hệ ở lề trái canvas */}
            {clanLayout.direction === 'vertical' && generationList.length > 0 && (
              <div className="tree-generation-ruler" style={{ pointerEvents: 'none', zIndex: 3 }}>
                {generationList.map((gen) => (
                  <div
                    key={`ruler-${gen.generation}`}
                    className="tree-generation-ruler-badge"
                    style={{
                      position: 'absolute',
                      top: `${gen.topY - 11}px`,
                      left: '24px',
                    }}
                  >
                    <span className="ruler-gen-num">ĐỜI {gen.generation}</span>
                    <span className="ruler-gen-title">{gen.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Main Clan Flat Layout Units */}
            {clanLayout.flatUnits.map((unit) => (
              <div
                key={unit.id}
                className="tree-layout-unit-wrapper"
                style={{
                  position: 'absolute',
                  left: `${unit.x}px`,
                  top: `${unit.y}px`,
                  width: `${unit.width}px`,
                  height: `${unit.height}px`,
                  zIndex: 2,
                }}
              >
                <TreeNodeCard
                  node={unit.node}
                  onCardClick={handleNodeClick}
                  onContextMenu={onContextMenu}
                  hasChildren={unit.hasChildren}
                  isExpanded={unit.isExpanded}
                  onToggleExpand={(_e, targetNode) => toggleNodeExpansion(targetNode.id)}
                  onViewInLawTree={onViewInLawTree}
                  isInLawExpanded={Boolean(
                    expandedInLawPersonId &&
                    (unit.node.id === expandedInLawPersonId ||
                     (unit.node.spouses && unit.node.spouses.some((s) => s.id === expandedInLawPersonId)))
                  )}
                  onToggleInLawExpand={onToggleInLawExpand}
                  onViewBurial={onViewBurial}
                />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default ErgoTreeCanvas;