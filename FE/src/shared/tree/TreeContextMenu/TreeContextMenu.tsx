import React, { useEffect } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import { useIsMobile } from '../../../hooks/useIsMobile';
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
  onViewBurial?: (node: ErgoTreeNode) => void;
  onEdit?: (node: ErgoTreeNode) => void;
  onDelete?: (node: ErgoTreeNode) => void;
  onAddChild?: (node: ErgoTreeNode) => void;
  onAddSpouse?: (node: ErgoTreeNode) => void;
  onRelocate?: (node: ErgoTreeNode) => void;
  onTogglePrivacy?: (node: ErgoTreeNode) => void;
  onProposeEdit?: (node: ErgoTreeNode) => void;
  onViewDualLineage?: (node: ErgoTreeNode) => void;
  onViewInLawTree?: (clanId: string, personId: string) => void;
  onViewMyNetwork?: () => void;
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
  onViewBurial,
  onEdit,
  onDelete,
  onAddChild,
  onAddSpouse,
  onRelocate,
  onTogglePrivacy,
  onProposeEdit,
  onViewDualLineage,
  onViewInLawTree,
  onViewMyNetwork,
  onActionToast,
}) => {
  // Mobile: hiện dạng bottom sheet có nền mờ thay vì menu nổi tại toạ độ chạm
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', handleClick);
    if (isMobile) window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, isMobile]);

  if (!isOpen || !node) return null;

  const isCurrentlyFocused = Boolean(
    node.isFocusPerson ||
    (focusMemberId && (
      focusMemberId === node.id ||
      (node.spouses && node.spouses.some((s) => s.id === focusMemberId))
    ))
  );

  const menu = (
    <div
      className={`tree-context-menu ${isMobile ? 'is-sheet' : ''}`}
      style={isMobile ? undefined : { left: `${x}px`, top: `${y}px` }}
      onClick={(e) => e.stopPropagation()}
      role={isMobile ? 'dialog' : undefined}
      aria-modal={isMobile ? true : undefined}
      aria-label={isMobile ? `Thao tác với ${node.fullName}` : undefined}
    >
      {isMobile && <div className="tree-context-menu-handle" aria-hidden="true" />}
      {/* Context Menu Header */}
      <div className="tree-context-menu-header">
        <span className="tree-context-menu-title" title={node.fullName}>
          {node.fullName}
        </span>
        {isSelf && <span className="tree-context-menu-badge self">Bạn</span>}
        {node.userId || node.isCurrentUser ? (
          <span className="tree-context-menu-badge linked" title="Đã có tài khoản người dùng liên kết">Đã liên kết tài khoản</span>
        ) : (
          <span className="tree-context-menu-badge unlinked" title="Hồ sơ phả hệ">Hồ sơ phả hệ</span>
        )}
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

          {onViewMyNetwork && (
            <button
              className="tree-context-menu-item blue"
              onClick={() => {
                onClose();
                onViewMyNetwork();
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="tree-menu-item-icon">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Xem Mạng lưới của tôi (Ego)
            </button>
          )}

          <button
            className="tree-context-menu-item purple"
            onClick={() => {
              onClose();
              if (onViewDualLineage) onViewDualLineage(node);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="tree-menu-item-icon">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Xem 2-3 đời Bên Nội / Bên Ngoại
          </button>

          {(!node.isAlive || Boolean(node.deathDate)) && (
            <button
              className="tree-context-menu-item green"
              onClick={() => {
                onClose();
                if (onViewBurial) onViewBurial(node);
                else onViewBio(node);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="tree-menu-item-icon">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              Xem mộ phần & Chỉ đường
            </button>
          )}

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
              else if (onActionToast) onActionToast('Nối phả hệ');
            }}
          >
            {node.isUnconnected ? 'Xác nhận quan hệ (Nối phả hệ)' : 'Di chuyển nhánh'}
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
              {node.isUnconnected && (
                <button
                  className="tree-context-menu-item amber"
                  onClick={() => {
                    onClose();
                    if (onRelocate) onRelocate(node);
                    else if (onActionToast) onActionToast('Nối phả hệ');
                  }}
                >
                  Xác nhận quan hệ (Nối phả hệ)
                </button>
              )}

              <button
                className="tree-context-menu-item"
                onClick={() => {
                  onClose();
                  if (onProposeEdit) onProposeEdit(node);
                  else if (onActionToast) onActionToast('Đề xuất chỉnh sửa thông tin');
                }}
              >
                Đề xuất sửa thông tin của tôi
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

              {(!node.isAlive || Boolean(node.deathDate)) && (
                <button
                  className="tree-context-menu-item green"
                  onClick={() => {
                    onClose();
                    if (onViewBurial) onViewBurial(node);
                    else onViewBio(node);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="tree-menu-item-icon">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                  Xem mộ phần & Chỉ đường
                </button>
              )}
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

              {(!node.isAlive || Boolean(node.deathDate)) && (
                <button
                  className="tree-context-menu-item green"
                  onClick={() => {
                    onClose();
                    if (onViewBurial) onViewBurial(node);
                    else onViewBio(node);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="tree-menu-item-icon">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                  Xem mộ phần & Chỉ đường
                </button>
              )}

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

      {/* Xem 2-3 đời Bên Nội / Bên Ngoại (Huyết thống liên tộc) */}
      <button
        className="tree-context-menu-item purple"
        onClick={() => {
          onClose();
          if (onViewDualLineage) onViewDualLineage(node);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="tree-menu-item-icon">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Xem 2-3 đời Bên Nội / Bên Ngoại
      </button>

      {/* Xem cây gia phả bên thông gia / bên vợ / bên chồng */}
      {(() => {
        const crossSpouse = node.spouses?.find((s) => s.isCrossClan && s.clanId);
        const targetClanId = crossSpouse?.clanId || (node as any).clanId;
        const targetPersonId = crossSpouse?.id || node.id;
        const isWife = (crossSpouse ? crossSpouse.gender === 'female' : node.gender === 'female');
        if (targetClanId) {
          return (
            <button
              className="tree-context-menu-item blue"
              onClick={() => {
                onClose();
                if (onViewInLawTree) onViewInLawTree(targetClanId, targetPersonId);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="tree-menu-item-icon">
                <path d="M15 3h6v6" />
                <path d="M10 14L21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
              Xem cây gia phả bên {isWife ? 'vợ' : 'chồng'} →
            </button>
          );
        }
        return null;
      })()}

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

  if (!isMobile) return menu;

  return (
    <>
      <div className="tree-context-menu-scrim" onClick={onClose} aria-hidden="true" />
      {menu}
    </>
  );
};

export default TreeContextMenu;
