// GenealogyChartCanvas.tsx - Canvas hiển thị Phả đồ Nghệ thuật Truyền thống & Hiện đại (Live Preview)

import React, { useMemo, useRef, useState, useEffect } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import type { GenealogyChartConfig } from './chartConfigTypes';
import { calculateTreeLayout, type LayoutUnit, type LayoutCard } from '../treeLayoutAlgorithm';

export interface GenealogyChartCanvasProps {
  nodes: ErgoTreeNode[];
  config: GenealogyChartConfig;
  clanName?: string;
  zoomScale: number;
  onZoomChange?: (scale: number | ((prev: number) => number)) => void;
  svgRef?: React.RefObject<SVGSVGElement>;
}

// Bảng màu 14 thế hệ trang trọng cho chế độ hiển thị theo đời
const GENERATION_COLORS: { border: string; bg: string; text: string; badgeBg: string }[] = [
  { border: '#b45309', bg: '#fef3c7', text: '#78350f', badgeBg: '#d97706' }, // Đời 1: Vàng kim Thủy tổ
  { border: '#7c2d12', bg: '#ffedd5', text: '#7c2d12', badgeBg: '#c2410c' }, // Đời 2: Cam gạch hoàng tộc
  { border: '#581c87', bg: '#f3e8ff', text: '#581c87', badgeBg: '#7e22ce' }, // Đời 3: Tím thẫm quý phái
  { border: '#1e3a8a', bg: '#dbeafe', text: '#1e3a8a', badgeBg: '#2563eb' }, // Đời 4: Xanh lam vương giả
  { border: '#065f46', bg: '#d1fae5', text: '#065f46', badgeBg: '#059669' }, // Đời 5: Xanh ngọc lục bảo
  { border: '#831843', bg: '#fce7f3', text: '#831843', badgeBg: '#db2777' }, // Đời 6: Hồng ngọc thắm
  { border: '#155e75', bg: '#cffafe', text: '#155e75', badgeBg: '#0891b2' }, // Đời 7: Xanh ngọc biển
  { border: '#713f12', bg: '#fef9c3', text: '#713f12', badgeBg: '#ca8a04' }, // Đời 8: Hoàng bào
  { border: '#312e81', bg: '#e0e7ff', text: '#312e81', badgeBg: '#4f46e5' }, // Đời 9: Chàm hoàng gia
  { border: '#064e3b', bg: '#ccfbf1', text: '#064e3b', badgeBg: '#0d9488' }, // Đời 10: Xanh thanh ngọc
  { border: '#881337', bg: '#ffe4e6', text: '#881337', badgeBg: '#e11d48' }, // Đời 11: Đỏ ngọc
  { border: '#1e293b', bg: '#f1f5f9', text: '#1e293b', badgeBg: '#475569' }, // Đời 12: Thạch anh xám
  { border: '#3f3f46', bg: '#f4f4f5', text: '#3f3f46', badgeBg: '#52525b' }, // Đời 13: Xám bạc
  { border: '#4c1d95', bg: '#ede9fe', text: '#4c1d95', badgeBg: '#6d28d9' }, // Đời 14: Tím hoàng yến
];

