import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { useThemeStore, THEME_ORDER, type Theme } from '../../../store/themeStore';

/**
 * Vitest 当前跑 node 环境，没有 jsdom + RTL，因此用"轻量化静态/逻辑断言"代替真渲染：
 * - ThemeToggle 是合法 function component
 * - store 切换后所有 5 个主题都可以成为"当前态"
 * - aria-pressed/aria-label 通过 ThemeToggle 源码里的 chip 元数据保证（见 META）
 * 真实点击 / 可访问性 + DOM 渲染交给 Playwright e2e（tests/e2e/）保证。
 */

describe('ThemeToggle component module', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'dark' });
  });

  it('导出的 ThemeToggle 是 function component', () => {
    expect(typeof ThemeToggle).toBe('function');
    // function name 保持 ThemeToggle 让 React devtools 显示语义化
    expect(ThemeToggle.name).toBe('ThemeToggle');
  });

  it('5 个 chip 主题分别能成为 store 当前态', () => {
    const targets: Theme[] = [...THEME_ORDER];
    expect(targets).toHaveLength(5);
    for (const t of targets) {
      useThemeStore.setState({ theme: t });
      expect(useThemeStore.getState().theme).toBe(t);
    }
  });

  it('当前态切换 + 还原：cycleTheme 5 次回到起点', () => {
    const before = useThemeStore.getState().theme;
    for (let i = 0; i < THEME_ORDER.length; i++) {
      useThemeStore.getState().cycleTheme();
    }
    expect(useThemeStore.getState().theme).toBe(before);
  });

  it('THEME_ORDER 与 ThemeToggle 的 chip 顺序一一对应（dark → light → high-contrast → projector → colorblind）', () => {
    expect(THEME_ORDER).toEqual(['dark', 'light', 'high-contrast', 'projector', 'colorblind']);
  });
});
