import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap, Popup as MapLibrePopup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  DEFAULT_VISIBLE_CATEGORY,
  MARKER_ICON_COLOR,
  MARKER_ICON_IDS,
  buildLegend,
  buildPopupModel,
  buildFitBoundsOptions,
  computeDefaultViewport,
  filterPointsByCategory,
  formatMapStats,
  hasUsableSize,
  renderPopupHtml,
  toFeatureCollection,
  type DefaultViewport,
  type MapPointCategory,
  type PointFeatureProperties,
  type WorldMapPoint,
} from './worldMapData';
import {
  CLUSTER_FLY_DURATION_MS,
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS,
  CLUSTER_SIZE_STEPS,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  ICON_SIZE_BASE,
  ICON_SIZE_HOVER,
  LAYER_CLUSTERS,
  LAYER_CLUSTER_COUNT,
  LAYER_CLUSTER_HALO,
  LAYER_HOVER_ICON,
  LAYER_POINTS,
  LAYER_SELECTED_HALO,
  SOURCE_HOVER_ID,
  SOURCE_ID,
  SOURCE_SELECTED_ID,
  basemapNotice,
  sanitizeMapError,
} from './mapStyle';
import { loadMapLibre } from './loadMapLibre';
import { useBasemap } from './useBasemap';
import { MapTilerLogo } from './MapTilerLogo';
import { MARKER_PIXEL_RATIO, buildMarkerIconSvg, loadMarkerImage } from './markerIcons';
import './WorldMapView.css';

