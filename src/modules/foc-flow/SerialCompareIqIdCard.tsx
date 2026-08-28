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
import { mockFocFlowSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareIqIdCard：FOC 电流环"理论 vs 实测"对照。
 *
 * 三条线 × 2（Iq 和 Id）：
 *   - Iq_ref / Id_ref：参数面板给定（store.foc.iqRef / idRef）
 *   - Iq_sim / Id_sim：浏览器仿真（simulateCurrentLoop 的 PI 跟踪输出）
 *   - Iq_real / Id_real：实测（来自 SerialStore.buffer.iq / id；缺字段时退化为 mock 合成）
 *
 * 显示 KPI：
 *   - 跟踪误差 RMSE = sqrt(mean((Iq_real - Iq_ref)²))
 *   - 实测 / 仿真 上升时间（10%-90%），差值百分比
 *
 * 协议字段需求（板端发送）：
 *   - 必需：t_us, ia, ib, ic（任何卡都依赖这些）
 *   - 推荐：iq, id（直接发送 dq 域）—— 没有时退化为 mock
 */

const IQ_FAULT_RMSE = 1.0;
const IQ_WARN_RMSE = 0.5;

interface Row {
  t_ms: number;
  iqRef: number;
  iqSim: number;
  iqReal?: number;
  idRef: number;
  idSim: number;
  idReal?: number;
}

/** 估算阶跃响应上升时间（10%-90%），返回 ms；不足两段时返回 NaN。 */
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

export function SerialCompareIqIdCard() {
  const { t } = useI18n();
  const buffer = useSerialStore((s) => s.buffer);
  const foc = useSimulationStore((s) => s.foc);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);

  const windowMs = timebaseToWindowMs(timebase);

  // 当 paused → 冻结快照（用 useState 临时存 ref 也行，这里简单做：paused 时不更新依赖）
  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    // 取最近 windowMs 的样本作为渲染源
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      // 仿真序列：mock generator 同步给一帧"理论 + 仿真"的 PI 阶跃响应；
      // 实测：优先取 sample.iq / sample.id；缺失时用 mock.iqReal 兜底
      const mock = mockFocFlowSample(sample.t_ms, {
        iqRef: foc.iqRef,
        idRef: foc.idRef,
        kp: foc.kp,
        // ki 范围（store 给的是 0..500 量级）—— 直接传
        ki: foc.ki,
      });
      const realIq = (sample as { iq?: number }).iq;
      const realId = (sample as { id?: number }).id;
      return {
        t_ms: sample.t_ms,
        iqRef: foc.iqRef,
        iqSim: mock.iqSim,
        iqReal: realIq ?? mock.iqReal,
        idRef: foc.idRef,
        idSim: mock.idSim,
        idReal: realId ?? mock.idReal,
      };
    });
  }, [buffer, windowMs, foc.iqRef, foc.idRef, foc.kp, foc.ki]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { rmse: 0, riseSim: Number.NaN, riseReal: Number.NaN, riseDiffPct: Number.NaN };
    }
    let sumSq = 0;
    let cnt = 0;
    for (const r of displayRows) {
      if (r.iqReal != null) {
        const d = r.iqReal - r.iqRef;
        sumSq += d * d;
        cnt += 1;
      }
    }
    const rmse = cnt > 0 ? Math.sqrt(sumSq / cnt) : 0;
    const times = displayRows.map((r) => r.t_ms);
    const simValues = displayRows.map((r) => r.iqSim);
    const realValues = displayRows.map((r) => r.iqReal ?? r.iqSim);
    const riseSim = estimateRiseTimeMs(times, simValues, foc.iqRef);
    const riseReal = estimateRiseTimeMs(times, realValues, foc.iqRef);
    const riseDiffPct =
      Number.isFinite(riseSim) && Number.isFinite(riseReal) && riseSim > 0
        ? ((riseReal - riseSim) / riseSim) * 100
        : Number.NaN;
    return { rmse, riseSim, riseReal, riseDiffPct };
  }, [displayRows, foc.iqRef]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        iqRef: r.iqRef.toFixed(4),
        iqSim: r.iqSim.toFixed(4),
        iqReal: r.iqReal != null ? r.iqReal.toFixed(4) : '',
        idRef: r.idRef.toFixed(4),
        idSim: r.idSim.toFixed(4),
        idReal: r.idReal != null ? r.idReal.toFixed(4) : '',
      })),
      ['t_ms', 'iqRef', 'iqSim', 'iqReal', 'idRef', 'idSim', 'idReal'],
    );
    return { filename: 'foc-flow-serial-compare', csv };
  };

  const rmseTone: 'measure' | 'warn' | 'fault' =
    kpi.rmse >= IQ_FAULT_RMSE ? 'fault' : kpi.rmse >= IQ_WARN_RMSE ? 'warn' : 'measure';

  return (
    <SerialCompareCardShell
      title={t('focFlow.serialIqIdTitle')}
      eyebrow="foc current loop"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ThreeLineChart
          title={t('focFlow.serialIqChartTitle')}
          rows={displayRows}
          refKey="iqRef"
          simKey="iqSim"
          realKey="iqReal"
        />
        <ThreeLineChart
          title={t('focFlow.serialIdChartTitle')}
          rows={displayRows}
          refKey="idRef"
          simKey="idSim"
          realKey="idReal"
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile
          label={t('focFlow.serialKpiRmse')}
          value={`${formatNumber(kpi.rmse, 3)} A`}
          tone={rmseTone}
        />
        <KpiTile
          label={t('focFlow.serialKpiRiseReal')}
          value={Number.isFinite(kpi.riseReal) ? `${formatNumber(kpi.riseReal, 1)} ms` : '--'}
          tone="measure"
        />
        <KpiTile
          label={t('focFlow.serialKpiRiseSim')}
          value={Number.isFinite(kpi.riseSim) ? `${formatNumber(kpi.riseSim, 1)} ms` : '--'}
          tone="primary"
        />
        <KpiTile
          label={t('focFlow.serialKpiRiseDiff')}
          value={
            Number.isFinite(kpi.riseDiffPct)
              ? `${kpi.riseDiffPct >= 0 ? '+' : ''}${formatNumber(kpi.riseDiffPct, 1)} %`
              : '--'
          }
          tone={Math.abs(kpi.riseDiffPct) > 30 ? 'warn' : 'measure'}
        />
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('focFlow.serialProtocolLead')}{' '}
        <span className="text-accent-measure">iq, id</span>
        {t('focFlow.serialProtocolMid')}{' '}
        {t('focFlow.serialProtocolTail')}
      </p>
    </SerialCompareCardShell>
  );
}

