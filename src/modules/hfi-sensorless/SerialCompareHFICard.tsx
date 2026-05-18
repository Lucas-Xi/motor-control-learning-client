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
import { mockHFISample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareHFICard：HFI 高频注入信号链 + 角度估算误差 + 凸极比反推。
 *
 * 四通道：
 *   - 注入电压 V_inject（d 轴正弦，幅值 30-50V，频率 500-1500Hz）
 *   - 解调后的 d/q 凸极信号 demodErr（PLL 误差源）
 *   - θ_real（仿真"真实"电角度）
 *   - θ_est（HFI 估算电角度）—— 一阶 PLL 收敛过程
 *
 * KPI：
 *   - 角度误差 |Δθ| 峰值 / 均值（rad）
 *   - 凸极比反推 Lq/Ld（实测）vs 参数面板的 saliencyRatio
 *   - 锁相时间（首次 |Δθ| < 5° 持续 5ms 的时刻，ms）
 *
 * 板端协议字段需求：
 *   - 必需：t_us, ia, ib, ic
 *   - 推荐：v_inject(f32), demod_err(f32), theta_est(f32), theta_real(f32)
 *     —— 当前协议未含，UI 用 mock 合成（参数面板 injectV/freq/saliency/rpm 驱动）。
 */

interface Row {
  t_ms: number;
  injectV: number;
  demodErr: number;
  thetaReal: number;
  thetaEst: number;
  thetaErr: number;
  saliencyEst: number;
}

export function SerialCompareHFICard() {
  const buffer = useSerialStore((s) => s.buffer);
  const hfi = useSimulationStore((s) => s.hfi);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockHFISample(sample.t_ms, {
        injectV: hfi.injectVoltage,
        injectFreqHz: hfi.injectFreqHz,
        saliencyRatio: hfi.saliencyRatio,
        rpm: hfi.speedRpm,
        lockTauMs: 30,
      });
      return {
        t_ms: sample.t_ms,
        injectV: m.injectV,
        demodErr: m.demodErr,
        thetaReal: m.thetaReal,
        thetaEst: m.thetaEst,
        thetaErr: m.thetaErr,
        saliencyEst: m.saliencyEst,
      };
    });
  }, [buffer, windowMs, hfi.injectVoltage, hfi.injectFreqHz, hfi.saliencyRatio, hfi.speedRpm]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { meanErrRad: 0, peakErrRad: 0, saliencyMean: hfi.saliencyRatio, lockTimeMs: Number.NaN };
    }
    let sumAbs = 0;
    let peak = 0;
    let salSum = 0;
    for (const r of displayRows) {
      sumAbs += Math.abs(r.thetaErr);
      if (Math.abs(r.thetaErr) > peak) peak = Math.abs(r.thetaErr);
      salSum += r.saliencyEst;
    }
    const meanErrRad = sumAbs / displayRows.length;
    const saliencyMean = salSum / displayRows.length;
    // 锁相时间：首次 |Δθ| < 5° (≈0.087rad) 后保持 5ms 的时刻
    const lockBand = (5 * Math.PI) / 180;
    let lockStartIdx = -1;
    let runStartIdx = -1;
    for (let i = 0; i < displayRows.length; i += 1) {
      if (Math.abs(displayRows[i].thetaErr) < lockBand) {
        if (runStartIdx < 0) runStartIdx = i;
        if (displayRows[i].t_ms - displayRows[runStartIdx].t_ms >= 5) {
          lockStartIdx = runStartIdx;
          break;
        }
      } else {
        runStartIdx = -1;
      }
    }
    const lockTimeMs = lockStartIdx >= 0 ? displayRows[lockStartIdx].t_ms : Number.NaN;
    return { meanErrRad, peakErrRad: peak, saliencyMean, lockTimeMs };
  }, [displayRows, hfi.saliencyRatio]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        injectV: r.injectV.toFixed(3),
        demodErr: r.demodErr.toFixed(5),
        thetaReal: r.thetaReal.toFixed(5),
        thetaEst: r.thetaEst.toFixed(5),
        thetaErr: r.thetaErr.toFixed(5),
        saliencyEst: r.saliencyEst.toFixed(4),
      })),
      ['t_ms', 'injectV', 'demodErr', 'thetaReal', 'thetaEst', 'thetaErr', 'saliencyEst'],
    );
    return { filename: 'hfi-signal-chain-compare', csv };
  };

  return (
    <SerialCompareCardShell
      title="HFI 信号链：注入 / 解调 / 估角"
      eyebrow="HFI signal chain"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <InjectionChart rows={displayRows} />
        <ThetaChart rows={displayRows} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile
          label="|Δθ| 均值"
          value={`${formatNumber((kpi.meanErrRad * 180) / Math.PI, 2)}°`}
          tone={kpi.meanErrRad > 0.1 ? 'warn' : 'measure'}
        />
        <KpiTile
          label="|Δθ| 峰值"
          value={`${formatNumber((kpi.peakErrRad * 180) / Math.PI, 1)}°`}
          tone={kpi.peakErrRad > 0.5 ? 'fault' : kpi.peakErrRad > 0.2 ? 'warn' : 'measure'}
        />
        <KpiTile
          label="估算 Lq/Ld"
          value={`${formatNumber(kpi.saliencyMean, 2)}（设定 ${formatNumber(hfi.saliencyRatio, 2)}）`}
          tone={Math.abs(kpi.saliencyMean - hfi.saliencyRatio) > 0.3 ? 'warn' : 'measure'}
        />
        <KpiTile
          label="锁相时间"
          value={Number.isFinite(kpi.lockTimeMs) ? `${formatNumber(kpi.lockTimeMs, 0)} ms` : '未锁定'}
          tone={Number.isFinite(kpi.lockTimeMs) && kpi.lockTimeMs < 50 ? 'measure' : 'warn'}
        />
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        板端协议（推荐扩展）：t_us, ia, ib, ic,{' '}
        <span className="text-accent-warn">v_inject(f32), demod_err(f32), theta_est(f32), theta_real(f32)</span> ·
        凸极比 Lq/Ld 由解调误差幅值反推，IPM 典型 1.5-3；SPM 接近 1 → HFI 失效
      </p>
    </SerialCompareCardShell>
  );
}

