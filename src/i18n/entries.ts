import type { TranslationEntry } from './types';

/**
 * 翻译条目构造器：强制同时提供 zh-CN 与 en-US。
 * 各命名空间文件共享，避免循环依赖。
 */
export function e(zh: string, en: string): TranslationEntry {
  return { 'zh-CN': zh, 'en-US': en };
}
