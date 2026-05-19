import { Activity, AlertTriangle, Gauge, TimerReset } from 'lucide-react';
import { useMemo } from 'react';
import { StepResponseChart } from '../../components/charts/StepResponseChart';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { calculateStepMetrics, simulatePidStepResponse } from '../../simulation/math/pid';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { useI18n } from '../../i18n/useI18n';
import { AntiWindupCompareCard } from './AntiWindupCompareCard';
import { SerialComparePIDCard } from './SerialComparePIDCard';

type Tone = 'primary' | 'measure' | 'warn' | 'fault';
const toneColor: Record<Tone, string> = {
  primary: 'var(--accent-primary)',
  measure: 'var(--accent-measure)',
  warn: 'var(--accent-warn)',
  fault: 'var(--accent-fault)',
};

function Metric({ label, value, unit, tone = 'primary' }: { label: string; value: string; unit?: string; tone?: Tone }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-3">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="formula text-title font-bold" style={{ color: toneColor[tone] }}>{value}{unit}</p>
    </div>
  );
}

function usePidResult() {
  const pid = useSimulationStore((s) => s.pid);
  return useMemo(() => {
    const data = simulatePidStepResponse(
      { kp: pid.kp, ki: pid.ki, kd: pid.kd },
      pid.target,
      pid.sampleMs / 1000,
      1.2,
      { limit: pid.limit, antiWindup: pid.antiWindup, loadDisturbance: pid.loadDisturbance },
    );
    const metrics = calculateStepMetrics(data, pid.target);
    return { pid, data, metrics, final: data[data.length - 1] };
  }, [pid]);
}

function Primary() {
  const { pid } = usePidResult();
  const { t } = useI18n();
  return (
    <Card
      title={t('pidControl.primaryTitle')}
      eyebrow={t('pidControl.primaryEyebrow')}
      density="compact"
      action={<FidelityBadge level="physical" hint={t('pidControl.primaryFidelityHint')} />}
    >
      <StepResponseChart
        gains={{ kp: pid.kp, ki: pid.ki, kd: pid.kd }}
        target={pid.target}
        sampleMs={pid.sampleMs}
        options={{ limit: pid.limit, antiWindup: pid.antiWindup, loadDisturbance: pid.loadDisturbance }}
      />
    </Card>
  );
}

function Probe() {
  const { pid, metrics, final } = usePidResult();
  const { t } = useI18n();
  const risk = metrics.overshootPercent > 25 || Math.abs(metrics.steadyStateError) > pid.target * 0.2;
  return (
    <>
      <Card title={t('pidControl.metricsTitle')} eyebrow={t('pidControl.metricsEyebrow')} density="compact">
        <div className="grid grid-cols-2 gap-2">
          <Metric label={t('pidControl.metricOvershoot')} value={formatNumber(metrics.overshootPercent, 1)} unit="%" tone={metrics.overshootPercent > 20 ? 'fault' : 'measure'} />
          <Metric label={t('pidControl.metricRise')} value={metrics.riseTime === null ? '--' : formatNumber(metrics.riseTime * 1000, 0)} unit=" ms" tone="primary" />
          <Metric label={t('pidControl.metricSteadyError')} value={formatNumber(metrics.steadyStateError, 3)} tone={Math.abs(metrics.steadyStateError) > 0.2 ? 'warn' : 'measure'} />
          <Metric label={t('pidControl.metricFinalOutput')} value={formatNumber(final?.output ?? 0, 2)} unit=" V" tone="warn" />
        </div>
      </Card>
      <Card title={t('pidControl.tuningTitle')} eyebrow={t('pidControl.tuningEyebrow')} density="compact">
        <div className="space-y-2 text-body text-ink-secondary">
          <div className="flex gap-2"><Gauge className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" /><span><b className="text-ink-primary">{t('pidControl.labelKp')}</b> {t('pidControl.tuningKpHint')}</span></div>
          <div className="flex gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" /><span><b className="text-ink-primary">{t('pidControl.labelKi')}</b> {t('pidControl.tuningKiHint')}</span></div>
          <div className="flex gap-2"><TimerReset className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" /><span><b className="text-ink-primary">{t('pidControl.labelSamplePeriod')}</b> {t('pidControl.tuningSampleHint')}</span></div>
          {risk && <div className="flex gap-2 rounded-lg border border-accent-fault/30 bg-accent-fault/10 p-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-fault" /><span className="text-accent-fault">{t('pidControl.tuningRiskHint')}</span></div>}
        </div>
      </Card>
      <AntiWindupCompareCard />
      <SerialComparePIDCard />
    </>
  );
}

export function PIDControlModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="pid-control" />} />;
}
