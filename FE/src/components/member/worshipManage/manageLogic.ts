import { MAX_BULK_TABLETS, MAX_TIER_COUNT, type TierBrief } from '../../../services/worshipHall.service';

/** Logic thuần (không React, không mạng) của màn hình quản lý bàn thờ, để dùng chung và thử riêng. */

export interface SelectionResult {
  selected: string[];
  /** true khi bấm chọn thêm nhưng đã đủ giới hạn. */
  limitReached: boolean;
}

/** Bật/tắt chọn một người trong danh sách thêm bài vị; tối đa MAX_BULK_TABLETS (50) người một lần. */
export function toggleSelection(selected: string[], id: string, max: number = MAX_BULK_TABLETS): SelectionResult {
  if (selected.includes(id)) return { selected: selected.filter((x) => x !== id), limitReached: false };
  if (selected.length >= max) return { selected, limitReached: true };
  return { selected: [...selected, id], limitReached: false };
}

/** Đổi chỗ phần tử `index` với phần tử kế bên (delta -1 lên, +1 xuống). Ngoài biên thì trả nguyên danh sách (bản sao). */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  const out = [...list];
  if (index < 0 || index >= out.length || target < 0 || target >= out.length) return out;
  [out[index], out[target]] = [out[target], out[index]];
  return out;
}

export interface TierSlot {
  tierNo: number;
  tier: TierBrief | null;
}

/** Sáu ô tầng 1..6: ô đã có tầng thì kèm TierBrief, ô trống thì tier = null (có thể tạo tầng đó). */
export function buildTierSlots(tiers: readonly TierBrief[]): TierSlot[] {
  const byNo = new Map<number, TierBrief>();
  tiers.forEach((tier) => byNo.set(tier.tierNo, tier));
  return Array.from({ length: MAX_TIER_COUNT }, (_, i) => ({ tierNo: i + 1, tier: byNo.get(i + 1) ?? null }));
}

/** "1941-03-12" -> "12/03/1941"; chỉ có năm thì giữ năm; không rõ thì "chưa rõ". */
export function formatDeathDate(raw?: string | null): string {
  if (!raw) return 'chưa rõ';
  const text = String(raw).trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  const year = text.match(/^(\d{4})$/);
  return year ? year[1] : 'chưa rõ';
}

/** Đường dẫn API tương đối (cần token) hay URL dùng thẳng được (blob:, data:, http:). */
export function isApiRelativePath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}

/** Chữ viết tắt cho ảnh thay thế. */
export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'TV';
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}
