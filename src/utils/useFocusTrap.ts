import { useEffect, type RefObject } from 'react';

/**
 * 可聚焦元素 CSS 选择器（Section 508 §1194.22(n) + WCAG 2.4.3 Focus Order）。
 *
 * 把所有键盘可达的交互元素枚举出来；后续 trapFocusableElements() 用它扫
 * 容器内部，跳过 disabled / aria-hidden / display:none / tabindex=-1。
 *
 * 注意：iframe/audio/video 默认 tabindex=0，所以也算进来；svg[tabindex="0"]
 * 是我们自定义的拖拽 SVG（VectorPlane / PhDiagram），它们的键盘等价已通过
 * onKeyDown 处理 ←→↑↓，对 focus trap 来说它们就是普通可聚焦节点。
 */
const FOCUSABLE_SELECTORS = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * 列出容器里所有当前"实际可聚焦"的元素（考虑可见性 / disabled / aria-hidden）。
 * 抽成模块级函数方便在没有真实 DOM 的 Vitest node 环境下单测——传入一个
 * mock 容器就行。
 */
export function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
  return nodes.filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // 部分实现里隐藏元素 offsetParent 是 null（display:none 或祖先 hidden）。
    // 在 jsdom / Node 环境下 offsetParent 不可靠，因此只在 typeof 检查通过时用。
    if (typeof (el as HTMLElement).offsetParent !== 'undefined' && (el as HTMLElement).offsetParent === null) {
      // role="dialog" 容器自身可能没 layout box，跳过这层判断
      const cs = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
        ? window.getComputedStyle(el)
        : null;
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    }
    return true;
  });
}

/**
 * 计算"Tab / Shift+Tab 在 [first, last] 闭环里下一个落点"。
 * 提取成纯函数，方便单测覆盖 wrap / 空数组 / 焦点不在容器内 等所有分支。
 *
 * 返回 null 表示不应阻止默认 Tab（让浏览器自己处理，例如容器内只有 1 个可聚焦元素时
 * 也保持在它身上）。
 */
export function nextFocusInTrap(
  focusables: HTMLElement[],
  current: HTMLElement | null,
  reverse: boolean,
): HTMLElement | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  // 容器只有一个节点：始终保持在该节点，不让 Tab 跳出
  if (focusables.length === 1) return first;
  // 焦点不在容器里：把焦点拉到首 / 尾
  if (!current || !focusables.includes(current)) {
    return reverse ? last : first;
  }
  if (reverse) {
    return current === first ? last : focusables[focusables.indexOf(current) - 1];
  }
  return current === last ? first : focusables[focusables.indexOf(current) + 1];
}

/**
 * 自实现的 modal focus trap（Section 508 §1194.22(o) / WCAG 2.1.2 No Keyboard Trap
 * 的合规要求："键盘陷阱"特指无法离开的陷阱；对 modal 来说**反过来要求 Tab
 * 不应离开 modal 本身**，否则焦点落到背后元素是辅助技术用户的灾难）。
 *
 * 行为：
 *  - open=true 时：
 *    · 把首个可聚焦元素 focus（modal 刚出现，未指定 autoFocus 时由它兜底）
 *    · 拦截 Tab / Shift+Tab，在容器内循环
 *    · 拦截 Esc → 调用 onEscape（可选）
 *  - open=false 时：把焦点还给打开 modal 之前的 trigger（previouslyFocused）
 *
 * 不引入新依赖，纯 DOM API；prefers-reduced-motion 不影响该 hook。
 */
export interface UseFocusTrapOptions {
  /** Esc 键按下时回调；不传则不拦 Esc，由组件自己处理。 */
  onEscape?: () => void;
  /** open 切换到 true 时是否自动把焦点拉进 modal 首个可聚焦元素；默认 true。 */
  autoFocusFirst?: boolean;
}

export function useFocusTrap<T extends HTMLElement>(
  open: boolean,
  containerRef: RefObject<T | null>,
  options: UseFocusTrapOptions = {},
): void {
  const { onEscape, autoFocusFirst = true } = options;

  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    const container = containerRef.current;
    if (!container) return;

    // 记录打开 modal 之前的焦点，关闭时把焦点还回去（Section 508 §1194.22(o) 推荐做法）
    const previouslyFocused = (document.activeElement as HTMLElement | null) ?? null;

    if (autoFocusFirst) {
      // 微延迟一帧，让 modal 入场动画 / Suspense 完成 layout 再 focus
      // 否则 framer-motion 的 initial={{opacity:0}} 可能让首元素不可见，focus 失败
      const id = window.setTimeout(() => {
        const focusables = getFocusableElements(container);
        // 若容器里已有 autoFocus 节点（输入框），让它优先
        const alreadyHasFocus = container.contains(document.activeElement);
        if (!alreadyHasFocus && focusables[0]) {
          try { focusables[0].focus(); } catch { /* noop */ }
        }
      }, 30);
      // 清理 timeout（unmount 或 open 切回 false）
      const cleanup = () => window.clearTimeout(id);
      // 注：handler 的 cleanup 在 useEffect 结尾统一返回，这里我们让 timeout 自然走完
      // 但保留 cleanup 句柄给闭包后续可能的取消（实际由 onKey listener 移除即可）。
      // 为了不引入多个 return，把 cleanup 放到 useEffect 返回里。
      // —— 见下面 onKey listener 的 cleanup。
      (container as unknown as { __focusTrapCleanup?: () => void }).__focusTrapCleanup = cleanup;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        // modal 内没东西可聚焦：拦截 Tab 防止焦点跑到背后
        e.preventDefault();
        return;
      }
      const next = nextFocusInTrap(
        focusables,
        document.activeElement as HTMLElement | null,
        e.shiftKey,
      );
      if (next) {
        e.preventDefault();
        try { next.focus(); } catch { /* noop */ }
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const cleanup = (container as unknown as { __focusTrapCleanup?: () => void }).__focusTrapCleanup;
      if (typeof cleanup === 'function') {
        cleanup();
        (container as unknown as { __focusTrapCleanup?: () => void }).__focusTrapCleanup = undefined;
      }
      // 把焦点还给打开 modal 前的元素（若它还在 DOM 里）
      if (previouslyFocused && document.contains(previouslyFocused)) {
        try { previouslyFocused.focus(); } catch { /* noop */ }
      }
    };
  }, [open, containerRef, onEscape, autoFocusFirst]);
}

export default useFocusTrap;
