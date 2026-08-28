import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n, type TKey } from '../../i18n/useI18n';
import { simulateAdaptiveLearning } from '../../simulation/math/coggingAdaptive';
import { formatNumber } from '../../utils/format';

type PresetKey = 'coldMismatch' | 'hotDemag' | 'speedUnstable';

const PRESETS: Record<PresetKey, { label: TKey; plantScale?: number; speedRipple?: number }> = {
  coldMismatch: { label: 'controlLoops.coggingAdaptivePresetCold', plantScale: 1.25, speedRipple: 0.01 },
  hotDemag: { label: 'controlLoops.coggingAdaptivePresetHot', plantScale: 0.75, speedRipple: 0.01 },
  speedUnstable: { label: 'controlLoops.coggingAdaptivePresetRipple', speedRipple: 0.10 },
};

/**
 * 自适应齿槽前馈卡：静态 CT-FFC 表在额定 ψf 下拍好，磁钢热/饱和后失配。
 * 本卡用 LMS 残差跟踪把表学回去——只在转速稳时学，不重复分辨率 vs 角误差那张卡。
 */
export function CoggingAdaptiveCard() {
  const { t } = useI18n();
  const [plantScale, setPlantScale] = useState(1.25);
  const [learningRate, setLearningRate] = useState(0.02);
  const [speedRipple, setSpeedRipple] = useState(0.01);
  const [presetKey, setPresetKey] = useState<PresetKey>('coldMismatch');

  const applyPreset = (k: PresetKey) => {
    setPresetKey(k);
    const p = PRESETS[k];
    if (p.plantScale !== undefined) setPlantScale(p.plantScale);
    if (p.speedRipple !== undefined) setSpeedRipple(p.speedRipple);
  };

  const result = useMemo(
    () => simulateAdaptiveLearning({
      plantScale,
      learningRate,
      speedRipple,
      lutSize: 256,
      revolutions: 80,
      stepsPerRev: 256,
      dt: 0.001,
    }),
    [plantScale, learningRate, speedRipple],
  );

  const first = result.samples[0];
  const last = result.samples[result.samples.length - 1];
  const ripplePaused = speedRipple >= 0.05;
  const muHigh = learningRate >= 0.05;
  const warn = ripplePaused || muHigh;

  const chartData = useMemo(
    () => result.samples.map((s) => ({
      rev: s.rev,
      residualRms: Number((s.residualRmsNm * 1000).toFixed(3)),
      coveragePct: Number(s.coveragePct.toFixed(1)),
    })),
    [result],
  );

  return (
    <Card
      title={t('controlLoops.coggingAdaptiveTitle')}
      eyebrow="adaptive CT-FFC · residual LMS"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('controlLoops.coggingAdaptiveFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('controlLoops.coggingAdaptiveIntroA')}<span className="formula">ψf</span>
        {t('controlLoops.coggingAdaptiveIntroB')}<span className="formula"> Tcog</span>
        {t('controlLoops.coggingAdaptiveIntroC')}<span className="formula">T_res = T_true − T_model</span>
        {t('controlLoops.coggingAdaptiveIntroD')}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-muted">{t('controlLoops.coggingAdaptivePresetLabel')}</span>
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => applyPreset(k)}
            className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
              presetKey === k
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink'
            }`}
          >
            {t(PRESETS[k].label)}
          </button>
        ))}
      </div>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('controlLoops.coggingAdaptivePlantScale')}</span>
          <span className="formula text-ink-primary">{formatNumber(plantScale, 2)}</span>
        </span>
        <input
          type="range"
          value={plantScale}
          min={0.6}
          max={1.6}
          step={0.01}
          onChange={(e) => setPlantScale(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label={t('controlLoops.coggingAdaptivePlantScale')}
          aria-valuemin={0.6}
          aria-valuemax={1.6}
          aria-valuenow={plantScale}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('controlLoops.coggingAdaptiveMu')}</span>
          <span className="formula text-ink-primary">{formatNumber(learningRate, 3)}</span>
        </span>
        <input
          type="range"
          value={learningRate}
          min={0.002}
          max={0.08}
          step={0.002}
          onChange={(e) => setLearningRate(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label={t('controlLoops.coggingAdaptiveMu')}
          aria-valuemin={0.002}
          aria-valuemax={0.08}
          aria-valuenow={learningRate}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('controlLoops.coggingAdaptiveRipple')}</span>
          <span className="formula text-ink-primary">{formatNumber(speedRipple * 100, 1)}%</span>
        </span>
        <input
          type="range"
          value={speedRipple}
          min={0}
          max={0.15}
          step={0.005}
          onChange={(e) => setSpeedRipple(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label={t('controlLoops.coggingAdaptiveRipple')}
          aria-valuemin={0}
          aria-valuemax={0.15}
          aria-valuenow={speedRipple}
        />
      </label>

      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="rev"
              type="number"
              domain={[1, 'dataMax']}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: t('controlLoops.coggingAdaptiveRevLabel'), position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              yAxisId="res"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: t('controlLoops.coggingAdaptiveResidualLabel'), angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 14, dy: 40 }}
            />
            <YAxis
              yAxisId="cov"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              label={{ value: t('controlLoops.coggingAdaptiveCoverageLabel'), angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 10, dx: -12, dy: -20 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `${t('controlLoops.coggingAdaptiveRevPrefix')}${Number(v).toFixed(0)}`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <Line
              yAxisId="res"
              type="monotone"
              dataKey="residualRms"
              stroke="#43f7b5"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
              name={t('controlLoops.coggingAdaptiveLineResidual')}
            />
            <Line
              yAxisId="cov"
              type="monotone"
              dataKey="coveragePct"
              stroke="#34d6ff"
              strokeWidth={1.2}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
              name={t('controlLoops.coggingAdaptiveLineCoverage')}
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.coggingAdaptiveCoverageMetric')}</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(result.finalCoveragePct, 1)}%
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.coggingAdaptiveLastResidual')}</p>
          <p className="formula text-body text-accent-measure">
            {formatNumber(result.finalResidualRmsNm * 1000, 2)} mN·m
          </p>
          <p className="text-[10px] opacity-75">
            {t('controlLoops.coggingAdaptiveFirstRevPrefix')}{formatNumber((first?.residualRmsNm ?? 0) * 1000, 2)} mN·m
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.coggingAdaptiveMaxDelta')}</p>
          <p className="formula text-body text-ink-primary">
            {formatNumber(last?.maxDelta ?? 0, 3)} A
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.coggingAdaptiveLearningQ')}</p>
          <p className={`formula text-body ${last?.isLearning ? 'text-accent-measure' : 'text-accent-warn'}`}>
            {last?.isLearning ? t('controlLoops.coggingAdaptiveLearningYes') : t('controlLoops.coggingAdaptiveLearningNo')}
          </p>
        </div>
      </div>

      <div className={`mt-3 flex gap-2 rounded-lg border p-2 ${
        warn
          ? 'border-accent-warn/40 bg-accent-warn/10'
          : result.suppressed
            ? 'border-accent-measure/40 bg-accent-measure/10'
            : 'border-line-subtle bg-bg-base'
      }`}
      >
        {warn ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" aria-hidden="true" />
        )}
        <div className="text-caption leading-snug">
          {ripplePaused ? (
            <span className="text-accent-warn">{t('controlLoops.coggingAdaptiveWarnRipple')}</span>
          ) : null}
          {ripplePaused && muHigh ? ' ' : null}
          {muHigh ? (
            <span className="text-accent-warn">{t('controlLoops.coggingAdaptiveWarnMu')}</span>
          ) : null}
          {!warn && result.suppressed ? (
            <span className="text-accent-measure">
              {t('controlLoops.coggingAdaptiveOkSuppressed')}
            </span>
          ) : null}
          {!warn && !result.suppressed ? (
            <span className="text-ink-secondary">
              {t('controlLoops.coggingAdaptiveInfoNotYet')}
            </span>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">{t('controlLoops.coggingAdaptivePortingTitle')}</span>
        {t('controlLoops.coggingAdaptivePortingBody')}
      </p>
    </Card>
  );
}
