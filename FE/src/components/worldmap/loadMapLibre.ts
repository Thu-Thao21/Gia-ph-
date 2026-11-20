/*
 * Nạp maplibre-gl theo yêu cầu (code-splitting: ~1 MB chỉ tải khi mở màn hình có bản đồ).
 *
 * maplibre-gl 6.x tự suy ra địa chỉ worker từ vị trí file chính (`./maplibre-gl-worker.mjs` cạnh nó). Sau khi
 * bundler gộp lại, file worker không còn nằm cạnh đó nên bản đồ báo "Worker failed to load". Vì vậy phải chỉ rõ
 * địa chỉ worker: `?url` làm Vite xuất worker (file độc lập, không import gì thêm) thành asset riêng.
 */
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

type MapLibreModule = typeof import('maplibre-gl');

let pending: Promise<MapLibreModule> | null = null;

export function loadMapLibre(): Promise<MapLibreModule> {
  if (!pending) {
    pending = import('maplibre-gl')
      .then((ml) => {
        ml.setWorkerUrl(new URL(workerUrl, window.location.href).href);
        return ml;
      })
      .catch((err) => {
        pending = null; // cho phép thử lại lần sau
        throw err;
      });
  }
  return pending;
}
