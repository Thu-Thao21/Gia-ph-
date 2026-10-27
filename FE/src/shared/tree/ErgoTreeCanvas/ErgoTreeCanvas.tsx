import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import { TreeNodeCard } from '../TreeNodeCard';
import { calculateTreeLayout, type TreeDirection } from '../treeLayoutAlgorithm';
import './ErgoTreeCanvas.css';

export interface ErgoTreeCanvasProps {
  nodes: ErgoTreeNode[];
  onCardClick: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  zoomScale: number;
  direction?: TreeDirection;
}

export const ErgoTreeCanvas: React.FC<ErgoTreeCanvasProps> = ({
  nodes,
  onCardClick,
  onContextMenu,
  zoomScale,
  direction = 'vertical',
}) => {
  // Set of explicitly expanded node IDs (all expanded by default)
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

  // Tính toán bố cục toán học 2D tuyệt đối (Dual-Direction Engine: Dọc / Ngang)
  const layout = useMemo(() => {
    return calculateTreeLayout(nodes, expandedIds, direction);
  }, [nodes, expandedIds, direction]);

  // Tự động căn giữa màn hình (Auto-center viewport) người làm trung tâm (Ego) hoặc gốc cây
  useEffect(() => {
    if (!viewportRef.current) return;

    const timer = setTimeout(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const focusCard = viewport.querySelector('.tree-person-card.is-focus-card') as HTMLElement;
      if (focusCard) {
        focusCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } else {
        if (direction === 'horizontal') {
          // In horizontal mode: start from left (Gen 1) and center vertically
          viewport.scrollLeft = 0;
          const contentHeight = layout.totalHeight * zoomScale;
          const viewportHeight = viewport.clientHeight;
          if (contentHeight > viewportHeight) {
            viewport.scrollTop = (contentHeight - viewportHeight) / 2;
          } else {
            viewport.scrollTop = 0;
          }
        } else {
          // In vertical mode: center horizontally and start from top (Gen 1)
          const contentWidth = layout.totalWidth * zoomScale;
          const viewportWidth = viewport.clientWidth;
          if (contentWidth > viewportWidth) {
            viewport.scrollLeft = (contentWidth - viewportWidth) / 2;
          } else {
            viewport.scrollLeft = 0;
          }
          viewport.scrollTop = 0;
        }
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [nodes, zoomScale, layout.totalWidth, layout.totalHeight, direction]);

  const handleNodeClick = (e: React.MouseEvent, node: ErgoTreeNode) => {
    onCardClick(e, node);
  };

  // Drag to pan viewport handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('.tree-person-card') ||
      (e.target as HTMLElement).closest('.tree-node-toggle-btn')
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
        className={`tree-canvas-inner direction-${direction}`}
        style={{
          position: 'relative',
          width: `${layout.totalWidth}px`,
          height: `${layout.totalHeight}px`,
          transform: `scale(${zoomScale})`,
          transformOrigin: 'top center',
        }}
      >
        {/* Dynamic High-Precision SVG Connector Layer */}
        <svg
          className="tree-svg-connector-canvas"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${layout.totalWidth}px`,
            height: `${layout.totalHeight}px`,
            pointerEvents: 'none',
            zIndex: 1,
            overflow: 'visible',
          }}
        >
          {layout.busGroups.map((bus) => (
            <g key={bus.id} className="tree-bus-group">
              {/* 1. Trunk Line: Xuất phát từ cha mẹ */}
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

              {/* 2. Bus Bar: Thanh phân nhánh */}
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
                  {/* Điểm ngã ba giao cắt trunk với bus bar */}
                  <circle
                    cx={bus.trunkJunction.x}
                    cy={bus.trunkJunction.y}
                    r="4"
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </>
              )}

              {/* 3. Drop Lines: Rẽ trực tiếp đến mép từng ô con */}
              {bus.dropPaths.map((dp, dpIdx) => (
                <React.Fragment key={dpIdx}>
                  <path
                    d={dp}
                    stroke="#ffffff"
                    strokeWidth="5"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d={dp}
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                </React.Fragment>
              ))}

              {/* 4. Drop Junction Dots: Điểm rẽ tại các nhánh con */}
              {bus.dropJunctions.map((dj, djIdx) => (
                <circle
                  key={djIdx}
                  cx={dj.x}
                  cy={dj.y}
                  r="3.5"
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          ))}
        </svg>

        {/* Flat Layout Units Positioned at Exact Mathematical Coordinates */}
        {layout.flatUnits.map((unit) => (
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
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ErgoTreeCanvas;
