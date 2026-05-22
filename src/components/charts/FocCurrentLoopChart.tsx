import { useMemo } from 'react';
import { Line, LineChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { simulateFocCurrentLoop, evaluateFocLoop } from '../../simulation/math/focLoop';
import type { FOCParams } from '../../simulation/engine/types';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';
import { formatNumber } from '../../utils/format';

interface Props {
  params: FOCParams;
  /** round-11 接入：开 HD 后用 saturation/cogging/温度补偿；默认关 */
  highFidelity?: boolean;
  windingTempC?: number;
}

export function FocCurrentLoopChart({ params, highFidelity, windingTempC }: Props) {
  const samples = useMemo(
    () => simulateFocCurrentLoop(params, { highFidelity, windingTempC }),
    [params, highFidelity, windingTempC],
  );
  const metrics = useMemo(() => evaluateFocLoop(samples, params.iqRef), [samples, params.iqRef]);

  const overshoot = metrics.iqOvershootPct;
  const overshootTone = overshoot > 25 ? 'fault' : overshoot > 8 ? 'warn' : 'measure';
  const crossTalkTone = metrics.idCrossTalkPeak > 0.5 ? 'fault' : metrics.idCrossTalkPeak > 0.15 ? 'warn' : 'measure';

  return (
    <div className="space-y-3">
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" A" />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            <ReferenceLine y={0} stroke="#1e2a3d" strokeDasharray="2 4" />
            <Line type="monotone" dataKey="iqRef" dot={false} stroke="#9eb5cb" strokeDasharray="4 4" name="Iq 指令" isAnimationActive={false} />
            <Line type="monotone" dataKey="iq" dot={false} stroke="#43f7b5" strokeWidth={2} name="Iq 实际" isAnimationActive={false} />
            <Line type="monotone" dataKey="idRef" dot={false} stroke="#5d7793" strokeDasharray="4 4" name="Id 指令" isAnimationActive={false} />
            <Line type="monotone" dataKey="id" dot={false} stroke="#34d6ff" strokeWidth={2} name="Id 实际" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Iq 上升时间" value={metrics.iqRiseTimeMs === null ? '--' : formatNumber(metrics.iqRiseTimeMs, 1)} unit=" ms" tone="primary" />
        <Metric label="Iq 超调" value={formatNumber(overshoot, 1)} unit="%" tone={overshootTone} />
        <Metric label="Iq 稳态误差" value={formatNumber(metrics.iqSteadyError, 3)} unit=" A"
          tone={Math.abs(metrics.iqSteadyError) > 0.1 ? 'warn' : 'measure'} />
        <Metric label="Id 串扰峰值" value={formatNumber(metrics.idCrossTalkPeak, 3)} unit=" A" tone={crossTalkTone} />
      </div>
    </div>
  );
}

type Tone = 'primary' | 'measure' | 'warn' | 'fault';
const toneColor: Record<Tone, string> = {
  primary: 'var(--accent-primary)',
  measure: 'var(--accent-measure)',
  warn: 'var(--accent-warn)',
  fault: 'var(--accent-fault)',
};

function Metric({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone: Tone }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="formula text-body font-medium" style={{ color: toneColor[tone] }}>{value}{unit}</p>
    </div>
  );
}
