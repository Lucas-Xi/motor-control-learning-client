import { Info, Maximize2, Pause, Play, RotateCcw, StepForward } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import { LanguageChip } from '../../i18n/LanguageChip';
import { Button } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import { ThemeToggle } from '../ui/ThemeToggle';
import { AboutModal } from '../about/AboutModal';

/**
 * 移动端图标按钮：默认只显示图标（节省横向空间），
 * 长按 ~500ms 弹 tooltip 显示中文标签，桌面端 hover 也展示。
 * 使用 .touch-tooltip + data-tip-open 控制气泡。
 */
function IconBtn({
  label,
  variant = 'ghost',
  onClick,
  children,
}: {
  label: string;
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  onClick: () => void;
  children: ReactNode;
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);
  const startHold = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTipOpen(true), 480);
  };
  const cancelHold = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setTipOpen(false);
  };
  return (
    <span className="touch-tooltip mobile-touch-target inline-flex" data-tip={label} data-tip-open={tipOpen}>
      <Button
        variant={variant}
        onClick={onClick}
        aria-label={label}
        title={label}
        className="px-2.5 sm:px-3"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
      >
        {children}
        {/* 中等屏起显示文本，<sm 仅图标 */}
        <span className="hidden truncate sm:inline">{label}</span>
      </Button>
    </span>
  );
}

export function TopBar() {
  const mode = useSimulationStore((state) => state.mode);
  const running = useSimulationStore((state) => state.running);
  const setMode = useSimulationStore((state) => state.setMode);
  const setRunning = useSimulationStore((state) => state.setRunning);
  const step = useSimulationStore((state) => state.step);
  const resetTime = useSimulationStore((state) => state.resetTime);
  const toggleFullScreen = useSimulationStore((state) => state.toggleFullScreen);
  const { t } = useI18n();
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutLabel = t('shell.aboutButton');

  return (
    <header role="banner" aria-label={t('shell.topbarAria')} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line-subtle bg-bg-surface px-3 py-2 sm:gap-3">
      <div className="flex items-center gap-2 text-caption text-ink-muted">
        <span className={`h-2 w-2 rounded-full ${running ? 'bg-accent-measure' : 'bg-ink-muted'}`} />
        <span className="uppercase tracking-[0.18em]">{running ? t('shell.runStateRun') : t('shell.runStateHold')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        <LanguageChip />
        <Tabs
          value={mode}
          onChange={setMode}
          options={[
            { value: 'teach', label: t('shell.modeTeach') },
            { value: 'lab', label: t('shell.modeLab') },
          ]}
        />
        <IconBtn label={running ? t('shell.actionPause') : t('shell.actionRun')} variant={running ? 'danger' : 'primary'} onClick={() => setRunning(!running)}>
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </IconBtn>
        <IconBtn label={t('shell.actionStep')} onClick={() => step(0.005)}>
          <StepForward className="h-4 w-4" />
        </IconBtn>
        <IconBtn label={t('shell.actionResetTime')} onClick={resetTime}>
          <RotateCcw className="h-4 w-4" />
        </IconBtn>
        <IconBtn label={t('shell.actionFullscreen')} onClick={toggleFullScreen}>
          <Maximize2 className="h-4 w-4" />
        </IconBtn>
        <IconBtn label={aboutLabel} onClick={() => setAboutOpen(true)}>
          <Info className="h-4 w-4" />
        </IconBtn>
      </div>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </header>
  );
}
