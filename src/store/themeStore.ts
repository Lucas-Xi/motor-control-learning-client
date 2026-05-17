import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

/**
 * 主题状态：默认深色（工程仪表盘），可切换到明色（演示 / 投影 / 打印）。
 * persist 用 localStorage key `compressor-bench-theme`；当 storage 中无值时，
 * ThemeApplier 会在首次挂载时根据系统 `prefers-color-scheme` 决定初值。
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggle: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
    }),
    { name: 'compressor-bench-theme' },
  ),
);
