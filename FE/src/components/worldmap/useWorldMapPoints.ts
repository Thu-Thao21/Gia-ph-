import { useEffect, useMemo, useState } from 'react';
import type { ClanLocation } from '../../types/location';
import {
  burialsToPoints,
  isDemoRequested,
  locationsToPoints,
  mergePoints,
  type BurialEntry,
  type WorldMapPoint,
} from './worldMapData';

export interface UseWorldMapPointsOptions {
  /** Địa điểm dòng họ đã tải từ API hiện có (đã lọc quyền ở BE). */
  locations?: readonly ClanLocation[] | null;
  /**
   * Lớp mộ phần (tùy chọn). Hiện chưa có API liệt kê mộ phần cả dòng họ nên không ai truyền vào;
   * khi có API chỉ cần cấp thêm dữ liệu ở đây, bản đồ không phải sửa.
   */
  burials?: readonly BurialEntry[] | null;
}

export interface UseWorldMapPointsResult {
  points: WorldMapPoint[];
  /** true khi đang dùng dữ liệu giả (?demo=1, chỉ chạy ở môi trường dev). */
  isDemo: boolean;
}

/** Gom dữ liệu thành điểm bản đồ. Ở dev + `?demo=1` thì thay bằng dữ liệu giả, không cần BE. */
export function useWorldMapPoints({ locations, burials }: UseWorldMapPointsOptions): UseWorldMapPointsResult {
  const demoRequested =
    import.meta.env.DEV && typeof window !== 'undefined' && isDemoRequested(window.location.search);
  const [demoPoints, setDemoPoints] = useState<WorldMapPoint[] | null>(null);

  useEffect(() => {
    if (!demoRequested) return;
    let cancelled = false;
    // Nhánh DEV: bundler loại bỏ cả import() này khỏi bản production.
    if (import.meta.env.DEV) {
      void import('./worldMapDemo').then((demo) => {
        if (cancelled) return;
        setDemoPoints(mergePoints(locationsToPoints(demo.DEMO_LOCATIONS), burialsToPoints(demo.DEMO_BURIALS)));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [demoRequested]);

  const realPoints = useMemo(
    () => mergePoints(locationsToPoints(locations), burialsToPoints(burials)),
    [locations, burials],
  );

  if (demoRequested) return { points: demoPoints ?? [], isDemo: true };
  return { points: realPoints, isDemo: false };
}
