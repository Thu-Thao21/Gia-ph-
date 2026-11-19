import apiClient from '../api/axios';
import { readApiError } from '../api/apiError';

/*
 * Phòng thờ 3D: lớp gọi API BE (BE/app/controllers/worship_hall/router.py, schemas/worship_hall.py).
 * Đường dẫn viết KHÔNG có tiền tố /api/v1 (apiClient đã gắn baseURL). JSON của BE là camelCase.
 * Phần đầu: các hàm dành cho thành viên. Phần cuối file: các hàm quản lý bàn thờ (Trưởng tộc / Quản trị hệ thống).
 */

/* ------------------------------------------------------------------ */
/* Kiểu dữ liệu (khớp schemas/worship_hall.py)                          */
/* ------------------------------------------------------------------ */

export type HallVisibility = 'PUBLIC' | 'CLAN_ONLY';

export interface StreakInfo {
  current: number;
  longest: number;
  total: number;
  /** ISO date (ngày Việt Nam), null nếu chưa từng thắp. */
  lastDate: string | null;
}

export interface HallInfo {
  /** null: dòng họ chưa có phòng thờ (BE trả khung rỗng). */
  id: string | null;
  title: string;
  clanName: string;
  visibility: HallVisibility | string;
  blessingsEnabled: boolean;
  coverImageUrl: string | null;
  /** true: ảnh bài vị hiển thị đen trắng trong cảnh 3D (cài đặt của Trưởng tộc). */
  portraitGrayscale: boolean;
}

export interface TabletItem {
  id: string;
  personId: string;
  fullName: string;
  generation: number | null;
  birthYear: number | null;
  deathYear: number | null;
  /** "yyyy-mm-dd" hoặc chỉ có năm. */
  birthDate: string | null;
  deathDate: string | null;
  /** Đường dẫn tương đối kiểu /families/{clanId}/worship/images/{tệp}; dùng resolveWorshipImageUrl. */
  portraitUrl: string | null;
  /** Bản nhỏ 512px của ảnh; ảnh cũ chưa có bản nhỏ thì BE trả đúng portraitUrl. */
  thumbnailUrl: string | null;
  note: string | null;
  displayOrder: number;
  tierId: string | null;
  isVisible: boolean;
}

export interface TierItem {
  tierId: string;
  /** 1..6; tầng 1 cao nhất (đời cao nhất). */
  tierNo: number;
  title: string;
  total: number;
  /** Tối đa 12 bài vị đầu của tầng; phần còn lại lấy bằng fetchTierTablets. */
  tablets: TabletItem[];
}

export interface TierBrief {
  tierId: string;
  tierNo: number;
  title: string;
  total: number;
}

export interface TodayInfo {
  incenseCount: number;
  blessingCount: number;
}

export interface MeInfo {
  incenseDoneToday: boolean;
  blessingDoneToday: boolean;
  incenseStreak: StreakInfo;
  blessingStreak: StreakInfo;
}

export interface HallResponse {
  hall: HallInfo;
  tiers: TierItem[];
  today: TodayInfo;
  /** null khi khách chưa đăng nhập. */
  me: MeInfo | null;
  /** true khi là Trưởng tộc / Quản trị hệ thống: chỉ khi đó mới hiện nút "Quản lý bàn thờ". */
  canManage: boolean;
}

export interface TierTabletsResponse {
  tierId: string;
  total: number;
  offset: number;
  limit: number;
  tablets: TabletItem[];
}

export type OfferingType = 'INCENSE' | 'BLESSING';

export interface OfferResponse {
  offeringType: OfferingType | string;
  offerDate: string;
  streak: StreakInfo;
  todayCount: number;
}

export interface BlessingItem {
  id: string;
  content: string;
  authorName: string;
  /** ISO datetime. */
  createdAt: string;
}

export interface BlessingListResponse {
  items: BlessingItem[];
  /** Truyền vào `before` để lấy trang kế; null khi hết. */
  nextBefore: string | null;
}

export interface MyStreaksResponse {
  incenseDoneToday: boolean;
  blessingDoneToday: boolean;
  incenseStreak: StreakInfo;
  blessingStreak: StreakInfo;
}

/* ------------------------------------------------------------------ */
/* Lỗi                                                                  */
/* ------------------------------------------------------------------ */

