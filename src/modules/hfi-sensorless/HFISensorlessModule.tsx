import { Line, LineChart, CartesianGrid, ReferenceLine, ReferenceArea, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useMemo } from 'react';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import { simulateHFI, evaluateHFI } from '../../simulation/math/hfi';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { SerialCompareHFICard } from './SerialCompareHFICard';
import { HfiSignalChainCard } from './HfiSignalChainCard';
import { ObserverBlendCard } from './ObserverBlendCard';

function useHfiSamples() {
  const params = useSimulationStore((s) => s.hfi);
  return useMemo(() => ({
    params,
    samples: simulateHFI(params),
    metrics: evaluateHFI(simulateHFI(params), params.saliencyRatio),
  }), [params]);
}

function Primary() {
  const { t } = useI18n();
  const { params, samples, metrics } = useHfiSamples();
  const tone = metrics.lockTimeMs && metrics.lockTimeMs < 30 ? 'measure' : metrics.lockTimeMs ? 'warn' : 'fault';
  const status = metrics.lockTimeMs
    ? t('hfiSensorless.primaryStatusLocked').replace('{v}', formatNumber(metrics.lockTimeMs, 1))
    : t('hfiSensorless.statusUnlocked');
  const toneClass = tone === 'measure' ? 'text-accent-measure border-accent-measure/40 bg-accent-measure/10'
    : tone === 'warn' ? 'text-accent-warn border-accent-warn/40 bg-accent-warn/10'
    : 'text-accent-fault border-accent-fault/40 bg-accent-fault/10';
  return (
    <Card
      title={t('hfiSensorless.primaryTitle')}
      eyebrow={t('hfiSensorless.primaryEyebrow')}
      density="compact"
      action={
        <div className="flex gap-2">
          <FidelityBadge level="physical" hint={t('hfiSensorless.fidelityHint')} />
          <span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${toneClass}`}>{status}</span>
        </div>
      }
    >
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} domain={[0, 360]} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            <ReferenceLine y={0} stroke="#1e2a3d" />
            <Line type="monotone" dataKey="trueDeg" dot={false} stroke="#43f7b5" strokeWidth={2} name={t('hfiSensorless.legendTrueTheta')} isAnimationActive={false} />
            <Line type="monotone" dataKey="estDeg" dot={false} stroke="#34d6ff" strokeWidth={2} name={t('hfiSensorless.legendEstTheta')} isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {t('hfiSensorless.primaryInjectDesc')
          .replace('{v}', formatNumber(params.injectVoltage, 0))
          .replace('{f}', formatNumber(params.injectFreqHz, 0))
          .replace('{r}', formatNumber(params.saliencyRatio, 2))
          .replace('{g}', formatNumber(metrics.saliencyGainPct, 1))}
      </p>
    </Card>
  );
}

function ErrorChart() {
  const { t } = useI18n();
  const { samples } = useHfiSamples();
  return (
    <Card title={t('hfiSensorless.errorChartTitle')} eyebrow={t('hfiSensorless.errorChartEyebrow')} density="compact">
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} domain={[-180, 180]} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <ReferenceArea y1={-5} y2={5} fill="#43f7b5" fillOpacity={0.08} />
            <ReferenceLine y={5} stroke="#43f7b5" strokeDasharray="3 4" label={{ value: t('hfiSensorless.lockBandLabel'), fill: '#43f7b5', fontSize: 10, position: 'insideTopRight' }} />
            <ReferenceLine y={-5} stroke="#43f7b5" strokeDasharray="3 4" />
            <Line type="monotone" dataKey="errorDeg" dot={false} stroke="#ff5c7a" strokeWidth={1.5} name={t('hfiSensorless.errorLegend')} isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function InjectionChart() {
  const { t } = useI18n();
  const { samples } = useHfiSamples();
  return (
    <Card title={t('hfiSensorless.injectChartTitle')} eyebrow={t('hfiSensorless.injectChartEyebrow')} density="compact">
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Line type="monotone" dataKey="injectV" dot={false} stroke="#34d6ff" strokeWidth={1.2} name={t('hfiSensorless.legendInjectV')} isAnimationActive={false} />
            <Line type="monotone" dataKey="responseI" dot={false} stroke="#ffb84d" strokeWidth={1.5} name={t('hfiSensorless.legendResponseI')} isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function Probe() {
  const { t } = useI18n();
  const { params, metrics } = useHfiSamples();
  return (
    <>
      <ErrorChart />
      <InjectionChart />
      <HfiSignalChainCard />
      <Card title={t('hfiSensorless.keyMetricsTitle')} eyebrow={t('hfiSensorless.keyMetricsEyebrow')} density="compact">
        <div className="grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('hfiSensorless.metricLockTime')} </span>
            <span className="text-ink-primary">{metrics.lockTimeMs === null ? t('hfiSensorless.notLocked') : `${formatNumber(metrics.lockTimeMs, 1)}ms`}</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('hfiSensorless.metricFinalError')} </span>
            <span className="text-ink-primary">{formatNumber(metrics.finalErrorDeg, 2)}°</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('hfiSensorless.metricSaliencyGain')} </span>
            <span className="text-ink-primary">{formatNumber(metrics.saliencyGainPct, 1)}%</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">{t('hfiSensorless.metricInjectFreq')} </span>
            <span className="text-ink-primary">{formatNumber(params.injectFreqHz, 0)} Hz</span>
          </div>
        </div>
      </Card>
      <Card title={t('hfiSensorless.whenToUseTitle')} eyebrow={t('hfiSensorless.whenToUseEyebrow')} density="compact">
        <ul className="space-y-1.5 text-body text-ink-secondary">
          <li>· <span className="text-ink-primary">{t('hfiSensorless.whenToUseEmph1')}</span>{t('hfiSensorless.whenToUseRest1')}</li>
          <li>· <span className="text-ink-primary">{t('hfiSensorless.whenToUseEmph2')}</span>{t('hfiSensorless.whenToUseRest2')}</li>
          <li>· <span className="text-ink-primary">{t('hfiSensorless.whenToUseEmph3')}</span>{t('hfiSensorless.whenToUseRest3')}</li>
          <li>· <span className="text-ink-primary">{t('hfiSensorless.whenToUseEmph4')}</span>{t('hfiSensorless.whenToUseRest4')}</li>
          <li>· <span className="text-ink-primary">{t('hfiSensorless.whenToUseEmph5')}</span>{t('hfiSensorless.whenToUseRest5')}</li>
        </ul>
      </Card>
      <ObserverBlendCard />
      <SerialCompareHFICard />
    </>
  );
}

export function HFISensorlessModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="hfi-sensorless" />} />;
}
