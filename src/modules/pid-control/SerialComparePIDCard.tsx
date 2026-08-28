import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import {
  SerialCompareCardShell,
  selectWindowedSamples,
  timebaseToWindowMs,
  useFrozenRows,
  type SerialTimebase,
} from '../../components/lab/SerialCompareCardShell';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import { useSerialStore } from '../../store/serialStore';
import { useSimulationStore } from '../../store/simulationStore';
import { mockPidSample, suggestZnTuning } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialComparePIDCard：通用 PI 阶跃响应"理论 vs 实测"。
 *
 * 教学意图：
 *   - 理论：浏览器 simulatePidStepResponse（被 mock 缓存）→ 阶跃曲线。
 *   - 实测：理论 + 量测噪声 + 稳态静差，演示传感器/负载非理想。
 *   - Ziegler-Nichols 简化整定建议：从实测振荡周期反推 Kp/Ki。
 *
 * KPI：
 *   1. 跟踪误差 RMS（实测 vs ref）
 *   2. 实测超调 Mp（%）
 *   3. ZN 建议 Kp（与当前 Kp 的偏差）
 *   4. ZN 建议 Ki（与当前 Ki 的偏差）
 *
 * 板端协议字段需求：
 *   - 必需：t_us
 *   - 可选：pid_out, pid_ref（通用 PI 通道）—— 默认走 mock（参数面板 kp/ki/target 驱动）
 */

interface Row {
  t_ms: number;
  ref: number;
  sim: number;
  real: number;
}

const RMSE_WARN_RATIO = 0.1;
const RMSE_FAULT_RATIO = 0.25;

