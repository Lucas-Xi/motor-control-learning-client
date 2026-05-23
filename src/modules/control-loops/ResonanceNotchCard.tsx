import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import {
  sampleComplianceParams,
  resonanceFrequencies,
  type ComplianceParams,
} from '../../simulation/math/mechanicalCompliance';
import { simulateNotchSweep } from '../../simulation/math/resonanceSuppression';
import { formatNumber } from '../../utils/format';

const KT = 1.5 * 4 * 0.045;   // 与其他卡片一致：p=4, ψf=0.045 → 0.27 N·m/A

type PresetKey = keyof typeof sampleComplianceParams;

const PRESET_LABELS: Record<PresetKey, string> = {
  directDriveCompressor: '直驱压缩机（共振 > 1 kHz）',
  industrialFanBelt: '工业风机皮带（~200-400 Hz）',
  roboticJoint: '机器人关节谐波减速器（~150-200 Hz）',
  agedDrive: '老化传动（共振谷加深）',
};

interface MergedSample {
  tMs: number;
  omegaOff: number;
  omegaOn: number;
  iqOff: number;
  iqOn: number;
}

/**
 * 反共振陷波抑制卡：mechanicalCompliance 产生扰动，biquad notch 给对策。
 *
 * 两次并跑（notch off / on），同一图上叠两条 ω_motor 曲线让学员直接看见
 * "震荡 → 平顺"的差异；附 Q 与失配 Δf 滑块，演示工程权衡。
 */
