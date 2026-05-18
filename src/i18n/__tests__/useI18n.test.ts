import { beforeEach, describe, expect, it } from 'vitest';
import { useI18nStore } from '../../store/i18nStore';
import { getCurrentLocale, translate } from '../useI18n';

/**
 * useI18n 行为单测（不依赖 React 渲染，直接测语义层）。
 *
 * 保护点：
 *  (d) useI18n 在 locale 切换时 t() 返回的字符串同步更新（通过 translate + getCurrentLocale 验证）。
 *
 * 真实组件挂载验证通过 e2e + 截图覆盖；这里只锁定 hook 内部依赖的纯函数对 locale 变更的响应。
 */

describe('useI18n hook semantics', () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: 'zh-CN' });
  });

  it('getCurrentLocale tracks store state', () => {
    expect(getCurrentLocale()).toBe('zh-CN');
    useI18nStore.getState().setLocale('en-US');
    expect(getCurrentLocale()).toBe('en-US');
  });

  it('translate(getCurrentLocale(), key) returns the right value after each switch', () => {
    const key = 'shell.actionRun';
    expect(translate(getCurrentLocale(), key)).toBe('运行');
    useI18nStore.getState().toggleLocale();
    expect(translate(getCurrentLocale(), key)).toBe('Run');
    useI18nStore.getState().toggleLocale();
    expect(translate(getCurrentLocale(), key)).toBe('运行');
  });

  it('zustand subscribe fires when locale changes (subscription pipeline OK)', () => {
    const seen: string[] = [];
    const unsubscribe = useI18nStore.subscribe((state) => {
      seen.push(state.locale);
    });
    useI18nStore.getState().setLocale('en-US');
    useI18nStore.getState().setLocale('zh-CN');
    useI18nStore.getState().setLocale('en-US');
    unsubscribe();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe('en-US');
  });

  it('unknown key gracefully returns key itself (no crash)', () => {
    // 故意传一个不存在的 key（用 cast 绕过类型）
    const fake = 'shell.thisKeyDoesNotExist' as unknown as 'shell.actionRun';
    expect(translate('zh-CN', fake)).toBe('shell.thisKeyDoesNotExist');
    expect(translate('en-US', fake)).toBe('shell.thisKeyDoesNotExist');
  });
});
