import React, { useEffect } from 'react';
import type { ErgoTreeNode } from '../../../types/tree';
import './TreeNodeSummarySheet.css';

export interface TreeNodeSummarySheetProps {
  node: ErgoTreeNode | null;
  /** Người này đang là người trung tâm (chế độ 4 đời). */
  isFocused: boolean;
  onClose: () => void;
  /** Không truyền thì ẩn nút "Xem hồ sơ". */
  onViewProfile?: (node: ErgoTreeNode) => void;
  /** Hành động khi chạm thẻ trên desktop (làm / bỏ người trung tâm, xem mạng lưới). */
  onToggleFocus: (node: ErgoTreeNode) => void;
  /** Mở menu thao tác đầy đủ (giống nhấn giữ). */
  onMoreActions: (node: ErgoTreeNode) => void;
}

const yearOf = (date?: string) => date?.match(/\d{4}/)?.[0];

const lifeSpan = (node: ErgoTreeNode) => {
  const born = yearOf(node.birthDate);
  const died = yearOf(node.deathDate);
  const isDeceased = !node.isAlive || Boolean(node.deathDate);
  if (!born && !died) return isDeceased ? 'Đã mất' : null;
  if (!isDeceased) return born ? `Sinh năm ${born}` : null;
  return `${born || '?'} – ${died || '?'}`;
};

/** Thẻ tóm tắt ở đáy màn hình khi chạm vào một người trên cây (mobile). */
export const TreeNodeSummarySheet: React.FC<TreeNodeSummarySheetProps> = ({
  node,
  isFocused,
  onClose,
  onViewProfile,
  onToggleFocus,
  onMoreActions,
}) => {
  useEffect(() => {
    if (!node) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [node, onClose]);

  if (!node) return null;

  const span = lifeSpan(node);
  const meta = [
    span,
    node.generation > 0 ? `Đời thứ ${node.generation}` : null,
    node.branch || null,
  ].filter(Boolean);

  return (
    <>
      <div className="tree-summary-scrim" onClick={onClose} aria-hidden="true" />
      <div className="tree-summary-sheet" role="dialog" aria-modal="true" aria-label={`Tóm tắt ${node.fullName}`}>
        <div className="tree-summary-handle" aria-hidden="true" />
        <div className="tree-summary-head">
          <div className={`tree-summary-avatar ${node.gender}`}>
            {node.avatarUrl ? (
              <img src={node.avatarUrl} alt="" />
            ) : (
              (node.fullName || '?').trim().charAt(0).toUpperCase()
            )}
          </div>
          <div className="tree-summary-text">
            <div className="tree-summary-name">
              {node.fullName}
              {node.isCurrentUser && <span className="tree-summary-badge">Bạn</span>}
            </div>
            {node.otherName && <div className="tree-summary-other">{node.otherName}</div>}
            {meta.length > 0 && <div className="tree-summary-meta">{meta.join(' · ')}</div>}
          </div>
          <button type="button" className="tree-summary-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="tree-summary-actions">
          {onViewProfile && (
            <button
              type="button"
              className="tree-summary-btn primary"
              onClick={() => {
                onClose();
                onViewProfile(node);
              }}
            >
              Xem hồ sơ
            </button>
          )}
          <button
            type="button"
            className="tree-summary-btn"
            onClick={() => {
              onClose();
              onToggleFocus(node);
            }}
          >
            {isFocused ? 'Thoát người trung tâm' : 'Làm người trung tâm'}
          </button>
          <button
            type="button"
            className="tree-summary-btn"
            onClick={() => {
              onClose();
              onMoreActions(node);
            }}
          >
            Thao tác khác…
          </button>
        </div>
      </div>
    </>
  );
};

export default TreeNodeSummarySheet;
