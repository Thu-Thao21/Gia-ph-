/*
 * Logic THUẦN (không dùng DOM / maplibre) cho bản đồ thế giới: gom dữ liệu địa điểm dòng họ và mộ phần
 * thành một danh sách điểm chung, dựng GeoJSON, tính khung nhìn, định dạng popup/chú giải/thống kê và
 * kích thước cụm. Mọi hàm ở đây nhận/trả dữ liệu thường, không chạm DOM — WorldMapView.tsx mới là nơi vẽ.
 *
 * Bản đồ (WorldMapView) chỉ nhận `WorldMapPoint[]`. Muốn thêm lớp mới (ví dụ "mộ phần cả dòng họ" khi BE có API)
 * chỉ cần đổi dữ liệu đưa vào bằng `burialsToPoints(...)` rồi nối vào danh sách — không phải sửa bản đồ.
 *
 * QUYỀN RIÊNG TƯ: file này không tự lấy dữ liệu và không lọc/mở rộng quyền xem. Chỉ những gì API hiện có
 * trả về cho người dùng (địa điểm dòng họ, mộ phần) mới tới được đây. Không có kiểu điểm nào cho nơi ở cá nhân.
 */
import type { ClanLocation, PersonBurial } from '../../types/location';
import { getGoogleMapsDirectionUrl } from '../../services/location.service';

export type MapPointKind = 'clan-location' | 'burial';

/** Loại điểm trên bản đồ: 6 loại địa điểm dòng họ + mộ phần. */
export type MapPointCategory =
  | 'ANCESTRAL_HALL'
  | 'BRANCH_HALL'
  | 'HISTORIC_SITE'
  | 'EVENT_VENUE'
  | 'HOMELAND'
  | 'OTHER'
  | 'BURIAL';

/** Hình ghim trên bản đồ: nhiều category dùng chung 1 hình (ví dụ 2 loại nhà thờ/từ đường cùng hình "hall"). */
export type MapMarkerIcon = 'hall' | 'grave' | 'heritage' | 'event' | 'other';

export interface WorldMapPoint {
  id: string;
  kind: MapPointKind;
  category: MapPointCategory;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** Ảnh đầu tiên (nếu có) dùng làm ảnh bìa popup. */
  coverPhotoUrl: string | null;
  /** Ngày an táng ISO (yyyy-mm-dd), chỉ có ở mộ phần. */
  burialDateIso: string | null;
}

export interface CategoryMeta {
  label: string;
  /** Màu chủ đạo của loại (ghim, huy hiệu popup, chip chú giải). */
  color: string;
  icon: MapMarkerIcon;
}

// Bảng màu theo yêu cầu thiết kế: nhà thờ/từ đường tím, mộ phần đỏ, quê hương/di tích một màu ấm riêng,
// còn lại 2 loại ít dùng (sự kiện, khác) có màu riêng hài hòa, không trùng 3 màu chính ở trên.
const COLOR_HALL = '#7c3aed'; // tím — nhà thờ đại tộc / từ đường chi phái
const COLOR_BURIAL = '#dc2626'; // đỏ — mộ phần
const COLOR_HERITAGE = '#b45309'; // nâu hổ phách ấm — quê hương / di tích
const COLOR_EVENT = '#0d9488'; // xanh ngọc — nơi tổ chức sự kiện
const COLOR_OTHER = '#64748b'; // xám trung tính — địa điểm khác

/** Thứ tự ở đây cũng là thứ tự hiển thị trong chú giải — Mộ phần (lớp mặc định bật) luôn đứng đầu. */
export const CATEGORY_META: Record<MapPointCategory, CategoryMeta> = {
  BURIAL: { label: 'Mộ phần', color: COLOR_BURIAL, icon: 'grave' },
  ANCESTRAL_HALL: { label: 'Nhà thờ đại tộc', color: COLOR_HALL, icon: 'hall' },
  BRANCH_HALL: { label: 'Từ đường chi phái', color: COLOR_HALL, icon: 'hall' },
  HISTORIC_SITE: { label: 'Di tích lịch sử', color: COLOR_HERITAGE, icon: 'heritage' },
  EVENT_VENUE: { label: 'Nơi tổ chức sự kiện', color: COLOR_EVENT, icon: 'event' },
  HOMELAND: { label: 'Đất tổ quê hương', color: COLOR_HERITAGE, icon: 'heritage' },
  OTHER: { label: 'Địa điểm khác', color: COLOR_OTHER, icon: 'other' },
};

