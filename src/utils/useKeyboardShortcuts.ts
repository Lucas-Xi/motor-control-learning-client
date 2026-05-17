import { useEffect, useRef } from 'react';

/**
 * 全局快捷键描述
 * - key：使用 KeyboardEvent.key 的字面值，如 "Space"（这里特殊处理）/ "ArrowLeft" / "?" / "1" / "f"
 *   （注意：Space 我们对齐 KeyboardEvent.code === 'Space' 做匹配；其他直接比 e.key）
 * - meta：可选修饰键集合，匹配时要求按下集合内全部修饰键，且未按下集合外的修饰键。
 */
export interface Shortcut {
  key: string;
  description: string;
  category: '运行控制' | '导航' | '布局' | '模式' | '帮助';
  handler: (e: KeyboardEvent) => void;
  /** 修饰键，使用 ctrl/shift/alt 字符串 */
  meta?: ('ctrl' | 'shift' | 'alt')[];
}

/** 把 (key, meta) 编码为 lookup 字符串，统一小写避免大小写差异。 */
function encodeKey(key: string, meta?: Shortcut['meta']): string {
  const mods = (meta ?? []).slice().sort().join('+');
  return `${mods}|${key.toLowerCase()}`;
}

/** 取一次 keydown 事件对应的 lookup key，用同样的规则去 map 里查。 */
function eventLookup(e: KeyboardEvent): string {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('ctrl');
  // Shift 仅在键本身是字母/方向键/F 功能键时算作修饰键：
  // 对于 ? ! @ 等"shift+符号"产生的符号字符，shift 是产生字符必需，
  // 不应再要求注册者写 meta:['shift']。原实现导致 '?' 注册键永远匹配不到。
  const shiftIsModifier = /^([A-Za-z]|Arrow.*|F\d+|Home|End|Tab|Enter|PageUp|PageDown)$/.test(e.key);
  if (e.shiftKey && shiftIsModifier) mods.push('shift');
  if (e.altKey) mods.push('alt');
  // Space 走 e.code，因为 e.key 是 ' '（空格）不便于配置
  const rawKey = e.code === 'Space' ? 'Space' : e.key;
  return `${mods.sort().join('+')}|${rawKey.toLowerCase()}`;
}

/** 判断焦点是否在可输入元素内——这种情况下不要拦截按键。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * 全局快捷键注册 hook：
 * - 自动忽略 input/textarea/contentEditable 内的按键
 * - 支持组合键（ctrl/shift/alt）
 * - 不冲突时不阻止默认行为；需要的话 caller 在 handler 里调 e.preventDefault()
 *
 * 实现备注：把 shortcuts 缓存进 ref，listener 只在 mount 时绑定一次，
 * 这样调用方即使每次 render 传新的数组引用也不会反复 add/remove listener。
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]): void {
  const ref = useRef<Shortcut[]>(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const lookup = eventLookup(e);
      // 每次按键重新构建一次 map：列表很小（O(几十)），开销可忽略，
      // 又能保证用 ref 拿到的总是最新 handler。
      for (const s of ref.current) {
        if (encodeKey(s.key, s.meta) === lookup) {
          s.handler(e);
          break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
