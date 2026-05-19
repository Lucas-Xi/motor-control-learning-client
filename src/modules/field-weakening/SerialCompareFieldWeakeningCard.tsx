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
import { mockFieldWeakeningSample } from '../../utils/serialMockGenerators';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareFieldWeakeningCard：实测 (Id,Iq) 工作点 vs MTPA/MTPV + 电压撞限。
 *
 * 教学意图：
 *   - IPM 凸极电机的 MTPA 轨迹：Id_mtpa = ψf/(4·ΔL) − √(...) （Id ≤ 0）
 *   - 实测工作点偏离 MTPA → 同等转矩多耗电；
 *   - 电压幅值靠近 Udc/√3 → 电压撞限，必须注入负 Id 弱磁；
 *   - 铁损 P_iron = ke·ω² + kh·|ω| 高速时主导。
 *
 * KPI：
 *   1. Id 偏离 MTPA = |Id_real − Id_mtpa|（A）
 *   2. 电压幅值 / 极限 比值 → 撞限标志
 *   3. 估算转矩（Nm）
 *   4. 铁损（W）
 *
 * 板端协议字段需求：
 *   - 必需：t_us
 *   - 推荐：id, iq, v_mag —— 默认 mock（store.weakField 驱动）
 */

interface Row {
  t_ms: number;
  idReal: number;
  iqReal: number;
  idMtpa: number;
  vMag: number;
  vLimit: number;
  saturated: boolean;
  ironLossW: number;
  torque: number;
}

export function SerialCompareFieldWeakeningCard() {
  const buffer = useSerialStore((s) => s.buffer);
  const weakField = useSimulationStore((s) => s.weakField);
  const motor = useSimulationStore((s) => s.motorBasics);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);
  const [ironKe, setIronKe] = useState(0.0008);
  const windowMs = timebaseToWindowMs(timebase);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    return windowed.map((sample) => {
      const m = mockFieldWeakeningSample(sample.t_ms, {
        weakField,
        polePairs: motor.polePairs,
        ironLossKe: ironKe,
      });
      return {
        t_ms: sample.t_ms,
        idReal: m.idReal,
        iqReal: m.iqReal,
        idMtpa: m.idMtpa,
        vMag: m.vMag,
        vLimit: m.vLimit,
        saturated: m.saturated,
        ironLossW: m.ironLossW,
        torque: m.torque,
      };
    });
  }, [buffer, windowMs, weakField, motor.polePairs, ironKe]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0) {
      return { idOffMtpa: 0, vRatio: 0, anySat: false, torque: 0, ironLossW: 0 };
    }
    let sumAbsOff = 0;
    let anySat = false;
    const last = displayRows[displayRows.length - 1];
    for (const r of displayRows) {
      sumAbsOff += Math.abs(r.idReal - r.idMtpa);
      if (r.saturated) anySat = true;
    }
    const idOffMtpa = sumAbsOff / displayRows.length;
    const vRatio = last.vLimit > 1e-6 ? last.vMag / last.vLimit : 0;
    return { idOffMtpa, vRatio, anySat, torque: last.torque, ironLossW: last.ironLossW };
  }, [displayRows]);

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        idReal: r.idReal.toFixed(4),
        iqReal: r.iqReal.toFixed(4),
        idMtpa: r.idMtpa.toFixed(4),
        vMag: r.vMag.toFixed(3),
        vLimit: r.vLimit.toFixed(3),
        saturated: r.saturated ? '1' : '0',
        ironLossW: r.ironLossW.toFixed(3),
        torque: r.torque.toFixed(4),
      })),
      ['t_ms', 'idReal', 'iqReal', 'idMtpa', 'vMag', 'vLimit', 'saturated', 'ironLossW', 'torque'],
    );
    return { filename: 'field-weakening-serial-compare', csv };
  };

  const offTone: 'measure' | 'warn' | 'fault' =
    kpi.idOffMtpa >= 2 ? 'fault' : kpi.idOffMtpa >= 0.6 ? 'warn' : 'measure';
  const vTone: 'measure' | 'warn' | 'fault' =
    kpi.vRatio >= 1.0 ? 'fault' : kpi.vRatio >= 0.92 ? 'warn' : 'measure';

  return (
    <SerialCompareCardShell
      title="弱磁工作点：实测 vs MTPA / 电压极限"
      eyebrow="field weakening compare"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
    >
      <div className="mb-3">
        <label className="block rounded-lg border border-line-subtle bg-bg-base p-2">
          <span className="block text-caption text-ink-muted">铁损涡流系数 ke {formatNumber(ironKe, 4)}（高速主导铁损）</span>
          <input
            type="range"
            min={0.0001}
            max={0.0030}
            step={0.0001}
            value={ironKe}
            onChange={(e) => setIronKe(Number(e.target.value))}
            className="mt-1 w-full"
            aria-label="铁损涡流系数 ke"
            aria-valuemin={0.0001}
            aria-valuemax={0.003}
            aria-valuenow={ironKe}
            aria-valuetext={`${formatNumber(ironKe, 4)} 瓦秒平方`}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <CurrentChart title="Id 实测 vs MTPA（A）" rows={displayRows} />
        <VoltageChart title="电压幅值 vs 极限（V）" rows={displayRows} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label="Id 偏离 MTPA" value={`${formatNumber(kpi.idOffMtpa, 3)} A`} tone={offTone} />
        <KpiTile label="V / V_lim" value={`${formatNumber(kpi.vRatio * 100, 1)} %`} tone={vTone} />
        <KpiTile label="估算转矩" value={`${formatNumber(kpi.torque, 3)} Nm`} tone="measure" />
        <KpiTile label="铁损" value={`${formatNumber(kpi.ironLossW, 2)} W`} tone={kpi.ironLossW > 30 ? 'warn' : 'measure'} />
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        板端协议：t_us, ia, ib, ic, theta_e · <span className="text-accent-measure">id, iq, v_mag</span>。
        撞限 → 注负 Id 弱磁；偏离 MTPA 越多 → 单位转矩多耗电
        {kpi.anySat && <span className="ml-1 text-accent-fault">· 窗口内出现电压撞限</span>}
      </p>
    </SerialCompareCardShell>
  );
}

function CurrentChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="MTPA" dashed />
          <Legend color="var(--accent-measure)" label="Id real" />
          <Legend color="var(--accent-warn)" label="Iq real" />
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
            <Line type="monotone" dataKey="idMtpa" dot={false} stroke="var(--accent-primary)" strokeDasharray="4 3" strokeWidth={1.4} isAnimationActive={false} name="MTPA" />
            <Line type="monotone" dataKey="idReal" dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="Id real" />
            <Line type="monotone" dataKey="iqReal" dot={false} stroke="var(--accent-warn)" strokeWidth={1.4} isAnimationActive={false} name="Iq real" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function VoltageChart({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex items-center justify-between text-caption text-ink-muted">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-fault)" label="V_lim" dashed />
          <Legend color="var(--accent-measure)" label="V_mag" />
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
            <Line type="monotone" dataKey="vLimit" dot={false} stroke="var(--accent-fault)" strokeDasharray="4 3" strokeWidth={1.4} isAnimationActive={false} name="V_lim" />
            <Line type="monotone" dataKey="vMag" dot={false} stroke="var(--accent-measure)" strokeWidth={1.6} isAnimationActive={false} name="V_mag" />
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
