import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Sliders, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SimulationPanel } from './SimulationPanel';
import { ParameterPanel } from './ParameterPanel';
import { CommandPalette } from './CommandPalette';
import { OnboardingTour } from './OnboardingTour';
import { useSimulationStore } from '../../store/simulationStore';
import { useUIStore } from '../../store/uiStore';
import { useI18n } from '../../i18n/useI18n';

/**
 * 双栏沉浸壳层（v0.2）：
 *
 *  ┌─┬──────────────────────────┬─────┐
 *  │栏│ TopBar（全局运行控制）      │ 参数│
 *  │ │ ┌──────────────────────┐ │ 坞  │
 *  │ │ │ SimulationPanel      │ │(默认│
 *  │ │ │ （模块标题 + 内容）    │ │ 收起)│
 *  │ │ └──────────────────────┘ │     │
 *  │ │ WaveformPanel（可折叠）   │     │
 *  └─┴──────────────────────────┴─────┘
 *
 * - 左：76px 图标栏（Sidebar，模块分组导航 + 课程/洞察）
 * - 中：内容优先，参数坞默认收起；xl+ 时以推挤式 dock 展开（图表随
 *   ResponsiveContainer 自适应重排），<xl 时为底部 slide-up 抽屉
 * - 底部波形区可整体折叠（WaveformPanel 内聚实现）
 * - Ctrl+K 命令面板 / 首次访问新手引导
 */
const WaveformPanel = lazy(() =>
  import('./WaveformPanel').then((m) => ({ default: m.WaveformPanel })),
);

/** 断点探测：参数坞在 ≥1280px 走桌面 dock，否则走底部抽屉（二者只挂载其一）。 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export function AppShell() {
  const fullScreen = useSimulationStore((state) => state.fullScreen);
  const activeModule = useSimulationStore((state) => state.activeModule);
  const paramsDockOpen = useUIStore((state) => state.paramsDockOpen);
  const setParamsDockOpen = useUIStore((state) => state.setParamsDockOpen);
  const isDesktop = useIsDesktop();
  const { t } = useI18n();
  const last = useRef<number | null>(null);

  // 切模块自动收起参数坞——仅小屏（底部抽屉会遮内容）；桌面 dock 保持展开，
  // 方便对照滑块比较不同模块的响应
  useEffect(() => {
    if (!isDesktop) setParamsDockOpen(false);
  }, [activeModule, isDesktop, setParamsDockOpen]);

  // Esc 收起参数坞
  useEffect(() => {
    if (!paramsDockOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setParamsDockOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paramsDockOpen, setParamsDockOpen]);

  // 仿真时钟：rAF 驱动 step(dt)
  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      if (last.current === null) last.current = now;
      const dt = Math.min(0.05, (now - last.current) / 1000);
      last.current = now;
      const { running, step } = useSimulationStore.getState();
      if (running) step(dt);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative min-h-screen bg-bg-base p-2 text-ink-primary md:p-3">
      <div className="relative z-10 mx-auto flex max-w-[1880px] flex-col gap-2 xl:h-[calc(100vh-1.5rem)] xl:flex-row xl:gap-3">
        {!fullScreen && <Sidebar />}
        <div className="flex min-h-[calc(100vh-1.5rem)] min-w-0 flex-col gap-2 xl:h-full xl:min-h-0 xl:flex-1 xl:gap-3">
          <TopBar />
          {/* 内容行：左内容 + 右参数坞（仅桌面 dock） */}
          <main id="main" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:gap-3">
            <div className="min-h-0 min-w-0 flex-1">
              <SimulationPanel />
              <Suspense fallback={null}>
                <WaveformPanel />
              </Suspense>
              {/* 移动端：内容下方提示打开参数坞 */}
              <button
                type="button"
                onClick={() => setParamsDockOpen(true)}
                className="mobile-touch-target mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-line-subtle bg-bg-surface px-3 py-3 text-body font-medium text-ink-secondary transition-colors hover:border-accent-primary/40 hover:text-ink-primary xl:hidden"
                aria-label={t('shell.paramsDockShowAria')}
              >
                <Sliders className="h-4 w-4" aria-hidden />
                {t('shell.paramsDockShow')}
              </button>
            </div>
            {/* 桌面参数坞：推挤式展开（宽度过渡），图表自动重排。
                dock / 移动抽屉按断点只挂载其一，保证 ParameterPanel 单实例。 */}
            {!fullScreen && isDesktop && paramsDockOpen && (
              <div className="w-[360px] shrink-0 overflow-hidden 2xl:w-[400px]">
                <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-line-subtle bg-bg-surface">
                  <div className="flex h-10 items-center justify-between border-b border-line-subtle px-3">
                    <span className="text-caption font-medium uppercase tracking-[0.18em] text-ink-muted">{t('shell.paramsDockTitle')}</span>
                    <button
                      type="button"
                      onClick={() => setParamsDockOpen(false)}
                      aria-label={t('shell.paramsDockHideAria')}
                      className="grid h-7 w-7 place-items-center rounded-lg border border-line-subtle text-ink-secondary transition-colors hover:text-ink-primary"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <div className="scrollbar-thin h-[calc(100%-2.5rem)] overflow-y-auto">
                    <ParameterPanel />
                  </div>
                </div>
              </div>
            )}
            {/* 移动端底部抽屉 */}
            {!fullScreen && !isDesktop && <MobileParamsDock open={paramsDockOpen} onClose={() => setParamsDockOpen(false)} />}
          </main>
        </div>
      </div>
      <CommandPalette />
      <OnboardingTour />
    </div>
  );
}

/**
 * 移动端参数坞：底部 slide-up 抽屉（<xl 生效）。
 * 关闭时 unmount ParameterPanel，避免 e2e 的 `aside input[type="range"]`
 * 在桌面 dock 关闭时命中隐藏输入（历史教训，见原 AppShell 注释）。
 */
function MobileParamsDock({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  if (!open) {
    return <div className="xl:hidden" aria-hidden="true" />;
  }
  return (
    <div className="xl:hidden" aria-hidden={!open}>
      <div
        className="mobile-drawer-overlay fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('shell.paramsDockTitle')}
        className="mobile-drawer-slide fixed inset-x-0 bottom-0 z-50 max-h-[82vh] rounded-t-2xl border-t border-line-subtle bg-bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-3 pb-2 pt-2">
          <span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden />
          <div className="flex-1 text-center text-caption uppercase tracking-[0.18em] text-ink-muted">{t('shell.paramsDockTitle')}</div>
          <button
            type="button"
            onClick={onClose}
            className="mobile-touch-target inline-flex items-center justify-center rounded-lg border border-line-subtle p-1.5 text-ink-secondary transition-colors hover:text-ink-primary"
            aria-label={t('shell.closeParamsDrawerAria')}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="scrollbar-thin max-h-[calc(82vh-48px)] overflow-auto">
          <ParameterPanel />
        </div>
      </div>
    </div>
  );
}
