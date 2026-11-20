/*
 * Logic thuần (không DOM, không MapLibre) của hộp chọn tọa độ LocationPickerModal, để test được.
 *
 * Nguyên tắc: nguồn sự thật duy nhất là HAI CHUỖI trong ô vĩ độ / kinh độ. Tọa độ (ghim trên bản đồ, nút "Xác
 * nhận vị trí", link Chỉ đường) luôn được suy ra từ hai chuỗi đó. Ô trống/không hợp lệ => chưa có tọa độ => ghim
 * ẩn và không xác nhận được. Nhờ vậy tọa độ mặc định không bao giờ bị lưu như vị trí thật.
 */
import {
  VIETNAM_BOUNDS,
  buildFitBoundsOptions,
  computeDefaultViewport,
  isValidCoordinate,
  type BoundsTuple,
  type FitBoundsOptions,
} from '../worldmap/worldMapData';

export interface PickedCoords {
  lat: number;
  lng: number;
}

/** Số chữ số thập phân khi lưu tọa độ (~0,1 m). */
const COORD_DECIMALS = 6;
/** Zoom khi đã có tọa độ ban đầu. */
export const PICKER_POINT_ZOOM = 16;

export function roundCoord(value: number): number {
  return parseFloat(value.toFixed(COORD_DECIMALS));
}

/** Chuỗi hiển thị trong ô nhập cho một số đã làm tròn. */
export function formatCoord(value: number): string {
  return String(roundCoord(value));
}

/** Đọc một ô nhập số: chấp nhận dấu phẩy thập phân kiểu Việt Nam; rỗng/không phải số -> null. */
export function parseCoordInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (normalized === '') return null;
  // Chặn "1e3", "0x10", "Infinity"... — chỉ nhận số thập phân thông thường.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Từ hai ô nhập -> tọa độ hợp lệ, hoặc null nếu thiếu/sai/ngoài miền (kể cả (0,0) = "chưa nhập"). */
export function coordsFromText(latText: string, lngText: string): PickedCoords | null {
  const lat = parseCoordInput(latText);
  const lng = parseCoordInput(lngText);
  if (lat === null || lng === null || !isValidCoordinate(lat, lng)) return null;
  return { lat, lng };
}

/** Tọa độ ban đầu do nơi gọi truyền vào: null/undefined/NaN/(0,0) => chưa có. */
export function coordsFromInitial(lat: number | null | undefined, lng: number | null | undefined): PickedCoords | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!isValidCoordinate(lat, lng)) return null;
  return { lat: roundCoord(lat), lng: roundCoord(lng) };
}

/** Hai chuỗi cho ô nhập từ tọa độ ban đầu; chưa có tọa độ => hai ô để TRỐNG (không điền sẵn mặc định). */
export function textsFromCoords(coords: PickedCoords | null): { latText: string; lngText: string } {
  return coords ? { latText: formatCoord(coords.lat), lngText: formatCoord(coords.lng) } : { latText: '', lngText: '' };
}

/** Chuỗi ô nhập sau khi người dùng bấm/kéo ghim tới một điểm (đã làm tròn 6 số). */
export function textsFromPick(lat: number, lng: number): { latText: string; lngText: string } {
  return { latText: formatCoord(lat), lngText: formatCoord(lng) };
}

export type PickerInitialView =
  | { kind: 'point'; center: [number, number]; zoom: number }
  | { kind: 'bounds'; bounds: BoundsTuple; fitOptions: FitBoundsOptions };

/**
 * Khung nhìn ban đầu: có tọa độ -> zoom vào đó; chưa có -> khung Việt Nam [102,8]-[110,23.5].
 * fitOptions đi qua buildFitBoundsOptions nên không bao giờ có `maxZoom: undefined` và padding đã được giới hạn
 * theo kích thước khung (khung 0px -> padding 0).
 */
export function computePickerInitialView(coords: PickedCoords | null, width: number, height: number): PickerInitialView {
  if (coords) return { kind: 'point', center: [coords.lng, coords.lat], zoom: PICKER_POINT_ZOOM };
  const viewport = computeDefaultViewport([]);
  return {
    kind: 'bounds',
    bounds: VIETNAM_BOUNDS,
    fitOptions: buildFitBoundsOptions(viewport, width, height, 0),
  };
}

/** Chỉ xác nhận được khi đang ở chế độ chỉnh sửa và đã có tọa độ hợp lệ. */
export function canConfirmPick(coords: PickedCoords | null, readOnly: boolean): boolean {
  return !readOnly && coords !== null;
}

/** Tham số cho onSave(lat, lng, address); chưa chọn thì null (không được gọi onSave). */
export function buildConfirmPayload(
  coords: PickedCoords | null,
  address: string,
): { lat: number; lng: number; address: string } | null {
  if (!coords) return null;
  return { lat: coords.lat, lng: coords.lng, address };
}

/** Ô địa chỉ chỉ được tự điền khi đang trống (không đè chữ người dùng đã gõ). */
export function addressAfterSearch(current: string, found: string): string {
  return current.trim() === '' ? found : current;
}

/**
 * Xác nhận vị trí: chỉ gọi onSave khi đã chọn (có tọa độ hợp lệ) và không ở chế độ chỉ xem.
 * Trả true nếu đã gọi onSave (nơi gọi sẽ đóng hộp), false nếu không làm gì.
 */
export function confirmPick(
  coords: PickedCoords | null,
  address: string,
  readOnly: boolean,
  onSave: ((lat: number, lng: number, address: string) => void) | undefined,
): boolean {
  if (!canConfirmPick(coords, readOnly) || !onSave) return false;
  const payload = buildConfirmPayload(coords, address);
  if (!payload) return false;
  onSave(payload.lat, payload.lng, payload.address);
  return true;
}
