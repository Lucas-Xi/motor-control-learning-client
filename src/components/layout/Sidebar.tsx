import { BarChart3, BookOpen, Cpu, Gauge, Target, Waves } from 'lucide-react';
import { moduleMetas } from '../../simulation/engine/presets';
import type { ModuleId } from '../../simulation/engine/types';
import { useSimulationStore } from '../../store/simulationStore';
import { useUIStore } from '../../store/uiStore';
import { useI18n } from '../../i18n/useI18n';

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
  const isInsights = simPanelView === 'insights';
  const { t } = useI18n();
  return (
    <aside className="relative z-10 flex min-h-0 flex-col rounded-2xl border border-line-subtle bg-bg-surface p-3 xl:h-full">
      {/* 移动端折叠 brand 头：保留行高，但去掉副标题段落避免占满 1/3 屏 */}
      <div className="mb-2 px-1 xl:mb-3">
        <p className="hidden text-caption uppercase tracking-[0.22em] text-ink-muted xl:block">{t('shell.brandEyebrow')}</p>
        <h1 className="mt-0.5 font-display text-title text-ink-primary xl:text-display">{t('shell.brandTitle')}</h1>
        <p className="mt-1.5 hidden text-caption leading-relaxed text-ink-secondary xl:block">{t('shell.brandSubtitle')}</p>
      </div>
      {/* 课程主线入口：移动端只显图标 + 短标题，桌面端保留两行副标题 */}
      <button
        type="button"
        onClick={() => setSimPanelView(isCurriculum ? 'module' : 'curriculum')}
        aria-pressed={isCurriculum}
        aria-label={isCurriculum ? t('shell.curriculumBack') : t('shell.curriculumOpen')}
        className={`mb-2 flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors xl:mb-3 xl:gap-3 xl:px-3 xl:py-2 ${
          isCurriculum
            ? 'border-accent-measure/60 bg-accent-measure/10'
            : 'border-line-subtle bg-bg-raised hover:border-line-strong'
        }`}
      >
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border xl:h-8 xl:w-8 ${isCurriculum ? 'border-accent-measure/60 text-accent-measure' : 'border-line-subtle text-ink-secondary'}`}>
          <Target className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-body font-medium ${isCurriculum ? 'text-ink-primary' : 'text-ink-secondary'}`}>{t('shell.curriculumEntry')}</span>
          <span className="hidden truncate text-caption text-ink-muted xl:block">{t('shell.curriculumEntrySubtitle')}</span>
        </span>
      </button>
      {/* 学习洞察入口：紧跟课程主线下面；同样是顶层视图切换 */}
      <button
        type="button"
        onClick={() => setSimPanelView(isInsights ? 'module' : 'insights')}
        aria-pressed={isInsights}
        aria-label={isInsights ? '返回当前模块' : '打开学习洞察（错题本 / 热力图 / 弱项推荐）'}
        className={`mb-2 flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors xl:mb-3 xl:gap-3 xl:px-3 xl:py-2 ${
          isInsights
            ? 'border-accent-primary/60 bg-accent-primary/10'
            : 'border-line-subtle bg-bg-raised hover:border-line-strong'
        }`}
      >
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border xl:h-8 xl:w-8 ${isInsights ? 'border-accent-primary/60 text-accent-primary' : 'border-line-subtle text-ink-secondary'}`}>
          <BarChart3 className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-body font-medium ${isInsights ? 'text-ink-primary' : 'text-ink-secondary'}`}>学习洞察</span>
          <span className="hidden truncate text-caption text-ink-muted xl:block">错题本 · 热力图 · 弱项推荐</span>
        </span>
      </button>
      <nav className="scrollbar-thin mobile-snap-x flex gap-2 overflow-x-auto pb-1 xl:min-h-0 xl:flex-1 xl:flex-col xl:space-y-1 xl:overflow-auto xl:pr-1">
        {moduleMetas.map((module) => {
          const Icon = iconFor(module.id);
          const active = !isCurriculum && !isInsights && activeModule === module.id;
          return (
            <button
              key={module.id}
              onClick={() => {
                setActiveModule(module.id);
                // 点模块按钮自动退出课程主线 / 洞察视图
                if (isCurriculum || isInsights) setSimPanelView('module');
              }}
              className={`group relative w-[148px] shrink-0 rounded-xl border px-2.5 py-1.5 text-left transition-colors xl:w-full xl:px-3 xl:py-2 ${
                active
                  ? 'border-accent-primary/50 bg-accent-primary/10'
                  : 'border-line-subtle/40 hover:bg-bg-raised xl:border-transparent'
              }`}
            >
              {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-accent-primary" />}
              <div className="flex items-center gap-2 xl:gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line-subtle text-ink-secondary xl:h-8 xl:w-8">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-body font-medium ${active ? 'text-ink-primary' : 'text-ink-secondary'}`}>
                    {module.shortTitle}
                  </span>
                  <span className="block truncate text-caption text-ink-muted">{module.stage}<span className="hidden xl:inline"> · {module.subtitle}</span></span>
                </span>
              </div>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
