import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import {
  SerialCompareCardShell,
  selectWindowedSamples,
  timebaseToWindowMs,
  useFrozenRows,
  type SerialTimebase,
} from '../../components/lab/SerialCompareCardShell';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSerialStore } from '../../store/serialStore';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import { mockSpeedLoopSample } from '../../utils/serialMockGenerators';
import { computeSingleSidedSpectrum } from '../../components/charts/dft';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareSpeedLoopCard：速度环阶跃响应"理论 vs 实测"对照。
 *
 * 三条线（rpm 通道）：
 *   - rpm_ref：阶跃指令（阶跃前 0，阶跃后等于 targetSpeed）
 *   - rpm_sim：二阶欠阻尼解析模型（mockSpeedLoopSample）
 *   - rpm_real：仿真叠加测量噪声 + 静差
 *
 * KPI：
 *   - 上升时间 tr（10%-90%）
 *   - 超调量 Mp（峰值 / 指令 − 1，%）
 *   - 稳态静差（窗口末段平均与指令的差，rpm）
 *
 * 频谱对照（外环 vs 内环带宽分离）：
 *   - 对 rpm_real 做 DFT，主峰频率 ≈ 速度环带宽（典型 5-30 Hz）
 *   - 内环带宽：从 store.controlLoop.currentKp/Ki 估算（≈ Ki/Kp /（2π）, Hz）
 *   - 若内/外环带宽比 < 10× 则提示"双环带宽未分离"
 *
 * 板端协议字段需求：
 *   - 必需：t_us, ia, ib, ic
 *   - 推荐：rpm_ref(f32), rpm_meas(f32), iq_ref(f32), iq_meas(f32)
 *     —— 当前协议未含，UI 用 mock 合成（参数面板 targetSpeed/speedKp/speedKi 驱动）。
 */

interface Row {
  t_ms: number;
  rpmRef: number;
  rpmSim: number;
  rpmReal: number;
  iqSim: number;
  iqReal: number;
}

interface SpectrumRow {
  freq: number;
  mag: number;
}

/** 估算阶跃响应上升时间（10%-90%）；返回 ms 或 NaN。 */
function estimateRiseTimeMs(times: number[], values: number[], target: number): number {
  if (target === 0 || times.length < 2) return Number.NaN;
  const lo = target * 0.1;
  const hi = target * 0.9;
  let tLo = Number.NaN;
  let tHi = Number.NaN;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (Number.isNaN(tLo) && ((target > 0 && v >= lo) || (target < 0 && v <= lo))) tLo = times[i];
    if (Number.isNaN(tHi) && ((target > 0 && v >= hi) || (target < 0 && v <= hi))) {
      tHi = times[i];
      break;
    }
  }
  if (Number.isNaN(tLo) || Number.isNaN(tHi)) return Number.NaN;
  return tHi - tLo;
}

