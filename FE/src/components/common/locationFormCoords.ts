/*
 * Logic thuần cho phần "tọa độ" của các form dùng LocationPickerModal (ClanLocationEditModal, BurialEditModal,
 * LocationProposalModal). Chưa có tọa độ thì state là null — KHÔNG dùng tọa độ mặc định, KHÔNG gửi 0.
 */
import { isValidCoordinate } from '../worldmap/worldMapData';

export interface FormCoords {
  lat: number | null;
  lng: number | null;
}

/** Cả hai cùng hợp lệ mới tính là "đã có tọa độ"; thiếu một nửa/NaN/(0,0) => cả hai null. */
export function initialFormCoords(lat: number | null | undefined, lng: number | null | undefined): FormCoords {
  if (typeof lat === 'number' && typeof lng === 'number' && isValidCoordinate(lat, lng)) return { lat, lng };
  return { lat: null, lng: null };
}

/** Tọa độ để gửi lên server; chưa chọn (null/không hợp lệ) => null, nơi gọi phải chặn lưu và báo lỗi. */
export function requireFormCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): { lat: number; lng: number } | null {
  const c = initialFormCoords(lat, lng);
  return c.lat === null || c.lng === null ? null : { lat: c.lat, lng: c.lng };
}

export const NO_COORDS_LABEL = 'Chưa chọn vị trí';

/** Chuỗi hiển thị "vĩ độ, kinh độ" (6 số thập phân) hoặc "Chưa chọn vị trí". */
export function formatFormCoords(lat: number | null | undefined, lng: number | null | undefined): string {
  const c = requireFormCoords(lat, lng);
  return c ? `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}` : NO_COORDS_LABEL;
}
