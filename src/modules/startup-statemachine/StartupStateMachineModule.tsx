import { Line, LineChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useMemo } from 'react';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n, type TKey } from '../../i18n/useI18n';
import { simulateStartup } from '../../simulation/math/startup';
import type { StartupState } from '../../simulation/engine/types';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { ObserverTransitionCard } from '../../components/charts/ObserverTransitionCard';
import { SerialCompareStartupCard } from './SerialCompareStartupCard';
import { FrictionCurveCard } from './FrictionCurveCard';
import { IFStartupCard } from './IFStartupCard';

const STATES: StartupState[] = ['idle', 'precharge', 'align', 'open-loop', 'hfi', 'bemf', 'fieldweak'];

/** simulation 层 STATE_DESCRIPTIONS（中文，禁改）的 TKey 映射。 */
const STATE_NAME_KEYS: Record<StartupState, TKey> = {
  idle: 'startupStateMachine.stateIdle',
  precharge: 'startupStateMachine.statePrecharge',
  align: 'startupStateMachine.stateAlign',
  'open-loop': 'startupStateMachine.stateOpenLoop',
  hfi: 'startupStateMachine.stateHfi',
  bemf: 'startupStateMachine.stateBemf',
  fieldweak: 'startupStateMachine.stateFieldweak',
  fault: 'startupStateMachine.stateFault',
};

const STATE_BRIEF_KEYS: Record<StartupState, TKey> = {
  idle: 'startupStateMachine.stateIdleBrief',
  precharge: 'startupStateMachine.statePrechargeBrief',
  align: 'startupStateMachine.stateAlignBrief',
  'open-loop': 'startupStateMachine.stateOpenLoopBrief',
  hfi: 'startupStateMachine.stateHfiBrief',
  bemf: 'startupStateMachine.stateBemfBrief',
  fieldweak: 'startupStateMachine.stateFieldweakBrief',
  fault: 'startupStateMachine.stateFaultBrief',
};

function useStartupSamples() {
  const params = useSimulationStore((s) => s.startup);
  return useMemo(() => ({ params, samples: simulateStartup(params) }), [params]);
}

