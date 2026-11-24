import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getGoogleMapsDirectionUrl } from '../../services/location.service';
import { loadMapLibre } from '../worldmap/loadMapLibre';
import { useBasemap } from '../worldmap/useBasemap';
import { MapTilerLogo } from '../worldmap/MapTilerLogo';
import { DEFAULT_CENTER, DEFAULT_ZOOM, basemapNotice, sanitizeMapError } from '../worldmap/mapStyle';
import { hasUsableSize } from '../worldmap/worldMapData';
import {
  addressAfterSearch,
  canConfirmPick,
  confirmPick,
  computePickerInitialView,
  coordsFromInitial,
  coordsFromText,
  roundCoord,
  textsFromCoords,
  textsFromPick,
} from './locationPickerLogic';
import '../worldmap/WorldMapView.css';
import './LocationPickerModal.css';

export interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLat?: number | null;
  initialLng?: number | null;
  initialAddress?: string;
  title?: string;
  subtitle?: string;
  onSave?: (lat: number, lng: number, address: string) => void;
  readOnly?: boolean;
}

const PIN_COLOR = '#dc2626';
const GPS_ZOOM = 17;
const SEARCH_ZOOM = 16;
/** Khi gõ tay tọa độ: nếu bản đồ đang zoom xa thì phóng lên mức này để thấy ghim rõ. */
const TYPED_MIN_ZOOM = 12;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  initialLat,
  initialLng,
  initialAddress = '',
  title = 'Chọn tọa độ vị trí trên bản đồ',
  subtitle = 'Nhấp vào bản đồ hoặc kéo ghim để chọn tọa độ chính xác',
  onSave,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);

  // Nguồn sự thật: hai chuỗi trong ô nhập. Chưa có tọa độ ban đầu => hai ô TRỐNG (không điền sẵn mặc định).
  const [latText, setLatText] = useState<string>(() => textsFromCoords(coordsFromInitial(initialLat, initialLng)).latText);
  const [lngText, setLngText] = useState<string>(() => textsFromCoords(coordsFromInitial(initialLat, initialLng)).lngText);
  const [address, setAddress] = useState<string>(initialAddress);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState<number>(0);

  const coords = useMemo(() => coordsFromText(latText, lngText), [latText, lngText]);

  // Nạp lại dữ liệu từ props mỗi khi mở hộp (hoặc props đổi lúc đang mở). Làm ngay trong lúc render (không qua
  // effect) để bản đồ — được tạo bất đồng bộ — luôn thấy tọa độ ban đầu mới, không phải giá trị của lần mở trước.
  const syncKey = isOpen ? `${initialLat ?? ''}|${initialLng ?? ''}|${initialAddress}` : null;
  const [prevSyncKey, setPrevSyncKey] = useState<string | null>(null);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    if (syncKey !== null) {
      const texts = textsFromCoords(coordsFromInitial(initialLat, initialLng));
      setLatText(texts.latText);
      setLngText(texts.lngText);
      setAddress(initialAddress || '');
    }
  }

  // Các ref cho handler của MapLibre (tạo một lần lúc mở) đọc được giá trị mới nhất.
  const { basemap, reportStyleFailure, mapKind, setMapKind, satelliteAvailable } = useBasemap();
  const styleUrl = basemap.styleUrl;
  const coordsRef = useRef(coords);
  coordsRef.current = coords;
  const styleUrlRef = useRef(styleUrl);
  styleUrlRef.current = styleUrl;
  const providerRef = useRef(basemap.provider);
  providerRef.current = basemap.provider;
  const reportFailureRef = useRef(reportStyleFailure);
  reportFailureRef.current = reportStyleFailure;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const appliedStyleRef = useRef<string | null>(null);
  const styleLoadedRef = useRef(false);
  /** Điểm mà hiệu ứng đồng bộ KHÔNG cần tự di chuyển bản đồ tới (đã tự di chuyển, hoặc người dùng vừa bấm/kéo ở đó). */
  const skipMoveRef = useRef<{ lat: number; lng: number } | null>(null);

  // Tra địa chỉ ngược từ tọa độ (Nominatim) — giữ nguyên hành vi cũ: bấm/kéo ghim/GPS thì cập nhật ô địa chỉ.
  const reverseGeocode = useCallback(async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'vi' } },
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          setAddress(data.display_name);
        }
      }
    } catch {
      // Ignore geocoding failure silently
    }
  }, []);

  /** Người dùng bấm vào bản đồ / kéo ghim tới một điểm: ghim nhảy tới đó, bản đồ không tự dịch chuyển. */
  const pickPoint = useCallback(
    (rawLat: number, rawLng: number) => {
      const lat = roundCoord(rawLat);
      const lng = roundCoord(rawLng);
      const texts = textsFromPick(lat, lng);
      skipMoveRef.current = { lat, lng };
      setLatText(texts.latText);
      setLngText(texts.lngText);
      void reverseGeocode(lat, lng);
    },
    [reverseGeocode],
  );
  const pickPointRef = useRef(pickPoint);
  pickPointRef.current = pickPoint;

  /** Tìm địa chỉ / GPS: đưa ghim tới điểm đó và bay bản đồ tới. */
  const goToPoint = useCallback((rawLat: number, rawLng: number, zoom: number) => {
    const lat = roundCoord(rawLat);
    const lng = roundCoord(rawLng);
    const texts = textsFromPick(lat, lng);
    setLatText(texts.latText);
    setLngText(texts.lngText);
    const map = mapRef.current;
    if (map) {
      skipMoveRef.current = { lat, lng };
      map.flyTo({ center: [lng, lat], zoom, duration: prefersReducedMotion() ? 0 : 1000 });
    }
  }, []);

  // Tạo bản đồ MapLibre khi mở hộp; dọn (map.remove) khi đóng/unmount để không rò rỉ khi mở/đóng nhiều lần.
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let marker: MapLibreMarker | null = null;
    let resizeObserver: ResizeObserver | null = null;
    setMapError(null);
    setMapReady(false);

    (async () => {
      try {
        const ml = await loadMapLibre();
        const container = containerRef.current;
        if (cancelled || !container) return;

        const start = coordsRef.current;
        const initialView = computePickerInitialView(start, container.clientWidth, container.clientHeight);
        map = new ml.Map({
          container,
          style: styleUrlRef.current,
          center: initialView.kind === 'point' ? initialView.center : DEFAULT_CENTER,
          zoom: initialView.kind === 'point' ? initialView.zoom : DEFAULT_ZOOM,
          // Attribution phải luôn hiển thị (điều khoản MapTiler/OpenFreeMap): không thu gọn, không tắt.
          attributionControl: { compact: false },
          // Bản đồ phẳng, không xoay/nghiêng — giống bản đồ chính. Nút Phóng to/Thu nhỏ là nút React có nhãn chữ.
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        mapRef.current = map;
        appliedStyleRef.current = styleUrlRef.current;
        styleLoadedRef.current = false;
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();

        // Chưa có tọa độ: ôm khung Việt Nam ngay khi khung có kích thước thật (kích thước 0 làm zoom/tâm NaN).
        const m = map;
        let fitted = start !== null;
        const fitInitialViewport = () => {
          if (fitted) return;
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (!hasUsableSize(w, h)) return;
          const view = computePickerInitialView(null, w, h);
          if (view.kind === 'bounds') m.fitBounds(view.bounds, view.fitOptions);
          fitted = true;
        };
        fitInitialViewport();
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => {
            m.resize();
            fitInitialViewport();
          });
          resizeObserver.observe(container);
        }

        marker = new ml.Marker({ color: PIN_COLOR, draggable: !readOnlyRef.current });
        marker.getElement().setAttribute('aria-label', 'Ghim vị trí đang chọn');
        marker.on('dragend', () => {
          if (!marker) return;
          const p = marker.getLngLat();
          pickPointRef.current(p.lat, p.lng);
        });
        markerRef.current = marker;
        const pin = marker;

        m.on('click', (e) => {
          if (readOnlyRef.current) return;
          const target = e.originalEvent?.target;
          if (target instanceof Node && pin.getElement().contains(target)) return; // bấm đúng ghim thì không dời
          pickPointRef.current(e.lngLat.lat, e.lngLat.lng);
        });

        m.on('style.load', () => {
          styleLoadedRef.current = true;
          setMapError(null);
        });
        m.on('error', (ev) => {
          if (cancelled) return;
          if (styleLoadedRef.current) {
            // Lỗi tile lẻ sau khi style đã tải (mất mạng tạm thời): không làm phiền người dùng, nhưng vẫn ghi log.
            console.error('[LocationPickerModal] MapLibre error:', sanitizeMapError(ev?.error?.message) || ev);
            return;
          }
          if (providerRef.current === 'maptiler') {
            reportFailureRef.current(); // khóa sai/bị chặn tên miền: tự chuyển sang OpenFreeMap
            return;
          }
          setMapError(sanitizeMapError(ev?.error?.message) || 'Không tải được nền bản đồ.');
        });

        setMapReady(true);
      } catch (err) {
        if (!cancelled) {
          setMapError(sanitizeMapError(err instanceof Error ? err.message : '') || 'Trình duyệt không hỗ trợ WebGL.');
        }
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      marker?.remove();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
      appliedStyleRef.current = null;
      setMapReady(false);
    };
  }, [isOpen, retryNonce]);

  // Đổi nền (Bản đồ <-> Vệ tinh, hoặc rơi về OpenFreeMap): đổi style tại chỗ, giữ nguyên khung nhìn và ghim.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || appliedStyleRef.current === styleUrl) return;
    appliedStyleRef.current = styleUrl;
    styleLoadedRef.current = false;
    map.setStyle(styleUrl);
  }, [styleUrl, mapReady]);

  // Đồng bộ ghim + khung nhìn theo tọa độ: chưa có tọa độ => ghim ẩn; gõ tay tọa độ => ghim và bản đồ cập nhật theo.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !mapReady) return;
    marker.setDraggable(!readOnly);
    if (!coords) {
      marker.remove();
      return;
    }
    marker.setLngLat([coords.lng, coords.lat]);
    if (!marker.getElement().parentNode) marker.addTo(map);

    const skip = skipMoveRef.current;
    if (skip && skip.lat === coords.lat && skip.lng === coords.lng) {
      skipMoveRef.current = null;
      return;
    }
    skipMoveRef.current = null;
    const center = map.getCenter();
    if (Math.abs(center.lng - coords.lng) > 1e-6 || Math.abs(center.lat - coords.lat) > 1e-6) {
      map.easeTo({
        center: [coords.lng, coords.lat],
        zoom: Math.max(map.getZoom(), TYPED_MIN_ZOOM),
        duration: prefersReducedMotion() ? 0 : 400,
      });
    }
  }, [coords, mapReady, readOnly]);

  const handleZoomIn = () => mapRef.current?.zoomIn({ duration: prefersReducedMotion() ? 0 : 300 });
  const handleZoomOut = () => mapRef.current?.zoomOut({ duration: prefersReducedMotion() ? 0 : 300 });

  // Get Current GPS Location
  const handleGetCurrentGps = () => {
    if (!navigator.geolocation) {
      setStatusMsg('Trình duyệt không hỗ trợ xác định vị trí GPS.');
      return;
    }
    setGpsLoading(true);
    setStatusMsg('Đang lấy vị trí GPS từ thiết bị...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const userLat = roundCoord(pos.coords.latitude);
        const userLng = roundCoord(pos.coords.longitude);
        goToPoint(userLat, userLng, GPS_ZOOM);
        void reverseGeocode(userLat, userLng);
        setStatusMsg('Đã xác định vị trí hiện tại thành công.');
        setTimeout(() => setStatusMsg(null), 3000);
      },
      (err) => {
        setGpsLoading(false);
        setStatusMsg(`Không thể lấy vị trí: ${err.message}`);
        setTimeout(() => setStatusMsg(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Search Address via Nominatim
  const handleSearchAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setStatusMsg('Đang tìm kiếm địa chỉ...');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=vn&limit=1`,
        { headers: { 'Accept-Language': 'vi' } },
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        const foundLat = parseFloat(first.lat);
        const foundLng = parseFloat(first.lon);
        if (Number.isFinite(foundLat) && Number.isFinite(foundLng)) {
          goToPoint(foundLat, foundLng, SEARCH_ZOOM);
          // Chỉ điền ô địa chỉ khi đang trống — không đè chữ người dùng đã gõ.
          setAddress((current) => addressAfterSearch(current, String(first.display_name ?? '')));
          setStatusMsg(null);
        } else {
          setStatusMsg('Không tìm thấy địa điểm phù hợp. Vui lòng thử tìm kiếm khác.');
        }
      } else {
        setStatusMsg('Không tìm thấy địa điểm phù hợp. Vui lòng thử tìm kiếm khác.');
      }
    } catch {
      setStatusMsg('Lỗi kết nối khi tìm kiếm địa chỉ.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleConfirm = () => {
    // Chưa chọn vị trí thì không lưu gì (confirmPick trả false).
    if (confirmPick(coords, address, readOnly, onSave)) onClose();
  };

  if (!isOpen) return null;

  const notice = basemapNotice(basemap);
  const hasAnyText = latText.trim() !== '' || lngText.trim() !== '';
  const confirmEnabled = canConfirmPick(coords, readOnly);

  let hintText = 'Nhấp vào bản đồ hoặc kéo ghim đỏ để di chuyển vị trí.';
  if (!coords) {
    hintText = hasAnyText
      ? 'Tọa độ chưa hợp lệ: vĩ độ từ -90 đến 90, kinh độ từ -180 đến 180.'
      : 'Chưa chọn vị trí. Hãy nhấp vào bản đồ, tìm địa chỉ hoặc dùng GPS để đặt ghim.';
  }

  return (
    <div className="location-picker-overlay" onClick={onClose}>
      <div className="location-picker-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="location-picker-header">
          <div className="location-picker-title-group">
            <div className="location-picker-icon-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <h3 className="location-picker-title">{title}</h3>
              <p className="location-picker-subtitle">{subtitle}</p>
            </div>
          </div>
          <button className="location-picker-close-btn" onClick={onClose} aria-label="Đóng">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Toolbar */}
        {!readOnly && (
          <div className="location-picker-toolbar">
            <form className="location-picker-search-box" onSubmit={handleSearchAddress}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="location-picker-search-input"
                placeholder="Nhập địa chỉ, tỉnh thành, huyện, xã để tìm kiếm..."
                aria-label="Tìm địa chỉ"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="location-picker-search-btn" disabled={isSearching}>
                {isSearching ? 'Tìm...' : 'Tìm'}
              </button>
            </form>

            <button
              type="button"
              className="location-picker-gps-btn"
              onClick={handleGetCurrentGps}
              disabled={gpsLoading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
              {gpsLoading ? 'Đang định vị...' : 'Vị trí GPS của tôi'}
            </button>
          </div>
        )}

        {statusMsg && (
          <div className="location-picker-status" role="status">
            {statusMsg}
          </div>
        )}

        {/* Nút phóng to / thu nhỏ có nhãn chữ, như bản đồ chính */}
        <div className="location-picker-zoom-bar" role="group" aria-label="Điều khiển bản đồ">
          <button type="button" onClick={handleZoomIn} disabled={!mapReady || !!mapError}>
            Phóng to
          </button>
          <button type="button" onClick={handleZoomOut} disabled={!mapReady || !!mapError}>
            Thu nhỏ
          </button>
        </div>

        {/* Map Canvas */}
        <div className="location-picker-map-wrapper">
          <div ref={containerRef} className="location-picker-map-canvas" />

          {!mapError && <MapTilerLogo basemap={basemap} />}

          {!mapError && satelliteAvailable && (
            <div className="wm-kind-toggle" role="group" aria-label="Kiểu nền bản đồ">
              <button
                type="button"
                className={mapKind === 'map' ? 'is-active' : ''}
                aria-pressed={mapKind === 'map'}
                onClick={() => setMapKind('map')}
              >
                Bản đồ
              </button>
              <button
                type="button"
                className={mapKind === 'satellite' ? 'is-active' : ''}
                aria-pressed={mapKind === 'satellite'}
                onClick={() => setMapKind('satellite')}
              >
                Vệ tinh
              </button>
            </div>
          )}

          {mapError && (
            <div className="wm-overlay wm-overlay-error" role="alert">
              <strong>Không hiển thị được bản đồ</strong>
              <span>{mapError}</span>
              <button type="button" className="wm-retry-btn" onClick={() => setRetryNonce((n) => n + 1)}>
                Thử lại
              </button>
            </div>
          )}
        </div>

        {notice && (
          <p className="location-picker-note" role="status">
            {notice}
          </p>
        )}
        {!readOnly && (
          <p className={`location-picker-hint${coords ? '' : ' is-empty'}`} role="status">
            {hintText}
          </p>
        )}

        {/* Coordinates and Address bar */}
        <div className="location-picker-coords-bar">
          <div className="location-picker-field">
            <label htmlFor="location-picker-lat">Vĩ độ (Latitude)</label>
            <input
              id="location-picker-lat"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={latText}
              readOnly={readOnly}
              placeholder="Ví dụ: 16.0544"
              onChange={(e) => setLatText(e.target.value)}
            />
          </div>
          <div className="location-picker-field">
            <label htmlFor="location-picker-lng">Kinh độ (Longitude)</label>
            <input
              id="location-picker-lng"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={lngText}
              readOnly={readOnly}
              placeholder="Ví dụ: 108.2022"
              onChange={(e) => setLngText(e.target.value)}
            />
          </div>
          <div className="location-picker-field">
            <label htmlFor="location-picker-address">Địa chỉ ghi nhận</label>
            <input
              id="location-picker-address"
              type="text"
              value={address}
              readOnly={readOnly}
              placeholder="Nhập địa chỉ mô tả (thôn, xã, huyện, tỉnh...)"
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="location-picker-footer">
          {coords ? (
            <a
              href={getGoogleMapsDirectionUrl(coords.lat, coords.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="location-picker-external-link"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Xem trước & chỉ đường trên Google Maps
            </a>
          ) : (
            <span className="location-picker-external-link is-disabled" aria-disabled="true">
              Xem trước & chỉ đường trên Google Maps (chọn vị trí trước)
            </span>
          )}

          <div className="location-picker-actions">
            <button type="button" className="location-picker-btn cancel" onClick={onClose}>
              {readOnly ? 'Đóng' : 'Hủy bỏ'}
            </button>
            {!readOnly && onSave && (
              <button
                type="button"
                className="location-picker-btn save"
                disabled={!confirmEnabled}
                onClick={handleConfirm}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Xác nhận vị trí
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocationPickerModal;
