import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAllTierTablets,
  type HallResponse,
  type TabletItem,
  type TierBrief,
} from '../../../services/worshipHall.service';
import { AddTab } from './AddTab';
import { BlessingsTab } from './BlessingsTab';
import { ImagesTab } from './ImagesTab';
import type { ManageCtx } from './ManageShared';
import { SettingsTab } from './SettingsTab';
import { TabletsTab } from './TabletsTab';
import { TiersTab } from './TiersTab';
import { describeManageError } from './manageErrors';
import './WorshipManagePanel.css';

type TabId = 'tablets' | 'add' | 'images' | 'tiers' | 'settings' | 'blessings';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'tablets', label: 'Bài vị' },
  { id: 'add', label: 'Thêm bài vị' },
  { id: 'images', label: 'Ảnh' },
  { id: 'tiers', label: 'Tầng' },
  { id: 'settings', label: 'Cài đặt' },
  { id: 'blessings', label: 'Lời viếng' },
];

export interface WorshipManagePanelProps {
  clanId: string;
  /** GET hall mới nhất mà trang đang giữ. */
  hall: HallResponse;
  /**
   * Gọi sau mỗi thao tác ghi thành công: trang tải lại GET hall (để cảnh 3D cập nhật ngay) và trả về dữ liệu mới.
   */
  onChanged: () => Promise<HallResponse>;
  onClose: () => void;
}

const tiersOf = (hall: HallResponse): TierBrief[] =>
  [...hall.tiers]
    .sort((a, b) => a.tierNo - b.tierNo)
    .map((t) => ({ tierId: t.tierId, tierNo: t.tierNo, title: t.title, total: t.total }));

/** Panel (drawer) "Quản lý bàn thờ" cho Trưởng tộc: 6 tab. Chỉ được dựng khi canManage = true (xem WorshipManageEntry). */
export const WorshipManagePanel: React.FC<WorshipManagePanelProps> = ({ clanId, hall, onChanged, onClose }) => {
  const [tab, setTab] = useState<TabId>('tablets');
  const [snap, setSnap] = useState<HallResponse>(hall);
  const [tablets, setTablets] = useState<TabletItem[]>([]);
  const [tabletsLoading, setTabletsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [closeLocked, setCloseLocked] = useState(false);
  const mounted = useRef(true);
  const okTimer = useRef<number | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (okTimer.current !== null) window.clearTimeout(okTimer.current);
    };
  }, []);

  const notify = useCallback((message: string) => {
    setOkMessage(message);
    if (okTimer.current !== null) window.clearTimeout(okTimer.current);
    okTimer.current = window.setTimeout(() => setOkMessage(null), 4000);
  }, []);

  const reportError = useCallback((err: unknown) => {
    setOkMessage(null);
    setErrorMessage(describeManageError(err).message);
  }, []);

  const loadTablets = useCallback(
    async (source: HallResponse) => {
      setTabletsLoading(true);
      try {
        const sorted = [...source.tiers].sort((a, b) => a.tierNo - b.tierNo);
        const lists = await Promise.all(sorted.map((tier) => fetchAllTierTablets(clanId, tier.tierId)));
        if (!mounted.current) return;
        setTablets(lists.flatMap((list) => [...list].sort((a, b) => a.displayOrder - b.displayOrder)));
      } catch (err) {
        if (mounted.current) reportError(err);
      } finally {
        if (mounted.current) setTabletsLoading(false);
      }
    },
    [clanId, reportError]
  );

  useEffect(() => {
    void loadTablets(hall);
    // chỉ tải một lần khi mở; các lần sau do refresh() đảm nhiệm
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(
    async (light: boolean) => {
      const fresh = await onChanged();
      if (!mounted.current) return;
      setSnap(fresh);
      if (!light) await loadTablets(fresh);
    },
    [loadTablets, onChanged]
  );

  const run = useCallback<ManageCtx['run']>(
    async (key, action, okText, options) => {
      setBusyKey(key);
      setErrorMessage(null);
      let result: Awaited<ReturnType<typeof action>>;
      try {
        result = await action();
      } catch (err) {
        if (!mounted.current) return undefined;
        const info = describeManageError(err);
        setOkMessage(null);
        setErrorMessage(info.message);
        setBusyKey(null);
        if (info.shouldReload) void refresh(false).catch(() => undefined);
        return undefined;
      }
      try {
        // Thao tác đã thành công ở BE; tải lại hall để cảnh 3D cập nhật ngay.
        await refresh(!!options?.light);
        if (mounted.current) notify(typeof okText === 'function' ? okText(result) : okText);
      } catch (err) {
        if (mounted.current) {
          setOkMessage(null);
          setErrorMessage(`Thao tác đã được lưu nhưng chưa tải lại được dữ liệu. ${describeManageError(err).message}`);
        }
      } finally {
        if (mounted.current) setBusyKey(null);
      }
      return result;
    },
    [notify, refresh]
  );

  // Mở panel: đưa tiêu điểm vào panel; đóng: trả tiêu điểm về nút đã mở (chỉ chạy một lần).
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    drawerRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // Đóng bằng phím Esc, trừ khi đang cắt ảnh hoặc đang xử lý.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeLocked && busyKey === null) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeLocked, busyKey]);

  const tiers = useMemo(() => tiersOf(snap), [snap]);

  const ctx: ManageCtx = {
    clanId,
    hall: snap,
    tiers,
    tablets,
    tabletsLoading,
    busyKey,
    errorMessage,
    clearError: () => setErrorMessage(null),
    run,
    reportError,
    notify,
    lockClose: setCloseLocked,
  };

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[nextIndex].id);
    document.getElementById(`wm-tab-${TABS[nextIndex].id}`)?.focus();
  };

  return (
    <div
      className="wm-backdrop"
      role="presentation"
      onMouseDown={() => { if (!closeLocked && busyKey === null) onClose(); }}
    >
      <aside
        className="wm-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wm-title"
        tabIndex={-1}
        ref={drawerRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="wm-header">
          <div>
            <span className="wm-eyebrow">TRƯỞNG TỘC</span>
            <h2 id="wm-title">Quản lý bàn thờ</h2>
            <p>{snap.hall.title || snap.hall.clanName}</p>
          </div>
          <button type="button" className="wm-close" onClick={onClose} disabled={busyKey !== null} aria-label="Đóng quản lý bàn thờ">×</button>
        </header>

        <div className="wm-tabs" role="tablist" aria-label="Các mục quản lý bàn thờ">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              id={`wm-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`wm-pane-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              className={tab === item.id ? 'active' : ''}
              onClick={() => { setTab(item.id); setErrorMessage(null); }}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="wm-status">
          {errorMessage && !closeLocked && <p className="wm-error" role="alert">{errorMessage}</p>}
          {okMessage && !errorMessage && <p className="wm-ok" role="status">{okMessage}</p>}
        </div>

        <div className="wm-pane" role="tabpanel" id={`wm-pane-${tab}`} aria-labelledby={`wm-tab-${tab}`}>
          {tab === 'tablets' && <TabletsTab ctx={ctx} />}
          {tab === 'add' && <AddTab ctx={ctx} />}
          {tab === 'images' && <ImagesTab ctx={ctx} />}
          {tab === 'tiers' && <TiersTab ctx={ctx} />}
          {tab === 'settings' && <SettingsTab ctx={ctx} />}
          {tab === 'blessings' && <BlessingsTab ctx={ctx} />}
        </div>
      </aside>
    </div>
  );
};

export default WorshipManagePanel;
