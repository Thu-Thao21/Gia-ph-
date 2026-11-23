import { useLayoutEffect, useRef, type RefObject } from 'react';
import type React from 'react';
import { useLongPress } from '../../../hooks/useLongPress';

export const TOUCH_MIN_ZOOM = 0.35;
export const TOUCH_MAX_ZOOM = 2.0;

/** Ngón tay di chuyển quá khoảng này (px) thì coi là kéo, không phải chạm. */
const TAP_TOLERANCE = 8;

interface Options {
  viewportRef: RefObject<HTMLDivElement>;
  innerRef: RefObject<HTMLDivElement>;
  zoomScale: number;
  onZoomChange?: (next: number) => void;
  enabled: boolean;
}

interface Anchor {
  /** Toạ độ nội dung (chưa scale) cần giữ cố định. */
  ux: number;
  uy: number;
  /** Vị trí trong khung nhìn (px) mà điểm nội dung đó phải nằm dưới. */
  vx: number;
  vy: number;
}

const clampZoom = (z: number) => Math.min(TOUCH_MAX_ZOOM, Math.max(TOUCH_MIN_ZOOM, z));

/**
 * Cử chỉ cảm ứng cho ErgoTreeCanvas (khung cuộn gốc + `transform: scale` với origin top-left):
 * - 1 ngón: kéo cuộn khung.
 * - 2 ngón: pinch-zoom quanh trung điểm hai ngón.
 * - Nhấn giữ 500ms trên thẻ người: phát sự kiện `contextmenu` lên thẻ đó, nên
 *   chạy đúng handler onContextMenu sẵn có (kể cả thẻ vợ/chồng).
 * Chuột không bị ảnh hưởng (pointerType === 'mouse' bị bỏ qua).
 */