export interface WorldMapViewProps {
  /** Điểm cần hiển thị (địa điểm dòng họ, mộ phần...). Bản đồ không tự lấy dữ liệu. */
  points: readonly WorldMapPoint[];
  loading?: boolean;
  /** Chiều cao khung bản đồ. Để trống thì dùng mặc định co giãn trong CSS (.wm-stage): khoảng min(72vh,700px)
   * trên desktop, khoảng 460-520px trên điện thoại (≤640px) — đủ cao để khung Việt Nam gọn, dễ nhìn cho người
   * lớn tuổi. Chỉ truyền prop này khi thật sự cần một chiều cao cố định khác mặc định. */
  height?: number | string;
  className?: string;
  /** Thông báo khi không có điểm nào. */
  emptyMessage?: string;
  /** Tiêu đề khối bản đồ; mặc định "Bản đồ thế giới". Thống kê "N mộ phần" tự tính, nối sau tiêu đề. */
  title?: string;
  /** Có thì mới hiện nút "Thử lại" ở trạng thái rỗng (ví dụ gọi lại API tải dữ liệu từ nơi dùng). */
  onRetry?: () => void;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Zoom dùng cho trường hợp khung nhìn suy biến về đúng 1 điểm mà chưa có maxZoom riêng (mộ hải ngoại lẻ). */
const FALLBACK_SINGLE_POINT_ZOOM = 13;

/** Đưa bản đồ về một khung nhìn đã tính sẵn (xem computeDefaultViewport) — dùng khi tải xong, khi đổi dữ liệu
 * mộ phần, và khi bấm "Xem toàn bộ" (cả 3 chỗ phải ra cùng một khung, theo đúng yêu cầu thiết kế).
 *
 * - Chỉ chạy khi khung bản đồ có kích thước thật (width/height >= 1); chưa có thì trả false để nơi gọi đợi
 *   ResizeObserver rồi gọi lại — fitBounds trên khung 0px cho zoom/tâm NaN.
 * - maxBounds (giới hạn kéo quanh Đông Nam Á, chỉ khi mọi mộ trong Việt Nam) được gỡ trước khi fit và đặt lại
 *   SAU khi lần fit này kết thúc (moveend một lần), để fit không bị ép vào khung hẹp. `token` bỏ qua moveend
 *   của lần fit đã bị lần gọi mới hơn thay thế. */
function applyViewport(
  map: MapLibreMap,
  viewport: DefaultViewport,
  animate: boolean,
  token: { current: number },
): boolean {
  const el = map.getContainer();
  const width = el.clientWidth;
  const height = el.clientHeight;
  if (!hasUsableSize(width, height)) return false;

  const run = ++token.current;
  map.setMaxBounds(null);
  map.once('moveend', () => {
    if (token.current === run) map.setMaxBounds(viewport.maxBounds ?? null);
  });

  const duration = animate && !prefersReducedMotion() ? 800 : 0;
  const [[w, s], [e, n]] = viewport.bounds;
  if (w === e && s === n) {
    map.easeTo({ center: [w, s], zoom: viewport.maxZoom ?? FALLBACK_SINGLE_POINT_ZOOM, duration });
    return true;
  }
  map.fitBounds(viewport.bounds, buildFitBoundsOptions(viewport, width, height, duration));
  return true;
}

function isDocumentFullscreenSupported(): boolean {
  const d = document as Document & { webkitFullscreenEnabled?: boolean };
  return Boolean(d.fullscreenEnabled ?? d.webkitFullscreenEnabled);
}

function getFullscreenElement(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

async function requestFullscreen(el: HTMLElement): Promise<void> {
  const e = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  await (e.requestFullscreen ?? e.webkitRequestFullscreen)?.call(e);
}

async function exitFullscreen(): Promise<void> {
  const d = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  await (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d);
}

/**
 * Bản đồ thế giới (MapLibre GL), trọng tâm là MỘ PHẦN: khung nhìn mặc định chỉ tính theo mộ phần (ưu tiên
 * khung Việt Nam khi dữ liệu còn trong nước, về khung Việt Nam khi chưa có mộ nào), mặc định chỉ bật lớp
 * "Mộ phần" trên bản đồ (các địa điểm dòng họ khác bật thêm bằng chip chú giải). Thiết kế cho người dùng lớn
 * tuổi: chữ to, vùng bấm rộng, nút điều khiển có nhãn chữ rõ ràng, không dùng quả địa cầu.
 */
export const WorldMapView: React.FC<WorldMapViewProps> = ({
  points,
  loading = false,
  height,
  className,
  emptyMessage = 'Chưa có địa điểm nào có tọa độ để hiển thị trên bản đồ.',
  title = 'Bản đồ thế giới',
  onRetry,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const pointsRef = useRef<readonly WorldMapPoint[]>(points);
  pointsRef.current = points;
  const hiddenRef = useRef<Set<MapPointCategory>>(new Set());
  const pulseStopRef = useRef<() => void>(() => {});
  const fitTokenRef = useRef({ current: 0 }).current;
  const initialFitDoneRef = useRef(false);

  const [mapError, setMapError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  // Mặc định chỉ bật lớp Mộ phần — các địa điểm dòng họ khác bắt đầu ở trạng thái tắt, bật thêm bằng chip.
  const [hiddenCategories, setHiddenCategories] = useState<Set<MapPointCategory>>(
    () => new Set(CATEGORY_ORDER.filter((c) => c !== DEFAULT_VISIBLE_CATEGORY)),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { basemap, reportStyleFailure, mapKind, setMapKind, satelliteAvailable } = useBasemap();
  const styleUrl = basemap.styleUrl;
  const basemapProvider = basemap.provider;
  const notice = basemapNotice(basemap);
  hiddenRef.current = hiddenCategories;

  const hasPoints = points.length > 0;
  const legend = useMemo(() => buildLegend(points), [points]);
  const visiblePoints = useMemo(() => filterPointsByCategory(points, hiddenCategories), [points, hiddenCategories]);
  const statsText = useMemo(() => formatMapStats(visiblePoints), [visiblePoints]);

  // Khung nhìn mặc định CHỈ tính theo mộ phần (không tính các địa điểm dòng họ khác, kể cả khi đang bật xem) —
  // dùng khi tải xong, khi dữ liệu mộ đổi, và khi bấm "Xem toàn bộ".
  const burialPoints = useMemo(() => points.filter((p) => p.kind === 'burial'), [points]);
  const defaultViewport = useMemo(() => computeDefaultViewport(burialPoints), [burialPoints]);
  const defaultViewportRef = useRef(defaultViewport);
  defaultViewportRef.current = defaultViewport;

  const controlsReady = hasPoints && !mapError;

  // Vệ tinh chỉ có khi nền thật là MapTiler — nếu đổi (hoặc bị chuyển sang OpenFreeMap giữa chừng) mà đang chọn
  // vệ tinh thì quay lại "Bản đồ" để không kẹt ở một lựa chọn không còn tác dụng.
  useEffect(() => {
    if (!satelliteAvailable && mapKind === 'satellite') setMapKind('map');
  }, [satelliteAvailable, mapKind, setMapKind]);

  const toggleCategory = useCallback((category: MapPointCategory) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  // Theo dõi trạng thái toàn màn hình của trình duyệt (kể cả thoát bằng Esc, do trình duyệt tự xử lý).
  useEffect(() => {
    const handler = () => setIsFullscreen(getFullscreenElement() === stageRef.current);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: prefersReducedMotion() ? 0 : 300 });
  }, []);
  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: prefersReducedMotion() ? 0 : 300 });
  }, []);
  const handleFitAll = useCallback(() => {
    const map = mapRef.current;
    if (map) applyViewport(map, defaultViewportRef.current, true, fitTokenRef);
  }, []);
  const handleToggleFullscreen = useCallback(() => {
    if (getFullscreenElement()) {
      void exitFullscreen();
    } else if (stageRef.current) {
      void requestFullscreen(stageRef.current);
    }
  }, []);

