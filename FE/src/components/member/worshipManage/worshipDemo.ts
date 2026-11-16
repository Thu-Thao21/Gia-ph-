/*
 * CHẾ ĐỘ MINH HỌA (?demo=1) của Phòng Thờ Số: giả lập toàn bộ API /families/{clanId}/worship/* bằng dữ liệu
 * trong bộ nhớ, để thử màn hình "Quản lý bàn thờ" mà không cần Backend.
 *
 * - File này CHỈ được nạp bằng import() trong nhánh `import.meta.env.DEV` của DigitalAncestralHallModule,
 *   nên không đi vào bản build production.
 * - Cơ chế: thay adapter của axios (apiClient) trong lúc trang demo đang mở. Mọi lời gọi /worship/* được trả lời
 *   tại chỗ (KHÔNG có request mạng nào); URL khác đi qua adapter gốc như bình thường.
 * - Dữ liệu mất khi tải lại trang. Mô phỏng các quy tắc của BE: tối đa 300 bài vị / 50 người một lượt / 6 tầng,
 *   trùng bài vị → 409, tầng còn bài vị phải chuyển đi mới xóa được, ảnh ≤ 5MB (JPG/PNG/WebP)...
 * - Thử lỗi: thêm ?demoFail=401|403|409|422|500|network vào URL, mọi thao tác GHI sẽ trả lỗi đó.
 */
