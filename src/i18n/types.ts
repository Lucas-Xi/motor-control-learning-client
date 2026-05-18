/**
 * i18n 基础类型。
 *
 * 设计目标：
 *  - 不引入新依赖（react-intl / i18next 等）；TS 类型保证翻译 key 完备。
 *  - 默认中文 zh-CN；英文 en-US 作为第二语言。
 *  - 每一条翻译 entry 必须同时提供两种语言（TranslationEntry 强制要求）。
 *  - 命名以 namespace 前缀，例如 `shell.brand.title`、`module.motorBasics.title`。
 *
 * 未翻译内容（lessons / walkthroughs / formulas / glossary / faultCases）保持中文，
 * 由 UI 层叠加一个 `(translation pending)` 小字提示。
 */

export type Locale = 'zh-CN' | 'en-US';

export const LOCALES: readonly Locale[] = ['zh-CN', 'en-US'] as const;

export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
};

/** 单条翻译 entry。两种语言都必填，缺一即 TS 报错。 */
export interface TranslationEntry {
  'zh-CN': string;
  'en-US': string;
}

/**
 * 翻译表的结构：namespace -> key -> entry。
 * 实际表定义在 translations.ts，这里通过 satisfies 校验形状，
 * 同时把 key 推导成 `${namespace}.${key}` 联合类型给 t() 使用。
 */
export type TranslationDict = Record<string, Record<string, TranslationEntry>>;

/**
 * 把 translations 的两级 key 摊平成 `namespace.key` 字面量联合类型。
 *
 * 示例：
 *   { shell: { title: {...} }, common: { ok: {...} } }
 *   → 'shell.title' | 'common.ok'
 */
export type FlattenKeys<T extends TranslationDict> = {
  [N in keyof T & string]: {
    [K in keyof T[N] & string]: `${N}.${K}`;
  }[keyof T[N] & string];
}[keyof T & string];