  // Khởi tạo bản đồ (khi có điểm, hoặc khi đổi nền/kiểu nền, hoặc khi bấm "Thử lại"); dọn (map.remove) khi hết
  // điểm, đổi nền hoặc unmount.
  useEffect(() => {
    if (!hasPoints || !containerRef.current) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let popup: MapLibrePopup | null = null;
    let styleLoaded = false;
    let resizeObserver: ResizeObserver | null = null;
    setMapError(null);

    (async () => {
      try {
        const ml = await loadMapLibre();
        if (cancelled || !containerRef.current) return;

        map = new ml.Map({
          container: containerRef.current,
          style: styleUrl,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          // Attribution phải luôn hiển thị (điều khoản MapTiler/OpenFreeMap): không thu gọn, không tắt.
          attributionControl: { compact: false },
          // Bản đồ phẳng, không xoay/nghiêng — đơn giản, tránh thao tác lạ với người dùng lớn tuổi. Không có
          // nút quả địa cầu (đã bỏ); các nút điều khiển (phóng to/thu nhỏ/toàn màn hình) là nút React có nhãn
          // chữ riêng ở .wm-toolbar, không dùng control gắn sẵn của MapLibre.
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        mapRef.current = map;
        const m = map;
        // Chặn nốt hai đường xoay còn lại: hai ngón tay xoay và phím tắt xoay.
        m.touchZoomRotate.disableRotation();
        m.keyboard.disableRotation();
        initialFitDoneRef.current = false;

        // Registry không hiện lỗi console nếu style tham chiếu icon chưa kịp đăng ký.
        m.on('styleimagemissing', (e) => {
          if (!m.hasImage(e.id)) m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
        });

        m.once('style.load', () => {
          styleLoaded = true;
        });

        const fitInitialViewport = (target: MapLibreMap) => {
          if (initialFitDoneRef.current || !loadedRef.current) return;
          if (applyViewport(target, defaultViewportRef.current, false, fitTokenRef)) initialFitDoneRef.current = true;
        };
        resizeObserver = new ResizeObserver(() => {
          if (!cancelled) fitInitialViewport(m);
        });
        resizeObserver.observe(stageRef.current ?? m.getContainer());

        m.on('load', async () => {
          if (cancelled) return;

          try {
            const icons = await Promise.all(
              MARKER_ICON_IDS.map(async (icon) => {
                const svg = buildMarkerIconSvg(icon, MARKER_ICON_COLOR[icon]);
                const img = await loadMarkerImage(svg);
                return [icon, img] as const;
              }),
            );
            if (cancelled) return;
            for (const [icon, img] of icons) {
              if (!m.hasImage(icon)) m.addImage(icon, img, { pixelRatio: MARKER_PIXEL_RATIO });
            }
          } catch {
            /* styleimagemissing phía trên đã lo trường hợp icon không nạp được: không chặn phần còn lại */
          }

          m.addSource(SOURCE_ID, {
            type: 'geojson',
            data: toFeatureCollection(filterPointsByCategory(pointsRef.current, hiddenRef.current)) as never,
            cluster: true,
            clusterRadius: CLUSTER_RADIUS,
            clusterMaxZoom: CLUSTER_MAX_ZOOM,
          });
          m.addSource(SOURCE_SELECTED_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as never });
          m.addSource(SOURCE_HOVER_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as never });

          // Cụm: quầng mềm (lớp dưới) + lõi đặc tím đậm + viền trắng + số trắng đậm, cỡ lớn dễ đọc. Cụm hỗn hợp
          // địa điểm/mộ phần giữ một màu (donut chia tỷ lệ theo yêu cầu thiết kế là "nếu làm được gọn" — bỏ
          // qua ở đây vì MapLibre circle layer không vẽ được gradient hình quạt gọn gàng).
          const coreRadius = ['step', ['get', 'point_count'], 19, CLUSTER_SIZE_STEPS.medium, 26, CLUSTER_SIZE_STEPS.large, 33];
          const haloRadius = ['step', ['get', 'point_count'], 29, CLUSTER_SIZE_STEPS.medium, 39, CLUSTER_SIZE_STEPS.large, 50];
          m.addLayer({
            id: LAYER_CLUSTER_HALO,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            paint: { 'circle-radius': haloRadius as never, 'circle-color': '#6d28d9', 'circle-opacity': 0.22 },
          });
          m.addLayer({
            id: LAYER_CLUSTERS,
            type: 'circle',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            paint: {
              'circle-radius': coreRadius as never,
              'circle-color': '#5b21b6',
              'circle-stroke-width': 3,
              'circle-stroke-color': '#ffffff',
            },
          });
          m.addLayer({
            id: LAYER_CLUSTER_COUNT,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font': ['Noto Sans Bold'],
              'text-size': 17,
              'text-allow-overlap': true,
            },
            paint: { 'text-color': '#ffffff' },
          });

          // Vòng sáng của điểm đang chọn — nằm dưới icon điểm, nguồn riêng (1 feature) để không phụ thuộc cụm.
          m.addLayer({
            id: LAYER_SELECTED_HALO,
            type: 'circle',
            source: SOURCE_SELECTED_ID,
            paint: { 'circle-radius': 16, 'circle-color': ['get', 'color'], 'circle-opacity': 0.0 },
          });

          // icon-size là layout property: MapLibre KHÔNG cho feature-state trên layout property (chỉ paint),
          // nên "phóng nhẹ khi rê chuột" không thể làm bằng feature-state ở đây (thử là addLayer bị từ chối
          // trong im lặng, bắn qua sự kiện 'error' chứ không throw). Thay bằng lớp riêng LAYER_HOVER_ICON: vẽ
          // đúng icon đó, to hơn, đè lên trên — giống hệt cách làm vòng sáng LAYER_SELECTED_HALO ở trên.
          m.addLayer({
            id: LAYER_POINTS,
            type: 'symbol',
            source: SOURCE_ID,
            filter: ['!', ['has', 'point_count']],
            layout: {
              'icon-image': ['get', 'icon'],
              'icon-size': ICON_SIZE_BASE,
              'icon-anchor': 'bottom',
              'icon-allow-overlap': true,
            },
          });
          m.addLayer({
            id: LAYER_HOVER_ICON,
            type: 'symbol',
            source: SOURCE_HOVER_ID,
            layout: {
              'icon-image': ['get', 'icon'],
              'icon-size': ICON_SIZE_HOVER,
              'icon-anchor': 'bottom',
              'icon-allow-overlap': true,
            },
          });

          let hoveredId: string | number | undefined;
          const hoverSource = () => m.getSource(SOURCE_HOVER_ID) as { setData: (d: unknown) => void } | undefined;
          m.on('mousemove', LAYER_POINTS, (e) => {
            const feature = e.features?.[0];
            if (!feature || feature.id === hoveredId) return;
            hoveredId = feature.id;
            hoverSource()?.setData({
              type: 'FeatureCollection',
              features: [{ type: 'Feature', properties: feature.properties, geometry: feature.geometry }],
            });
          });
          m.on('mouseleave', LAYER_POINTS, () => {
            hoveredId = undefined;
            hoverSource()?.setData({ type: 'FeatureCollection', features: [] });
          });

          m.on('click', LAYER_CLUSTERS, async (e) => {
            const feature = e.features?.[0];
            const clusterId = feature?.properties?.cluster_id as number | undefined;
            const source = m.getSource(SOURCE_ID) as
              | { getClusterExpansionZoom: (id: number) => Promise<number> }
              | undefined;
            if (feature === undefined || clusterId === undefined || !source) return;
            try {
              const zoom = await source.getClusterExpansionZoom(clusterId);
              if (cancelled) return;
              const coords = (feature.geometry as unknown as { coordinates: [number, number] }).coordinates;
              m.easeTo({ center: coords, zoom: zoom + 0.5, duration: prefersReducedMotion() ? 0 : CLUSTER_FLY_DURATION_MS });
            } catch {
              /* bản đồ đã bị dọn giữa chừng: bỏ qua */
            }
          });

          m.on('click', LAYER_POINTS, (e) => {
            const feature = e.features?.[0];
            if (!feature) return;
            const props = feature.properties as unknown as PointFeatureProperties;
            const coords = [...(feature.geometry as unknown as { coordinates: [number, number] }).coordinates] as [
              number,
              number,
            ];
            // Khi bản đồ lặp vòng kinh độ, đưa popup về đúng bản sao đang được bấm.
            while (Math.abs(e.lngLat.lng - coords[0]) > 180) coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
            const model = buildPopupModel({
              category: props.category,
              name: props.name,
              address: props.address,
              latitude: coords[1],
              longitude: coords[0],
              coverPhotoUrl: props.coverPhotoUrl,
              burialDateIso: props.burialDateIso,
            });
            popup?.remove();
            popup = new ml.Popup({ closeButton: true, maxWidth: '320px', offset: 14 })
              .setLngLat(coords)
              .setHTML(renderPopupHtml(model))
              .addTo(m);

            const copyBtn = popup.getElement().querySelector<HTMLButtonElement>('.wm-popup-copy');
            copyBtn?.addEventListener('click', () => {
              const text = copyBtn.dataset.coordinates ?? '';
              const originalLabel = copyBtn.textContent ?? '';
              navigator.clipboard
                ?.writeText(text)
                .then(() => {
                  copyBtn.textContent = 'Đã sao chép ✓';
                  copyBtn.classList.add('wm-popup-copy-done');
                  setTimeout(() => {
                    copyBtn.textContent = originalLabel;
                    copyBtn.classList.remove('wm-popup-copy-done');
                  }, 1800);
                })
                .catch(() => {
                  copyBtn.textContent = 'Không sao chép được';
                  setTimeout(() => {
                    copyBtn.textContent = originalLabel;
                  }, 1800);
                });
            });

            setSelectedId(props.id);
            popup.once('close', () => setSelectedId((current) => (current === props.id ? null : current)));
          });

          for (const layer of [LAYER_CLUSTERS, LAYER_POINTS]) {
            m.on('mouseenter', layer, () => {
              m.getCanvas().style.cursor = 'pointer';
            });
            m.on('mouseleave', layer, () => {
              m.getCanvas().style.cursor = '';
            });
          }

          loadedRef.current = true;
          // Khung có kích thước thật rồi mới fit; chưa thì ResizeObserver bên dưới sẽ fit lần đầu khi có.
          fitInitialViewport(m);
        });
        m.on('error', (ev) => {
          if (cancelled) return;
          if (!styleLoaded) {
            // Lỗi trước khi style tải xong: khóa sai, bị chặn tên miền, mất mạng...
            if (basemapProvider === 'maptiler') {
              reportStyleFailure(); // tự chuyển sang OpenFreeMap, effect này sẽ chạy lại
              return;
            }
            setMapError(sanitizeMapError(ev?.error?.message) || 'Không tải được nền bản đồ.');
            return;
          }
          // Sau khi style đã tải: lỗi tile lẻ (mất mạng tạm thời khi pan/zoom) không cần làm phiền người dùng
          // bằng banner lỗi, NHƯNG không được nuốt hoàn toàn trong im lặng như trước — lỗi cấu hình layer/nguồn
          // (sai biểu thức style...) cũng báo qua đúng sự kiện này, phải còn thấy được ở console khi phát triển.
          console.error('[WorldMapView] MapLibre error:', sanitizeMapError(ev?.error?.message) || ev);
        });
      } catch (err) {
        if (!cancelled) {
          setMapError(sanitizeMapError(err instanceof Error ? err.message : '') || 'Trình duyệt không hỗ trợ WebGL.');
        }
      }
    })();

    return () => {
      cancelled = true;
      loadedRef.current = false;
      initialFitDoneRef.current = false;
      resizeObserver?.disconnect();
      pulseStopRef.current();
      popup?.remove();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hiddenRef/pointsRef/defaultViewportRef cố tình đọc qua ref
  }, [hasPoints, styleUrl, basemapProvider, reportStyleFailure, retryNonce]);

