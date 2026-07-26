import { useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { planSCurve, computeSCurveMetrics, type SCurveResult } from '../../simulation/math/motionProfile';
import { formatNumber } from '../../utils/format';

/**
 * 伺服 S 曲线加减速规划卡片。
 *
 * 展示加加速度限制的 7 段运动轨迹：位置 / 速度 / 加速度 / 加加速度四图叠加。
 * 用户可调目标位置、最大速度、最大加速度、最大加加速度。
 * 实时计算轨迹指标：总时间、峰值速度/加速度/加加速度、梯形时间比。
 */
export function ServoPositionCard() {
  const [p1, setP1] = useState(10);
  const [vMax, setVMax] = useState(2);
  const [aMax, setAMax] = useState(5);
  const [jMax, setJMax] = useState(50);
  const [dt] = useState(0.001);

  const profile = useMemo<SCurveResult>(
    () => planSCurve({ p0: 0, v0: 0, p1, v1: 0, vMax, aMax, jMax, dt }),
    [p1, vMax, aMax, jMax, dt],
  );

  const metrics = useMemo(() => computeSCurveMetrics(profile), [profile]);

  // 降采样到 ~200 点用于图表
  const chartData = useMemo(() => {
    const step = Math.max(1, Math.floor(profile.trajectory.length / 300));
    return profile.trajectory.filter((_, i) => i % step === 0 || i === profile.trajectory.length - 1);
  }, [profile]);

  return (
    <Card title="S 曲线加减速" eyebrow="加加速度限制 · 7 段轨迹规划" density="compact">
      {/* 参数滑块 */}
      <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Slider label="目标位置" value={p1} min={1} max={100} step={0.5} onChange={setP1} unit="m" />
        <Slider label="最大速度" value={vMax} min={0.1} max={20} step={0.1} onChange={setVMax} unit="m/s" />
        <Slider label="最大加速度" value={aMax} min={0.5} max={50} step={0.5} onChange={setAMax} unit="m/s²" />
        <Slider label="最大加加速度" value={jMax} min={5} max={500} step={5} onChange={setJMax} unit="m/s³" />
      </div>

      {/* 轨迹图 */}
      <div className="h-52">
        <ResponsiveChart data={chartData} />
      </div>

      {/* 指标 */}
      <div className="mt-1 grid grid-cols-4 gap-1 text-caption">
        <Metric label="总时间" value={formatNumber(metrics.totalTime, 3)} unit="s" />
        <Metric label="峰值速度" value={formatNumber(metrics.peakVelocity, 2)} unit="m/s" />
        <Metric label="峰值加速度" value={formatNumber(metrics.peakAccel, 1)} unit="m/s²" />
        <Metric label="梯形时间比" value={formatNumber(metrics.timeRatioToTrapezoid * 100, 0)} unit="%" />
      </div>

      {/* 7 段标注 */}
      <div className="mt-1 flex flex-wrap gap-1">
        {profile.segments.filter((s) => s.tEnd - s.tStart > 1e-6).map((seg, i) => (
          <span
            key={i}
            className="rounded-full bg-bg-base px-1.5 py-0.5 text-[10px] leading-none text-ink-muted"
            title={`${seg.type} (${seg.tStart.toFixed(2)}-${seg.tEnd.toFixed(2)}s)`}
          >
            {['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][i]}
          </span>
        ))}
      </div>

      {profile.feasible === false && (
        <p className="mt-1 rounded border border-accent-warn/20 bg-accent-warn/8 px-2 py-1 text-caption text-accent-warn">
          ⚠ 距离过短，已自动降低速度
        </p>
      )}
    </Card>
  );
}

// 子组件
function Slider({
  label, value, min, max, step, onChange, unit,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit: string;
}) {
  return (
    <div>
      <label className="mb-0.5 flex justify-between text-caption text-ink-muted">
        <span>{label}</span>
        <span>{value} {unit}</span>
      </label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent-primary"
        aria-label={label}
        aria-valuetext={`${value} ${unit}`}
      />
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded border border-line-subtle bg-bg-base px-2 py-1 text-center">
      <div className="text-[10px] text-ink-muted">{label}</div>
      <div className="text-sm font-medium text-accent-primary">{value}</div>
      <div className="text-[9px] text-ink-muted">{unit}</div>
    </div>
  );
}

function ResponsiveChart({ data }: { data: Array<{ t: number; p: number; v: number; a: number; j: number }> }) {
  // 归一化到 0-1 范围便于同图显示
  const maxP = Math.max(...data.map((d) => Math.abs(d.p)), 1);
  const maxV = Math.max(...data.map((d) => Math.abs(d.v)), 1);
  const maxA = Math.max(...data.map((d) => Math.abs(d.a)), 1);
  const maxJ = Math.max(...data.map((d) => Math.abs(d.j)), 1);

  const normData = data.map((d) => ({
    t: d.t,
    p: d.p / maxP,
    v: d.v / maxV,
    a: d.a / maxA,
    j: d.j / maxJ,
  }));

  return (
    <svg viewBox="0 0 500 180" className="h-full w-full">
      {/* 背景网格 */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
        <line key={frac} x1="0" y1={180 - frac * 160} x2="480" y2={180 - frac * 160}
          stroke="rgba(148,210,255,0.06)" strokeWidth="0.5" />
      ))}

      {/* 轨迹线 */}
      {(['p', 'v', 'a', 'j'] as const).map((key, ki) => {
        const colors = ['#34d6ff', '#43f7b5', '#f5a623', '#ff5c7a'];
        const labels = ['位置', '速度', '加速度', '加加速度'];
        const xScale = 480 / Math.max(...normData.map((d) => d.t), 0.001);

        const pathD = normData.map((d, i) => {
          const x = d.t * xScale;
          const y = 170 - d[key] * 75 - 10;
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');

        return (
          <g key={key}>
            <path d={pathD} fill="none" stroke={colors[ki]} strokeWidth="1.5" opacity={0.8} />
            <text x="485" y={25 + ki * 15} fill={colors[ki]} fontSize="8">{labels[ki]}</text>
          </g>
        );
      })}
    </svg>
  );
}