import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore, nextTheme, THEME_ORDER, type Theme } from '../themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'dark' });
    try {
      // 清掉 persist 写入的 localStorage，让用例彼此独立（node env 无 localStorage 时静默跳过）
      const storage = globalThis.localStorage as Storage | undefined;
      if (storage && typeof storage.removeItem === 'function') {
        storage.removeItem('compressor-bench-theme');
      }
    } catch {
      /* ignore */
    }
  });

  it('默认主题是 dark', () => {
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('THEME_ORDER 严格按 dark → light → high-contrast → projector', () => {
    expect(THEME_ORDER).toEqual(['dark', 'light', 'high-contrast', 'projector']);
  });

  it('setTheme 直接切到任意 4 态主题', () => {
    const targets: Theme[] = ['light', 'high-contrast', 'projector', 'dark'];
    for (const t of targets) {
      useThemeStore.getState().setTheme(t);
      expect(useThemeStore.getState().theme).toBe(t);
    }
  });

  it('nextTheme 循环序列正确', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('high-contrast');
    expect(nextTheme('high-contrast')).toBe('projector');
    expect(nextTheme('projector')).toBe('dark');
  });

  it('nextTheme 对未知主题回落到 dark（避免脏 storage 卡死）', () => {
    // @ts-expect-error 故意传非法值
    expect(nextTheme('legacy-blue')).toBe('dark');
  });

  it('cycleTheme 4 次回到起点', () => {
    const start = useThemeStore.getState().theme;
    const { cycleTheme } = useThemeStore.getState();
    cycleTheme();
    cycleTheme();
    cycleTheme();
    cycleTheme();
    expect(useThemeStore.getState().theme).toBe(start);
  });

  it('cycleTheme 按 dark → light → high-contrast → projector → dark 推进', () => {
    const seen: Theme[] = [useThemeStore.getState().theme];
    for (let i = 0; i < 4; i++) {
      useThemeStore.getState().cycleTheme();
      seen.push(useThemeStore.getState().theme);
    }
    expect(seen).toEqual(['dark', 'light', 'high-contrast', 'projector', 'dark']);
  });

  it('toggle 兼容老代码：等价于 cycleTheme', () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe('light');
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe('high-contrast');
  });

  it('persist 中间件写入 localStorage（如可用）', () => {
    // node env 无完整 localStorage 接口；只验证：setTheme 后 in-memory state 一定生效，
    // 真正的 storage 同步交给浏览器 e2e（tests/e2e/）验。
    const hasStorage = typeof globalThis.localStorage !== 'undefined'
      && typeof (globalThis.localStorage as Storage | undefined)?.getItem === 'function';
    useThemeStore.getState().setTheme('projector');
    expect(useThemeStore.getState().theme).toBe('projector');
    if (!hasStorage) return;
    const raw = globalThis.localStorage!.getItem('compressor-bench-theme');
    expect(raw).not.toBeNull();
    expect(raw).toContain('projector');
  });
});
