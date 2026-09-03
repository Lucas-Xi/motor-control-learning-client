import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'outline';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

/**
 * variant 层级参考 ReUI（atlas-admin 模板，Catalyst 血统）的按钮状态机：
 * - hover：边框提亮一档 + 背景加深一档（"可点"暗示），ghost 额外补 raised 底色反馈；
 * - active：背景再深一档，配合基类的 active:translate-y-px 按压下沉；
 * - 反馈统一挂 enabled: 前缀，disabled 时 hover/active 完全静默。
 */
const variants: Record<Variant, string> = {
  primary:
    'border-accent-primary/60 bg-accent-primary/15 text-accent-primary ' +
    'enabled:hover:border-accent-primary enabled:hover:bg-accent-primary/25 active:bg-accent-primary/30',
  ghost:
    'border-line-subtle bg-bg-surface text-ink-secondary ' +
    'enabled:hover:border-line-strong enabled:hover:bg-bg-raised enabled:hover:text-ink-primary active:bg-bg-raised/70',
  danger:
    'border-accent-fault/50 bg-accent-fault/15 text-accent-fault ' +
    'enabled:hover:border-accent-fault/80 enabled:hover:bg-accent-fault/25 active:bg-accent-fault/30',
  outline:
    'border-accent-measure/40 bg-transparent text-accent-measure ' +
    'enabled:hover:border-accent-measure/70 enabled:hover:bg-accent-measure/10 active:bg-accent-measure/15',
};

export function Button({ variant = 'ghost', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={
        'inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-1.5 text-body font-medium ' +
        // 防双击选中文字 / 防窄容器内换行（ReUI 细节）
        'select-none whitespace-nowrap ' +
        // 图标随文字排布时不被压缩
        "[&_svg]:shrink-0 " +
        // 项目动效 token：140ms / ease-out；ring(box-shadow) 与按压位移一并平滑过渡
        'transition-all duration-[var(--dur-fast)] ease-[var(--ease-out)] ' +
        // 焦点环：覆盖全局 outline，用语义色 50% 透明度双环（offset 缝隙填 bg-base，与 AssetHero 一致）
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ' +
        'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ' +
        // 按压下沉 1px（Catalyst/ReUI 按压层级）
        'active:translate-y-px ' +
        'disabled:cursor-not-allowed disabled:opacity-50 ' +
        `${variants[variant]} ${className}`
      }
      {...props}
    >
      {children}
    </button>
  );
}
