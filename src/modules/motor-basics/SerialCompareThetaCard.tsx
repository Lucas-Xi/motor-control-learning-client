import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
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
import { mockMotorBasicsSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareThetaCard：θ_e（实测） vs 由 rpm + polePairs + t 推算的理论 θ_e。
 *
 * 三个 KPI：
 *   1. 瞬时角度误差 Δθ（最近窗口的均值 + 峰值）
 *   2. 极对数误判检测：若 Δθ 在 [0, π] 附近周期跳变（绝对差靠近 π），提示"极对数可能错"
 *   3. 编码器对齐偏差：当 |Δθ.mean| > 0.05 rad 且 Δθ 不随 t 累积时，估算为编码器零位偏移
 *
 * 板端协议字段需求：
 *   - 必需：t_us
 *   - 推荐：theta_e（rad）—— 没有时实测自动用 mock 合成（与"polePairsReal 故障"演示一致）
 */

interface Row {
  t_ms: number;
  thetaReal: number;
  thetaTheory: number;
  thetaError: number;
}

const POLE_PAIR_MISMATCH_THRESHOLD_RAD = 2.0; // 接近 π 即可视为极对数差 1
const ENCODER_OFFSET_THRESHOLD_RAD = 0.05;
const ENCODER_OFFSET_DRIFT_TOL = 0.08; // Δθ 累积小于该值时认为是常数偏移而非角度漂移

export function SerialCompareThetaCard() {
  const { t } = useI18n();
  const buffer = useSerialStore((s) => s.buffer);
  const motorBasics = useSimulationStore((s) => s.motorBasics);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const mock = mockMotorBasicsSample(sample.t_ms, {
        rpm: motorBasics.rpm,
        polePairs: motorBasics.polePairs,
      });
      const realTheta = (sample as { theta_e?: number }).theta_e;
      // 若实测无 theta_e，用 mock.thetaReal（含合成噪声）替代
      const thetaReal = realTheta ?? mock.thetaReal;
      const thetaTheory = mock.thetaTheory;
      // 误差包到 [-π, π]
      let err = thetaReal - thetaTheory;
      err = ((err + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      return { t_ms: sample.t_ms, thetaReal, thetaTheory, thetaError: err };
    });
  }, [buffer, windowMs, motorBasics.rpm, motorBasics.polePairs]);

  const displayRows = useFrozenRows(rows, paused);

  const diagnose = useMemo(() => {
    if (displayRows.length < 8) {
      return {
        meanErr: 0,
        peakErr: 0,
        suspectPolePairs: false,
        suspectEncoderOffset: false,
        encoderOffsetRad: 0,
      };
    }
    let sumAbs = 0;
    let peak = 0;
    for (const r of displayRows) {
      sumAbs += Math.abs(r.thetaError);
      if (Math.abs(r.thetaError) > peak) peak = Math.abs(r.thetaError);
    }
    const meanAbs = sumAbs / displayRows.length;
    // 极对数误判：误差均值 + 峰值都接近 π（>= 2.0 rad）
    const suspectPolePairs = peak >= POLE_PAIR_MISMATCH_THRESHOLD_RAD;
    // 编码器对齐：Δθ 的方差小 + 均值显著非零
    // 用窗口起止的有符号均值衡量"是否累积漂移"
    const halfLen = Math.floor(displayRows.length / 2);
    const sumA = displayRows.slice(0, halfLen).reduce((acc, r) => acc + r.thetaError, 0) / Math.max(halfLen, 1);
    const sumB = displayRows.slice(halfLen).reduce((acc, r) => acc + r.thetaError, 0) / Math.max(displayRows.length - halfLen, 1);
    const drift = Math.abs(sumB - sumA);
    const meanSigned = (sumA + sumB) / 2;
    const suspectEncoderOffset =
      !suspectPolePairs &&
      Math.abs(meanSigned) > ENCODER_OFFSET_THRESHOLD_RAD &&
      drift < ENCODER_OFFSET_DRIFT_TOL;
    return {
      meanErr: meanAbs,
      peakErr: peak,
      suspectPolePairs,
      suspectEncoderOffset,
      encoderOffsetRad: meanSigned,
    };
  }, [displayRows]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        thetaReal: r.thetaReal.toFixed(5),
        thetaTheory: r.thetaTheory.toFixed(5),
        thetaError: r.thetaError.toFixed(5),
      })),
      ['t_ms', 'thetaReal', 'thetaTheory', 'thetaError'],
    );
    return { filename: 'motor-basics-theta-compare', csv };
  };

  return (
    <SerialCompareCardShell
      title={t('motorBasics.thetaCompareTitle')}
      eyebrow={t('motorBasics.thetaCompareEyebrow')}
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ThetaChart title={t('motorBasics.thetaChartTitle')} rows={displayRows} />
        <ErrorChart title={t('motorBasics.thetaErrorChartTitle')} rows={displayRows} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile
          label={t('motorBasics.thetaKpiMeanAbs')}
          value={`${formatNumber(diagnose.meanErr, 4)} rad`}
          tone={diagnose.meanErr > 0.1 ? 'warn' : 'measure'}
        />
        <KpiTile
          label={t('motorBasics.thetaKpiPeak')}
          value={`${formatNumber(diagnose.peakErr, 4)} rad`}
          tone={diagnose.suspectPolePairs ? 'fault' : diagnose.peakErr > 0.3 ? 'warn' : 'measure'}
        />
        <KpiTile
          label={t('motorBasics.thetaKpiEncoderOffset')}
          value={`${formatNumber(diagnose.encoderOffsetRad, 4)} rad`}
          tone={diagnose.suspectEncoderOffset ? 'warn' : 'measure'}
        />
        <DiagnosisTile
          suspectPolePairs={diagnose.suspectPolePairs}
          suspectEncoderOffset={diagnose.suspectEncoderOffset}
        />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('motorBasics.thetaProtocolLead')}
        <span className="text-accent-measure">theta_e</span>
        {t('motorBasics.thetaProtocolTail')}
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
          <Legend color="var(--accent-primary)" label="theory" dashed />
          <Legend color="var(--accent-measure)" label="real" />
        </span>
      </header>
      <div className="h-40">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} domain={[0, 2 * Math.PI]} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <Line
              type="monotone"
              dataKey="thetaTheory"
              dot={false}
              stroke="var(--accent-primary)"
              strokeDasharray="4 3"
              strokeWidth={1.4}
              isAnimationActive={false}
              name="theory"
            />
            <Line
              type="monotone"
              dataKey="thetaReal"
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
        <Legend color="var(--accent-warn)" label="Δθ" />
      </header>
      <div className="h-40">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} domain={[-Math.PI, Math.PI]} />
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
              dataKey="thetaError"
              dot={false}
              stroke="var(--accent-warn)"
              strokeWidth={1.6}
              isAnimationActive={false}
              name="Δθ"
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

