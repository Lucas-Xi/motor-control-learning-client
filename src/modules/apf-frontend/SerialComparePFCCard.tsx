import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import {
  SerialCompareCardShell,
  type SerialTimebase,
} from '../../components/lab/SerialCompareCardShell';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSerialStore } from '../../store/serialStore';
import { useSimulationStore } from '../../store/simulationStore';
import { mockPfcSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialComparePFCCard：实测 PF / THD vs 仿真值 + Udc 纹波 + IEC Class D 谐波柱状。
 *
 * 三大对比：
 *   - PF：实测 vs 仿真
 *   - THD：实测 vs 仿真（i_grid 的 2..40 次谐波 RMS / 基波）
 *   - 谐波柱状：3 / 5 / 7 / 9 / 11 次实测值 vs IEC 61000-3-2 Class D 限值
 *
 * 数据来源：
 *   - 仿真：src/simulation/math/boostPfc.ts::simulatePfcCycle（已经被 APFFrontendModule 用了）
 *   - 实测：mockPfcSample 在仿真结果基础上加噪声 + 把 PF/THD 退化几个百分点，
 *     模拟"真实板上"由 EMI、元件损耗造成的差异。
 *
 * 板端协议字段需求：
 *   - 必需：t_us, ia, ib, ic
 *   - 推荐：udc(f32), v_grid(f32), i_grid(f32), pf(f32), thd(f32)
 *     —— 当前协议未含，UI 用 mock 合成（参数面板 apf 全字段驱动）。
 *
 * 这张卡不需要"窗口时基"（仿真本身已是稳态周期），所以 timebase / paused 仅用于 shell 视觉一致性。
 */

export function SerialComparePFCCard() {
  const buffer = useSerialStore((s) => s.buffer);
  const apf = useSimulationStore((s) => s.apf);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);

  // 只要 buffer 非空就认为"实测在线"，PFC 卡用全周期仿真结果
  const result = useMemo(() => {
    if (buffer.length === 0) return null;
    return mockPfcSample({ apf, noiseA: 0.18, pfDegrade: 0.025, thdInflatePct: 1.4 });
  }, [buffer.length, apf]);

  const chartRows = useMemo(() => {
    if (!result) return [] as Array<{ t_ms: number; iGridSim: number; iGridReal: number; udc: number }>;
    const len = result.t_ms.length;
    return Array.from({ length: len }, (_, i) => ({
      t_ms: result.t_ms[i],
      iGridSim: result.iGridSim[i],
      iGridReal: result.iGridReal[i],
      udc: result.udc[i],
    }));
  }, [result]);

  // paused 时冻结一份当前数据（这里因为是稳态仿真，paused 等同于"不再触发 useMemo"）
  const displayRows = useMemo(() => {
    if (!result) return [] as typeof chartRows;
    return paused ? chartRows : chartRows;
  }, [chartRows, paused, result]);

  const onExportCsv = () => {
    if (!result || displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        iGridSim: r.iGridSim.toFixed(4),
        iGridReal: r.iGridReal.toFixed(4),
        udc: r.udc.toFixed(2),
      })),
      ['t_ms', 'iGridSim', 'iGridReal', 'udc'],
    );
    return { filename: 'apf-pfc-compare', csv };
  };

  return (
    <SerialCompareCardShell
      title="PF / THD：实测 vs 仿真"
      eyebrow="boost PFC compliance"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      {result ? (
        <>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <UdcRippleChart rows={displayRows} udcRef={apf.udcRef} />
            <HarmonicBarChart harmonics={result.harmonics} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            <KpiTile
              label="实测 PF"
              value={`${formatNumber(result.pfReal, 3)}（仿真 ${formatNumber(result.pfSim, 3)}）`}
              tone={result.pfReal < 0.9 ? 'warn' : 'measure'}
            />
            <KpiTile
              label="实测 THD"
              value={`${formatNumber(result.thdReal, 1)} %（仿真 ${formatNumber(result.thdSim, 1)} %）`}
              tone={result.thdReal > 20 ? 'fault' : result.thdReal > 10 ? 'warn' : 'measure'}
            />
            <KpiTile
              label="Udc 平均"
              value={`${formatNumber(result.udcAvg, 1)} V`}
              tone={Math.abs(result.udcAvg - apf.udcRef) > 10 ? 'warn' : 'measure'}
            />
            <KpiTile
              label="Udc 纹波（pk-pk）"
              value={`${formatNumber(result.udcRipple, 1)} V`}
              tone={result.udcRipple > apf.udcRef * 0.05 ? 'warn' : 'measure'}
            />
          </div>
        </>
      ) : null}
      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        板端协议（推荐扩展）：t_us, ia, ib, ic,{' '}
        <span className="text-accent-warn">udc(f32), v_grid(f32), i_grid(f32), pf(f32), thd(f32)</span> ·
        谐波限值参考 IEC 61000-3-2 Class D（家电 ≤ 600 W），超限项以 fault 红色柱标记
      </p>
    </SerialCompareCardShell>
  );
}