function StateMachineDiagram() {
  const { t } = useI18n();
  const { samples } = useStartupSamples();
  const time = useSimulationStore((s) => s.time);
  // 当前激活的 state：取仿真到当前 time 处的 state
  const idx = Math.min(samples.length - 1, Math.floor(time * 1000 / 10));
  const activeState = samples[idx]?.state ?? 'idle';

  return (
    <Card
      title={t('startupStateMachine.smTitle')}
      eyebrow={t('startupStateMachine.smEyebrow')}
      density="compact"
      action={<FidelityBadge level="simplified" hint={t('startupStateMachine.fidelityHint')} />}
    >
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        {STATES.map((s, i) => {
          const isActive = s === activeState;
          const isPast = STATES.indexOf(activeState) > i;
          return (
            <div key={s} className={`relative rounded-lg border p-3 transition-colors ${
              isActive
                ? 'border-accent-primary/60 bg-accent-primary/[0.10]'
                : isPast
                  ? 'border-accent-measure/30 bg-accent-measure/[0.04]'
                  : 'border-line-subtle bg-bg-base'
            }`}>
              <div className="mb-1 flex items-center gap-2">
                <span className={`grid h-5 w-5 place-items-center rounded text-caption font-medium ${
                  isActive ? 'bg-accent-primary/20 text-accent-primary' :
                  isPast ? 'bg-accent-measure/20 text-accent-measure' : 'bg-line-subtle text-ink-muted'
                }`}>{i}</span>
                <span className={`text-body font-medium ${isActive ? 'text-accent-primary' : 'text-ink-primary'}`}>
                  {t(STATE_NAME_KEYS[s])}
                </span>
              </div>
              <p className="text-caption leading-relaxed text-ink-secondary">{t(STATE_BRIEF_KEYS[s])}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SpeedChart() {
  const { t } = useI18n();
  const { samples } = useStartupSamples();
  // 在转速曲线上标注每个状态切换点
  const transitions: Array<{ t: number; label: string }> = [];
  let lastState = samples[0]?.state;
  for (const s of samples) {
    if (s.state !== lastState) {
      transitions.push({ t: s.t, label: t(STATE_NAME_KEYS[s.state]) });
      lastState = s.state;
    }
  }
  return (
    <Card title={t('startupStateMachine.speedChartTitle')} eyebrow={t('startupStateMachine.speedChartEyebrow')} density="compact">
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis yAxisId="rpm" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <YAxis yAxisId="iq" orientation="right" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            {transitions.map((tr, i) => (
              <ReferenceLine key={i} yAxisId="rpm" x={tr.t} stroke="#5d7793" strokeDasharray="2 3"
                label={{ value: tr.label, fill: '#9eb5cb', fontSize: 9, position: 'top' }} />
            ))}
            <Line yAxisId="rpm" type="monotone" dataKey="rpmRef" dot={false} stroke="#9eb5cb" strokeDasharray="4 4" name={t('startupStateMachine.legendRpmRef')} isAnimationActive={false} />
            <Line yAxisId="rpm" type="monotone" dataKey="rpm" dot={false} stroke="#43f7b5" strokeWidth={2} name={t('startupStateMachine.legendRpmActual')} isAnimationActive={false} />
            <Line yAxisId="iq" type="monotone" dataKey="iqA" dot={false} stroke="#ffb84d" strokeWidth={1.5} name={t('startupStateMachine.legendIqA')} isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function Probe() {
  const { t } = useI18n();
  const { params } = useStartupSamples();
  return (
    <>
      <Card title={t('startupStateMachine.paramsTitle')} eyebrow={t('startupStateMachine.paramsEyebrow')} density="compact">
        <div className="grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('startupStateMachine.paramTargetRpm')} </span>
            <span className="text-ink-primary">{formatNumber(params.targetRpm, 0)} rpm</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('startupStateMachine.paramAccelRamp')} </span>
            <span className="text-ink-primary">{formatNumber(params.accelRampRpmS, 0)} rpm/s</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('startupStateMachine.paramAlignDur')} </span>
            <span className="text-ink-primary">{formatNumber(params.alignDurationMs, 0)} ms</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('startupStateMachine.paramHfiHandoff')} </span>
            <span className="text-ink-primary">{formatNumber(params.hfiHandoffRpm, 0)} rpm</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('startupStateMachine.paramBemfHandoff')} </span>
            <span className="text-ink-primary">{formatNumber(params.bemfHandoffRpm, 0)} rpm</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('startupStateMachine.paramFieldweakRpm')} </span>
            <span className="text-ink-primary">{formatNumber(params.fieldweakRpm, 0)} rpm</span>
          </div>
        </div>
      </Card>
      <Card title={t('startupStateMachine.antiSlugTitle')} eyebrow={t('startupStateMachine.antiSlugEyebrow')} density="compact">
        <p className="text-body leading-relaxed text-ink-secondary">
          {t('startupStateMachine.antiSlugLead')} <span className="text-accent-fault">{t('startupStateMachine.antiSlugTerm')}</span>{' '}
          {t('startupStateMachine.antiSlugMid')} <span className="text-ink-primary">{formatNumber(params.accelRampRpmS, 0)} rpm/s</span>{' '}
          {t('startupStateMachine.antiSlugTail')}
        </p>
      </Card>
      <Card title={t('startupStateMachine.handOffTitle')} eyebrow={t('startupStateMachine.handOffEyebrow')} density="compact">
        <ul className="space-y-1 text-caption text-ink-secondary">
          <li><span className="text-accent-primary">precharge</span>{t('startupStateMachine.handOffPrecharge')}</li>
          <li><span className="text-accent-primary">align</span>{t('startupStateMachine.handOffAlign')}</li>
          <li><span className="text-accent-primary">open-loop</span>{t('startupStateMachine.handOffOpenLoop')}</li>
          <li><span className="text-accent-primary">hfi</span>{t('startupStateMachine.handOffHfi')}</li>
          <li><span className="text-accent-primary">bemf</span>{t('startupStateMachine.handOffBemf')}</li>
          <li><span className="text-accent-primary">fieldweak</span>{t('startupStateMachine.handOffFieldweak')}</li>
        </ul>
      </Card>
      <ObserverTransitionCard />
      <SerialCompareStartupCard />
    </>
  );
}

export function StartupStateMachineModule() {
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <StateMachineDiagram />
          <SpeedChart />
          <FrictionCurveCard />
          <IFStartupCard />
        </div>
      }
      probe={<Probe />}
      concept={<ConceptNotes moduleId="startup-statemachine" />}
    />
  );
}
