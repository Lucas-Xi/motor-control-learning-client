import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 4 态主题：
 *  - dark           工程仪表盘（默认）
 *  - light          打印 / 普通日光环境
 *  - high-contrast  视障 / 强反差：纯黑底 + 纯白字 + 加粗 2px 边框 + 大字号
 *  - projector      投影到大屏：白底深字 + 大字号 + 加大行距 + 鲜艳 accent
 */
export type Theme = 'dark' | 'light' | 'high-contrast' | 'projector';

export const THEME_ORDER: readonly Theme[] = ['dark', 'light', 'high-contrast', 'projector'] as const;

/** 给定当前主题，返回循环顺序的下一项；外部模块（GlobalKeybindings 等）共用同一份排序。 */
export function nextTheme(current: Theme): Theme {
  const idx = THEME_ORDER.indexOf(current);
  if (idx < 0) return THEME_ORDER[0];
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** 在 dark → light → high-contrast → projector → dark 之间循环。 */
  cycleTheme: () => void;
  /** @deprecated 兼容旧代码，等价 cycleTheme。 */
  toggle: () => void;
}

/**
 * 主题状态：默认深色（工程仪表盘）。
 * persist 用 localStorage key `compressor-bench-theme`；当 storage 中无值时，
 * ThemeApplier 会在首次挂载时根据系统 `prefers-color-scheme` 决定是否切到 light。
 *
 * 旧版本只有 'dark'/'light'，老用户从 storage 读出仍然兼容（联合类型放宽，
 * 加载时 ThemeApplier 会做合法性检查）。
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => set({ theme: nextTheme(get().theme) }),
      toggle: () => set({ theme: nextTheme(get().theme) }),
    }),
    { name: 'compressor-bench-theme' },
  ),
);
