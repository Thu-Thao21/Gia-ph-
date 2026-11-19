import React, { useState } from 'react';
import {
  MAX_TIER_COUNT,
  createTier,
  deleteTier,
  reorderTablets,
  reorderTiers,
  updateTablet,
  updateTier,
  type TierBrief,
} from '../../../services/worshipHall.service';
import { InlineConfirm, TabletThumb, type ManageCtx } from './ManageShared';
import { buildTierSlots, formatDeathDate, moveItem } from './manageLogic';

const TITLE_MAX = 120; // khớp BE (TierCreate/TierUpdate.title)

/** Tab "Tầng": 6 tầng, đổi tên, chuyển bài vị giữa các tầng, đổi thứ tự bằng nút lên/xuống. */
export const TiersTab: React.FC<{ ctx: ManageCtx }> = ({ ctx }) => {
  const [titleDraft, setTitleDraft] = useState<Record<string, string>>({});
  const [newTitle, setNewTitle] = useState<Record<number, string>>({});
  const [openTier, setOpenTier] = useState<string | null>(null);
  const [confirmTier, setConfirmTier] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');

  const slots = buildTierSlots(ctx.tiers);
  const anyBusy = ctx.busyKey !== null;

  const saveTitle = (tier: TierBrief) => {
    const title = (titleDraft[tier.tierId] ?? tier.title).trim();
    if (!title || title === tier.title) return;
    void ctx.run(`tier-${tier.tierId}`, () => updateTier(ctx.clanId, tier.tierId, { title }), `Đã đổi tên tầng ${tier.tierNo}.`);
  };

  const moveTier = (tier: TierBrief, delta: -1 | 1) => {
    const ids = ctx.tiers.map((t) => t.tierId);
    const next = moveItem(ids, ids.indexOf(tier.tierId), delta);
    void ctx.run(`tier-${tier.tierId}`, () => reorderTiers(ctx.clanId, next), 'Đã đổi thứ tự tầng.');
  };

  const moveTablet = (tierId: string, index: number, delta: -1 | 1) => {
    const ids = ctx.tablets.filter((t) => t.tierId === tierId).map((t) => t.id);
    const next = moveItem(ids, index, delta);
    void ctx.run(`order-${tierId}`, () => reorderTablets(ctx.clanId, next), 'Đã đổi thứ tự bài vị.');
  };

  const removeTier = async (tier: TierBrief) => {
    const needsDestination = tier.total > 0;
    if (needsDestination && !moveTo) return;
    const done = await ctx.run(
      `tier-${tier.tierId}`,
      () => deleteTier(ctx.clanId, tier.tierId, needsDestination ? moveTo : undefined),
      `Đã xóa tầng ${tier.tierNo}.`
    );
    if (done) { setConfirmTier(null); setMoveTo(''); setOpenTier(null); }
  };

  return (
    <div className="wm-tiers">
      <p className="wm-hint">
        Tầng 1 nằm trên cùng (đời cao nhất). Tối đa {MAX_TIER_COUNT} tầng. Mở một tầng để đổi thứ tự hoặc chuyển bài vị sang tầng khác.
      </p>

      {slots.map(({ tierNo, tier }) => {
        if (!tier) {
          const draft = newTitle[tierNo] ?? '';
          return (
            <section key={tierNo} className="wm-card wm-tier is-empty" aria-label={`Tầng ${tierNo} (chưa có)`}>
              <div className="wm-tier-head">
                <strong>Tầng {tierNo}</strong>
                <span className="wm-pill">Chưa có</span>
              </div>
              <div className="wm-tier-create">
                <label className="wm-field">
                  <span className="wm-sr">Tên tầng {tierNo}</span>
                  <input
                    type="text"
                    maxLength={TITLE_MAX}
                    value={draft}
                    onChange={(event) => setNewTitle((c) => ({ ...c, [tierNo]: event.target.value }))}
                    placeholder={`Tên tầng ${tierNo} (ví dụ: Đời ${tierNo})`}
                    disabled={anyBusy}
                  />
                </label>
                <button
                  type="button"
                  className="wm-btn wm-btn-primary"
                  disabled={anyBusy || !draft.trim()}
                  onClick={() =>
                    void ctx
                      .run(`tier-new-${tierNo}`, () => createTier(ctx.clanId, { title: draft.trim(), tierNo }), `Đã tạo tầng ${tierNo}.`)
                      .then((done) => { if (done) setNewTitle((c) => ({ ...c, [tierNo]: '' })); })
                  }
                >
                  Tạo tầng {tierNo}
                </button>
              </div>
            </section>
          );
        }

        const tabletsOfTier = ctx.tablets.filter((t) => t.tierId === tier.tierId);
        const tierIndex = ctx.tiers.findIndex((t) => t.tierId === tier.tierId);
        const draft = titleDraft[tier.tierId] ?? tier.title;
        const open = openTier === tier.tierId;
        const others = ctx.tiers.filter((t) => t.tierId !== tier.tierId);
        const busy = ctx.busyKey === `tier-${tier.tierId}` || ctx.busyKey === `order-${tier.tierId}`;
        return (
          <section key={tier.tierId} className="wm-card wm-tier" aria-label={`Tầng ${tier.tierNo}`}>
            <div className="wm-tier-head">
              <strong>Tầng {tier.tierNo}</strong>
              <span className="wm-pill">{tier.total} bài vị</span>
              <div className="wm-inline-actions">
                <button type="button" className="wm-btn wm-btn-icon" aria-label={`Đưa tầng ${tier.tierNo} lên trên`} onClick={() => moveTier(tier, -1)} disabled={anyBusy || tierIndex <= 0}>↑</button>
                <button type="button" className="wm-btn wm-btn-icon" aria-label={`Đưa tầng ${tier.tierNo} xuống dưới`} onClick={() => moveTier(tier, 1)} disabled={anyBusy || tierIndex >= ctx.tiers.length - 1}>↓</button>
              </div>
            </div>

            <div className="wm-tier-rename">
              <label className="wm-field">
                <span className="wm-sr">Tên tầng {tier.tierNo}</span>
                <input
                  type="text"
                  maxLength={TITLE_MAX}
                  value={draft}
                  onChange={(event) => setTitleDraft((c) => ({ ...c, [tier.tierId]: event.target.value }))}
                  disabled={anyBusy}
                />
              </label>
              <button type="button" className="wm-btn" onClick={() => saveTitle(tier)} disabled={anyBusy || !draft.trim() || draft.trim() === tier.title}>
                {busy ? 'Đang lưu…' : 'Đổi tên'}
              </button>
            </div>

            <div className="wm-inline-actions">
              <button type="button" className="wm-btn" aria-expanded={open} onClick={() => setOpenTier(open ? null : tier.tierId)}>
                {open ? 'Thu gọn' : `Xem bài vị (${tabletsOfTier.length})`}
              </button>
              {confirmTier !== tier.tierId && (
                <button type="button" className="wm-btn wm-btn-danger-ghost" onClick={() => { setConfirmTier(tier.tierId); setMoveTo(''); }} disabled={anyBusy}>
                  Xóa tầng
                </button>
              )}
            </div>

            {confirmTier === tier.tierId && (
              <InlineConfirm
                message={
                  tier.total > 0
                    ? `Tầng ${tier.tierNo} còn ${tier.total} bài vị. Chọn tầng nhận các bài vị này rồi xác nhận xóa tầng.`
                    : `Xóa tầng ${tier.tierNo}?`
                }
                confirmLabel="Xác nhận xóa tầng"
                busy={busy}
                onCancel={() => setConfirmTier(null)}
                onConfirm={() => void removeTier(tier)}
              >
                {tier.total > 0 && (
                  <label className="wm-field">
                    <span>Chuyển bài vị sang</span>
                    <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
                      <option value="">— Chọn tầng —</option>
                      {others.map((t) => <option key={t.tierId} value={t.tierId}>Tầng {t.tierNo} · {t.title}</option>)}
                    </select>
                    {others.length === 0 && <small>Cần tạo thêm một tầng khác để chuyển bài vị sang.</small>}
                  </label>
                )}
              </InlineConfirm>
            )}

            {open && (
              <ul className="wm-list wm-list-tight">
                {tabletsOfTier.length === 0 && <li className="wm-empty">Tầng này chưa có bài vị.</li>}
                {tabletsOfTier.map((tablet, index) => (
                  <li key={tablet.id} className="wm-row">
                    <TabletThumb tablet={tablet} />
                    <div className="wm-row-main">
                      <strong>{tablet.fullName}</strong>
                      <small>Mất: {formatDeathDate(tablet.deathDate)}</small>
                    </div>
                    <div className="wm-row-actions">
                      <button type="button" className="wm-btn wm-btn-icon" aria-label={`Đưa ${tablet.fullName} lên`} onClick={() => moveTablet(tier.tierId, index, -1)} disabled={anyBusy || index === 0}>↑</button>
                      <button type="button" className="wm-btn wm-btn-icon" aria-label={`Đưa ${tablet.fullName} xuống`} onClick={() => moveTablet(tier.tierId, index, 1)} disabled={anyBusy || index === tabletsOfTier.length - 1}>↓</button>
                      <label className="wm-move">
                        <span className="wm-sr">Chuyển {tablet.fullName} sang tầng khác</span>
                        <select
                          value=""
                          disabled={anyBusy || others.length === 0}
                          onChange={(event) => {
                            const target = event.target.value;
                            if (target) void ctx.run(`move-${tablet.id}`, () => updateTablet(ctx.clanId, tablet.id, { tierId: target }), `Đã chuyển ${tablet.fullName} sang tầng mới.`);
                          }}
                        >
                          <option value="">Chuyển tầng…</option>
                          {others.map((t) => <option key={t.tierId} value={t.tierId}>Tầng {t.tierNo}</option>)}
                        </select>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};
