import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n, type TKey } from '../../i18n/useI18n';
import { simulateIFStartup } from '../../simulation/math/ifStartup';
import { formatNumber } from '../../utils/format';

/** 典型电机预设：压缩机大惯量 → 工业伺服 → 风机外转子（label 为 TKey，渲染处 t()） */
const MOTOR_PRESETS = {
  compressorPmsm: {
    labelKey: 'startupStateMachine.ifPresetCompressor' as TKey,
    iMin: 2.4,
    iMax: 6.4,
    switchFreqHz: 20,
    rampRateHzPerSec: 6,
    leadAngleDeg: 25,
    polePairs: 3,
    inertia: 0.008,
    damping: 0.002,
    loadTorque: 0.35,
    fluxWb: 0.12,
  },
  industrialServo: {
    labelKey: 'startupStateMachine.ifPresetServo' as TKey,
    iMin: 1.2,
    iMax: 4,
    switchFreqHz: 25,
    rampRateHzPerSec: 12,
    leadAngleDeg: 20,
    polePairs: 4,
    inertia: 0.0004,
    damping: 0.0004,
    loadTorque: 0.04,
    fluxWb: 0.05,
  },
  fanOutrunner: {
    labelKey: 'startupStateMachine.ifPresetFan' as TKey,
    iMin: 1.5,
    iMax: 5,
    switchFreqHz: 18,
    rampRateHzPerSec: 8,
    leadAngleDeg: 22,
    polePairs: 5,
    inertia: 0.003,
    damping: 0.0012,
    loadTorque: 0.12,
    fluxWb: 0.07,
  },
} as const;

type PresetKey = keyof typeof MOTOR_PRESETS;

interface ChartSample {
  t: number;
  rotorRpm: number;
  rpmRef: number;
  iRef: number;
}

/**
 * I/F 开环启动卡：虚拟电角度斜坡拖电流矢量，用负载角判断能否切闭环。
 *
 * 教学闭环：上方状态机讲"何时切 HFI / BEMF"，本卡回答
 * "开环电流-频率斜坡为什么会失步、什么时候才能交班"。
 */
