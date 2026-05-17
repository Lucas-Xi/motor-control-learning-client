import { useEffect, useRef } from 'react';
import { useThemeStore } from '../../store/themeStore';

const STORAGE_KEY = 'compressor-bench-theme';

/**
 * 把 themeStore.theme 同步到 <html> 的 class（`light` / 无）。
 * 渲染 null。挂载时若 localStorage 还没存过主题，则按系统 prefers-color-scheme 决定一次。
 */
export function ThemeApplier() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const initializedRef = useRef(false);

  // 首次挂载：仅当用户没显式选过主题时，跟随系统首选项
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let hasPersisted = false;
    try {
      hasPersisted = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      hasPersisted = false;
    }

    if (!hasPersisted && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      if (prefersLight) {
        setTheme('light');
      }
    }
    // 立即同步一次（即使 theme 还是默认值，也确保 class 状态正确）
    syncDocumentClass(useThemeStore.getState().theme);
  }, [setTheme]);

  // theme 变化 → 切换 <html class>
  useEffect(() => {
    syncDocumentClass(theme);
  }, [theme]);

  return null;
}

function syncDocumentClass(theme: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
  } else {
    root.classList.remove('light');
  }
}

export default ThemeApplier;
