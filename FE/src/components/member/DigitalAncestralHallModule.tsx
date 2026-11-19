import React, { useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../../api/axios';
import { useClanContext } from '../../context/ClanContext';
import {
  fetchBlessings,
  fetchMyStreaks,
  fetchTierTablets,
  fetchWorshipHall,
  fetchWorshipImageObjectUrl,
  formatVietnamDateTime,
  lightIncense,
  releaseWorshipImages,
  toWorshipError,
  writeBlessing,
  type BlessingItem,
  type HallResponse,
  type MeInfo,
  type StreakInfo,
  type TabletItem,
  type WorshipApiError,
} from '../../services/worshipHall.service';
import { ANCESTRAL_MEDIA, type AncestorRecord } from './ancestralExperience.data';
import type { Hall3DAncestor, Hall3DTier } from './AncestralHall3D';
import { Hall3DUnavailable } from './hall3d/Hall3DUnavailable';
import { solarToLunar, vietnamToday } from './hall3d/lunarCalendar';
import { ManageEntryButton, ManagePanelHost } from './worshipManage/WorshipManageEntry';
import './DigitalAncestralHallModule.css';

// Three.js chỉ được tải khi người dùng vào chế độ Phòng thờ 3D (không nằm trong bundle chính).
const AncestralHall3D = React.lazy(() => import('./AncestralHall3D'));

// Kiểm tra nhanh WebGL, cố ý không import tĩnh từ AncestralHall3D để không kéo three vào bundle chính.
const detectWebGL = (): boolean => {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (!(window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext) return false;
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
};

// Danh sách rỗng ổn định cho cảnh 3D khi chưa có bài vị.
const NO_TIERS: Hall3DTier[] = [];
const EMPTY_HALL_HINT = 'Bàn thờ đang chờ bài vị tiền nhân';

const TIER_PAGE_SIZE = 9; // số khung ảnh thờ tối đa hiển thị cùng lúc trong một tầng
const MAX_TIERS = 6;
const BLESSING_PAGE_SIZE = 20;
const BLESSING_MAX_LENGTH = 300; // khớp BE (MAX_BLESSING_LENGTH)
const DEMO_CLAN_ID = 'demo-clan'; // chỉ dùng ở chế độ minh họa (dev): adapter axios giả trả lời tại chỗ

// Bài vị hiển thị trong phòng thờ (dữ liệu từ API phòng thờ).
interface HallAncestor extends AncestorRecord {
  portraitUrl: string | null;
  thumbnailUrl: string | null;
  birthDate: string | null;
  deathDate: string | null;
  note: string;
}

// Một tầng bàn thờ + các trang bài vị đã tải (trang 1 lấy từ GET /hall, các trang sau từ API phân trang).
interface TierState {
  tierId: string;
  tierNo: number;
  title: string;
  total: number;
  page: number;
  pages: Record<number, TabletItem[]>;
  loading: boolean;
}

/** "1941-03-12" -> "12/03/1941"; chỉ có năm thì trả năm; không rõ thì trả chuỗi rỗng. */
const formatVnDate = (raw?: string | null): string => {
  if (!raw) return '';
  const text = String(raw).trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  const year = text.match(/^(\d{4})$/);
  return year ? year[1] : '';
};

const makeInitials = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'TV';
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
};

/** Thời điểm 00:00 ngày kế tiếp theo giờ Việt Nam (UTC+7, không có giờ mùa hè). Chỉ dùng khi BE chưa báo next_offer_at. */
const nextVietnamMidnightIso = (now: number = Date.now()): string => {
  const OFFSET = 7 * 3600 * 1000;
  const DAY = 24 * 3600 * 1000;
  const localDay = Math.floor((now + OFFSET) / DAY);
  return new Date((localDay + 1) * DAY - OFFSET).toISOString();
};

const pageCountOf = (total: number): number => Math.max(1, Math.ceil(total / TIER_PAGE_SIZE));

const isApiRelativePath = (url: string): boolean => url.startsWith('/') && !url.startsWith('//');

const EMPTY_STREAK: StreakInfo = { current: 0, longest: 0, total: 0, lastDate: null };
const EMPTY_ME: MeInfo = {
  incenseDoneToday: false,
  blessingDoneToday: false,
  incenseStreak: EMPTY_STREAK,
  blessingStreak: EMPTY_STREAK,
};

const toTierStates = (res: HallResponse): TierState[] =>
  [...res.tiers]
    .sort((a, b) => a.tierNo - b.tierNo)
    .slice(0, MAX_TIERS)
    .map((tier) => ({
      tierId: tier.tierId,
      tierNo: tier.tierNo,
      title: tier.title,
      total: tier.total,
      page: 1,
      pages: { 1: tier.tablets.slice(0, TIER_PAGE_SIZE) },
      loading: false,
    }));

// CHỈ dùng cho chế độ minh họa khi chạy dev (?demo=1). Các hàm này chỉ được gọi trong nhánh import.meta.env.DEV
// nên bị loại hoàn toàn khỏi bản build production. Dữ liệu này nạp vào backend giả (worshipManage/worshipDemo.ts):
// KHÔNG có request mạng nào tới Backend.
const buildDemoPortrait = (initials: string, hue: number): string => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const bg = ctx.createLinearGradient(0, 0, 0, 400);
    bg.addColorStop(0, `hsl(${hue}, 28%, 72%)`);
    bg.addColorStop(1, `hsl(${hue}, 30%, 42%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 300, 400);
    ctx.fillStyle = `hsl(${hue}, 25%, 22%)`;
    ctx.beginPath();
    ctx.moveTo(18, 400);
    ctx.bezierCurveTo(22, 292, 88, 262, 150, 258);
    ctx.bezierCurveTo(212, 262, 278, 292, 282, 400);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(128, 210, 44, 56);
    ctx.fillStyle = `hsl(${hue}, 30%, 60%)`;
    ctx.beginPath();
    ctx.ellipse(150, 158, 56, 68, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,10,5,0.55)';
    ctx.font = '700 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 150, 162);
    ctx.fillStyle = 'rgba(20,10,5,0.7)';
    ctx.fillRect(0, 352, 300, 48);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = '700 24px Georgia, serif';
    ctx.fillText('ẢNH MẪU', 150, 377);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
};

// CHỈ cho chế độ minh họa: một ngày dương lịch trong quá khứ có cùng NGÀY-THÁNG ÂM LỊCH với hôm nay (giờ Việt Nam),
// để bài vị demo có ngày giỗ đúng hôm nay và hiện hiệu ứng nến + dải hoa. Không tìm được thì trả null.
const demoMemorialDeathDate = (): string | null => {
  try {
    const today = vietnamToday();
    const target = solarToLunar(today.d, today.m, today.y);
    for (let offset = 0; offset < 400; offset += 1) {
      const t = new Date(Date.UTC(today.y - 3, 0, 1 + offset));
      const lunar = solarToLunar(t.getUTCDate(), t.getUTCMonth() + 1, t.getUTCFullYear());
      if (lunar.month === target.month && lunar.day === target.day && !lunar.leap) {
        return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
      }
    }
  } catch {
    /* bỏ qua: demo vẫn chạy, chỉ không có ngày giỗ */
  }
  return null;
};

const buildDemoHall = (): HallResponse => {
  const make = (
    id: string, name: string, initials: string, generation: number, tierId: string,
    birthDate: string | null, deathDate: string | null, withPortrait: boolean, order: number
  ): TabletItem => ({
    id,
    personId: id,
    fullName: name,
    generation,
    birthYear: birthDate ? Number(birthDate.slice(0, 4)) : null,
    deathYear: deathDate ? Number(deathDate.slice(0, 4)) : null,
    birthDate,
    deathDate,
    portraitUrl: withPortrait ? buildDemoPortrait(initials, 20 + generation * 35) || null : null,
    thumbnailUrl: null,
    note: 'Dữ liệu minh họa, không phải hồ sơ thật.',
    displayOrder: order,
    tierId,
    isVisible: true,
  });
  // Cố ý có đủ trường hợp: có ảnh mẫu / không ảnh; ngày mất đủ ngày / chỉ có năm / không có.
  const tiers = [
    {
      tierId: 'demo-tier-1', tierNo: 1, title: 'Thủy tổ / Đời 1', total: 2,
      tablets: [
        make('demo-1', 'Cụ Dương Văn Tổ', 'DT', 1, 'demo-tier-1', '1868-02-10', '1941-03-12', true, 0),
        make('demo-2', 'Cụ bà Nguyễn Thị Cả', 'NC', 1, 'demo-tier-1', '1872-06-01', '1950-08-05', true, 1),
      ],
    },
    {
      tierId: 'demo-tier-2', tierNo: 2, title: 'Đời 2', total: 2,
      tablets: [
        make('demo-3', 'Dương Văn Hòa', 'DH', 2, 'demo-tier-2', '1895-01-20', '1968', false, 0),
        make('demo-4', 'Đỗ Thị Ngọc', 'ĐN', 2, 'demo-tier-2', '1900-09-09', '1975-01-02', true, 1),
      ],
    },
    {
      tierId: 'demo-tier-3', tierNo: 3, title: 'Đời 3', total: 2,
      tablets: [
        make('demo-5', 'Dương Anh Tuấn', 'DT', 3, 'demo-tier-3', '1925-04-30', null, false, 0),
        make('demo-6', 'Lê Thị Mai', 'LM', 3, 'demo-tier-3', '1930-12-25', demoMemorialDeathDate() ?? '2004-11-09', true, 1),
      ],
    },
  ];
  return {
    hall: {
      id: 'demo-hall', title: 'Dòng họ minh họa', clanName: 'Dòng họ minh họa',
      visibility: 'PUBLIC', blessingsEnabled: true, coverImageUrl: null, portraitGrayscale: false,
    },
    tiers,
    today: { incenseCount: 0, blessingCount: 0 },
    me: EMPTY_ME,
    canManage: true, // demo: để thử màn hình Quản lý bàn thờ
  };
};

/* ------------------------------------------------------------------ */
/* Thắp hương cho CẢ BÀN THỜ                                           */
/* ------------------------------------------------------------------ */

// idle -> requesting (chờ API thắp hương) -> animating (cảnh 3D chạy ~2,5s) -> idle
type OfferingPhase = 'idle' | 'requesting' | 'animating';

const OFFERING_MS = 2500;
const OFFERING_REDUCED_MS = 900;
const STICKS_PER_OFFERING = 3; // mỗi lượt thắp cắm 3 nén; lư hiển thị tối đa 9 nén
const MAX_STICKS = 9;

type LockKind = 'login' | 'member' | null;

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const mediaIcon = (type: string) => {
  if (type === 'Ảnh 360°') return '360°';
  if (type === 'Video') return '▶';
  if (type === 'Âm thanh') return '♪';
  if (type === 'Tài liệu') return '▤';
  return '▧';
};

const PortraitPlaceholder: React.FC<{ ancestor: AncestorRecord; compact?: boolean }> = ({ ancestor, compact = false }) => (
  <div
    className={`ancestor-portrait ancestor-portrait-${ancestor.portraitTone} ${compact ? 'ancestor-portrait-compact' : ''}`}
    role="img"
    aria-label={`Ảnh chân dung lưu trữ của ${ancestor.name}`}
  >
    <div className="ancestor-portrait-halo" aria-hidden="true" />
    <div className="ancestor-portrait-silhouette" aria-hidden="true">
      <span className="ancestor-portrait-head" />
      <span className="ancestor-portrait-shoulders" />
    </div>
    <span className="ancestor-portrait-initials">{ancestor.initials}</span>
    {!compact && <small>Ảnh chân dung lưu trữ</small>}
  </div>
);

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: WorshipApiError };

const loadErrorMessage = (error: WorshipApiError): string => {
  if (error.kind === 'UNAUTHENTICATED') return 'Đăng nhập để vào phòng thờ của dòng họ.';
  if (error.kind === 'FORBIDDEN') return 'Phòng thờ này chỉ dành cho thành viên của dòng họ.';
  if (error.kind === 'NOT_FOUND') return 'Không tìm thấy phòng thờ của dòng họ này.';
  if (error.kind === 'NETWORK') return error.message;
  return 'Chưa tải được phòng thờ. Vui lòng thử lại.';
};

export const DigitalAncestralHallModule: React.FC = () => {
  const { activeClanId, activeClanName } = useClanContext();
  // Chế độ minh họa: chỉ tồn tại khi chạy dev; ở production điều kiện này luôn là false.
  const [isDemo] = useState<boolean>(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === '1'
  );
  // Dòng họ dùng để gọi API: ở chế độ minh họa là dòng họ giả (adapter axios trả lời tại chỗ, không có request mạng).
  const clanId = import.meta.env.DEV && isDemo ? DEMO_CLAN_ID : activeClanId;
  const demoRestoreRef = useRef<(() => void) | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  // Ảnh gốc (portraitUrl) chỉ được tải khi người dùng phóng to một ảnh; cảnh 3D dùng bản nhỏ (thumbnailUrl).
  const [fullPortraits, setFullPortraits] = useState<Record<string, string>>({});
  const fullRequested = useRef<Set<string>>(new Set());

  // ----- dữ liệu phòng thờ từ API -----
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [hall, setHall] = useState<HallResponse | null>(null);
  const [tiersState, setTiersState] = useState<TierState[]>([]);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [todayIncense, setTodayIncense] = useState(0);
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const portraitRequested = useRef<Set<string>>(new Set());
  // Mỗi lần nạp lại phòng thờ (đổi dòng họ, thử lại) tăng 1 để bỏ kết quả của lần nạp cũ.
  const loadSeq = useRef(0);

  // ----- lời viếng -----
  const [blessings, setBlessings] = useState<BlessingItem[]>([]);
  const [blessingsNext, setBlessingsNext] = useState<string | null>(null);
  const [blessingsStatus, setBlessingsStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  // ----- thắp hương / lời viếng -----
  const [lockKind, setLockKind] = useState<LockKind>(null);
  const [nextIncenseAt, setNextIncenseAt] = useState<string | null>(null);
  const [nextBlessingAt, setNextBlessingAt] = useState<string | null>(null);
  const [offeringPhase, setOfferingPhase] = useState<OfferingPhase>('idle');
  const [offeringToken, setOfferingToken] = useState(0);
  const isOffering = offeringPhase !== 'idle';

  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageContent, setMessageContent] = useState('');
  const [messageError, setMessageError] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; warn: boolean } | null>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);

  // Phòng thờ 3D là chế độ duy nhất. Không có WebGL hoặc cảnh 3D lỗi thì chỉ hiện thông báo + danh sách chữ.
  const [webglOk] = useState<boolean>(detectWebGL);
  const [hall3DFailed, setHall3DFailed] = useState(false);
  const show3D = webglOk && !hall3DFailed;

  const offeringTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (offeringTimerRef.current !== null) window.clearTimeout(offeringTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Giải phóng ảnh bài vị (blob URL) khi đổi dòng họ hoặc rời trang.
  useEffect(
    () => () => {
      releaseWorshipImages();
    },
    [activeClanId]
  );

  // Rời trang: trả adapter axios về như cũ (chế độ minh họa).
  useEffect(
    () => () => {
      demoRestoreRef.current?.();
      demoRestoreRef.current = null;
    },
    []
  );

  const showToast = (text: string, warn = false) => {
    setToast({ text, warn });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), warn ? 5200 : 3200);
  };

  const loadBlessings = async (clanId: string, seq: number, before: string | null) => {
    setBlessingsStatus('loading');
    try {
      const res = await fetchBlessings(clanId, { limit: BLESSING_PAGE_SIZE, before });
      if (seq !== loadSeq.current) return;
      setBlessings((current) => (before ? [...current, ...res.items] : res.items));
      setBlessingsNext(res.nextBefore);
      setBlessingsStatus('idle');
    } catch {
      if (seq !== loadSeq.current) return;
      setBlessingsStatus('error');
    }
  };

  // Nạp phòng thờ: demo (dữ liệu giả, không gọi API) hoặc GET /families/{clanId}/worship/hall.
  useEffect(() => {
    loadSeq.current += 1;
    const seq = loadSeq.current;
    setHall(null);
    setTiersState([]);
    setMe(null);
    setTodayIncense(0);
    setPortraits({});
    portraitRequested.current = new Set();
    setFullPortraits({});
    fullRequested.current = new Set();
    setBlessings([]);
    setBlessingsNext(null);
    setBlessingsStatus('idle');
    setLockKind(null);
    setNextIncenseAt(null);
    setNextBlessingAt(null);
    setSelectedId(null);

    const apply = (res: HallResponse) => {
      setHall(res);
      setTiersState(toTierStates(res));
      setMe(res.me);
      setTodayIncense(res.today.incenseCount);
      setLoad({ status: 'ready' });
    };

    if (!clanId) {
      setLoad({ status: 'ready' });
      return undefined;
    }
    setLoad({ status: 'loading' });
    const fetchAndApply = () =>
      fetchWorshipHall(clanId)
        .then((res) => {
          if (seq !== loadSeq.current) return;
          apply(res);
          void loadBlessings(clanId, seq, null);
        })
        .catch((err) => {
          if (seq !== loadSeq.current) return;
          setLoad({ status: 'error', error: toWorshipError(err) });
        });
    if (import.meta.env.DEV && isDemo) {
      // Chế độ minh họa (chỉ dev): nạp backend giả trong bộ nhớ rồi đi đúng luồng gọi API như thật.
      void import('./worshipManage/worshipDemo').then(({ installWorshipDemo }) => {
        if (seq !== loadSeq.current) return;
        if (!demoRestoreRef.current) {
          const failWith = new URLSearchParams(window.location.search).get('demoFail');
          demoRestoreRef.current = installWorshipDemo(apiClient, buildDemoHall(), failWith);
        }
        void fetchAndApply();
      });
    } else {
      void fetchAndApply();
    }
    return () => {
      // Bỏ kết quả của lần nạp này nếu đổi dòng họ / thử lại / rời trang.
      loadSeq.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clanId, isDemo, reloadKey]);

  const canManage = !!hall?.canManage;

  // Sau mỗi thao tác quản lý thành công: tải lại GET hall (không đưa trang về trạng thái "đang tải") để cảnh 3D,
  // thẻ thông tin và lời viếng cập nhật ngay. Panel dùng kết quả trả về để tải lại danh sách của nó.
  const refreshHall = async (): Promise<HallResponse> => {
    if (!clanId) throw new Error('Chưa chọn dòng họ');
    const res = await fetchWorshipHall(clanId);
    if (mountedRef.current) {
      setHall(res);
      setTiersState(toTierStates(res));
      setMe(res.me);
      setTodayIncense(res.today.incenseCount);
      void loadBlessings(clanId, loadSeq.current, null);
    }
    return res;
  };

  // Ảnh thờ đen trắng do cảnh 3D tự xử lý trong shader (không xử lý lại ảnh ở trang).
  const grayscale = !!hall?.hall.portraitGrayscale;
  // Đường dẫn ảnh của cảnh 3D: bản nhỏ; ảnh cũ chưa có bản nhỏ thì BE trả thumbnailUrl = portraitUrl (hoặc thiếu: dùng portraitUrl).
  const thumbPath = (tablet: TabletItem): string => (tablet.thumbnailUrl || tablet.portraitUrl || '').trim();
  const fullPath = (tablet: TabletItem): string => (tablet.portraitUrl || tablet.thumbnailUrl || '').trim();
  // URL dùng được ngay (đường dẫn BE cần token thì lấy blob URL đã tải về).
  const resolvedThumb = (tablet: TabletItem): string | null => {
    const raw = thumbPath(tablet);
    if (!raw) return null;
    return isApiRelativePath(raw) ? portraits[tablet.id] || null : raw;
  };
  const resolvedFull = (tablet: TabletItem): string | null => {
    const raw = fullPath(tablet);
    if (!raw) return null;
    return isApiRelativePath(raw) ? fullPortraits[tablet.id] || null : raw;
  };

  const clanLabel = hall?.hall.title || hall?.hall.clanName || activeClanName || 'Dòng Họ';
  const clanShortName = hall?.hall.clanName || activeClanName || '';

  const toHallAncestor = (tablet: TabletItem, tier: TierState): HallAncestor => {
    const gen = tablet.generation ?? tier.tierNo ?? 1;
    const birthYear = tablet.birthYear ? String(tablet.birthYear) : tablet.birthDate ? tablet.birthDate.slice(0, 4) : '—';
    const deathYear = tablet.deathYear ? String(tablet.deathYear) : tablet.deathDate ? tablet.deathDate.slice(0, 4) : '—';
    const deathText = formatVnDate(tablet.deathDate);
    const thumbnailUrl = resolvedThumb(tablet);
    // Ảnh gốc chỉ có khi đã phóng to (fullPortraits) hoặc là URL dùng thẳng được; chưa có thì cảnh 3D chỉ dùng bản nhỏ.
    const portraitUrl = resolvedFull(tablet);
    return {
      id: tablet.id,
      name: tablet.fullName,
      initials: makeInitials(tablet.fullName),
      title: gen === 1 ? 'Cụ Khởi Tổ' : `Tiền nhân đời thứ ${gen}`,
      generation: gen,
      branch: tier.title,
      relationship: gen === 1 ? 'Thủy tổ dòng họ' : `Tiền nhân đời thứ ${gen}`,
      birthYear,
      deathYear,
      lifespan: birthYear !== '—' && deathYear !== '—' ? `Sinh ${birthYear} · Mất ${deathYear}` : 'Đã khuất',
      memorialDate: deathText ? `Ngày ${deathText}` : 'Chưa cập nhật ngày giỗ',
      memorialPlace: `Từ đường ${clanShortName || 'dòng tộc'}`,
      restingPlace: '',
      biography: tablet.note || '',
      legacy: 'Đức trọng lưu quang · Gia phong trường tồn',
      portraitTone: (['indigo', 'teal', 'amber', 'rose'] as const)[gen % 4],
      incenseCount: 0,
      portraitUrl,
      thumbnailUrl,
      birthDate: tablet.birthDate,
      deathDate: tablet.deathDate,
      note: tablet.note || '',
    };
  };

  // Từng tầng với các bài vị của trang đang xem.
  const tierViews = tiersState.map((tier) => ({
    tier,
    items: (tier.pages[tier.page] || []).map((tablet) => toHallAncestor(tablet, tier)),
  }));
  // Danh sách phẳng các bài vị đang hiển thị (trên xuống dưới, trái sang phải) cho thẻ thông tin, danh sách chọn và danh sách chữ khi không có 3D.
  const ancestors = tierViews.flatMap((view) => view.items);

  // Ảnh bài vị: đường dẫn tương đối của BE cần token nên tải bằng apiClient rồi dùng blob URL.
  const wantedPortraits = tiersState
    .flatMap((tier) => tier.pages[tier.page] || [])
    .filter((tablet) => thumbPath(tablet) && isApiRelativePath(thumbPath(tablet)))
    .map((tablet) => `${tablet.id}|${thumbPath(tablet)}`)
    .join(',');
  useEffect(() => {
    if (!wantedPortraits) return;
    const seq = loadSeq.current;
    wantedPortraits.split(',').forEach((entry) => {
      const sep = entry.indexOf('|');
      const id = entry.slice(0, sep);
      const path = entry.slice(sep + 1);
      if (portraitRequested.current.has(entry)) return;
      portraitRequested.current.add(entry);
      fetchWorshipImageObjectUrl(path)
        .then((url) => {
          if (seq !== loadSeq.current) return;
          setPortraits((current) => ({ ...current, [id]: url }));
        })
        .catch(() => {
          /* tải ảnh lỗi: giữ ảnh mặc định */
        });
    });
  }, [wantedPortraits]);

  // Phóng to một ảnh trong cảnh 3D: lúc này mới tải ảnh gốc (đường dẫn BE cần token nên tải bằng apiClient rồi dùng blob URL).
  const handleZoomChange = (id: string | null) => {
    if (!id) return;
    const tablet = tiersState.flatMap((tier) => tier.pages[tier.page] || []).find((item) => item.id === id);
    if (!tablet) return;
    const path = fullPath(tablet);
    if (!path || !isApiRelativePath(path) || path === thumbPath(tablet)) {
      // Ảnh gốc trùng bản nhỏ (ảnh cũ chưa có bản nhỏ) hoặc URL dùng thẳng được: không cần tải thêm.
      return;
    }
    const key = `${id}|${path}`;
    if (fullRequested.current.has(key)) return;
    fullRequested.current.add(key);
    const seq = loadSeq.current;
    fetchWorshipImageObjectUrl(path)
      .then((url) => {
        if (seq !== loadSeq.current) return;
        setFullPortraits((current) => ({ ...current, [id]: url }));
      })
      .catch(() => {
        fullRequested.current.delete(key); // lần phóng to sau thử lại; giữ bản nhỏ
      });
  };

  const tiers3D = useMemo<Hall3DTier[]>(
    () =>
      tierViews.map(({ tier, items }) => ({
        id: tier.tierId,
        label: `Đời ${tier.tierNo}`,
        tablets: items.map<Hall3DAncestor>((a) => ({
          id: a.id,
          name: a.name,
          generation: a.generation,
          lifespan: a.lifespan,
          portraitUrl: a.portraitUrl,
          thumbnailUrl: a.thumbnailUrl,
          deathDate: a.deathDate,
          birthDate: a.birthDate,
          note: a.note,
        })),
        page: tier.page,
        pageCount: pageCountOf(tier.total),
        pageLoading: tier.loading,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiersState, portraits, fullPortraits, clanShortName]
  );

  const selectedIndex = Math.max(0, ancestors.findIndex((a) => a.id === selectedId));
  const selectedAncestor = ancestors[selectedIndex] || null;
  const selectedMedia = useMemo(
    () => (selectedAncestor ? ANCESTRAL_MEDIA.filter((item) => item.ancestorId === selectedAncestor.id) : []),
    [selectedAncestor]
  );

  const selectAncestor = (index: number) => {
    if (ancestors.length === 0) return;
    const normalizedIndex = (index + ancestors.length) % ancestors.length;
    setSelectedId(ancestors[normalizedIndex].id);
  };

  const patchTier = (tierId: string, patch: Partial<TierState>) =>
    setTiersState((current) => current.map((tier) => (tier.tierId === tierId ? { ...tier, ...patch } : tier)));

  // Chuyển trang trong một tầng: trang đã tải thì đổi ngay, chưa có thì gọi API phân trang.
  const goTierPage = async (tierId: string, page: number) => {
    const tier = tiersState.find((t) => t.tierId === tierId);
    if (!tier || tier.loading) return;
    const target = Math.min(Math.max(page, 1), pageCountOf(tier.total));
    if (target === tier.page) return;
    if (tier.pages[target]) {
      patchTier(tierId, { page: target });
      return;
    }
    if (!clanId) return;
    const seq = loadSeq.current;
    patchTier(tierId, { loading: true });
    try {
      const res = await fetchTierTablets(clanId, tierId, (target - 1) * TIER_PAGE_SIZE, TIER_PAGE_SIZE);
      if (seq !== loadSeq.current) return;
      setTiersState((current) =>
        current.map((t) =>
          t.tierId === tierId
            ? {
                ...t,
                loading: false,
                total: res.total,
                pages: { ...t.pages, [target]: res.tablets },
                page: Math.min(target, pageCountOf(res.total)),
              }
            : t
        )
      );
    } catch (err) {
      if (seq !== loadSeq.current) return;
      patchTier(tierId, { loading: false });
      showToast(toWorshipError(err).message, true);
    }
  };

  /* ---------------------------- thắp hương ---------------------------- */

  const blessingsEnabled = hall ? hall.hall.blessingsEnabled : true;
  const lockNote =
    !me || lockKind === 'login'
      ? 'Đăng nhập để thắp hương'
      : lockKind === 'member'
        ? 'Chỉ thành viên dòng họ'
        : '';
  const locked = lockNote !== '';

  const applyOfferError = (err: WorshipApiError, kind: 'incense' | 'blessing') => {
    const what = kind === 'incense' ? 'thắp hương' : 'viết lời viếng';
    if (err.kind === 'ALREADY_OFFERED') {
      const next = err.nextOfferAt || nextVietnamMidnightIso();
      if (kind === 'incense') {
        setNextIncenseAt(next);
        setMe((current) => ({ ...(current ?? EMPTY_ME), incenseDoneToday: true }));
      } else {
        setNextBlessingAt(next);
        setMe((current) => ({ ...(current ?? EMPTY_ME), blessingDoneToday: true }));
      }
      const when = formatVietnamDateTime(next);
      showToast(
        `Hôm nay bạn đã ${what}.${when ? ` Bạn có thể ${what} lại từ ${when} (giờ Việt Nam).` : ''}`,
        true
      );
      // Đồng bộ chuỗi ngày với BE (không chặn luồng chính).
      if (clanId) {
        const seq = loadSeq.current;
        fetchMyStreaks(clanId)
          .then((streaks) => {
            if (seq !== loadSeq.current) return;
            setMe((current) => ({ ...(current ?? EMPTY_ME), ...streaks }));
          })
          .catch(() => undefined);
      }
    } else if (err.kind === 'UNAUTHENTICATED') {
      setLockKind('login');
      showToast('Đăng nhập để thắp hương', true);
    } else if (err.kind === 'FORBIDDEN') {
      setLockKind('member');
      showToast('Chỉ thành viên dòng họ', true);
    } else {
      showToast(err.message, true);
    }
  };

  // Thắp hương cho cả bàn thờ. Animation chỉ chạy khi API báo thành công; trong lúc chạy nút bị khóa.
  const startOffering = async () => {
    if (offeringPhase !== 'idle' || locked) return;
    // Đã thắp hôm nay và đã biết giờ được thắp lại: báo luôn, không gọi API thừa.
    if (me?.incenseDoneToday && nextIncenseAt) {
      const when = formatVietnamDateTime(nextIncenseAt);
      showToast(`Hôm nay bạn đã thắp hương.${when ? ` Bạn có thể thắp lại từ ${when} (giờ Việt Nam).` : ''}`, true);
      return;
    }
    const seq = loadSeq.current;
    setOfferingPhase('requesting');
    let newCount: number | null = null;
    try {
      if (clanId) {
        const res = await lightIncense(clanId);
        if (seq !== loadSeq.current || !mountedRef.current) return;
        newCount = res.todayCount;
        setMe((current) => ({ ...(current ?? EMPTY_ME), incenseDoneToday: true, incenseStreak: res.streak }));
        setNextIncenseAt(nextVietnamMidnightIso());
      }
    } catch (err) {
      if (seq !== loadSeq.current || !mountedRef.current) return;
      applyOfferError(toWorshipError(err), 'incense');
    }
    if (!mountedRef.current) return;
    if (newCount === null) {
      setOfferingPhase('idle');
      return;
    }
    const countAfter = newCount;
    setOfferingPhase('animating');
    setOfferingToken((token) => token + 1);
    if (offeringTimerRef.current !== null) window.clearTimeout(offeringTimerRef.current);
    offeringTimerRef.current = window.setTimeout(() => {
      offeringTimerRef.current = null;
      if (seq === loadSeq.current) setTodayIncense(countAfter);
      setOfferingPhase('idle');
      showToast('Đã thắp hương');
    }, prefersReducedMotion() ? OFFERING_REDUCED_MS : OFFERING_MS);
  };

  /* ---------------------------- lời viếng ---------------------------- */

  const openCreateMessage = () => {
    if (locked) {
      showToast(lockKind === 'member' ? lockNote : 'Đăng nhập để viết lời viếng', true);
      return;
    }
    if (!blessingsEnabled) {
      showToast('Phòng thờ đang tạm tắt tính năng lời viếng.', true);
      return;
    }
    if (me?.blessingDoneToday) {
      const when = formatVietnamDateTime(nextBlessingAt || nextVietnamMidnightIso());
      showToast(`Hôm nay bạn đã viết lời viếng.${when ? ` Bạn có thể viết lại từ ${when} (giờ Việt Nam).` : ''}`, true);
      return;
    }
    setMessageContent('');
    setMessageError('');
    setIsMessageModalOpen(true);
  };

  const closeMessageModal = () => {
    if (messageSending) return;
    setIsMessageModalOpen(false);
  };

  const saveMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = messageContent.trim();
    if (!clean || messageSending) return;
    setMessageError('');
    setMessageSending(true);
    const seq = loadSeq.current;
    try {
      if (clanId) {
        const res = await writeBlessing(clanId, clean);
        if (seq !== loadSeq.current || !mountedRef.current) return;
        setMe((current) => ({ ...(current ?? EMPTY_ME), blessingDoneToday: true, blessingStreak: res.streak }));
        setNextBlessingAt(nextVietnamMidnightIso());
        void loadBlessings(clanId, seq, null);
      }
      setIsMessageModalOpen(false);
      setMessageContent('');
      showToast('Lời viếng đã được gửi tới bàn thờ gia tộc.');
    } catch (err) {
      if (seq !== loadSeq.current || !mountedRef.current) return;
      const failure = toWorshipError(err);
      if (failure.kind === 'CONTENT_REJECTED') {
        // Giữ hộp thoại và nội dung để người dùng sửa lại.
        setMessageError(failure.message || 'Nội dung lời viếng chưa phù hợp. Vui lòng chỉnh sửa và thử lại.');
      } else if (failure.kind === 'NETWORK' || failure.kind === 'UNKNOWN' || failure.kind === 'NOT_FOUND') {
        setMessageError(failure.message);
      } else {
        setIsMessageModalOpen(false);
        applyOfferError(failure, 'blessing');
      }
    } finally {
      if (mountedRef.current) setMessageSending(false);
    }
  };

  const openAncestralMedia = () => {
    if (!selectedAncestor) return;
    setIsMediaModalOpen(true);
  };

  /* ---------------------------- giao diện ---------------------------- */

  const hallLoading = (
    <div className="hall3d-loading" role="status"><span className="hall3d-loading-flame" aria-hidden="true" /><span>Đang thắp đèn…</span></div>
  );

  const pageHeader = (
    <header className="ancestral-hall-header">
      <div>
        <span className="ancestral-hall-eyebrow">KHÔNG GIAN TƯỞNG NIỆM GIA TỘC</span>
        <h1 id="ancestral-hall-title">Phòng Thờ Số · {clanLabel}</h1>
        <p>Thành kính tưởng nhớ tiền nhân, gìn giữ ký ức và kết nối lòng tri ân của con cháu.</p>
      </div>
    </header>
  );

  if (load.status === 'loading') {
    return (
      <section className="ancestral-hall-page" aria-labelledby="ancestral-hall-title" aria-busy="true">
        {pageHeader}
        <div className="hall3d-section hall3d-skeleton">{hallLoading}</div>
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section className="ancestral-hall-page" aria-labelledby="ancestral-hall-title">
        {pageHeader}
        <div className="hall-state-card" role="alert">
          <h3>Chưa vào được phòng thờ</h3>
          <p>{loadErrorMessage(load.error)}</p>
          <button type="button" className="ancestral-primary-button" onClick={() => setReloadKey((key) => key + 1)}>
            Thử lại
          </button>
        </div>
      </section>
    );
  }

  const incense3D = Math.min(todayIncense * STICKS_PER_OFFERING, MAX_STICKS);
  const incenseDone = !!me?.incenseDoneToday;
  const incenseStreak = me?.incenseStreak;
  const incenseAgain = incenseDone && nextIncenseAt ? formatVietnamDateTime(nextIncenseAt) : '';

  // Thành viên chỉ có đúng 2 hành động với bàn thờ: Thắp hương và Viết lời viếng.
  const altarActions = (
    <>
      <p className="hall3d-altar-stat" aria-live="polite">
        {isOffering ? 'Đang thắp hương…' : `Hôm nay đã có ${todayIncense} lượt thắp hương dâng lên bàn thờ`}
      </p>
      {incenseStreak && !locked && (
        <p className="hall3d-streak" aria-label="Chuỗi ngày thắp hương">
          Chuỗi ngày thắp hương: <b>{incenseStreak.current}</b> ngày · dài nhất <b>{incenseStreak.longest}</b> ngày
        </p>
      )}
      <div className="digital-altar-actions">
        <button
          type="button"
          className={`light-incense-button ${incenseDone ? 'is-done' : ''}`}
          onClick={startOffering}
          disabled={isOffering || locked}
          title={locked ? lockNote : undefined}
        >
          <span aria-hidden="true">{incenseDone ? '✓' : '✦'}</span>
          {isOffering ? 'Đang thắp hương…' : incenseDone ? 'Hôm nay bạn đã thắp hương' : 'Thắp hương'}
        </button>
        <button
          type="button"
          className="write-memorial-button"
          onClick={openCreateMessage}
          disabled={locked || !blessingsEnabled}
          title={locked ? (lockKind === 'member' ? lockNote : 'Đăng nhập để viết lời viếng') : undefined}
        >
          Viết lời viếng
        </button>
      </div>
      {locked && <p className="hall3d-lock-note" role="status">{lockNote}</p>}
      {!locked && !blessingsEnabled && <p className="hall3d-lock-note" role="status">Phòng thờ đang tạm tắt lời viếng</p>}
      {!locked && incenseAgain && (
        <p className="hall3d-lock-note" role="status">Bạn có thể thắp hương lại từ {incenseAgain} (giờ Việt Nam)</p>
      )}
      {/* Chỉ Trưởng tộc / Quản trị hệ thống (GET hall: canManage = true) mới thấy nút này. */}
      <ManageEntryButton canManage={canManage} onOpen={() => setManageOpen(true)} />
    </>
  );

  const messagesSection = (
    <section className="memorial-messages-section" aria-labelledby="memorial-messages-title">
      <div className="memorial-section-header">
        <div>
          <span>LƯU BÚT GIA TỘC</span>
          <h2 id="memorial-messages-title">Lời Viếng</h2>
          <p>Kính gửi bàn thờ tổ tiên {clanShortName || 'dòng họ'}</p>
        </div>
        <button
          type="button"
          className="ancestral-primary-button"
          onClick={openCreateMessage}
          disabled={locked || !blessingsEnabled}
          title={locked ? lockNote : undefined}
        >
          + Viết lời viếng
        </button>
      </div>

      {blessingsStatus === 'error' && blessings.length === 0 ? (
        <div className="memorial-empty-state" role="alert">
          <h3>Chưa tải được lời viếng</h3>
          <p>Vui lòng kiểm tra kết nối và thử lại.</p>
          <button type="button" onClick={() => clanId && void loadBlessings(clanId, loadSeq.current, null)}>Thử lại</button>
        </div>
      ) : blessings.length === 0 && blessingsStatus === 'loading' ? (
        <div className="memorial-empty-state" role="status"><p>Đang tải lời viếng…</p></div>
      ) : blessings.length === 0 ? (
        <div className="memorial-empty-state">
          <div aria-hidden="true">✦</div>
          <h3>Chưa có lời viếng</h3>
          <p>Hãy là người đầu tiên lưu lại một lời tri ân trước bàn thờ tổ tiên.</p>
          {!locked && blessingsEnabled && <button type="button" onClick={openCreateMessage}>Viết lời đầu tiên</button>}
        </div>
      ) : (
        <>
          <div className="memorial-message-list">
            {blessings.map((item) => (
              <article key={item.id} className="memorial-message-card">
                <div className="memorial-message-avatar" aria-hidden="true">{makeInitials(item.authorName)}</div>
                <div className="memorial-message-content">
                  <header>
                    <div>
                      <strong>{item.authorName}</strong>
                    </div>
                    <time dateTime={item.createdAt}>{formatVietnamDateTime(item.createdAt)}</time>
                  </header>
                  <p>“{item.content}”</p>
                </div>
              </article>
            ))}
          </div>
          {blessingsNext && (
            <div className="memorial-load-more">
              <button
                type="button"
                disabled={blessingsStatus === 'loading'}
                onClick={() => clanId && void loadBlessings(clanId, loadSeq.current, blessingsNext)}
              >
                {blessingsStatus === 'loading' ? 'Đang tải…' : 'Xem thêm lời viếng'}
              </button>
            </div>
          )}
          {blessingsStatus === 'error' && <p className="memorial-form-error" role="alert">Chưa tải thêm được lời viếng, vui lòng thử lại.</p>}
        </>
      )}
    </section>
  );

  const sharedOverlays = (
    <>
      {toast && (
        <div className={`ancestral-toast ${toast.warn ? 'is-warn' : ''}`} role="status" aria-live="polite">
          <span>{toast.warn ? '!' : '✓'}</span>{toast.text}
        </div>
      )}

      {isMessageModalOpen && (
        <div className="ancestral-modal-backdrop" role="presentation" onMouseDown={closeMessageModal}>
          <div
            className="ancestral-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ancestral-modal-header">
              <div>
                <span>LƯU BÚT GIA TỘC</span>
                <h2 id="message-modal-title">Viết lời viếng</h2>
                <p>Lời viếng được gửi chung tới bàn thờ tổ tiên {clanShortName || 'dòng họ'}. Mỗi người viết một lời mỗi ngày.</p>
              </div>
              <button type="button" onClick={closeMessageModal} aria-label="Đóng hộp thoại">×</button>
            </div>

            <form onSubmit={saveMessage}>
              <label className="ancestral-form-field">
                <span>Nội dung lời viếng <b>*</b></span>
                <textarea
                  autoFocus
                  required
                  rows={6}
                  maxLength={BLESSING_MAX_LENGTH}
                  value={messageContent}
                  onChange={(event) => { setMessageContent(event.target.value); if (messageError) setMessageError(''); }}
                  placeholder="Viết lời tri ân và những điều bạn muốn lưu lại…"
                  disabled={messageSending}
                />
                <small>{messageContent.length}/{BLESSING_MAX_LENGTH} ký tự</small>
              </label>
              {messageError && <p className="memorial-form-error" role="alert">{messageError}</p>}
              <div className="ancestral-modal-note">Vui lòng sử dụng ngôn từ trang trọng, phù hợp với không gian tưởng niệm chung.</div>
              <div className="ancestral-modal-actions">
                <button type="button" className="ancestral-cancel-button" onClick={closeMessageModal} disabled={messageSending}>Hủy</button>
                <button type="submit" className="ancestral-confirm-button" disabled={messageSending || messageContent.trim().length === 0}>
                  {messageSending ? 'Đang gửi…' : 'Gửi lời viếng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );

  // Các bố cục "sẵn sàng" (chưa có bài vị / đã có bài vị) dựng trong renderReady để panel quản lý nằm ở một vị trí cố định,
  // không bị dựng lại (mất trạng thái) khi bố cục đổi, ví dụ lúc thêm bài vị đầu tiên.
  // Thay cho khung 3D khi không có WebGL / cảnh 3D lỗi: thông báo ngắn + tên và ngày mất dạng chữ.
  const unavailable3D = (
    <Hall3DUnavailable items={ancestors.map((a) => ({ id: a.id, name: a.name, deathDate: a.deathDate }))} />
  );

  const renderReady = (): React.ReactElement => {
  if (ancestors.length === 0 || !selectedAncestor) {
    // Chưa có bài vị (hoặc dòng họ chưa lập phòng thờ): vẫn hiển thị bàn thờ 3D trống (5 khung ảnh mờ);
    // thắp hương và lời viếng là của cả bàn thờ nên vẫn dùng được.
    const emptyNote =
      !clanId
        ? 'Chưa chọn dòng họ nào để vào phòng thờ.'
        : hall && !hall.hall.id
          ? 'Dòng họ chưa lập phòng thờ. Bàn thờ sẽ có bài vị khi Trưởng tộc thêm tiền nhân.'
          : 'Phòng thờ chưa có bài vị nào. Bàn thờ sẽ hiển thị ảnh thờ khi Trưởng tộc thêm tiền nhân.';
    return (
      <section className="ancestral-hall-page" aria-labelledby="ancestral-hall-title">
        {pageHeader}
        <div className="hall3d-section">
          {show3D ? (
            <React.Suspense fallback={hallLoading}>
              <AncestralHall3D
                tiers={NO_TIERS}
                selectedId={null}
                onSelect={setSelectedId}
                incenseCount={incense3D}
                isBurning={isOffering}
                offeringToken={offeringToken}
                emptyHint={EMPTY_HALL_HINT}
                hallTitle={clanLabel}
                portraitGrayscale={grayscale}
                onError={() => setHall3DFailed(true)}
              />
            </React.Suspense>
          ) : (
            unavailable3D
          )}
          {altarActions}
        </div>
        <div className="hall3d-empty-note" role="status">
          <strong>Chưa có bài vị.</strong> {emptyNote}
        </div>
        {messagesSection}
        {sharedOverlays}
      </section>
    );
  }

  const birthText = formatVnDate(selectedAncestor.birthDate);
  const deathText = formatVnDate(selectedAncestor.deathDate);

  const altar3D = (
    <div className="hall3d-section">
      {show3D ? (
        <>
          <React.Suspense fallback={hallLoading}>
            <AncestralHall3D
              tiers={tiers3D}
              selectedId={selectedAncestor.id}
              onSelect={setSelectedId}
              onTierPage={goTierPage}
              incenseCount={incense3D}
              isBurning={isOffering}
              offeringToken={offeringToken}
              hallTitle={clanLabel}
              portraitGrayscale={grayscale}
              onZoomChange={handleZoomChange}
              onError={() => setHall3DFailed(true)}
            />
          </React.Suspense>

          {/* Bấm vào ảnh thờ chỉ để xem thông tin người đó */}
          <div className="hall3d-caption" aria-live="polite">
            <strong>{selectedAncestor.name}</strong>
            <span>{selectedAncestor.title} · Đời thứ {selectedAncestor.generation}</span>
            <small>Sinh: {birthText || 'chưa rõ'} · Mất: {deathText || 'chưa rõ'}</small>
          </div>
        </>
      ) : (
        unavailable3D
      )}

      {altarActions}
    </div>
  );

  return (
    <section className="ancestral-hall-page" aria-labelledby="ancestral-hall-title">
      {import.meta.env.DEV && isDemo && (
        <div className="hall3d-demo-banner" role="note">Chế độ minh họa (dữ liệu giả trong bộ nhớ, không gọi Backend, mất khi tải lại trang). Thêm ?demoFail=403 (hoặc 401, 409, 422, 500, network) vào URL để thử báo lỗi.</div>
      )}
      <header className="ancestral-hall-header">
        <div>
          <span className="ancestral-hall-eyebrow">KHÔNG GIAN TƯỞNG NIỆM GIA TỘC</span>
          <h1 id="ancestral-hall-title">Phòng Thờ Số</h1>
          <p>Thành kính tưởng nhớ tiền nhân, gìn giữ ký ức và kết nối lòng tri ân của con cháu.</p>
        </div>
        <div className="ancestral-hall-position" aria-label="Vị trí trong danh sách tổ tiên">
          <strong>{String(selectedIndex + 1).padStart(2, '0')}</strong>
          <span>/ {String(ancestors.length).padStart(2, '0')}</span>
        </div>
      </header>

      <article className="ancestor-focus-card">
        <button
          type="button"
          className="ancestor-nav-button ancestor-nav-previous"
          onClick={() => selectAncestor(selectedIndex - 1)}
          aria-label="Xem vị tiền nhân trước"
        >
          ‹
        </button>

        <div className="ancestor-focus-portrait">
          <PortraitPlaceholder ancestor={selectedAncestor} />
        </div>

        <div className="ancestor-focus-copy">
          <span className="ancestor-honorific">{selectedAncestor.title} · Đời thứ {selectedAncestor.generation}</span>
          <h2>{selectedAncestor.name}</h2>
          <p className="ancestor-branch">{selectedAncestor.branch}</p>

          <dl className="ancestor-vitals-grid">
            <div>
              <dt>Sinh – Mất</dt>
              <dd>{selectedAncestor.birthYear} – {selectedAncestor.deathYear}</dd>
            </div>
            <div>
              <dt>Hưởng thọ</dt>
              <dd>{selectedAncestor.lifespan.replace('Hưởng thọ ', '')}</dd>
            </div>
            <div>
              <dt>Ngày tưởng niệm</dt>
              <dd>{selectedAncestor.memorialDate}</dd>
            </div>
            <div>
              <dt>Địa điểm</dt>
              <dd>{selectedAncestor.memorialPlace}</dd>
            </div>
          </dl>

          <div className="ancestor-focus-actions">
            <button type="button" className="ancestral-secondary-button" onClick={() => setIsInfoModalOpen(true)}>
              Xem thông tin
            </button>
            <button type="button" className="ancestral-secondary-button" onClick={openAncestralMedia}>
              Mở tư liệu tổ tiên <span>{selectedMedia.length}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          className="ancestor-nav-button ancestor-nav-next"
          onClick={() => selectAncestor(selectedIndex + 1)}
          aria-label="Xem vị tiền nhân tiếp theo"
        >
          ›
        </button>
      </article>

      <div className="ancestor-selector" role="tablist" aria-label="Chọn vị tiền nhân">
        {ancestors.map((ancestor, index) => (
          <button
            key={ancestor.id}
            type="button"
            role="tab"
            aria-selected={index === selectedIndex}
            className={index === selectedIndex ? 'active' : ''}
            onClick={() => selectAncestor(index)}
          >
            <PortraitPlaceholder ancestor={ancestor} compact />
            <span>
              <strong>{ancestor.name}</strong>
              <small>{ancestor.title} · Đời {ancestor.generation}</small>
            </span>
          </button>
        ))}
      </div>

      {altar3D}

      {messagesSection}
      {sharedOverlays}

      {isInfoModalOpen && (
        <div className="ancestral-modal-backdrop" role="presentation" onMouseDown={() => setIsInfoModalOpen(false)}>
          <div
            className="ancestral-modal ancestor-info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ancestor-info-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ancestral-modal-header">
              <div>
                <span>HỒ SƠ TIỀN NHÂN</span>
                <h2 id="ancestor-info-title">{selectedAncestor.name}</h2>
                <p>{selectedAncestor.title} · {selectedAncestor.relationship}</p>
              </div>
              <button type="button" onClick={() => setIsInfoModalOpen(false)} aria-label="Đóng hộp thoại">×</button>
            </div>
            <div className="ancestor-info-profile">
              <PortraitPlaceholder ancestor={selectedAncestor} compact />
              <dl>
                <div><dt>Ngày sinh</dt><dd>{birthText || 'Chưa rõ'}</dd></div>
                <div><dt>Ngày mất</dt><dd>{deathText || 'Chưa rõ'}</dd></div>
                <div><dt>Tầng bàn thờ</dt><dd>{selectedAncestor.branch}</dd></div>
              </dl>
            </div>
            <div className="ancestor-biography-copy">
              <h3>Ghi chú</h3>
              <p>{selectedAncestor.biography || 'Chưa có ghi chú.'}</p>
              <blockquote>{selectedAncestor.legacy}</blockquote>
            </div>
            <div className="ancestral-modal-actions">
              <button type="button" className="ancestral-cancel-button" onClick={() => setIsInfoModalOpen(false)}>Đóng</button>
              <button type="button" className="ancestral-confirm-button" onClick={() => { setIsInfoModalOpen(false); openAncestralMedia(); }}>Xem tư liệu liên quan</button>
            </div>
          </div>
        </div>
      )}

      {isMediaModalOpen && (
        <div className="ancestral-modal-backdrop" role="presentation" onMouseDown={() => setIsMediaModalOpen(false)}>
          <div
            className="ancestral-modal ancestor-media-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ancestor-media-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ancestral-modal-header">
              <div>
                <span>THƯ VIỆN TỔ TIÊN</span>
                <h2 id="ancestor-media-title">Tư liệu về {selectedAncestor.name}</h2>
                <p>{selectedMedia.length} tư liệu đã được số hóa trong thư viện.</p>
              </div>
              <button type="button" onClick={() => setIsMediaModalOpen(false)} aria-label="Đóng hộp thoại">×</button>
            </div>
            {selectedMedia.length === 0 ? (
              <div className="memorial-empty-state compact"><h3>Chưa có tư liệu</h3><p>Tư liệu về vị tiền nhân này đang được sưu tầm.</p></div>
            ) : (
              <div className="ancestor-media-preview-list">
                {selectedMedia.map((item) => (
                  <article key={item.id}>
                    <div className={`ancestor-media-icon media-accent-${item.accent}`} aria-hidden="true">{mediaIcon(item.type)}</div>
                    <div><span>{item.type}</span><h3>{item.title}</h3><p>{item.description}</p><small>{item.capturedAt} · {item.source}</small></div>
                  </article>
                ))}
              </div>
            )}
            <div className="ancestral-modal-actions">
              <button type="button" className="ancestral-cancel-button" onClick={() => setIsMediaModalOpen(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
  };

  return (
    <>
      {renderReady()}
      <ManagePanelHost
        canManage={canManage}
        open={manageOpen}
        clanId={clanId}
        hall={hall}
        onChanged={refreshHall}
        onClose={() => setManageOpen(false)}
      />
    </>
  );
};

export default DigitalAncestralHallModule;
