import { AnimatePresence, motion } from 'framer-motion';
import { ModuleRenderer } from '../../modules/ModuleRenderer';
import { moduleMetas } from '../../simulation/engine/presets';
import { useSimulationStore } from '../../store/simulationStore';
import { useUIStore } from '../../store/uiStore';
import { GuidedExperimentBar } from './GuidedExperimentBar';
import { moduleSwap } from '../../utils/motion';
import { CurriculumPanel } from '../curriculum/CurriculumPanel';

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
        <CurriculumPanel onLeaveCurriculum={() => setSimPanelView('module')} />
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
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeModule}
          variants={moduleSwap}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <ModuleRenderer moduleId={activeModule} />
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
