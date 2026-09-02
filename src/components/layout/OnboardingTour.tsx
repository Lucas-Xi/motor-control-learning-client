import { GraduationCap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { usePersistentState } from '../../utils/usePersistentState';
import { useUIStore } from '../../store/uiStore';

/**
 * 新手引导（v0.2）：首次访问时右下角三步卡片。
 *  - 选择模块（图标栏 / Ctrl+K）
 *  - 拖参数看现象（顺带演示性展开参数坞）
 *  - 动手写代码（Code Lab）
 * 完成或跳过后持久化 'tour.done'，不再出现。AboutModal / 设置里可重看。
 */
export function OnboardingTour() {
  const { t } = useI18n();
  const [done, setDone] = usePersistentState('tour.done', false);
  const setTourDoneStore = useUIStore((s) => s.setTourDone);
  const setParamsDockOpen = useUIStore((s) => s.setParamsDockOpen);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  // 首屏先画完再出现（600ms），避免引导卡片抢首屏注意力
  useEffect(() => {
    if (done) {
      setTourDoneStore(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), 600);
    return () => window.clearTimeout(timer);
  }, [done, setTourDoneStore]);

  const finish = () => {
    setVisible(false);
    setDone(true);
    setTourDoneStore(true);
  };

  // 第 2 步演示性展开参数坞（让学员直观看到"参数在哪"）
  useEffect(() => {
    if (visible && step === 1) setParamsDockOpen(true);
  }, [visible, step, setParamsDockOpen]);

  if (!visible || done) return null;

  const steps = [
    { title: t('shell.tourStep1Title'), body: t('shell.tourStep1Body') },
    { title: t('shell.tourStep2Title'), body: t('shell.tourStep2Body') },
    { title: t('shell.tourStep3Title'), body: t('shell.tourStep3Body') },
  ];
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-label={t('shell.tourBadge')}
      className="fixed bottom-4 right-4 z-[60] w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-accent-primary/40 bg-bg-surface p-4 shadow-2xl"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent-primary/40 bg-accent-primary/10 text-accent-primary">
          <GraduationCap className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-caption font-medium uppercase tracking-[0.18em] text-accent-primary">{t('shell.tourBadge')}</span>
        <span className="ml-auto flex items-center gap-1" aria-hidden>
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent-primary' : i < step ? 'bg-accent-measure' : 'bg-line-strong'}`} />
          ))}
        </span>
      </div>
      <h2 className="text-title text-ink-primary">{current.title}</h2>
      <p className="mt-1.5 text-caption leading-relaxed text-ink-secondary">{current.body}</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={finish}
          className="rounded-lg px-3 py-1.5 text-caption text-ink-muted transition-colors hover:text-ink-primary"
        >
          {t('shell.tourSkip')}
        </button>
        <button
          type="button"
          onClick={() => (isLast ? finish() : setStep((v) => v + 1))}
          className="rounded-lg border border-accent-primary/50 bg-accent-primary/15 px-3 py-1.5 text-caption font-medium text-accent-primary transition-colors hover:bg-accent-primary/25"
        >
          {isLast ? t('shell.tourFinish') : t('shell.tourNext')}
        </button>
      </div>
    </div>
  );
}
