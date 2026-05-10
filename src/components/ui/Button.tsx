import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'outline';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25',
  ghost: 'border-line-subtle bg-bg-surface text-ink-secondary hover:border-line-strong hover:text-ink-primary',
  danger: 'border-accent-fault/50 bg-accent-fault/15 text-accent-fault hover:bg-accent-fault/25',
  outline: 'border-accent-measure/40 bg-transparent text-accent-measure hover:bg-accent-measure/10',
};

export function Button({ variant = 'ghost', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-1.5 text-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
