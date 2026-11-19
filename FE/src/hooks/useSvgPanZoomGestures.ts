import { useRef, type RefObject } from 'react';
import type React from 'react';

export interface PanPoint {
  x: number;
  y: number;
}

export interface SvgPanZoomGestureOptions {
  svgRef: RefObject<SVGSVGElement>;
  pan: PanPoint;
  zoom: number;
  setPan: (pan: PanPoint) => void;
  setZoom: (zoom: number) => void;
  minZoom: number;
  maxZoom: number;
  /** Bật xử lý cảm ứng (thường là isMobile || isTouchDevice). */
  enabled: boolean;
}

/** Ngón tay di chuyển quá khoảng này (px) thì coi là kéo, không phải chạm. */
const TAP_TOLERANCE = 8;

/**
 * Pan 1 ngón + pinch-zoom 2 ngón cho sơ đồ SVG dạng
 * `<g transform="translate(pan.x, pan.y) scale(zoom)">`.
 * Chỉ xử lý pointer cảm ứng/bút; chuột vẫn dùng handler cũ của component.
 */
export function useSvgPanZoomGestures({
  svgRef,
  pan,
  zoom,
  setPan,
  setZoom,
  minZoom,
  maxZoom,
  enabled,
}: SvgPanZoomGestureOptions) {
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  panRef.current = pan;
  zoomRef.current = zoom;

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    lastUser: PanPoint | null;
    startDist: number;
    startZoom: number;
    contentAnchor: PanPoint | null;
    downX: number;
    downY: number;
    moved: boolean;
  }>({ lastUser: null, startDist: 0, startZoom: 1, contentAnchor: null, downX: 0, downY: 0, moved: false });
  const suppressClickRef = useRef(false);

  const toUser = (clientX: number, clientY: number): PanPoint | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const res = pt.matrixTransform(ctm.inverse());
    return { x: res.x, y: res.y };
  };

  const applyPan = (next: PanPoint) => {
    panRef.current = next;
    setPan(next);
  };

  const startSinglePan = () => {
    const [p] = Array.from(pointersRef.current.values());
    gestureRef.current.lastUser = p ? toUser(p.x, p.y) : null;
    gestureRef.current.contentAnchor = null;
  };

  const startPinch = () => {
    const [a, b] = Array.from(pointersRef.current.values());
    const mid = toUser((a.x + b.x) / 2, (a.y + b.y) / 2);
    const g = gestureRef.current;
    g.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    g.startZoom = zoomRef.current;
    g.contentAnchor = mid
      ? { x: (mid.x - panRef.current.x) / zoomRef.current, y: (mid.y - panRef.current.y) / zoomRef.current }
      : null;
    g.lastUser = null;
  };

  const isGesturePointer = (e: React.PointerEvent) => enabled && e.pointerType !== 'mouse';

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isGesturePointer(e)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      suppressClickRef.current = false;
      gestureRef.current.moved = false;
      gestureRef.current.downX = e.clientX;
      gestureRef.current.downY = e.clientY;
      startSinglePan();
    } else if (pointersRef.current.size === 2) {
      gestureRef.current.moved = true;
      startPinch();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isGesturePointer(e) || !pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;

    if (pointersRef.current.size === 1) {
      if (!g.moved && Math.hypot(e.clientX - g.downX, e.clientY - g.downY) > TAP_TOLERANCE) {
        g.moved = true;
      }
      const now = toUser(e.clientX, e.clientY);
      if (now && g.lastUser) {
        applyPan({ x: panRef.current.x + (now.x - g.lastUser.x), y: panRef.current.y + (now.y - g.lastUser.y) });
      }
      g.lastUser = now;
      return;
    }

    if (pointersRef.current.size >= 2 && g.contentAnchor) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, g.startZoom * (dist / g.startDist)));
      const mid = toUser((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (!mid) return;
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      applyPan({ x: mid.x - g.contentAnchor.x * nextZoom, y: mid.y - g.contentAnchor.y * nextZoom });
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (!pointersRef.current.delete(e.pointerId)) return;
    if (pointersRef.current.size === 0) {
      if (gestureRef.current.moved) suppressClickRef.current = true;
    } else if (pointersRef.current.size === 1) {
      startSinglePan();
    } else {
      startPinch();
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
    },
    style: enabled ? ({ touchAction: 'none' } as React.CSSProperties) : undefined,
  };
}

export default useSvgPanZoomGestures;
