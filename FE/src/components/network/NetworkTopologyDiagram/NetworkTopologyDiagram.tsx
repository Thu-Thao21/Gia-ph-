import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NetworkDiagramNode, NetworkDiagramEdge, NetworkDiagramResponse } from '../../../types/network';
import { fetchNetworkDiagram } from '../../../services/network.service';
import './NetworkTopologyDiagram.css';

interface NetworkTopologyDiagramProps {
  clanId?: string;
  onOpenPolicyModal?: (linkId: string) => void;
  onOpenPersonMappings?: (linkId: string) => void;
  onOpenHybridTree?: (linkId: string) => void;
}

export const NetworkTopologyDiagram: React.FC<NetworkTopologyDiagramProps> = ({
  clanId,
  onOpenPolicyModal,
  onOpenPersonMappings,
  onOpenHybridTree,
}) => {
  const [data, setData] = useState<NetworkDiagramResponse>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'ALL' | 'IN_LAW' | 'ANCESTRAL' | 'ALLIED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Pan & Zoom State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const loadDiagram = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchNetworkDiagram();
      setData(res || { nodes: [], edges: [] });
    } catch (err) {
      console.error('Failed to load network diagram:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiagram();
  }, [loadDiagram]);

  // Canvas bounds
  const CANVAS_WIDTH = 1000;
  const CANVAS_HEIGHT = 680;
  const CENTER_X = CANVAS_WIDTH / 2;
  const CENTER_Y = CANVAS_HEIGHT / 2;

  // Compute Layout Positions
  const layout = useMemo(() => {
    const rawNodes = data.nodes || [];
    const rawEdges = data.edges || [];

    // Filter edges by type
    const activeEdges = rawEdges.filter((e) => {
      if (filterType === 'ALL') return true;
      return e.connectionType === filterType;
    });

    const activeEdgeNodeIds = new Set<string>();
    activeEdges.forEach((e) => {
      activeEdgeNodeIds.add(e.source);
      activeEdgeNodeIds.add(e.target);
    });

    // Identify Center Node (Caller's active clan)
    const centerNode =
      rawNodes.find((n) => n.id.toLowerCase() === (clanId || '').toLowerCase()) ||
      rawNodes.find((n) => n.isCallerClan) ||
      rawNodes[0];

    const centerId = centerNode ? centerNode.id : '';

    // Connected nodes (excluding center)
    const connectedNodes = rawNodes.filter(
      (n) => n.id !== centerId && (activeEdgeNodeIds.has(n.id) || n.isLinked)
    );

    // Unlinked / Other nodes
    const otherNodes = rawNodes.filter(
      (n) => n.id !== centerId && !activeEdgeNodeIds.has(n.id) && !n.isLinked
    );

    const positions: Record<string, { x: number; y: number; radius: number }> = {};

    // 1. Center node
    if (centerNode) {
      positions[centerNode.id] = { x: CENTER_X, y: CENTER_Y, radius: 46 };
    }

    // 2. Connected Nodes in inner orbit (R = 240)
    const innerRadius = 240;
    const nConnected = connectedNodes.length;
    connectedNodes.forEach((node, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(nConnected, 1) - Math.PI / 2;
      positions[node.id] = {
        x: CENTER_X + innerRadius * Math.cos(angle),
        y: CENTER_Y + innerRadius * Math.sin(angle),
        radius: 38,
      };
    });

    // 3. Other available clans in outer orbit (R = 380)
    const outerRadius = 380;
    const nOther = otherNodes.length;
    otherNodes.forEach((node, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(nOther, 1) - Math.PI / 4;
      positions[node.id] = {
        x: CENTER_X + outerRadius * Math.cos(angle),
        y: CENTER_Y + outerRadius * Math.sin(angle),
        radius: 28,
      };
    });

    // Visible nodes list
    let visibleNodes = rawNodes;
    if (filterType !== 'ALL') {
      visibleNodes = rawNodes.filter((n) => n.id === centerId || activeEdgeNodeIds.has(n.id));
    }

    return {
      nodes: visibleNodes,
      edges: activeEdges,
      positions,
      centerId,
    };
  }, [data, filterType, clanId]);

  // Selected Item details
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return layout.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, layout.nodes]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return layout.edges.find((e) => e.id === selectedEdgeId) || null;
  }, [selectedEdgeId, layout.edges]);

  // Connected edges for selected node
  const selectedNodeEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return layout.edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId);
  }, [selectedNodeId, layout.edges]);

  // Pan handlers
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
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  const getNodeColor = (node: NetworkDiagramNode) => {
    if (node.id === layout.centerId || node.isCallerClan) return '#2563eb'; // Royal Blue
    switch (node.category) {
      case 'IN_LAW':
        return '#7c3aed'; // Purple
      case 'ANCESTRAL':
        return '#0f172a'; // Deep Navy
      case 'ALLIED':
        return '#0284c7'; // Cyan
      default:
        return '#94a3b8'; // Slate
    }
  };

  const getEdgeStroke = (edge: NetworkDiagramEdge) => {
    switch (edge.connectionType) {
      case 'IN_LAW':
        return '#7c3aed';
      case 'ANCESTRAL':
        return '#1e3a8a';
      case 'ALLIED':
        return '#0284c7';
      default:
        return '#94a3b8';
    }
  };

  // Search filtering highlight
  const isSearchMatch = (name: string, code?: string) => {
    if (!searchTerm.trim()) return false;
    const q = searchTerm.toLowerCase();
    return name.toLowerCase().includes(q) || (code && code.toLowerCase().includes(q));
  };

  // Summary counts
  const totalClans = layout.nodes.length;
  const activeLinksCount = layout.edges.length;
  const totalVerifiedPairs = layout.edges.reduce((sum, e) => sum + (e.verifiedCount || 0), 0);

  return (
    <div className="ntd-container">
      {/* Top Controls Toolbar */}
      <div className="ntd-toolbar">
        <div className="ntd-filter-group">
          <button
            type="button"
            className={`ntd-filter-btn ${filterType === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterType('ALL')}
          >
            Tất cả liên kết ({data.edges.length})
          </button>
          <button
            type="button"
            className={`ntd-filter-btn ${filterType === 'IN_LAW' ? 'active' : ''}`}
            onClick={() => setFilterType('IN_LAW')}
          >
            Họ Thông gia (IN_LAW)
          </button>
          <button
            type="button"
            className={`ntd-filter-btn ${filterType === 'ANCESTRAL' ? 'active' : ''}`}
            onClick={() => setFilterType('ANCESTRAL')}
          >
            Cùng tổ tiên (ANCESTRAL)
          </button>
          <button
            type="button"
            className={`ntd-filter-btn ${filterType === 'ALLIED' ? 'active' : ''}`}
            onClick={() => setFilterType('ALLIED')}
          >
            Hợp tác (ALLIED)
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="ntd-search-box">
            <svg
              className="ntd-search-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="ntd-search-input"
              placeholder="Tìm dòng họ trong mạng lưới..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="ntd-zoom-controls">
            <button type="button" className="ntd-zoom-btn" onClick={handleZoomIn} title="Phóng to">
              +
            </button>
            <button type="button" className="ntd-zoom-btn" onClick={handleZoomOut} title="Thu nhỏ">
              −
            </button>
            <button type="button" className="ntd-zoom-btn" onClick={handleResetView} title="Đặt lại góc nhìn">
              1:1
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="ntd-canvas-wrap">
        {/* Floating Stats Bar */}
        <div className="ntd-canvas-stats">
          <div className="ntd-stat-pill">
            <span>Dòng họ trong mạng lưới:</span>
            <strong>{totalClans}</strong>
          </div>
          <div className="ntd-stat-pill">
            <span>Liên kết hoạt động:</span>
            <strong>{activeLinksCount}</strong>
          </div>
          <div className="ntd-stat-pill">
            <span>Cặp thông gia xác minh:</span>
            <strong style={{ color: '#16a34a' }}>{totalVerifiedPairs}</strong>
          </div>
        </div>

        {/* Floating Legend */}
        <div className="ntd-canvas-legend">
          <div className="ntd-legend-item">
            <span className="ntd-legend-dot ntd-dot-current" />
            <span>Dòng họ của bạn (Trung tâm)</span>
          </div>
          <div className="ntd-legend-item">
            <span className="ntd-legend-dot ntd-dot-inlaw" />
            <span>Họ Thông gia (IN_LAW)</span>
          </div>
          <div className="ntd-legend-item">
            <span className="ntd-legend-dot ntd-dot-ancestral" />
            <span>Cùng tổ tiên (ANCESTRAL)</span>
          </div>
          <div className="ntd-legend-item">
            <span className="ntd-legend-dot ntd-dot-allied" />
            <span>Đồng minh / Hợp tác (ALLIED)</span>
          </div>
        </div>

        {/* SVG Interactive Topology Diagram */}
        <svg
          className="ntd-svg-canvas"
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleResetView}
        >
          <defs>
            {/* Gradients */}
            <radialGradient id="grad-center" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </radialGradient>
            <radialGradient id="grad-inlaw" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6d28d9" />
            </radialGradient>
            <radialGradient id="grad-ancestral" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </radialGradient>
            <radialGradient id="grad-allied" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#0369a1" />
            </radialGradient>
            <radialGradient id="grad-unlinked" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#94a3b8" />
            </radialGradient>

            {/* Filter for shadows */}
            <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Transform Group for Pan & Zoom */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Background Grid Pattern (Subtle) */}
            <g opacity="0.3">
              {Array.from({ length: 11 }).map((_, i) => (
                <line
                  key={`h-${i}`}
                  x1={0}
                  y1={i * 70}
                  x2={CANVAS_WIDTH}
                  y2={i * 70}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                />
              ))}
              {Array.from({ length: 15 }).map((_, i) => (
                <line
                  key={`v-${i}`}
                  x1={i * 70}
                  y1={0}
                  x2={i * 70}
                  y2={CANVAS_HEIGHT}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                />
              ))}
            </g>

            {/* Concentric Orbit Rings around Center */}
            <circle
              cx={CENTER_X}
              cy={CENTER_Y}
              r={240}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />
            {data.nodes.length > 8 && (
              <circle
                cx={CENTER_X}
                cy={CENTER_Y}
                r={380}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            )}

            {/* EDGES / CONNECTIONS */}
            {layout.edges.map((edge) => {
              const posA = layout.positions[edge.source];
              const posB = layout.positions[edge.target];
              if (!posA || !posB) return null;

              const isSelected = selectedEdgeId === edge.id;
              const isConnectedToSelectedNode =
                selectedNodeId === edge.source || selectedNodeId === edge.target;

              const strokeColor = getEdgeStroke(edge);
              const strokeWidth = isSelected || isConnectedToSelectedNode ? 3.5 : 2;
              const midX = (posA.x + posB.x) / 2;
              const midY = (posA.y + posB.y) / 2;

              return (
                <g key={edge.id}>
                  {/* Line */}
                  <line
                    x1={posA.x}
                    y1={posA.y}
                    x2={posB.x}
                    y2={posB.y}
                    className="ntd-edge-line"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={edge.connectionType === 'ALLIED' ? '5 5' : undefined}
                    opacity={isSelected || isConnectedToSelectedNode ? 1 : 0.75}
                    onClick={() => {
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId(null);
                    }}
                  />

                  {/* Midpoint Label Badge */}
                  <g
                    className="ntd-edge-badge"
                    transform={`translate(${midX}, ${midY})`}
                    onClick={() => {
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId(null);
                    }}
                  >
                    <rect
                      x="-42"
                      y="-11"
                      width="84"
                      height="22"
                      rx="11"
                      fill="#ffffff"
                      stroke={strokeColor}
                      strokeWidth="1.5"
                      filter="url(#node-shadow)"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize="10"
                      fontWeight="600"
                    >
                      {edge.label}
                      {edge.verifiedCount > 0 ? ` (${edge.verifiedCount})` : ''}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* NODES / CLANS */}
            {layout.nodes.map((node) => {
              const pos = layout.positions[node.id];
              if (!pos) return null;

              const isCenter = node.id === layout.centerId;
              const isSelected = selectedNodeId === node.id;
              const hasSearchHighlight = isSearchMatch(node.name, node.code);

              let gradId = 'grad-unlinked';
              if (isCenter || node.isCallerClan) gradId = 'grad-center';
              else if (node.category === 'IN_LAW') gradId = 'grad-inlaw';
              else if (node.category === 'ANCESTRAL') gradId = 'grad-ancestral';
              else if (node.category === 'ALLIED') gradId = 'grad-allied';

              return (
                <g
                  key={node.id}
                  className={`ntd-node-group ${isSelected ? 'ntd-node-selected' : ''}`}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    setSelectedEdgeId(null);
                  }}
                >
                  {/* Outer Pulsing Halo for Center or Selected */}
                  {(isCenter || isSelected || hasSearchHighlight) && (
                    <circle
                      r={pos.radius + (isSelected ? 9 : 7)}
                      fill="none"
                      stroke={hasSearchHighlight ? '#f59e0b' : isSelected ? '#f59e0b' : '#3b82f6'}
                      strokeWidth={isSelected || hasSearchHighlight ? 3 : 2}
                      strokeDasharray={isCenter ? '5 3' : undefined}
                      opacity={0.85}
                    />
                  )}

                  {/* Node Circle */}
                  <circle
                    className="ntd-node-circle"
                    r={pos.radius}
                    fill={`url(#${gradId})`}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    filter="url(#node-shadow)"
                  />

                  {/* Inner Icon / Initial Letter */}
                  <text
                    x="0"
                    y={isCenter ? 1 : 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#ffffff"
                    fontSize={isCenter ? '16' : '14'}
                    fontWeight="700"
                  >
                    {node.name.charAt(0).toUpperCase()}
                  </text>

                  {/* Status / Category Tag Badge inside or above node */}
                  {isCenter && (
                    <g transform={`translate(0, -${pos.radius + 8})`}>
                      <rect
                        x="-46"
                        y="-10"
                        width="92"
                        height="18"
                        rx="9"
                        fill="#2563eb"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="9.5"
                        fontWeight="700"
                      >
                        Họ của bạn
                      </text>
                    </g>
                  )}

                  {/* Node Title & Details below */}
                  <g transform={`translate(0, ${pos.radius + 16})`}>
                    <text
                      x="0"
                      y="0"
                      textAnchor="middle"
                      fill="#0f172a"
                      fontSize="12.5"
                      fontWeight="700"
                    >
                      {node.name.length > 20 ? node.name.substring(0, 18) + '...' : node.name}
                    </text>
                    <text
                      x="0"
                      y="14"
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="11"
                    >
                      {node.memberCount} thành viên
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>

        {/* SIDE DETAIL PANEL (When Node or Edge clicked) */}
        {selectedNode && (
          <div className="ntd-side-panel">
            <div className="ntd-side-header">
              <div>
                <h4 className="ntd-side-title">{selectedNode.name}</h4>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {selectedNode.code ? `Mã: ${selectedNode.code}` : 'Dòng tộc chính quy'}
                </div>
              </div>
              <button
                type="button"
                className="ntd-side-close"
                onClick={() => setSelectedNodeId(null)}
              >
                ✕
              </button>
            </div>

            <div className="ntd-side-body">
              <div className="ntd-info-row">
                <span className="ntd-info-label">Quan hệ với bạn:</span>
                <span
                  className="ntd-info-val"
                  style={{ color: getNodeColor(selectedNode) }}
                >
                  {selectedNode.categoryLabel}
                </span>
              </div>

              <div className="ntd-info-row">
                <span className="ntd-info-label">Số thành viên:</span>
                <span className="ntd-info-val">{selectedNode.memberCount} người</span>
              </div>

              <div className="ntd-info-row">
                <span className="ntd-info-label">Quê quán:</span>
                <span className="ntd-info-val">{selectedNode.originPlace || 'Chưa rõ'}</span>
              </div>

              <div className="ntd-info-row">
                <span className="ntd-info-label">Liên kết trong mạng:</span>
                <span className="ntd-info-val">{selectedNode.connectionsCount} liên kết</span>
              </div>

              {/* Connected edges summary */}
              {selectedNodeEdges.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <strong style={{ fontSize: '12.5px', color: '#1e293b' }}>
                    Các liên kết trực tiếp ({selectedNodeEdges.length}):
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                    {selectedNodeEdges.map((e) => {
                      const partnerName = e.source === selectedNode.id ? e.targetName : e.sourceName;
                      return (
                        <div
                          key={e.id}
                          style={{
                            background: '#f8fafc',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{partnerName}</div>
                          <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                            {e.label} • {e.verifiedCount} cặp thông gia xác minh
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            {selectedNode.id !== layout.centerId && selectedNode.isLinked && (
              <div className="ntd-side-actions">
                {selectedNodeEdges.length > 0 && onOpenHybridTree && (
                  <button
                    type="button"
                    className="ntd-action-btn-primary"
                    style={{ background: '#7c3aed', color: '#ffffff', marginBottom: '6px' }}
                    onClick={() => {
                      const firstLink = selectedNodeEdges[0];
                      if (firstLink) onOpenHybridTree(firstLink.id);
                    }}
                  >
                    Xem cay gia pha lien ho
                  </button>
                )}
                {selectedNodeEdges.length > 0 && onOpenPolicyModal && (
                  <button
                    type="button"
                    className="ntd-action-btn-primary"
                    onClick={() => {
                      const firstLink = selectedNodeEdges[0];
                      if (firstLink) onOpenPolicyModal(firstLink.id);
                    }}
                  >
                    Xem chính sách chia sẻ
                  </button>
                )}
                {selectedNodeEdges.length > 0 && onOpenPersonMappings && (
                  <button
                    type="button"
                    className="ntd-action-btn-secondary"
                    onClick={() => {
                      const firstLink = selectedNodeEdges[0];
                      if (firstLink) onOpenPersonMappings(firstLink.id);
                    }}
                  >
                    Quản lý cặp thông gia
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* EDGE DETAIL PANEL */}
        {selectedEdge && (
          <div className="ntd-side-panel">
            <div className="ntd-side-header">
              <div>
                <h4 className="ntd-side-title">Chi tiết liên kết dòng họ</h4>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {selectedEdge.label}
                </div>
              </div>
              <button
                type="button"
                className="ntd-side-close"
                onClick={() => setSelectedEdgeId(null)}
              >
                ✕
              </button>
            </div>

            <div className="ntd-side-body">
              <div className="ntd-info-row">
                <span className="ntd-info-label">Dòng họ thứ nhất:</span>
                <span className="ntd-info-val">{selectedEdge.sourceName}</span>
              </div>

              <div className="ntd-info-row">
                <span className="ntd-info-label">Dòng họ thứ hai:</span>
                <span className="ntd-info-val">{selectedEdge.targetName}</span>
              </div>

              <div className="ntd-info-row">
                <span className="ntd-info-label">Loại liên kết:</span>
                <span className="ntd-info-val" style={{ color: getEdgeStroke(selectedEdge) }}>
                  {selectedEdge.label} ({selectedEdge.connectionType})
                </span>
              </div>

              <div className="ntd-info-row">
                <span className="ntd-info-label">Trạng thái:</span>
                <span className="ntd-info-val" style={{ color: '#16a34a' }}>
                  Đang hoạt động (ACTIVE)
                </span>
              </div>

              <div className="ntd-info-row">
                <span className="ntd-info-label">Cặp Person xác minh:</span>
                <span className="ntd-info-val">{selectedEdge.verifiedCount} cặp</span>
              </div>

              <div className="ntd-info-row">
                <span className="ntd-info-label">Ngày kích hoạt:</span>
                <span className="ntd-info-val">
                  {selectedEdge.linkedAt
                    ? new Date(selectedEdge.linkedAt).toLocaleDateString('vi-VN')
                    : '—'}
                </span>
              </div>

              {selectedEdge.policies && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Phạm vi chia sẻ áp dụng:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11.5px', color: '#64748b' }}>
                    <div>{selectedEdge.sourceName}: <strong>{selectedEdge.policies[selectedEdge.source] || 'BASIC'}</strong></div>
                    <div>{selectedEdge.targetName}: <strong>{selectedEdge.policies[selectedEdge.target] || 'BASIC'}</strong></div>
                  </div>
                </div>
              )}
            </div>

            <div className="ntd-side-actions">
              {onOpenHybridTree && (
                <button
                  type="button"
                  className="ntd-action-btn-primary"
                  style={{ background: '#7c3aed', color: '#ffffff', marginBottom: '6px' }}
                  onClick={() => onOpenHybridTree(selectedEdge.id)}
                >
                  Xem cay gia pha lien ho
                </button>
              )}
              {onOpenPolicyModal && (
                <button
                  type="button"
                  className="ntd-action-btn-primary"
                  onClick={() => onOpenPolicyModal(selectedEdge.id)}
                >
                  Điều chỉnh chính sách chia sẻ
                </button>
              )}
              {onOpenPersonMappings && (
                <button
                  type="button"
                  className="ntd-action-btn-secondary"
                  onClick={() => onOpenPersonMappings(selectedEdge.id)}
                >
                  Xem danh sách cặp thông gia
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkTopologyDiagram;

