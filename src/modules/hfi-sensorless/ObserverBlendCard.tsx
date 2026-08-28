import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import { blendObserverAngle, sweepObserverBlend } from '../../simulation/math/observer';
import { formatNumber } from '../../utils/format';

/**
 * HFI → BEMF 最短路径融合卡。
 * 调用 blendObserverAngle / sweepObserverBlend，不用 Math.random 伪造交接误差。
 */
export function ObserverBlendCard() {
  const { t } = useI18n();
  const [transitionLow, setTransitionLow] = useState(300);
  const [transitionHigh, setTransitionHigh] = useState(600);
  const [hfiBiasDeg, setHfiBiasDeg] = useState(0);

  const low = transitionLow;
  const high = Math.max(transitionHigh, low + 50);
  const bandwidth = high - low;
  const narrow = bandwidth < 80;

  const samples = useMemo(
    () =>
      sweepObserverBlend({
        transitionLow: low,
        transitionHigh: high,
        hfiBiasDeg,
        rpmMin: 0,
        rpmMax: 1500,
        points: 61,
      }),
    [low, high, hfiBiasDeg],
  );

  const midRpm = (low + high) / 2;
  const mid = useMemo(() => {
    const hfiRad = ((hfiBiasDeg + 4) * Math.PI) / 180;
    const bemfRad = ((40 * Math.exp(-midRpm / 220)) * Math.PI) / 180;
    return blendObserverAngle(hfiRad, bemfRad, midRpm, low, high);
  }, [hfiBiasDeg, midRpm, low, high]);

  const midJump = useMemo(() => {
    if (samples.length === 0) return 0;
    let best = samples[0];
    let bestD = Math.abs(best.rpm - midRpm);
    for (const s of samples) {
      const d = Math.abs(s.rpm - midRpm);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best.jumpDeg;
  }, [samples, midRpm]);

  const first = samples[0];
  const last = samples[samples.length - 1];
  const lowOwner = first && first.blendRatio < 0.5 ? 'HFI' : 'BEMF';
  const highOwner = last && last.blendRatio > 0.5 ? 'BEMF' : 'HFI';

  return (
    <Card
      title={t('hfiSensorless.blendTitle')}
      eyebrow="observer blend · shortest-path"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('hfiSensorless.blendFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('hfiSensorless.blendIntro')}
      </p>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>{t('hfiSensorless.blendLowLabel')}</span>
          <span className="formula text-ink-primary">{formatNumber(low, 0)} rpm</span>
        </span>
        <input
          type="range"
          value={transitionLow}
          min={100}
          max={800}
          step={10}
          onChange={(e) => setTransitionLow(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="transition low rpm"
          aria-valuemin={100}
          aria-valuemax={800}
          aria-valuenow={transitionLow}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>{t('hfiSensorless.blendHighLabel')}</span>
          <span className="formula text-ink-primary">{formatNumber(high, 0)} rpm</span>
        </span>
        <input
          type="range"
          value={transitionHigh}
          min={200}
          max={1500}
          step={10}
          onChange={(e) => setTransitionHigh(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="transition high rpm"
          aria-valuemin={200}
          aria-valuemax={1500}
          aria-valuenow={transitionHigh}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>{t('hfiSensorless.blendBiasLabel')}</span>
          <span className="formula text-ink-primary">{formatNumber(hfiBiasDeg, 0)}°</span>
        </span>
        <input
          type="range"
          value={hfiBiasDeg}
          min={0}
          max={30}
          step={1}
          onChange={(e) => setHfiBiasDeg(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="hfi bias deg"
          aria-valuemin={0}
          aria-valuemax={30}
          aria-valuenow={hfiBiasDeg}
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">{t('hfiSensorless.blendBandwidth')}</p>
          <p className={`formula text-body ${narrow ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(bandwidth, 0)} rpm
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">{t('hfiSensorless.blendMidRatio')}</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(mid.blendRatio, 2)}
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">{t('hfiSensorless.blendLowOwner')}</p>
          <p className="formula text-body text-accent-measure">{lowOwner}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">{t('hfiSensorless.blendHighOwner')}</p>
          <p className="formula text-body text-accent-primary">{highOwner}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">{t('hfiSensorless.blendHardJump')}</p>
          <p className={`formula text-body ${midJump > 15 ? 'text-accent-fault' : midJump > 8 ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(midJump, 1)}°
          </p>
        </div>
      </div>

      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="rpm"
              type="number"
              domain={[0, 1500]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'n (rpm)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={['auto', 'auto']}
              label={{ value: 'θ (°)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 12, dy: 20 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `n = ${Number(v).toFixed(0)} rpm`}
              formatter={(v, name) => [`${Number(v).toFixed(2)}°`, String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine
              x={low}
              stroke="#34d6ff"
              strokeDasharray="3 3"
              label={{ value: 'low', fill: '#34d6ff', fontSize: 10, position: 'insideTopLeft' }}
            />
            <ReferenceLine
              x={high}
              stroke="#43f7b5"
              strokeDasharray="3 3"
              label={{ value: 'high', fill: '#43f7b5', fontSize: 10, position: 'insideTopRight' }}
            />
            <Line
              type="monotone"
              dataKey="hfiDeg"
              stroke="#34d6ff"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
              name="HFI"
            />
            <Line
              type="monotone"
              dataKey="bemfDeg"
              stroke="#43f7b5"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
              name="BEMF"
            />
            <Line
              type="monotone"
              dataKey="blendDeg"
              stroke="#ffb84d"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
              name="blend"
            />
            <Line
              type="monotone"
              dataKey="hardCutDeg"
              stroke="#e7f3ff"
              strokeWidth={1.3}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              name="hard-cut"
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className={`mt-3 flex gap-2 rounded-lg border p-2 ${
        narrow
          ? 'border-accent-warn/40 bg-accent-warn/10'
          : 'border-accent-measure/40 bg-accent-measure/10'
      }`}
      >
        {narrow ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" aria-hidden="true" />
        )}
        <div className="text-caption leading-snug">
          {narrow ? (
            <span className="text-accent-warn">
              {t('hfiSensorless.blendNarrowWarn')
                .replace('{b}', formatNumber(bandwidth, 0))
                .replace('{j}', formatNumber(midJump, 1))}
            </span>
          ) : (
            <span className="text-accent-measure">
              {t('hfiSensorless.blendOkNote')
                .replace('{b}', formatNumber(bandwidth, 0))
                .replace('{r}', formatNumber(mid.blendRatio, 2))
                .replace('{j}', formatNumber(midJump, 1))}
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        {t('hfiSensorless.blendFootnote').replace('{j}', formatNumber(midJump, 1))}
      </p>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">{t('hfiSensorless.blendStm32Label')}</span>
        {t('hfiSensorless.blendStm32Body')}
      </p>
    </Card>
  );
}
