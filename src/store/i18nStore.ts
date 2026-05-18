import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from '../i18n/types';
import { LOCALES } from '../i18n/types';

/**
 * 语言切换 store。
 *
 * 设计：
 *  - 用 zustand persist 持久化到 localStorage key `compressor-bench-locale`。
 *  - 首次启动按 navigator.language 检测：以 'en' 开头的浏览器默认英文，否则中文。
 *  - 仅一个全局单例；UI 通过 useI18n() hook 订阅切片，避免整树重渲染。
 *  - 不依赖 React Context，减少 Provider 缠绕。
 */

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

/** 浏览器首次启动时的默认语言。 */
function detectDefaultLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN';
  const lang = (navigator.language || 'zh-CN').toLowerCase();
  if (lang.startsWith('en')) return 'en-US';
  return 'zh-CN';
}

function isValidLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set, get) => ({
      locale: detectDefaultLocale(),
      setLocale: (locale) => {
        if (!isValidLocale(locale)) return;
        set({ locale });
      },
      toggleLocale: () => {
        const current = get().locale;
        set({ locale: current === 'zh-CN' ? 'en-US' : 'zh-CN' });
      },
    }),
    {
      name: 'compressor-bench-locale',
      version: 1,
      partialize: (state) => ({ locale: state.locale }) as Partial<I18nState>,
    },
  ),
);
