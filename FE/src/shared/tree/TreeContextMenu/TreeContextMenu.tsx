import React, { useEffect } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import './TreeContextMenu.css';

export interface TreeContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  node: ErgoTreeNode | null;
  focusMemberId?: string;
  canManageTree?: boolean;
  isSelf?: boolean;
  onClose: () => void;
  onSelectFocus: (node: ErgoTreeNode) => void;
  onViewBio: (node: ErgoTreeNode) => void;
  onEdit?: (node: ErgoTreeNode) => void;
  onDelete?: (node: ErgoTreeNode) => void;
  onAddChild?: (node: ErgoTreeNode) => void;
  onAddSpouse?: (node: ErgoTreeNode) => void;
  onRelocate?: (node: ErgoTreeNode) => void;
  onTogglePrivacy?: (node: ErgoTreeNode) => void;
  onProposeEdit?: (node: ErgoTreeNode) => void;
  onActionToast?: (actionName: string) => void;
}

export const TreeContextMenu: React.FC<TreeContextMenuProps> = ({
  isOpen,
  x,
  y,
  node,
  focusMemberId,
  canManageTree = false,
  isSelf = false,
  onClose,
  onSelectFocus,
  onViewBio,
  onEdit,
  onDelete,
  onAddChild,
  onAddSpouse,
  onRelocate,
  onTogglePrivacy,
  onProposeEdit,
  onActionToast,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = () => onClose();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [isOpen, onClose]);

  if (!isOpen || !node) return null;

  const isCurrentlyFocused = Boolean(
    node.isFocusPerson ||
    (focusMemberId && (
      focusMemberId === node.id ||
      (node.spouses && node.spouses.some((s) => s.id === focusMemberId))
    ))
  );

  return (
    <div
      className="tree-context-menu"
      style={{ left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Context Menu Header */}
      <div className="tree-context-menu-header">
        <span className="tree-context-menu-title" title={node.fullName}>
          {node.fullName}
        </span>
        {isSelf && <span className="tree-context-menu-badge self">Bạn</span>}
        {!canManageTree && !isSelf && (
          <span className="tree-context-menu-badge read-only">Chỉ xem</span>
        )}
      </div>

      <div className="tree-context-menu-divider" />

      {/* Case 1: Can manage tree (Clan Leader, Family Admin, Admin) */}
      {canManageTree ? (
        <>
          <button
            className="tree-context-menu-item"
            onClick={() => {
              onClose();
              if (onEdit) onEdit(node);
              else if (onActionToast) onActionToast('Chỉnh sửa');
            }}
          >
            {isSelf ? 'Sửa thông tin của tôi' : 'Sửa thông tin'}
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

          {/* Privacy Toggle: Allowed for self */}
          {isSelf && (
            <button
              className="tree-context-menu-item privacy"
              onClick={() => {
                onClose();
                if (onTogglePrivacy) onTogglePrivacy(node);
              }}
            >
              {node.isPrivate
                ? 'Công khai thông tin (Đang ẩn)'
                : 'Đặt riêng tư (Ẩn SĐT/Email)'}
            </button>
          )}

          <div className="tree-context-menu-divider" />

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
        </>
      ) : (
        /* Case 2: Regular Member */
        <>
          {isSelf ? (
            /* Member clicking on themselves */
            <>
              <button
                className="tree-context-menu-item"
                onClick={() => {
                  onClose();
                  if (onEdit) onEdit(node);
                  else if (onActionToast) onActionToast('Chỉnh sửa thông tin cá nhân');
                }}
              >
                Sửa thông tin của tôi
              </button>

              <button
                className="tree-context-menu-item privacy"
                onClick={() => {
                  onClose();
                  if (onTogglePrivacy) onTogglePrivacy(node);
                }}
              >
                {node.isPrivate
                  ? 'Công khai thông tin (Đang ẩn)'
                  : 'Đặt riêng tư (Ẩn SĐT/Email)'}
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
            </>
          ) : (
            /* Member clicking on someone else */
            <>
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
                className="tree-context-menu-item propose"
                onClick={() => {
                  onClose();
                  if (onProposeEdit) onProposeEdit(node);
                }}
              >
                Gửi đề xuất chỉnh sửa
              </button>
            </>
          )}
        </>
      )}

      <div className="tree-context-menu-divider" />

      {/* Focus Person Toggle (All actors can focus on a member) */}
      <button
        className="tree-context-menu-item tree-context-menu-focus-btn"
        onClick={() => {
          onClose();
          onSelectFocus(node);
        }}
      >
        {isCurrentlyFocused ? 'Thoát khỏi người trung tâm' : 'Làm người trung tâm'}
      </button>

      <div className="tree-context-menu-divider" />

      <button className="tree-context-menu-item" onClick={onClose}>
        Thoát
      </button>
    </div>
  );
};

export default TreeContextMenu;
