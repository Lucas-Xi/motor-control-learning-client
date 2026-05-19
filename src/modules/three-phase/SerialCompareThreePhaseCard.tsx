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
import { useSerialStore } from '../../store/serialStore';
import { useSimulationStore } from '../../store/simulationStore';
import { mockThreePhaseSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareThreePhaseCard：三相基础"理论 vs 实测"对照。
 *
 * 教学意图：
 *   - 理论：纯正弦平衡 ia/ib/ic（参数面板 amplitude / frequency / phaseDeg）。
 *   - 实测：在理论之上叠加 LEM 增益偏差（icCalibGain）、ADC 直流偏置、白噪声。
 *
 * 三个 KPI：
 *   1. KCL 残差 = ia+ib+ic 的 RMS（理想 = 0；非零 → ADC 偏置 / ic 增益失配）
 *   2. ic 增益估算：实测 |Ic|_peak / 理论 |Ic|_peak（接近 1 = 校准 OK）
 *   3. 不平衡度（αβ 椭圆指数 = √(I_a²+I_b²) 的标准差 / 均值）
 *
 * 板端协议字段需求：
 *   - 必需：t_us, ia, ib, ic
 *   - 推荐：无（三相电流已经是核心字段）
 *
 * a11y：滑块均带 aria-* / 颜色 + 形状双通道。
 */

interface Row {
  t_ms: number;
  iaReal: number;
  ibReal: number;
  icReal: number;
  iaTheory: number;
  ibTheory: number;
  icTheory: number;
  kcl: number;
}

const KCL_WARN = 0.3;
const KCL_FAULT = 0.8;

export function SerialCompareThreePhaseCard() {
  const buffer = useSerialStore((s) => s.buffer);
  const threePhase = useSimulationStore((s) => s.threePhase);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);
  // 用户可调 ic 校准系数（教学：1.0 = 理想；< 1 模拟 LEM 灵敏度偏低）
  const [icGain, setIcGain] = useState(1.0);
  const [adcBias, setAdcBias] = useState(0);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockThreePhaseSample(sample.t_ms, {
        threePhase,
        icCalibGain: icGain,
        adcBiasA: adcBias,
      });
      // 实测优先用 SerialStore 原始 ia/ib/ic（若板端给出）
      const real = sample as { ia?: number; ib?: number; ic?: number };
      const iaReal = real.ia ?? m.iaReal;
      const ibReal = real.ib ?? m.ibReal;
      const icReal = real.ic ?? m.icReal;
      return {
        t_ms: sample.t_ms,
        iaReal,
        ibReal,
        icReal,
        iaTheory: m.iaTheory,
        ibTheory: m.ibTheory,
        icTheory: m.icTheory,
        kcl: iaReal + ibReal + icReal,
      };
    });
  }, [buffer, windowMs, threePhase, icGain, adcBias]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { kclRms: 0, icGainEst: 1, imbalancePct: 0 };
    }
    let sumSq = 0;
    let peakIcReal = 0;
    let peakIcTheory = 0;
    for (const r of displayRows) {
      sumSq += r.kcl * r.kcl;
      if (Math.abs(r.icReal) > peakIcReal) peakIcReal = Math.abs(r.icReal);
      if (Math.abs(r.icTheory) > peakIcTheory) peakIcTheory = Math.abs(r.icTheory);
    }
    const kclRms = Math.sqrt(sumSq / displayRows.length);
    const icGainEst = peakIcTheory > 1e-6 ? peakIcReal / peakIcTheory : 1;
    // 不平衡度：实测 αβ 模长（应近似常数 = 1.5×amplitude）的相对波动
    let sum = 0;
    let sumSqMag = 0;
    for (const r of displayRows) {
      // I_α = ia, I_β = (ib − ic) / √3
      const a = r.iaReal;
      const b = (r.ibReal - r.icReal) / Math.sqrt(3);
      const mag = Math.hypot(a, b);
      sum += mag;
      sumSqMag += mag * mag;
    }
    const mean = sum / displayRows.length;
    const variance = sumSqMag / displayRows.length - mean * mean;
    const std = Math.sqrt(Math.max(0, variance));
    const imbalancePct = mean > 1e-6 ? (std / mean) * 100 : 0;
    return { kclRms, icGainEst, imbalancePct };
  }, [displayRows]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        iaReal: r.iaReal.toFixed(4),
        ibReal: r.ibReal.toFixed(4),
        icReal: r.icReal.toFixed(4),
        iaTheory: r.iaTheory.toFixed(4),
        ibTheory: r.ibTheory.toFixed(4),
        icTheory: r.icTheory.toFixed(4),
        kcl: r.kcl.toFixed(5),
      })),
      ['t_ms', 'iaReal', 'ibReal', 'icReal', 'iaTheory', 'ibTheory', 'icTheory', 'kcl'],
    );
    return { filename: 'three-phase-serial-compare', csv };
  };

  const kclTone: 'measure' | 'warn' | 'fault' =
    kpi.kclRms >= KCL_FAULT ? 'fault' : kpi.kclRms >= KCL_WARN ? 'warn' : 'measure';
  const icGainTone: 'measure' | 'warn' = Math.abs(kpi.icGainEst - 1) > 0.1 ? 'warn' : 'measure';
  const imbalanceTone: 'measure' | 'warn' = kpi.imbalancePct > 8 ? 'warn' : 'measure';

  return (
    <SerialCompareCardShell
      title="三相 ia/ib/ic 理论 vs 实测"
      eyebrow="three-phase compare"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">ic LEM 增益 {formatNumber(icGain, 2)} ×</span>
          <input
            type="range"
            min={0.7}
            max={1.3}
            step={0.01}
            value={icGain}
            onChange={(e) => setIcGain(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label="ic 通道 LEM 增益系数"
            aria-valuemin={0.7}
            aria-valuemax={1.3}
            aria-valuenow={icGain}
            aria-valuetext={`${formatNumber(icGain, 2)} 倍`}
          />
        </label>
        <label className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">ADC 偏置 {formatNumber(adcBias, 2)} A</span>
          <input
            type="range"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={adcBias}
            onChange={(e) => setAdcBias(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label="ADC 直流偏置（A）"
            aria-valuemin={-0.5}
            aria-valuemax={0.5}
            aria-valuenow={adcBias}
            aria-valuetext={`${formatNumber(adcBias, 2)} 安培`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ThreeChannelChart title="实测 ia/ib/ic（A）" rows={displayRows} suffix="Real" />
        <KclChart title="KCL 残差 = ia+ib+ic（A）" rows={displayRows} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label="KCL 残差 RMS" value={`${formatNumber(kpi.kclRms, 3)} A`} tone={kclTone} />
        <KpiTile label="ic 增益估算" value={`${formatNumber(kpi.icGainEst, 3)} ×`} tone={icGainTone} />
        <KpiTile label="αβ 模长波动" value={`${formatNumber(kpi.imbalancePct, 1)} %`} tone={imbalanceTone} />
        <KpiTile label="窗口样本数" value={`${displayRows.length} 帧`} tone="primary" />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        板端协议：t_us, <span className="text-accent-measure">ia, ib, ic</span> ·
        滑块模拟 LEM 增益偏差 + ADC 直流偏置；KCL 残差非零 → ADC 校准 / 共模偏置问题
      </p>
    </SerialCompareCardShell>
  );
}

function ThreeChannelChart({
  title,
  rows,
  suffix,
}: {
  title: string;
  rows: Row[];
  suffix: 'Real' | 'Theory';
}) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-measure)" label="A" />
          <Legend color="var(--accent-primary)" label="B" />
          <Legend color="var(--accent-warn)" label="C" />
        </span>
      </header>
      <div className="h-44">
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
            <Line type="monotone" dataKey={`ia${suffix}`} dot={false} stroke="var(--accent-measure)" strokeWidth={1.5} isAnimationActive={false} name="A" />
            <Line type="monotone" dataKey={`ib${suffix}`} dot={false} stroke="var(--accent-primary)" strokeWidth={1.5} isAnimationActive={false} name="B" />
            <Line type="monotone" dataKey={`ic${suffix}`} dot={false} stroke="var(--accent-warn)" strokeWidth={1.5} isAnimationActive={false} name="C" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function KclChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <Legend color="var(--accent-fault)" label="ia+ib+ic" />
      </header>
      <div className="h-44">
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
            <ReferenceLine y={0} stroke="#43f7b5" strokeDasharray="2 4" />
            <Line type="monotone" dataKey="kcl" dot={false} stroke="var(--accent-fault)" strokeWidth={1.4} isAnimationActive={false} name="KCL" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
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
  const color =
    tone === 'fault'
      ? 'var(--accent-fault)'
      : tone === 'warn'
        ? 'var(--accent-warn)'
        : tone === 'primary'
          ? 'var(--accent-primary)'
          : 'var(--accent-measure)';
  const shape = tone === 'fault' ? '▲' : tone === 'warn' ? '◆' : '●';
  const sr = tone === 'fault' ? '严重偏差' : tone === 'warn' ? '警告偏差' : tone === 'primary' ? '辅助值' : '正常';
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