export type WorshipErrorKind =
  | 'ALREADY_OFFERED' // 409 ALREADY_OFFERED_TODAY
  | 'UNAUTHENTICATED' // 401
  | 'FORBIDDEN' // 403
  | 'CONTENT_REJECTED' // 422
  | 'NOT_FOUND' // 404
  | 'NETWORK' // không có phản hồi (mất mạng, CORS, timeout)
  | 'UNKNOWN';

export class WorshipApiError extends Error {
  readonly kind: WorshipErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  /** Chỉ có ở ALREADY_OFFERED: thời điểm được thắp lại (ISO, details.next_offer_at). */
  readonly nextOfferAt: string | null;
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;
  /** Thông báo gốc của BE (nếu có); kind UNKNOWN thay `message` bằng câu chung nên giữ lại ở đây cho phần quản lý. */
  readonly serverMessage: string | null;

  constructor(init: {
    kind: WorshipErrorKind;
    message: string;
    status: number | null;
    code: string | null;
    nextOfferAt?: string | null;
    retryAfterSeconds?: number | null;
    requestId?: string | null;
    serverMessage?: string | null;
  }) {
    super(init.message);
    this.name = 'WorshipApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.nextOfferAt = init.nextOfferAt ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.requestId = init.requestId ?? null;
    this.serverMessage = init.serverMessage ?? null;
  }
}

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';
const GENERIC_MESSAGE = 'Có lỗi xảy ra, vui lòng thử lại sau.';

/** Đổi lỗi axios thành WorshipApiError; rẽ nhánh theo status/code (không theo message). */
export function toWorshipError(err: unknown): WorshipApiError {
  if (err instanceof WorshipApiError) return err;
  const info = readApiError(err);
  const base = {
    status: info.status,
    code: info.code,
    requestId: info.requestId,
    retryAfterSeconds: info.retryAfterSeconds,
    serverMessage: info.message ?? null,
  };
  if (info.isNetworkError) return new WorshipApiError({ ...base, kind: 'NETWORK', message: NETWORK_MESSAGE });
  if (info.status === 409 && info.code === 'ALREADY_OFFERED_TODAY') {
    const next = info.details && typeof info.details.next_offer_at === 'string' ? info.details.next_offer_at : null;
    const retry =
      info.details && typeof info.details.retry_after_seconds === 'number'
        ? info.details.retry_after_seconds
        : info.retryAfterSeconds;
    return new WorshipApiError({
      ...base,
      retryAfterSeconds: retry,
      kind: 'ALREADY_OFFERED',
      message: info.message || 'Hôm nay bạn đã thực hiện rồi.',
      nextOfferAt: next,
    });
  }
  if (info.status === 401) return new WorshipApiError({ ...base, kind: 'UNAUTHENTICATED', message: 'Đăng nhập để tiếp tục.' });
  if (info.status === 403) return new WorshipApiError({ ...base, kind: 'FORBIDDEN', message: info.message || 'Chỉ thành viên dòng họ.' });
  if (info.status === 404) return new WorshipApiError({ ...base, kind: 'NOT_FOUND', message: info.message || 'Không tìm thấy dữ liệu.' });
  if (info.status === 422) {
    return new WorshipApiError({ ...base, kind: 'CONTENT_REJECTED', message: info.message || 'Nội dung chưa phù hợp.' });
  }
  return new WorshipApiError({ ...base, kind: 'UNKNOWN', message: GENERIC_MESSAGE });
}

/** Chạy một lời gọi axios, đổi mọi lỗi thành WorshipApiError. */
async function call<T>(run: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await run()).data;
  } catch (err) {
    throw toWorshipError(err);
  }
}

/* ------------------------------------------------------------------ */
/* API cho thành viên                                                   */
/* ------------------------------------------------------------------ */

const base = (clanId: string) => `/families/${encodeURIComponent(clanId)}/worship`;

/** GET /families/{clanId}/worship/hall — khách chưa đăng nhập vẫn xem được nếu phòng PUBLIC (không thì 401/403). */
export function fetchWorshipHall(clanId: string): Promise<HallResponse> {
  return call(() => apiClient.get<HallResponse>(`${base(clanId)}/hall`));
}