function KpiTile({ label, value, tone }: { label: string; value: string; tone: 'measure' | 'warn' | 'fault' }) {
  const color =
    tone === 'fault' ? 'var(--accent-fault)' : tone === 'warn' ? 'var(--accent-warn)' : 'var(--accent-measure)';
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

function DiagnosisTile({
  suspectPolePairs,
  suspectEncoderOffset,
}: {
  suspectPolePairs: boolean;
  suspectEncoderOffset: boolean;
}) {
  const { t } = useI18n();
  const tone: 'measure' | 'warn' | 'fault' = suspectPolePairs ? 'fault' : suspectEncoderOffset ? 'warn' : 'measure';
  const color =
    tone === 'fault' ? 'var(--accent-fault)' : tone === 'warn' ? 'var(--accent-warn)' : 'var(--accent-measure)';
  const Icon = tone === 'measure' ? CheckCircle2 : AlertTriangle;
  const msg = suspectPolePairs
    ? t('motorBasics.thetaDiagPolePairs')
    : suspectEncoderOffset
      ? t('motorBasics.thetaDiagEncoderOffset')
      : t('motorBasics.thetaDiagConsistent');
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
      <p className="text-caption text-ink-muted">{t('motorBasics.thetaDiagLabel')}</p>
      <p className="flex items-center gap-1.5 text-body font-medium" style={{ color }}>
        <Icon className="h-4 w-4" aria-hidden />
        {msg}
      </p>
    </div>
  );
}
