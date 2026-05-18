import { Compass, Eye, PlayCircle, Target } from 'lucide-react';
import { useState } from 'react';
import { getGuidedExperiment } from '../../content/guidedExperiments';
import type { ModuleId } from '../../simulation/engine/types';
import { useSimulationStore } from '../../store/simulationStore';

interface Props {
  moduleId: ModuleId;
}

/**
 * 实验引导条带——合并了原来的 ExperimentGuideCard、ModuleFlowRail、InteractionHud。
 * 一条横向布局：左半步骤选择，右半当前步骤详情。
 */
export function GuidedExperimentBar({ moduleId }: Props) {
  const guideStepIndex = useSimulationStore((state) => state.guideStepIndex);
  const setGuideStepIndex = useSimulationStore((state) => state.setGuideStepIndex);
  const applyExperimentPreset = useSimulationStore((state) => state.applyExperimentPreset);
  const guide = getGuidedExperiment(moduleId);
  const [collapsed, setCollapsed] = useState(false);
  const activeIndex = Math.min(guide.steps.length - 1, guideStepIndex);
  const activeStep = guide.steps[activeIndex] ?? guide.steps[0];

  if (!activeStep) return null;

  const selectStep = (index: number) => {
    const step = guide.steps[index];
    setGuideStepIndex(index);
    if (step?.presetId) applyExperimentPreset(step.presetId);
  };

  return (
    <section className="rounded-2xl border border-line-subtle bg-bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-caption uppercase tracking-[0.18em] text-ink-muted">Guided Lab</span>
          <span className="text-body font-medium text-ink-primary">{guide.title}</span>
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-caption text-ink-muted transition-colors hover:text-ink-primary"
        >
          {collapsed ? '展开' : '收起'}
        </button>
      </header>
      {!collapsed && (
        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-1.5">
            <p className="px-1 text-caption text-ink-muted">{guide.focus}</p>
            {/* <lg: 横向 snap chips，节省垂直空间；lg+ 恢复纵向列表 */}
            <div className="scrollbar-thin mobile-snap-x -mx-1 flex gap-1.5 overflow-x-auto px-1 lg:mx-0 lg:grid lg:overflow-visible lg:px-0">
              {guide.steps.map((step, index) => {
                const active = index === activeIndex;
                return (
                  <button
                    key={step.id}
                    onClick={() => selectStep(index)}
                    className={`mobile-touch-target flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors lg:w-full lg:shrink ${
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
                    <span className="truncate text-body">{step.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-line-subtle bg-bg-base p-3">
            <div className="flex items-start gap-2">
              <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" />
              <p className="text-caption leading-relaxed text-ink-secondary">
                <span className="text-ink-primary">操作：</span>{activeStep.action}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" />
              <p className="text-caption leading-relaxed text-ink-secondary">
                <span className="text-ink-primary">观察：</span>{activeStep.observe}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" />
              <p className="text-caption leading-relaxed text-ink-secondary">
                <span className="text-ink-primary">预期：</span>{activeStep.expected}
              </p>
            </div>
            {activeStep.presetId && (
              <button
                onClick={() => selectStep(activeIndex)}
                className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent-primary/40 bg-accent-primary/10 px-3 py-1.5 text-caption font-medium text-accent-primary transition-colors hover:bg-accent-primary/20"
              >
                <Compass className="h-3.5 w-3.5" />
                加载本步参数
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
