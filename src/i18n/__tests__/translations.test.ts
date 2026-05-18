import { describe, expect, it } from 'vitest';
import { translations } from '../translations';
import { LOCALES, type Locale } from '../types';

/**
 * 翻译完备性单测。
 *
 * 保护点：
 *  (a) 每个 key 同时具备 zh-CN 和 en-US 值，且非空。
 *  (b) en-US 值禁止出现中文字符（CJK Unified Ideographs / 全角标点 / 拼音注音）—— 避免"漏翻"。
 *      允许个别 ASCII / 标点 / 公式符号通过（θ θe ω …）。
 */

const CJK_RE = /[一-鿿　-〿＀-￯]/;

describe('translations completeness', () => {
  it('every key has zh-CN and en-US entries', () => {
    for (const [ns, dict] of Object.entries(translations)) {
      for (const [key, entry] of Object.entries(dict)) {
        for (const loc of LOCALES) {
          const value = (entry as Record<Locale, string>)[loc];
          expect(value, `${ns}.${key} missing ${loc}`).toBeTruthy();
          expect(typeof value, `${ns}.${key}.${loc} not string`).toBe('string');
          expect(value.trim().length, `${ns}.${key}.${loc} blank`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('en-US values contain no CJK characters (untranslated leak detection)', () => {
    const leaks: string[] = [];
    for (const [ns, dict] of Object.entries(translations)) {
      for (const [key, entry] of Object.entries(dict)) {
        const en = (entry as Record<Locale, string>)['en-US'];
        if (CJK_RE.test(en)) leaks.push(`${ns}.${key} → "${en}"`);
      }
    }
    expect(leaks, `Untranslated leak: ${leaks.join(', ')}`).toEqual([]);
  });

  it('zh-CN values are non-empty (sanity)', () => {
    for (const [ns, dict] of Object.entries(translations)) {
      for (const [key, entry] of Object.entries(dict)) {
        const zh = (entry as Record<Locale, string>)['zh-CN'];
        expect(zh.length, `${ns}.${key} zh-CN blank`).toBeGreaterThan(0);
      }
    }
  });
});
