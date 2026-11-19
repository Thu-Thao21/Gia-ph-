import React, { useState } from 'react';
import { deleteTablet, updateTablet } from '../../../services/worshipHall.service';
import { InlineConfirm, TabletThumb, type ManageCtx } from './ManageShared';
import { formatDeathDate } from './manageLogic';

const NOTE_MAX = 2000; // khớp BE (TabletUpdate.note)

/** Tab "Bài vị": danh sách bài vị hiện có; sửa ghi chú, ẩn/hiện, xóa (xác nhận ngay trong trang). */
export const TabletsTab: React.FC<{ ctx: ManageCtx }> = ({ ctx }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const tierTitle = (tierId: string | null) => {
    const tier = ctx.tiers.find((t) => t.tierId === tierId);
    return tier ? `Tầng ${tier.tierNo} · ${tier.title}` : 'Chưa xếp tầng';
  };

  if (ctx.tabletsLoading && ctx.tablets.length === 0) {
    return <p className="wm-empty" role="status">Đang tải danh sách bài vị…</p>;
  }
  if (ctx.tablets.length === 0) {
    return (
      <div className="wm-empty">
        <strong>Chưa có bài vị nào.</strong>
        <p>Mở tab "Thêm bài vị" để chọn người đã mất của dòng họ lập bài vị.</p>
      </div>
    );
  }

  const saveNote = async (id: string) => {
    const clean = noteDraft.trim();
    const done = await ctx.run(`note-${id}`, () => updateTablet(ctx.clanId, id, { note: clean || null }), 'Đã lưu ghi chú.');
    if (done) setEditingId(null);
  };

  return (
    <ul className="wm-list" aria-label="Danh sách bài vị">
      {ctx.tablets.map((tablet) => {
        const busy = ctx.busyKey?.endsWith(`-${tablet.id}`) ?? false;
        const editing = editingId === tablet.id;
        return (
          <li key={tablet.id} className={`wm-row ${tablet.isVisible ? '' : 'is-hidden'}`}>
            <TabletThumb tablet={tablet} />
            <div className="wm-row-main">
              <strong>{tablet.fullName}</strong>
              <small>
                Mất: {formatDeathDate(tablet.deathDate)} · {tierTitle(tablet.tierId)}
                {!tablet.isVisible && <span className="wm-pill">Đang ẩn</span>}
              </small>
              {editing ? (
                <div className="wm-note-edit">
                  <label>
                    <span className="wm-sr">Ghi chú của {tablet.fullName}</span>
                    <textarea
                      rows={3}
                      maxLength={NOTE_MAX}
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Ghi chú hiển thị cùng bài vị…"
                      disabled={busy}
                    />
                  </label>
                  <small>{noteDraft.length}/{NOTE_MAX} ký tự</small>
                  <div className="wm-inline-actions">
                    <button type="button" className="wm-btn wm-btn-primary" onClick={() => void saveNote(tablet.id)} disabled={busy}>
                      {busy ? 'Đang lưu…' : 'Lưu ghi chú'}
                    </button>
                    <button type="button" className="wm-btn" onClick={() => setEditingId(null)} disabled={busy}>Hủy</button>
                  </div>
                </div>
              ) : (
                tablet.note && <p className="wm-note">{tablet.note}</p>
              )}
            </div>

            {!editing && confirmId !== tablet.id && (
              <div className="wm-row-actions">
                <button
                  type="button"
                  className="wm-btn"
                  onClick={() => { setEditingId(tablet.id); setNoteDraft(tablet.note || ''); setConfirmId(null); }}
                  disabled={ctx.busyKey !== null}
                >
                  Sửa ghi chú
                </button>
                <button
                  type="button"
                  className="wm-btn"
                  onClick={() =>
                    void ctx.run(
                      `vis-${tablet.id}`,
                      () => updateTablet(ctx.clanId, tablet.id, { isVisible: !tablet.isVisible }),
                      tablet.isVisible ? 'Đã ẩn bài vị.' : 'Đã hiện lại bài vị.'
                    )
                  }
                  disabled={ctx.busyKey !== null}
                >
                  {tablet.isVisible ? 'Ẩn' : 'Hiện'}
                </button>
                <button type="button" className="wm-btn wm-btn-danger-ghost" onClick={() => setConfirmId(tablet.id)} disabled={ctx.busyKey !== null}>
                  Xóa
                </button>
              </div>
            )}

            {confirmId === tablet.id && (
              <InlineConfirm
                message={`Gỡ bài vị của ${tablet.fullName} khỏi phòng thờ? Bài vị sẽ không tự được thêm lại; bạn vẫn có thể thêm lại bằng tay.`}
                confirmLabel="Xác nhận xóa"
                busy={busy}
                onCancel={() => setConfirmId(null)}
                onConfirm={() =>
                  void ctx
                    .run(`del-${tablet.id}`, () => deleteTablet(ctx.clanId, tablet.id), `Đã xóa bài vị ${tablet.fullName}.`)
                    .then((result) => { if (result) setConfirmId(null); })
                }
              />
            )}
          </li>
        );
      })}
    </ul>
  );
};
