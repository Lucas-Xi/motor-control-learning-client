import { useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import { Sparkline } from '../../components/charts/Sparkline';
import { compensateDeadTime } from '../../simulation/math/deadtime';
import { formatNumber } from '../../utils/format';

/**
 * 死区补偿对比卡：消费 src/simulation/math/deadtime.ts 中的 compensateDeadTime。
 *
 * 教学要点：
 *   - 理想线性区：V_phase = (duty - 0.5) · Udc
 *   - 死区扭曲：ΔV = sign(i) · t_dead · f_sw · Udc  → 过零附近相电压跳变 ±Udc/2 量级
 *   - 滞环阈值 i_hys：避开 sign() 在过零抖动时的高频翻转；典型取额定电流 2-5%
 *
 * X 轴：相电流 ia ∈ [-A, +A]
 * Y 轴：理想 vs 实际 vs 补偿后 三条相电压（V）
 */

const DEFAULTS = {
  iRange: 10, // A，±10 A 扫描范围
  dutyA: 0.55, // 接近线性区中点
  Vdc: 310,
  i_hys: 0.5, // A，约 5% × 10 A
  samples: 121,
};

interface SamplePoint {
  i: number;
  vIdeal: number;
  vActual: number;
  vCompensated: number;
}

function buildSweep(
  t_dead_us: number,
  f_sw_kHz: number,
  i_hys: number,
): { samples: SamplePoint[]; dutyDelta: number; voltDelta: number } {
  const t_sw_us = 1000 / Math.max(f_sw_kHz, 0.01);
  const dutyDelta = t_dead_us / t_sw_us;
  const voltDelta = dutyDelta * DEFAULTS.Vdc;
  const step = (2 * DEFAULTS.iRange) / (DEFAULTS.samples - 1);
  const samples: SamplePoint[] = [];
  // 上一拍 sign 用 0 启动；按 i 升序扫描，滞环会在 ±i_hys 之间保持上次值
  let prevA = 0;
  for (let i = 0; i < DEFAULTS.samples; i += 1) {
    const ia = -DEFAULTS.iRange + i * step;
    const result = compensateDeadTime({
      ia,
      ib: 0,
      ic: 0,
      t_dead_us,
      t_sw_us,
      Vdc: DEFAULTS.Vdc,
      i_hys,
      prevSign: { a: prevA, b: 0, c: 0 },
    });
    prevA = result.signA;
    // 理想相电压（中心对齐 PWM 平均值）
    const vIdeal = (DEFAULTS.dutyA - 0.5) * DEFAULTS.Vdc;
    // 实际：死区窗口被电流方向"夹住"，相电压平均偏一个 ΔV（与电流同号 → 误差与 i 反向）
    // 真实物理：i>0 → 续流到下管 → 相电压 < 理想 → 误差 = -ΔV；result.dvA 已含此正负
    const vActual = vIdeal - result.dvA;
    // 补偿：把 -ΔV 加回去（result.ddA 等价于占空比修正量 · Vdc 即是相电压修正）
    const vCompensated = vIdeal - result.dvA + result.ddA * DEFAULTS.Vdc;
    samples.push({ i: ia, vIdeal, vActual, vCompensated });
  }
  return { samples, dutyDelta, voltDelta };
}

export function DeadTimeCompensationCard() {
  const [t_dead_us, setTd] = useState(2);
  const [f_sw_kHz, setFsw] = useState(8);
  const [i_hys, setIhys] = useState(0.5);

  const { samples, dutyDelta, voltDelta } = useMemo(
    () => buildSweep(t_dead_us, f_sw_kHz, i_hys),
    [t_dead_us, f_sw_kHz, i_hys],
  );

  // 取过零附近 ±2A 内的样本，看补偿前后残差
  const residualPeak = useMemo(() => {
    let peak = 0;
    for (const s of samples) {
      if (Math.abs(s.i) <= 2) {
        peak = Math.max(peak, Math.abs(s.vActual - s.vCompensated));
      }
    }
    return peak;
  }, [samples]);

  // Sparkline 用补偿前后的"误差曲线"
  const errIdealActual = samples.map((s) => s.vActual - s.vIdeal);
  const errIdealComp = samples.map((s) => s.vCompensated - s.vIdeal);

  // 绘制 SVG 折线图（不引入新依赖）
  const W = 460;
  const H = 200;
  const PAD = { l: 40, r: 12, t: 14, b: 30 };
  const PW = W - PAD.l - PAD.r;
  const PH = H - PAD.t - PAD.b;
  const yMax = Math.max(
    ...samples.map((s) => Math.abs(s.vIdeal) + Math.abs(voltDelta)),
    DEFAULTS.Vdc * 0.5 * 0.25,
  );
  const xOf = (i: number) => PAD.l + ((i + DEFAULTS.iRange) / (2 * DEFAULTS.iRange)) * PW;
  const yOf = (v: number) => PAD.t + (1 - (v + yMax) / (2 * yMax)) * PH;
  const path = (key: keyof SamplePoint) =>
    samples
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.i).toFixed(1)} ${yOf(s[key] as number).toFixed(1)}`)
      .join(' ');

  return (
    <Card title="死区补偿对比" eyebrow="dead-time compensation" density="compact">
      <p className="mb-2 text-caption leading-relaxed text-ink-muted">
        公式 <code className="formula text-ink-secondary">d&apos; = d − sign(i)·t_dead/T_sw</code>{' '}
        | 滞环消除过零抖动
      </p>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Slider label="死区时间 td" value={t_dead_us} min={0} max={5} step={0.1} unit=" μs" onChange={setTd} />
        <Slider label="开关频率 fsw" value={f_sw_kHz} min={2} max={20} step={0.5} unit=" kHz" onChange={setFsw} />
        <Slider label="滞环 i_hys" value={i_hys} min={0} max={2} step={0.1} unit=" A" onChange={setIhys} />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`死区补偿对比图，死区 ${t_dead_us}μs，开关频率 ${f_sw_kHz}kHz，滞环 ${i_hys}A，补偿后过零残差 ${formatNumber(residualPeak, 1)}V`}
      >
        <rect x="0" y="0" width={W} height={H} rx="8" fill="rgb(var(--bg-base))" />
        {/* 网格 + 0 基线 */}
        <line x1={PAD.l} y1={yOf(0)} x2={W - PAD.r} y2={yOf(0)} stroke="rgba(231,243,255,0.12)" strokeWidth="1" />
        <line x1={xOf(0)} y1={PAD.t} x2={xOf(0)} y2={H - PAD.b} stroke="rgba(231,243,255,0.12)" strokeWidth="1" />
        {/* 滞环带 */}
        <rect
          x={xOf(-i_hys)}
          y={PAD.t}
          width={xOf(i_hys) - xOf(-i_hys)}
          height={PH}
          fill="rgba(255,184,77,0.05)"
        />
        {/* 三条曲线 */}
        <path d={path('vIdeal')} stroke="rgba(231,243,255,0.5)" strokeWidth="1.4" strokeDasharray="4 4" fill="none" />
        <path d={path('vActual')} stroke="rgb(var(--accent-fault))" strokeWidth="1.6" fill="none" />
        <path d={path('vCompensated')} stroke="rgb(var(--accent-measure))" strokeWidth="1.6" fill="none" />
        {/* 轴刻度 */}
        <text x={PAD.l} y={H - 8} fill="rgb(var(--ink-muted))" fontSize="10">−{DEFAULTS.iRange}A</text>
        <text x={W - PAD.r - 24} y={H - 8} fill="rgb(var(--ink-muted))" fontSize="10">+{DEFAULTS.iRange}A</text>
        <text x={4} y={yOf(yMax * 0.85) + 4} fill="rgb(var(--ink-muted))" fontSize="10" textAnchor="start">
          +{formatNumber(yMax, 0)}V
        </text>
        <text x={4} y={yOf(-yMax * 0.85) + 4} fill="rgb(var(--ink-muted))" fontSize="10" textAnchor="start">
          −{formatNumber(yMax, 0)}V
        </text>
        {/* 图例 */}
        <g fontSize="10" fontFamily="Cascadia Code, Consolas, monospace">
          <line x1={PAD.l + 4} y1={PAD.t + 6} x2={PAD.l + 24} y2={PAD.t + 6} stroke="rgba(231,243,255,0.5)" strokeDasharray="4 4" strokeWidth="1.4" />
          <text x={PAD.l + 28} y={PAD.t + 9} fill="rgb(var(--ink-muted))">理想</text>
          <line x1={PAD.l + 64} y1={PAD.t + 6} x2={PAD.l + 84} y2={PAD.t + 6} stroke="rgb(var(--accent-fault))" strokeWidth="1.6" />
          <text x={PAD.l + 88} y={PAD.t + 9} fill="rgb(var(--ink-muted))">未补偿</text>
          <line x1={PAD.l + 134} y1={PAD.t + 6} x2={PAD.l + 154} y2={PAD.t + 6} stroke="rgb(var(--accent-measure))" strokeWidth="1.6" />
          <text x={PAD.l + 158} y={PAD.t + 9} fill="rgb(var(--ink-muted))">补偿后</text>
        </g>
      </svg>

      <div className="mt-3 grid grid-cols-3 gap-2 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">Δd 偏差</p>
          <p className="formula text-ink-primary">{formatNumber(dutyDelta * 100, 2)}%</p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">ΔV 死区</p>
          <p className={`formula ${voltDelta > 5 ? 'text-accent-warn' : 'text-ink-primary'}`}>
            {formatNumber(voltDelta, 2)} V
          </p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">过零残差</p>
          <p className={`formula ${residualPeak > 1 ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(residualPeak, 1)} V
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-caption text-ink-muted">
        <span className="flex items-center gap-1">
          未补偿误差
          <Sparkline data={errIdealActual} width={56} height={14} color="rgb(255,92,122)" yMin={-voltDelta * 1.2} yMax={voltDelta * 1.2} />
        </span>
        <span className="flex items-center gap-1">
          补偿后残差
          <Sparkline data={errIdealComp} width={56} height={14} color="rgb(67,247,181)" yMin={-voltDelta * 1.2} yMax={voltDelta * 1.2} />
        </span>
      </div>
    </Card>
  );
}