export const GenealogyChartCanvas: React.FC<GenealogyChartCanvasProps> = ({
  nodes,
  config,
  clanName = 'Dòng họ',
  zoomScale,
  onZoomChange,
  svgRef: externalSvgRef,
}) => {
  const localSvgRef = useRef<SVGSVGElement>(null);
  const svgRef = externalSvgRef || localSvgRef;
  const viewportRef = useRef<HTMLDivElement>(null);

  // Drag-to-pan state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [isPanning, setIsPanning] = useState(false);

  // Set tất cả ID mở rộng khi config.expandAll bật
  const expandedIds = useMemo(() => {
    const ids = new Set<string>();
    const collect = (n: ErgoTreeNode) => {
      ids.add(String(n.id).toLowerCase().trim());
      ids.add(String(n.id));
      if (n.spouses) {
        n.spouses.forEach((sp) => {
          ids.add(String(sp.id).toLowerCase().trim());
          ids.add(String(sp.id));
        });
      }
      if (n.children) n.children.forEach(collect);
    };
    nodes.forEach(collect);
    return ids;
  }, [nodes]);

  // Lọc dữ liệu theo nhánh hoặc số đời nếu có cấu hình
  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (config.selectedBranch) {
      const filterBranch = (n: ErgoTreeNode): ErgoTreeNode | null => {
        const matches = n.branch === config.selectedBranch;
        const matchedChildren = (n.children || [])
          .map(filterBranch)
          .filter((c): c is ErgoTreeNode => c !== null);
        if (matches || matchedChildren.length > 0) {
          return { ...n, children: matchedChildren };
        }
        return null;
      };
      result = result.map(filterBranch).filter((n): n is ErgoTreeNode => n !== null);
    }
    return result;
  }, [nodes, config.selectedBranch]);

  // Tính toán bố cục toán học không chồng chéo
  const layout = useMemo(() => {
    return calculateTreeLayout(filteredNodes, expandedIds, config.direction, {
      siblingGap: config.siblingSpacing,
      rowGap: config.generationSpacing,
      showSpouse: config.showSpouses,
      zigzagCompact: config.zigzagCompact,
      maxGeneration: config.maxGenerations,
    });
  }, [
    filteredNodes,
    expandedIds,
    config.direction,
    config.siblingSpacing,
    config.generationSpacing,
    config.showSpouses,
    config.zigzagCompact,
    config.maxGenerations,
  ]);

  // Kích thước canvas bao gồm khung viền nghệ thuật, câu đối và tiêu đề
  const HEADER_HEIGHT = 160;
  const FOOTER_HEIGHT = 80;
  const COUPLET_WIDTH = config.showCouplets ? 70 : 0;
  const BORDER_PADDING = config.showBorder ? 60 : 30;

  const chartContentWidth = layout.totalWidth + COUPLET_WIDTH * 2 + BORDER_PADDING * 2;
  const chartContentHeight = layout.totalHeight + HEADER_HEIGHT + FOOTER_HEIGHT + BORDER_PADDING * 2;

  // Lấy danh sách thế hệ duy nhất có trên cây để vẽ thước đo thế hệ
  const generationsInChart = useMemo(() => {
    const gens = new Set<number>();
    layout.flatUnits.forEach((u) => gens.add(u.generation));
    return Array.from(gens).sort((a, b) => a - b);
  }, [layout]);

  // Pointer Drag-to-pan handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const el = e.target as HTMLElement;
    if (el.closest('button') || el.closest('a') || el.closest('input')) return;

    if (!viewportRef.current) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: viewportRef.current.scrollLeft,
      scrollTop: viewportRef.current.scrollTop,
    };
    setIsPanning(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !viewportRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    viewportRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    viewportRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsPanning(false);
    try {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
  };

  // Wheel zoom / scroll
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (onZoomChange) {
          const delta = e.deltaY < 0 ? 0.08 : -0.08;
          onZoomChange((prev: number) => {
            const next = Math.round((prev + delta) * 100) / 100;
            return Math.min(2.0, Math.max(0.08, next));
          });
        }
        return;
      }

      if (e.shiftKey || config.direction === 'horizontal') {
        e.preventDefault();
        viewport.scrollLeft += (e.deltaY || e.deltaX) * 1.2;
      } else {
        const canScrollUp = e.deltaY < 0 && viewport.scrollTop > 0;
        const canScrollDown =
          e.deltaY > 0 && viewport.scrollTop < viewport.scrollHeight - viewport.clientHeight - 1;
        if (canScrollUp || canScrollDown) {
          e.preventDefault();
          viewport.scrollTop += e.deltaY;
        }
        if (e.deltaX) {
          e.preventDefault();
          viewport.scrollLeft += e.deltaX;
        }
      }
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [onZoomChange, config.direction]);

  // Hàm trả về màu thẻ Person Card theo cardColorMode
  const getCardStyle = (card: LayoutCard) => {
    if (config.cardColorMode === 'generation') {
      const idx = Math.max(0, (card.generation - 1) % GENERATION_COLORS.length);
      const col = GENERATION_COLORS[idx];
      return {
        borderColor: col.border,
        bgGradient: `linear-gradient(180deg, #ffffff 0%, ${col.bg} 100%)`,
        badgeBg: col.badgeBg,
        textColor: col.text,
      };
    } else if (config.cardColorMode === 'status') {
      const isAlive = card.isAlive !== false;
      return {
        borderColor: isAlive ? '#10b981' : '#b45309',
        bgGradient: isAlive
          ? 'linear-gradient(180deg, #ffffff 0%, #ecfdf5 100%)'
          : 'linear-gradient(180deg, #ffffff 0%, #fef3c7 100%)',
        badgeBg: isAlive ? '#059669' : '#d97706',
        textColor: isAlive ? '#065f46' : '#78350f',
      };
    } else {
      // Theo giới tính
      const isMale = (card.gender || '').toLowerCase() === 'male' || (card.gender || '').toLowerCase() === 'nam';
      return {
        borderColor: isMale ? '#2563eb' : '#db2777',
        bgGradient: isMale
          ? 'linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)'
          : 'linear-gradient(180deg, #ffffff 0%, #fdf2f8 100%)',
        badgeBg: isMale ? '#1d4ed8' : '#be185d',
        textColor: isMale ? '#1e3a8a' : '#831843',
      };
    }
  };

  // Format nhãn thế hệ: Đời X hoặc Thế hệ Roman
  const getGenLabel = (gen: number) => {
    if (config.genNumberFormat === 'none') return '';
    if (config.genNumberFormat === 'roman') {
      const romanNums = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];
      return `Thế hệ ${romanNums[gen - 1] || gen}`;
    }
    return `Đời ${gen}`;
  };

  const fontFamilyCss =
    config.fontFamily === 'serif'
      ? "'Noto Serif', 'Times New Roman', serif"
      : "'Be Vietnam Pro', system-ui, sans-serif";

  return (
    <div
      ref={viewportRef}
      className={`genealogy-chart-canvas-viewport ${isPanning ? 'is-panning' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        position: 'relative',
        background: config.backgroundColor || '#fdf8ee',
        cursor: 'grab',
        touchAction: 'none',
      }}
    >
      <div
        className="genealogy-chart-render-wrapper"
        style={{
          minWidth: '100%',
          width: 'max-content',
          minHeight: '100%',
          height: 'max-content',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '40px 60px',
          boxSizing: 'border-box',
        }}
      >
        {/* SVG Container in đậm dấu ấn phả đồ nghệ thuật chuẩn in ấn */}
        <svg
          id="genealogy-chart-print-area"
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          width={chartContentWidth * zoomScale}
          height={chartContentHeight * zoomScale}
          viewBox={`0 0 ${chartContentWidth} ${chartContentHeight}`}
          style={{
            transformOrigin: 'top left',
            fontFamily: fontFamilyCss,
            display: 'block',
            boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
            borderRadius: config.showBorder ? '16px' : '0px',
            backgroundColor: config.backgroundColor,
          }}
        >
          <defs>
            {/* Filter bóng đổ cho Person Card */}
            <filter id="chart-card-shadow" x="-8%" y="-8%" width="120%" height="120%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.08" />
            </filter>

            {/* Pattern Họa tiết Trống đồng Đông Sơn cổ truyền */}
            <pattern id="pattern-dong-son" width="600" height="600" patternUnits="userSpaceOnUse">
              <g opacity="0.07" stroke="#b45309" strokeWidth="1.5" fill="none">
                <circle cx="300" cy="300" r="280" />
                <circle cx="300" cy="300" r="240" strokeDasharray="6,4" />
                <circle cx="300" cy="300" r="200" />
                <circle cx="300" cy="300" r="150" strokeWidth="2" />
                <circle cx="300" cy="300" r="90" />
                {/* Ngôi sao 14 cánh biểu tượng Đông Sơn */}
                <polygon
                  points="300,210 320,285 390,300 320,315 300,390 280,315 210,300 280,285"
                  fill="#b45309"
                  opacity="0.3"
                />
              </g>
            </pattern>

            {/* Pattern Giấy Dó / Giấy Điệp cổ */}
            <pattern id="pattern-parchment" width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill="#faf5ea" />
              <circle cx="20" cy="20" r="1.5" fill="#d97706" opacity="0.08" />
              <circle cx="80" cy="40" r="1.2" fill="#92400e" opacity="0.06" />
              <circle cx="50" cy="80" r="1.8" fill="#b45309" opacity="0.07" />
            </pattern>

            {/* Pattern Chấm hiện đại */}
            <pattern id="pattern-modern-dots" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="14" cy="14" r="1.2" fill="#cbd5e1" opacity="0.6" />
            </pattern>

            {/* Gradient Băng Cuốn Thư Tiêu Đề Hoàng Gia */}
            <linearGradient id="imperial-banner-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7c2d12" />
              <stop offset="30%" stopColor="#b45309" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="70%" stopColor="#b45309" />
              <stop offset="100%" stopColor="#7c2d12" />
            </linearGradient>

            <linearGradient id="gold-border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d97706" />
              <stop offset="50%" stopColor="#fef08a" />
              <stop offset="100%" stopColor="#b45309" />
            </linearGradient>
          </defs>

          {/* 1. NỀN PHẢ ĐỒ THEO CHỦ ĐỀ */}
          <rect width={chartContentWidth} height={chartContentHeight} fill={config.backgroundColor} />
          {config.backgroundPattern === 'dong-son' && (
            <rect width={chartContentWidth} height={chartContentHeight} fill="url(#pattern-dong-son)" />
          )}
          {config.backgroundPattern === 'parchment' && (
            <rect width={chartContentWidth} height={chartContentHeight} fill="url(#pattern-parchment)" />
          )}
          {config.backgroundPattern === 'modern-dots' && (
            <rect width={chartContentWidth} height={chartContentHeight} fill="url(#pattern-modern-dots)" />
          )}

          {/* 2. KHUNG VIỀN NGHỆ THUẬT (TRADITIONAL / ROYAL / MODERN FRAME) */}
          {config.showBorder && (
            <g className="chart-decorative-border">
              {/* Đường viền ngoài dày */}
              <rect
                x="20"
                y="20"
                width={chartContentWidth - 40}
                height={chartContentHeight - 40}
                fill="none"
                stroke={config.themeId === 'modern-clean' ? '#cbd5e1' : '#b45309'}
                strokeWidth={config.themeId === 'royal-classic' ? '4' : '3'}
                rx={config.themeId === 'modern-clean' ? '20' : '8'}
              />
              {/* Đường viền trong thanh mảnh */}
              <rect
                x="28"
                y="28"
                width={chartContentWidth - 56}
                height={chartContentHeight - 56}
                fill="none"
                stroke={config.themeId === 'modern-clean' ? '#e2e8f0' : '#d97706'}
                strokeWidth="1.2"
                strokeDasharray={config.themeId === 'royal-classic' ? '6,3' : 'none'}
                rx={config.themeId === 'modern-clean' ? '14' : '4'}
              />

              {/* Hoa văn 4 góc truyền thống */}
              {config.themeId !== 'modern-clean' && (
                <g fill="#b45309">
                  {/* Góc trên trái */}
                  <path d="M 28 48 L 48 48 L 48 28 Z" opacity="0.8" />
                  <circle cx="38" cy="38" r="3" fill="#d97706" />
                  {/* Góc trên phải */}
                  <path d={`M ${chartContentWidth - 28} 48 L ${chartContentWidth - 48} 48 L ${chartContentWidth - 48} 28 Z`} opacity="0.8" />
                  <circle cx={chartContentWidth - 38} cy="38" r="3" fill="#d97706" />
                  {/* Góc dưới trái */}
                  <path d={`M 28 ${chartContentHeight - 48} L 48 ${chartContentHeight - 48} L 48 ${chartContentHeight - 28} Z`} opacity="0.8" />
                  <circle cx="38" cy={chartContentHeight - 38} r="3" fill="#d97706" />
                  {/* Góc dưới phải */}
                  <path
                    d={`M ${chartContentWidth - 28} ${chartContentHeight - 48} L ${chartContentWidth - 48} ${chartContentHeight - 48} L ${chartContentWidth - 48} ${chartContentHeight - 28} Z`}
                    opacity="0.8"
                  />
                  <circle cx={chartContentWidth - 38} cy={chartContentHeight - 38} r="3" fill="#d97706" />
                </g>
              )}
            </g>
          )}

          {/* 3. TIÊU ĐỀ DÒNG HỌ & CUỐN THƯ HOÀNG GIA */}
          <g className="chart-header-banner" transform={`translate(${chartContentWidth / 2}, 60)`}>
            {/* Cuốn thư nền */}
            <path
              d="M -320 -28 L 320 -28 C 340 -28 350 -14 340 18 L 320 28 C 280 34 -280 34 -320 28 L -340 18 C -350 -14 -340 -28 -320 -28 Z"
              fill={config.themeId === 'modern-clean' ? '#ffffff' : 'url(#imperial-banner-grad)'}
              stroke={config.themeId === 'modern-clean' ? '#93c5fd' : '#fef08a'}
              strokeWidth="2"
              filter="url(#chart-card-shadow)"
            />
            {/* Tiêu đề chính */}
            <text
              x="0"
              y="6"
              textAnchor="middle"
              fill={config.themeId === 'modern-clean' ? '#1e3a8a' : '#ffffff'}
              fontSize="24"
              fontWeight="800"
              letterSpacing="2"
            >
              {config.chartTitle || `PHẢ ĐỒ ${clanName.toUpperCase()}`}
            </text>

            {/* Dòng chữ phụ: Tên Thủy tổ & Địa danh */}
            <text
              x="0"
              y="56"
              textAnchor="middle"
              fill={config.themeId === 'modern-clean' ? '#64748b' : '#92400e'}
              fontSize="14"
              fontWeight="600"
            >
              {config.founderTitle ? `Khởi tổ: ${config.founderTitle}` : `Dòng họ ${clanName}`}
              {config.clanBranchSubtitle ? ` • ${config.clanBranchSubtitle}` : ''}
              {` • ${generationsInChart.length} Thế hệ`}
            </text>

            {/* Triện son ngọc phả đỏ son ("Gia Phả Bảo Ấn") */}
            {config.showSeal && (
              <g transform="translate(370, -18)">
                <rect
                  x="0"
                  y="0"
                  width="54"
                  height="54"
                  fill="#991b1b"
                  stroke="#ef4444"
                  strokeWidth="2"
                  rx="6"
                />
                <rect x="4" y="4" width="46" height="46" fill="none" stroke="#fca5a5" strokeWidth="1" />
                <text x="27" y="24" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="800">
                  GIA PHẢ
                </text>
                <text x="27" y="40" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="800">
                  BẢO ẤN
                </text>
              </g>
            )}
          </g>

          {/* 4. HAI CÂU ĐỐI VÀNG SON HAI BÊN */}
          {config.showCouplets && (
            <g className="chart-couplets-layer">
              {/* Câu đối vế trái */}
              <g transform={`translate(${BORDER_PADDING + 8}, ${HEADER_HEIGHT})`}>
                <rect
                  x="0"
                  y="0"
                  width="44"
                  height={Math.min(chartContentHeight - HEADER_HEIGHT - 100, 680)}
                  fill="#991b1b"
                  stroke="#d97706"
                  strokeWidth="2"
                  rx="8"
                  filter="url(#chart-card-shadow)"
                />
                <rect
                  x="3"
                  y="3"
                  width="38"
                  height={Math.min(chartContentHeight - HEADER_HEIGHT - 100, 680) - 6}
                  fill="none"
                  stroke="#fef08a"
                  strokeWidth="0.8"
                  strokeDasharray="4,2"
                />
                <text
                  x="22"
                  y="40"
                  textAnchor="middle"
                  fill="#fef08a"
                  fontSize="15"
                  fontWeight="800"
                  letterSpacing="4"
                  style={{ writingMode: 'vertical-rl' }}
                >
                  {config.coupletLeft}
                </text>
              </g>

              {/* Câu đối vế phải */}
              <g transform={`translate(${chartContentWidth - BORDER_PADDING - 52}, ${HEADER_HEIGHT})`}>
                <rect
                  x="0"
                  y="0"
                  width="44"
                  height={Math.min(chartContentHeight - HEADER_HEIGHT - 100, 680)}
                  fill="#991b1b"
                  stroke="#d97706"
                  strokeWidth="2"
                  rx="8"
                  filter="url(#chart-card-shadow)"
                />
                <rect
                  x="3"
                  y="3"
                  width="38"
                  height={Math.min(chartContentHeight - HEADER_HEIGHT - 100, 680) - 6}
                  fill="none"
                  stroke="#fef08a"
                  strokeWidth="0.8"
                  strokeDasharray="4,2"
                />
                <text
                  x="22"
                  y="40"
                  textAnchor="middle"
                  fill="#fef08a"
                  fontSize="15"
                  fontWeight="800"
                  letterSpacing="4"
                  style={{ writingMode: 'vertical-rl' }}
                >
                  {config.coupletRight}
                </text>
              </g>
            </g>
          )}

          {/* 5. CỘT ĐÁNH SỐ THẾ HỆ (GENERATION RULER) */}
          {config.genNumberFormat !== 'none' && config.direction === 'vertical' && (
            <g
              className="chart-generation-ruler"
              transform={`translate(${BORDER_PADDING + COUPLET_WIDTH + 14}, ${HEADER_HEIGHT})`}
            >
              {generationsInChart.map((gen) => {
                const yPos = 60 + (gen - 1) * (160 + config.generationSpacing);
                const col = GENERATION_COLORS[Math.max(0, (gen - 1) % GENERATION_COLORS.length)];
                return (
                  <g key={`gen-ruler-${gen}`} transform={`translate(0, ${yPos + 50})`}>
                    <rect
                      x="0"
                      y="-16"
                      width="74"
                      height="32"
                      rx="16"
                      fill={col.bg}
                      stroke={col.border}
                      strokeWidth="1.5"
                    />
                    <text
                      x="37"
                      y="5"
                      textAnchor="middle"
                      fill={col.text}
                      fontSize="12"
                      fontWeight="800"
                    >
                      {getGenLabel(gen)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* 6. VÙNG PHẢ HỆ CHÍNH (CÂY THÀNH VIÊN VÀ ĐƯỜNG NỐI HUYẾT THỐNG) */}
          <g
            className="chart-main-tree-layer"
            transform={`translate(${COUPLET_WIDTH + BORDER_PADDING}, ${HEADER_HEIGHT})`}
          >
            {/* 6.1. ĐƯỜNG NỐI HUYẾT THỐNG (SVG BUSBARS & DROP LINES) */}
            <g className="chart-connector-lines">
              {layout.busGroups.map((bg) => (
                <g key={bg.id} opacity="0.9">
                  {/* Đường thân trục từ cha mẹ */}
                  <path
                    d={bg.trunkPath}
                    fill="none"
                    stroke={config.lineColor}
                    strokeWidth={config.lineWidth}
                    strokeDasharray={config.lineStyle === 'dashed' ? '5,4' : 'none'}
                    strokeLinecap="round"
                  />
                  {/* Thanh ngang chia nhánh (busbar) */}
                  <path
                    d={bg.busBarPath}
                    fill="none"
                    stroke={config.lineColor}
                    strokeWidth={config.lineWidth}
                    strokeDasharray={config.lineStyle === 'dashed' ? '5,4' : 'none'}
                    strokeLinecap="round"
                  />
                  {/* Các nhánh rẽ xuống từng con */}
                  {bg.dropPaths.map((dp, idx) => (
                    <path
                      key={`${bg.id}-drop-${idx}`}
                      d={dp}
                      fill="none"
                      stroke={config.lineColor}
                      strokeWidth={config.lineWidth}
                      strokeDasharray={config.lineStyle === 'dashed' ? '5,4' : 'none'}
                      strokeLinecap="round"
                    />
                  ))}
                  {/* Nút giao (Junction Dots) điểm vàng đồng */}
                  <circle cx={bg.trunkJunction.x} cy={bg.trunkJunction.y} r="3.5" fill={config.lineColor} />
                  {bg.dropJunctions.map((dj, idx) => (
                    <circle key={`${bg.id}-dj-${idx}`} cx={dj.x} cy={dj.y} r="2.8" fill={config.lineColor} />
                  ))}
                </g>
              ))}
            </g>

            {/* 6.2. CÁC THẺ PERSON CARD NGHỆ THUẬT */}
            <g className="chart-person-cards">
              {layout.flatUnits.map((unit) => {
                const primaryStyle = getCardStyle(unit.primaryCard);
                const hasSpouse = Boolean(unit.spouseCard && config.showSpouses);

                return (
                  <g key={`unit-${unit.id}`} transform={`translate(${unit.x}, ${unit.y})`}>
                    {/* Đường nối giữa 2 vợ chồng (nếu có) */}
                    {hasSpouse && (
                      <g className="spouse-connector-line">
                        <line
                          x1={unit.primaryCard.width}
                          y1={unit.primaryCard.height / 2}
                          x2={unit.primaryCard.width + 36}
                          y2={unit.primaryCard.height / 2}
                          stroke="#e11d48"
                          strokeWidth="2"
                          strokeDasharray="3,2"
                        />
                        {/* Biểu tượng trái tim / nhẫn kết duyên */}
                        <circle
                          cx={unit.primaryCard.width + 18}
                          cy={unit.primaryCard.height / 2}
                          r="7"
                          fill="#ffffff"
                          stroke="#e11d48"
                          strokeWidth="1.5"
                        />
                        <text
                          x={unit.primaryCard.width + 18}
                          y={unit.primaryCard.height / 2 + 3.5}
                          textAnchor="middle"
                          fill="#e11d48"
                          fontSize="9"
                          fontWeight="700"
                        >
                          ♥
                        </text>
                      </g>
                    )}

                    {/* THẺ CHÍNH (PRIMARY BLOODLINE PERSON) */}
                    <g
                      className="person-card primary-card"
                      transform={`translate(${unit.primaryCard.relX}, ${unit.primaryCard.relY})`}
                      filter="url(#chart-card-shadow)"
                    >
                      <rect
                        width={unit.primaryCard.width}
                        height={unit.primaryCard.height}
                        rx="12"
                        fill="#ffffff"
                        stroke={primaryStyle.borderColor}
                        strokeWidth="2"
                      />
                      {/* Dải header màu trên thẻ */}
                      <path
                        d="M 0 12 C 0 5.37 5.37 0 12 0 L 128 0 C 134.63 0 140 5.37 140 12 L 140 32 L 0 32 Z"
                        fill={primaryStyle.borderColor}
                        opacity="0.9"
                      />

                      {/* Huy hiệu thế hệ trên đầu thẻ */}
                      <text x="12" y="21" fill="#ffffff" fontSize="10.5" fontWeight="800">
                        {getGenLabel(unit.primaryCard.generation)}
                      </text>
                      <text x="128" y="21" textAnchor="end" fill="#ffffff" fontSize="10" fontWeight="700">
                        {(unit.primaryCard.gender || '').toLowerCase() === 'female' ? 'Nữ' : 'Nam'}
                      </text>

                      {/* Avatar / Biểu tượng nhân vật */}
                      {config.showAvatars && (
                        <g transform="translate(56, 42)">
                          <circle cx="14" cy="14" r="15" fill={primaryStyle.badgeBg} opacity="0.15" />
                          <circle cx="14" cy="14" r="14" fill="#ffffff" stroke={primaryStyle.borderColor} strokeWidth="1" />
                          <text x="14" y="20" textAnchor="middle" fill={primaryStyle.borderColor} fontSize="14">
                            {(unit.primaryCard.gender || '').toLowerCase() === 'female' ? '👩' : '👨'}
                          </text>
                        </g>
                      )}

                      {/* Họ và tên thành viên */}
                      <text
                        x="70"
                        y={config.showAvatars ? 90 : 66}
                        textAnchor="middle"
                        fill="#0f172a"
                        fontSize="12.5"
                        fontWeight="800"
                      >
                        {unit.primaryCard.fullName}
                      </text>

                      {/* Năm sinh - năm mất */}
                      {config.showBirthDeath && (
                        <text
                          x="70"
                          y={config.showAvatars ? 108 : 86}
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize="10"
                          fontWeight="600"
                        >
                          {unit.primaryCard.birthDate
                            ? `${unit.primaryCard.birthDate}${
                                unit.primaryCard.isAlive === false ? ' (Đã mất)' : ''
                              }`
                            : unit.primaryCard.isAlive === false
                            ? '(Đã mất)'
                            : '(Còn sống)'}
                        </text>
                      )}

                      {/* Chức vụ / Nghề nghiệp */}
                      {config.showOccupation && unit.primaryCard.occupation && (
                        <text
                          x="70"
                          y={config.showAvatars ? 124 : 104}
                          textAnchor="middle"
                          fill="#475569"
                          fontSize="9.5"
                          fontWeight="500"
                        >
                          {unit.primaryCard.occupation.length > 18
                            ? unit.primaryCard.occupation.slice(0, 16) + '…'
                            : unit.primaryCard.occupation}
                        </text>
                      )}

                      {/* Nhãn chi nhánh */}
                      {unit.node.branch && (
                        <text
                          x="70"
                          y={145}
                          textAnchor="middle"
                          fill={primaryStyle.textColor}
                          fontSize="9"
                          fontWeight="700"
                        >
                          {unit.node.branch}
                        </text>
                      )}
                    </g>

                    {/* THẺ PHỐI NGÃU (SPOUSE PERSON CARD NẾU CÓ) */}
                    {hasSpouse && unit.spouseCard && (
                      <g
                        className="person-card spouse-card"
                        transform={`translate(${unit.spouseCard.relX}, ${unit.spouseCard.relY})`}
                        filter="url(#chart-card-shadow)"
                      >
                        <rect
                          width={unit.spouseCard.width}
                          height={unit.spouseCard.height}
                          rx="12"
                          fill="#ffffff"
                          stroke="#db2777"
                          strokeWidth="2"
                        />
                        <path
                          d="M 0 12 C 0 5.37 5.37 0 12 0 L 128 0 C 134.63 0 140 5.37 140 12 L 140 32 L 0 32 Z"
                          fill="#db2777"
                          opacity="0.9"
                        />
                        <text x="12" y="21" fill="#ffffff" fontSize="10.5" fontWeight="800">
                          {unit.spouseRole || 'Phối ngẫu'}
                        </text>
                        <text x="128" y="21" textAnchor="end" fill="#ffffff" fontSize="10" fontWeight="700">
                          {(unit.spouseCard.gender || '').toLowerCase() === 'male' ? 'Nam' : 'Nữ'}
                        </text>

                        {config.showAvatars && (
                          <g transform="translate(56, 42)">
                            <circle cx="14" cy="14" r="14" fill="#ffffff" stroke="#db2777" strokeWidth="1" />
                            <text x="14" y="20" textAnchor="middle" fill="#db2777" fontSize="14">
                              {(unit.spouseCard.gender || '').toLowerCase() === 'male' ? '👨' : '👩'}
                            </text>
                          </g>
                        )}

                        <text
                          x="70"
                          y={config.showAvatars ? 90 : 66}
                          textAnchor="middle"
                          fill="#0f172a"
                          fontSize="12.5"
                          fontWeight="800"
                        >
                          {unit.spouseCard.fullName}
                        </text>

                        {config.showBirthDeath && (
                          <text
                            x="70"
                            y={config.showAvatars ? 108 : 86}
                            textAnchor="middle"
                            fill="#64748b"
                            fontSize="10"
                            fontWeight="600"
                          >
                            {unit.spouseCard.birthDate
                              ? `${unit.spouseCard.birthDate}`
                              : unit.spouseCard.isAlive === false
                              ? '(Đã mất)'
                              : '(Còn sống)'}
                          </text>
                        )}

                        {config.showOccupation && unit.spouseCard.occupation && (
                          <text
                            x="70"
                            y={config.showAvatars ? 124 : 104}
                            textAnchor="middle"
                            fill="#475569"
                            fontSize="9.5"
                            fontWeight="500"
                          >
                            {unit.spouseCard.occupation.length > 18
                              ? unit.spouseCard.occupation.slice(0, 16) + '…'
                              : unit.spouseCard.occupation}
                          </text>
                        )}
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </g>

          {/* 7. CHÂN TRANG BẢN IN (PRINT FOOTER METADATA) */}
          <g
            className="chart-footer-meta"
            transform={`translate(${chartContentWidth / 2}, ${chartContentHeight - 34})`}
          >
            <text x="0" y="0" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
              Hệ thống Quản lý Phả hệ Đa Dòng họ (MFGMS-AI) • Xuất bản ngày{' '}
              {new Date().toLocaleDateString('vi-VN')} • Lưu hành nội bộ dòng họ {clanName}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
};

export default GenealogyChartCanvas;