/** GET /families/{clanId}/worship/tiers/{tierId}/tablets?offset&limit (limit 1..50). */
export function fetchTierTablets(
  clanId: string,
  tierId: string,
  offset: number,
  limit: number
): Promise<TierTabletsResponse> {
  return call(() =>
    apiClient.get<TierTabletsResponse>(`${base(clanId)}/tiers/${encodeURIComponent(tierId)}/tablets`, {
      params: { offset, limit },
    })
  );
}

/** POST /families/{clanId}/worship/incense — 1 lần/ngày (đổi ngày lúc 00:00 giờ VN). 409 → kind ALREADY_OFFERED. */
export function lightIncense(clanId: string): Promise<OfferResponse> {
  return call(() => apiClient.post<OfferResponse>(`${base(clanId)}/incense`));
}

/** POST /families/{clanId}/worship/blessing — body { content }. 409 đã viếng hôm nay; 422 nội dung vi phạm. */
export function writeBlessing(clanId: string, content: string): Promise<OfferResponse> {
  return call(() => apiClient.post<OfferResponse>(`${base(clanId)}/blessing`, { content }));
}

/** GET /families/{clanId}/worship/blessings?limit&before — `before` là nextBefore của trang trước. */
export function fetchBlessings(
  clanId: string,
  params: { limit?: number; before?: string | null } = {}
): Promise<BlessingListResponse> {
  return call(() =>
    apiClient.get<BlessingListResponse>(`${base(clanId)}/blessings`, {
      params: { limit: params.limit ?? 20, before: params.before || undefined },
    })
  );
}

/** GET /families/{clanId}/worship/me/streaks — cần đăng nhập (401 nếu không). */
export function fetchMyStreaks(clanId: string): Promise<MyStreaksResponse> {
  return call(() => apiClient.get<MyStreaksResponse>(`${base(clanId)}/me/streaks`));
}

/* ------------------------------------------------------------------ */
/* Ảnh bài vị                                                           */
/* ------------------------------------------------------------------ */

/**
 * BE trả portraitUrl tương đối (/families/.../worship/images/x.png). Ảnh phòng CLAN_ONLY cần token nên
 * KHÔNG thể đưa thẳng cho thẻ img/WebGL: tải bằng apiClient (có Authorization) rồi dùng blob URL.
 * Kết quả được nhớ theo đường dẫn; gọi releaseWorshipImages() khi rời trang để giải phóng bộ nhớ.
 */
const imageCache = new Map<string, Promise<string>>();

export function fetchWorshipImageObjectUrl(path: string): Promise<string> {
  const key = path.trim();
  let cached = imageCache.get(key);
  if (!cached) {
    cached = apiClient
      .get<Blob>(key, { responseType: 'blob' })
      .then((res) => URL.createObjectURL(res.data))
      .catch((err) => {
        imageCache.delete(key); // lỗi thì lần sau thử lại
        throw toWorshipError(err);
      });
    imageCache.set(key, cached);
  }
  return cached;
}

export function releaseWorshipImages(): void {
  const entries = Array.from(imageCache.values());
  imageCache.clear();
  entries.forEach((entry) => entry.then((url) => URL.revokeObjectURL(url)).catch(() => undefined));
}

/* ------------------------------------------------------------------ */
/* Định dạng giờ Việt Nam                                               */
/* ------------------------------------------------------------------ */

