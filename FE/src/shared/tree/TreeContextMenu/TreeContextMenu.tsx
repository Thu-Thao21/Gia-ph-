import React, { useEffect } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import './TreeContextMenu.css';

export interface TreeContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  node: ErgoTreeNode | null;
  onClose: () => void;
  onSelectFocus: (node: ErgoTreeNode) => void;
  onViewBio: (node: ErgoTreeNode) => void;
  onActionToast: (actionName: string) => void;
}

export const TreeContextMenu: React.FC<TreeContextMenuProps> = ({
  isOpen,
  x,
  y,
  node,
  onClose,
  onSelectFocus,
  onViewBio,
  onActionToast,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = () => onClose();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [isOpen, onClose]);

  if (!isOpen || !node) return null;

  return (
    <div
      className="tree-context-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="tree-context-menu-item" onClick={() => onActionToast('Chỉnh sửa')}>
        Sửa
      </button>

      <button className="tree-context-menu-item" onClick={() => onViewBio(node)}>
        Xem tiểu sử
      </button>

      <button className="tree-context-menu-item danger" onClick={() => onActionToast('Xóa')}>
        Xóa
      </button>

      <div className="tree-context-menu-divider" />

      <button className="tree-context-menu-item" onClick={() => onActionToast('Di chuyển')}>
        Di chuyển
      </button>

      <button className="tree-context-menu-item" onClick={() => onActionToast('Thêm con')}>
        Thêm con
      </button>

      <button className="tree-context-menu-item" onClick={() => onActionToast('Thêm Vợ/Chồng')}>
        Thêm Vợ/Chồng
      </button>

      <button className="tree-context-menu-item" onClick={() => onSelectFocus(node)}>
        Duyệt riêng nhánh này
      </button>

      <div className="tree-context-menu-divider" />

      <button className="tree-context-menu-item" onClick={onClose}>
        Thoát
      </button>
    </div>
  );
};

export default TreeContextMenu;
