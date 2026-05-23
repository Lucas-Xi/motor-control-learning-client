import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import {
  buildFfcLut,
  evaluateFfc,
} from '../../simulation/math/coggingCompensation';
import { sampleCoggingParams } from '../../simulation/math/cogging';
import { formatNumber } from '../../utils/format';

// 与 motor-basics ThermalDeratingCard 基准对齐：4 极对 + ψf=0.045 → K_t = 0.27 N·m/A
const POLE_PAIRS = 4;
const FLUX = 0.045;
const KT = 1.5 * POLE_PAIRS * FLUX;

const LUT_SIZES = [16, 32, 64, 128, 256] as const;

/**
 * 齿槽前馈补偿（CT-FFC）卡：cogging.ts 模拟扰动，本卡演示 STM32 上"反相同幅"
 * 查表抵消的实际效果，并暴露两大工程权衡：LUT 分辨率 vs 角度估计误差。
 */
export function CoggingFeedforwardCard() {
  const [lutSize, setLutSize] = useState<(typeof LUT_SIZES)[number]>(64);
  const [angleErrDeg, setAngleErrDeg] = useState(0);
  const params = sampleCoggingParams.hitachi15HP;

  const lut = useMemo(() => buildFfcLut(lutSize, params, KT), [lutSize, params]);

  // 两条评估：当前条件 + 理想对照（无角误差 + 大 LUT）
  const result = useMemo(
    () => evaluateFfc(lut, params, KT, (angleErrDeg * Math.PI) / 180, 360),
    [lut, params, angleErrDeg],
  );
  const idealLut = useMemo(() => buildFfcLut(512, params, KT), [params]);
  const ideal = useMemo(() => evaluateFfc(idealLut, params, KT, 0, 360), [idealLut, params]);

  // 图表数据：每 2° 一个点（180 个），免得 360 个点拖慢 SVG
  const chartData = useMemo(
    () => result.samples.filter((_, i) => i % 2 === 0).map((s) => ({
      thetaDeg: s.thetaDeg,
      Tcog: Number((s.tCogNm * 1000).toFixed(2)),       // mN·m
      Tresidual: Number((s.tResidualNm * 1000).toFixed(2)),
      iqFfc: Number(s.iqFfcA.toFixed(3)),
    })),
    [result],
  );

  const supprStatus =
    result.suppressionDb >= 25
      ? { tone: 'good', Icon: CheckCircle2, label: '充分抑制', hint: '可视为转矩平顺；适合高端家电、电梯主驱。' }
      : result.suppressionDb >= 12
      ? { tone: 'warn', Icon: AlertTriangle, label: '部分抑制', hint: '可听见微振；适合通用变频空调，但仍有 ~3-6% 残余纹波。' }
      : { tone: 'bad', Icon: AlertOctagon, label: '补偿失效', hint: '残差接近甚至超过原扰动；通常是角度估计偏差太大或 LUT 表太短。' };

  const toneClass = (t: string) =>
    t === 'good'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title="齿槽前馈补偿（CT-FFC）：现象 → 对策"
      eyebrow="cogging feed-forward · STM32 lookup compensation"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint="iq_ffc(θ) = −T_cog(θ)/(1.5·p·ψf)。LUT 长度 16-256 + 角度误差是 STM32 上的两大权衡。"
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        齿槽转矩是机械角度的<span className="text-ink-primary">完全确定性</span>周期扰动——
        理论上拿一张以角度索引的查找表把"反相同幅"的 iq 加到 PI 输出上，能在角度域消掉纹波。
        但 STM32 实战必须权衡两件事：
        <span className="text-accent-warn"> LUT 分辨率</span>（RAM + latency vs 量化误差）
        和 <span className="text-accent-fault">角度估计误差</span>（sensorless 估角偏 2° 就足够让补偿在过零附近反相放大）。
      </p>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>LUT 表长 N（次方提升精度同时吃 RAM）</span>
            <span className="formula text-ink-primary">{lutSize} entries</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {LUT_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLutSize(n)}
                className={`rounded border px-2 py-[2px] text-[11px] transition-colors ${
                  lutSize === n
                    ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                    : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>角度估计误差 Δθ（sensorless 典型 1-5°）</span>
            <span className="formula text-ink-primary">{formatNumber(angleErrDeg, 1)}°</span>
          </span>
          <input
            type="range"
            value={angleErrDeg}
            min={0}
            max={15}
            step={0.5}
            onChange={(e) => setAngleErrDeg(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="angle estimation error"
            aria-valuemin={0}
            aria-valuemax={15}
            aria-valuenow={angleErrDeg}
            aria-valuetext={`${angleErrDeg} degrees`}
          />
        </label>
      </div>

      <div className="h-56">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="thetaDeg"
              type="number"
              domain={[0, 360]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'θ_mech (°)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              yAxisId="T"
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'T (mN·m)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 14, dy: 30 }}
              domain={[-100, 100]}
            />
            <YAxis
              yAxisId="iq"
              orientation="right"
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              label={{ value: 'iq_ffc (A)', angle: 90, position: 'insideRight', fill: '#9eb5cb', fontSize: 10, dx: -12, dy: -30 }}
              domain={[-0.5, 0.5]}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `θ = ${Number(v).toFixed(0)}°`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine yAxisId="T" y={0} stroke="#5d7793" strokeDasharray="2 3" />
            <Line yAxisId="T" type="monotone" dataKey="Tcog" stroke="#fb7185" strokeWidth={1.4} dot={false} isAnimationActive={false} name="T_cog 原始扰动" />
            <Line yAxisId="T" type="monotone" dataKey="Tresidual" stroke="#43f7b5" strokeWidth={2} dot={false} isAnimationActive={false} name="T_residual 补偿后残差" />
            <Line yAxisId="iq" type="monotone" dataKey="iqFfc" stroke="#34d6ff" strokeWidth={1.2} strokeDasharray="3 3" dot={false} isAnimationActive={false} name="iq_ffc 补偿命令" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">原始 RMS</p>
          <p className="formula text-body text-accent-fault">{formatNumber(result.rmsBeforeNm * 1000, 1)} mN·m</p>
          <p className="text-[10px] opacity-75">额定 ~1 N·m 的 {formatNumber((result.rmsBeforeNm / 1) * 100, 1)}%</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">残差 RMS</p>
          <p className="formula text-body text-accent-measure">{formatNumber(result.rmsAfterNm * 1000, 2)} mN·m</p>
          <p className="text-[10px] opacity-75">理想极限 {formatNumber(ideal.rmsAfterNm * 1000, 2)} mN·m（N=512、Δθ=0）</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(supprStatus.tone)}`}>
          <div className="flex items-center gap-1.5 text-caption">
            <supprStatus.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{supprStatus.label}</span>
          </div>
          <p className="formula text-body">{formatNumber(result.suppressionDb, 1)} dB</p>
          <p className="text-[10px] leading-snug opacity-90">{supprStatus.hint}</p>
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">STM32 移植要点</span>：把 <span className="formula">buildFfcLut</span>
        预计算成 <span className="formula">int16_t lut[64]</span>（q15 缩放）烧进 Flash；
        ISR 内 <span className="formula">iq_total = iq_PI + lut[(theta &gt;&gt; n) &amp; mask]</span> 单周期完成。
        sensorless 启动早期角度尚未收敛时务必<span className="text-accent-fault"> 关闭 FFC</span>，
        BEMF 估角稳定（&lt; 2° 误差）后才能再开。
      </p>
    </Card>
  );
}
