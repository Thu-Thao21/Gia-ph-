import React, { Suspense } from 'react';
import type { HallResponse } from '../../../services/worshipHall.service';
import './WorshipManageEntry.css';

const WorshipManagePanel = React.lazy(() => import('./WorshipManagePanel'));

/**
 * Nút "Quản lý bàn thờ": CHỈ hiện khi GET hall báo canManage = true. Thành viên thường không thấy gì
 * (không nút, không DOM thừa).
 */
export const ManageEntryButton: React.FC<{ canManage: boolean; onOpen: () => void }> = ({ canManage, onOpen }) => {
  if (!canManage) return null;
  return (
    <button type="button" className="wm-open-button" onClick={onOpen}>
      <span aria-hidden="true">⚙</span> Quản lý bàn thờ
    </button>
  );
};

/** Chỗ gắn panel: không dựng gì khi canManage = false hoặc chưa mở, kể cả khi `open` bị bật nhầm. */
export const ManagePanelHost: React.FC<{
  canManage: boolean;
  open: boolean;
  clanId: string | null;
  hall: HallResponse | null;
  onChanged: () => Promise<HallResponse>;
  onClose: () => void;
}> = ({ canManage, open, clanId, hall, onChanged, onClose }) => {
  if (!canManage || !open || !clanId || !hall) return null;
  return (
    <Suspense fallback={null}>
      <WorshipManagePanel clanId={clanId} hall={hall} onChanged={onChanged} onClose={onClose} />
    </Suspense>
  );
};