export function IFStartupCard() {
  const { t } = useI18n();
  const [presetKey, setPresetKey] = useState<PresetKey>('compressorPmsm');
  const [rampRateHzPerSec, setRampRateHzPerSec] = useState<number>(MOTOR_PRESETS.compressorPmsm.rampRateHzPerSec);
  const [leadAngleDeg, setLeadAngleDeg] = useState<number>(MOTOR_PRESETS.compressorPmsm.leadAngleDeg);
  const [loadTorque, setLoadTorque] = useState<number>(MOTOR_PRESETS.compressorPmsm.loadTorque);

  const selectPreset = (k: PresetKey) => {
    setPresetKey(k);
    const p = MOTOR_PRESETS[k];
    setRampRateHzPerSec(p.rampRateHzPerSec);
    setLeadAngleDeg(p.leadAngleDeg);
    setLoadTorque(p.loadTorque);
  };

  const preset = MOTOR_PRESETS[presetKey];

  const result = useMemo(
    () => simulateIFStartup({
      iMin: preset.iMin,
      iMax: preset.iMax,
      switchFreqHz: preset.switchFreqHz,
      rampRateHzPerSec,
      leadAngleDeg,
      polePairs: preset.polePairs,
      inertia: preset.inertia,
      damping: preset.damping,
      loadTorque,
      fluxWb: preset.fluxWb,
      dt: 0.002,
      maxTime: 8,
    }),
    [preset, rampRateHzPerSec, leadAngleDeg, loadTorque],
  );

  const chartData = useMemo<ChartSample[]>(() => {
    const src = result.trajectory;
    const N = src.length;
    const stride = Math.max(1, Math.floor(N / 300));
    const arr: ChartSample[] = [];
    for (let i = 0; i < N; i += stride) {
      arr.push({
        t: Number(src[i].t.toFixed(3)),
        rotorRpm: Number(src[i].rotorRpm.toFixed(2)),
        rpmRef: Number(src[i].rpmRef.toFixed(2)),
        iRef: Number(src[i].iRef.toFixed(3)),
      });
    }
    const last = src[N - 1];
    if (last && (arr.length === 0 || arr[arr.length - 1].t !== Number(last.t.toFixed(3)))) {
      arr.push({
        t: Number(last.t.toFixed(3)),
        rotorRpm: Number(last.rotorRpm.toFixed(2)),
        rpmRef: Number(last.rpmRef.toFixed(2)),
        iRef: Number(last.iRef.toFixed(3)),
      });
    }
    return arr;
  }, [result]);

  const last = result.trajectory[result.trajectory.length - 1];
  const ok = result.success && !result.lostSync;

  return (
    <Card
      title={t('startupStateMachine.ifTitle')}
      eyebrow="I/F current-frequency startup"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={t('startupStateMachine.ifFidelityHint')}
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {t('startupStateMachine.ifIntroLead')}
        <span className="formula"> θ* = ∫ 2π f_ref dt</span>
        {t('startupStateMachine.ifIntroMid1')} <span className="formula">δ = θ* − p·θ_m</span>
        {t('startupStateMachine.ifIntroMid2')}
        <span className="text-accent-warn"> 90°</span>
        {t('startupStateMachine.ifIntroMid3')}
        <span className="formula"> |ω_m − ω*/p|</span>
        {t('startupStateMachine.ifIntroTail')}
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-muted">{t('startupStateMachine.ifPresetLabel')}</span>
        {(Object.keys(MOTOR_PRESETS) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => selectPreset(k)}
            className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
              presetKey === k
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink'
            }`}
          >
            {t(MOTOR_PRESETS[k].labelKey)}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-ink-muted">
        iMin <span className="formula">{formatNumber(preset.iMin, 1)} A</span> ·
        iMax <span className="formula">{formatNumber(preset.iMax, 1)} A</span> ·
        f_sw <span className="formula">{formatNumber(preset.switchFreqHz, 0)} Hz</span> ·
        p <span className="formula">{formatNumber(preset.polePairs, 0)}</span> ·
        J <span className="formula">{formatNumber(preset.inertia, 4)} kg·m²</span> ·
        ψ <span className="formula">{formatNumber(preset.fluxWb, 2)} Wb</span>
      </p>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('startupStateMachine.ifRampRate')}</span>
          <span className="formula text-ink-primary">{formatNumber(rampRateHzPerSec, 0)} Hz/s</span>
        </span>
        <input
          type="range" value={rampRateHzPerSec} min={2} max={40} step={1}
          onChange={(e) => setRampRateHzPerSec(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="ramp rate Hz per sec"
          aria-valuemin={2} aria-valuemax={40} aria-valuenow={rampRateHzPerSec}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('startupStateMachine.ifLeadAngle')}</span>
          <span className="formula text-ink-primary">{formatNumber(leadAngleDeg, 0)}°</span>
        </span>
        <input
          type="range" value={leadAngleDeg} min={5} max={80} step={1}
          onChange={(e) => setLeadAngleDeg(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="lead angle deg"
          aria-valuemin={5} aria-valuemax={80} aria-valuenow={leadAngleDeg}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>{t('startupStateMachine.ifLoadTorque')}</span>
          <span className="formula text-ink-primary">{formatNumber(loadTorque, 2)} Nm</span>
        </span>
        <input
          type="range" value={loadTorque} min={0} max={1.2} step={0.02}
          onChange={(e) => setLoadTorque(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="load torque"
          aria-valuemin={0} aria-valuemax={1.2} aria-valuenow={loadTorque}
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('startupStateMachine.ifKpiHandoff')}</p>
          <p className={`formula text-body ${result.handoffTime === null ? 'text-accent-warn' : 'text-accent-primary'}`}>
            {result.handoffTime === null ? '—' : `${formatNumber(result.handoffTime, 2)} s`}
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('startupStateMachine.ifKpiMaxDelta')}</p>
          <p className={`formula text-body ${result.maxLoadAngleDeg > 70 ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(result.maxLoadAngleDeg, 1)}°
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('startupStateMachine.ifKpiFinalRpm')}</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(last?.rotorRpm ?? 0, 0)} rpm
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{t('startupStateMachine.ifKpiLostSync')}</p>
          <p className={`formula text-body ${result.lostSync ? 'text-accent-fault' : 'text-accent-measure'}`}>
            {result.lostSync
              ? t('startupStateMachine.ifValueLostSync')
              : t('startupStateMachine.ifValueInSync')}
          </p>
        </div>
      </div>

      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="t" type="number" domain={[0, 'dataMax']}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 't (s)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              yAxisId="rpm"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={['auto', 'auto']}
              label={{ value: 'rpm', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 12, dy: 16 }}
            />
            <YAxis
              yAxisId="i"
              orientation="right"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={[0, 'auto']}
              label={{ value: 'i_ref (A)', angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 11, dx: -4, dy: 16 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(2)} s`}
              formatter={(v, name) => {
                const n = String(name);
                const unit = n.includes('A') || n.includes('i') ? ' A' : ' rpm';
                return [`${Number(v).toFixed(2)}${unit}`, n];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            {result.handoffTime !== null && (
              <ReferenceLine
                yAxisId="rpm"
                x={result.handoffTime}
                stroke="#5d7793"
                strokeDasharray="2 3"
                label={{ value: 'handoff', fill: '#9eb5cb', fontSize: 9, position: 'insideTopRight' }}
              />
            )}
            <Line yAxisId="rpm" type="monotone" dataKey="rpmRef" stroke="#9eb5cb" strokeWidth={1.4} strokeDasharray="4 4" dot={false} isAnimationActive={false} name={t('startupStateMachine.legendRpmRef')} />
            <Line yAxisId="rpm" type="monotone" dataKey="rotorRpm" stroke="#43f7b5" strokeWidth={1.6} dot={false} isAnimationActive={false} name={t('startupStateMachine.ifLegendRotorRpm')} />
            <Line yAxisId="i" type="monotone" dataKey="iRef" stroke="#ffb84d" strokeWidth={1.5} dot={false} isAnimationActive={false} name="i_ref (A)" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className={`mt-3 flex gap-2 rounded-lg border p-2 ${
        ok
          ? 'border-accent-measure/40 bg-accent-measure/10'
          : 'border-accent-warn/40 bg-accent-warn/10'
      }`}
      >
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" aria-hidden="true" />
        )}
        <div className="text-caption leading-snug">
          {ok ? (
            <span className="text-accent-measure">{t('startupStateMachine.ifStatusOk')}</span>
          ) : result.pullOut ? (
            <span className="text-accent-warn">{t('startupStateMachine.ifStatusPullOut')}</span>
          ) : result.lostSync ? (
            <span className="text-accent-warn">{t('startupStateMachine.ifStatusLostSync')}</span>
          ) : (
            <span className="text-accent-warn">{t('startupStateMachine.ifStatusNotReady')}</span>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">{t('startupStateMachine.ifStm32Label')}</span>
        {t('startupStateMachine.ifStm32Mid')}
        <span className="formula"> i_d* / i_q*</span>
        {t('startupStateMachine.ifStm32Tail')}
      </p>
    </Card>
  );
}