import axios, { AxiosError, type AxiosAdapter, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type {
  BlessingItem,
  CandidateItem,
  HallInfo,
  HallResponse,
  TabletItem,
  TierBrief,
} from '../../../services/worshipHall.service';

export interface DemoRequest {
  method: string;
  /** Đường dẫn sau /families/{clanId}/worship/ (không có query), ví dụ "tablets/bulk". */
  path: string;
  params: Record<string, unknown>;
  body: unknown;
}

export interface DemoReply {
  status: number;
  data: unknown;
}

/** Lỗi theo đúng khuôn của BE: {"error": {"code", "message", "request_id"}}. */
class DemoFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const MAX_TABLETS = 300;
const MAX_BULK = 50;
const MAX_TIERS = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BLESSING_MAX = 300;
const HALL_PREVIEW = 12;

const defaultTierTitle = (no: number) => (no === 1 ? 'Thủy tổ / Đời 1' : `Đời ${no}`);
const tierForGeneration = (generation: number | null) =>
  generation == null ? MAX_TIERS : Math.max(1, Math.min(Math.trunc(generation), MAX_TIERS));

interface DemoTier { tierId: string; tierNo: number; title: string }
interface DemoBlessing { id: string; content: string | null; authorName: string; createdAt: string; hidden: boolean }

const seedCandidates = (): CandidateItem[] => [
  { personId: 'cand-1', fullName: 'Dương Văn Khởi', generation: 1, birthYear: 1840, deathYear: 1909, hasPortrait: false },
  { personId: 'cand-2', fullName: 'Trần Thị Sen', generation: 1, birthYear: 1846, deathYear: 1920, hasPortrait: false },
  { personId: 'cand-3', fullName: 'Dương Văn Phúc', generation: 2, birthYear: 1890, deathYear: 1962, hasPortrait: true },
  { personId: 'cand-4', fullName: 'Phạm Thị Lan', generation: 2, birthYear: 1894, deathYear: 1971, hasPortrait: false },
  { personId: 'cand-5', fullName: 'Dương Văn Thịnh', generation: 3, birthYear: 1921, deathYear: 1999, hasPortrait: true },
  { personId: 'cand-6', fullName: 'Hoàng Thị Hạnh', generation: 3, birthYear: 1926, deathYear: 2008, hasPortrait: false },
  { personId: 'cand-7', fullName: 'Dương Quốc Bảo', generation: 4, birthYear: 1950, deathYear: 2015, hasPortrait: false },
  { personId: 'cand-8', fullName: 'Nguyễn Thị Thu', generation: 4, birthYear: 1953, deathYear: 2019, hasPortrait: false },
  ...Array.from({ length: 12 }, (_, i): CandidateItem => ({
    personId: `cand-x${i + 1}`,
    fullName: `Tiền nhân thử nghiệm ${i + 1}`,
    generation: 5 + (i % 3),
    birthYear: 1960 + i,
    deathYear: 2020 + (i % 4),
    hasPortrait: false,
  })),
];

/** Máy chủ giả trong bộ nhớ. `handle` là hàm thuần theo (method, path): dùng được cả khi thử tự động. */
export function createDemoBackend(seed: HallResponse, options: { failWith?: string | null } = {}) {
  const hall: HallInfo = { ...seed.hall, id: seed.hall.id || 'demo-hall', portraitGrayscale: !!seed.hall.portraitGrayscale };
  const tiers: DemoTier[] = seed.tiers.map((t) => ({ tierId: t.tierId, tierNo: t.tierNo, title: t.title }));
  let tablets: TabletItem[] = seed.tiers.flatMap((t) =>
    t.tablets.map((x) => ({ ...x, tierId: t.tierId, thumbnailUrl: x.thumbnailUrl ?? x.portraitUrl }))
  );
  let candidates = seedCandidates();
  const removedPersons = new Set<string>();
  const blessings: DemoBlessing[] = [
    { id: 'bl-1', content: 'Con cháu luôn nhớ ơn công đức của tổ tiên.', authorName: 'Dương Thị Hoa', createdAt: new Date(Date.now() - 3 * 3600e3).toISOString(), hidden: false },
    { id: 'bl-2', content: 'Kính nguyện tổ tiên phù hộ cho cả dòng họ bình an.', authorName: 'Dương Văn Nam', createdAt: new Date(Date.now() - 26 * 3600e3).toISOString(), hidden: false },
    { id: 'bl-3', content: 'Một lời viếng để thử nút Ẩn / Xóa.', authorName: 'Người thử nghiệm', createdAt: new Date(Date.now() - 50 * 3600e3).toISOString(), hidden: false },
  ];
  let seq = 0;
  let incenseCount = seed.today.incenseCount;
  let incenseDone = false;
  let blessingDone = false;
  const failWith = options.failWith || null;
  const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;

  const sortedTiers = () => [...tiers].sort((a, b) => a.tierNo - b.tierNo);
  const tabletsOf = (tierId: string) => tablets.filter((t) => t.tierId === tierId).sort((a, b) => a.displayOrder - b.displayOrder);
  const brief = (t: DemoTier): TierBrief => ({ tierId: t.tierId, tierNo: t.tierNo, title: t.title, total: tabletsOf(t.tierId).length });
  const findTier = (id: string) => {
    const tier = tiers.find((t) => t.tierId === id);
    if (!tier) throw new DemoFailure(404, 'NOT_FOUND', 'Không tìm thấy tầng trong phòng thờ này.');
    return tier;
  };
  const findTablet = (id: string) => {
    const tablet = tablets.find((t) => t.id === id);
    if (!tablet) throw new DemoFailure(404, 'NOT_FOUND', 'Không tìm thấy bài vị trong phòng thờ này.');
    return tablet;
  };
  const nextOrder = (tierId: string) => tabletsOf(tierId).reduce((m, t) => Math.max(m, t.displayOrder), -1) + 1;
  const tierByNo = (no: number): DemoTier => {
    let tier = tiers.find((t) => t.tierNo === no);
    if (!tier) {
      tier = { tierId: nextId('demo-tier'), tierNo: no, title: defaultTierTitle(no) };
      tiers.push(tier);
    }
    return tier;
  };
  const addFromCandidate = (c: CandidateItem, tierId?: string): TabletItem => {
    const tier = tierId ? findTier(tierId) : tierByNo(tierForGeneration(c.generation));
    const tablet: TabletItem = {
      id: nextId('demo-tablet'),
      personId: c.personId,
      fullName: c.fullName,
      generation: c.generation,
      birthYear: c.birthYear,
      deathYear: c.deathYear,
      birthDate: c.birthYear ? String(c.birthYear) : null,
      deathDate: c.deathYear ? String(c.deathYear) : null,
      portraitUrl: null,
      thumbnailUrl: null,
      note: null,
      displayOrder: nextOrder(tier.tierId),
      tierId: tier.tierId,
      isVisible: true,
    };
    tablets.push(tablet);
    candidates = candidates.filter((x) => x.personId !== c.personId);
    removedPersons.delete(c.personId);
    return tablet;
  };

  const checkImage = (file: unknown): Blob => {
    if (!(file instanceof Blob)) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Không nhận được tệp ảnh.');
    if (file.size > MAX_IMAGE_BYTES) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Ảnh vượt quá dung lượng tối đa 5MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new DemoFailure(422, 'VALIDATION_ERROR', 'Chỉ chấp nhận ảnh JPG, PNG hoặc WebP (nhận dạng theo nội dung tệp, không theo đuôi tệp)');
    }
    return file;
  };
  const fileOf = (body: unknown): unknown => (body instanceof FormData ? body.get('file') : null);
  const ok = (message: string): DemoReply => ({ status: 200, data: { success: true, message } });
  const obj = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});

  const hallResponse = (): HallResponse => ({
    hall: { ...hall },
    tiers: sortedTiers().map((t) => ({
      ...brief(t),
      tablets: tabletsOf(t.tierId).slice(0, HALL_PREVIEW),
    })),
    today: { incenseCount, blessingCount: blessings.filter((b) => !b.hidden && b.content).length },
    me: {
      incenseDoneToday: incenseDone,
      blessingDoneToday: blessingDone,
      incenseStreak: { current: incenseDone ? 1 : 0, longest: incenseDone ? 1 : 0, total: incenseDone ? 1 : 0, lastDate: null },
      blessingStreak: { current: blessingDone ? 1 : 0, longest: blessingDone ? 1 : 0, total: blessingDone ? 1 : 0, lastDate: null },
    },
    canManage: true,
  });

  function route(req: DemoRequest): DemoReply {
    const { method, path, params, body } = req;
    const parts = path.split('/').filter(Boolean);
    const b = obj(body);
    const [a0, a1, a2] = parts;

    // ---------------- đọc ----------------
    if (method === 'GET' && path === 'hall') return { status: 200, data: hallResponse() };
    if (method === 'GET' && a0 === 'tiers' && a2 === 'tablets') {
      const tier = findTier(a1);
      const offset = Number(params.offset ?? 0);
      const limit = Number(params.limit ?? 12);
      const all = tabletsOf(tier.tierId);
      return { status: 200, data: { tierId: tier.tierId, total: all.length, offset, limit, tablets: all.slice(offset, offset + limit) } };
    }
    if (method === 'GET' && path === 'candidates') {
      const search = String(params.search ?? '').trim().toLowerCase();
      const offset = Number(params.offset ?? 0);
      const limit = Number(params.limit ?? 20);
      const list = candidates.filter((c) => !search || c.fullName.toLowerCase().includes(search));
      return { status: 200, data: { items: list.slice(offset, offset + limit), total: list.length, offset, limit } };
    }
    if (method === 'GET' && path === 'blessings') {
      const limit = Number(params.limit ?? 20);
      const visible = blessings
        .filter((x) => !x.hidden && x.content)
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
      const items: BlessingItem[] = visible.slice(0, limit).map((x) => ({ id: x.id, content: x.content || '', authorName: x.authorName, createdAt: x.createdAt }));
      return { status: 200, data: { items, nextBefore: null } };
    }
    if (method === 'GET' && path === 'me/streaks') {
      const me = hallResponse().me!;
      return { status: 200, data: me };
    }

    // ---------------- thắp hương / lời viếng (thành viên) ----------------
    if (method === 'POST' && path === 'incense') {
      incenseCount += 1;
      incenseDone = true;
      return { status: 200, data: { offeringType: 'INCENSE', offerDate: new Date().toISOString().slice(0, 10), streak: hallResponse().me!.incenseStreak, todayCount: incenseCount } };
    }
    if (method === 'POST' && path === 'blessing') {
      if (!hall.blessingsEnabled) throw new DemoFailure(409, 'STATE_CONFLICT', 'Phòng thờ đang tắt tính năng Lời viếng.');
      const content = String(b.content ?? '').trim();
      if (!content) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Lời viếng không được để trống.');
      if (content.length > BLESSING_MAX) throw new DemoFailure(422, 'VALIDATION_ERROR', `Lời viếng tối đa ${BLESSING_MAX} ký tự.`);
      blessings.push({ id: nextId('bl'), content, authorName: 'Trưởng tộc (minh họa)', createdAt: new Date().toISOString(), hidden: false });
      blessingDone = true;
      return { status: 200, data: { offeringType: 'BLESSING', offerDate: new Date().toISOString().slice(0, 10), streak: hallResponse().me!.blessingStreak, todayCount: blessings.length } };
    }

    // ---------------- quản lý: phòng thờ ----------------
    if (method === 'PATCH' && path === 'hall') {
      if (typeof b.title === 'string') {
        const title = b.title.trim();
        if (!title || title.length > 255) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Tiêu đề phòng thờ phải từ 1 đến 255 ký tự.');
        hall.title = title;
      }
      if (typeof b.blessingsEnabled === 'boolean') hall.blessingsEnabled = b.blessingsEnabled;
      if (typeof b.portraitGrayscale === 'boolean') hall.portraitGrayscale = b.portraitGrayscale;
      if (b.visibility === 'PUBLIC' || b.visibility === 'CLAN_ONLY') hall.visibility = b.visibility;
      return { status: 200, data: { ...hall } };
    }
    if (method === 'POST' && path === 'hall/cover') {
      const blob = checkImage(fileOf(body));
      hall.coverImageUrl = URL.createObjectURL(blob);
      return { status: 200, data: { coverImageUrl: hall.coverImageUrl } };
    }
    if (method === 'DELETE' && path === 'hall/cover') {
      hall.coverImageUrl = null;
      return ok('Đã xóa ảnh nền phòng thờ.');
    }

    // ---------------- quản lý: bài vị ----------------
    if (method === 'POST' && path === 'tablets') {
      const personId = String(b.personId ?? '');
      if (tablets.some((t) => t.personId === personId)) throw new DemoFailure(409, 'DUPLICATE_RESOURCE', 'Thành viên này đã có bài vị trong phòng thờ.');
      const cand = candidates.find((c) => c.personId === personId);
      if (!cand) throw new DemoFailure(404, 'NOT_FOUND', 'Không tìm thấy thành viên này trong dòng họ.');
      if (tablets.length >= MAX_TABLETS) throw new DemoFailure(422, 'VALIDATION_ERROR', `Phòng thờ đã đủ ${MAX_TABLETS} bài vị.`);
      const tablet = addFromCandidate(cand, typeof b.tierId === 'string' ? b.tierId : undefined);
      if (typeof b.note === 'string' && b.note.trim()) tablet.note = b.note.trim();
      return { status: 201, data: tablet };
    }
    if (method === 'POST' && path === 'tablets/bulk') {
      const ids = Array.isArray(b.personIds) ? (b.personIds as string[]) : [];
      if (ids.length < 1 || ids.length > MAX_BULK) throw new DemoFailure(422, 'VALIDATION_ERROR', `Mỗi lần chỉ thêm từ 1 đến ${MAX_BULK} bài vị.`);
      const tierId = typeof b.tierId === 'string' ? b.tierId : undefined;
      if (tierId) findTier(tierId);
      const added: TabletItem[] = [];
      const skipped: Array<{ personId: string; reason: string; message: string }> = [];
      for (const personId of ids) {
        const cand = candidates.find((c) => c.personId === personId);
        if (tablets.some((t) => t.personId === personId)) skipped.push({ personId, reason: 'ALREADY_EXISTS', message: 'Thành viên này đã có bài vị trong phòng thờ.' });
        else if (!cand) skipped.push({ personId, reason: 'NOT_FOUND', message: 'Không tìm thấy thành viên này trong dòng họ.' });
        else if (tablets.length >= MAX_TABLETS) skipped.push({ personId, reason: 'LIMIT_REACHED', message: `Phòng thờ đã đủ ${MAX_TABLETS} bài vị.` });
        else added.push(addFromCandidate(cand, tierId));
      }
      return { status: 200, data: { added, skipped } };
    }
    if (method === 'PUT' && path === 'tablets/reorder') {
      const ids = Array.isArray(b.orderedIds) ? (b.orderedIds as string[]) : [];
      if (new Set(ids).size !== ids.length) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Danh sách bài vị có phần tử trùng nhau.');
      const rows = ids.map((id) => tablets.find((t) => t.id === id));
      if (rows.some((r) => !r)) throw new DemoFailure(404, 'NOT_FOUND', 'Có bài vị không thuộc phòng thờ của dòng họ này.');
      rows.forEach((row, index) => { row!.displayOrder = index; });
      return ok('Đã sắp xếp lại bài vị.');
    }
    if (a0 === 'tablets' && a1 && !a2) {
      const tablet = findTablet(a1);
      if (method === 'PATCH') {
        if ('note' in b) tablet.note = typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null;
        if (typeof b.isVisible === 'boolean') tablet.isVisible = b.isVisible;
        if (typeof b.displayOrder === 'number') tablet.displayOrder = b.displayOrder;
        if (typeof b.tierId === 'string' && b.tierId !== tablet.tierId) {
          findTier(b.tierId);
          tablet.tierId = b.tierId;
          if (typeof b.displayOrder !== 'number') tablet.displayOrder = nextOrder(b.tierId);
        }
        return { status: 200, data: { ...tablet } };
      }
      if (method === 'DELETE') {
        tablets = tablets.filter((t) => t.id !== tablet.id);
        removedPersons.add(tablet.personId); // BE ghi dấu "đã gỡ"
        if (!candidates.some((c) => c.personId === tablet.personId)) {
          candidates.unshift({ personId: tablet.personId, fullName: tablet.fullName, generation: tablet.generation, birthYear: tablet.birthYear, deathYear: tablet.deathYear, hasPortrait: !!tablet.portraitUrl });
        }
        return ok('Đã xóa bài vị.');
      }
    }
    if (a0 === 'tablets' && a1 && a2 === 'portrait') {
      const tablet = findTablet(a1);
      if (method === 'POST') {
        const blob = checkImage(fileOf(body));
        const url = URL.createObjectURL(blob);
        tablet.portraitUrl = url;
        tablet.thumbnailUrl = url;
        return { status: 200, data: { portraitUrl: url } };
      }
      if (method === 'DELETE') {
        tablet.portraitUrl = null;
        tablet.thumbnailUrl = null;
        return ok('Đã xóa ảnh bài vị.');
      }
    }

    // ---------------- quản lý: tầng ----------------
    if (method === 'POST' && path === 'tiers') {
      if (tiers.length >= MAX_TIERS) throw new DemoFailure(422, 'VALIDATION_ERROR', `Mỗi phòng thờ chỉ có tối đa ${MAX_TIERS} tầng.`);
      const title = String(b.title ?? '').trim();
      if (!title || title.length > 120) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Tên tầng phải từ 1 đến 120 ký tự.');
      const used = new Set(tiers.map((t) => t.tierNo));
      const no = typeof b.tierNo === 'number' ? b.tierNo : [1, 2, 3, 4, 5, 6].find((n) => !used.has(n))!;
      if (no < 1 || no > MAX_TIERS) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Số tầng phải từ 1 đến 6.');
      if (used.has(no)) throw new DemoFailure(409, 'STATE_CONFLICT', `Tầng số ${no} đã tồn tại trong phòng thờ.`);
      const tier: DemoTier = { tierId: nextId('demo-tier'), tierNo: no, title };
      tiers.push(tier);
      return { status: 201, data: brief(tier) };
    }
    if (method === 'PUT' && path === 'tiers/reorder') {
      const ids = Array.isArray(b.orderedIds) ? (b.orderedIds as string[]) : [];
      const all = new Set(tiers.map((t) => t.tierId));
      if (new Set(ids).size !== ids.length || ids.length !== all.size || ids.some((id) => !all.has(id))) {
        throw new DemoFailure(422, 'VALIDATION_ERROR', 'Danh sách tầng phải gồm đủ và không trùng mọi tầng của phòng thờ.');
      }
      ids.forEach((id, index) => { findTier(id).tierNo = index + 1; });
      return { status: 200, data: ids.map((id) => brief(findTier(id))) };
    }
    if (a0 === 'tiers' && a1 && !a2) {
      const tier = findTier(a1);
      if (method === 'PATCH') {
        if (typeof b.title === 'string') {
          const title = b.title.trim();
          if (!title || title.length > 120) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Tên tầng phải từ 1 đến 120 ký tự.');
          tier.title = title;
        }
        if (typeof b.tierNo === 'number' && b.tierNo !== tier.tierNo) {
          if (b.tierNo < 1 || b.tierNo > MAX_TIERS) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Số tầng phải từ 1 đến 6.');
          const other = tiers.find((t) => t.tierNo === b.tierNo);
          if (other) other.tierNo = tier.tierNo; // hoán đổi
          tier.tierNo = b.tierNo;
        }
        return { status: 200, data: brief(tier) };
      }
      if (method === 'DELETE') {
        const total = tabletsOf(tier.tierId).length;
        const moveTo = typeof params.moveToTierId === 'string' ? params.moveToTierId : null;
        if (total > 0) {
          if (!moveTo) throw new DemoFailure(409, 'STATE_CONFLICT', `Tầng này còn ${total} bài vị. Hãy chuyển các bài vị sang tầng khác (moveToTierId) trước khi xóa.`);
          if (moveTo === tier.tierId) throw new DemoFailure(422, 'VALIDATION_ERROR', 'Tầng nhận bài vị phải khác tầng đang xóa.');
          const dest = findTier(moveTo);
          const start = nextOrder(dest.tierId);
          tabletsOf(tier.tierId).forEach((t, i) => { t.tierId = dest.tierId; t.displayOrder = start + i; });
        }
        tiers.splice(tiers.indexOf(tier), 1);
        return ok('Đã xóa tầng bài vị.');
      }
    }

    // ---------------- quản lý: lời viếng ----------------
    if (a0 === 'blessings' && a1) {
      const item = blessings.find((x) => x.id === a1);
      if (!item) throw new DemoFailure(404, 'NOT_FOUND', 'Không tìm thấy Lời viếng.');
      if (method === 'PATCH' && a2 === 'hide') { item.hidden = true; return ok('Đã ẩn Lời viếng.'); }
      if (method === 'DELETE' && !a2) { item.hidden = true; item.content = null; return ok('Đã xóa Lời viếng.'); }
    }

    throw new DemoFailure(404, 'NOT_FOUND', 'Không tìm thấy đường dẫn (chế độ minh họa).');
  }

  const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  /** Lỗi cố ý (?demoFail=...) chỉ áp cho thao tác QUẢN LÝ (ghi), không áp cho thắp hương / lời viếng của thành viên. */
  const isManagement = (req: DemoRequest) => WRITE.has(req.method) && req.path !== 'incense' && req.path !== 'blessing';

  return {
    /** Nhận một yêu cầu, trả về kết quả hoặc ném DemoFailure. */
    handle(req: DemoRequest): DemoReply {
      const method = req.method.toUpperCase();
      const request = { ...req, method };
      if (failWith && isManagement(request)) {
        if (failWith === 'network') throw new DemoFailure(0, 'NETWORK', 'Mất kết nối (giả lập).');
        const status = Number(failWith);
        const known: Record<number, [string, string]> = {
          401: ['SESSION_INVALID', 'Phiên đăng nhập không hợp lệ.'],
          403: ['FORBIDDEN', 'Chỉ Trưởng tộc hoặc Quản trị hệ thống mới được quản lý phòng thờ.'],
          409: ['STATE_CONFLICT', 'Dữ liệu đã thay đổi, thao tác bị xung đột (giả lập).'],
          422: ['VALIDATION_ERROR', 'Dữ liệu không hợp lệ (giả lập).'],
          500: ['INTERNAL_ERROR', 'Internal error.'],
        };
        const [code, message] = known[status] || ['INTERNAL_ERROR', 'Internal error.'];
        throw new DemoFailure(status, code, message);
      }
      return route(request);
    },
  };
}