/** Loại nào hiện mặc định khi mở bản đồ — chỉ Mộ phần; các loại khác bật bằng chip chú giải. */
export const DEFAULT_VISIBLE_CATEGORY: MapPointCategory = 'BURIAL';

export const CATEGORY_ORDER = Object.keys(CATEGORY_META) as MapPointCategory[];

/** Danh sách hình ghim cần đăng ký qua map.addImage (mỗi hình 1 lần, dùng chung giữa các category). */
export const MARKER_ICON_IDS: MapMarkerIcon[] = ['hall', 'grave', 'heritage', 'event', 'other'];

/** Màu baked sẵn trong ảnh ghim ứng với mỗi icon id (mỗi icon id chỉ dùng đúng 1 màu, xem CATEGORY_META ở trên). */
export const MARKER_ICON_COLOR: Record<MapMarkerIcon, string> = {
  hall: COLOR_HALL,
  grave: COLOR_BURIAL,
  heritage: COLOR_HERITAGE,
  event: COLOR_EVENT,
  other: COLOR_OTHER,
};

export const NO_ADDRESS_TEXT = 'Chưa cập nhật địa chỉ';

/** Tọa độ hợp lệ: số hữu hạn, trong miền, và không phải (0,0) (nghĩa là "chưa nhập" ở dữ liệu hiện tại). */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return !(lat === 0 && lng === 0);
}

function categoryOfLocation(type: string | undefined): MapPointCategory {
  return type && type !== 'BURIAL' && type in CATEGORY_META ? (type as MapPointCategory) : 'OTHER';
}

function firstPhotoUrl(urls: readonly string[] | null | undefined): string | null {
  const url = (urls ?? []).find((u) => typeof u === 'string' && u.trim() !== '');
  return url ? url.trim() : null;
}

/** Địa điểm dòng họ (API /families/{id}/locations) -> điểm bản đồ. Bỏ qua bản ghi thiếu/sai tọa độ. */
export function locationsToPoints(locations: readonly ClanLocation[] | null | undefined): WorldMapPoint[] {
  const out: WorldMapPoint[] = [];
  for (const loc of locations ?? []) {
    if (!loc || !isValidCoordinate(loc.latitude, loc.longitude)) continue;
    out.push({
      id: `loc:${loc.id}`,
      kind: 'clan-location',
      category: categoryOfLocation(loc.locationType),
      name: (loc.name || '').trim() || 'Địa điểm chưa đặt tên',
      address: (loc.address || '').trim(),
      latitude: loc.latitude,
      longitude: loc.longitude,
      coverPhotoUrl: firstPhotoUrl(loc.photoUrls),
      burialDateIso: null,
    });
  }
  return out;
}

export interface BurialEntry {
  burial: PersonBurial;
  /** Tên người được an táng (nếu bên gọi có). Không bắt buộc. */
  personName?: string | null;
}

/**
 * Mộ phần -> điểm bản đồ. CHƯA có nơi nào gọi hàm này với dữ liệu cả dòng họ (BE chưa có API liệt kê mộ phần);
 * khi có API chỉ cần đưa danh sách vào đây. Đã dùng cho chế độ ?demo=1.
 */
export function burialsToPoints(entries: readonly BurialEntry[] | null | undefined): WorldMapPoint[] {
  const out: WorldMapPoint[] = [];
  for (const entry of entries ?? []) {
    const b = entry?.burial;
    if (!b || !isValidCoordinate(b.latitude, b.longitude)) continue;
    const person = (entry.personName || '').trim();
    const cemetery = (b.cemeteryName || '').trim();
    out.push({
      id: `burial:${b.burialId || b.id || b.personId}`,
      kind: 'burial',
      category: 'BURIAL',
      name: person ? `Mộ ${person}` : cemetery || 'Mộ phần',
      address: (b.address || cemetery || '').trim(),
      latitude: b.latitude,
      longitude: b.longitude,
      coverPhotoUrl: firstPhotoUrl(b.photoUrls),
      burialDateIso: b.burialDate || null,
    });
  }
  return out;
}

