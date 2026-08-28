import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n, type TKey } from '../../i18n/useI18n';
import {
  sampleComplianceParams,
  resonanceFrequencies,
  type ComplianceParams,
} from '../../simulation/math/mechanicalCompliance';
import { simulateNotchSweep } from '../../simulation/math/resonanceSuppression';
import { formatNumber } from '../../utils/format';

const KT = 1.5 * 4 * 0.045;   // 与其他卡片一致：p=4, ψf=0.045 → 0.27 N·m/A

type PresetKey = keyof typeof sampleComplianceParams;

const PRESET_LABELS: Record<PresetKey, TKey> = {
  directDriveCompressor: 'controlLoops.resonanceNotchPresetCompressor',
  industrialFanBelt: 'controlLoops.resonanceNotchPresetBelt',
  roboticJoint: 'controlLoops.resonanceNotchPresetRobot',
  agedDrive: 'controlLoops.resonanceNotchPresetAged',
};

interface MergedSample {
  tMs: number;
  omegaOff: number;
  omegaOn: number;
  iqOff: number;
  iqOn: number;
}

/**
 * 反共振陷波抑制卡：mechanicalCompliance 产生扰动，biquad notch 给对策。
 *
 * 两次并跑（notch off / on），同一图上叠两条 ω_motor 曲线让学员直接看见
 * "震荡 → 平顺"的差异；附 Q 与失配 Δf 滑块，演示工程权衡。
 */
