import { useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SimulationPanel } from './SimulationPanel';
import { ParameterPanel } from './ParameterPanel';
import { WaveformPanel } from './WaveformPanel';
import { useSimulationStore } from '../../store/simulationStore';

export function AppShell() {
  const fullScreen = useSimulationStore((state) => state.fullScreen);
  const last = useRef<number | null>(null);

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
          <main className={`grid min-h-0 grid-cols-1 gap-4 ${fullScreen ? '' : 'xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]'}`}>
            <div className="min-h-0">
              <SimulationPanel />
              <WaveformPanel />
            </div>
            {!fullScreen && <ParameterPanel />}
          </main>
        </div>
      </div>
    </div>
  );
}