/** Nối nhiều lớp dữ liệu, bỏ điểm trùng id (giữ điểm đến trước). */
export function mergePoints(...layers: ReadonlyArray<readonly WorldMapPoint[] | null | undefined>): WorldMapPoint[] {
  const seen = new Set<string>();
  const out: WorldMapPoint[] = [];
  for (const layer of layers) {
    for (const p of layer ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/** Bỏ các điểm thuộc loại đang bị tắt (chip chú giải/bộ lọc). `hidden` rỗng/undefined = không lọc gì. */
export function filterPointsByCategory(
  points: readonly WorldMapPoint[],
  hidden: ReadonlySet<MapPointCategory> | null | undefined,
): WorldMapPoint[] {
  if (!hidden || hidden.size === 0) return points as WorldMapPoint[];
  return points.filter((p) => !hidden.has(p.category));
}

export interface PointFeatureProperties {
  id: string;
  kind: MapPointKind;
  category: MapPointCategory;
  icon: MapMarkerIcon;
  name: string;
  address: string;
  coverPhotoUrl: string | null;
  burialDateIso: string | null;
}

export interface PointFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: number;
    properties: PointFeatureProperties;
    geometry: { type: 'Point'; coordinates: [number, number] };
  }>;
}

export function toFeatureCollection(points: readonly WorldMapPoint[]): PointFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p, index) => ({
      type: 'Feature' as const,
      id: index,
      properties: {
        id: p.id,
        kind: p.kind,
        category: p.category,
        icon: CATEGORY_META[p.category]?.icon ?? 'other',
        name: p.name,
        address: p.address,
        coverPhotoUrl: p.coverPhotoUrl,
        burialDateIso: p.burialDateIso,
      },
      geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] as [number, number] },
    })),
  };
}

/** Điểm có tọa độ hữu hạn, trong miền: loại NaN / Infinity / null / chuỗi trước khi tính khung nhìn (nếu lọt vào
 * fitBounds sẽ sinh lỗi "Invalid LngLat object: (NaN, NaN)" của MapLibre). */
function hasFiniteCoordinates(p: Pick<WorldMapPoint, 'latitude' | 'longitude'> | null | undefined): boolean {
  if (!p) return false;
  const { latitude, longitude } = p;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Khung nhìn [[tây, nam], [đông, bắc]] ôm hết các điểm HỢP LỆ (bỏ điểm có tọa độ không hữu hạn);
 * null nếu không còn điểm hợp lệ nào. */
export function computeBounds(points: readonly WorldMapPoint[]): BoundsTuple | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let count = 0;
  for (const p of points) {
    if (!hasFiniteCoordinates(p)) continue;
    count += 1;
    west = Math.min(west, p.longitude);
    east = Math.max(east, p.longitude);
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
  }
  if (count === 0) return null;
  return [
    [west, south],
    [east, north],
  ];
}

export interface LegendEntry {
  category: MapPointCategory;
  label: string;
  color: string;
  count: number;
}

/**
 * Chú giải kiêm bộ lọc: chỉ liệt kê loại CÓ dữ liệu (ẩn hẳn loại 0 điểm, không làm mờ — người lớn tuổi dễ rối
 * mắt với chip vừa mờ vừa không bấm được). Đúng thứ tự CATEGORY_ORDER nên "Mộ phần" luôn đứng đầu nếu có mộ.
 * Đếm theo `points` truyền vào — truyền bộ điểm CHƯA lọc theo bộ lọc hiện tại để số đếm trên chip luôn là tổng
 * thật, không đổi khi người dùng bật/tắt.
 */
export function buildLegend(points: readonly WorldMapPoint[]): LegendEntry[] {
  const counts = new Map<MapPointCategory, number>();
  for (const p of points) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return CATEGORY_ORDER.filter((c) => counts.has(c)).map((c) => ({
    category: c,
    label: CATEGORY_META[c].label,
    color: CATEGORY_META[c].color,
    count: counts.get(c) ?? 0,
  }));
}

/**
 * Thống kê ngắn cho tiêu đề khối bản đồ. Mặc định (chưa bật thêm lớp nào khác) chỉ nói "N mộ phần" — đúng
 * trọng tâm của bản đồ; nếu người dùng đã bật thêm địa điểm dòng họ (chip khác "Mộ phần") thì nói thêm số đó.
 * Nhận `visiblePoints` (đã lọc theo chú giải đang bật), không phải toàn bộ điểm.
 */
export function formatMapStats(visiblePoints: readonly WorldMapPoint[]): string {
  let burialCount = 0;
  let otherCount = 0;
  for (const p of visiblePoints) {
    if (p.kind === 'burial') burialCount += 1;
    else otherCount += 1;
  }
  return otherCount > 0 ? `${burialCount} mộ phần · ${otherCount} địa điểm dòng họ` : `${burialCount} mộ phần`;
}

