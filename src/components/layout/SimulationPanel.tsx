import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { ModuleRenderer } from '../../modules/ModuleRenderer';
import { moduleMetas } from '../../simulation/engine/presets';
import { useSimulationStore } from '../../store/simulationStore';
import { useUIStore } from '../../store/uiStore';
import { GuidedExperimentBar } from './GuidedExperimentBar';
import { moduleSwap } from '../../utils/motion';

/**
 * CurriculumPanel lazy 加载（performance audit R2）：
 * 默认 simPanelView='module'，课程主线只在用户主动切到 curriculum 视图时才需要；
 * 它自带 ~28KB 的 curriculum content + 多个 lucide 图标，懒加载剥离首屏。
 */
const CurriculumPanel = lazy(() =>
  import('../curriculum/CurriculumPanel').then((m) => ({ default: m.CurriculumPanel })),
);

export function SimulationPanel() {
  const activeModule = useSimulationStore((state) => state.activeModule);
  const mode = useSimulationStore((state) => state.mode);
  const simPanelView = useUIStore((state) => state.simPanelView);
  const setSimPanelView = useUIStore((state) => state.setSimPanelView);
  const meta = moduleMetas.find((item) => item.id === activeModule)!;
  // currentView: 'module' | 'curriculum'
  // 课程主线视图不破坏现有 16+1 模块渲染——仅顶层 if 决定渲染哪一支。
  if (simPanelView === 'curriculum') {
    return (
      <section
        className="scrollbar-thin min-h-0 space-y-4 overflow-auto rounded-2xl border border-line-subtle bg-bg-surface p-4"
        aria-label="课程主线视图"
      >
        <Suspense
          fallback={
            <div className="rounded-2xl border border-line-subtle bg-bg-surface p-8 text-center text-body text-ink-muted">
              课程主线加载中…
            </div>
          }
        >
          <CurriculumPanel onLeaveCurriculum={() => setSimPanelView('module')} />
        </Suspense>
      </section>
    );
  }
  return (
    <section className="scrollbar-thin min-h-0 space-y-4 overflow-auto rounded-2xl border border-line-subtle bg-bg-surface p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-caption text-ink-muted">{meta.stage}</span>
        <h1 className="font-display text-display text-ink-primary">{meta.title}</h1>
        <p className="text-body text-ink-secondary">{meta.subtitle}</p>
      </header>
      {mode === 'teach' && <GuidedExperimentBar moduleId={activeModule} />}
      {/*
        历史教训：曾经把 ModuleRenderer 包在 <AnimatePresence mode="wait">
        ＋ <motion.div key={activeModule}> 内做模块切换淡入淡出。但 ModuleRenderer
        内部用 React.lazy + Suspense 异步加载模块 chunk，在 framer-motion v12 +
        React 19 的并发模式下出现：连续切换 14+ 模块后，新模块的 lazy chunk 虽然
        已经 resolve（chunk 200 OK），但 AnimatePresence 仍把旧 motion.div 卡在
        exit 队列里，新 motion.div 即使挂载也只渲染 Suspense fallback——
        因为 mode="wait" 的 exit-then-enter 锁与 Suspense throw 出来的 promise
        生命周期相互争用，旧 child 的 onExitComplete 永远不触发。
        修复：把入场动画从 AnimatePresence 改成单一 motion.div + key 重挂载，
        Suspense 状态机就独立运行，lazy chunk 一旦 resolve 立即重渲染。
        详见 docs/E2E_APF_FLAKE_RCA.md。
      */}
      <motion.div
        key={activeModule}
        variants={moduleSwap}
        initial="hidden"
        animate="visible"
      >
        <ModuleRenderer moduleId={activeModule} />
      </motion.div>
    </section>
  );
}
