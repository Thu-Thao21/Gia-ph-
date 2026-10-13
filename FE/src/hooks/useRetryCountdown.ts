import { useCallback, useEffect, useState } from 'react';

/**
 * Đếm ngược theo header Retry-After (giây) khi BE trả 429.
 * Trong lúc đếm, trang khóa nút gửi và không tự gửi lại.
 */
export function useRetryCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const start = useCallback((seconds: number) => {
    setSecondsLeft(Math.max(0, Math.ceil(seconds)));
  }, []);

  return { secondsLeft, isLocked: secondsLeft > 0, start };
}
