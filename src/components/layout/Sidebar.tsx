import { BarChart3, Command as CommandIcon, Cpu, FlaskConical, Magnet, Target, type LucideIcon } from 'lucide-react';
import { localizeModuleMeta, moduleMetas } from '../../simulation/engine/presets';
import type { ModuleId } from '../../simulation/engine/types';
import { iconForModule } from './moduleIcons';
import { useSimulationStore } from '../../store/simulationStore';
import { useUIStore } from '../../store/uiStore';
import { useI18n } from '../../i18n/useI18n';

/**
 * 图标栏（v0.2 双栏沉浸壳层的左侧导航）。
 *
 * 桌面 ≥xl：76px 竖栏 —— 品牌徽标 + 搜索(命令面板) + 三组分组的模块图标
 * （图标 + stage 号 + 短标签，激活态左侧指示条）+ 课程/洞察入口。
 * 移动端 <xl：横向滚动条，同样内容。
 *
 * e2e 契约：模块按钮内含可见的 stage 文本（"01"…"16"），测试用
 * `nav button` + hasText(stage) 定位。
 */

/** 三个学习分组（stage 号区间，闭区间） */
const RAIL_GROUPS: Array<{ key: 'basics' | 'advanced' | 'system'; range: [number, number] }> = [
  { key: 'basics', range: [1, 5] },
  { key: 'advanced', range: [6, 12] },
  { key: 'system', range: [13, 16] },
];

/** 分组图标（基础=磁铁，进阶=CPU，系统=实验瓶） */
const GROUP_ICON: Record<'basics' | 'advanced' | 'system', LucideIcon> = {
  basics: Magnet,
  advanced: Cpu,
  system: FlaskConical,
};

type GroupKey = 'basics' | 'advanced' | 'system';

export function Sidebar() {
  const activeModule = useSimulationStore((state) => state.activeModule);
  const setActiveModule = useSimulationStore((state) => state.setActiveModule);
  const simPanelView = useUIStore((state) => state.simPanelView);
  const setSimPanelView = useUIStore((state) => state.setSimPanelView);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const isCurriculum = simPanelView === 'curriculum';
  const isInsights = simPanelView === 'insights';
  const { t, locale } = useI18n();

  const goModule = (id: ModuleId) => {
    setActiveModule(id);
    if (isCurriculum || isInsights) setSimPanelView('module');
  };

  const groupTitle = (key: GroupKey) =>
    t(`shell.railGroup${key.charAt(0).toUpperCase()}${key.slice(1)}` as 'shell.railGroupBasics' | 'shell.railGroupAdvanced' | 'shell.railGroupSystem');

  return (
    <aside aria-label={t('shell.railAria')} className="relative z-10 flex min-h-0 shrink-0 flex-col rounded-2xl border border-line-subtle bg-bg-surface p-2 xl:w-[76px]">
      {/* 品牌徽标 + 命令面板入口 */}
      <div className="mb-1 flex items-center justify-center gap-1 xl:flex-col">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent-primary/40 bg-accent-primary/10"
          title={t('shell.brandTitle')}
          aria-hidden
        >
          <span className="font-display text-[13px] font-bold text-accent-primary">MC</span>
        </span>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label={t('shell.railPaletteAria')}
          title={t('shell.railPaletteAria')}
          className="grid h-9 w-9 place-items-center rounded-xl border border-line-subtle text-ink-secondary transition-colors hover:border-accent-primary/40 hover:text-accent-primary"
        >
          <CommandIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* 三组模块 */}
      <nav
        aria-label={t('shell.sidebarNavAria')}
        className="scrollbar-thin mobile-snap-x flex min-h-0 flex-1 gap-1.5 overflow-x-auto pb-1 xl:flex-col xl:gap-2 xl:overflow-x-hidden xl:overflow-y-auto xl:py-1"
      >
        {RAIL_GROUPS.map(({ key, range: [from, to] }) => {
          const GroupIcon = GROUP_ICON[key];
          const modules = moduleMetas.filter((m) => {
            const n = Number(m.stage);
            return n >= from && n <= to;
          });
          return (
            <div key={key} className="flex shrink-0 flex-row items-center gap-1.5 xl:flex-col xl:items-stretch">
              {/* 分组标记：桌面竖排（图标 + 首两字）；移动端隐藏 */}
              <div className="hidden xl:mb-0.5 xl:flex xl:flex-col xl:items-center xl:gap-1" title={groupTitle(key)}>
                <GroupIcon className="h-3 w-3 text-ink-muted" aria-hidden />
                <span className="text-[9px] uppercase tracking-widest text-ink-muted">{groupTitle(key).slice(0, 2)}</span>
              </div>
              <div className="hidden w-6 shrink-0 self-center border-t border-line-subtle xl:block" aria-hidden />
              {modules.map((module) => {
                const Icon = iconForModule(module.id);
                const active = !isCurriculum && !isInsights && activeModule === module.id;
                const loc = localizeModuleMeta(module, locale);
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => goModule(module.id)}
                    title={`${module.stage} · ${loc.title}`}
                    aria-label={`${module.stage} · ${loc.title}`}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-colors xl:w-full ${
                      active
                        ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                        : 'border-transparent text-ink-secondary hover:bg-bg-raised hover:text-ink-primary'
                    }`}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-accent-primary" aria-hidden />}
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="text-[10px] font-medium leading-none">{module.stage}</span>
                    <span className="w-full truncate text-center text-[10px] leading-tight opacity-80">{loc.shortTitle}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* 课程 / 洞察入口 */}
      <div className="mt-1 flex items-center justify-center gap-1 border-t border-line-subtle pt-1.5 xl:flex-col">
        <button
          type="button"
          onClick={() => setSimPanelView(isCurriculum ? 'module' : 'curriculum')}
          aria-pressed={isCurriculum}
          aria-label={t('shell.railCurriculum')}
          title={t('shell.railCurriculum')}
          className={`grid h-9 w-9 place-items-center rounded-xl border transition-colors ${
            isCurriculum
              ? 'border-accent-measure/60 bg-accent-measure/10 text-accent-measure'
              : 'border-transparent text-ink-secondary hover:bg-bg-raised hover:text-ink-primary'
          }`}
        >
          <Target className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setSimPanelView(isInsights ? 'module' : 'insights')}
          aria-pressed={isInsights}
          aria-label={t('shell.railInsights')}
          title={t('shell.railInsights')}
          className={`grid h-9 w-9 place-items-center rounded-xl border transition-colors ${
            isInsights
              ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
              : 'border-transparent text-ink-secondary hover:bg-bg-raised hover:text-ink-primary'
          }`}
        >
          <BarChart3 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
