import { useMemo } from 'react';
import { BookX, CheckCircle2, ChevronRight, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { summarizeMistakes, useInsightsStore, type QuizMistakeRecord } from '../../store/insightsStore';
import { moduleMetas } from '../../simulation/engine/presets';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

/**
 * 错题本面板：列表展示用户答错过的所有 quiz；点击"我懂了"从错题本移除。
 *
 * 视觉令牌：
 *  - fault（rose）：错题主题色 + 选错的选项
 *  - measure（mint）：正确答案
 *  - warn（amber）：hint
 *  - primary（cyan）：交互按钮
 */

function moduleShortTitle(id: string): string {
  return moduleMetas.find((m) => m.id === id)?.shortTitle ?? id;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function letter(idx: number): string {
  return String.fromCharCode(65 + idx);
}

interface RowProps {
  rec: QuizMistakeRecord;
  onDismiss: () => void;
}

function MistakeRow({ rec, onDismiss }: RowProps) {
  const { t } = useI18n();
  return (
    <li
      className="rounded-xl border border-accent-fault/30 bg-accent-fault/[0.05] p-3"
      aria-label={`${t('insights.mistakeRowAriaLead')}${moduleShortTitle(rec.moduleId)} · ${rec.q ?? rec.quizId}`}
    >
      <header className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded-md border border-accent-fault/40 bg-accent-fault/10 px-2 py-0.5 text-caption font-medium text-accent-fault">
          {moduleShortTitle(rec.moduleId)}
        </span>
        <span className="font-mono text-caption text-ink-muted">{rec.stepId}</span>
        <span className="font-mono text-caption text-ink-muted">·</span>
        <span className="font-mono text-caption text-ink-muted">{rec.quizId}</span>
        <span className="ml-auto font-mono text-caption text-ink-muted" title={`${t('insights.lastWrongTitle')}${fmtTime(rec.ts)}`}>
          {t('insights.wrongCountLead')}
          <span className="text-accent-fault">{rec.count}</span>
          {t('insights.wrongCountTail')}
        </span>
      </header>
      {rec.q && (
        <p className="mb-2 text-body font-medium text-ink-primary">{rec.q}</p>
      )}
      <div className="mb-2 grid gap-1.5 sm:grid-cols-2">
        <div className="rounded-lg border border-accent-fault/30 bg-bg-base p-2">
          <p className="mb-1 text-caption uppercase tracking-[0.18em] text-accent-fault">{t('insights.yourChoice')}</p>
          <p className="text-body text-accent-fault">
            <span className="mr-1 font-mono">{letter(rec.chosen)}.</span>
            {rec.options?.[rec.chosen] ?? `${t('insights.optionFallback')}${letter(rec.chosen)}`}
          </p>
        </div>
        <div className="rounded-lg border border-accent-measure/40 bg-bg-base p-2">
          <p className="mb-1 text-caption uppercase tracking-[0.18em] text-accent-measure">{t('insights.correctAnswer')}</p>
          <p className="text-body text-accent-measure">
            <span className="mr-1 font-mono">{letter(rec.correct)}.</span>
            {rec.options?.[rec.correct] ?? `${t('insights.optionFallback')}${letter(rec.correct)}`}
          </p>
        </div>
      </div>
      {rec.hint && (
        <p className="mb-2 rounded-lg border border-accent-warn/30 bg-accent-warn/[0.06] p-2 text-caption leading-relaxed text-ink-secondary">
          <span className="text-accent-warn">{t('insights.hintLead')}</span>{rec.hint}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={onDismiss}
          aria-label={`${t('insights.dismissAriaLead')}${rec.q ?? rec.quizId}`}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {t('insights.gotItButton')}
        </Button>
      </div>
    </li>
  );
}

export function MistakeBookPanel() {
  const { t } = useI18n();
  const quizMistakes = useInsightsStore((s) => s.quizMistakes);
  const dismissMistake = useInsightsStore((s) => s.dismissMistake);

  // 按"错过次数"倒排，便于学员先攻克最常错的
  const list = useMemo(() => {
    return Object.values(quizMistakes).sort((a, b) => b.count - a.count || b.ts - a.ts);
  }, [quizMistakes]);

  const stats = summarizeMistakes(quizMistakes);

  return (
    <Card
      title={t('insights.mistakeBookTitle')}
      eyebrow="mistake book"
      tone="fault"
      action={
        <div className="flex items-center gap-2 text-caption">
          <span className="rounded-md border border-line-subtle bg-bg-base px-2 py-0.5 text-ink-secondary">
            {t('insights.totalMistakesLead')}
            <span className="text-accent-fault">{stats.totalMistakes}</span>
            {t('insights.totalMistakesTail')}
          </span>
          <span className="rounded-md border border-line-subtle bg-bg-base px-2 py-0.5 text-ink-secondary">
            {t('insights.modulesLead')}
            <span className="text-accent-warn">{stats.modules}</span>
            {t('insights.modulesTail')}
          </span>
        </div>
      }
    >
      {list.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-subtle bg-bg-base p-6 text-center"
          role="status"
        >
          <BookX className="h-6 w-6 text-ink-muted" aria-hidden />
          <p className="text-body text-ink-primary">{t('insights.mistakeEmptyTitle')}</p>
          <p className="text-caption text-ink-muted">{t('insights.mistakeEmptyHint')}</p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label={t('insights.listAria')}>
          {list.map((rec) => (
            <MistakeRow
              key={`${rec.moduleId}.${rec.stepId}.${rec.quizId}`}
              rec={rec}
              onDismiss={() => dismissMistake(rec.moduleId, rec.stepId, rec.quizId)}
            />
          ))}
        </ul>
      )}
      {list.length > 0 && (
        <footer className="mt-3 flex items-center justify-between text-caption text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3" aria-hidden />
            {t('insights.dismissHint')}
          </span>
          <span className="sr-only">
            <Trash2 className="h-3 w-3" aria-hidden />{t('insights.localOnlyNote')}
          </span>
        </footer>
      )}
    </Card>
  );
}
