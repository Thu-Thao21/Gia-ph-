import apiClient from '../api/axios';
import { readApiError } from '../api/apiError';

/*
 * Phòng thờ 3D: lớp gọi API BE (BE/app/controllers/worship_hall/router.py, schemas/worship_hall.py).
 * Đường dẫn viết KHÔNG có tiền tố /api/v1 (apiClient đã gắn baseURL). JSON của BE là camelCase.
 * Chỉ các hàm dành cho thành viên; phần quản lý (Trưởng tộc) sẽ thêm ở lượt sau, dùng lại các kiểu bên dưới.
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
  /** true khi là Trưởng tộc / Quản trị hệ thống (dùng ở lượt quản lý). */
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

  constructor(init: {
    kind: WorshipErrorKind;
    message: string;
    status: number | null;
    code: string | null;
    nextOfferAt?: string | null;
    retryAfterSeconds?: number | null;
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = 'WorshipApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.nextOfferAt = init.nextOfferAt ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.requestId = init.requestId ?? null;
  }
}

const NETWORK_MESSAGE = 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';
const GENERIC_MESSAGE = 'Có lỗi xảy ra, vui lòng thử lại sau.';

/** Đổi lỗi axios thành WorshipApiError; rẽ nhánh theo status/code (không theo message). */
export function toWorshipError(err: unknown): WorshipApiError {
  if (err instanceof WorshipApiError) return err;
  const info = readApiError(err);
  const base = { status: info.status, code: info.code, requestId: info.requestId, retryAfterSeconds: info.retryAfterSeconds };
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
