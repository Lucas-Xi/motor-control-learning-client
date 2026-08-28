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
import { mockSvpwmSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareSvpwmCard：三相 duty 实测 vs 理论 SVPWM + 扇区切换 + 调制比越界。
 *
 * 教学意图：
 *   - 理论 duty：参数面板的 (u_alpha, u_beta, u_dc) → calculateSvpwm。
 *   - 实测 duty：理论 − sign(i)·deadLoss + 量化噪声（CCR LSB ≈ 0.005）。
 *   - 旋转电压矢量 → 扇区周期性切换 1..6；调制比 m = √3·|U|/Udc 越界 → 过调制。
 *
 * KPI：
 *   1. duty 误差 RMS（A 相，理论 vs 实测）
 *   2. 当前扇区（1..6）
 *   3. 调制比 m
 *   4. 过调制标志（m ≥ 1.0）
 *
 * 板端协议字段需求：
 *   - 必需：t_us
 *   - 推荐：duty_a, duty_b, duty_c（0..1）—— 默认 mock
 */

interface Row {
  t_ms: number;
  dutyARealPct: number;
  dutyBRealPct: number;
  dutyCRealPct: number;
  dutyATheoryPct: number;
  dutyBTheoryPct: number;
  dutyCTheoryPct: number;
  sector: number;
  modulationIndex: number;
  overModulation: boolean;
}

export function SerialCompareSvpwmCard() {
  const { t } = useI18n();
  const buffer = useSerialStore((s) => s.buffer);
  const svpwm = useSimulationStore((s) => s.svpwm);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);
  // 让矢量以 N Hz 旋转，便于看到扇区轮换
  const [rotationHz, setRotationHz] = useState(20);
  const [deadTimeUs, setDeadTimeUs] = useState(2.0);
  const windowMs = timebaseToWindowMs(timebase);

  const vMag = useMemo(() => Math.hypot(svpwm.uAlpha, svpwm.uBeta) || svpwm.uDc * 0.55, [svpwm.uAlpha, svpwm.uBeta, svpwm.uDc]);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockSvpwmSample(sample.t_ms, {
        uDc: svpwm.uDc,
        vMag,
        rotationHz,
        deadTimeUs,
        pwmFrequency: 16000,
      });
      return {
        t_ms: sample.t_ms,
        dutyARealPct: m.dutyAReal * 100,
        dutyBRealPct: m.dutyBReal * 100,
        dutyCRealPct: m.dutyCReal * 100,
        dutyATheoryPct: m.dutyATheory * 100,
        dutyBTheoryPct: m.dutyBTheory * 100,
        dutyCTheoryPct: m.dutyCTheory * 100,
        sector: m.sector,
        modulationIndex: m.modulationIndex,
        overModulation: m.overModulation,
      };
    });
  }, [buffer, windowMs, svpwm.uDc, vMag, rotationHz, deadTimeUs]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { dutyErrRms: 0, sector: 0, modulationIndex: 0, overModulation: false };
    }
    let sumSq = 0;
    let anyOver = false;
    for (const r of displayRows) {
      const d = r.dutyARealPct - r.dutyATheoryPct;
      sumSq += d * d;
      if (r.overModulation) anyOver = true;
    }
    const last = displayRows[displayRows.length - 1];
    return {
      dutyErrRms: Math.sqrt(sumSq / displayRows.length),
      sector: last.sector,
      modulationIndex: last.modulationIndex,
      overModulation: anyOver,
    };
  }, [displayRows]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        dutyAReal: (r.dutyARealPct / 100).toFixed(4),
        dutyATheory: (r.dutyATheoryPct / 100).toFixed(4),
        dutyBReal: (r.dutyBRealPct / 100).toFixed(4),
        dutyBTheory: (r.dutyBTheoryPct / 100).toFixed(4),
        dutyCReal: (r.dutyCRealPct / 100).toFixed(4),
        dutyCTheory: (r.dutyCTheoryPct / 100).toFixed(4),
        sector: r.sector.toString(),
        modulationIndex: r.modulationIndex.toFixed(4),
      })),
      ['t_ms', 'dutyAReal', 'dutyATheory', 'dutyBReal', 'dutyBTheory', 'dutyCReal', 'dutyCTheory', 'sector', 'modulationIndex'],
    );
    return { filename: 'svpwm-serial-compare', csv };
  };

  const mTone: 'measure' | 'warn' | 'fault' =
    kpi.overModulation || kpi.modulationIndex >= 1.0
      ? 'fault'
      : kpi.modulationIndex >= 0.9
        ? 'warn'
        : 'measure';

  return (
    <SerialCompareCardShell
      title={t('svpwm.serialSvpwmTitle')}
      eyebrow="svpwm compare"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">
            {t('svpwm.serialSvpwmRotation')} {formatNumber(rotationHz, 1)} Hz
          </span>
          <input
            type="range"
            min={1}
            max={100}
            step={1}
            value={rotationHz}
            onChange={(e) => setRotationHz(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label={t('svpwm.serialSvpwmRotationAria')}
            aria-valuemin={1}
            aria-valuemax={100}
            aria-valuenow={rotationHz}
            aria-valuetext={`${formatNumber(rotationHz, 1)} ${t('svpwm.serialSvpwmHzAria')}`}
          />
        </label>
        <label className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">
            {t('svpwm.serialSvpwmDeadTime')} {formatNumber(deadTimeUs, 1)} μs
          </span>
          <input
            type="range"
            min={0}
            max={6}
            step={0.1}
            value={deadTimeUs}
            onChange={(e) => setDeadTimeUs(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label={t('svpwm.serialSvpwmDeadTimeAria')}
            aria-valuemin={0}
            aria-valuemax={6}
            aria-valuenow={deadTimeUs}
            aria-valuetext={`${formatNumber(deadTimeUs, 1)} ${t('svpwm.serialSvpwmUsAria')}`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ThreeChannelDutyChart
          title={t('svpwm.serialSvpwmDutyTitle')}
          rows={displayRows}
          aKey="dutyARealPct"
          bKey="dutyBRealPct"
          cKey="dutyCRealPct"
        />
        <SectorChart title={t('svpwm.serialSvpwmSectorTitle')} rows={displayRows} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label={t('svpwm.serialSvpwmKpiRms')} value={`${formatNumber(kpi.dutyErrRms, 2)} %`} tone={kpi.dutyErrRms > 3 ? 'warn' : 'measure'} />
        <KpiTile label={t('svpwm.serialSvpwmKpiSector')} value={`Sec ${kpi.sector}`} tone="primary" />
        <KpiTile label={t('svpwm.serialSvpwmKpiM')} value={formatNumber(kpi.modulationIndex, 3)} tone={mTone} />
        <KpiTile
          label={t('svpwm.serialSvpwmKpiOver')}
          value={kpi.overModulation ? t('common.yes') : t('common.no')}
          tone={kpi.overModulation ? 'fault' : 'measure'}
        />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('svpwm.serialSvpwmProtocolLead')}{' '}
        <span className="text-accent-measure">{t('svpwm.serialSvpwmDutyField')}</span>{' '}
        {t('svpwm.serialSvpwmProtocolTail')}
      </p>
    </SerialCompareCardShell>
  );
}

function ThreeChannelDutyChart({
  title,
  rows,
  aKey,
  bKey,
  cKey,
}: {
  title: string;
  rows: Row[];
  aKey: keyof Row;
  bKey: keyof Row;
  cKey: keyof Row;
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
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <ReferenceLine y={50} stroke="#1e2a3d" strokeDasharray="2 4" />
            <Line type="monotone" dataKey={aKey as string} dot={false} stroke="var(--accent-measure)" strokeWidth={1.5} isAnimationActive={false} name="A" />
            <Line type="monotone" dataKey={bKey as string} dot={false} stroke="var(--accent-primary)" strokeWidth={1.5} isAnimationActive={false} name="B" />
            <Line type="monotone" dataKey={cKey as string} dot={false} stroke="var(--accent-warn)" strokeWidth={1.5} isAnimationActive={false} name="C" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function SectorChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="sector" />
          <Legend color="var(--accent-fault)" label="m" />
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
            <ReferenceLine y={1.0} stroke="var(--accent-fault)" strokeDasharray="3 3" />
            <Line type="stepAfter" dataKey="sector" dot={false} stroke="var(--accent-primary)" strokeWidth={1.6} isAnimationActive={false} name="sector" />
            <Line type="monotone" dataKey="modulationIndex" dot={false} stroke="var(--accent-fault)" strokeWidth={1.4} isAnimationActive={false} name="m" />
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
    ? t('svpwm.kpiSrFault')
    : tone === 'warn'
      ? t('svpwm.kpiSrWarn')
      : tone === 'primary'
        ? t('svpwm.kpiSrAux')
        : t('svpwm.kpiSrOk');
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
