import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

interface TabsProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

/** 滑动指示条几何（相对 tablist 内容盒）。ready=false 时隐藏，防首帧错位。 */
interface Indicator {
  left: number;
  width: number;
  ready: boolean;
}

const INITIAL_INDICATOR: Indicator = { left: 0, width: 0, ready: false };

const sameIndicator = (a: Indicator, b: Indicator) =>
  a.left === b.left && a.width === b.width && a.ready === b.ready;

/**
 * 受控分段页签。视觉细节移植自 ReUI（atlas-admin 模板）+ Tailwind UI segmented 模式：
 * - 选中态由绝对定位指示条承担（语义色块 + 内嵌描边），切换时沿容器滑动；
 * - prefers-reduced-motion 下全局 CSS 已把过渡压为 0.001ms，指示条退化为瞬移；
 * - 键盘：所有页签保持可 Tab 聚焦（不回退），聚焦时 ArrowLeft/Right（含 Up/Down）
 *   与 Home/End 直接切换（follow focus）；选中态用 aria-pressed（与 ThemeToggle 一致，
 *   保持隐式 button role 以兼容既有 e2e getByRole('button')）。
 */
export function Tabs<T extends string>({ value, options, onChange }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<Indicator>(INITIAL_INDICATOR);

  const activeIndex = options.findIndex((option) => option.value === value);
  // value 不在 options 内（异常态）时按第一项兜底，避免 -1 透出
  const activeTabIdx = activeIndex >= 0 ? activeIndex : 0;
  const activeIndexRef = useRef(activeTabIdx);
  activeIndexRef.current = activeTabIdx;

  /** 测量当前选中页签的 offsetLeft/offsetWidth 驱动指示条；同值 bail-out 防渲染循环。 */
  const measure = useCallback(() => {
    const el = tabRefs.current[activeIndexRef.current];
    if (!el) return;
    const next = { left: el.offsetLeft, width: el.offsetWidth, ready: true };
    setIndicator((prev) => (sameIndicator(prev, next) ? prev : next));
  }, []);

  // 受控 value / options（i18n 换 label 改宽度）变化后在 paint 前重测
  useLayoutEffect(measure, [measure, activeTabIdx, value, options]);

  // 容器或任一页签尺寸变化（窗口缩放、webfont 加载完成）后重测；jsdom 无 ResizeObserver 时跳过
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    tabRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // 页签数量变化才需重挂 observer；label 文字变宽由 ResizeObserver 自身捕捉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, options.length]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const lastIndex = options.length - 1;
    if (lastIndex < 1) return;
    let nextIndex: number;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = activeTabIdx <= 0 ? lastIndex : activeTabIdx - 1;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = activeTabIdx >= lastIndex ? 0 : activeTabIdx + 1;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = lastIndex;
    } else {
      return;
    }
    event.preventDefault();
    const next = options[nextIndex];
    if (!next) return;
    onChange(next.value);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="group"
      onKeyDown={handleKeyDown}
      className="relative flex w-full rounded-xl border border-line-subtle bg-bg-surface p-1"
    >
      {/* 滑动指示条：z-0 沉底 + pointer-events-none，不挡点击；位移走 transform */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 left-0 top-1 z-0 rounded-lg bg-accent-primary/15 ring-1 ring-inset ring-accent-primary/30 transition-[transform,width,opacity] duration-[var(--dur-base)] ease-[var(--ease-out)]"
        style={{
          transform: `translateX(${indicator.ready ? indicator.left : 0}px)`,
          width: indicator.ready ? indicator.width : 0,
          opacity: indicator.ready ? 1 : 0,
        }}
      />
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={
              'relative z-10 flex-1 rounded-lg px-3 py-1.5 text-body font-medium ' +
              'transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] ' +
              // 焦点环画在页签内侧，不溢出容器（segmented 控件惯例）
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 focus-visible:ring-inset ' +
              (active
                ? 'text-accent-primary'
                : 'text-ink-secondary hover:bg-bg-raised/60 hover:text-ink-primary')
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
