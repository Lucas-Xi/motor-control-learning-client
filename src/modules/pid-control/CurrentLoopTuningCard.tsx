import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n, type TKey } from '../../i18n/useI18n';
import {
  tuneCurrentLoop,
  simulateCurrentLoopStep,
  validateTuning,
} from '../../simulation/math/currentLoopTuning';
import { formatNumber } from '../../utils/format';

/** 典型电机预设：覆盖低压无人机 → 工业伺服 → 压缩机三档阻抗量级 */
const MOTOR_PRESETS = {
  droneOutrunner: {
    label: 'pidControl.presetDrone',
    rs: 0.05, ldMh: 0.02, lqMh: 0.02, fs: 24000, vdc: 24,
  },
  industrialServo: {
    label: 'pidControl.presetServo',
    rs: 0.35, ldMh: 1.8, lqMh: 3.2, fs: 10000, vdc: 310,
  },
  compressorPmsm: {
    label: 'pidControl.presetCompressor',
    rs: 0.9, ldMh: 6.5, lqMh: 8.0, fs: 8000, vdc: 310,
  },
} as const satisfies Record<string, { label: TKey; rs: number; ldMh: number; lqMh: number; fs: number; vdc: number }>;

type PresetKey = keyof typeof MOTOR_PRESETS;

interface MergedSample {
  tUs: number;
  id: number;
  iq: number;
}

/**
 * 电流环自整定卡：输入电机铭牌参数 → 模最优法算 Kp/Ki → 离散仿真验证。
 *
 * 教学闭环：上方 StepResponseChart 讲"PI 参数怎么影响响应"，本卡回答
 * "参数到底怎么算"——对应 ST Motor Profiler / TI InstaSPIN 的自整定流程。
 */
