import { useCallback } from 'react';
import { translations, type Translations } from './translations';
import type { FlattenKeys, Locale } from './types';
import { useI18nStore } from '../store/i18nStore';

/**
 * 翻译 key 字面量联合类型，例如 `shell.brandTitle` | `common.reset` | …
 *
 * 通过 satisfies + FlattenKeys 推导：缺一键 / 多一键、错写 namespace 都会报错。
 */
export type TKey = FlattenKeys<Translations>;

/**
 * 取出当前 locale 下对应 key 的字符串。
 * 找不到 key 时返回 key 本身（开发态可见，方便排查）。
 *
 * 注意：拆成纯函数让单测 / 非 React 上下文也能用。
 */
export function translate(locale: Locale, key: TKey): string {
  const [ns, k] = key.split('.') as [keyof Translations, string];
  const namespace = translations[ns] as Record<string, { 'zh-CN': string; 'en-US': string }> | undefined;
  if (!namespace) return key;
  const entry = namespace[k];
  if (!entry) return key;
  return entry[locale] ?? entry['zh-CN'] ?? key;
}

/**
 * React 侧 hook：返回 (t, locale, setLocale, toggleLocale)。
 *
 * 用切片选择器订阅，只在 locale 变化时让消费者重渲染。
 * t 用 useCallback 包一层，避免子组件因为 fn 引用每次新建被错误标脏。
 */
export function useI18n() {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const toggleLocale = useI18nStore((s) => s.toggleLocale);

  const t = useCallback((key: TKey) => translate(locale, key), [locale]);

  return { t, locale, setLocale, toggleLocale };
}

/**
 * 非 React 上下文获取当前 locale（用得很少；UI 内请用 useI18n）。
 */
export function getCurrentLocale(): Locale {
  return useI18nStore.getState().locale;
}