export type DemoBackend = ReturnType<typeof createDemoBackend>;

const WORSHIP_URL = /^\/?families\/[^/]+\/worship\/(.*)$/;

function parseBody(data: unknown): unknown {
  if (typeof data === 'string' && data) {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

/** Adapter axios: trả lời /worship/* bằng backend giả; URL khác chuyển cho `fallback` (adapter gốc). */
export function createDemoAdapter(backend: DemoBackend, fallback: AxiosAdapter, latencyMs = 140): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    const url = String(config.url ?? '').split('?')[0];
    const match = WORSHIP_URL.exec(url);
    if (!match) return fallback(config);

    await new Promise((resolve) => setTimeout(resolve, latencyMs));
    const response = (status: number, data: unknown) => ({ data, status, statusText: String(status), headers: {}, config, request: {} });
    try {
      const reply = backend.handle({
        method: String(config.method ?? 'get'),
        path: match[1].replace(/\/$/, ''),
        params: (config.params as Record<string, unknown>) ?? {},
        body: parseBody(config.data),
      });
      return response(reply.status, reply.data);
    } catch (err) {
      if (err instanceof DemoFailure) {
        if (err.status === 0) throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
        const res = response(err.status, { error: { code: err.code, message: err.message, request_id: 'demo' } });
        throw new AxiosError(err.message, 'ERR_BAD_REQUEST', config, {}, res);
      }
      throw err;
    }
  };
}

/** Gắn backend giả vào `client`; trả về hàm khôi phục adapter gốc (gọi khi rời trang demo). */
export function installWorshipDemo(client: AxiosInstance, seed: HallResponse, failWith?: string | null): () => void {
  const original = client.defaults.adapter;
  const fallback = axios.getAdapter(original ?? ['xhr', 'http', 'fetch']);
  client.defaults.adapter = createDemoAdapter(createDemoBackend(seed, { failWith }), fallback);
  return () => {
    client.defaults.adapter = original;
  };
}