/* ------------------------------------------------------------------ */
/* Khung nhìn mặc định: CHỈ tính theo điểm Mộ phần                      */
/* ------------------------------------------------------------------ */

export type BoundsTuple = [[number, number], [number, number]];

/** Khung Việt Nam dùng khi chưa có mộ phần nào (thay vì mở bản đồ ra cả thế giới). */
export const VIETNAM_BOUNDS: BoundsTuple = [
  [102, 8],
  [110, 23.5],
];

const VIETNAM_LNG_RANGE: readonly [number, number] = [102, 110];
const VIETNAM_LAT_RANGE: readonly [number, number] = [8, 24];

/**
 * Khung Đông Nam Á nới rộng — dùng làm maxBounds (giới hạn kéo bản đồ) khi toàn bộ mộ (hoặc chưa có mộ nào)
 * nằm trong Việt Nam, để người lớn tuổi lỡ kéo/phóng không bị lạc ra giữa đại dương. Chỉ áp khi KHÔNG có mộ
 * hải ngoại — có mộ hải ngoại thì bỏ giới hạn, cho xem/kéo tự do.
 */
export const SOUTHEAST_ASIA_MAX_BOUNDS: BoundsTuple = [
  [90, -5],
  [125, 30],
];

/** Mộ cách nhau trong khoảng này (độ kinh/vĩ) coi là "rất gần nhau" — cùng khu vực tỉnh/thành. */
const TIGHT_CLUSTER_SPAN_DEGREES = 0.5;

/** maxZoom áp cho trường hợp 1 mộ hoặc các mộ rất gần nhau trong nước — "khoảng 12-13" theo yêu cầu thiết kế. */
export const DEFAULT_VIEWPORT_MAX_ZOOM = 12.5;

export function isWithinVietnam(latitude: number, longitude: number): boolean {
  return (
    longitude >= VIETNAM_LNG_RANGE[0] &&
    longitude <= VIETNAM_LNG_RANGE[1] &&
    latitude >= VIETNAM_LAT_RANGE[0] &&
    latitude <= VIETNAM_LAT_RANGE[1]
  );
}

export interface DefaultViewport {
  bounds: BoundsTuple;
  /** undefined = không giới hạn thêm (để fitBounds tự tính theo kích thước khung mộ/khung VN). */
  maxZoom: number | undefined;
  /** undefined = không giới hạn kéo bản đồ (có mộ hải ngoại). Có giá trị khi mọi mộ (hoặc chưa có mộ nào) đều
   * trong nước — xem SOUTHEAST_ASIA_MAX_BOUNDS. */
  maxBounds: BoundsTuple | undefined;
  /** true khi đây là khung Việt Nam dự phòng (chưa có mộ nào) — WorldMapView dùng để chọn padding nhỏ hơn,
   * cho Việt Nam lấp đầy chiều cao thay vì bơi giữa nhiều khoảng trắng. */
  isVietnamFallback: boolean;
}

function vietnamFallbackViewport(): DefaultViewport {
  return { bounds: VIETNAM_BOUNDS, maxZoom: undefined, maxBounds: SOUTHEAST_ASIA_MAX_BOUNDS, isVietnamFallback: true };
}

/**
 * Khung nhìn mặc định khi mở bản đồ (và khi bấm "Xem toàn bộ"): CHỈ tính theo điểm Mộ phần, không tính các
 * địa điểm dòng họ khác (kể cả khi chúng đang được bật xem) — bản đồ này trước hết là bản đồ mộ phần.
 * - Không có mộ nào -> khung Việt Nam (VIETNAM_BOUNDS), không mở ra cả thế giới.
 * - Có mộ, tất cả đều nằm trong Việt Nam -> khung ôm đúng các mộ đó (luôn là tập con của khung VN, nên tự
 *   nhiên "không zoom ra quá khung Việt Nam" mà không cần ép riêng). Nếu chỉ 1 mộ hoặc các mộ rất gần nhau
 *   thì giới hạn thêm maxZoom ~12-13 để vẫn thấy bối cảnh tỉnh/thành xung quanh, không zoom sát đất.
 * - Có mộ ở hải ngoại (hoặc lẫn cả trong/ngoài nước) -> ôm hết mọi mộ, không giới hạn maxZoom riêng.
 * Khi KHÔNG có mộ hải ngoại nào (kể cả lúc chưa có mộ), kèm maxBounds Đông Nam Á để người dùng không kéo bản
 * đồ lạc quá xa; có mộ hải ngoại thì bỏ hẳn giới hạn kéo.
 */
