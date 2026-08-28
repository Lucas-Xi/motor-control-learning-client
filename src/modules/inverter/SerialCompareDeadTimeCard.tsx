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
import { estimateDeadTimeUsFromDistortion, mockInverterSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareDeadTimeCard：实测三相相电压 vs 理论 (duty − 0.5) × Udc。
 *
 * 工程意义：
 *   - 死区让相电压在过零附近发生固定方向的"夹"，使输出 RMS < 理论。
 *   - V_real − V_theory 的形状 ≈ −sign(i) × deadLoss × Udc，
 *     峰值正比于 t_dead × f_sw × Udc。
 *
 * KPI：
 *   - V 误差 RMS（A 相）
 *   - 估算 t_dead（μs）= |V_error_peak| / (Udc × f_sw)
 *   - 与参数面板 deadTimeUs 的相对偏差
 *
 * 板端协议字段需求：
 *   - 必需：t_us, ia, ib, ic
 *   - 推荐：va_meas, vb_meas, vc_meas（V，相电压）—— 实测协议尚未定义这些字段，
 *     当前实现走 mock：用 inverterAverageModel 注入与 UI 一致的 deadtime
 *     合成"实测"波形，方便教学演示。
 */

interface Row {
  t_ms: number;
  vaReal: number;
  vbReal: number;
  vcReal: number;
  vaTheory: number;
  vbTheory: number;
  vcTheory: number;
  vaErr: number;
  vbErr: number;
  vcErr: number;
}

export function SerialCompareDeadTimeCard() {
  const { t } = useI18n();
  const buffer = useSerialStore((s) => s.buffer);
  const inverter = useSimulationStore((s) => s.inverter);
  const [timebase, setTimebase] = useState<SerialTimebase>('10ms');
  const [paused, setPaused] = useState(false);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockInverterSample(sample.t_ms, {
        uDc: inverter.uDc,
        dutyA: inverter.dutyA,
        dutyB: inverter.dutyB,
        dutyC: inverter.dutyC,
        deadTimeUs: inverter.deadTimeUs,
        pwmFrequency: inverter.pwmFrequency,
      });
      return {
        t_ms: sample.t_ms,
        vaReal: m.vaReal,
        vbReal: m.vbReal,
        vcReal: m.vcReal,
        vaTheory: m.vaTheory,
        vbTheory: m.vbTheory,
        vcTheory: m.vcTheory,
        vaErr: m.vaReal - m.vaTheory,
        vbErr: m.vbReal - m.vbTheory,
        vcErr: m.vcReal - m.vcTheory,
      };
    });
  }, [buffer, windowMs, inverter.uDc, inverter.dutyA, inverter.dutyB, inverter.dutyC, inverter.deadTimeUs, inverter.pwmFrequency]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { rmsErr: 0, peakErr: 0, estDeadUs: 0, deltaPct: 0 };
    }
    let sumSq = 0;
    let peak = 0;
    for (const r of displayRows) {
      sumSq += r.vaErr * r.vaErr;
      if (Math.abs(r.vaErr) > peak) peak = Math.abs(r.vaErr);
    }
    const rmsErr = Math.sqrt(sumSq / displayRows.length);
    const estDeadUs = estimateDeadTimeUsFromDistortion(peak, inverter.uDc, inverter.pwmFrequency);
    const deltaPct = inverter.deadTimeUs > 0 ? ((estDeadUs - inverter.deadTimeUs) / inverter.deadTimeUs) * 100 : 0;
    return { rmsErr, peakErr: peak, estDeadUs, deltaPct };
  }, [displayRows, inverter.uDc, inverter.pwmFrequency, inverter.deadTimeUs]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        vaReal: r.vaReal.toFixed(3),
        vaTheory: r.vaTheory.toFixed(3),
        vaErr: r.vaErr.toFixed(3),
        vbReal: r.vbReal.toFixed(3),
        vbTheory: r.vbTheory.toFixed(3),
        vbErr: r.vbErr.toFixed(3),
        vcReal: r.vcReal.toFixed(3),
        vcTheory: r.vcTheory.toFixed(3),
        vcErr: r.vcErr.toFixed(3),
      })),
      ['t_ms', 'vaReal', 'vaTheory', 'vaErr', 'vbReal', 'vbTheory', 'vbErr', 'vcReal', 'vcTheory', 'vcErr'],
    );
    return { filename: 'inverter-deadtime-compare', csv };
  };

  return (
    <SerialCompareCardShell
      title={t('inverter.serialDeadTimeTitle')}
      eyebrow="dead-time distortion"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <VoltageChart title={t('inverter.serialDeadTimeVaTitle')} rows={displayRows} realKey="vaReal" theoryKey="vaTheory" />
        <ErrorChart title={t('inverter.serialDeadTimeErrTitle')} rows={displayRows} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile
          label={t('inverter.serialDeadTimeKpiRms')}
          value={`${formatNumber(kpi.rmsErr, 2)} V`}
          tone={kpi.rmsErr > 4 ? 'fault' : kpi.rmsErr > 2 ? 'warn' : 'measure'}
        />
        <KpiTile label={t('inverter.serialDeadTimeKpiPeak')} value={`${formatNumber(kpi.peakErr, 2)} V`} tone="measure" />
        <KpiTile label={t('inverter.serialDeadTimeKpiPanel')} value={`${formatNumber(inverter.deadTimeUs, 2)} μs`} tone="primary" />
        <KpiTile
          label={t('inverter.serialDeadTimeKpiEst')}
          value={`${formatNumber(kpi.estDeadUs, 2)} μs · Δ${kpi.deltaPct >= 0 ? '+' : ''}${formatNumber(kpi.deltaPct, 0)}%`}
          tone={Math.abs(kpi.deltaPct) > 30 ? 'warn' : 'measure'}
        />
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('inverter.serialDeadTimeProtocolLead')}{' '}
        <span className="text-accent-warn">va_meas, vb_meas, vc_meas</span>{' '}
        {t('inverter.serialDeadTimeProtocolTail')}
      </p>
    </SerialCompareCardShell>
  );
}

function VoltageChart({
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
            <Line
              type="monotone"
              dataKey={theoryKey as string}
              dot={false}
              stroke="var(--accent-primary)"
              strokeDasharray="4 3"
              strokeWidth={1.3}
              isAnimationActive={false}
              name="theory"
            />
            <Line
              type="monotone"
              dataKey={realKey as string}
              dot={false}
              stroke="var(--accent-measure)"
              strokeWidth={1.6}
              isAnimationActive={false}
              name="real"
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function ErrorChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-warn)" label="A" />
          <Legend color="var(--accent-fault)" label="B" />
          <Legend color="var(--accent-primary)" label="C" />
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
            <Line type="monotone" dataKey="vaErr" dot={false} stroke="var(--accent-warn)" strokeWidth={1.4} isAnimationActive={false} name="A" />
            <Line type="monotone" dataKey="vbErr" dot={false} stroke="var(--accent-fault)" strokeWidth={1.4} isAnimationActive={false} name="B" />
            <Line type="monotone" dataKey="vcErr" dot={false} stroke="var(--accent-primary)" strokeWidth={1.4} isAnimationActive={false} name="C" />
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
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="formula text-body font-medium" style={{ color }}>
        <span aria-hidden className="mr-1">
          {shape}
        </span>
        {value}
      </p>
    </div>
  );
}
