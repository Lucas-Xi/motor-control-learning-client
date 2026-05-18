import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import { mockStartupSample } from '../../utils/serialMockGenerators';
import { STATE_DESCRIPTIONS } from '../../simulation/math/startup';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';
import type { StartupState } from '../../simulation/engine/types';

/**
 * SerialCompareStartupCard：实测启动序列 vs 仿真状态机。
 *
 * 三通道：
 *   - state 时序（idle → precharge → align → open-loop → hfi → bemf → fieldweak）
 *   - rpm_sim / rpm_real 对照
 *   - 反液击斜坡违规标记（瞬时 dω/dt > 1.5 × accelRampRpmS）
 *
 * 状态切换瞬间用 ReferenceLine 标注。
 *
 * KPI：
 *   - 当前 state
 *   - 状态切换总数（窗口内）
 *   - rpm 跟踪 RMSE（real - sim）
 *   - 斜坡违规计数（窗口内）
 *
 * 板端协议字段需求：
 *   - 必需：t_us, ia, ib, ic
 *   - 推荐：state(u8 enum), rpm_meas(f32), iq_meas(f32)
 *     —— 当前协议未含，UI 用 mock 合成（参数面板 startup 全字段驱动）。
 */

interface Row {
  t_ms: number;
  state: StartupState;
  stateIdx: number; // 0..6，便于绘图
  rpmSim: number;
  rpmReal: number;
  iqSim: number;
  iqReal: number;
  slugViolation: boolean;
}

const STATE_ORDER: StartupState[] = ['idle', 'precharge', 'align', 'open-loop', 'hfi', 'bemf', 'fieldweak'];

function stateToIdx(s: StartupState): number {
  const idx = STATE_ORDER.indexOf(s);
  return idx < 0 ? 0 : idx;
}

