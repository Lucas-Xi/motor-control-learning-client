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
import { mockRefrigerationSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareRefrigerationCard：制冷台架实测 P/T/I vs 仿真循环。
 *
 * 教学意图：
 *   - 仿真：simulateCycle 给出 (P_s, P_d, T_d, I_comp, COP)。
 *   - 实测：仿真 + 噪声 + COP 退化（管路损失 / 换热温差）。
 *   - 等熵效率反推：η_est = η_param × (COP_real / COP_sim)。
 *
 * KPI：
 *   1. 排气压力 P_d 偏差（MPa）
 *   2. 排气温度 T_d 偏差（°C）
 *   3. COP 偏差（%）
 *   4. 等熵效率反推（vs 参数面板 η_isentropic）
 *
 * 板端协议字段需求：
 *   - 必需：t_us
 *   - 推荐：p_suction, p_discharge, t_discharge, i_comp —— 默认 mock
 */

interface Row {
  t_ms: number;
  psReal: number;
  psSim: number;
  pdReal: number;
  pdSim: number;
  tdReal: number;
  tdSim: number;
  currentReal: number;
  currentSim: number;
  copReal: number;
  copSim: number;
  isentropicEffEst: number;
}

export function SerialCompareRefrigerationCard() {
  const buffer = useSerialStore((s) => s.buffer);
  const refrig = useSimulationStore((s) => s.refrigeration);
  const [timebase, setTimebase] = useState<SerialTimebase>('1s');
  const [paused, setPaused] = useState(false);
  const [copDegrade, setCopDegrade] = useState(0.04);
  const [rpm, setRpm] = useState(3000);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockRefrigerationSample(sample.t_ms, {
        refrig,
        rpm,
        copDegrade,
      });
      return {
        t_ms: sample.t_ms,
        psReal: m.psReal,
        psSim: m.psSim,
        pdReal: m.pdReal,
        pdSim: m.pdSim,
        tdReal: m.tdReal,
        tdSim: m.tdSim,
        currentReal: m.currentReal,
        currentSim: m.currentSim,
        copReal: m.copReal,
        copSim: m.copSim,
        isentropicEffEst: m.isentropicEffEst,
      };
    });
  }, [buffer, windowMs, refrig, rpm, copDegrade]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { pdErr: 0, tdErr: 0, copErrPct: 0, etaEst: refrig.isentropicEff };
    }
    let sumPd = 0;
    let sumTd = 0;
    let sumCopReal = 0;
    let sumCopSim = 0;
    let etaSum = 0;
    for (const r of displayRows) {
      sumPd += Math.abs(r.pdReal - r.pdSim);
      sumTd += Math.abs(r.tdReal - r.tdSim);
      sumCopReal += r.copReal;
      sumCopSim += r.copSim;
      etaSum += r.isentropicEffEst;
    }
    const n = displayRows.length;
    const copReal = sumCopReal / n;
    const copSim = sumCopSim / n;
    const copErrPct = copSim > 1e-6 ? ((copReal - copSim) / copSim) * 100 : 0;
    return {
      pdErr: sumPd / n,
      tdErr: sumTd / n,
      copErrPct,
      etaEst: etaSum / n,
    };
  }, [displayRows, refrig.isentropicEff]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        psReal: r.psReal.toFixed(4),
        psSim: r.psSim.toFixed(4),
        pdReal: r.pdReal.toFixed(4),
        pdSim: r.pdSim.toFixed(4),
        tdReal: r.tdReal.toFixed(2),
        tdSim: r.tdSim.toFixed(2),
        currentReal: r.currentReal.toFixed(3),
        currentSim: r.currentSim.toFixed(3),
        copReal: r.copReal.toFixed(3),
        copSim: r.copSim.toFixed(3),
        isentropicEffEst: r.isentropicEffEst.toFixed(3),
      })),
      ['t_ms', 'psReal', 'psSim', 'pdReal', 'pdSim', 'tdReal', 'tdSim', 'currentReal', 'currentSim', 'copReal', 'copSim', 'isentropicEffEst'],
    );
    return { filename: 'refrigeration-serial-compare', csv };
  };

  const copTone: 'measure' | 'warn' | 'fault' =
    Math.abs(kpi.copErrPct) >= 15 ? 'fault' : Math.abs(kpi.copErrPct) >= 6 ? 'warn' : 'measure';
  const etaDelta = kpi.etaEst - refrig.isentropicEff;

  return (
    <SerialCompareCardShell
      title="制冷台架：P/T/I/COP 实测 vs 仿真"
      eyebrow="refrigeration compare"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">压缩机转速 {formatNumber(rpm, 0)} rpm</span>
          <input
            type="range"
            min={800}
            max={6000}
            step={50}
            value={rpm}
            onChange={(e) => setRpm(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label="压缩机转速（rpm）"
            aria-valuemin={800}
            aria-valuemax={6000}
            aria-valuenow={rpm}
            aria-valuetext={`${formatNumber(rpm, 0)} 转每分`}
          />
        </label>
        <label className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">COP 退化 {formatNumber(copDegrade * 100, 1)}%</span>
          <input
            type="range"
            min={0}
            max={0.2}
            step={0.005}
            value={copDegrade}
            onChange={(e) => setCopDegrade(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label="实测 COP 退化比例（管路 / 换热损失）"
            aria-valuemin={0}
            aria-valuemax={0.2}
            aria-valuenow={copDegrade}
            aria-valuetext={`${formatNumber(copDegrade * 100, 1)} 百分比`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PressureChart title="排气压力 P_d（MPa）" rows={displayRows} realKey="pdReal" simKey="pdSim" />
        <TempChart title="排气温度 T_d（°C）" rows={displayRows} realKey="tdReal" simKey="tdSim" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <CurrentChart title="压缩机电流（A）" rows={displayRows} />
        <CopChart title="COP 实测 vs 仿真" rows={displayRows} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label="P_d 偏差" value={`${formatNumber(kpi.pdErr, 3)} MPa`} tone={kpi.pdErr > 0.05 ? 'warn' : 'measure'} />
        <KpiTile label="T_d 偏差" value={`${formatNumber(kpi.tdErr, 1)} °C`} tone={kpi.tdErr > 3 ? 'warn' : 'measure'} />
        <KpiTile label="COP 偏差" value={`${kpi.copErrPct >= 0 ? '+' : ''}${formatNumber(kpi.copErrPct, 1)} %`} tone={copTone} />
        <KpiTile
          label="η_isentropic 反推"
          value={`${formatNumber(kpi.etaEst, 3)} (Δ${etaDelta >= 0 ? '+' : ''}${formatNumber(etaDelta, 3)})`}
          tone={Math.abs(etaDelta) > 0.05 ? 'warn' : 'measure'}
        />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        板端协议：t_us · <span className="text-accent-measure">p_suction, p_discharge, t_discharge, i_comp</span> ·
        实测 COP 退化 → 反推等熵效率下降，定位是压缩机老化还是换热器结垢
      </p>
    </SerialCompareCardShell>
  );
}

function PressureChart({
  title,
  rows,
  realKey,
  simKey,
}: {
  title: string;
  rows: Row[];
  realKey: keyof Row;
  simKey: keyof Row;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="sim" dashed />
          <Legend color="var(--accent-measure)" label="real" />
        </span>
      </header>
      <div className="h-40">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} width={48} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <Line type="monotone" dataKey={simKey as string} dot={false} stroke="var(--accent-primary)" strokeDasharray="4 3" strokeWidth={1.4} isAnimationActive={false} name="sim" />
            <Line type="monotone" dataKey={realKey as string} dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="real" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function TempChart(props: {
  title: string;
  rows: Row[];
  realKey: keyof Row;
  simKey: keyof Row;
}) {
  // 温度图复用压力图样式 / 配色，仅 Y 轴宽度不同也无所谓 —— 通过组件实例化复用。
  return <PressureChart {...props} />;
}

function CurrentChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="sim" dashed />
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
            <Line type="monotone" dataKey="currentSim" dot={false} stroke="var(--accent-primary)" strokeDasharray="4 3" strokeWidth={1.4} isAnimationActive={false} name="sim" />
            <Line type="monotone" dataKey="currentReal" dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="real" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function CopChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="sim" dashed />
          <Legend color="var(--accent-measure)" label="real" />
          <Legend color="var(--accent-warn)" label="η_est" />
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
            <ReferenceLine y={1} stroke="#1e2a3d" strokeDasharray="2 4" />
            <Line type="monotone" dataKey="copSim" dot={false} stroke="var(--accent-primary)" strokeDasharray="4 3" strokeWidth={1.4} isAnimationActive={false} name="sim" />
            <Line type="monotone" dataKey="copReal" dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="real" />
            <Line type="monotone" dataKey="isentropicEffEst" dot={false} stroke="var(--accent-warn)" strokeWidth={1.2} isAnimationActive={false} name="η_est" />
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