  // Đổi lớp đang bật (chip chú giải) hoặc dữ liệu điểm: chỉ cập nhật marker đang vẽ, KHÔNG động tới khung
  // nhìn — bật/tắt một chip không nên làm camera nhảy.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(SOURCE_ID) as { setData: (d: unknown) => void } | undefined;
    source?.setData(toFeatureCollection(visiblePoints));
  }, [visiblePoints]);

  // Dữ liệu mộ phần đổi thật sự (không phải chỉ bật/tắt chip) -> khung nhìn mặc định có thể đổi, căn lại.
  useEffect(() => {
    const map = mapRef.current;
    // Chưa fit lần đầu (khung chưa có kích thước) thì để ResizeObserver lo — nó đọc defaultViewportRef mới nhất.
    if (!map || !loadedRef.current || !initialFitDoneRef.current) return;
    applyViewport(map, defaultViewport, true, fitTokenRef);
  }, [defaultViewport]);

  // Vòng sáng/pulse của điểm đang chọn (tôn trọng prefers-reduced-motion: tắt hẳn hoạt ảnh, giữ vòng tĩnh).
  useEffect(() => {
    const map = mapRef.current;
    pulseStopRef.current();
    pulseStopRef.current = () => {};
    if (!map || !loadedRef.current) return;

    const source = map.getSource(SOURCE_SELECTED_ID) as { setData: (d: unknown) => void } | undefined;
    const selected = selectedId ? points.find((p) => p.id === selectedId) : undefined;
    if (!source) return;

    if (!selected) {
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const color = CATEGORY_META[selected.category]?.color ?? '#64748b';
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { color },
          geometry: { type: 'Point', coordinates: [selected.longitude, selected.latitude] },
        },
      ],
    });

    if (prefersReducedMotion()) {
      map.setPaintProperty(LAYER_SELECTED_HALO, 'circle-radius', 20);
      map.setPaintProperty(LAYER_SELECTED_HALO, 'circle-opacity', 0.28);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const phase = ((now - start) / 1500) % 1;
      const wave = (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) / 2; // 0..1 mượt
      map.setPaintProperty(LAYER_SELECTED_HALO, 'circle-radius', 15 + wave * 9);
      map.setPaintProperty(LAYER_SELECTED_HALO, 'circle-opacity', 0.38 - wave * 0.26);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    pulseStopRef.current = () => cancelAnimationFrame(raf);
    return () => cancelAnimationFrame(raf);
  }, [selectedId, points]);

  const retryMapError = () => {
    setMapError(null);
    setRetryNonce((n) => n + 1);
  };

  return (
    <div className={`wm-root${className ? ` ${className}` : ''}`}>
      <div className="wm-header">
        <strong className="wm-title">{title}</strong>
        <span className="wm-stats">{statsText}</span>
      </div>

      <div className="wm-toolbar" role="group" aria-label="Điều khiển bản đồ">
        <button type="button" onClick={handleZoomIn} disabled={!controlsReady}>
          Phóng to
        </button>
        <button type="button" onClick={handleZoomOut} disabled={!controlsReady}>
          Thu nhỏ
        </button>
        <button type="button" onClick={handleFitAll} disabled={!controlsReady}>
          Xem toàn bộ
        </button>
        {isDocumentFullscreenSupported() && (
          <button type="button" onClick={handleToggleFullscreen} disabled={!controlsReady}>
            {isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          </button>
        )}
      </div>

      <div ref={stageRef} className="wm-stage" style={height !== undefined ? { height } : undefined}>
        <div ref={containerRef} className="wm-canvas" />

        {hasPoints && !mapError && <MapTilerLogo basemap={basemap} />}

        {hasPoints && !mapError && satelliteAvailable && (
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

        {loading && !hasPoints && (
          <div className="wm-overlay wm-overlay-skeleton" aria-hidden="true">
            <div className="wm-skeleton" />
          </div>
        )}
        {!loading && !hasPoints && (
          <div className="wm-overlay wm-overlay-empty" role="status">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.6" aria-hidden="true">
              <path d="M1 6l7-3 8 3 7-3v15l-7 3-8-3-7 3V6z" />
              <path d="M8 3v15M16 6v15" />
            </svg>
            <strong>Chưa có dữ liệu bản đồ</strong>
            <span>{emptyMessage}</span>
            {onRetry && (
              <button type="button" className="wm-retry-btn" onClick={onRetry}>
                Thử lại
              </button>
            )}
          </div>
        )}
        {mapError && (
          <div className="wm-overlay wm-overlay-error" role="alert">
            <strong>Không hiển thị được bản đồ</strong>
            <span>{mapError}</span>
            <button type="button" className="wm-retry-btn" onClick={retryMapError}>
              Thử lại
            </button>
          </div>
        )}
      </div>

      {notice && hasPoints && (
        <p className="wm-basemap-note" role="status">
          {notice}
        </p>
      )}

      {legend.length > 0 && (
        <ul className="wm-legend" aria-label="Chú giải bản đồ — bấm để ẩn/hiện từng lớp">
          {legend.map((entry) => {
            const isHidden = hiddenCategories.has(entry.category);
            return (
              <li key={entry.category}>
                <button
                  type="button"
                  className={`wm-legend-chip${isHidden ? ' is-off' : ''}`}
                  aria-pressed={!isHidden}
                  onClick={() => toggleCategory(entry.category)}
                  title={isHidden ? `Hiện lại ${entry.label}` : `Ẩn ${entry.label}`}
                >
                  <span className="wm-legend-dot" style={{ background: entry.color }} aria-hidden="true" />
                  {entry.label}
                  <span className="wm-legend-count">{entry.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export type { MapPointCategory };
export default WorldMapView;
