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
import { mockClarkeSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareClarkeCard：αβ 推算"理论 vs 实测" + αβ 平面散点轨迹。
 *
 * 教学意图：
 *   - 平衡三相 → αβ 平面是一个完美的圆（半径 = 1.5×amplitude）。
 *   - ic 通道增益偏差 → αβ 轨迹变椭圆（α 不变，β 含 ic 残差）。
 *   - 通过散点轨迹直观看到"圆/椭圆"形态。
 *
 * 三个 KPI：
 *   1. α/β 跟踪 RMSE（实测 vs 理论）
 *   2. 椭圆度 e = (|axis_long| − |axis_short|) / |axis_long|（0 = 圆 / >0.1 → 需校准）
 *   3. 零序分量 RMS（理想 = 0；存在 → 公共耦合 / ADC 偏置）
 *
 * 板端协议字段需求：
 *   - 必需：t_us, ia, ib, ic
 *   - 可选：i_alpha, i_beta（如板端已做 Clarke）—— 默认走 mock
 */

interface Row {
  t_ms: number;
  alphaReal: number;
  betaReal: number;
  alphaTheory: number;
  betaTheory: number;
  zeroSeq: number;
}

export function SerialCompareClarkeCard() {
  const buffer = useSerialStore((s) => s.buffer);
  const threePhase = useSimulationStore((s) => s.threePhase);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);
  const [icGain, setIcGain] = useState(1.0);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockClarkeSample(sample.t_ms, { threePhase, icCalibGain: icGain });
      return {
        t_ms: sample.t_ms,
        alphaReal: m.alphaReal,
        betaReal: m.betaReal,
        alphaTheory: m.alphaTheory,
        betaTheory: m.betaTheory,
        zeroSeq: m.zeroSeq,
      };
    });
  }, [buffer, windowMs, threePhase, icGain]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { rmse: 0, ellipticity: 0, zeroRms: 0, axisLong: 0, axisShort: 0 };
    }
    let sumSq = 0;
    let sumZeroSq = 0;
    let maxAbsA = 0;
    let maxAbsB = 0;
    for (const r of displayRows) {
      const da = r.alphaReal - r.alphaTheory;
      const db = r.betaReal - r.betaTheory;
      sumSq += da * da + db * db;
      sumZeroSq += r.zeroSeq * r.zeroSeq;
      if (Math.abs(r.alphaReal) > maxAbsA) maxAbsA = Math.abs(r.alphaReal);
      if (Math.abs(r.betaReal) > maxAbsB) maxAbsB = Math.abs(r.betaReal);
    }
    const rmse = Math.sqrt(sumSq / displayRows.length);
    const zeroRms = Math.sqrt(sumZeroSq / displayRows.length);
    const axisLong = Math.max(maxAbsA, maxAbsB);
    const axisShort = Math.min(maxAbsA, maxAbsB);
    const ellipticity = axisLong > 1e-6 ? (axisLong - axisShort) / axisLong : 0;
    return { rmse, ellipticity, zeroRms, axisLong, axisShort };
  }, [displayRows]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        alphaReal: r.alphaReal.toFixed(4),
        betaReal: r.betaReal.toFixed(4),
        alphaTheory: r.alphaTheory.toFixed(4),
        betaTheory: r.betaTheory.toFixed(4),
        zeroSeq: r.zeroSeq.toFixed(5),
      })),
      ['t_ms', 'alphaReal', 'betaReal', 'alphaTheory', 'betaTheory', 'zeroSeq'],
    );
    return { filename: 'clarke-serial-compare', csv };
  };

  const ellipsisTone: 'measure' | 'warn' | 'fault' =
    kpi.ellipticity >= 0.18 ? 'fault' : kpi.ellipticity >= 0.08 ? 'warn' : 'measure';
  const zeroTone: 'measure' | 'warn' = kpi.zeroRms > 0.15 ? 'warn' : 'measure';

  return (
    <SerialCompareCardShell
      title="Clarke α/β 理论 vs 实测"
      eyebrow="clarke compare"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="mb-3">
        <label className="block rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">ic 通道增益 {formatNumber(icGain, 2)} ×（圆/椭圆切换）</span>
          <input
            type="range"
            min={0.7}
            max={1.3}
            step={0.01}
            value={icGain}
            onChange={(e) => setIcGain(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label="ic 通道增益系数（影响 αβ 轨迹圆/椭圆形态）"
            aria-valuemin={0.7}
            aria-valuemax={1.3}
            aria-valuenow={icGain}
            aria-valuetext={`${formatNumber(icGain, 2)} 倍`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <TwoLineChart title="α 实测 vs 理论（A）" rows={displayRows} realKey="alphaReal" theoryKey="alphaTheory" />
        <TwoLineChart title="β 实测 vs 理论（A）" rows={displayRows} realKey="betaReal" theoryKey="betaTheory" />
      </div>

      <div className="mt-3">
        <AlphaBetaTrajectory rows={displayRows} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label="α/β 跟踪 RMSE" value={`${formatNumber(kpi.rmse, 3)} A`} tone={kpi.rmse > 0.5 ? 'warn' : 'measure'} />
        <KpiTile label="轨迹椭圆度" value={`${formatNumber(kpi.ellipticity * 100, 1)} %`} tone={ellipsisTone} />
        <KpiTile label="零序分量 RMS" value={`${formatNumber(kpi.zeroRms, 3)} A`} tone={zeroTone} />
        <KpiTile label="长/短轴比" value={`${formatNumber(kpi.axisLong, 2)} / ${formatNumber(kpi.axisShort, 2)} A`} tone="primary" />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        板端协议：t_us, <span className="text-accent-measure">ia, ib, ic</span> · 浏览器实时 Clarke。
        圆 → 平衡；椭圆 → ic 增益失配；偏离原点 → ADC 偏置
      </p>
    </SerialCompareCardShell>
  );
}

function TwoLineChart({
  title,
  rows,
  realKey,
  theoryKey,
}: {
  title: string;
  rows: Row[];
  realKey: keyof Row;
  theoryKey: keyof Row;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="theory" dashed />
          <Legend color="var(--accent-measure)" label="real" />
        </span>
      </header>
      <div className="h-40">
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
            <Line type="monotone" dataKey={theoryKey as string} dot={false} stroke="var(--accent-primary)" strokeDasharray="4 3" strokeWidth={1.3} isAnimationActive={false} name="theory" />
            <Line type="monotone" dataKey={realKey as string} dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="real" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function AlphaBetaTrajectory({ rows }: { rows: Row[] }) {
  // 内联 SVG 散点 + 折线，避免引入 Scatter 组件，体积更小。
  const size = 280;
  const pad = 18;
  const maxAbs = useMemo(() => {
    let m = 1;
    for (const r of rows) {
      const a = Math.max(Math.abs(r.alphaReal), Math.abs(r.alphaTheory));
      const b = Math.max(Math.abs(r.betaReal), Math.abs(r.betaTheory));
      if (a > m) m = a;
      if (b > m) m = b;
    }
    return m * 1.1;
  }, [rows]);
  const cx = size / 2;
  const cy = size / 2;
  const scale = (size / 2 - pad) / maxAbs;

  const realPts = rows.map((r) => `${cx + r.alphaReal * scale},${cy - r.betaReal * scale}`).join(' ');
  const theoryPts = rows.map((r) => `${cx + r.alphaTheory * scale},${cy - r.betaTheory * scale}`).join(' ');

  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="mb-1 flex items-center justify-between text-caption text-ink-muted">
        <span>αβ 平面轨迹（圆=平衡 / 椭圆=不平衡）</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="theory" dashed />
          <Legend color="var(--accent-measure)" label="real" />
        </span>
      </header>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block h-64 w-64"
        role="img"
        aria-label="αβ 平面散点轨迹，实测线越接近圆形说明三相越平衡"
      >
        {/* 网格 */}
        <line x1={pad} y1={cy} x2={size - pad} y2={cy} stroke="rgba(231,243,255,0.12)" />
        <line x1={cx} y1={pad} x2={cx} y2={size - pad} stroke="rgba(231,243,255,0.12)" />
        <circle cx={cx} cy={cy} r={size / 2 - pad} fill="none" stroke="rgba(231,243,255,0.08)" strokeDasharray="3 4" />
        {rows.length > 1 && (
          <>
            <polyline points={theoryPts} fill="none" stroke="var(--accent-primary)" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.7} />
            <polyline points={realPts} fill="none" stroke="var(--accent-measure)" strokeWidth={1.6} />
          </>
        )}
        <text x={size - pad - 6} y={cy - 4} fill="#9eb5cb" fontSize="10" textAnchor="end">α</text>
        <text x={cx + 4} y={pad + 10} fill="#9eb5cb" fontSize="10">β</text>
      </svg>
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
  const color =
    tone === 'fault'
      ? 'var(--accent-fault)'
      : tone === 'warn'
        ? 'var(--accent-warn)'
        : tone === 'primary'
          ? 'var(--accent-primary)'
          : 'var(--accent-measure)';
  const shape = tone === 'fault' ? '▲' : tone === 'warn' ? '◆' : '●';
  const sr = tone === 'fault' ? '严重' : tone === 'warn' ? '警告' : tone === 'primary' ? '辅助' : '正常';
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