/** "2026-11-13T00:00:00+07:00" -> "00:00 ngày 13/11/2026" (luôn theo múi giờ Việt Nam). Không đọc được thì trả chuỗi rỗng. */
export function formatVietnamDateTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${hour}:${get('minute')} ngày ${get('day')}/${get('month')}/${get('year')}`;
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* API quản lý bàn thờ (chỉ Trưởng tộc / Quản trị hệ thống; còn lại 403)  */
/* ------------------------------------------------------------------ */

/** BE chỉ nhận tối đa 50 người cho một lần POST tablets/bulk. */
export const MAX_BULK_TABLETS = 50;
/** Mỗi phòng thờ có tối đa 6 tầng. */
export const MAX_TIER_COUNT = 6;

/** Người đã mất của dòng họ nhưng chưa có bài vị (GET candidates). */
export interface CandidateItem {
  personId: string;
  fullName: string;
  generation: number | null;
  birthYear: number | null;
  deathYear: number | null;
  hasPortrait: boolean;
}

export interface CandidateListResponse {
  items: CandidateItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface BulkSkipped {
  personId: string;
  /** NOT_FOUND | NOT_DECEASED | ALREADY_EXISTS | LIMIT_REACHED */
  reason: string;
  message: string;
}

export interface BulkAddResponse {
  added: TabletItem[];
  skipped: BulkSkipped[];
}

export interface MessageResponse {
  success: boolean;
  message: string;
}

export interface HallUpdateInput {
  title?: string;
  visibility?: 'PUBLIC' | 'CLAN_ONLY';
  blessingsEnabled?: boolean;
  portraitGrayscale?: boolean;
}

export interface TabletUpdateInput {
  /** null: xóa ghi chú. */
  note?: string | null;
  isVisible?: boolean;
  displayOrder?: number;
  tierId?: string;
}

/** GET candidates: người đã mất chưa có bài vị. search tối đa 100 ký tự, limit 1..50. */
export function fetchCandidates(
  clanId: string,
  params: { search?: string; generation?: number; limit?: number; offset?: number } = {}
): Promise<CandidateListResponse> {
  const search = params.search?.trim();
  return call(() =>
    apiClient.get<CandidateListResponse>(`${base(clanId)}/candidates`, {
      params: {
        search: search ? search.slice(0, 100) : undefined,
        generation: params.generation,
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
      },
    })
  );
}

/** POST tablets: thêm một bài vị (BE tự xếp tầng theo đời nếu không có tierId). */
export function addTablet(
  clanId: string,
  input: { personId: string; note?: string; tierId?: string }
): Promise<TabletItem> {
  return call(() => apiClient.post<TabletItem>(`${base(clanId)}/tablets`, input));
}

/** POST tablets/bulk: tối đa 50 người một lần; người không hợp lệ được trả trong `skipped`, không làm hỏng cả lô. */
export function bulkAddTablets(clanId: string, personIds: string[], tierId?: string): Promise<BulkAddResponse> {
  if (personIds.length === 0 || personIds.length > MAX_BULK_TABLETS) {
    return Promise.reject(
      new WorshipApiError({
        kind: 'CONTENT_REJECTED',
        status: 422,
        code: 'VALIDATION_ERROR',
        message: `Mỗi lần chỉ thêm từ 1 đến ${MAX_BULK_TABLETS} bài vị.`,
        serverMessage: `Mỗi lần chỉ thêm từ 1 đến ${MAX_BULK_TABLETS} bài vị.`,
      })
    );
  }
  return call(() =>
    apiClient.post<BulkAddResponse>(`${base(clanId)}/tablets/bulk`, { personIds, tierId: tierId || undefined })
  );
}

/** PATCH tablets/{id}: ghi chú, ẩn/hiện, đổi tầng (xuống cuối tầng mới), thứ tự. */
export function updateTablet(clanId: string, tabletId: string, patch: TabletUpdateInput): Promise<TabletItem> {
  return call(() => apiClient.patch<TabletItem>(`${base(clanId)}/tablets/${encodeURIComponent(tabletId)}`, patch));
}

/** DELETE tablets/{id}: gỡ bài vị (BE ghi dấu "đã gỡ" để không tự thêm lại; thêm tay vẫn được). */
export function deleteTablet(clanId: string, tabletId: string): Promise<MessageResponse> {
  return call(() => apiClient.delete<MessageResponse>(`${base(clanId)}/tablets/${encodeURIComponent(tabletId)}`));
}

/** PUT tablets/reorder: display_order = vị trí trong danh sách (truyền đủ các bài vị của tầng, theo thứ tự mới). */
export function reorderTablets(clanId: string, orderedIds: string[]): Promise<MessageResponse> {
  return call(() => apiClient.put<MessageResponse>(`${base(clanId)}/tablets/reorder`, { orderedIds }));
}

function imageForm(blob: Blob, filename: string): FormData {
  const form = new FormData();
  form.append('file', blob, filename);
  return form;
}

/**
 * apiClient mặc định gửi Content-Type: application/json, khiến axios biến FormData thành JSON (mất tệp ảnh).
 * Ghi đè bằng multipart/form-data: axios giữ nguyên FormData và trình duyệt tự thêm boundary.
 */
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } } as const;

/** POST tablets/{id}/portrait (multipart, trường `file`). JPG/PNG/WebP ≤ 5MB, cạnh dài ≤ 4000px; sai thì 422. */
export function uploadTabletPortrait(
  clanId: string,
  tabletId: string,
  blob: Blob,
  filename = 'portrait.jpg'
): Promise<{ portraitUrl: string }> {
  return call(() =>
    apiClient.post<{ portraitUrl: string }>(
      `${base(clanId)}/tablets/${encodeURIComponent(tabletId)}/portrait`,
      imageForm(blob, filename),
      MULTIPART
    )
  );
}

export function deleteTabletPortrait(clanId: string, tabletId: string): Promise<MessageResponse> {
  return call(() =>
    apiClient.delete<MessageResponse>(`${base(clanId)}/tablets/${encodeURIComponent(tabletId)}/portrait`)
  );
}

/** POST hall/cover (multipart, trường `file`). */
export function uploadHallCover(clanId: string, blob: Blob, filename = 'cover.jpg'): Promise<{ coverImageUrl: string }> {
  return call(() => apiClient.post<{ coverImageUrl: string }>(`${base(clanId)}/hall/cover`, imageForm(blob, filename), MULTIPART));
}

export function deleteHallCover(clanId: string): Promise<MessageResponse> {
  return call(() => apiClient.delete<MessageResponse>(`${base(clanId)}/hall/cover`));
}

/** POST tiers: tierNo 1..6 (bỏ trống thì BE lấy số nhỏ nhất còn trống). Đã đủ 6 tầng → 422; trùng số tầng → 409. */
export function createTier(clanId: string, input: { title: string; tierNo?: number }): Promise<TierBrief> {
  return call(() => apiClient.post<TierBrief>(`${base(clanId)}/tiers`, input));
}

/** PATCH tiers/{id}: đổi tên và/hoặc số tầng (đổi sang số đã có thì hoán đổi hai tầng). */
export function updateTier(
  clanId: string,
  tierId: string,
  patch: { title?: string; tierNo?: number }
): Promise<TierBrief> {
  return call(() => apiClient.patch<TierBrief>(`${base(clanId)}/tiers/${encodeURIComponent(tierId)}`, patch));
}

/** DELETE tiers/{id}: tầng còn bài vị thì phải có moveToTierId, nếu không BE trả 409. */
export function deleteTier(clanId: string, tierId: string, moveToTierId?: string): Promise<MessageResponse> {
  return call(() =>
    apiClient.delete<MessageResponse>(`${base(clanId)}/tiers/${encodeURIComponent(tierId)}`, {
      params: { moveToTierId: moveToTierId || undefined },
    })
  );
}

/** PUT tiers/reorder: PHẢI liệt kê đủ mọi tầng; tierNo mới = vị trí (1..n). */
export function reorderTiers(clanId: string, orderedIds: string[]): Promise<TierBrief[]> {
  return call(() => apiClient.put<TierBrief[]>(`${base(clanId)}/tiers/reorder`, { orderedIds }));
}

/** PATCH hall: tiêu đề, hiển thị, bật/tắt lời viếng, ảnh thờ đen trắng (chỉ gửi trường nào đổi). */
export function updateHall(clanId: string, patch: HallUpdateInput): Promise<HallInfo> {
  return call(() => apiClient.patch<HallInfo>(`${base(clanId)}/hall`, patch));
}

/** PATCH blessings/{id}/hide: ẩn lời viếng khỏi danh sách. */
export function hideBlessing(clanId: string, blessingId: string): Promise<MessageResponse> {
  return call(() =>
    apiClient.patch<MessageResponse>(`${base(clanId)}/blessings/${encodeURIComponent(blessingId)}/hide`)
  );
}

/** DELETE blessings/{id}: xóa nội dung lời viếng. */
export function deleteBlessing(clanId: string, blessingId: string): Promise<MessageResponse> {
  return call(() => apiClient.delete<MessageResponse>(`${base(clanId)}/blessings/${encodeURIComponent(blessingId)}`));
}

/** Lấy TOÀN BỘ bài vị của một tầng (GET /hall chỉ trả 12 bài vị đầu): phân trang 50 một lượt. */
export async function fetchAllTierTablets(clanId: string, tierId: string): Promise<TabletItem[]> {
  const out: TabletItem[] = [];
  const PAGE = 50;
  for (let guard = 0; guard < 10; guard += 1) {
    const page = await fetchTierTablets(clanId, tierId, out.length, PAGE);
    out.push(...page.tablets);
    if (page.tablets.length === 0 || out.length >= page.total) break;
  }
  return out;
}
