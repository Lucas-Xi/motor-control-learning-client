import { BarChart3, ChevronLeft, ShieldCheck, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/useI18n';
import { useUIStore } from '../../store/uiStore';
import { useInsightsStore } from '../../store/insightsStore';
import { Button } from '../ui/Button';
import { MistakeBookPanel } from './MistakeBookPanel';
import { HeatmapPanel } from './HeatmapPanel';
import { WeaknessAdvicePanel } from './WeaknessAdvicePanel';
import { CodeLabProgressPanel } from './CodeLabProgressPanel';

/**
 * 学习洞察主视图：在 SimulationPanel 中央展示，简单的纵向 3 块面板布局：
 *  1. 弱项推荐（顶部 —— 看完直接行动）
 *  2. 错题本（中间 —— 主要复盘内容）
 *  3. 学习热力图（底部 —— 整体可视化）
 *
 * 与 CurriculumPanel 同套路：onLeaveInsights 让用户切回 module 视图。
 * 隐私角标：明确告诉用户所有数据仅本地持久化。
 */
export function InsightsView() {
  const { t } = useI18n();
  const setSimPanelView = useUIStore((s) => s.setSimPanelView);
  const clearAll = useInsightsStore((s) => s.clearAll);

  const onLeave = () => setSimPanelView('module');
  const onClearAll = () => {
    if (window.confirm(t('insights.clearConfirm'))) {
      clearAll();
    }
  };

  return (
    <section className="space-y-4" aria-label={t('insights.viewAria')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption uppercase tracking-[0.22em] text-ink-muted">learning insights</p>
          <h2 className="mt-1 flex items-center gap-2 font-display text-display text-ink-primary">
            <BarChart3 className="h-6 w-6 text-accent-primary" aria-hidden />
            {t('insights.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-body text-ink-secondary">{t('insights.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-md border border-accent-measure/30 bg-accent-measure/10 px-2 py-1 text-caption text-accent-measure"
            title={t('insights.localOnlyTitle')}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            {t('insights.localOnlyBadge')}
          </span>
          <Button variant="danger" onClick={onClearAll} aria-label={t('insights.clearAllAria')}>
            <Trash2 className="h-4 w-4" aria-hidden />
            {t('insights.clearAllButton')}
          </Button>
          <Button variant="ghost" onClick={onLeave} aria-label={t('insights.backAria')}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t('insights.backButton')}
          </Button>
        </div>
      </header>

      <WeaknessAdvicePanel />
      <CodeLabProgressPanel />
      <MistakeBookPanel />
      <HeatmapPanel />
    </section>
  );
}
