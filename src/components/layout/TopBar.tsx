import { Maximize2, Pause, Play, RotateCcw, StepForward } from 'lucide-react';
import { useSimulationStore } from '../../store/simulationStore';
import { Button } from '../ui/Button';
import { Tabs } from '../ui/Tabs';

export function TopBar() {
  const mode = useSimulationStore((state) => state.mode);
  const running = useSimulationStore((state) => state.running);
  const setMode = useSimulationStore((state) => state.setMode);
  const setRunning = useSimulationStore((state) => state.setRunning);
  const step = useSimulationStore((state) => state.step);
  const resetTime = useSimulationStore((state) => state.resetTime);
  const toggleFullScreen = useSimulationStore((state) => state.toggleFullScreen);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-subtle bg-bg-surface px-3 py-2">
      <div className="flex items-center gap-2 text-caption text-ink-muted">
        <span className={`h-2 w-2 rounded-full ${running ? 'bg-accent-measure' : 'bg-ink-muted'}`} />
        <span className="uppercase tracking-[0.18em]">{running ? 'RUN' : 'HOLD'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={mode} onChange={setMode} options={[{ value: 'teach', label: '教学' }, { value: 'lab', label: '实验' }]} />
        <Button variant={running ? 'danger' : 'primary'} onClick={() => setRunning(!running)}>
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? '暂停' : '运行'}
        </Button>
        <Button onClick={() => step(0.005)}><StepForward className="h-4 w-4" />单步 5ms</Button>
        <Button onClick={resetTime}><RotateCcw className="h-4 w-4" />归零</Button>
        <Button onClick={toggleFullScreen}><Maximize2 className="h-4 w-4" />全屏</Button>
      </div>
    </header>
  );
}
