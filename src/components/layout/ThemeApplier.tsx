import { useEffect, useRef } from 'react';
import { useThemeStore, THEME_ORDER, type Theme } from '../../store/themeStore';

const STORAGE_KEY = 'compressor-bench-theme';

/** 主题 → <html> 上的 class 名（dark 态无 class）。 */
const THEME_CLASSES: Record<Theme, string | null> = {
  dark: null,
  light: 'light',
  'high-contrast': 'high-contrast',
  projector: 'projector',
  colorblind: 'colorblind',
};

const ALL_CLASSES = (Object.values(THEME_CLASSES).filter(Boolean) as string[]);

/**
 * 把 themeStore.theme 同步到 <html> 的 class（互斥应用 light / high-contrast / projector）。
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

    // 校验持久化值合法：旧版本写过 'dark'/'light'，新增的两个主题来自当前会话；
    // 若读出非法值（比如手动改过 storage），回落到 dark
    const persisted = useThemeStore.getState().theme;
    if (!THEME_ORDER.includes(persisted)) {
      setTheme('dark');
    } else if (!hasPersisted && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      if (prefersLight) setTheme('light');
    }
    syncDocumentClass(useThemeStore.getState().theme);
  }, [setTheme]);

  useEffect(() => {
    syncDocumentClass(theme);
  }, [theme]);

  return null;
}

function syncDocumentClass(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  // 先清掉所有非默认 class，再贴上当前主题对应的
  for (const cls of ALL_CLASSES) root.classList.remove(cls);
  const next = THEME_CLASSES[theme];
  if (next) root.classList.add(next);
}

export default ThemeApplier;