export function ResonanceNotchCard() {
  const [presetKey, setPresetKey] = useState<PresetKey>('industrialFanBelt');
  const [Kp, setKp] = useState(0.6);
  const [Ki, setKi] = useState(8);
  const [Q, setQ] = useState(8);
  const [detunePct, setDetunePct] = useState(0);
  const [omegaRef, setOmegaRef] = useState(100);

  const params: ComplianceParams = sampleComplianceParams[presetKey];
  const { resonanceHz, antiResonanceHz } = resonanceFrequencies(params);

  // 跑两遍：陷波关 / 开
  const off = useMemo(() => simulateNotchSweep({
    params,
    omegaRefRadS: omegaRef,
    Kp, Ki, Kt: KT,
    durationSec: 0.3,
    dtSec: 1e-4,
    useNotch: false,
  }), [params, omegaRef, Kp, Ki]);

  const on = useMemo(() => simulateNotchSweep({
    params,
    omegaRefRadS: omegaRef,
    Kp, Ki, Kt: KT,
    durationSec: 0.3,
    dtSec: 1e-4,
    useNotch: true,
    detuneFrac: detunePct / 100,
    Q,
  }), [params, omegaRef, Kp, Ki, Q, detunePct]);

  // 合并两条曲线到一张图
  const merged = useMemo<MergedSample[]>(() => {
    const N = Math.min(off.samples.length, on.samples.length);
    const arr: MergedSample[] = [];
    for (let i = 0; i < N; i += 1) {
      arr.push({
        tMs: off.samples[i].tMs,
        omegaOff: Number(off.samples[i].omegaMotor.toFixed(2)),
        omegaOn: Number(on.samples[i].omegaMotor.toFixed(2)),
        iqOff: Number(off.samples[i].iqMotor.toFixed(3)),
        iqOn: Number(on.samples[i].iqMotor.toFixed(3)),
      });
    }
    return arr;
  }, [off, on]);

  // 抑制效果三态
  const rmsReductionPct = off.rmsErrorRadS > 1e-6
    ? Math.max(0, (1 - on.rmsErrorRadS / off.rmsErrorRadS) * 100)
    : 0;
  const status = rmsReductionPct >= 60
    ? { tone: 'good', Icon: CheckCircle2, label: '抑制有效', hint: '陷波对齐共振峰，速度环可放大带宽。' }
    : rmsReductionPct >= 20
    ? { tone: 'warn', Icon: AlertTriangle, label: '部分抑制', hint: '检查 Δf 失配或 Q 取值；过宽损失带宽、过窄漏掉共振。' }
    : { tone: 'bad', Icon: AlertOctagon, label: '抑制失效', hint: '常见原因：Δf 漂出陷波带 / Kp 过小未激发共振 / 陷波 Q 过窄。' };

  const toneClass = (t: string) =>
    t === 'good'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title="反共振陷波（Anti-Resonance Notch）：现象 → 对策"
      eyebrow="biquad notch · resonance suppression"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint="RBJ Audio EQ Cookbook 二阶陷波 + DF-II-T；中心频率 = mechanicalCompliance.resonanceFrequencies。Q / 失配 Δf 是 STM32 上两大权衡。"
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        双质量传动的<span className="text-accent-fault"> 共振峰</span>把速度环 PI 输出
        放大成持续振铃。STM32 最便宜的对策：在 PI 输出（iq_cmd）后串一个二阶 biquad 陷波，
        中心 = 共振 Hz、Q ≈ 5-15。但<span className="text-accent-warn"> 温度漂移 / 负载切换</span>
        让真实共振点偏离陷波带宽（Δf 失配）→ 抑制失效；Q 太大又把控制带宽内的信号也滤掉。
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-caption text-ink-muted">传动预设：</span>
        {(Object.keys(sampleComplianceParams) as PresetKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPresetKey(k)}
            className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
              presetKey === k
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink'
            }`}
          >
            {PRESET_LABELS[k]}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[11px] text-ink-muted">
        共振 <span className="formula text-accent-fault">{formatNumber(resonanceHz, 0)} Hz</span> ·
        反共振 <span className="formula text-accent-warn">{formatNumber(antiResonanceHz, 0)} Hz</span> ·
        速度环带宽工程上限约 <span className="formula">{formatNumber(antiResonanceHz / 5, 0)} Hz</span>
      </p>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>速度 Kp</span>
            <span className="formula text-ink-primary">{formatNumber(Kp, 2)}</span>
          </span>
          <input type="range" value={Kp} min={0.1} max={3} step={0.05}
            onChange={(e) => setKp(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="speed Kp" aria-valuemin={0.1} aria-valuemax={3} aria-valuenow={Kp} />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>速度 Ki</span>
            <span className="formula text-ink-primary">{formatNumber(Ki, 1)}</span>
          </span>
          <input type="range" value={Ki} min={0} max={50} step={0.5}
            onChange={(e) => setKi(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="speed Ki" aria-valuemin={0} aria-valuemax={50} aria-valuenow={Ki} />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>陷波 Q</span>
            <span className="formula text-ink-primary">{formatNumber(Q, 1)}</span>
          </span>
          <input type="range" value={Q} min={1} max={30} step={0.5}
            onChange={(e) => setQ(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="notch Q" aria-valuemin={1} aria-valuemax={30} aria-valuenow={Q} />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>陷波失配 Δf/f0</span>
            <span className="formula text-ink-primary">{formatNumber(detunePct, 1)}%</span>
          </span>
          <input type="range" value={detunePct} min={-30} max={30} step={1}
            onChange={(e) => setDetunePct(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="notch detune" aria-valuemin={-30} aria-valuemax={30} aria-valuenow={detunePct} />
        </label>
      </div>

      <div className="mb-2 flex items-baseline justify-between text-caption text-ink-muted">
        <span>速度阶跃 ω_ref = <span className="formula text-ink-primary">{formatNumber(omegaRef, 0)} rad/s</span></span>
        <input type="range" value={omegaRef} min={20} max={200} step={10}
          onChange={(e) => setOmegaRef(Number(e.target.value))}
          className="simulation-slider w-32"
          aria-label="speed step reference" aria-valuemin={20} aria-valuemax={200} aria-valuenow={omegaRef} />
      </div>

      <div className="h-56">
        <SafeResponsiveContainer>
          <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="tMs"
              type="number"
              domain={[0, 300]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 't (ms)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'ω_motor (rad/s)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 14, dy: 50 }}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(1)} ms`}
              formatter={(v) => `${Number(v).toFixed(2)} rad/s`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine y={omegaRef} stroke="#5d7793" strokeDasharray="2 3"
              label={{ value: `ref ${omegaRef}`, fill: '#9eb5cb', fontSize: 9, position: 'insideTopRight' }} />
            <Line type="monotone" dataKey="omegaOff" stroke="#fb7185" strokeWidth={1.4} dot={false} isAnimationActive={false} name="ω 无陷波（裸 PI 振铃）" />
            <Line type="monotone" dataKey="omegaOn" stroke="#43f7b5" strokeWidth={1.8} dot={false} isAnimationActive={false} name="ω 启陷波" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">无陷波 RMS</p>
          <p className="formula text-body text-accent-fault">{formatNumber(off.rmsErrorRadS, 2)} rad/s</p>
          <p className="text-[10px] opacity-75">超调 {formatNumber(off.overshootFrac * 100, 0)}%</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">启陷波 RMS</p>
          <p className="formula text-body text-accent-measure">{formatNumber(on.rmsErrorRadS, 2)} rad/s</p>
          <p className="text-[10px] opacity-75">超调 {formatNumber(on.overshootFrac * 100, 0)}% · 陷波中心 {formatNumber(on.notchCenterHz, 0)} Hz</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(status.tone)}`}>
          <div className="flex items-center gap-1.5 text-caption">
            <status.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{status.label}</span>
          </div>
          <p className="formula text-body">RMS −{formatNumber(rmsReductionPct, 0)}%</p>
          <p className="text-[10px] leading-snug opacity-90">{status.hint}</p>
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">STM32 移植要点</span>：把 <span className="formula">makeNotch(fc, fs, Q)</span>
        换成 ARM CMSIS-DSP <span className="formula">arm_biquad_cascade_df1_q15</span>；系数初始化时算一次缓存
        别每拍重算。生产代码典型加一层 <span className="text-accent-fault">在线共振辨识</span>（FFT / Goertzel
        在 omegaMotor 上）→ 自适应陷波中心，避免温度 / 负载漂移让陷波"对不准"。
      </p>
    </Card>
  );
}