function InjectionChart({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>注入电压 + 解调误差</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="V_inject (V)" />
          <Legend color="var(--accent-warn)" label="demod (A 等效)" />
        </span>
      </header>
      <div className="h-40">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis yAxisId="v" tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} />
            <YAxis yAxisId="e" orientation="right" tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <ReferenceLine yAxisId="v" y={0} stroke="#1e2a3d" strokeDasharray="2 4" />
            <Line yAxisId="v" type="monotone" dataKey="injectV" dot={false} stroke="var(--accent-primary)" strokeWidth={1.3} isAnimationActive={false} name="V_inject" />
            <Line yAxisId="e" type="monotone" dataKey="demodErr" dot={false} stroke="var(--accent-warn)" strokeWidth={1.4} isAnimationActive={false} name="demod" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function ThetaChart({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>电角度：真实 vs HFI 估算 / 误差</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-measure)" label="θ_real" />
          <Legend color="var(--accent-primary)" label="θ_est" dashed />
          <Legend color="var(--accent-fault)" label="Δθ" />
        </span>
      </header>
      <div className="h-40">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis yAxisId="theta" tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} domain={[0, 2 * Math.PI]} />
            <YAxis yAxisId="err" orientation="right" tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} domain={[-Math.PI, Math.PI]} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <ReferenceLine yAxisId="err" y={0} stroke="#1e2a3d" strokeDasharray="2 4" />
            <Line yAxisId="theta" type="monotone" dataKey="thetaReal" dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="θ_real" />
            <Line yAxisId="theta" type="monotone" dataKey="thetaEst" dot={false} stroke="var(--accent-primary)" strokeDasharray="3 3" strokeWidth={1.4} isAnimationActive={false} name="θ_est" />
            <Line yAxisId="err" type="monotone" dataKey="thetaErr" dot={false} stroke="var(--accent-fault)" strokeWidth={1.2} isAnimationActive={false} name="Δθ" />
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