export function computeDefaultViewport(allBurialPoints: readonly WorldMapPoint[]): DefaultViewport {
  // Bỏ điểm tọa độ không hữu hạn trước; không còn điểm hợp lệ nào -> khung Việt Nam dự phòng.
  const burialPoints = allBurialPoints.filter(hasFiniteCoordinates);
  const bounds = computeBounds(burialPoints);
  if (!bounds) return vietnamFallbackViewport();

  const [[west, south], [east, north]] = bounds;
  const allDomestic = burialPoints.every((p) => isWithinVietnam(p.latitude, p.longitude));
  const isTightCluster = east - west <= TIGHT_CLUSTER_SPAN_DEGREES && north - south <= TIGHT_CLUSTER_SPAN_DEGREES;

  return {
    bounds,
    maxZoom: allDomestic && isTightCluster ? DEFAULT_VIEWPORT_MAX_ZOOM : undefined,
    maxBounds: allDomestic ? SOUTHEAST_ASIA_MAX_BOUNDS : undefined,
    isVietnamFallback: false,
  };
}

/** Khoảng đệm quanh khung nhìn khi fitBounds — trong khoảng 60-80px theo yêu cầu thiết kế. */
export const VIEWPORT_PADDING = 72;
/** Khi khung mặc định là Việt Nam dự phòng (chưa có mộ): đệm nhỏ hơn hẳn để Việt Nam lấp đầy chiều cao. */
export const VIEWPORT_PADDING_VIETNAM_FALLBACK = 28;
/** Padding mỗi cạnh tối đa = 30% cạnh ngắn của khung bản đồ, để padding*2 luôn nhỏ hơn hẳn width/height. */
const MAX_PADDING_RATIO = 0.3;

/** Khung bản đồ đã có kích thước thật (cả hai chiều hữu hạn và >= 1px)? Chưa thì không được fitBounds/setMaxBounds
 * — kích thước 0 làm MapLibre tính ra zoom/tâm NaN. */
export function hasUsableSize(width: unknown, height: unknown): boolean {
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 1 &&
    height >= 1
  );
}

/** Giới hạn padding theo kích thước khung: không âm, không hữu hạn -> 0, không vượt 30% cạnh ngắn. */
export function clampViewportPadding(padding: number, width: number, height: number): number {
  if (!Number.isFinite(padding) || padding <= 0 || !hasUsableSize(width, height)) return 0;
  return Math.min(padding, Math.floor(Math.min(width, height) * MAX_PADDING_RATIO));
}

/** Padding thực dùng cho fitBounds: nhỏ hơn với khung Việt Nam dự phòng, rồi giới hạn theo kích thước khung. */
export function viewportPaddingFor(viewport: Pick<DefaultViewport, 'isVietnamFallback'>, width: number, height: number): number {
  const base = viewport.isVietnamFallback ? VIEWPORT_PADDING_VIETNAM_FALLBACK : VIEWPORT_PADDING;
  return clampViewportPadding(base, width, height);
}

export interface FitBoundsOptions {
  padding: number;
  duration: number;
  /** CHỈ có key này khi viewport có maxZoom thật. Không bao giờ để `maxZoom: undefined`: MapLibre dùng extend()
   * sao chép cả giá trị undefined rồi Math.min(zoom, undefined) = NaN -> "Invalid LngLat (NaN, NaN)". */
  maxZoom?: number;
}

/** Tùy chọn fitBounds an toàn cho một khung nhìn mặc định trong một khung bản đồ cỡ width x height. */
export function buildFitBoundsOptions(
  viewport: Pick<DefaultViewport, 'isVietnamFallback' | 'maxZoom'>,
  width: number,
  height: number,
  duration: number,
): FitBoundsOptions {
  const options: FitBoundsOptions = { padding: viewportPaddingFor(viewport, width, height), duration };
  if (typeof viewport.maxZoom === 'number' && Number.isFinite(viewport.maxZoom)) options.maxZoom = viewport.maxZoom;
  return options;
}

export type ClusterSize = 'small' | 'medium' | 'large';

