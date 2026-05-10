import type { HTMLAttributes, ReactNode } from 'react';

type Tone = 'default' | 'measure' | 'warn' | 'fault';
type Density = 'default' | 'compact';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  tone?: Tone;
  density?: Density;
  children: ReactNode;
}

const toneRing: Record<Tone, string> = {
  default: 'border-line-subtle',
  measure: 'border-accent-measure/40',
  warn: 'border-accent-warn/40',
  fault: 'border-accent-fault/40',
};

const densityPad: Record<Density, string> = {
  default: 'p-4',
  compact: 'p-3',
};

export function Card({
  title,
  eyebrow,
  action,
  tone = 'default',
  density = 'default',
  children,
  className = '',
  ...props
}: CardProps) {
  return (
    <section
      className={`relative rounded-2xl border bg-bg-surface ${toneRing[tone]} ${densityPad[density]} ${className}`}
      {...props}
    >
      {(title || eyebrow || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="text-caption uppercase tracking-[0.18em] text-ink-muted">{eyebrow}</p>}
            {title && <h2 className="font-display text-title text-ink-primary">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}
