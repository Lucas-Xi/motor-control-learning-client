import { useMemo } from 'react';
import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { simulatePidStepResponse, type PIDGains, type PIDSimulationOptions } from '../../simulation/math/pid';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';

interface Props {
  gains: PIDGains;
  target: number;
  sampleMs?: number;
  options?: PIDSimulationOptions;
}

export function StepResponseChart({ gains, target, sampleMs = 2, options }: Props) {
  const data = useMemo(
    () => simulatePidStepResponse(gains, target, sampleMs / 1000, 1.2, options),
    [gains.kp, gains.ki, gains.kd, target, sampleMs, options?.limit, options?.antiWindup, options?.loadDisturbance],
  );
  return (
    <div className="h-52">
      <SafeResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(148, 210, 255, 0.12)" strokeDasharray="3 6" />
          <XAxis dataKey="t" tick={{ fill: '#8fb7c9', fontSize: 11 }} />
          <YAxis tick={{ fill: '#8fb7c9', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#07111f', border: '1px solid rgba(52,214,255,.35)', borderRadius: 14 }} />
          <Line type="monotone" dataKey="target" dot={false} stroke="#ffffff55" strokeDasharray="4 4" name="目标" isAnimationActive={false} />
          <Line type="monotone" dataKey="value" dot={false} stroke="#43f7b5" strokeWidth={2} name="响应" isAnimationActive={false} />
          <Line type="monotone" dataKey="output" dot={false} stroke="#ffb84d" strokeWidth={1.5} name="输出" isAnimationActive={false} />
        </LineChart>
      </SafeResponsiveContainer>
    </div>
  );
}
