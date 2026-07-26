import { useCallback, useEffect, useState } from 'react';

type Setter<T> = (value: T | ((prev: T) => T)) => void;

/**
 * 在 localStorage 中持久化一个键值对，支持函数式更新（如 set(v => !v)）。
 * 用于保存 probe 卡片的 UI 状态（展开/折叠）等不丢失的设置。
 *
 * @param key localStorage key（建议用模块名 + 卡片名）
 * @param defaultValue 默认值
 */
export function usePersistentState<T>(key: string, defaultValue: T): [T, Setter<T>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch { /* ignore parse errors */ }
    return defaultValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* quota exceeded */ }
  }, [key, value]);

  const set: Setter<T> = useCallback(
    (next) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch { /* noop */ }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}