import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis, Legend, ReferenceLine } from 'recharts';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';
import type { HfiSignalSample } from '../../simulation/math/hfiSignals';

interface Props {
  samples: HfiSignalSample[];
  height?: number;
}

/**
 * HFI 信号链 4 通道时序图：
 *   - vInject     注入电压（accent.primary cyan）
 *   - iResponse   凸极调制电流响应（accent.measure mint）
 *   - demodulated 与载波相乘后的中间信号（accent.warn amber）
 *   - errorSignal 低通后的角度误差（accent.fault rose）
 *
 * 注：4 个通道幅值数量级差异大（V vs A vs A·V），共享同一 Y 轴时
 * 不同通道单位不同——这里有意采用单 Y 轴让「同时归零 / 谁主谁副」一目了然，
 * 教学上比双 Y 轴更直观（学员关心的是相对形状而不是绝对量纲）。
 */
export function HfiInjectionWaveform({ samples, height = 220 }: Props) {
  return (
    <div style={{ height }}>
      <SafeResponsiveContainer>
        <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
          <XAxis
            dataKey="t"
            type="number"
            tick={{ fill: '#9eb5cb', fontSize: 11 }}
            tickFormatter={(v) => `${Number(v).toFixed(1)}`}
            unit="ms"
            domain={['dataMin', 'dataMax']}
          />
          <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }}
            labelFormatter={(value) => `${Number(value).toFixed(2)} ms`}
            formatter={(value, name) => [Number(value).toFixed(3), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
          <ReferenceLine y={0} stroke="#1e2a3d" />
          <Line
            type="monotone"
            dataKey="vInject"
            dot={false}
            stroke="#34d6ff"
            strokeWidth={1.2}
            name="注入电压 V_h"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="iResponse"
            dot={false}
            stroke="#43f7b5"
            strokeWidth={1.4}
            name="电流响应 i (含噪声)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="demodulated"
            dot={false}
            stroke="#ffb84d"
            strokeWidth={1.2}
            name="解调中间信号"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="errorSignal"
            dot={false}
            stroke="#ff5c7a"
            strokeWidth={2}
            name="LPF 误差 ∝ sin(2θe)"
            isAnimationActive={false}
          />
        </LineChart>
      </SafeResponsiveContainer>
    </div>
  );
}