export function CurrentLoopTuningCard() {
  const { t } = useI18n();
  const [presetKey, setPresetKey] = useState<PresetKey>('industrialServo');
  const [bandwidthFactor, setBandwidthFactor] = useState(15);

  const preset = MOTOR_PRESETS[presetKey];
  const vLimit = preset.vdc / Math.sqrt(3); // SVPWM 线性区相电压幅值上限

  const tuned = useMemo(
    () => tuneCurrentLoop({
      rs: preset.rs,
      ldMh: preset.ldMh,
      lqMh: preset.lqMh,
      fs: preset.fs,
      bandwidthFactor,
    }),
    [preset, bandwidthFactor],
  );

  const check = useMemo(() => validateTuning(tuned, preset.fs), [tuned, preset.fs]);

  // d/q 轴各跑一次离散阶跃仿真（1 A 阶跃）
  const durationUs = Math.max(2000, (30 / tuned.bandwidthDHz) * 1e6);
  const simD = useMemo(
    () => simulateCurrentLoopStep({
      rs: preset.rs, lMh: preset.ldMh, fs: preset.fs,
      kp: tuned.kpD, ki: tuned.kiD, targetA: 1, vLimit, durationUs,
    }),
    [preset, tuned, vLimit, durationUs],
  );
  const simQ = useMemo(
    () => simulateCurrentLoopStep({
      rs: preset.rs, lMh: preset.lqMh, fs: preset.fs,
      kp: tuned.kpQ, ki: tuned.kiQ, targetA: 1, vLimit, durationUs,
    }),
    [preset, tuned, vLimit, durationUs],
  );

  const merged = useMemo<MergedSample[]>(() => {
    const N = Math.min(simD.samples.length, simQ.samples.length);
    const arr: MergedSample[] = [];
    // 下采样到 ≤300 点，避免 recharts 大数组卡顿
    const stride = Math.max(1, Math.floor(N / 300));
    for (let i = 0; i < N; i += stride) {
      arr.push({
        tUs: Number(simD.samples[i].tUs.toFixed(1)),
        id: Number(simD.samples[i].current.toFixed(4)),
        iq: Number(simQ.samples[i].current.toFixed(4)),
      });
    }
    return arr;
  }, [simD, simQ]);

  return (
    <Card
      title={t('pidControl.currentLoopTuningTitle')}
      eyebrow="magnitude optimum · auto tuning"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('pidControl.currentLoopFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('pidControl.currentLoopIntroLead')} <span className="formula">Rs / L / fs</span>
        {t('pidControl.currentLoopIntroGive')} <span className="formula text-accent-primary">Kp = α·L</span>{t('pidControl.currentLoopIntroSep')}
        <span className="formula text-accent-primary">Ki = α·Rs</span>{t('pidControl.currentLoopIntroAlpha')}
        {t('pidControl.currentLoopIntroSalient')} <span className="formula">Lq &gt; Ld</span>
        {t('pidControl.currentLoopIntroSalientTail')}
        {t('pidControl.currentLoopIntroVerifyLead')}
        <span className="text-accent-warn">{t('pidControl.currentLoopIntroVerifySim')}</span>
        {t('pidControl.currentLoopIntroVerifyTail')}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-muted">{t('pidControl.currentLoopPresetLabel')}</span>
        {(Object.keys(MOTOR_PRESETS) as PresetKey[]).map((k) => (
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
            {t(MOTOR_PRESETS[k].label)}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-ink-muted">
        Rs <span className="formula">{formatNumber(preset.rs, 2)} Ω</span> ·
        Ld <span className="formula">{formatNumber(preset.ldMh, 2)} mH</span> ·
        Lq <span className="formula">{formatNumber(preset.lqMh, 2)} mH</span> ·
        fs <span className="formula">{formatNumber(preset.fs / 1000, 0)} kHz</span> ·
        {t('pidControl.currentLoopVoltageLimit')} <span className="formula">{formatNumber(vLimit, 0)} V</span>{t('pidControl.currentLoopVoltageLimitParen')}
      </p>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('pidControl.currentLoopBandwidthLabel')}</span>
          <span className="formula text-ink-primary">
            {formatNumber(bandwidthFactor, 0)} → f_BW = {formatNumber(tuned.bandwidthDHz, 0)} Hz
          </span>
        </span>
        <input
          type="range" value={bandwidthFactor} min={5} max={40} step={1}
          onChange={(e) => setBandwidthFactor(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="bandwidth factor"
          aria-valuemin={5} aria-valuemax={40} aria-valuenow={bandwidthFactor}
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('pidControl.currentLoopDkpKi')}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(tuned.kpD, 3)} / {formatNumber(tuned.kiD, 0)}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('pidControl.currentLoopQkpKi')}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(tuned.kpQ, 3)} / {formatNumber(tuned.kiQ, 0)}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('pidControl.currentLoopPhaseMargin')}</p>
          <p className={`formula text-body ${tuned.phaseMarginDeg < 30 ? 'text-accent-fault' : 'text-accent-measure'}`}>
            {formatNumber(tuned.phaseMarginDeg, 0)}°
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('pidControl.currentLoopQOvershoot')}</p>
          <p className={`formula text-body ${simQ.overshootPct > 20 ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(simQ.overshootPct, 1)}%
            {simQ.saturated && <span className="ml-1 text-[10px] text-accent-warn">{t('pidControl.currentLoopSaturated')}</span>}
          </p>
        </div>
      </div>

      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="tUs" type="number" domain={[0, 'dataMax']}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 't (µs)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={[0, 'auto']}
              label={{ value: 'i (A)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 12, dy: 16 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(0)} µs`}
              formatter={(v) => `${Number(v).toFixed(3)} A`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine y={1} stroke="#5d7793" strokeDasharray="2 3"
              label={{ value: 'target 1 A', fill: '#9eb5cb', fontSize: 9, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="id" stroke="#4cc2ff" strokeWidth={1.6} dot={false} isAnimationActive={false} name={t('pidControl.currentLoopIdName')} />
            <Line type="monotone" dataKey="iq" stroke="#43f7b5" strokeWidth={1.6} dot={false} isAnimationActive={false} name={t('pidControl.currentLoopIqName')} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className={`mt-3 flex gap-2 rounded-lg border p-2 ${
        check.valid
          ? 'border-accent-measure/40 bg-accent-measure/10'
          : 'border-accent-warn/40 bg-accent-warn/10'
      }`}
      >
        {check.valid ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" aria-hidden="true" />
        )}
        <div className="text-caption leading-snug">
          {check.valid ? (
            <span className="text-accent-measure">
              {t('pidControl.currentLoopTuningPass')}
              {t('pidControl.currentLoopMethodMagnitudeOptimum')
                .replace('{bw}', formatNumber(tuned.targetBandwidthHz, 0))
                .replace('{factor}', formatNumber(bandwidthFactor, 0))}
            </span>
          ) : (
            <ul className="list-disc space-y-0.5 pl-4 text-accent-warn">
              {check.warningCodes.map((w) => (
                <li key={w.code}>
                  {t(`pidControl.currentLoopWarn_${w.code}` as TKey)
                    .replace('{value}', formatNumber(w.value, w.code.startsWith('pm') ? 1 : 0))
                    .replace('{limit}', formatNumber(w.limit, w.code.startsWith('pm') ? 0 : 0))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">{t('pidControl.currentLoopPortingTitle')}</span>
        {t('pidControl.currentLoopPortingLead')}{' '}
        <span className="formula">{t('pidControl.currentLoopVirInjection')}</span>{' '}
        {t('pidControl.currentLoopPortingJoin')}{' '}
        <span className="formula">{t('pidControl.currentLoopSlopeMethod')}</span>{' '}
        {t('pidControl.currentLoopPortingMid')}
        {t('pidControl.currentLoopBandwidthRule')}
        <span className="formula">f_BW ≈ fs/15</span>
        {t('pidControl.currentLoopBandwidthTail')}
      </p>
    </Card>
  );
}
