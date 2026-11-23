import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/** Browser-only preview persistence; never use this for credentials or access control. */
export function useLocalPreviewState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(`mfgms.familyAdmin.preview.${key}`);
      return saved ? JSON.parse(saved) as T : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(`mfgms.familyAdmin.preview.${key}`, JSON.stringify(value)); } catch { /* Still usable in this tab. */ }
  }, [key, value]);
  return [value, setValue];
}
