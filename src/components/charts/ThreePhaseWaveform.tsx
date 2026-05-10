import { useMemo } from 'react';
import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { generateThreePhaseCurrent } from '../../simulation/math/transforms';
import type { ThreePhaseParams } from '../../simulation/engine/types';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';

interface Props {
  params: ThreePhaseParams;
  /** 当前仿真时间（ms），驱动波形左滑 */
  cursorMs?: number;
  compact?: boolean;
}

export function ThreePhaseWaveform({ params, cursorMs = 0, compact = false }: Props) {
  // 滚动窗口：自动展示约 4 个周期，最少 30ms，最多 200ms
  const windowMs = Math.max(30, Math.min(200, (4 * 1000) / Math.max(1, params.frequency)));
  const points = compact ? 80 : 160;

  // 关键改动：data 是滚动窗口的"快照"。窗口的右边界 = cursorMs（"现在"）。
  // 每次 cursorMs 变化（time 推进），窗口整体左滑，从而新数据从右出现、老数据从左滑出。
  const data = useMemo(() => {
    const out: Array<{ t: number; ia: number; ib: number; ic: number }> = [];
    const tNowSec = cursorMs / 1000;
    const tStartSec = tNowSec - windowMs / 1000;
    for (let i = 0; i < points; i += 1) {
      const tAbs = tStartSec + (i / (points - 1)) * (windowMs / 1000);
      const abc = generateThreePhaseCurrent({
        amplitude: params.amplitude,
        frequency: params.frequency,
        phaseDeg: params.phaseDeg,
        balance: params.balance,
        harmonic: params.harmonic,
        noise: params.noise,
        time: tAbs,
      });
      // X 轴用相对时间（窗口起始为 0，结束为 windowMs），让窗口本身视觉上不动，数据流过
      out.push({ t: (i / (points - 1)) * windowMs, ia: abc.ia, ib: abc.ib, ic: abc.ic });
    }
    return out;
  }, [params.amplitude, params.frequency, params.phaseDeg, params.balance, params.harmonic, params.noise, cursorMs, windowMs, points]);

  return (
    <div className={compact ? 'h-44' : 'h-56'}>
      <SafeResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
          <XAxis
            dataKey="t"
            tick={{ fill: '#9eb5cb', fontSize: 11 }}
            tickFormatter={(v) => `${(Number(v) - windowMs).toFixed(0)} ms`}
            type="number"
            domain={[0, windowMs]}
          />
          <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }}
            labelFormatter={(value) => `${(Number(value) - windowMs).toFixed(2)} ms`}
          />
          {/* 示波器右侧"现在"标记线 */}
          <ReferenceLine x={windowMs} stroke="#43f7b5" strokeDasharray="2 3" opacity={0.5}
            label={{ value: 'now', fill: '#43f7b5', fontSize: 10, position: 'insideTopRight' }} />
          <Line type="monotone" dataKey="ia" dot={false} stroke="#34d6ff" strokeWidth={2} name="Ia" isAnimationActive={false} />
          <Line type="monotone" dataKey="ib" dot={false} stroke="#43f7b5" strokeWidth={2} name="Ib" isAnimationActive={false} />
          <Line type="monotone" dataKey="ic" dot={false} stroke="#ffb84d" strokeWidth={2} name="Ic" isAnimationActive={false} />
        </LineChart>
      </SafeResponsiveContainer>
    </div>
  );
}
