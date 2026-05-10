import { useMemo } from 'react';
import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { clarkeTransform, generateThreePhaseCurrent, parkTransform } from '../../simulation/math/transforms';
import type { ThreePhaseParams } from '../../simulation/engine/types';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';

interface Props {
  params: ThreePhaseParams;
  cursorMs?: number;
}

export function DQWaveform({ params, cursorMs = 0 }: Props) {
  const windowMs = Math.max(40, Math.min(200, (4 * 1000) / Math.max(1, params.frequency)));
  const points = 140;

  const data = useMemo(() => {
    const out: Array<{ t: number; id: number; iq: number }> = [];
    const tNow = cursorMs / 1000;
    const tStart = tNow - windowMs / 1000;
    for (let i = 0; i < points; i += 1) {
      const tAbs = tStart + (i / (points - 1)) * (windowMs / 1000);
      const abc = generateThreePhaseCurrent({
        amplitude: params.amplitude,
        frequency: params.frequency,
        phaseDeg: params.phaseDeg,
        balance: params.balance,
        harmonic: params.harmonic,
        noise: params.noise,
        time: tAbs,
      });
      const ab = clarkeTransform(abc);
      // 用 ωt + 初始相位 作为 dq 旋转角，模拟"跟着旋转磁场转的同步坐标"
      const theta = 2 * Math.PI * params.frequency * tAbs + (params.phaseDeg * Math.PI) / 180;
      const dq = parkTransform(ab, theta);
      out.push({ t: (i / (points - 1)) * windowMs, id: dq.d, iq: dq.q });
    }
    return out;
  }, [params.amplitude, params.frequency, params.phaseDeg, params.balance, params.harmonic, params.noise, cursorMs, windowMs, points]);

  return (
    <div className="h-52">
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
          <ReferenceLine x={windowMs} stroke="#43f7b5" strokeDasharray="2 3" opacity={0.5}
            label={{ value: 'now', fill: '#43f7b5', fontSize: 10, position: 'insideTopRight' }} />
          <Line type="monotone" dataKey="id" dot={false} stroke="#34d6ff" strokeWidth={2} name="Id" isAnimationActive={false} />
          <Line type="monotone" dataKey="iq" dot={false} stroke="#ff5c7a" strokeWidth={2} name="Iq" isAnimationActive={false} />
        </LineChart>
      </SafeResponsiveContainer>
    </div>
  );
}