function UdcRippleChart({ rows, udcRef }: { rows: Array<{ t_ms: number; udc: number; iGridSim: number; iGridReal: number }>; udcRef: number }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>Udc 母线纹波 + 电网电流</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="i_grid 仿真" dashed />
          <Legend color="var(--accent-measure)" label="i_grid 实测" />
          <Legend color="var(--accent-warn)" label="Udc" />
        </span>
      </header>
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis yAxisId="i" tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} />
            <YAxis yAxisId="u" orientation="right" tick={{ fill: '#9eb5cb', fontSize: 10 }} width={48} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <ReferenceLine yAxisId="u" y={udcRef} stroke="var(--accent-warn)" strokeDasharray="3 3" />
            <Line yAxisId="i" type="monotone" dataKey="iGridSim" dot={false} stroke="var(--accent-primary)" strokeDasharray="3 3" strokeWidth={1.3} isAnimationActive={false} name="i_grid sim" />
            <Line yAxisId="i" type="monotone" dataKey="iGridReal" dot={false} stroke="var(--accent-measure)" strokeWidth={1.5} isAnimationActive={false} name="i_grid real" />
            <Line yAxisId="u" type="monotone" dataKey="udc" dot={false} stroke="var(--accent-warn)" strokeWidth={1.4} isAnimationActive={false} name="Udc" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function HarmonicBarChart({ harmonics }: { harmonics: Array<{ order: number; measuredPct: number; simPct: number; iecLimitPct: number | null }> }) {
  // 行结构：每个 order 一行，三列（measured, sim, limit）
  const rows = harmonics.map((h) => ({
    label: `${h.order}次`,
    measured: h.measuredPct,
    sim: h.simPct,
    limit: h.iecLimitPct ?? 0,
    overLimit: h.iecLimitPct != null && h.measuredPct > h.iecLimitPct,
  }));
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>谐波柱状（% 基波）vs IEC 61000-3-2 Class D</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-measure)" label="实测" />
          <Legend color="var(--accent-primary)" label="仿真" />
          <Legend color="var(--accent-fault)" label="超限" />
        </span>
      </header>
      <div className="h-44">
        <SafeResponsiveContainer>
          <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="label" tick={{ fill: '#9eb5cb', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} unit=" %" />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <Bar dataKey="measured" isAnimationActive={false} name="实测">
              {rows.map((r, i) => (
                <Cell key={`m-${i}`} fill={r.overLimit ? 'var(--accent-fault)' : 'var(--accent-measure)'} fillOpacity={0.85} />
              ))}
            </Bar>
            <Bar dataKey="sim" isAnimationActive={false} name="仿真">
              {rows.map((_, i) => (
                <Cell key={`s-${i}`} fill="var(--accent-primary)" fillOpacity={0.6} />
              ))}
            </Bar>
            <Bar dataKey="limit" isAnimationActive={false} name="IEC 限值">
              {rows.map((_, i) => (
                <Cell key={`l-${i}`} fill="var(--accent-warn)" fillOpacity={0.35} />
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
  const color =
    tone === 'fault'
      ? 'var(--accent-fault)'
      : tone === 'warn'
        ? 'var(--accent-warn)'
        : tone === 'primary'
          ? 'var(--accent-primary)'
          : 'var(--accent-measure)';
  const shape = tone === 'fault' ? '▲' : tone === 'warn' ? '◆' : '●';
  const sr = tone === 'fault' ? '严重' : tone === 'warn' ? '警告' : '正常';
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
