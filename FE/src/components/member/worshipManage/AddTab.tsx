import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_BULK_TABLETS,
  bulkAddTablets,
  fetchCandidates,
  type BulkAddResponse,
  type CandidateItem,
} from '../../../services/worshipHall.service';
import { describeManageError } from './manageErrors';
import { toggleSelection } from './manageLogic';
import type { ManageCtx } from './ManageShared';

const PAGE = 20;
const SEARCH_DELAY_MS = 350;

/** Tab "Thêm bài vị": người đã mất chưa có bài vị (GET candidates), chọn nhiều người rồi thêm một lượt (tối đa 50). */
export const AddTab: React.FC<{ ctx: ManageCtx }> = ({ ctx }) => {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<CandidateItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [limitNote, setLimitNote] = useState(false);
  const [tierId, setTierId] = useState('');
  const [result, setResult] = useState<{ data: BulkAddResponse; names: Record<string, string> } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (offset: number) => {
      seq.current += 1;
      const mine = seq.current;
      setLoading(true);
      setListError(null);
      try {
        const res = await fetchCandidates(ctx.clanId, { search: debounced || undefined, limit: PAGE, offset });
        if (mine !== seq.current) return;
        setItems((current) => (offset === 0 ? res.items : [...current, ...res.items]));
        setTotal(res.total);
      } catch (err) {
        if (mine !== seq.current) return;
        setListError(describeManageError(err).message);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [ctx.clanId, debounced]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  const toggle = (id: string) => {
    const next = toggleSelection(selected, id);
    setSelected(next.selected);
    setLimitNote(next.limitReached);
  };

  const addSelected = async () => {
    if (selected.length === 0) return;
    setResult(null);
    const names: Record<string, string> = {};
    items.forEach((c) => { if (selected.includes(c.personId)) names[c.personId] = c.fullName; });
    const res = await ctx.run(
      'bulk-add',
      () => bulkAddTablets(ctx.clanId, selected, tierId || undefined),
      (r) =>
        r.skipped.length > 0
          ? `Đã thêm ${r.added.length} bài vị, bỏ qua ${r.skipped.length} người.`
          : `Đã thêm ${r.added.length} bài vị vào phòng thờ.`
    );
    if (res) {
      setResult({ data: res, names });
      setSelected([]);
      setLimitNote(false);
      void load(0);
    }
  };

  const busy = ctx.busyKey === 'bulk-add';

  return (
    <div className="wm-add">
      <label className="wm-field">
        <span>Tìm theo tên</span>
        <input
          type="search"
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nhập họ tên người đã mất…"
        />
      </label>

      <label className="wm-field">
        <span>Đặt vào tầng</span>
        <select value={tierId} onChange={(event) => setTierId(event.target.value)} disabled={busy}>
          <option value="">Tự xếp theo đời</option>
          {ctx.tiers.map((tier) => (
            <option key={tier.tierId} value={tier.tierId}>Tầng {tier.tierNo} · {tier.title}</option>
          ))}
        </select>
      </label>

      {listError && (
        <p className="wm-error" role="alert">
          {listError} <button type="button" className="wm-link" onClick={() => void load(0)}>Thử lại</button>
        </p>
      )}

      {result && (
        <div className="wm-result" role="status">
          <strong>Đã thêm {result.data.added.length} bài vị.</strong>
          {result.data.skipped.length > 0 && (
            <ul>
              {result.data.skipped.map((skip) => (
                <li key={skip.personId}>{result.names[skip.personId] || 'Một người'}: {skip.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {items.length === 0 && !loading && !listError ? (
        <p className="wm-empty">
          {debounced
            ? 'Không tìm thấy người đã mất nào khớp với tên này.'
            : 'Không còn người đã mất nào chưa có bài vị. Người mới được cập nhật là "đã mất" sẽ tự có bài vị.'}
        </p>
      ) : (
        <ul className="wm-list" aria-label="Người đã mất chưa có bài vị">
          {items.map((person) => {
            const checked = selected.includes(person.personId);
            return (
              <li key={person.personId} className={`wm-row wm-row-pick ${checked ? 'is-selected' : ''}`}>
                <label>
                  <input type="checkbox" checked={checked} onChange={() => toggle(person.personId)} disabled={busy} />
                  <span className="wm-row-main">
                    <strong>{person.fullName}</strong>
                    <small>
                      {person.generation ? `Đời ${person.generation}` : 'Chưa rõ đời'}
                      {' · '}
                      {person.birthYear ?? '?'} – {person.deathYear ?? '?'}
                      {person.hasPortrait && ' · Có ảnh'}
                    </small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {loading && <p className="wm-empty" role="status">Đang tải…</p>}
      {!loading && items.length < total && (
        <button type="button" className="wm-btn wm-btn-block" onClick={() => void load(items.length)}>
          Xem thêm ({items.length}/{total})
        </button>
      )}

      <div className="wm-sticky-bar">
        <span aria-live="polite">
          Đã chọn <b>{selected.length}</b>/{MAX_BULK_TABLETS}
          {limitNote && <em> · Mỗi lần chỉ thêm tối đa {MAX_BULK_TABLETS} người</em>}
        </span>
        <div className="wm-inline-actions">
          {selected.length > 0 && (
            <button type="button" className="wm-btn" onClick={() => { setSelected([]); setLimitNote(false); }} disabled={busy}>
              Bỏ chọn
            </button>
          )}
          <button type="button" className="wm-btn wm-btn-primary" onClick={() => void addSelected()} disabled={selected.length === 0 || ctx.busyKey !== null}>
            {busy ? 'Đang thêm…' : `Thêm ${selected.length || ''} bài vị`.replace('  ', ' ')}
          </button>
        </div>
      </div>
    </div>
  );
};
