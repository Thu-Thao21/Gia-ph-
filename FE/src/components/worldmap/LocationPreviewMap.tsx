import React, { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { sanitizeMapError } from './mapStyle';
import { isValidCoordinate } from './worldMapData';
import { loadMapLibre } from './loadMapLibre';
import { useBasemap } from './useBasemap';
import { MapTilerLogo } from './MapTilerLogo';
import './WorldMapView.css';

export interface LocationPreviewMapProps {
  latitude: number;
  longitude: number;
  /** Nhãn đọc được cho trình đọc màn hình. */
  label?: string;
  zoom?: number;
}

/**
 * Bản đồ MapLibre CHỈ XEM cho một vị trí (có marker), dùng thay iframe Google Maps.
 * Chiếm 100% khung cha — khung cha phải có chiều cao. Nút "Chỉ đường" do nơi dùng tự giữ.
 */
export const LocationPreviewMap: React.FC<LocationPreviewMapProps> = ({
  latitude,
  longitude,
  label = 'Bản đồ vị trí',
  zoom = 15,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = isValidCoordinate(latitude, longitude);
  const { basemap, reportStyleFailure } = useBasemap();
  const styleUrl = basemap.styleUrl;
  const basemapProvider = basemap.provider;

  useEffect(() => {
    if (!valid || !containerRef.current) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let styleLoaded = false;
    setError(null);

    (async () => {
      try {
        const ml = await loadMapLibre();
        if (cancelled || !containerRef.current) return;
        map = new ml.Map({
          container: containerRef.current,
          style: styleUrl,
          center: [longitude, latitude],
          zoom,
          // Attribution phải luôn hiển thị (điều khoản MapTiler/OpenFreeMap): không thu gọn, không tắt.
          attributionControl: { compact: false },
        });
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
        new ml.Marker({ color: '#dc2626' }).setLngLat([longitude, latitude]).addTo(map);
        map.once('style.load', () => {
          styleLoaded = true;
        });
        map.on('error', (ev) => {
          if (styleLoaded || cancelled) return;
          if (basemapProvider === 'maptiler') {
            reportStyleFailure(); // tự chuyển sang OpenFreeMap, effect này sẽ chạy lại
            return;
          }
          setError(sanitizeMapError(ev?.error?.message) || 'Không tải được nền bản đồ.');
        });
      } catch (err) {
        if (!cancelled) setError(sanitizeMapError(err instanceof Error ? err.message : '') || 'Trình duyệt không hỗ trợ WebGL.');
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // Tạo lại bản đồ khi đổi vị trí (mỗi lần mở một mộ phần khác).
  }, [latitude, longitude, zoom, valid, styleUrl, basemapProvider, reportStyleFailure]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} role="img" aria-label={label} style={{ position: 'absolute', inset: 0 }} />
      {valid && !error && <MapTilerLogo basemap={basemap} />}
      {(!valid || error) && (
        <div className="wm-overlay wm-overlay-error" role="alert">
          <strong>Không hiển thị được bản đồ</strong>
          <span>{valid ? error : 'Tọa độ không hợp lệ.'}</span>
        </div>
      )}
    </div>
  );
};

export default LocationPreviewMap;
