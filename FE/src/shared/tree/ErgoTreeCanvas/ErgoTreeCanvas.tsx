import React, { useEffect, useRef, useState } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import { TreeNodeCard } from '../TreeNodeCard';
import './ErgoTreeCanvas.css';

export interface ErgoTreeCanvasProps {
  nodes: ErgoTreeNode[];
  onCardClick: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  onContextMenu: (e: React.MouseEvent, node: ErgoTreeNode) => void;
  zoomScale: number;
  direction?: 'vertical' | 'horizontal';
}

export const ErgoTreeCanvas: React.FC<ErgoTreeCanvasProps> = ({
  nodes,
  onCardClick,
  onContextMenu,
  zoomScale,
  direction = 'vertical',
}) => {
  // Set of explicitly expanded node IDs (root nodes expanded by default)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Canvas viewport drag-to-pan state
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    // Automatically expand root nodes by default
    const initialExpanded = new Set<string>();
    nodes.forEach((r) => initialExpanded.add(r.id));
    setExpandedIds(initialExpanded);
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

  const handleNodeClick = (e: React.MouseEvent, node: ErgoTreeNode) => {
    if (node.children && node.children.length > 0) {
      toggleNodeExpansion(node.id);
    }
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

  const renderTreeRecursive = (node: ErgoTreeNode, index: number = 0, isRoot: boolean = false) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSingleChild = node.children && node.children.length === 1;

    return (
      <div
        key={node.id}
        className={`ergo-tree-node-wrapper ${isRoot ? 'is-root' : 'staggered-appear'}`}
        style={!isRoot ? { animationDelay: `${index * 0.08}s` } : undefined}
      >
        <TreeNodeCard
          node={node}
          onCardClick={handleNodeClick}
          onContextMenu={onContextMenu}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggleExpand={(_e, targetNode) => toggleNodeExpansion(targetNode.id)}
        />

        {hasChildren && (
          <div className={`ergo-tree-children-row ${isExpanded ? 'is-expanded' : 'is-collapsed'} ${isSingleChild ? 'single-child-row' : ''}`}>
            {node.children.map((child, idx) => renderTreeRecursive(child, idx, false))}
          </div>
        )}
      </div>
    );
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
        style={{ transform: `scale(${zoomScale})` }}
      >
        {nodes.map((rootNode, rIdx) => renderTreeRecursive(rootNode, rIdx, true))}
      </div>
    </div>
  );
};

export default ErgoTreeCanvas;
