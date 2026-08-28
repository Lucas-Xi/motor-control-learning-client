import { useMemo } from 'react';
import { ChevronRight, Lightbulb, RotateCcw, Sparkles, TrendingDown } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { computeWeaknessScores, useInsightsStore } from '../../store/insightsStore';
import { moduleMetas } from '../../simulation/engine/presets';
import { useSimulationStore } from '../../store/simulationStore';
import { useUIStore } from '../../store/uiStore';
import { useProgressStore } from '../../store/progressStore';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import type { ModuleId } from '../../simulation/engine/types';

/**
 * 弱项推荐面板：
 *  - 综合"错题密度 + 步骤回看 + 挑战失败"三个信号给出 3-5 个最弱模块
 *  - 每条"去重学"按钮：setActiveModule + 把 walkthroughStep 重置到 0
 *  - 顶部一句推荐路径："建议先复习 X、再做 Y 挑战、最后回到 Z 模块"
 *
 * 视觉令牌：primary（cyan）= 推荐 / 行动；fault（rose）= 主弱项；warn = 次弱项。
 */

const TOP_N = 5;
const KNOWN_MODULE_IDS = moduleMetas.map((m) => m.id);

function shortTitle(id: string): string {
  return moduleMetas.find((m) => m.id === id)?.shortTitle ?? id;
}

function fullTitle(id: string): string {
  return moduleMetas.find((m) => m.id === id)?.title ?? id;
}

export function WeaknessAdvicePanel() {
  const { t } = useI18n();
  const quizMistakes = useInsightsStore((s) => s.quizMistakes);
  const stepRevisits = useInsightsStore((s) => s.stepRevisits);
  const challengeAttempts = useInsightsStore((s) => s.challengeAttempts);
  const setActiveModule = useSimulationStore((s) => s.setActiveModule);
  const setMode = useSimulationStore((s) => s.setMode);
  const setSimPanelView = useUIStore((s) => s.setSimPanelView);
  const setWalkthroughStep = useProgressStore((s) => s.setWalkthroughStep);

  const ranked = useMemo(() => {
    const all = computeWeaknessScores(
      { quizMistakes, stepRevisits, challengeAttempts },
      KNOWN_MODULE_IDS,
    );
    return all.slice(0, TOP_N);
  }, [quizMistakes, stepRevisits, challengeAttempts]);

  const goReview = (id: string) => {
    // 只切到我们已知的 ModuleId；其它无视
    if (!KNOWN_MODULE_IDS.includes(id as ModuleId)) return;
    setActiveModule(id as ModuleId);
    setMode('teach');
    // 重置 walkthrough 进度到第 0 步——"从头复习"
    setWalkthroughStep(id as ModuleId, 0, false);
    setSimPanelView('module');
  };

  // 推荐路径文案：取前三条弱项编织建议
  const pathSuggestion = useMemo(() => {
    if (ranked.length === 0) return null;
    if (ranked.length === 1) {
      return `${t('insights.pathOneLead')}${shortTitle(ranked[0].moduleId)}${t('insights.pathOneTail')}`;
    }
    if (ranked.length === 2) {
      return `${t('insights.pathTwoLead')}${shortTitle(ranked[0].moduleId)}${t('insights.pathTwoMid')}${shortTitle(ranked[1].moduleId)}${t('insights.pathTwoTail')}`;
    }
    return `${t('insights.pathThreeLead')}${shortTitle(ranked[0].moduleId)}${t('insights.pathThreeMid')}${shortTitle(ranked[1].moduleId)}${t('insights.pathThreeLast')}${shortTitle(ranked[2].moduleId)}${t('insights.pathThreeTail')}`;
  }, [ranked, t]);

  return (
    <Card
      title={t('insights.weaknessTitle')}
      eyebrow="recommended review"
      tone="default"
      action={
        <span className="inline-flex items-center gap-1.5 text-caption text-ink-secondary">
          <Sparkles className="h-3.5 w-3.5 text-accent-primary" aria-hidden />
          Top {Math.max(1, ranked.length)}
        </span>
      }
    >
      {ranked.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-subtle bg-bg-base p-6 text-center"
          role="status"
        >
          <TrendingDown className="h-6 w-6 text-ink-muted" aria-hidden />
          <p className="text-body text-ink-primary">{t('insights.weaknessEmptyTitle')}</p>
          <p className="text-caption text-ink-muted">{t('insights.weaknessEmptyHint')}</p>
        </div>
      ) : (
        <>
          {pathSuggestion && (
            <div
              className="mb-3 flex items-start gap-2 rounded-xl border border-accent-primary/40 bg-accent-primary/[0.08] p-3"
              aria-label={t('insights.pathAria')}
            >
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" aria-hidden />
              <p className="text-body text-ink-primary">{pathSuggestion}</p>
            </div>
          )}
          <ol className="space-y-2" aria-label={t('insights.weakListAria')}>
            {ranked.map((row, i) => {
              const isPrimary = i === 0;
              return (
                <li
                  key={row.moduleId}
                  className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center ${
                    isPrimary
                      ? 'border-accent-fault/40 bg-accent-fault/[0.06]'
                      : 'border-accent-warn/30 bg-accent-warn/[0.05]'
                  }`}
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-caption font-medium ${
                      isPrimary
                        ? 'border-accent-fault/60 bg-bg-base text-accent-fault'
                        : 'border-accent-warn/60 bg-bg-base text-accent-warn'
                    }`}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink-primary">{fullTitle(row.moduleId)}</p>
                    <p className="mt-0.5 text-caption text-ink-muted">
                      {t('insights.statMistakes')}
                      <span className="text-accent-fault">{row.mistakeCount}</span>
                      <span className="mx-1">·</span>
                      {t('insights.statRevisits')}
                      <span className="text-accent-warn">{row.revisitCount}</span>
                      <span className="mx-1">·</span>
                      {t('insights.statChallengeFailures')}
                      <span className="text-accent-fault">{row.challengeFailures}</span>
                      <span className="mx-1">·</span>
                      {t('insights.statScore')}
                      <span className="font-mono text-ink-primary">{row.score}</span>
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => goReview(row.moduleId)}
                    aria-label={`${t('insights.reviewAriaLead')}${fullTitle(row.moduleId)}${t('insights.reviewAriaTail')}`}
                    className="shrink-0"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {t('insights.reviewButton')}
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <footer className="mt-3 text-caption text-ink-muted">{t('insights.weightNote')}</footer>
    </Card>
  );
}
