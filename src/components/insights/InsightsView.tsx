import { BarChart3, ChevronLeft, ShieldCheck, Trash2 } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useInsightsStore } from '../../store/insightsStore';
import { Button } from '../ui/Button';
import { MistakeBookPanel } from './MistakeBookPanel';
import { HeatmapPanel } from './HeatmapPanel';
import { WeaknessAdvicePanel } from './WeaknessAdvicePanel';

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
  const setSimPanelView = useUIStore((s) => s.setSimPanelView);
  const clearAll = useInsightsStore((s) => s.clearAll);

  const onLeave = () => setSimPanelView('module');
  const onClearAll = () => {
    if (window.confirm('确认清空全部学习洞察数据（错题本 / 热力图 / 挑战尝试历史）？此操作不可撤销。')) {
      clearAll();
    }
  };

  return (
    <section className="space-y-4" aria-label="学习洞察视图">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption uppercase tracking-[0.22em] text-ink-muted">learning insights</p>
          <h2 className="mt-1 flex items-center gap-2 font-display text-display text-ink-primary">
            <BarChart3 className="h-6 w-6 text-accent-primary" aria-hidden />
            学习洞察
          </h2>
          <p className="mt-1 max-w-2xl text-body text-ink-secondary">
            收录错题、回看热力图、综合弱项推荐——所有数据仅在浏览器本地保存。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1 rounded-md border border-accent-measure/30 bg-accent-measure/10 px-2 py-1 text-caption text-accent-measure"
            title="所有数据仅本地 localStorage 持久化，不会上传到任何服务器"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            仅本地存储
          </span>
          <Button variant="danger" onClick={onClearAll} aria-label="清空所有学习洞察数据">
            <Trash2 className="h-4 w-4" aria-hidden />
            清空全部
          </Button>
          <Button variant="ghost" onClick={onLeave} aria-label="返回当前模块">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            返回模块
          </Button>
        </div>
      </header>

      <WeaknessAdvicePanel />
      <MistakeBookPanel />
      <HeatmapPanel />
    </section>
  );
}
