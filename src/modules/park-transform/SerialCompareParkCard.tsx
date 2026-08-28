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
import { mockParkSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareParkCard：(i_alpha, i_beta, θe) → Id/Iq 实测 vs 理论。
 *
 * 教学意图：
 *   - 理论 Park 用"正确" θ_e；实测 Park 用"θ_e + Δθ"。
 *   - Δθ 越大，Id/Iq 出现明显串扰（dq 解耦失效）：
 *       Id_real ≈ Id_theory·cos(Δθ) + Iq_theory·sin(Δθ)
 *       Iq_real ≈ Iq_theory·cos(Δθ) − Id_theory·sin(Δθ)
 *
 * 三个 KPI：
 *   1. Δθ（°，由滑块直接设定，回显当前值）
 *   2. Id 串扰幅度 = max(|Id_real − Id_theory|)（A）
 *   3. Iq 跟踪误差 RMS（A）
 *
 * 板端协议字段需求：
 *   - 必需：t_us, ia, ib, ic, theta_e
 *   - 可选：iq, id（如板端已做 Park）—— 默认走 mock
 */

interface Row {
  t_ms: number;
  idReal: number;
  iqReal: number;
  idTheory: number;
  iqTheory: number;
}

export function SerialCompareParkCard() {
  const { t } = useI18n();
  const buffer = useSerialStore((s) => s.buffer);
  const threePhase = useSimulationStore((s) => s.threePhase);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);
  // 用户注入角度误差
  const [thetaErrDeg, setThetaErrDeg] = useState(0);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockParkSample(sample.t_ms, {
        threePhase,
        thetaErrorDeg: thetaErrDeg,
      });
      const sampled = sample as { iq?: number; id?: number };
      return {
        t_ms: sample.t_ms,
        idReal: sampled.id ?? m.idReal,
        iqReal: sampled.iq ?? m.iqReal,
        idTheory: m.idTheory,
        iqTheory: m.iqTheory,
      };
    });
  }, [buffer, windowMs, threePhase, thetaErrDeg]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { idCrosstalk: 0, iqRmse: 0, idMean: 0 };
    }
    let maxAbsD = 0;
    let sumSqQ = 0;
    let sumId = 0;
    for (const r of displayRows) {
      const dd = r.idReal - r.idTheory;
      const dq = r.iqReal - r.iqTheory;
      if (Math.abs(dd) > maxAbsD) maxAbsD = Math.abs(dd);
      sumSqQ += dq * dq;
      sumId += r.idReal;
    }
    const iqRmse = Math.sqrt(sumSqQ / displayRows.length);
    return { idCrosstalk: maxAbsD, iqRmse, idMean: sumId / displayRows.length };
  }, [displayRows]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        idReal: r.idReal.toFixed(4),
        iqReal: r.iqReal.toFixed(4),
        idTheory: r.idTheory.toFixed(4),
        iqTheory: r.iqTheory.toFixed(4),
      })),
      ['t_ms', 'idReal', 'iqReal', 'idTheory', 'iqTheory'],
    );
    return { filename: 'park-serial-compare', csv };
  };

  const crosstalkTone: 'measure' | 'warn' | 'fault' =
    kpi.idCrosstalk >= 2.5 ? 'fault' : kpi.idCrosstalk >= 0.8 ? 'warn' : 'measure';
  const iqTone: 'measure' | 'warn' = kpi.iqRmse > 0.6 ? 'warn' : 'measure';

  return (
    <SerialCompareCardShell
      title={t('parkTransform.serialTitle')}
      eyebrow={t('parkTransform.serialEyebrow')}
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="mb-3">
        <label className="block rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">
            {t('parkTransform.serialThetaErrPrefix')}{formatNumber(thetaErrDeg, 1)}°{t('parkTransform.serialThetaErrSuffix')}
          </span>
          <input
            type="range"
            min={-45}
            max={45}
            step={0.5}
            value={thetaErrDeg}
            onChange={(e) => setThetaErrDeg(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label={t('parkTransform.serialThetaErrAria')}
            aria-valuemin={-45}
            aria-valuemax={45}
            aria-valuenow={thetaErrDeg}
            aria-valuetext={`${formatNumber(thetaErrDeg, 1)} ${t('parkTransform.serialAriaDegree')}`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <TwoLineChart title={t('parkTransform.serialIdChartTitle')} rows={displayRows} realKey="idReal" theoryKey="idTheory" />
        <TwoLineChart title={t('parkTransform.serialIqChartTitle')} rows={displayRows} realKey="iqReal" theoryKey="iqTheory" />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label={t('parkTransform.serialKpiThetaErr')} value={`${formatNumber(thetaErrDeg, 1)} °`} tone="primary" />
        <KpiTile label={t('parkTransform.serialKpiIdCrosstalk')} value={`${formatNumber(kpi.idCrosstalk, 3)} A`} tone={crosstalkTone} />
        <KpiTile label={t('parkTransform.serialKpiIqRmse')} value={`${formatNumber(kpi.iqRmse, 3)} A`} tone={iqTone} />
        <KpiTile label={t('parkTransform.serialKpiIdMean')} value={`${formatNumber(kpi.idMean, 3)} A`} tone="measure" />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('parkTransform.serialProtocolLead')}
        <span className="text-accent-measure">theta_e</span>
        {t('parkTransform.serialProtocolTail')}
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
            <Line type="monotone" dataKey={theoryKey as string} dot={false} stroke="var(--accent-primary)" strokeDasharray="4 3" strokeWidth={1.3} isAnimationActive={false} name="theory" />
            <Line type="monotone" dataKey={realKey as string} dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="real" />
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
      ? t('parkTransform.serialSrFault')
      : tone === 'warn'
        ? t('parkTransform.serialSrWarn')
        : tone === 'primary'
          ? t('parkTransform.serialSrAux')
          : t('parkTransform.serialSrOk');
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
