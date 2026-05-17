import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** 触发按钮 aria-label */
  label: string;
  /** 菜单内容 — 自由 JSX，由调用方排列 */
  children: ReactNode;
  /** 自定义触发图标，默认 ⋯ */
  triggerIcon?: ReactNode;
}

/**
 * 通用 overflow 菜单：触发按钮 + 点击展开的 popover。
 *
 * 行为：
 *   - 点击触发按钮切换；点击外部 / Esc 关闭。
 *   - 不接管焦点（不做 focus trap），保留与 TopBar 主流操作的键盘流。
 *   - 不做箭头键导航——菜单内通常 1-2 个控件，过度封装得不偿失。
 */
export function OverflowMenu({ label, children, triggerIcon }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-line-subtle bg-bg-surface px-3 py-1.5 text-body font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink-primary"
      >
        {triggerIcon ?? <MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[160px] rounded-xl border border-line-subtle bg-bg-surface p-2 shadow-xl"
        >
          {children}
        </div>
      )}
    </div>
  );
}
