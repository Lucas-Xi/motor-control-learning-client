import { BookOpen, Cpu, Gauge, Target, Waves } from 'lucide-react';
import { moduleMetas } from '../../simulation/engine/presets';
import type { ModuleId } from '../../simulation/engine/types';
import { useSimulationStore } from '../../store/simulationStore';
import { useUIStore } from '../../store/uiStore';

function iconFor(id: ModuleId) {
  if (id.includes('phase') || id.includes('clarke') || id.includes('park')) return Waves;
  if (id.includes('pid') || id.includes('loop')) return Gauge;
  if (id.includes('foc') || id.includes('svpwm') || id.includes('inverter')) return Cpu;
  return BookOpen;
}

export function Sidebar() {
  const activeModule = useSimulationStore((state) => state.activeModule);
  const setActiveModule = useSimulationStore((state) => state.setActiveModule);
  const simPanelView = useUIStore((state) => state.simPanelView);
  const setSimPanelView = useUIStore((state) => state.setSimPanelView);
  const isCurriculum = simPanelView === 'curriculum';
  return (
    <aside className="relative z-10 flex min-h-0 flex-col rounded-2xl border border-line-subtle bg-bg-surface p-3 xl:h-full">
      <div className="mb-3 px-1">
        <p className="text-caption uppercase tracking-[0.22em] text-ink-muted">Compressor Drive Lab</p>
        <h1 className="mt-0.5 font-display text-display text-ink-primary">压缩机变频器控制</h1>
        <p className="mt-1.5 text-caption leading-relaxed text-ink-secondary">面向空调 / 冰箱 / 工业制冷压缩机的 FOC + V/f 启动 + HFI 无感 + 弱磁交互式学习。</p>
      </div>
      {/* 课程主线入口：点击切换 SimulationPanel 视图（不切 activeModule，方便用户回退） */}
      <button
        type="button"
        onClick={() => setSimPanelView(isCurriculum ? 'module' : 'curriculum')}
        aria-pressed={isCurriculum}
        aria-label={isCurriculum ? '回到当前模块视图' : '打开课程主线总览'}
        className={`mb-3 flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
          isCurriculum
            ? 'border-accent-measure/60 bg-accent-measure/10'
            : 'border-line-subtle bg-bg-raised hover:border-line-strong'
        }`}
      >
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${isCurriculum ? 'border-accent-measure/60 text-accent-measure' : 'border-line-subtle text-ink-secondary'}`}>
          <Target className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-body font-medium ${isCurriculum ? 'text-ink-primary' : 'text-ink-secondary'}`}>课程主线</span>
          <span className="block truncate text-caption text-ink-muted">4 条主题路径 · 自报进度 + 证书</span>
        </span>
      </button>
      <nav className="scrollbar-thin flex gap-2 overflow-x-auto pb-1 xl:min-h-0 xl:flex-1 xl:flex-col xl:space-y-1 xl:overflow-auto xl:pr-1">
        {moduleMetas.map((module) => {
          const Icon = iconFor(module.id);
          const active = !isCurriculum && activeModule === module.id;
          return (
            <button
              key={module.id}
              onClick={() => {
                setActiveModule(module.id);
                // 点模块按钮自动退出课程主线视图
                if (isCurriculum) setSimPanelView('module');
              }}
              className={`group relative w-[200px] shrink-0 rounded-xl border px-3 py-2 text-left transition-colors xl:w-full ${
                active
                  ? 'border-accent-primary/50 bg-accent-primary/10'
                  : 'border-transparent hover:bg-bg-raised'
              }`}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-accent-primary" />}
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-subtle text-ink-secondary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-body font-medium ${active ? 'text-ink-primary' : 'text-ink-secondary'}`}>
                    {module.shortTitle}
                  </span>
                  <span className="block truncate text-caption text-ink-muted">{module.stage} · {module.subtitle}</span>
                </span>
              </div>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