/** Hạng kích thước cụm theo số điểm bên trong: 1-9 nhỏ, 10-49 vừa, 50+ lớn. */
export function clusterSizeBucket(pointCount: number): ClusterSize {
  if (pointCount >= 50) return 'large';
  if (pointCount >= 10) return 'medium';
  return 'small';
}

/* ------------------------------------------------------------------ */
/* Popup                                                                */
/* ------------------------------------------------------------------ */

export interface PopupModel {
  title: string;
  categoryLabel: string;
  color: string;
  address: string;
  coverPhotoUrl: string | null;
  /** Chỉ có giá trị khi là mộ phần và có ngày an táng — đã định dạng dd/mm/yyyy. */
  burialDateLabel: string | null;
  directionsUrl: string;
  directionsLabel: string;
  /** Văn bản toạ độ để nút "Sao chép tọa độ" đưa vào clipboard, dạng "vĩ độ, kinh độ" 6 số thập phân. */
  coordinatesText: string;
  copyLabel: string;
}

export const DIRECTIONS_LABEL = 'Chỉ đường';
export const COPY_COORDINATES_LABEL = 'Sao chép tọa độ';

/** "2025-03-02" -> "02/03/2025"; chuỗi hỏng/rỗng -> null (không hiện dòng ngày an táng). */
export function formatBurialDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

/** "21.098500, 105.471200" — dùng cho nút "Sao chép tọa độ". */
export function formatCoordinatesText(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function buildPopupModel(
  p: Pick<WorldMapPoint, 'category' | 'name' | 'address' | 'latitude' | 'longitude'> &
    Partial<Pick<WorldMapPoint, 'coverPhotoUrl' | 'burialDateIso'>>,
): PopupModel {
  const meta = CATEGORY_META[p.category] ?? CATEGORY_META.OTHER;
  return {
    title: (p.name || '').trim() || 'Địa điểm chưa đặt tên',
    categoryLabel: meta.label,
    color: meta.color,
    address: (p.address || '').trim() || NO_ADDRESS_TEXT,
    coverPhotoUrl: p.coverPhotoUrl ?? null,
    burialDateLabel: p.category === 'BURIAL' ? formatBurialDate(p.burialDateIso ?? null) : null,
    directionsUrl: getGoogleMapsDirectionUrl(p.latitude, p.longitude),
    directionsLabel: DIRECTIONS_LABEL,
    coordinatesText: formatCoordinatesText(p.latitude, p.longitude),
    copyLabel: COPY_COORDINATES_LABEL,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * HTML popup. Mọi chuỗi từ dữ liệu đều được escape; màu và URL do code tạo ra từ hằng số/số. Nút "Sao chép tọa
 * độ" chỉ có class + data-attribute (đọc toạ độ từ `coordinatesText`, không nhúng JS nội tuyến) — WorldMapView
 * tự gắn sự kiện click thật (navigator.clipboard) sau khi popup được thêm vào DOM.
 */
export function renderPopupHtml(model: PopupModel): string {
  const cover = model.coverPhotoUrl
    ? `<div class="wm-popup-cover"><img src="${escapeHtml(model.coverPhotoUrl)}" alt="" loading="lazy" onerror="this.style.opacity='0'" /></div>`
    : '';
  const burialDate = model.burialDateLabel
    ? `<div class="wm-popup-date">Ngày an táng: <strong>${escapeHtml(model.burialDateLabel)}</strong></div>`
    : '';
  return (
    `<div class="wm-popup">` +
    cover +
    `<div class="wm-popup-body">` +
    `<div class="wm-popup-title">${escapeHtml(model.title)}</div>` +
    `<span class="wm-popup-badge" style="background:${model.color}1f;color:${model.color}">${escapeHtml(model.categoryLabel)}</span>` +
    `<div class="wm-popup-address"><svg class="wm-popup-pin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${escapeHtml(model.address)}</span></div>` +
    burialDate +
    `<div class="wm-popup-actions">` +
    `<a class="wm-popup-dir" href="${escapeHtml(model.directionsUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(model.directionsLabel)}</a>` +
    `<button type="button" class="wm-popup-copy" data-coordinates="${escapeHtml(model.coordinatesText)}">${escapeHtml(model.copyLabel)}</button>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

/* ------------------------------------------------------------------ */
/* Chế độ minh họa                                                      */
/* ------------------------------------------------------------------ */

/** `?demo=1` trên query string. */
export function isDemoRequested(search: string): boolean {
  try {
    return new URLSearchParams(search).get('demo') === '1';
  } catch {
    return false;
  }
}
