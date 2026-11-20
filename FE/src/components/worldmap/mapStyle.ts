/*
 * Nền bản đồ: MapTiler khi có khóa (2 kiểu: "map" nhẹ/dịu cho dùng hằng ngày, "satellite" ảnh vệ tinh);
 * không có khóa (hoặc MapTiler từ chối) thì quay về OpenFreeMap.
 *
 * MapTiler
 * - Khóa đọc từ import.meta.env.VITE_MAPTILER_API_KEY (đặt trong FE/.env.local, KHÔNG commit). Không hardcode khóa.
 * - Style id ĐÃ XÁC MINH tồn tại thật (không đoán) qua dữ liệu chính thức của gói @maptiler/client — KHÔNG dùng
 *   endpoint style.json để thử vì nó trả 403 "Invalid key" cho MỌI id (kể cả id không tồn tại) khi khóa sai, nên
 *   không thể dùng để kiểm tra sự tồn tại của style:
 *     - "basic-v2-light": nền nhẹ, màu dịu, ít chi tiết đường — để điểm dòng họ nổi bật (kiểu bảng điều khiển).
 *     - "hybrid": ảnh vệ tinh độ phân giải cao kèm nhãn/đường/ranh giới (MapTiler docs > Map styles > MapStyle.HYBRID).
 *     - "streets-v4": dự phòng nội bộ — ví dụ chính thức trong tài liệu MapTiler Cloud API > Maps, chắc chắn tồn
 *       tại; dùng khi "kind" không hợp lệ, để không bao giờ còn lại bản đồ trắng.
 * - Điều khoản (https://www.maptiler.com/terms/, mục "Map Data Attribution"): phải hiện "© MapTiler" (tài khoản Free:
 *   kèm logo MapTiler) và "© OpenStreetMap", có liên kết, ở góc bản đồ. Style của MapTiler đã khai báo attribution nên
 *   MapLibre tự hiển thị; logo được thêm bằng <MapTilerLogo />. KHÔNG được tắt attribution hay logo.
 * - Khóa chạy ở trình duyệt nên lộ trong request: phải giới hạn theo tên miền (HTTP origins) trong MapTiler Cloud.
 * - Chế độ xem (map/satellite) chỉ là state trên trình duyệt (không lưu khóa, không lưu vào localStorage/URL).
 *
 * OpenFreeMap (dự phòng, không cần khóa): https://openfreemap.org/tos/ — miễn phí, phải ghi nguồn
 * ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap"), MapLibre tự hiển thị. Không có ảnh vệ tinh miễn phí
 * tương đương nên khi dùng nền dự phòng này, nút "Vệ tinh" bị ẩn/khóa (xem WorldMapView).
 */
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const MAPTILER_LIGHT_STYLE_ID = 'basic-v2-light';
export const MAPTILER_SATELLITE_STYLE_ID = 'hybrid';
/** Dự phòng nội bộ khi "kind" không hợp lệ — KHÔNG xoá: vẫn export để không phá import cũ. */
export const MAPTILER_STYLE_ID = 'streets-v4';

export const MAPTILER_LOGO_URL = 'https://api.maptiler.com/resources/logo.svg';
export const MAPTILER_HOME_URL = 'https://www.maptiler.com/';

export type MapKind = 'map' | 'satellite';

const MAPTILER_STYLE_ID_BY_KIND: Record<MapKind, string> = {
  map: MAPTILER_LIGHT_STYLE_ID,
  satellite: MAPTILER_SATELLITE_STYLE_ID,
};

export type BasemapProvider = 'maptiler' | 'openfreemap';
/** Vì sao đang dùng nền dự phòng: chưa cấu hình khóa, hoặc khóa có nhưng MapTiler từ chối/không tải được. */
export type BasemapFallbackReason = 'no-key' | 'key-failed';

export interface Basemap {
  provider: BasemapProvider;
  styleUrl: string;
  fallbackReason: BasemapFallbackReason | null;
}

/** Giá trị mẫu trong .env.example — coi như "chưa cấu hình". */
const PLACEHOLDER_KEYS = new Set(['your_key_here', 'your-key-here', 'changeme']);

export function normalizeMapTilerKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim();
  if (key === '' || PLACEHOLDER_KEYS.has(key.toLowerCase())) return null;
  return key;
}

