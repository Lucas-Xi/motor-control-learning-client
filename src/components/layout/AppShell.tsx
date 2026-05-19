import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Sliders, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SimulationPanel } from './SimulationPanel';
import { ParameterPanel } from './ParameterPanel';
import { useSimulationStore } from '../../store/simulationStore';

/**
 * WaveformPanel 拖入 lazy 边界（performance audit R2）：
 * 它内部直接 import recharts + 一堆 chart 子组件（DQ/PWM/StepResponse/ThreePhase/BenchScope），
 * 直接渲染会把 charts chunk (gzip 120 KB) 拉进首屏关键路径。
 * 切成 lazy 后，charts chunk 只在浏览器空闲后或用户实际进入相关模块时才加载。
 */
const WaveformPanel = lazy(() =>
  import('./WaveformPanel').then((m) => ({ default: m.WaveformPanel })),
);

function WaveformFallback() {
  return (
    <div className="mt-4 rounded-2xl border border-line-subtle bg-bg-surface px-3 py-6 text-center text-caption text-ink-muted">
      波形面板加载中…
    </div>
  );
}

export function AppShell() {
  const fullScreen = useSimulationStore((state) => state.fullScreen);
  const activeModule = useSimulationStore((state) => state.activeModule);
  const last = useRef<number | null>(null);
  // 移动端参数抽屉开关：默认折叠，节省主区面积；切模块自动关闭，避免遮当前内容
  const [paramsOpen, setParamsOpen] = useState(false);
  useEffect(() => {
    setParamsOpen(false);
  }, [activeModule]);
  // ESC 关闭抽屉
  useEffect(() => {
    if (!paramsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setParamsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paramsOpen]);

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
    <div className="relative min-h-screen bg-bg-base p-3 text-ink-primary md:p-4">
      <div className={`relative z-10 mx-auto grid max-w-[1880px] grid-cols-1 gap-4 ${fullScreen ? '' : 'xl:grid-cols-[280px_minmax(0,1fr)]'}`}>
        {!fullScreen && <Sidebar />}
        <div className="grid min-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-4">
          <TopBar />
          <main id="main" tabIndex={-1} className={`grid min-h-0 grid-cols-1 gap-4 ${fullScreen ? '' : 'xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]'}`}>
            <div className="min-h-0">
              <SimulationPanel />
              <WaveformPanel />
              {/* 移动端：在 SimulationPanel 与 WaveformPanel 之后插占位提示用户去打开抽屉拿参数 */}
              <div className="mt-4 xl:hidden">
                <button
                  type="button"
                  onClick={() => setParamsOpen(true)}
                  className="mobile-touch-target flex w-full items-center justify-center gap-2 rounded-2xl border border-line-subtle bg-bg-surface px-3 py-3 text-body font-medium text-ink-secondary hover:border-accent-primary/40 hover:text-ink-primary"
                  aria-label="打开参数控制台抽屉"
                >
                  <Sliders className="h-4 w-4" />
                  打开参数控制台
                </button>
              </div>
            </div>
            {!fullScreen && (
              <>
                {/* 桌面端：右侧粘性侧栏 */}
                <div className="hidden xl:block">
                  <ParameterPanel />
                </div>
                {/* 移动端：底部 slide-up 抽屉 */}
                <MobileParamsDrawer open={paramsOpen} onClose={() => setParamsOpen(false)} />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * 移动端参数抽屉：底部 slide-up 形式覆盖屏幕高度的 ~82%。
 * 半透明遮罩点击 / Esc 键关闭 / 顶部抓手关闭。CSS transform 动画，零依赖。
 */
function MobileParamsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 关闭时直接 unmount ParameterPanel：避免 `aside input[type="range"]` 在桌面端误中
  // 隐藏的 drawer ParameterPanel（4 个 slider 而不是 2 个）导致 e2e .nth(2) 找到不可见输入。
  if (!open) {
    return <div className="xl:hidden" aria-hidden="true" />;
  }
  return (
    <div className="xl:hidden" aria-hidden={!open}>
      {/* 半透明遮罩 */}
      <div
        className={`mobile-drawer-overlay fixed inset-0 z-40 bg-black/60 ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      {/* 抽屉本体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="参数控制台抽屉"
        className={`mobile-drawer-slide fixed inset-x-0 bottom-0 z-50 max-h-[82vh] rounded-t-2xl border-t border-line-subtle bg-bg-surface shadow-2xl ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* 抓手 + 关闭按钮 */}
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-3 pb-2 pt-2">
          <span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden />
          <div className="flex-1 text-center text-caption uppercase tracking-[0.18em] text-ink-muted">参数控制台</div>
          <button
            type="button"
            onClick={onClose}
            className="mobile-touch-target inline-flex items-center justify-center rounded-lg border border-line-subtle p-1.5 text-ink-secondary hover:text-ink-primary"
            aria-label="关闭参数抽屉"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* 抽屉内容区：滚动 */}
        <div className="scrollbar-thin max-h-[calc(82vh-48px)] overflow-auto">
          <ParameterPanel />
        </div>
      </div>
    </div>
  );
}