function ThreeLineChart({
  title,
  rows,
  refKey,
  simKey,
  realKey,
}: {
  title: string;
  rows: Row[];
  refKey: keyof Row;
  simKey: keyof Row;
  realKey: keyof Row;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex flex-wrap items-center justify-between gap-1 text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-warn)" label="ref" dashed />
          <Legend color="var(--accent-primary)" label="sim" />
          <Legend color="var(--accent-measure)" label="real" />
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
            <Line
              type="monotone"
              dataKey={refKey as string}
              dot={false}
              stroke="var(--accent-warn)"
              strokeDasharray="6 3"
              strokeWidth={1.2}
              isAnimationActive={false}
              name="ref"
            />
            <Line
              type="monotone"
              dataKey={simKey as string}
              dot={false}
              stroke="var(--accent-primary)"
              strokeDasharray="3 3"
              strokeWidth={1.4}
              isAnimationActive={false}
              name="sim"
            />
            <Line
              type="monotone"
              dataKey={realKey as string}
              dot={false}
              stroke="var(--accent-measure)"
              strokeWidth={1.8}
              isAnimationActive={false}
              name="real"
            />
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
  const sr =
    tone === 'fault'
      ? t('focFlow.kpiSrFault')
      : tone === 'warn'
        ? t('focFlow.kpiSrWarn')
        : tone === 'primary'
          ? t('focFlow.kpiSrSim')
          : t('focFlow.kpiSrOk');
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