export function SerialComparePIDCard() {
  const { t } = useI18n();
  const buffer = useSerialStore((s) => s.buffer);
  const pid = useSimulationStore((s) => s.pid);
  const [timebase, setTimebase] = useState<SerialTimebase>('1s');
  const [paused, setPaused] = useState(false);
  const [noise, setNoise] = useState(0.06);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockPidSample(sample.t_ms, { pid, noiseAmp: noise });
      return { t_ms: sample.t_ms, ref: m.ref, sim: m.sim, real: m.real };
    });
  }, [buffer, windowMs, pid, noise]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length < 4) {
      return { rmse: 0, overshootPct: 0, zn: { Tu: null as number | null, kpSuggest: pid.kp, kiSuggest: pid.ki, oscillating: false } };
    }
    let sumSq = 0;
    let peak = -Infinity;
    for (const r of displayRows) {
      const d = r.real - r.ref;
      sumSq += d * d;
      if (r.real > peak) peak = r.real;
    }
    const rmse = Math.sqrt(sumSq / displayRows.length);
    const target = pid.target;
    const overshootPct = target > 0 ? Math.max(0, ((peak - target) / target) * 100) : 0;
    const zn = suggestZnTuning(
      displayRows.map((r) => ({ t_ms: r.t_ms, sim: r.sim })),
      target,
      pid.kp,
    );
    return { rmse, overshootPct, zn };
  }, [displayRows, pid.target, pid.kp, pid.ki]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        ref: r.ref.toFixed(4),
        sim: r.sim.toFixed(4),
        real: r.real.toFixed(4),
      })),
      ['t_ms', 'ref', 'sim', 'real'],
    );
    return { filename: 'pid-serial-compare', csv };
  };

  const targetAbs = Math.max(0.01, Math.abs(pid.target));
  const rmseTone: 'measure' | 'warn' | 'fault' =
    kpi.rmse / targetAbs >= RMSE_FAULT_RATIO ? 'fault' : kpi.rmse / targetAbs >= RMSE_WARN_RATIO ? 'warn' : 'measure';
  const overshootTone: 'measure' | 'warn' | 'fault' =
    kpi.overshootPct >= 30 ? 'fault' : kpi.overshootPct >= 15 ? 'warn' : 'measure';
  const kpDelta = kpi.zn.kpSuggest - pid.kp;
  const kiDelta = kpi.zn.kiSuggest - pid.ki;

  return (
    <SerialCompareCardShell
      title={t('pidControl.serialPidTitle')}
      eyebrow="pid step compare"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="mb-3">
        <label className="block rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">
            {t('pidControl.serialPidNoiseLabel')} {formatNumber(noise, 3)}
          </span>
          <input
            type="range"
            min={0}
            max={0.3}
            step={0.005}
            value={noise}
            onChange={(e) => setNoise(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label={t('pidControl.serialPidNoiseLabel')}
            aria-valuemin={0}
            aria-valuemax={0.3}
            aria-valuenow={noise}
            aria-valuetext={`${formatNumber(noise, 3)} ${t('pidControl.serialPidUnitAria')}`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <ThreeLineChart title="ref / sim / real" rows={displayRows} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label={t('pidControl.serialPidKpiRmse')} value={formatNumber(kpi.rmse, 3)} tone={rmseTone} />
        <KpiTile label={t('pidControl.serialPidKpiOvershoot')} value={`${formatNumber(kpi.overshootPct, 1)} %`} tone={overshootTone} />
        <KpiTile
          label={t('pidControl.serialPidKpiZnkP')}
          value={`${formatNumber(kpi.zn.kpSuggest, 2)} (Δ${kpDelta >= 0 ? '+' : ''}${formatNumber(kpDelta, 2)})`}
          tone={kpi.zn.oscillating ? 'warn' : 'primary'}
        />
        <KpiTile
          label={t('pidControl.serialPidKpiZnkI')}
          value={`${formatNumber(kpi.zn.kiSuggest, 2)} (Δ${kiDelta >= 0 ? '+' : ''}${formatNumber(kiDelta, 2)})`}
          tone={kpi.zn.oscillating ? 'warn' : 'primary'}
        />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('pidControl.serialPidProtocolNote')}
        {kpi.zn.Tu && (
          <>
            {' '}· {t('pidControl.serialPidTuNote')} {formatNumber(kpi.zn.Tu * 1000, 1)} ms
          </>
        )}
      </p>
    </SerialCompareCardShell>
  );
}

function ThreeLineChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-warn)" label="ref" dashed />
          <Legend color="var(--accent-primary)" label="sim" />
          <Legend color="var(--accent-measure)" label="real" />
        </span>
      </header>
      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <ReferenceLine y={0} stroke="#1e2a3d" strokeDasharray="2 4" />
            <Line type="monotone" dataKey="ref" dot={false} stroke="var(--accent-warn)" strokeDasharray="6 3" strokeWidth={1.2} isAnimationActive={false} name="ref" />
            <Line type="monotone" dataKey="sim" dot={false} stroke="var(--accent-primary)" strokeDasharray="3 3" strokeWidth={1.4} isAnimationActive={false} name="sim" />
            <Line type="monotone" dataKey="real" dot={false} stroke="var(--accent-measure)" strokeWidth={1.8} isAnimationActive={false} name="real" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block h-0.5 w-3 rounded"
        style={{ background: color, borderTop: dashed ? `1px dashed ${color}` : undefined }}
      />
      {label}
    </span>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'measure' | 'primary' | 'warn' | 'fault';
}) {
  const { t } = useI18n();
  const color =
    tone === 'fault'
      ? 'var(--accent-fault)'
      : tone === 'warn'
        ? 'var(--accent-warn)'
        : tone === 'primary'
          ? 'var(--accent-primary)'
          : 'var(--accent-measure)';
  const shape = tone === 'fault' ? '▲' : tone === 'warn' ? '◆' : '●';
  const sr = tone === 'fault'
    ? t('pidControl.kpiSrFault')
    : tone === 'warn'
      ? t('pidControl.kpiSrWarn')
      : tone === 'primary'
        ? t('pidControl.kpiSrAdvice')
        : t('pidControl.kpiSrOk');
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="formula text-body font-medium" style={{ color }}>
        <span aria-hidden className="mr-1">{shape}</span>
        {value}
        <span className="sr-only"> · {sr}</span>
      </p>
    </div>
  );
}