export function SerialCompareStartupCard() {
  const buffer = useSerialStore((s) => s.buffer);
  const startup = useSimulationStore((s) => s.startup);
  const [timebase, setTimebase] = useState<SerialTimebase>('1s');
  const [paused, setPaused] = useState(false);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockStartupSample(sample.t_ms, { startup, noiseRpm: 6 });
      return {
        t_ms: sample.t_ms,
        state: m.state,
        stateIdx: stateToIdx(m.state),
        rpmSim: m.rpmSim,
        rpmReal: m.rpmReal,
        iqSim: m.iqSim,
        iqReal: m.iqReal,
        slugViolation: m.slugViolation,
      };
    });
  }, [buffer, windowMs, startup]);

  const displayRows = useFrozenRows(rows, paused);

  /** 找出状态切换点（用于在图上画 ReferenceLine） */
  const transitions = useMemo<Array<{ t: number; from: StartupState; to: StartupState }>>(() => {
    const out: Array<{ t: number; from: StartupState; to: StartupState }> = [];
    let prev: StartupState | null = null;
    for (const r of displayRows) {
      if (prev !== null && r.state !== prev) out.push({ t: r.t_ms, from: prev, to: r.state });
      prev = r.state;
    }
    return out;
  }, [displayRows]);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return {
        currentState: 'idle' as StartupState,
        transitionCount: 0,
        rmseRpm: 0,
        slugCount: 0,
      };
    }
    let sumSq = 0;
    let slugCount = 0;
    for (const r of displayRows) {
      const d = r.rpmReal - r.rpmSim;
      sumSq += d * d;
      if (r.slugViolation) slugCount += 1;
    }
    return {
      currentState: displayRows[displayRows.length - 1].state,
      transitionCount: transitions.length,
      rmseRpm: Math.sqrt(sumSq / displayRows.length),
      slugCount,
    };
  }, [displayRows, transitions]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        state: r.state,
        rpmSim: r.rpmSim.toFixed(2),
        rpmReal: r.rpmReal.toFixed(2),
        iqSim: r.iqSim.toFixed(3),
        iqReal: r.iqReal.toFixed(3),
        slugViolation: r.slugViolation ? 1 : 0,
      })),
      ['t_ms', 'state', 'rpmSim', 'rpmReal', 'iqSim', 'iqReal', 'slugViolation'],
    );
    return { filename: 'startup-statemachine-compare', csv };
  };

  return (
    <SerialCompareCardShell
      title="启动状态机：实测 vs 仿真"
      eyebrow="startup sequence"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <RpmChart rows={displayRows} transitions={transitions} accelRamp={startup.accelRampRpmS} />
        <StateChart rows={displayRows} transitions={transitions} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label="当前 state" value={STATE_DESCRIPTIONS[kpi.currentState].name} tone="primary" />
        <KpiTile label="状态切换次数" value={`${kpi.transitionCount}`} tone="measure" />
        <KpiTile
          label="rpm 跟踪 RMSE"
          value={`${formatNumber(kpi.rmseRpm, 1)} rpm`}
          tone={kpi.rmseRpm > 30 ? 'warn' : 'measure'}
        />
        <KpiTile
          label="反液击违规"
          value={
            kpi.slugCount === 0 ? (
              '0 次'
            ) : (
              `${kpi.slugCount} 次`
            )
          }
          tone={kpi.slugCount > 0 ? 'fault' : 'measure'}
        />
      </div>

      {/* 状态时序条 */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {STATE_ORDER.map((s) => {
          const isActive = s === kpi.currentState;
          const isPast = stateToIdx(kpi.currentState) > stateToIdx(s);
          return (
            <span
              key={s}
              className={`rounded border px-1.5 py-0.5 text-caption transition-colors ${
                isActive
                  ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                  : isPast
                    ? 'border-accent-measure/30 bg-accent-measure/[0.06] text-accent-measure'
                    : 'border-line-subtle bg-bg-base text-ink-muted'
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              {isActive && <span aria-hidden>● </span>}
              {STATE_DESCRIPTIONS[s].name}
            </span>
          );
        })}
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        板端协议（推荐扩展）：t_us, ia, ib, ic,{' '}
        <span className="text-accent-warn">state(u8 enum), rpm_meas(f32), iq_meas(f32)</span> ·
        反液击斜坡上限 {formatNumber(startup.accelRampRpmS, 0)} rpm/s；超出 1.5× 视为违规
      </p>
    </SerialCompareCardShell>
  );
}

function RpmChart({
  rows,
  transitions,
  accelRamp,
}: {
  rows: Row[];
  transitions: Array<{ t: number; from: StartupState; to: StartupState }>;
  accelRamp: number;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex flex-wrap items-center justify-between gap-1 text-caption text-ink-muted">
        <span>转速时序（rpm）· 斜坡 {formatNumber(accelRamp, 0)} rpm/s</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="sim" dashed />
          <Legend color="var(--accent-measure)" label="real" />
        </span>
      </header>
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
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
            <ReferenceLine y={0} stroke="#1e2a3d" strokeDasharray="2 4" />
            {transitions.map((tr, i) => (
              <ReferenceLine
                key={`${tr.t}-${i}`}
                x={tr.t}
                stroke="var(--accent-warn)"
                strokeDasharray="2 3"
                label={{ value: STATE_DESCRIPTIONS[tr.to].name, fill: '#ffb84d', fontSize: 9, position: 'top' }}
              />
            ))}
            <Line type="monotone" dataKey="rpmSim" dot={false} stroke="var(--accent-primary)" strokeDasharray="3 3" strokeWidth={1.4} isAnimationActive={false} name="sim" />
            <Line type="monotone" dataKey="rpmReal" dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="real" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function StateChart({
  rows,
  transitions,
}: {
  rows: Row[];
  transitions: Array<{ t: number; from: StartupState; to: StartupState }>;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>state 时序 + 反液击标记</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-warn)" label="state idx" />
          <span className="flex items-center gap-1 text-accent-fault">
            <AlertTriangle className="h-3 w-3" aria-hidden /> slug
          </span>
        </span>
      </header>
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              width={66}
              domain={[0, STATE_ORDER.length - 1]}
              ticks={[0, 1, 2, 3, 4, 5, 6]}
              tickFormatter={(v) => STATE_DESCRIPTIONS[STATE_ORDER[v as number]]?.name ?? ''}
            />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
              formatter={(value: unknown) => {
                const idx = Number(value);
                return [STATE_DESCRIPTIONS[STATE_ORDER[idx]]?.name ?? '--', 'state'];
              }}
            />
            {transitions.map((tr, i) => (
              <ReferenceLine key={`tr-${tr.t}-${i}`} x={tr.t} stroke="var(--accent-warn)" strokeDasharray="2 3" />
            ))}
            {rows.filter((r) => r.slugViolation).slice(0, 12).map((r, i) => (
              <ReferenceLine key={`slug-${i}`} x={r.t_ms} stroke="var(--accent-fault)" strokeDasharray="3 1" />
            ))}
            <Line type="stepAfter" dataKey="stateIdx" dot={false} stroke="var(--accent-warn)" strokeWidth={1.6} isAnimationActive={false} name="state" />
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
  const Icon = tone === 'fault' ? AlertTriangle : tone === 'warn' ? AlertTriangle : CheckCircle2;
  const sr = tone === 'fault' ? '严重' : tone === 'warn' ? '警告' : '正常';
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="flex items-center gap-1 text-body font-medium" style={{ color }}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {value}
        <span className="sr-only"> · {sr}</span>
      </p>
    </div>
  );
}
