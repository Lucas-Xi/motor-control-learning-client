import { Line, LineChart, CartesianGrid, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { AlertTriangle, RadioTower, RotateCw } from 'lucide-react';
import { useMemo } from 'react';
import { AssetHero } from '../../components/layout/AssetHero';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { simulateSMO } from '../../simulation/math/smo';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import { SerialCompareSensorlessCard } from './SerialCompareSensorlessCard';
import { SensorNoiseCard } from './SensorNoiseCard';

function useSamples() {
  const params = useSimulationStore((s) => s.sensorless);
  const motor = useSimulationStore((s) => s.motorBasics);
  return useMemo(() => {
    const samples = simulateSMO({
      speedRpm: params.speedRpm,
      polePairs: motor.polePairs,
      rs: params.rs,
      lsMh: params.lsMh,
      fluxLinkage: params.ke,
      smoGain: 80,                       // 滑模增益（教学典型）
      boundaryLayer: 0.5,                // 边界层 0.5A
      lpfCutoffHz: 120,                  // BEMF 低通截止
      pllKp: params.pllKp,
      pllKi: params.pllKi,
      noise: params.noise,
    });
    return { params, samples };
  }, [params, motor.polePairs]);
}

function Primary() {
  const { params, samples } = useSamples();
  const { t } = useI18n();
  const errorMax = Math.max(...samples.map((s) => Math.abs(s.errorDeg)));
  const lowSpeed = params.speedRpm < 500;
  const healthy = errorMax < 5 && !lowSpeed;
  const failing = errorMax > 15 || lowSpeed;
  const tone = failing ? 'fault' : healthy ? 'measure' : 'warn';
  const toneClass = tone === 'fault' ? 'text-accent-fault' : tone === 'measure' ? 'text-accent-measure' : 'text-accent-warn';
  const toneBgClass = tone === 'fault' ? 'bg-accent-fault/10 border-accent-fault/40' : tone === 'measure' ? 'bg-accent-measure/10 border-accent-measure/40' : 'bg-accent-warn/10 border-accent-warn/40';
  const status = failing ? t('sensorlessFoc.statusLost') : healthy ? t('sensorlessFoc.statusLocked') : t('sensorlessFoc.statusMargin');
  return (
    <Card
      title={t('sensorlessFoc.primaryTitle')}
      eyebrow={t('sensorlessFoc.primaryEyebrow')}
      density="compact"
      action={
        <div className="flex items-center gap-2">
          <FidelityBadge level="physical" hint={t('sensorlessFoc.fidelityHint')} />
          <span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${toneBgClass} ${toneClass}`}>
            {status} · {t('sensorlessFoc.peakErrorPrefix')} {formatNumber(errorMax, 1)}°
          </span>
        </div>
      }
    >
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} domain={[-30, 360]} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            <ReferenceArea y1={-30} y2={-10} fill="#ff5c7a" fillOpacity={0.06} />
            <ReferenceArea y1={10} y2={30} fill="#ff5c7a" fillOpacity={0.06} />
            <ReferenceLine y={10} stroke="#ff5c7a" strokeDasharray="3 4" strokeOpacity={0.5}
              label={{ value: t('sensorlessFoc.lockThresholdLabel'), fill: '#ff8aa0', fontSize: 10, position: 'insideTopRight' }} />
            <ReferenceLine y={-10} stroke="#ff5c7a" strokeDasharray="3 4" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="thetaTrue" dot={false} stroke="#43f7b5" strokeWidth={2} name={t('sensorlessFoc.legendTrueTheta')} isAnimationActive={false} />
            <Line type="monotone" dataKey="thetaEst" dot={false} stroke="#34d6ff" strokeWidth={2} name={t('sensorlessFoc.legendSmoEst')} isAnimationActive={false} />
            <Line type="monotone" dataKey="errorDeg" dot={false} stroke="#ff5c7a" strokeWidth={1.4} name={t('sensorlessFoc.legendErrorDeg')} isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        SMO 用电流估算误差作为开关面，开关函数（带边界层 sat）的等效输出经低通滤波即得到 BEMF 估算 z_α / z_β，再用 atan2(-z_α, z_β) + PLL 提取角度。
        {formatNumber(params.speedRpm, 0)} rpm {lowSpeed ? `— ${t('sensorlessFoc.primaryFootnoteLow')}` : `— ${t('sensorlessFoc.primaryFootnoteGood')}`}。
      </p>
    </Card>
  );
}

function ObserverDiagnostic() {
  const { params, samples } = useSamples();
  const { t } = useI18n();
  const last = samples[samples.length - 1];
  const lowSpeedRisk = params.speedRpm < 500 || (last && Math.abs(last.errorDeg) > 8);
  return (
    <Card title={t('sensorlessFoc.diagnosticTitle')} eyebrow={t('sensorlessFoc.diagnosticEyebrow')} density="compact">
      <div className="space-y-2 text-body text-ink-secondary">
        <div className="flex gap-2">
          <RadioTower className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" />
          <span>BEMF ≈ {formatNumber(params.ke * (params.speedRpm * 2 * Math.PI / 60) * 4, 2)} V</span>
        </div>
        <div className="flex gap-2">
          <RotateCw className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" />
          <span>SMO boundary 0.5A · LPF 120Hz · Δθ {last ? formatNumber(last.errorDeg, 2) : '0'}°</span>
        </div>
        {lowSpeedRisk && (
          <div className="flex gap-2 rounded-lg border border-accent-fault/30 bg-accent-fault/[0.08] p-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-fault" />
            <span className="text-accent-fault">{t('sensorlessFoc.diagnosticLowSpeedWarn')}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function SMOInternals() {
  const { samples } = useSamples();
  const { t } = useI18n();
  return (
    <Card title={t('sensorlessFoc.internalsTitle')} eyebrow={t('sensorlessFoc.internalsEyebrow')} density="compact">
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            <Line type="monotone" dataKey="zAlphaLpf" dot={false} stroke="#34d6ff" strokeWidth={1.6} name="z_α (LPF) ≈ BEMF α" isAnimationActive={false} />
            <Line type="monotone" dataKey="switchSurfaceA" dot={false} stroke="#ffb84d" strokeWidth={1.4} name="|i_est-i_meas|" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">{t('sensorlessFoc.internalsNote')}</p>
    </Card>
  );
}

function Probe() {
  return (
    <>
      <ObserverDiagnostic />
      <SMOInternals />
      <SerialCompareSensorlessCard />
      {/* round-11 Tier 3：传感器噪声三大源（编码器/Hall/ADC）*/}
      <SensorNoiseCard />
    </>
  );
}

export function SensorlessFOCModule() {
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <AssetHero moduleId="sensorless-foc" />
          <Primary />
        </div>
      }
      probe={<Probe />}
      concept={<ConceptNotes moduleId="sensorless-foc" />}
    />
  );
}
