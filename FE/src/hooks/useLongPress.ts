import { useCallback, useEffect, useRef } from 'react';

export interface LongPressPoint {
  clientX: number;
  clientY: number;
}

export interface LongPressOptions {
  /** Thời gian giữ (ms) trước khi kích hoạt. Mặc định 500. */
  delay?: number;
  /** Ngón tay di chuyển quá khoảng này (px) thì huỷ. Mặc định 8. */
  moveTolerance?: number;
}

/**
 * Nhấn giữ trên màn hình cảm ứng.
 * - `begin(target, x, y)` khi đặt ngón tay, `move(x, y)` khi di chuyển, `cancel()` khi nhấc / huỷ.
 * - `firedRef.current` = true nếu lần nhấn hiện tại đã kích hoạt long-press
 *   (dùng để chặn sự kiện click xảy ra ngay sau đó).
 */
export function useLongPress<T = Element>(
  onLongPress: (target: T, point: LongPressPoint) => void,
  { delay = 500, moveTolerance = 8 }: LongPressOptions = {}
) {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<LongPressPoint | null>(null);
  const firedRef = useRef(false);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
  }, []);

  const begin = useCallback(
    (target: T, clientX: number, clientY: number) => {
      cancel();
      firedRef.current = false;
      startRef.current = { clientX, clientY };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        callbackRef.current(target, { clientX, clientY });
      }, delay);
    },
    [cancel, delay]
  );

  const move = useCallback(
    (clientX: number, clientY: number) => {
      const start = startRef.current;
      if (!start || timerRef.current === null) return;
      if (Math.hypot(clientX - start.clientX, clientY - start.clientY) > moveTolerance) {
        cancel();
      }
    },
    [cancel, moveTolerance]
  );

  useEffect(() => cancel, [cancel]);

  return { begin, move, cancel, firedRef };
}

export default useLongPress;