export function SerialCompareSpeedLoopCard() {
  const buffer = useSerialStore((s) => s.buffer);
  const controlLoop = useSimulationStore((s) => s.controlLoop);
  const { t } = useI18n();
  const [timebase, setTimebase] = useState<SerialTimebase>('1s');
  const [paused, setPaused] = useState(false);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    if (windowed.length === 0) return [];
    // 阶跃发生在窗口起点之后 10%（让"前 0 后阶跃"清晰可见）
    const stepMs = windowed[windowed.length - 1].t_ms * 0.1;
    // 用 speedKp/Ki 折算 ωn / ζ（教学级估算）：ωn ≈ √(Kp·Ki·100), ζ ≈ Kp/√(Kp·Ki·100/4)
    const wn = Math.max(15, Math.sqrt(Math.max(0.001, controlLoop.speedKp * controlLoop.speedKi) * 100));
    const zeta = Math.min(0.95, Math.max(0.3, controlLoop.speedKp / Math.max(0.05, Math.sqrt(controlLoop.speedKi / 4))));
    return windowed.map((sample) => {
      const m = mockSpeedLoopSample(sample.t_ms, {
        rpmRef: controlLoop.targetSpeed,
        stepMs,
        omegaN: wn,
        zeta,
        steadyErrRpm: controlLoop.loadTorque * 30,
        noiseRpm: 8,
      });
      return {
        t_ms: sample.t_ms,
        rpmRef: m.rpmRef,
        rpmSim: m.rpmSim,
        rpmReal: m.rpmReal,
        iqSim: m.iqSim,
        iqReal: m.iqReal,
      };
    });
  }, [buffer, windowMs, controlLoop.targetSpeed, controlLoop.speedKp, controlLoop.speedKi, controlLoop.loadTorque]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length < 8) {
      return { riseMs: Number.NaN, overshootPct: Number.NaN, steadyErrRpm: Number.NaN };
    }
    const times = displayRows.map((r) => r.t_ms);
    const real = displayRows.map((r) => r.rpmReal);
    const target = controlLoop.targetSpeed;
    const riseMs = estimateRiseTimeMs(times, real, target);
    // 峰值超调
    let peak = -Infinity;
    for (const v of real) if (v > peak) peak = v;
    const overshootPct = target > 0 ? Math.max(0, ((peak - target) / target) * 100) : Number.NaN;
    // 末尾 20% 平均 → 稳态值
    const tailStart = Math.floor(displayRows.length * 0.8);
    let sum = 0;
    for (let i = tailStart; i < displayRows.length; i += 1) sum += real[i];
    const steadyMean = sum / Math.max(1, displayRows.length - tailStart);
    const steadyErrRpm = steadyMean - target;
    return { riseMs, overshootPct, steadyErrRpm };
  }, [displayRows, controlLoop.targetSpeed]);

  const spectrum = useMemo<SpectrumRow[]>(() => {
    if (displayRows.length < 32) return [];
    // 采样率（帧间隔）
    const t0 = displayRows[0].t_ms;
    const tN = displayRows[displayRows.length - 1].t_ms;
    const fs = ((displayRows.length - 1) / (tN - t0)) * 1000; // Hz
    const real = displayRows.map((r) => r.rpmReal - controlLoop.targetSpeed); // 去 DC
    const { freq, mag } = computeSingleSidedSpectrum(real, fs);
    // 只看 0..60 Hz 的低频段（速度环带宽典型 ≤ 30 Hz）
    return freq
      .map((f, i) => ({ freq: f, mag: mag[i] }))
      .filter((x) => x.freq <= 60 && x.freq > 0)
      .slice(0, 64);
  }, [displayRows, controlLoop.targetSpeed]);

  /** 估算速度环带宽（spectrum 主峰频率） */
  const speedBwHz = useMemo(() => {
    if (spectrum.length === 0) return 0;
    let best = spectrum[0];
    for (const s of spectrum) if (s.mag > best.mag) best = s;
    return best.freq;
  }, [spectrum]);

  /** 内环（电流环）带宽估算：fc ≈ Ki/(2π·Kp) Hz（教学级 PI 经验公式） */
  const currentBwHz = useMemo(() => {
    if (controlLoop.currentKp <= 0) return 0;
    return controlLoop.currentKi / (2 * Math.PI * controlLoop.currentKp);
  }, [controlLoop.currentKp, controlLoop.currentKi]);

  const bwRatio = speedBwHz > 0 ? currentBwHz / speedBwHz : 0;

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        rpmRef: r.rpmRef.toFixed(2),
        rpmSim: r.rpmSim.toFixed(2),
        rpmReal: r.rpmReal.toFixed(2),
        iqSim: r.iqSim.toFixed(4),
        iqReal: r.iqReal.toFixed(4),
      })),
      ['t_ms', 'rpmRef', 'rpmSim', 'rpmReal', 'iqSim', 'iqReal'],
    );
    return { filename: 'speed-loop-step-compare', csv };
  };

  return (
    <SerialCompareCardShell
      title={t('controlLoops.serialSpeedTitle')}
      eyebrow="speed loop step response"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <SpeedChart rows={displayRows} target={controlLoop.targetSpeed} />
        <SpectrumChart rows={spectrum} speedBwHz={speedBwHz} currentBwHz={currentBwHz} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile
          label={t('controlLoops.serialKpiRise')}
          value={Number.isFinite(kpi.riseMs) ? `${formatNumber(kpi.riseMs, 0)} ms` : '--'}
          tone="measure"
        />
        <KpiTile
          label={t('controlLoops.serialKpiOvershoot')}
          value={Number.isFinite(kpi.overshootPct) ? `${formatNumber(kpi.overshootPct, 1)} %` : '--'}
          tone={kpi.overshootPct > 25 ? 'fault' : kpi.overshootPct > 10 ? 'warn' : 'measure'}
        />
        <KpiTile
          label={t('controlLoops.serialKpiSteadyErr')}
          value={Number.isFinite(kpi.steadyErrRpm) ? `${formatNumber(kpi.steadyErrRpm, 1)} rpm` : '--'}
          tone={Math.abs(kpi.steadyErrRpm) > 30 ? 'warn' : 'measure'}
        />
        <KpiTile
          label={t('controlLoops.serialKpiBwRatio')}
          value={bwRatio > 0 ? `${formatNumber(bwRatio, 1)}×` : '--'}
          tone={bwRatio < 10 ? 'warn' : 'measure'}
        />
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('controlLoops.serialProtoNoteLead')}t_us, ia, ib, ic,{' '}
        <span className="text-accent-warn">rpm_ref(f32), rpm_meas(f32), iq_ref(f32), iq_meas(f32)</span>
        {t('controlLoops.serialProtoNoteBw')}{formatNumber(currentBwHz, 1)} Hz{t('controlLoops.serialProtoNoteTail')}
      </p>
    </SerialCompareCardShell>
  );
}