export function ResonanceNotchCard() {
  const { t } = useI18n();
  const [presetKey, setPresetKey] = useState<PresetKey>('industrialFanBelt');
  const [Kp, setKp] = useState(0.6);
  const [Ki, setKi] = useState(8);
  const [Q, setQ] = useState(8);
  const [detunePct, setDetunePct] = useState(0);
  const [omegaRef, setOmegaRef] = useState(100);

  const params: ComplianceParams = sampleComplianceParams[presetKey];
  const { resonanceHz, antiResonanceHz } = resonanceFrequencies(params);

  // 跑两遍：陷波关 / 开
  const off = useMemo(() => simulateNotchSweep({
    params,
    omegaRefRadS: omegaRef,
    Kp, Ki, Kt: KT,
    durationSec: 0.3,
    dtSec: 1e-4,
    useNotch: false,
  }), [params, omegaRef, Kp, Ki]);

  const on = useMemo(() => simulateNotchSweep({
    params,
    omegaRefRadS: omegaRef,
    Kp, Ki, Kt: KT,
    durationSec: 0.3,
    dtSec: 1e-4,
    useNotch: true,
    detuneFrac: detunePct / 100,
    Q,
  }), [params, omegaRef, Kp, Ki, Q, detunePct]);

  // 合并两条曲线到一张图
  const merged = useMemo<MergedSample[]>(() => {
    const N = Math.min(off.samples.length, on.samples.length);
    const arr: MergedSample[] = [];
    for (let i = 0; i < N; i += 1) {
      arr.push({
        tMs: off.samples[i].tMs,
        omegaOff: Number(off.samples[i].omegaMotor.toFixed(2)),
        omegaOn: Number(on.samples[i].omegaMotor.toFixed(2)),
        iqOff: Number(off.samples[i].iqMotor.toFixed(3)),
        iqOn: Number(on.samples[i].iqMotor.toFixed(3)),
      });
    }
    return arr;
  }, [off, on]);

  // 抑制效果三态
  const rmsReductionPct = off.rmsErrorRadS > 1e-6
    ? Math.max(0, (1 - on.rmsErrorRadS / off.rmsErrorRadS) * 100)
    : 0;
  const status = rmsReductionPct >= 60
    ? { tone: 'good', Icon: CheckCircle2, label: 'controlLoops.resonanceNotchStatusGoodLabel' as const, hint: 'controlLoops.resonanceNotchStatusGoodHint' as const }
    : rmsReductionPct >= 20
    ? { tone: 'warn', Icon: AlertTriangle, label: 'controlLoops.resonanceNotchStatusWarnLabel' as const, hint: 'controlLoops.resonanceNotchStatusWarnHint' as const }
    : { tone: 'bad', Icon: AlertOctagon, label: 'controlLoops.resonanceNotchStatusBadLabel' as const, hint: 'controlLoops.resonanceNotchStatusBadHint' as const };

  const toneClass = (t: string) =>
    t === 'good'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={t('controlLoops.resonanceNotchTitle')}
      eyebrow="biquad notch · resonance suppression"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('controlLoops.resonanceNotchFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('controlLoops.resonanceNotchIntroA')}
        <span className="text-accent-fault">{t('controlLoops.resonanceNotchIntroB')}</span>
        {t('controlLoops.resonanceNotchIntroC')}
        <span className="text-accent-warn">{t('controlLoops.resonanceNotchIntroD')}</span>
        {t('controlLoops.resonanceNotchIntroE')}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-muted">{t('controlLoops.resonanceNotchPresetLabel')}</span>
        {(Object.keys(sampleComplianceParams) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPresetKey(k)}
            className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
              presetKey === k
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink'
            }`}
          >
            {t(PRESET_LABELS[k])}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-ink-muted">
        {t('controlLoops.resonanceNotchResonance')} <span className="formula text-accent-fault">{formatNumber(resonanceHz, 0)} Hz</span> ·
        {t('controlLoops.resonanceNotchAntiResonance')} <span className="formula text-accent-warn">{formatNumber(antiResonanceHz, 0)} Hz</span> ·
        {t('controlLoops.resonanceNotchBwCeiling')} <span className="formula">{formatNumber(antiResonanceHz / 5, 0)} Hz</span>
      </p>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('controlLoops.resonanceNotchSpeedKp')}</span>
            <span className="formula text-ink-primary">{formatNumber(Kp, 2)}</span>
          </span>
          <input type="range" value={Kp} min={0.1} max={3} step={0.05}
            onChange={(e) => setKp(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={t('controlLoops.resonanceNotchSpeedKp')} aria-valuemin={0.1} aria-valuemax={3} aria-valuenow={Kp} />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('controlLoops.resonanceNotchSpeedKi')}</span>
            <span className="formula text-ink-primary">{formatNumber(Ki, 1)}</span>
          </span>
          <input type="range" value={Ki} min={0} max={50} step={0.5}
            onChange={(e) => setKi(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={t('controlLoops.resonanceNotchSpeedKi')} aria-valuemin={0} aria-valuemax={50} aria-valuenow={Ki} />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('controlLoops.resonanceNotchQ')}</span>
            <span className="formula text-ink-primary">{formatNumber(Q, 1)}</span>
          </span>
          <input type="range" value={Q} min={1} max={30} step={0.5}
            onChange={(e) => setQ(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={t('controlLoops.resonanceNotchQ')} aria-valuemin={1} aria-valuemax={30} aria-valuenow={Q} />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{t('controlLoops.resonanceNotchDetune')}</span>
            <span className="formula text-ink-primary">{formatNumber(detunePct, 1)}%</span>
          </span>
          <input type="range" value={detunePct} min={-30} max={30} step={1}
            onChange={(e) => setDetunePct(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={t('controlLoops.resonanceNotchDetune')} aria-valuemin={-30} aria-valuemax={30} aria-valuenow={detunePct} />
        </label>
      </div>

      <div className="mb-2 flex items-baseline justify-between text-caption text-ink-muted">
        <span>{t('controlLoops.resonanceNotchOmegaRef')} <span className="formula text-ink-primary">{formatNumber(omegaRef, 0)} rad/s</span></span>
        <input type="range" value={omegaRef} min={20} max={200} step={10}
          onChange={(e) => setOmegaRef(Number(e.target.value))}
          className="simulation-slider w-32"
          aria-label="speed step reference" aria-valuemin={20} aria-valuemax={200} aria-valuenow={omegaRef} />
      </div>

      <div className="h-56">
        <SafeResponsiveContainer>
          <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="tMs"
              type="number"
              domain={[0, 300]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 't (ms)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'ω_motor (rad/s)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 14, dy: 50 }}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(1)} ms`}
              formatter={(v) => `${Number(v).toFixed(2)} rad/s`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine y={omegaRef} stroke="#5d7793" strokeDasharray="2 3"
              label={{ value: `ref ${omegaRef}`, fill: '#9eb5cb', fontSize: 9, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="omegaOff" stroke="#fb7185" strokeWidth={1.4} dot={false} isAnimationActive={false} name={t('controlLoops.resonanceNotchLineOff')} />
            <Line type="monotone" dataKey="omegaOn" stroke="#43f7b5" strokeWidth={1.8} dot={false} isAnimationActive={false} name={t('controlLoops.resonanceNotchLineOn')} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.resonanceNotchRmsOff')}</p>
          <p className="formula text-body text-accent-fault">{formatNumber(off.rmsErrorRadS, 2)} rad/s</p>
          <p className="text-[10px] opacity-75">{t('controlLoops.resonanceNotchOvershootPrefix')}{formatNumber(off.overshootFrac * 100, 0)}{t('controlLoops.resonanceNotchOvershootSuffix')}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('controlLoops.resonanceNotchRmsOn')}</p>
          <p className="formula text-body text-accent-measure">{formatNumber(on.rmsErrorRadS, 2)} rad/s</p>
          <p className="text-[10px] opacity-75">{t('controlLoops.resonanceNotchOvershootPrefix')}{formatNumber(on.overshootFrac * 100, 0)}{t('controlLoops.resonanceNotchOvershootSuffix')} {t('controlLoops.resonanceNotchCenterLabel')}{formatNumber(on.notchCenterHz, 0)} Hz</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(status.tone)}`}>
          <div className="flex items-center gap-1.5 text-caption">
            <status.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t(status.label)}</span>
          </div>
          <p className="formula text-body">RMS −{formatNumber(rmsReductionPct, 0)}%</p>
          <p className="text-[10px] leading-snug opacity-90">{t(status.hint)}</p>
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">{t('controlLoops.resonanceNotchPortingTitle')}</span>
        {t('controlLoops.resonanceNotchPortingA')}<span className="formula">makeNotch(fc, fs, Q)</span>
        {t('controlLoops.resonanceNotchPortingB')}<span className="formula">arm_biquad_cascade_df1_q15</span>
        {t('controlLoops.resonanceNotchPortingC')}
        <span className="text-accent-fault">{t('controlLoops.resonanceNotchPortingD')}</span>
        {t('controlLoops.resonanceNotchPortingE')}
      </p>
    </Card>
  );
}
