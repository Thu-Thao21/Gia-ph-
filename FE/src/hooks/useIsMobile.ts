import { useEffect, useState } from 'react';

/** Ba mốc breakpoint duy nhất của dự án (khớp với CSS). */
export const BREAKPOINTS = {
  phone: 480,
  mobile: 768,
  tablet: 1024,
} as const;

const getMatch = (query: string): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
};

/** Trả về true khi media query khớp; tự cập nhật khi đổi kích thước / xoay màn hình. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getMatch(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari < 14
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}

/** Màn hình <= 768px (mốc mobile chính). */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.mobile}px)`);
}

/** Thiết bị mà con trỏ chính là ngón tay (không có hover). */
export function useIsTouchDevice(): boolean {
  return useMediaQuery('(hover: none) and (pointer: coarse)');
}