export function openFreeMapBasemap(reason: BasemapFallbackReason | null): Basemap {
  return { provider: 'openfreemap', styleUrl: OPENFREEMAP_STYLE_URL, fallbackReason: reason };
}

/**
 * Chọn nền theo khóa + kiểu xem ("map" nhẹ/dịu mặc định, hoặc "satellite"): có khóa hợp lệ -> MapTiler;
 * thiếu/rỗng/mẫu -> OpenFreeMap (OpenFreeMap chỉ có 1 kiểu, bỏ qua "kind"). Hàm thuần, dễ test.
 */
export function resolveBasemap(rawKey: unknown, kind: MapKind = 'map'): Basemap {
  const key = normalizeMapTilerKey(rawKey);
  if (!key) return openFreeMapBasemap('no-key');
  const styleId = MAPTILER_STYLE_ID_BY_KIND[kind] ?? MAPTILER_STYLE_ID;
  return {
    provider: 'maptiler',
    styleUrl: `https://api.maptiler.com/maps/${styleId}/style.json?key=${encodeURIComponent(key)}`,
    fallbackReason: null,
  };
}

/** Nền theo cấu hình môi trường hiện tại (Vite nhúng giá trị lúc build/dev), kiểu "map" mặc định. */
export function getBasemap(kind: MapKind = 'map'): Basemap {
  return resolveBasemap(import.meta.env.VITE_MAPTILER_API_KEY, kind);
}

/** Dòng ghi chú nhỏ khi đang dùng nền dự phòng; null khi không cần nói gì. */
export function basemapNotice(basemap: Basemap): string | null {
  if (basemap.fallbackReason === 'no-key') return 'Đang dùng nền OpenFreeMap (chưa cấu hình khóa MapTiler).';
  if (basemap.fallbackReason === 'key-failed') {
    return 'Không tải được nền MapTiler (khóa không hợp lệ hoặc bị giới hạn tên miền) — đang dùng nền OpenFreeMap.';
  }
  return null;
}

/**
 * Lỗi của MapLibre có thể chứa nguyên URL yêu cầu (kèm ?key=...). Che giá trị khóa trước khi hiện lên giao diện
 * hoặc ghi log.
 */
export function sanitizeMapError(message: unknown): string {
  const text = typeof message === 'string' ? message : '';
  return text.replace(/([?&]key=)[^&\s"'<>]+/gi, '$1***');
}

/** Tâm/zoom mặc định khi chưa có điểm nào (không dùng để hiển thị, chỉ để khởi tạo). */
export const DEFAULT_CENTER: [number, number] = [105.8, 16.0];
export const DEFAULT_ZOOM = 2;

export const SOURCE_ID = 'wm-points';
export const SOURCE_SELECTED_ID = 'wm-selected';
/** Nguồn riêng cho ghim đang rê chuột (không dùng feature-state: MapLibre không cho feature-state trên layout
 * property như icon-size — xem LAYER_HOVER_ICON). */
export const SOURCE_HOVER_ID = 'wm-hover';
export const LAYER_CLUSTER_HALO = 'wm-cluster-halo';
export const LAYER_CLUSTERS = 'wm-clusters';
export const LAYER_CLUSTER_COUNT = 'wm-cluster-count';
export const LAYER_POINTS = 'wm-points-layer';
export const LAYER_HOVER_ICON = 'wm-hover-icon';
export const LAYER_SELECTED_HALO = 'wm-selected-halo';

/** icon-size cơ bản và khi rê chuột (tỉ lệ so với ảnh ghim gốc — xem markerIcons.ts). To hơn một chút so với
 * bản đồ thông thường để người lớn tuổi dễ nhìn thấy ghim mộ phần trên nền bản đồ. */
export const ICON_SIZE_BASE = 0.58;
export const ICON_SIZE_HOVER = 0.68;

export const CLUSTER_RADIUS = 52;
export const CLUSTER_MAX_ZOOM = 12;

/** Ngưỡng kích thước cụm theo yêu cầu thiết kế: 1-9 / 10-49 / 50+. */
export const CLUSTER_SIZE_STEPS = { medium: 10, large: 50 } as const;

/** Thời lượng bay tới cụm khi bấm (ms) — trong khoảng 600-900ms theo yêu cầu thiết kế. */
export const CLUSTER_FLY_DURATION_MS = 750;
