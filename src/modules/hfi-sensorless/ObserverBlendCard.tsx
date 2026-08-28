import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { blendObserverAngle, sweepObserverBlend } from '../../simulation/math/observer';
import { formatNumber } from '../../utils/format';

/**
 * HFI → BEMF 最短路径融合卡。
 * 调用 blendObserverAngle / sweepObserverBlend，不用 Math.random 伪造交接误差。
 */
export function ObserverBlendCard() {
  const [transitionLow, setTransitionLow] = useState(300);
  const [transitionHigh, setTransitionHigh] = useState(600);
  const [hfiBiasDeg, setHfiBiasDeg] = useState(0);

  const low = transitionLow;
  const high = Math.max(transitionHigh, low + 50);
  const bandwidth = high - low;
  const narrow = bandwidth < 80;

  const samples = useMemo(
    () =>
      sweepObserverBlend({
        transitionLow: low,
        transitionHigh: high,
        hfiBiasDeg,
        rpmMin: 0,
        rpmMax: 1500,
        points: 61,
      }),
    [low, high, hfiBiasDeg],
  );

  const midRpm = (low + high) / 2;
  const mid = useMemo(() => {
    const hfiRad = ((hfiBiasDeg + 4) * Math.PI) / 180;
    const bemfRad = ((40 * Math.exp(-midRpm / 220)) * Math.PI) / 180;
    return blendObserverAngle(hfiRad, bemfRad, midRpm, low, high);
  }, [hfiBiasDeg, midRpm, low, high]);

  const midJump = useMemo(() => {
    if (samples.length === 0) return 0;
    let best = samples[0];
    let bestD = Math.abs(best.rpm - midRpm);
    for (const s of samples) {
      const d = Math.abs(s.rpm - midRpm);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best.jumpDeg;
  }, [samples, midRpm]);

  const first = samples[0];
  const last = samples[samples.length - 1];
  const lowOwner = first && first.blendRatio < 0.5 ? 'HFI' : 'BEMF';
  const highOwner = last && last.blendRatio > 0.5 ? 'BEMF' : 'HFI';

  return (
    <Card
      title="HFI → BEMF：融合带比硬切少一次角度跳"
      eyebrow="observer blend · shortest-path"
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint="blendObserverAngle 在 300–600 rpm 线性融合，走最短角路径。硬切会在交接处跳 Δθ。"
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        blendObserverAngle 在 300–600 rpm 线性融合，走最短角路径。硬切会在交接处跳 Δθ。
      </p>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>融合起点 transitionLow</span>
          <span className="formula text-ink-primary">{formatNumber(low, 0)} rpm</span>
        </span>
        <input
          type="range"
          value={transitionLow}
          min={100}
          max={800}
          step={10}
          onChange={(e) => setTransitionLow(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="transition low rpm"
          aria-valuemin={100}
          aria-valuemax={800}
          aria-valuenow={transitionLow}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>融合终点 transitionHigh</span>
          <span className="formula text-ink-primary">{formatNumber(high, 0)} rpm</span>
        </span>
        <input
          type="range"
          value={transitionHigh}
          min={200}
          max={1500}
          step={10}
          onChange={(e) => setTransitionHigh(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="transition high rpm"
          aria-valuemin={200}
          aria-valuemax={1500}
          aria-valuenow={transitionHigh}
        />
      </label>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-secondary">
          <span>HFI 偏置 hfiBiasDeg</span>
          <span className="formula text-ink-primary">{formatNumber(hfiBiasDeg, 0)}°</span>
        </span>
        <input
          type="range"
          value={hfiBiasDeg}
          min={0}
          max={30}
          step={1}
          onChange={(e) => setHfiBiasDeg(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="hfi bias deg"
          aria-valuemin={0}
          aria-valuemax={30}
          aria-valuenow={hfiBiasDeg}
        />
      </label>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">交接带宽</p>
          <p className={`formula text-body ${narrow ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(bandwidth, 0)} rpm
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">中点融合比</p>
          <p className="formula text-body text-accent-primary">
            {formatNumber(mid.blendRatio, 2)}
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">低速靠谁</p>
          <p className="formula text-body text-accent-measure">{lowOwner}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">高速靠谁</p>
          <p className="formula text-body text-accent-primary">{highOwner}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-secondary">硬切跳变</p>
          <p className={`formula text-body ${midJump > 15 ? 'text-accent-fault' : midJump > 8 ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(midJump, 1)}°
          </p>
        </div>
      </div>

      <div className="h-52">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 16, bottom: 16, left: -2 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="rpm"
              type="number"
              domain={[0, 1500]}
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              label={{ value: 'n (rpm)', position: 'insideBottom', offset: -6, fill: '#9eb5cb', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 11 }}
              domain={['auto', 'auto']}
              label={{ value: 'θ (°)', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 11, dx: 12, dy: 20 }}
            />
            <Tooltip
              contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
              labelFormatter={(v) => `n = ${Number(v).toFixed(0)} rpm`}
              formatter={(v, name) => [`${Number(v).toFixed(2)}°`, String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
            <ReferenceLine
              x={low}
              stroke="#34d6ff"
              strokeDasharray="3 3"
              label={{ value: 'low', fill: '#34d6ff', fontSize: 10, position: 'insideTopLeft' }}
            />
            <ReferenceLine
              x={high}
              stroke="#43f7b5"
              strokeDasharray="3 3"
              label={{ value: 'high', fill: '#43f7b5', fontSize: 10, position: 'insideTopRight' }}
            />
            <Line
              type="monotone"
              dataKey="hfiDeg"
              stroke="#34d6ff"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
              name="HFI"
            />
            <Line
              type="monotone"
              dataKey="bemfDeg"
              stroke="#43f7b5"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
              name="BEMF"
            />
            <Line
              type="monotone"
              dataKey="blendDeg"
              stroke="#ffb84d"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
              name="blend"
            />
            <Line
              type="monotone"
              dataKey="hardCutDeg"
              stroke="#e7f3ff"
              strokeWidth={1.3}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              name="hard-cut"
            />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div className={`mt-3 flex gap-2 rounded-lg border p-2 ${
        narrow
          ? 'border-accent-warn/40 bg-accent-warn/10'
          : 'border-accent-measure/40 bg-accent-measure/10'
      }`}
      >
        {narrow ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-warn" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" aria-hidden="true" />
        )}
        <div className="text-caption leading-snug">
          {narrow ? (
            <span className="text-accent-warn">
              带太窄（{formatNumber(bandwidth, 0)} rpm &lt; 80），接近硬切：中点一次跳 {formatNumber(midJump, 1)}°，电流环会打一拳。
            </span>
          ) : (
            <span className="text-accent-measure">
              融合带 {formatNumber(bandwidth, 0)} rpm，Δθ 摊在转速上。中点比 {formatNumber(mid.blendRatio, 2)}。
              硬切会在中点一次吃掉 {formatNumber(midJump, 1)}°，白虚线就是那一跳。
            </span>
          )}
        </div>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-ink-secondary">
        零速只能 HFI；高速 HFI 铁损+噪声该退。白虚线是硬切：在中点一次换人，θ 跳 {formatNumber(midJump, 1)}°。黄线把同一 Δθ 摊在融合带上。
      </p>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        <span className="text-accent-warn">STM32 移植要点</span>：用转速（或 |e|）做 t；角度用 atan2 最短路径；带宽 200–400 rpm 起步。
      </p>
    </Card>
  );
}