function SpeedChart({ rows, target }: { rows: Row[]; target: number }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{t('controlLoops.serialChartSpeedTitle')}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-warn)" label="ref" dashed />
          <Legend color="var(--accent-primary)" label="sim" />
          <Legend color="var(--accent-measure)" label="real" />
        </span>
      </header>
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
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
            <ReferenceLine y={target} stroke="var(--accent-warn)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="rpmRef" dot={false} stroke="var(--accent-warn)" strokeDasharray="6 3" strokeWidth={1.2} isAnimationActive={false} name="ref" />
            <Line type="monotone" dataKey="rpmSim" dot={false} stroke="var(--accent-primary)" strokeDasharray="3 3" strokeWidth={1.4} isAnimationActive={false} name="sim" />
            <Line type="monotone" dataKey="rpmReal" dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="real" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function SpectrumChart({
  rows,
  speedBwHz,
  currentBwHz,
}: {
  rows: SpectrumRow[];
  speedBwHz: number;
  currentBwHz: number;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{t('controlLoops.serialChartSpectrumTitle')}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-measure)" label="rpm" />
          <span className="flex items-center gap-1 text-accent-primary">
            <span aria-hidden>I</span>fc={formatNumber(currentBwHz, 0)}Hz
          </span>
        </span>
      </header>
      <div className="h-44">
        <SafeResponsiveContainer>
          <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="freq" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" Hz" />
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
            <ReferenceLine
              x={speedBwHz}
              stroke="var(--accent-measure)"
              strokeDasharray="3 3"
              label={{ value: `ωn ${formatNumber(speedBwHz, 1)} Hz`, fill: '#43f7b5', fontSize: 10, position: 'insideTopRight' }}
            />
            <ReferenceLine
              x={currentBwHz}
              stroke="var(--accent-primary)"
              strokeDasharray="3 3"
              label={{ value: t('controlLoops.serialLabelFcInner'), fill: '#34d6ff', fontSize: 10, position: 'insideTopLeft' }}
            />
            <Bar dataKey="mag" isAnimationActive={false}>
              {rows.map((_, i) => (
                <Cell key={i} fill="var(--accent-measure)" fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
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
    ? t('controlLoops.serialSrFault')
    : tone === 'warn'
      ? t('controlLoops.serialSrWarn')
      : t('controlLoops.serialSrOk');
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="formula text-body font-medium" style={{ color }}>
        <span aria-hidden className="mr-1">
          {shape}
        </span>
        {value}
        <span className="sr-only"> · {sr}</span>
      </p>
    </div>
  );
}
