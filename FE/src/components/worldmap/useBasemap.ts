import { useCallback, useMemo, useState } from 'react';
import { getBasemap, openFreeMapBasemap, type Basemap, type MapKind } from './mapStyle';

export interface UseBasemapResult {
  basemap: Basemap;
  reportStyleFailure: () => void;
  /** Kiểu nền đang chọn ("map" nhẹ/dịu hoặc "satellite" ảnh vệ tinh). Chỉ là state trên trình duyệt, không lưu khóa. */
  mapKind: MapKind;
  setMapKind: (kind: MapKind) => void;
  /**
   * "Vệ tinh" chỉ dùng được khi nền đang là MapTiler thật (OpenFreeMap miễn phí không có ảnh vệ tinh tương đương).
   * UI dựa vào cờ này để ẩn/khóa nút chuyển nền thay vì để người dùng bấm vào một lựa chọn không có tác dụng.
   */
  satelliteAvailable: boolean;
}

/**
 * Chọn nền bản đồ cho một bản đồ. Mặc định theo cấu hình (MapTiler nếu có khóa, không thì OpenFreeMap) và kiểu
 * "map" (nhẹ/dịu). Nếu MapTiler từ chối ngay khi tải style (khóa sai / bị giới hạn tên miền), gọi
 * `reportStyleFailure()` để tự chuyển sang OpenFreeMap thay vì để bản đồ trống.
 */
export function useBasemap(): UseBasemapResult {
  const [keyFailed, setKeyFailed] = useState(false);
  const [mapKind, setMapKind] = useState<MapKind>('map');

  // Có khóa hay không chỉ phụ thuộc cấu hình môi trường (không đổi khi toggle map/satellite) — tính một lần.
  const hasKey = useMemo(() => getBasemap('map').provider === 'maptiler', []);

  const basemap = useMemo(() => {
    if (!hasKey || keyFailed) return openFreeMapBasemap(keyFailed ? 'key-failed' : 'no-key');
    return getBasemap(mapKind);
  }, [hasKey, keyFailed, mapKind]);

  const reportStyleFailure = useCallback(() => {
    if (hasKey) setKeyFailed(true);
  }, [hasKey]);

  return { basemap, reportStyleFailure, mapKind, setMapKind, satelliteAvailable: basemap.provider === 'maptiler' };
}
