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
  onEdit?: (node: ErgoTreeNode) => void;
  onDelete?: (node: ErgoTreeNode) => void;
  onAddChild?: (node: ErgoTreeNode) => void;
  onAddSpouse?: (node: ErgoTreeNode) => void;
  onRelocate?: (node: ErgoTreeNode) => void;
  onActionToast?: (actionName: string) => void;
}

export const TreeContextMenu: React.FC<TreeContextMenuProps> = ({
  isOpen,
  x,
  y,
  node,
  onClose,
  onSelectFocus,
  onViewBio,
  onEdit,
  onDelete,
  onAddChild,
  onAddSpouse,
  onRelocate,
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
      <button
        className="tree-context-menu-item"
        onClick={() => {
          onClose();
          if (onEdit) onEdit(node);
          else if (onActionToast) onActionToast('Chỉnh sửa');
        }}
      >
        Sửa thông tin
      </button>

      <button
        className="tree-context-menu-item"
        onClick={() => {
          onClose();
          onViewBio(node);
        }}
      >
        Xem tiểu sử
      </button>

      <button
        className="tree-context-menu-item danger"
        onClick={() => {
          onClose();
          if (onDelete) onDelete(node);
          else if (onActionToast) onActionToast('Xóa');
        }}
      >
        Xóa thành viên
      </button>

      <div className="tree-context-menu-divider" />

      <button
        className="tree-context-menu-item"
        onClick={() => {
          onClose();
          if (onRelocate) onRelocate(node);
          else if (onActionToast) onActionToast('Di chuyển');
        }}
      >
        Di chuyển nhánh
      </button>

      <button
        className="tree-context-menu-item"
        onClick={() => {
          onClose();
          if (onAddChild) onAddChild(node);
          else if (onActionToast) onActionToast('Thêm con');
        }}
      >
        Thêm con
      </button>

      <button
        className="tree-context-menu-item"
        onClick={() => {
          onClose();
          if (onAddSpouse) onAddSpouse(node);
          else if (onActionToast) onActionToast('Thêm Vợ/Chồng');
        }}
      >
        Thêm Vợ/Chồng
      </button>

      <button
        className="tree-context-menu-item tree-context-menu-focus-btn"
        onClick={() => {
          onClose();
          onSelectFocus(node);
        }}
      >
        Làm người trung tâm
      </button>

      <div className="tree-context-menu-divider" />

      <button className="tree-context-menu-item" onClick={onClose}>
        Thoát
      </button>
    </div>
  );
};

export default TreeContextMenu;
