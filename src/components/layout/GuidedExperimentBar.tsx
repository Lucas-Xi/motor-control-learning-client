import { Compass, Eye, PlayCircle, Target } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getGuidedExperiment } from '../../content/guidedExperiments';
import { getCachedWalkthrough, loadModuleWalkthrough, type ModuleWalkthrough } from '../../content/walkthroughs';
import type { ModuleId } from '../../simulation/engine/types';
import { useSimulationStore } from '../../store/simulationStore';
import { useInsightsStore } from '../../store/insightsStore';
import { useI18n } from '../../i18n/useI18n';

interface Props {
  moduleId: ModuleId;
}

/**
 * 实验引导条带——合并了原来的 ExperimentGuideCard、ModuleFlowRail、InteractionHud。
 * 一条横向布局：左半步骤选择，右半当前步骤详情。
 *
 * 双语：locale === 'en-US' 时优先从 ModuleWalkthrough.steps 取 titleEn/actionEn；
 * 缺失的步骤回退到中文 title/action 并附加 sr-only "(zh fallback)"。
 * 步骤选择条本身仍基于 guidedExperiments（简版 3-4 步），保证向后兼容；
 * walkthrough 提供更丰富的 titleEn/actionEn 用于英文显示。
 */
export function GuidedExperimentBar({ moduleId }: Props) {
  const guideStepIndex = useSimulationStore((state) => state.guideStepIndex);
  const setGuideStepIndex = useSimulationStore((state) => state.setGuideStepIndex);
  const applyExperimentPreset = useSimulationStore((state) => state.applyExperimentPreset);
  const recordStepRevisit = useInsightsStore((state) => state.recordStepRevisit);
  const guide = getGuidedExperiment(moduleId);
  const { t, locale } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [walkthrough, setWalkthrough] = useState<ModuleWalkthrough | undefined>(() => getCachedWalkthrough(moduleId));
  // 记录"本会话内访问过哪些 stepId"——第二次进入同一 step 才算 revisit。
  // 用 ref 而非 state：仅副作用，不需要触发重渲染。
  // 注意：跨模块切换不重置（用户切走再回来再切别的步骤也算 revisit）；跨页面刷新自然重置（ref 不持久化），
  // 真正的累积值仍由 useInsightsStore.persist 保管。
  const visitedStepsRef = useRef<Set<string>>(new Set());

  // 异步拉对应模块的 walkthrough，命中缓存的同步返回，未命中走 dynamic import
  useEffect(() => {
    let cancelled = false;
    const cached = getCachedWalkthrough(moduleId);
    setWalkthrough(cached);
    if (!cached) {
      void loadModuleWalkthrough(moduleId).then((wt) => {
        if (!cancelled) setWalkthrough(wt);
      });
    }
    return () => { cancelled = true; };
  }, [moduleId]);

  const activeIndex = Math.min(guide.steps.length - 1, guideStepIndex);
  const activeStep = guide.steps[activeIndex] ?? guide.steps[0];

  if (!activeStep) return null;

  const selectStep = (index: number) => {
    const step = guide.steps[index];
    setGuideStepIndex(index);
    if (step?.presetId) applyExperimentPreset(step.presetId);
    // 学习洞察：第二次进入同一 stepId 时累计回看次数。
    // 优先使用 walkthrough 同序号步骤的 id（与 GlobalKeybindings + ProgressStore.walkthroughStep 一致），
    // 缺失时退回到 guidedExperiments 的简版 step.id。
    const stepId = walkthrough?.steps[index]?.id ?? step?.id;
    if (stepId) {
      const key = `${moduleId}::${stepId}`;
      if (visitedStepsRef.current.has(key)) {
        recordStepRevisit(moduleId, stepId);
      } else {
        visitedStepsRef.current.add(key);
      }
    }
  };

  // 用 walkthrough 同序号步骤的 titleEn/actionEn 覆盖 guidedExperiments 的中文。
  // walkthrough 步骤数通常比 guidedExperiments 多，按 index 取齐即可；若超界则用 undefined。
  const wtStep = walkthrough?.steps[activeIndex];
  const showEn = locale === 'en-US';
  const stepTitle = (index: number) => {
    const wt = walkthrough?.steps[index];
    if (showEn) {
      if (wt?.titleEn) return wt.titleEn;
      // walkthrough 缺英文备份 → 回退中文 + sr-only fallback marker
      return guide.steps[index].title;
    }
    return guide.steps[index].title;
  };
  const actionText = showEn ? (wtStep?.actionEn ?? activeStep.action) : activeStep.action;
  const showActionFallback = showEn && !wtStep?.actionEn;
  const showTitleFallbackFor = (index: number) => {
    if (!showEn) return false;
    return !walkthrough?.steps[index]?.titleEn;
  };

  return (
    <section className="rounded-2xl border border-line-subtle bg-bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-caption uppercase tracking-[0.18em] text-ink-muted">{t('guidedLab.eyebrow')}</span>
          <span className="text-body font-medium text-ink-primary">{guide.title}</span>
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-caption text-ink-muted transition-colors hover:text-ink-primary"
        >
          {collapsed ? t('guidedLab.expand') : t('guidedLab.collapse')}
        </button>
      </header>
      {!collapsed && (
        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-1.5">
            <p className="px-1 text-caption text-ink-muted">{guide.focus}</p>
            {/* <lg: 横向 snap chips，节省垂直空间；lg+ 恢复纵向列表 */}
            <div className="scrollbar-thin mobile-snap-x -mx-1 flex gap-1.5 overflow-x-auto px-1 lg:mx-0 lg:grid lg:gap-1.5 lg:overflow-visible lg:px-0">
              {guide.steps.map((step, index) => {
                const active = index === activeIndex;
                return (
                  <button
                    key={step.id}
                    onClick={() => selectStep(index)}
                    className={`mobile-touch-target flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors lg:w-full ${
                      active
                        ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                        : 'border-line-subtle bg-bg-base text-ink-secondary hover:border-line-strong hover:text-ink-primary'
                    }`}
                  >
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded text-caption font-medium ${
                      active ? 'bg-accent-primary/20 text-accent-primary' : 'bg-line-subtle text-ink-muted'
                    }`}>
                      {index + 1}
                    </span>
                    <span className="truncate text-body">
                      {stepTitle(index)}
                      {showTitleFallbackFor(index) && (
                        <span className="sr-only"> {t('guidedLab.zhFallback')}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-line-subtle bg-bg-base p-3">
            <div className="flex items-start gap-2">
              <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" />
              <p className="text-caption leading-relaxed text-ink-secondary">
                <span className="text-ink-primary">{t('guidedLab.operationLabel')}</span>{actionText}
                {showActionFallback && <span className="sr-only"> {t('guidedLab.zhFallback')}</span>}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" />
              <p className="text-caption leading-relaxed text-ink-secondary">
                <span className="text-ink-primary">{t('guidedLab.observeLabel')}</span>{activeStep.observe}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" />
              <p className="text-caption leading-relaxed text-ink-secondary">
                <span className="text-ink-primary">{t('guidedLab.expectedLabel')}</span>{activeStep.expected}
              </p>
            </div>
            {activeStep.presetId && (
              <button
                onClick={() => selectStep(activeIndex)}
                className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-3 py-1.5 text-caption font-medium text-accent-primary transition-colors hover:bg-accent-primary/20"
              >
                <Compass className="h-3.5 w-3.5" />
                {t('guidedLab.loadPresetButton')}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
