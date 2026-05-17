import { AnimatePresence, motion } from 'framer-motion';
import { Award, CheckCircle2, Clock, GraduationCap, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { moduleMetas } from '../../simulation/engine/presets';
import { useProgressStore } from '../../store/progressStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 1000) return '0 秒';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

function formatLastVisit(ts: number | null | undefined): string {
  if (!ts) return '未访问';
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  return `${day} 天前`;
}

/**
 * 全屏学习进度模态。
 *
 * 列出 16 个模块卡片：阶段编号 / 标题 / 访问次数 / 答对数 / 累积时长 / 最近访问。
 * 顶部汇总：访问完成度、总活跃时间、quiz 正确率。
 */
export function ProgressModal({ open, onClose }: Props) {
  const perModule = useProgressStore((s) => s.perModule);
  const totalActiveMs = useProgressStore((s) => s.totalActiveMs);
  const startSession = useProgressStore((s) => s.startSession);
  const reset = useProgressStore((s) => s.reset);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const total = moduleMetas.length;

  const summary = useMemo(() => {
    let visited = 0;
    let completed = 0;          // 至少通关 1 次的模块数（学习深度硬指标）
    let totalCompletions = 0;   // 跨模块通关次数总和（含重复通关）
    let quizCorrect = 0;
    let quizTotal = 0;
    let totalModuleMs = 0;
    for (const meta of moduleMetas) {
      const p = perModule[meta.id];
      if (!p) continue;
      if (p.visited) visited += 1;
      const wc = p.walkthroughCompletions ?? 0;
      if (wc >= 1) completed += 1;
      totalCompletions += wc;
      quizCorrect += p.quizCorrect ?? 0;
      quizTotal += p.quizTotal ?? 0;
      totalModuleMs += p.totalTimeMs ?? 0;
    }
    const accuracy = quizTotal > 0 ? quizCorrect / quizTotal : 0;
    return { visited, completed, totalCompletions, quizCorrect, quizTotal, accuracy, totalModuleMs };
  }, [perModule]);

  const handleReset = () => {
    if (typeof window !== 'undefined' && window.confirm('确认重置全部学习进度？该操作不可撤销。')) {
      reset();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-bg-base/80 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="学习进度详情"
        >
          <motion.div
            className="relative max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-line-subtle bg-bg-surface p-5 shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-accent-measure" />
                <h2 className="text-title text-ink-primary">学习进度</h2>
                <span className="text-caption text-ink-muted">
                  会话起始：{new Date(startSession).toLocaleString('zh-CN')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 rounded border border-line-subtle px-2 py-1 text-caption text-ink-muted transition-colors hover:border-accent-fault/60 hover:text-accent-fault"
                >
                  <RotateCcw className="h-3 w-3" />
                  重置进度
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-8 w-8 place-items-center rounded border border-line-subtle text-ink-muted transition-colors hover:text-ink-primary"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 汇总卡 */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SummaryCard
                label="已访问"
                value={`${summary.visited}/${total}`}
                hint={`${Math.round((summary.visited / Math.max(1, total)) * 100)}% 模块打开过`}
                tone="primary"
              />
              <SummaryCard
                label="已通关"
                value={`${summary.completed}/${total}`}
                hint={summary.totalCompletions > summary.completed ? `累计 ${summary.totalCompletions} 次（含重做）` : '走完全部步骤'}
                tone="measure"
              />
              <SummaryCard
                label="答对题数"
                value={`${summary.quizCorrect}`}
                hint={summary.quizTotal > 0 ? `共答 ${summary.quizTotal} 题` : '尚未答题'}
                tone="primary"
              />
              <SummaryCard
                label="正确率"
                value={summary.quizTotal > 0 ? `${Math.round(summary.accuracy * 100)}%` : '—'}
                hint="覆盖全部模块"
                tone="warn"
              />
              <SummaryCard
                label="累积学习时长"
                value={formatDuration(summary.totalModuleMs || totalActiveMs)}
                hint="仅在页面可见时累加"
                tone="primary"
              />
            </div>

            {/* 模块卡片网格 */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {moduleMetas.map((m, idx) => {
                const p = perModule[m.id];
                const visited = p?.visited ?? false;
                const visits = p?.visitCount ?? 0;
                const completions = p?.walkthroughCompletions ?? 0;
                const correct = p?.quizCorrect ?? 0;
                const totalQuiz = p?.quizTotal ?? 0;
                const dwell = p?.totalTimeMs ?? 0;
                const last = p?.lastVisited ?? null;
                // 卡片描边色按学习深度分三档：未访问 → 访问 → 通关
                const border = completions >= 1
                  ? 'border-accent-primary/50 bg-accent-primary/[0.04]'
                  : visited
                    ? 'border-accent-measure/40 bg-bg-base'
                    : 'border-line-subtle bg-bg-base/60';
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(0.4, idx * 0.015) }}
                    className={`rounded-lg border p-2.5 transition-colors ${border}`}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-caption text-ink-muted">
                          <span className="tabular-nums">{m.stage}</span>
                          {visited && !completions && (
                            <CheckCircle2 className="h-3 w-3 text-accent-measure" aria-label="已访问" />
                          )}
                          {completions >= 1 && (
                            <span className="flex items-center gap-0.5 text-accent-primary" title={`已通关 ${completions} 次`}>
                              <Award className="h-3 w-3" aria-hidden="true" />
                              <span className="tabular-nums text-[10px]">×{completions}</span>
                            </span>
                          )}
                        </div>
                        <h3 className="truncate text-body font-medium text-ink-primary">
                          {m.title}
                        </h3>
                      </div>
                    </div>
                    <p className="mb-2 line-clamp-2 text-caption text-ink-muted">{m.subtitle}</p>
                    <dl className="grid grid-cols-2 gap-1 text-caption">
                      <div className="flex items-center gap-1 text-ink-muted">
                        <span>访问</span>
                        <span className="tabular-nums text-ink-primary">{visits} 次</span>
                      </div>
                      <div className="flex items-center gap-1 text-ink-muted">
                        <span>答对</span>
                        <span className="tabular-nums text-accent-measure">
                          {correct}
                          {totalQuiz > 0 && (
                            <span className="text-ink-muted">/{totalQuiz}</span>
                          )}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1 text-ink-muted">
                        <Clock className="h-3 w-3" />
                        <span className="tabular-nums text-ink-secondary">
                          {formatDuration(dwell)}
                        </span>
                        <span className="ml-auto text-ink-muted">{formatLastVisit(last)}</span>
                      </div>
                    </dl>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  hint: string;
  tone: 'primary' | 'measure' | 'warn';
}

function SummaryCard({ label, value, hint, tone }: SummaryCardProps) {
  const toneClass =
    tone === 'measure'
      ? 'text-accent-measure'
      : tone === 'warn'
        ? 'text-accent-warn'
        : 'text-accent-primary';
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-3">
      <div className="text-caption text-ink-muted">{label}</div>
      <div className={`mt-1 text-display tabular-nums ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-caption text-ink-muted">{hint}</div>
    </div>
  );
}
