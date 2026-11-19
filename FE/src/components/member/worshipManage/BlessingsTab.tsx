import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteBlessing,
  fetchBlessings,
  formatVietnamDateTime,
  hideBlessing,
  type BlessingItem,
} from '../../../services/worshipHall.service';
import { describeManageError } from './manageErrors';
import { InlineConfirm, type ManageCtx } from './ManageShared';

const PAGE = 20;

/** Tab "Lời viếng": danh sách lời viếng đang hiển thị, nút Ẩn và Xóa (có xác nhận). */
export const BlessingsTab: React.FC<{ ctx: ManageCtx }> = ({ ctx }) => {
  const [items, setItems] = useState<BlessingItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'hide' | 'delete' } | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (before: string | null) => {
      seq.current += 1;
      const mine = seq.current;
      setLoading(true);
      setListError(null);
      try {
        const res = await fetchBlessings(ctx.clanId, { limit: PAGE, before });
        if (mine !== seq.current) return;
        setItems((current) => (before ? [...current, ...res.items] : res.items));
        setNext(res.nextBefore);
      } catch (err) {
        if (mine !== seq.current) return;
        setListError(describeManageError(err).message);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [ctx.clanId]
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const act = async (item: BlessingItem, kind: 'hide' | 'delete') => {
    const done = await ctx.run(
      `bl-${kind}-${item.id}`,
      () => (kind === 'hide' ? hideBlessing(ctx.clanId, item.id) : deleteBlessing(ctx.clanId, item.id)),
      kind === 'hide' ? 'Đã ẩn lời viếng.' : 'Đã xóa lời viếng.',
      { light: true }
    );
    if (done) {
      setItems((current) => current.filter((b) => b.id !== item.id));
      setConfirm(null);
    }
  };

  if (loading && items.length === 0) return <p className="wm-empty" role="status">Đang tải lời viếng…</p>;
  if (listError && items.length === 0) {
    return (
      <p className="wm-error" role="alert">
        {listError} <button type="button" className="wm-link" onClick={() => void load(null)}>Thử lại</button>
      </p>
    );
  }
  if (items.length === 0) return <p className="wm-empty">Chưa có lời viếng nào đang hiển thị.</p>;

  return (
    <div>
      <ul className="wm-list" aria-label="Danh sách lời viếng">
        {items.map((item) => {
          const confirming = confirm?.id === item.id;
          return (
            <li key={item.id} className="wm-row wm-row-blessing">
              <div className="wm-row-main">
                <strong>{item.authorName}</strong>
                <small>{formatVietnamDateTime(item.createdAt)}</small>
                <p className="wm-note">“{item.content}”</p>
              </div>
              {!confirming && (
                <div className="wm-row-actions">
                  <button type="button" className="wm-btn" onClick={() => setConfirm({ id: item.id, kind: 'hide' })} disabled={ctx.busyKey !== null}>Ẩn</button>
                  <button type="button" className="wm-btn wm-btn-danger-ghost" onClick={() => setConfirm({ id: item.id, kind: 'delete' })} disabled={ctx.busyKey !== null}>Xóa</button>
                </div>
              )}
              {confirming && confirm && (
                <InlineConfirm
                  message={
                    confirm.kind === 'hide'
                      ? `Ẩn lời viếng của ${item.authorName}? Lời viếng sẽ không còn hiện cho mọi người.`
                      : `Xóa hẳn lời viếng của ${item.authorName}? Không thể khôi phục.`
                  }
                  confirmLabel={confirm.kind === 'hide' ? 'Xác nhận ẩn' : 'Xác nhận xóa'}
                  busy={ctx.busyKey === `bl-${confirm.kind}-${item.id}`}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => void act(item, confirm.kind)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {listError && <p className="wm-error" role="alert">{listError}</p>}
      {next && (
        <button type="button" className="wm-btn wm-btn-block" onClick={() => void load(next)} disabled={loading}>
          {loading ? 'Đang tải…' : 'Xem thêm lời viếng'}
        </button>
      )}
    </div>
  );
};
