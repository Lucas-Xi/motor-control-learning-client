import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { useInsightsStore } from '../../store/insightsStore';
import { moduleMetas } from '../../simulation/engine/presets';
import { Card } from '../ui/Card';

/**
 * 学习热力图：17 个模块 × 最多 9 步格子。
 * 颜色深度 = 该步被重复进入 (revisit) 的次数；hover/focus 展开详情。
 *
 * 不去 lazy-load walkthrough chunk，仅用 stepRevisits 实际记录到的步数。
 * 没有 revisit 数据的格子显示为空格（透明边框），确保即使从未答错也不会误导。
 *
 * a11y：每个格子是 <button>，aria-label 描述模块 / step / 次数；
 * 颜色之外用透明度 + 数字 + 形状（小三角警示）三通道区分。
 */

const COLUMNS = 9;

/** 归一化到 0..1 → tailwind opacity 档（用 bg-accent-warn/[X]）。
 * 由于 tailwind 不解析模板字符串类名，必须列举每档完整类名。 */
function bandClass(intensity: number): string {
  if (intensity <= 0) return 'border-line-subtle/40 bg-bg-base text-ink-muted';
  if (intensity < 0.2) return 'border-accent-warn/30 bg-accent-warn/10 text-accent-warn';
  if (intensity < 0.5) return 'border-accent-warn/50 bg-accent-warn/25 text-accent-warn';
  if (intensity < 0.8) return 'border-accent-fault/40 bg-accent-fault/30 text-accent-fault';
  return 'border-accent-fault/70 bg-accent-fault/60 text-ink-primary';
}

interface CellInfo {
  moduleId: string;
  stepIdx: number;
  stepId: string;
  count: number;
}

export function HeatmapPanel() {
  const stepRevisits = useInsightsStore((s) => s.stepRevisits);
  const [hover, setHover] = useState<CellInfo | null>(null);

  // 把 record<"<moduleId>.<stepId>", count> 重排成 moduleId → Map<stepId,count>
  // 并按 stepId 出现顺序分配格子（最多 9 列）
  const { grid, maxCount } = useMemo(() => {
    const byModule = new Map<string, { stepId: string; count: number }[]>();
    for (const [key, count] of Object.entries(stepRevisits)) {
      const dot = key.indexOf('.');
      if (dot <= 0) continue;
      const moduleId = key.slice(0, dot);
      const stepId = key.slice(dot + 1);
      const arr = byModule.get(moduleId) ?? [];
      arr.push({ stepId, count });
      byModule.set(moduleId, arr);
    }
    let max = 0;
    for (const arr of byModule.values()) {
      arr.sort((a, b) => a.stepId.localeCompare(b.stepId));
      for (const e of arr) max = Math.max(max, e.count);
    }
    return { grid: byModule, maxCount: max };
  }, [stepRevisits]);

  const totalRevisits = useMemo(
    () => Object.values(stepRevisits).reduce((a, b) => a + b, 0),
    [stepRevisits],
  );

  return (
    <Card
      title="学习热力图"
      eyebrow="step revisits"
      tone="warn"
      action={
        <span className="inline-flex items-center gap-2 text-caption text-ink-secondary">
          <Flame className="h-3.5 w-3.5 text-accent-warn" aria-hidden />
          累计回看 <span className="font-mono text-accent-warn">{totalRevisits}</span> 次
        </span>
      }
    >
      <p className="mb-3 text-caption text-ink-muted">
        每行一个模块，列代表 walkthrough 的步骤；颜色越深说明你回看次数越多——通常是"卡壳"的地方。
      </p>
      <div className="space-y-1.5" role="grid" aria-label="学习热力图">
        {moduleMetas.map((m) => {
          const cells = grid.get(m.id) ?? [];
          return (
            <div
              key={m.id}
              role="row"
              className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2"
            >
              <span className="truncate text-caption text-ink-secondary" title={m.title}>
                <span className="mr-1 font-mono text-ink-muted">{m.stage}</span>
                {m.shortTitle}
              </span>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: COLUMNS }).map((_, i) => {
                  const c = cells[i];
                  const count = c?.count ?? 0;
                  const intensity = maxCount > 0 ? count / maxCount : 0;
                  const cellClass = bandClass(intensity);
                  const label = c
                    ? `${m.shortTitle} · 步骤 ${c.stepId} · 回看 ${count} 次`
                    : `${m.shortTitle} · 第 ${i + 1} 列 · 暂无数据`;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`relative grid h-7 w-7 place-items-center rounded border text-caption font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 ${cellClass}`}
                      onMouseEnter={() =>
                        c && setHover({ moduleId: m.id, stepIdx: i, stepId: c.stepId, count })
                      }
                      onFocus={() =>
                        c && setHover({ moduleId: m.id, stepIdx: i, stepId: c.stepId, count })
                      }
                      onMouseLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                      aria-label={label}
                      role="gridcell"
                      tabIndex={count > 0 ? 0 : -1}
                    >
                      {count > 0 ? count : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {/* 悬浮详情条 —— 替代 tooltip，避免引入新依赖 */}
      <footer
        aria-live="polite"
        className="mt-3 min-h-[28px] rounded-lg border border-line-subtle bg-bg-base px-3 py-1.5 text-caption text-ink-secondary"
      >
        {hover ? (
          <>
            <span className="text-ink-primary">{moduleMetas.find((m) => m.id === hover.moduleId)?.shortTitle}</span>
            <span className="mx-2 text-ink-muted">·</span>
            <span className="font-mono">{hover.stepId}</span>
            <span className="mx-2 text-ink-muted">·</span>
            <span className="text-accent-warn">回看 {hover.count} 次</span>
          </>
        ) : (
          <span className="text-ink-muted">悬停 / 聚焦格子查看详情</span>
        )}
      </footer>
    </Card>
  );
}
