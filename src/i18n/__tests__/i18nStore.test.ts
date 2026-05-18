import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useI18nStore } from '../../store/i18nStore';
import { translate } from '../useI18n';

/**
 * 语言切换 + 持久化单测。
 *
 * 保护点：
 *  (c) setLocale / toggleLocale 切换后 store 状态正确（持久化语义：locale 保留在 store 中并能被
 *      其它 hook 订阅；localStorage 落盘由 zustand persist 中间件保证，需 jsdom 环境）。
 *  (d) translate() 在 locale 切换后返回对应语种字符串。
 */

describe('useI18nStore', () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: 'zh-CN' });
  });

  afterEach(() => {
    useI18nStore.setState({ locale: 'zh-CN' });
  });

  it('setLocale updates state', () => {
    expect(useI18nStore.getState().locale).toBe('zh-CN');
    useI18nStore.getState().setLocale('en-US');
    expect(useI18nStore.getState().locale).toBe('en-US');
    useI18nStore.getState().setLocale('zh-CN');
    expect(useI18nStore.getState().locale).toBe('zh-CN');
  });

  it('setLocale rejects invalid locale (no state change)', () => {
    useI18nStore.getState().setLocale('zh-CN');
    // @ts-expect-error 故意传入非法值
    useI18nStore.getState().setLocale('ja-JP');
    expect(useI18nStore.getState().locale).toBe('zh-CN');
  });

  it('toggleLocale flips between zh-CN and en-US', () => {
    expect(useI18nStore.getState().locale).toBe('zh-CN');
    useI18nStore.getState().toggleLocale();
    expect(useI18nStore.getState().locale).toBe('en-US');
    useI18nStore.getState().toggleLocale();
    expect(useI18nStore.getState().locale).toBe('zh-CN');
  });

  it('translate returns localized string per locale', () => {
    expect(translate('zh-CN', 'shell.brandTitle')).toBe('压缩机变频器控制');
    expect(translate('en-US', 'shell.brandTitle')).toBe('Compressor VFD Control');
    expect(translate('zh-CN', 'common.reset')).toBe('重置');
    expect(translate('en-US', 'common.reset')).toBe('Reset');
  });

  it('translate after setLocale returns matching value', () => {
    useI18nStore.getState().setLocale('en-US');
    const locale = useI18nStore.getState().locale;
    expect(translate(locale, 'shell.modeTeach')).toBe('Teach');
    useI18nStore.getState().setLocale('zh-CN');
    const next = useI18nStore.getState().locale;
    expect(translate(next, 'shell.modeTeach')).toBe('教学');
  });

  it('exposes setLocale and toggleLocale actions on the store API', () => {
    // 防止误删 actions；简单的 API surface 校验。持久化 key 'compressor-bench-locale'
    // 由 zustand persist 中间件在浏览器/jsdom 环境写盘；node 单测不需校验落盘。
    const api = useI18nStore.getState();
    expect(typeof api.setLocale).toBe('function');
    expect(typeof api.toggleLocale).toBe('function');
    expect(typeof api.locale).toBe('string');
  });
});
