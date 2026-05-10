import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { formatPercent } from '../../utils/format';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';

interface Props {
  dutyA: number;
  dutyB: number;
  dutyC: number;
}

export function PWMChart({ dutyA, dutyB, dutyC }: Props) {
  const data = useMemo(
    () => [
      { phase: 'A', duty: dutyA, fill: '#34d6ff' },
      { phase: 'B', duty: dutyB, fill: '#43f7b5' },
      { phase: 'C', duty: dutyC, fill: '#ffb84d' },
    ],
    [dutyA, dutyB, dutyC],
  );
  return (
    <div className="h-44">
      <SafeResponsiveContainer>
        <BarChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="rgba(148, 210, 255, 0.12)" strokeDasharray="3 6" />
          <XAxis dataKey="phase" tick={{ fill: '#8fb7c9', fontSize: 11 }} />
          <YAxis tickFormatter={(value) => `${Number(value) * 100}%`} domain={[0, 1]} tick={{ fill: '#8fb7c9', fontSize: 11 }} />
          <Tooltip formatter={(value) => formatPercent(Number(value))} contentStyle={{ background: '#07111f', border: '1px solid rgba(52,214,255,.35)', borderRadius: 14 }} />
          <Bar dataKey="duty" radius={[10, 10, 2, 2]} fill="#34d6ff" isAnimationActive={false} />
        </BarChart>
      </SafeResponsiveContainer>
    </div>
  );
}
