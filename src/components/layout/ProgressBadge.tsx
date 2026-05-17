import { GraduationCap, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { moduleMetas } from '../../simulation/engine/presets';
import { useProgressStore } from '../../store/progressStore';
import { ProgressModal } from './ProgressModal';

/**
 * 顶栏紧凑徽章：显示「访问 N/16 · 答对 M」+ mint 渐变进度条。
 *
 * 点击 → 打开 ProgressModal 全屏详情。
 * 集成方式：在 TopBar.tsx 里加 `<ProgressBadge />` 即可。
 */
export function ProgressBadge() {
  const perModule = useProgressStore((s) => s.perModule);
  const reset = useProgressStore((s) => s.reset);
  const [open, setOpen] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const total = moduleMetas.length;

  const { visitedCount, quizCorrect, completedCount } = useMemo(() => {
    let visited = 0;
    let correct = 0;
    let completed = 0;
    for (const meta of moduleMetas) {
      const p = perModule[meta.id];
      if (p?.visited) visited += 1;
      correct += p?.quizCorrect ?? 0;
      // 通关 ≥ 1 次的模块计入"已通关"数（多次通关只算 1）
      if ((p?.walkthroughCompletions ?? 0) >= 1) completed += 1;
    }
    return { visitedCount: visited, quizCorrect: correct, completedCount: completed };
  }, [perModule]);

  // 进度条按"通关"映射（学习深度的硬指标）；"访问"仅在文字里露
  const ratio = total > 0 ? completedCount / total : 0;
  const widthPct = Math.max(0, Math.min(1, ratio)) * 100;

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window !== 'undefined' && window.confirm('确认重置全部学习进度？该操作不可撤销。')) {
      reset();
    }
  };

  return (
    <>
      <div
        className="relative"
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-center gap-2 rounded-lg border border-line-subtle bg-bg-base px-2.5 py-1.5 text-caption text-ink-secondary transition-colors hover:border-accent-measure/60 hover:text-ink-primary"
          aria-label="查看学习进度"
        >
          <GraduationCap className="h-4 w-4 text-accent-measure" />
          <span className="tabular-nums">
            访问 <span className="text-ink-primary">{visitedCount}/{total}</span>
            <span className="mx-1 text-ink-muted">·</span>
            通关 <span className="text-accent-measure">{completedCount}/{total}</span>
            <span className="mx-1 text-ink-muted">·</span>
            答对 <span className="text-ink-primary">{quizCorrect}</span>
          </span>
          {/* 进度条：mint 渐变 */}
          <span
            className="ml-1 block h-1.5 w-16 overflow-hidden rounded-full bg-bg-surface"
            aria-hidden
          >
            <span
              className="block h-full rounded-full bg-gradient-to-r from-accent-measure/60 to-accent-measure transition-[width] duration-500 ease-out"
              style={{ width: `${widthPct}%` }}
            />
          </span>
        </button>
        {/* 重置按钮放在 badge 外面，避免 button-嵌套-button 的 HTML 错误 */}
        <button
          type="button"
          onClick={handleReset}
          title="重置进度"
          aria-label="重置进度"
          className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full border border-line-subtle bg-bg-surface text-ink-muted shadow transition-colors hover:border-accent-fault/50 hover:text-accent-fault"
        >
          <RotateCcw className="h-3 w-3" />
        </button>

        {/* hover tooltip：模块状态列表 */}
        {showTip && (
          <div
            role="tooltip"
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-line-subtle bg-bg-surface p-2 shadow-xl"
          >
            <div className="mb-1.5 flex items-center justify-between border-b border-line-subtle pb-1.5 text-caption">
              <span className="text-ink-primary">学习进度</span>
              <span className="text-ink-muted">点击徽章查看详情</span>
            </div>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
              {moduleMetas.map((m) => {
                const p = perModule[m.id];
                const visited = p?.visited ?? false;
                const visits = p?.visitCount ?? 0;
                const correct = p?.quizCorrect ?? 0;
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-caption"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          visited ? 'bg-accent-measure' : 'bg-line-subtle'
                        }`}
                      />
                      <span className="text-ink-muted tabular-nums">{m.stage}</span>
                      <span className="truncate text-ink-secondary">{m.shortTitle}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-muted">
                      {visited ? `${visits} 次` : '未访问'}
                      {correct > 0 && (
                        <span className="ml-1 text-accent-measure">·{correct}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <ProgressModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