export function useTreeTouchGestures({ viewportRef, innerRef, zoomScale, onZoomChange, enabled }: Options) {
  const zoomRef = useRef(zoomScale);
  /** Scale đang thực sự áp dụng trên DOM (cập nhật sau render). */
  const appliedScaleRef = useRef(zoomScale);
  const pendingAnchorRef = useRef<Anchor | null>(null);
  /** Báo cho effect tự căn giữa biết lần đổi zoom này đến từ cử chỉ, không được căn lại. */
  const skipAutoCenterRef = useRef(false);

  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef({
    mode: 'none' as 'none' | 'pan' | 'pinch',
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    startDist: 1,
    startScale: 1,
    ux: 0,
    uy: 0,
    moved: false,
  });
  const suppressClickRef = useRef(false);
  const syntheticContextMenuRef = useRef(false);

  zoomRef.current = zoomScale;

  // Sau khi scale mới được render, chỉnh scroll để điểm neo nằm đúng chỗ.
  useLayoutEffect(() => {
    appliedScaleRef.current = zoomScale;
    const anchor = pendingAnchorRef.current;
    const viewport = viewportRef.current;
    const inner = innerRef.current;
    if (!anchor || !viewport || !inner) return;
    pendingAnchorRef.current = null;
    viewport.scrollLeft = inner.offsetLeft + anchor.ux * zoomScale - anchor.vx;
    viewport.scrollTop = inner.offsetTop + anchor.uy * zoomScale - anchor.vy;
  }, [zoomScale, viewportRef, innerRef]);

  const toViewport = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current!;
    const rect = viewport.getBoundingClientRect();
    return { vx: clientX - rect.left - viewport.clientLeft, vy: clientY - rect.top - viewport.clientTop };
  };

  /** Điểm nội dung (chưa scale) đang nằm dưới toạ độ màn hình. */
  const contentPointAt = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current!;
    const inner = innerRef.current!;
    const { vx, vy } = toViewport(clientX, clientY);
    const s = appliedScaleRef.current;
    return {
      ux: (vx + viewport.scrollLeft - inner.offsetLeft) / s,
      uy: (vy + viewport.scrollTop - inner.offsetTop) / s,
      vx,
      vy,
    };
  };

  /** Đổi scale và giữ điểm nội dung (ux, uy) nằm dưới (vx, vy). */
  const setScaleWithAnchor = (nextScale: number, anchor: Anchor) => {
    const next = clampZoom(nextScale);
    const viewport = viewportRef.current;
    const inner = innerRef.current;
    if (!viewport || !inner) return;
    if (!onZoomChange || Math.abs(next - zoomRef.current) < 0.001) {
      // Scale không đổi: chỉ cần dịch scroll ngay.
      if (!pendingAnchorRef.current) {
        viewport.scrollLeft = inner.offsetLeft + anchor.ux * appliedScaleRef.current - anchor.vx;
        viewport.scrollTop = inner.offsetTop + anchor.uy * appliedScaleRef.current - anchor.vy;
      } else {
        pendingAnchorRef.current = anchor;
      }
      return;
    }
    pendingAnchorRef.current = anchor;
    skipAutoCenterRef.current = true;
    zoomRef.current = next;
    onZoomChange(next);
  };

  /** Phóng to / thu nhỏ quanh tâm khung nhìn (dùng cho nút + / −). */
  const zoomBy = (delta: number) => {
    const viewport = viewportRef.current;
    if (!viewport || !innerRef.current) return;
    const rect = viewport.getBoundingClientRect();
    const anchor = contentPointAt(rect.left + viewport.clientWidth / 2, rect.top + viewport.clientHeight / 2);
    setScaleWithAnchor(Math.round((zoomRef.current + delta) * 100) / 100, anchor);
  };

  const longPress = useLongPress<HTMLElement>((card, point) => {
    gestureRef.current.mode = 'none';
    suppressClickRef.current = true;
    syntheticContextMenuRef.current = true;
    try {
      card.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: point.clientX,
          clientY: point.clientY,
          view: window,
        })
      );
    } finally {
      syntheticContextMenuRef.current = false;
    }
    try {
      navigator.vibrate?.(12);
    } catch {
      /* một số trình duyệt chặn vibrate */
    }
  });

  const startPan = (x: number, y: number) => {
    const viewport = viewportRef.current!;
    const g = gestureRef.current;
    g.mode = 'pan';
    g.startX = x;
    g.startY = y;
    g.startScrollLeft = viewport.scrollLeft;
    g.startScrollTop = viewport.scrollTop;
  };

  const startPinch = () => {
    const [a, b] = Array.from(pointersRef.current.values());
    const g = gestureRef.current;
    const mid = contentPointAt((a.x + b.x) / 2, (a.y + b.y) / 2);
    g.mode = 'pinch';
    g.moved = true;
    g.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    g.startScale = zoomRef.current;
    g.ux = mid.ux;
    g.uy = mid.uy;
  };

  const isGesturePointer = (e: React.PointerEvent) =>
    enabled && e.pointerType !== 'mouse' && Boolean(viewportRef.current && innerRef.current);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isGesturePointer(e)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      suppressClickRef.current = false;
      gestureRef.current.moved = false;
      startPan(e.clientX, e.clientY);
      const target = e.target as HTMLElement;
      const card = target.closest('.tree-person-card') as HTMLElement | null;
      if (card && !target.closest('button, a')) {
        longPress.begin(card, e.clientX, e.clientY);
      }
    } else if (pointersRef.current.size === 2) {
      longPress.cancel();
      startPinch();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isGesturePointer(e) || !pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    longPress.move(e.clientX, e.clientY);
    const g = gestureRef.current;
    const viewport = viewportRef.current!;

    if (g.mode === 'pan') {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) > TAP_TOLERANCE) g.moved = true;
      if (g.moved) {
        viewport.scrollLeft = g.startScrollLeft - dx;
        viewport.scrollTop = g.startScrollTop - dy;
      }
    } else if (g.mode === 'pinch' && pointersRef.current.size >= 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const { vx, vy } = toViewport((a.x + b.x) / 2, (a.y + b.y) / 2);
      setScaleWithAnchor(g.startScale * (dist / g.startDist), { ux: g.ux, uy: g.uy, vx, vy });
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (!pointersRef.current.delete(e.pointerId)) return;
    longPress.cancel();
    const g = gestureRef.current;
    if (pointersRef.current.size === 0) {
      if (g.moved) suppressClickRef.current = true;
      g.mode = 'none';
    } else if (pointersRef.current.size === 1 && g.mode === 'pinch') {
      const [p] = Array.from(pointersRef.current.values());
      startPan(p.x, p.y);
    }
  };

  /** Chặn click sau khi kéo / pinch / nhấn giữ. */
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  /** Chặn menu ngữ cảnh gốc của trình duyệt (Android) khi đang chạm; menu do long-press phát ra vẫn đi qua. */
  const onContextMenuCapture = (e: React.MouseEvent) => {
    if (!enabled || syntheticContextMenuRef.current) return;
    if (pointersRef.current.size > 0) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
      onContextMenuCapture,
    },
    zoomBy,
    skipAutoCenterRef,
  };
}

export default useTreeTouchGestures;
