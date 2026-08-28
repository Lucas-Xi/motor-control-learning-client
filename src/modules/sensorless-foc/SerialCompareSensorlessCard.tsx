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
import { mockSensorlessSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareSensorlessCard：板上 BEMF observer + PLL 输出 vs 仿真。
 *
 * 教学意图：
 *   - 高速时 BEMF ∝ ω·ψf 信号强，估角误差小；
 *   - 低速 (< 500 rpm) BEMF 太小，被噪声主导 → PLL 失锁 → 抖动 / 反转。
 *
 * KPI：
 *   1. 角度误差 |Δθ| 均值 + 峰值（°）
 *   2. 速度估算误差（rpm）
 *   3. BEMF 幅值（V，理论 ψf·ω_elec）
 *   4. PLL 锁定状态：|Δθ|_peak < 5° 视为已锁
 *
 * 板端协议字段需求：
 *   - 必需：t_us
 *   - 推荐：theta_obs, theta_pll, speed_est —— 默认 mock（store.sensorless.speedRpm 驱动）
 */

interface Row {
  t_ms: number;
  thetaTrueDeg: number;
  thetaObsDeg: number;
  thetaPllDeg: number;
  errorDeg: number;
  speedSim: number;
  speedEst: number;
  bemfMag: number;
}

export function SerialCompareSensorlessCard() {
  const { t } = useI18n();
  const buffer = useSerialStore((s) => s.buffer);
  const sensorless = useSimulationStore((s) => s.sensorless);
  const motor = useSimulationStore((s) => s.motorBasics);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);
  const [lockTauMs, setLockTauMs] = useState(30);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockSensorlessSample(sample.t_ms, {
        speedRpm: sensorless.speedRpm,
        polePairs: motor.polePairs,
        flux: sensorless.ke,
        lockTauMs,
        noiseRad: sensorless.noise * 0.02,
      });
      return {
        t_ms: sample.t_ms,
        thetaTrueDeg: (m.thetaTrue * 180) / Math.PI,
        thetaObsDeg: (m.thetaObs * 180) / Math.PI,
        thetaPllDeg: (m.thetaPll * 180) / Math.PI,
        errorDeg: m.errorDeg,
        speedSim: m.speedSim,
        speedEst: m.speedEst,
        bemfMag: m.bemfMag,
      };
    });
  }, [buffer, windowMs, sensorless.speedRpm, sensorless.ke, sensorless.noise, motor.polePairs, lockTauMs]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { meanErr: 0, peakErr: 0, speedErr: 0, bemf: 0, locked: false };
    }
    let sumAbs = 0;
    let peak = 0;
    let sumSpeedErr = 0;
    let bemf = 0;
    for (const r of displayRows) {
      sumAbs += Math.abs(r.errorDeg);
      if (Math.abs(r.errorDeg) > peak) peak = Math.abs(r.errorDeg);
      sumSpeedErr += r.speedEst - r.speedSim;
      bemf = r.bemfMag;
    }
    const meanErr = sumAbs / displayRows.length;
    const speedErr = sumSpeedErr / displayRows.length;
    return { meanErr, peakErr: peak, speedErr, bemf, locked: peak < 5 };
  }, [displayRows]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        thetaTrueDeg: r.thetaTrueDeg.toFixed(3),
        thetaObsDeg: r.thetaObsDeg.toFixed(3),
        thetaPllDeg: r.thetaPllDeg.toFixed(3),
        errorDeg: r.errorDeg.toFixed(3),
        speedSim: r.speedSim.toFixed(2),
        speedEst: r.speedEst.toFixed(2),
        bemfMag: r.bemfMag.toFixed(3),
      })),
      ['t_ms', 'thetaTrueDeg', 'thetaObsDeg', 'thetaPllDeg', 'errorDeg', 'speedSim', 'speedEst', 'bemfMag'],
    );
    return { filename: 'sensorless-serial-compare', csv };
  };

  const errorTone: 'measure' | 'warn' | 'fault' =
    kpi.peakErr >= 15 ? 'fault' : kpi.peakErr >= 5 ? 'warn' : 'measure';
  const speedTone: 'measure' | 'warn' = Math.abs(kpi.speedErr) > sensorless.speedRpm * 0.05 ? 'warn' : 'measure';

  return (
    <SerialCompareCardShell
      title={t('sensorlessFoc.serialTitle')}
      eyebrow="sensorless compare"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="mb-3">
        <label className="block rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">
            {t('sensorlessFoc.serialLockTauLabel').replace('{v}', formatNumber(lockTauMs, 0))}
          </span>
          <input
            type="range"
            min={5}
            max={150}
            step={1}
            value={lockTauMs}
            onChange={(e) => setLockTauMs(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label={t('sensorlessFoc.serialLockTauAria')}
            aria-valuemin={5}
            aria-valuemax={150}
            aria-valuenow={lockTauMs}
            aria-valuetext={`${formatNumber(lockTauMs, 0)} ${t('sensorlessFoc.serialAriaMs')}`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ThetaChart title={t('sensorlessFoc.serialThetaChartTitle')} rows={displayRows} />
        <ErrorChart title={t('sensorlessFoc.serialErrorChartTitle')} rows={displayRows} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label={t('sensorlessFoc.serialKpiMeanErr')} value={`${formatNumber(kpi.meanErr, 2)} °`} tone={errorTone === 'fault' ? 'fault' : kpi.meanErr > 3 ? 'warn' : 'measure'} />
        <KpiTile label={t('sensorlessFoc.serialKpiPeakErr')} value={`${formatNumber(kpi.peakErr, 2)} °`} tone={errorTone} />
        <KpiTile label={t('sensorlessFoc.serialKpiSpeedErr')} value={`${formatNumber(kpi.speedErr, 1)} rpm`} tone={speedTone} />
        <KpiTile label={t('sensorlessFoc.serialKpiPllState')} value={kpi.locked ? t('sensorlessFoc.serialPllLocked') : t('sensorlessFoc.serialPllUnconverged')} tone={kpi.locked ? 'measure' : 'warn'} />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('sensorlessFoc.serialProtoLead')} <span className="text-accent-measure">theta_obs, theta_pll, speed_est</span>
        {t('sensorlessFoc.serialBemfNote').replace('{v}', formatNumber(kpi.bemf, 2))}
      </p>
    </SerialCompareCardShell>
  );
}

function ThetaChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="true" dashed />
          <Legend color="var(--accent-warn)" label="obs" />
          <Legend color="var(--accent-measure)" label="pll" />
        </span>
      </header>
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} domain={[0, 360]} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <Line type="monotone" dataKey="thetaTrueDeg" dot={false} stroke="var(--accent-primary)" strokeDasharray="4 3" strokeWidth={1.4} isAnimationActive={false} name="true" />
            <Line type="monotone" dataKey="thetaObsDeg" dot={false} stroke="var(--accent-warn)" strokeWidth={1.2} isAnimationActive={false} name="obs" />
            <Line type="monotone" dataKey="thetaPllDeg" dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="pll" />
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
        <Legend color="var(--accent-fault)" label="Δθ" />
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
            <ReferenceLine y={5} stroke="var(--accent-warn)" strokeDasharray="3 3" />
            <ReferenceLine y={-5} stroke="var(--accent-warn)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="errorDeg" dot={false} stroke="var(--accent-fault)" strokeWidth={1.6} isAnimationActive={false} name="Δθ" />
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
    ? t('sensorlessFoc.serialSrSevere')
    : tone === 'warn'
      ? t('sensorlessFoc.serialSrWarn')
      : tone === 'primary'
        ? t('sensorlessFoc.serialSrInfo')
        : t('sensorlessFoc.serialSrOk');
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
