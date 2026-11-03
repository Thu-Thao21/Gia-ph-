import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HybridTreeResponse, HybridTreeNode, HybridTreeBridge } from '../../../types/network';
import { fetchHybridTree } from '../../../services/network.service';
import './HybridTreeView.css';

export interface HybridTreeViewProps {
  linkId: string;
  onClose?: () => void;
  onOpenPolicyModal?: (linkId: string) => void;
}

export const HybridTreeView: React.FC<HybridTreeViewProps> = ({
  linkId,
  onClose,
  onOpenPolicyModal,
}) => {
  const [data, setData] = useState<HybridTreeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterClan, setFilterClan] = useState<'ALL' | 'PRIMARY' | 'PARTNER'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<HybridTreeNode | null>(null);

  // Pan & Zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const loadTree = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchHybridTree(linkId);
      setData(res);
    } catch (err) {
      console.error('Failed to load hybrid tree:', err);
    } finally {
      setLoading(false);
    }
  }, [linkId]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Layout Computation
  const layout = useMemo(() => {
    if (!data) return { positions: {}, nodes: [], edges: [], bridges: [] };

    const CARD_WIDTH = 170;
    const CARD_HEIGHT = 74;
    const X_GAP = 30;
    const Y_GAP = 140;

    const PRIMARY_CENTER_X = 420;
    const PARTNER_CENTER_X = 1180;
    const START_Y = 100;

    // Separate primary and partner nodes
    const primaryNodes = data.nodes.filter((n) => n.isPrimaryClan);
    const partnerNodes = data.nodes.filter((n) => !n.isPrimaryClan);

    // Group by generation
    const groupByGen = (nodesList: HybridTreeNode[]) => {
      const groups: Record<number, HybridTreeNode[]> = {};
      nodesList.forEach((n) => {
        const gen = n.generation || 1;
        if (!groups[gen]) groups[gen] = [];
        groups[gen].push(n);
      });
      return groups;
    };

    const primaryGens = groupByGen(primaryNodes);
    const partnerGens = groupByGen(partnerNodes);

    const positions: Record<string, { x: number; y: number }> = {};

    // Position Primary Clan Nodes (Left side)
    Object.entries(primaryGens).forEach(([genStr, list]) => {
      const gen = Number(genStr);
      const rowY = START_Y + (gen - 1) * Y_GAP;
      const totalWidth = list.length * CARD_WIDTH + (list.length - 1) * X_GAP;
      const startX = PRIMARY_CENTER_X - totalWidth / 2 + CARD_WIDTH / 2;

      list.forEach((node, i) => {
        positions[node.id] = {
          x: startX + i * (CARD_WIDTH + X_GAP),
          y: rowY,
        };
      });
    });

    // Position Partner Clan Nodes (Right side)
    Object.entries(partnerGens).forEach(([genStr, list]) => {
      const gen = Number(genStr);
      const rowY = START_Y + (gen - 1) * Y_GAP;
      const totalWidth = list.length * CARD_WIDTH + (list.length - 1) * X_GAP;
      const startX = PARTNER_CENTER_X - totalWidth / 2 + CARD_WIDTH / 2;

      list.forEach((node, i) => {
        positions[node.id] = {
          x: startX + i * (CARD_WIDTH + X_GAP),
          y: rowY,
        };
      });
    });

    // Filter nodes by clan filter
    let visibleNodes = data.nodes;
    if (filterClan === 'PRIMARY') {
      visibleNodes = primaryNodes;
    } else if (filterClan === 'PARTNER') {
      visibleNodes = partnerNodes;
    }

    // Filter edges
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = data.edges.filter(
      (e) => visibleNodeIds.has(e.fromMemberId) && visibleNodeIds.has(e.toMemberId)
    );

    return {
      positions,
      nodes: visibleNodes,
      edges: visibleEdges,
      bridges: data.bridges || [],
    };
  }, [data, filterClan]);

  // Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName !== 'svg') return;
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

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.15, 2.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.15, 0.6));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
  };

  // Search match
  const isSearchMatch = (name: string) => {
    if (!searchTerm.trim()) return false;
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  };

  if (loading) {
    return (
      <div className="htv-modal-overlay">
        <div className="htv-container" style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          Đang tải cây gia phả liên họ kết hợp...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="htv-modal-overlay">
        <div className="htv-container" style={{ padding: '60px', textAlign: 'center', color: '#dc2626' }}>
          Không thể tải dữ liệu cây liên họ hoặc bạn không có quyền truy cập.
          <br /><br />
          <button type="button" className="cnm-btn-secondary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    );
  }

  return (
    <div className="htv-modal-overlay" onClick={onClose}>
      <div className="htv-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="htv-header">
          <div className="htv-title-group">
            <h3 className="htv-title">
              Cây Gia Phả Liên Họ Kết Hợp
              <span className="htv-clan-badge-primary">{data.primaryClan.name}</span>
              <span style={{ color: '#94a3b8' }}>⟷</span>
              <span className="htv-clan-badge-partner">{data.partnerClan.name}</span>
            </h3>
            <div className="htv-subtitle">
              <span>Mối liên kết: <strong>{data.connectionType === 'IN_LAW' ? 'Họ Thông gia (IN_LAW)' : data.connectionType}</strong></span>
              <span>•</span>
              <span>Chính sách đối tác: <strong>{data.partnerClan.dataScope}</strong></span>
              <span>•</span>
              <span>Điểm nối: <strong>{data.bridges.length} cặp thông gia xác minh</strong></span>
            </div>
          </div>

          <div className="htv-header-actions">
            {/* Filter by Clan */}
            <select
              className="htv-filter-select"
              value={filterClan}
              onChange={(e) => setFilterClan(e.target.value as any)}
            >
              <option value="ALL">Xem cả hai dòng họ</option>
              <option value="PRIMARY">Chỉ dòng họ chính ({data.primaryClan.name})</option>
              <option value="PARTNER">Chỉ dòng họ liên kết ({data.partnerClan.name})</option>
            </select>

            {/* Search */}
            <input
              type="text"
              placeholder="Tìm thành viên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ntd-search-input"
              style={{ width: '180px' }}
            />

            {/* Policy adjustment shortcut */}
            {onOpenPolicyModal && (
              <button
                type="button"
                className="cnm-btn-secondary"
                style={{ fontSize: '12.5px', padding: '6px 12px' }}
                onClick={() => onOpenPolicyModal(linkId)}
              >
                Chính sách chia sẻ
              </button>
            )}

            <button type="button" className="htv-close-btn" onClick={onClose} title="Đóng cây liên họ">
              ✕
            </button>
          </div>
        </div>

        {/* Banner with In-Law Marriage Bridges & Tenant Isolation Note */}
        <div className="htv-banner">
          <div className="htv-bridges-list">
            <strong style={{ color: '#0f172a' }}>Cầu nối hôn nhân liên tộc:</strong>
            {data.bridges.length === 0 ? (
              <span style={{ color: '#64748b' }}>Chưa có cặp thông gia nào được Trưởng tộc hai bên xác minh.</span>
            ) : (
              data.bridges.map((b) => (
                <div key={b.id} className="htv-bridge-pill">
                  <span style={{ color: '#1e40af', fontWeight: 600 }}>{b.primaryPersonName}</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>⟷</span>
                  <span style={{ color: '#6b21a8', fontWeight: 600 }}>{b.partnerPersonName}</span>
                </div>
              ))
            )}
          </div>

          <div className="htv-privacy-badge-notice">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Dữ liệu {data.partnerClan.name} áp dụng bảo mật riêng tư & chế độ chỉ đọc.</span>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="htv-canvas-wrap">
          <svg
            className="htv-svg-canvas"
            viewBox="0 0 1600 900"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleReset}
          >
            <defs>
              <filter id="htv-card-shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1" />
              </filter>
            </defs>

            {/* Transform Group */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Clan Header Demarcation Regions */}
              {filterClan === 'ALL' && (
                <>
                  {/* Left: Primary Clan Title */}
                  <g transform="translate(420, 45)">
                    <rect x="-160" y="-18" width="320" height="36" rx="8" fill="#eff6ff" stroke="#bfdbfe" />
                    <text x="0" y="5" textAnchor="middle" fill="#1e40af" fontSize="14" fontWeight="700">
                      Cây Phả Hệ: {data.primaryClan.name} (Chính)
                    </text>
                  </g>

                  {/* Right: Partner Clan Title */}
                  <g transform="translate(1180, 45)">
                    <rect x="-160" y="-18" width="320" height="36" rx="8" fill="#faf5ff" stroke="#e9d5ff" />
                    <text x="0" y="5" textAnchor="middle" fill="#6b21a8" fontSize="14" fontWeight="700">
                      Cây Phả Hệ: {data.partnerClan.name} (Liên tộc)
                    </text>
                  </g>

                  {/* Vertical Dividing Line */}
                  <line x1="800" y1="30" x2="800" y2="850" stroke="#e2e8f0" strokeDasharray="6 6" strokeWidth="2" />
                </>
              )}

              {/* EDGES */}
              {layout.edges.map((edge) => {
                const posA = layout.positions[edge.fromMemberId];
                const posB = layout.positions[edge.toMemberId];
                if (!posA || !posB) return null;

                if (edge.isBridge) {
                  // Marriage Bridge Edge across clans
                  const midX = (posA.x + posB.x) / 2;
                  const midY = (posA.y + posB.y) / 2;
                  return (
                    <g key={edge.id}>
                      <path
                        d={`M ${posA.x} ${posA.y} C ${midX} ${posA.y}, ${midX} ${posB.y}, ${posB.x} ${posB.y}`}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="3.5"
                        strokeDasharray="4 2"
                      />
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect x="-70" y="-12" width="140" height="24" rx="12" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" filter="url(#htv-card-shadow)" />
                        <text x="0" y="4" textAnchor="middle" fill="#b45309" fontSize="10.5" fontWeight="700">
                          Hôn nhân liên họ
                        </text>
                      </g>
                    </g>
                  );
                }

                // Standard parent-child / internal relationship
                const isPrimary = edge.clanId === data.primaryClan.id;
                const strokeColor = isPrimary ? '#93c5fd' : '#c084fc';

                return (
                  <path
                    key={edge.id}
                    d={`M ${posA.x} ${posA.y + 37} C ${posA.x} ${(posA.y + posB.y) / 2}, ${posB.x} ${(posA.y + posB.y) / 2}, ${posB.x} ${posB.y - 37}`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="1.8"
                    opacity={0.8}
                  />
                );
              })}

              {/* NODES */}
              {layout.nodes.map((node) => {
                const pos = layout.positions[node.id];
                if (!pos) return null;

                const isSelected = selectedNode?.id === node.id;
                const isMatch = isSearchMatch(node.fullName);
                const isPrimary = node.isPrimaryClan;
                const isMasked = node.privacyLevel === 'MASKED' || node.fullName.includes('(Bảo mật)');

                const cardWidth = 170;
                const cardHeight = 74;

                const strokeColor = isSelected ? '#f59e0b' : isMatch ? '#f59e0b' : isPrimary ? '#3b82f6' : '#8b5cf6';
                const headerColor = isPrimary ? '#2563eb' : '#7c3aed';

                return (
                  <g
                    key={node.id}
                    className={`htv-node-card ${isSelected ? 'htv-node-selected' : ''}`}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={() => setSelectedNode(node)}
                  >
                    {/* Background Card */}
                    <rect
                      className="htv-card-bg"
                      x={-cardWidth / 2}
                      y={-cardHeight / 2}
                      width={cardWidth}
                      height={cardHeight}
                      rx="8"
                      fill="#ffffff"
                      stroke={strokeColor}
                      strokeWidth={isSelected || isMatch ? 2.5 : 1.5}
                      filter="url(#htv-card-shadow)"
                    />

                    {/* Top Header Strip */}
                    <path
                      d={`M ${-cardWidth / 2 + 8} ${-cardHeight / 2} L ${cardWidth / 2 - 8} ${-cardHeight / 2} Q ${cardWidth / 2} ${-cardHeight / 2} ${cardWidth / 2} ${-cardHeight / 2 + 8} L ${cardWidth / 2} ${-cardHeight / 2 + 18} L ${-cardWidth / 2} ${-cardHeight / 2 + 18} L ${-cardWidth / 2} ${-cardHeight / 2 + 8} Q ${-cardWidth / 2} ${-cardHeight / 2} ${-cardWidth / 2 + 8} ${-cardHeight / 2} Z`}
                      fill={headerColor}
                    />

                    {/* Header Label: Clan Name */}
                    <text
                      x="0"
                      y={-cardHeight / 2 + 12}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9.5"
                      fontWeight="700"
                    >
                      {isPrimary ? 'Họ chính' : 'Họ liên kết (Chỉ đọc)'}
                    </text>

                    {/* Full Name */}
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill={isMasked ? '#b45309' : '#0f172a'}
                      fontSize="12.5"
                      fontWeight="700"
                    >
                      {node.fullName.length > 20 ? node.fullName.substring(0, 18) + '...' : node.fullName}
                    </text>

                    {/* Subtitle / Generation */}
                    <text
                      x="0"
                      y="20"
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="11"
                    >
                      {node.generation > 0 ? `Đời ${node.generation}` : '—'} • {node.gender === 'male' || node.gender === 'Nam' ? 'Nam' : node.gender === 'female' || node.gender === 'Nữ' ? 'Nữ' : 'Khác'} • {node.isLiving ? 'Còn sống' : 'Đã mất'}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating Zoom Controls */}
          <div className="htv-floating-controls">
            <button type="button" className="htv-ctrl-btn" onClick={handleZoomIn} title="Phóng to">+</button>
            <button type="button" className="htv-ctrl-btn" onClick={handleZoomOut} title="Thu nhỏ">−</button>
            <button type="button" className="htv-ctrl-btn" onClick={handleReset} title="Đặt lại góc nhìn">1:1</button>
          </div>

          {/* Side Inspection Drawer */}
          {selectedNode && (
            <div className="htv-side-drawer">
              <div className="htv-drawer-header">
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#0f172a' }}>{selectedNode.fullName}</h4>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {selectedNode.clanName} ({selectedNode.isPrimaryClan ? 'Dòng họ chính' : 'Dòng họ đối tác'})
                  </div>
                </div>
                <button type="button" className="htv-close-btn" onClick={() => setSelectedNode(null)}>✕</button>
              </div>

              <div className="htv-drawer-body">
                <div className="htv-drawer-row">
                  <span className="htv-drawer-label">Thế hệ / Đời:</span>
                  <span className="htv-drawer-val">{selectedNode.generation > 0 ? `Đời ${selectedNode.generation}` : '—'}</span>
                </div>

                <div className="htv-drawer-row">
                  <span className="htv-drawer-label">Giới tính:</span>
                  <span className="htv-drawer-val">{selectedNode.gender}</span>
                </div>

                <div className="htv-drawer-row">
                  <span className="htv-drawer-label">Trạng thái:</span>
                  <span className="htv-drawer-val">{selectedNode.isLiving ? 'Còn sống' : 'Đã mất'}</span>
                </div>

                <div className="htv-drawer-row">
                  <span className="htv-drawer-label">Ngày sinh:</span>
                  <span className="htv-drawer-val">{selectedNode.birthDate || 'Chưa cập nhật / Ẩn theo chính sách'}</span>
                </div>

                {selectedNode.deathDate && (
                  <div className="htv-drawer-row">
                    <span className="htv-drawer-label">Ngày mất:</span>
                    <span className="htv-drawer-val">{selectedNode.deathDate}</span>
                  </div>
                )}

                <div className="htv-drawer-row">
                  <span className="htv-drawer-label">Bảo mật / Quyền riêng tư:</span>
                  <span className="htv-drawer-val" style={{ color: selectedNode.privacyLevel === 'MASKED' ? '#b45309' : '#15803d' }}>
                    {selectedNode.privacyLevel === 'OWN_CLAN'
                      ? 'Nội bộ dòng tộc'
                      : selectedNode.privacyLevel === 'MASKED'
                      ? 'Đã che giấu bảo mật'
                      : 'Được chia sẻ'}
                  </span>
                </div>

                {/* Tenant Isolation Guard Message */}
                {selectedNode.isReadOnly ? (
                  <div className="htv-readonly-warning">
                    <strong>Bản ghi chỉ đọc:</strong> Thành viên này thuộc sở hữu của {selectedNode.clanName}. Dòng họ khác không được phép thêm, sửa hoặc xóa dữ liệu trực tiếp.
                  </div>
                ) : (
                  <div className="htv-ownclan-notice">
                    <strong>Thành viên dòng họ bạn:</strong> Bạn có quyền quản trị và cập nhật hồ sơ thành viên này theo phân quyền được cấp.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HybridTreeView;

