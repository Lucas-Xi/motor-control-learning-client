import { CartesianGrid, ComposedChart, Legend, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { DeadTimeSample } from '../../simulation/math/deadTimeDistortion';
import { formatNumber } from '../../utils/format';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';

interface DeadTimeWaveformProps {
  samples: DeadTimeSample[];
  /** 平均误差电压 V，仅展示 */
  avgErrorV: number;
  /** 误差占额定相电压百分比 */
  errorPercent: number;
}

/**
 * 三相电压「理想 vs 实际含死区」对比波形。
 * 虚线 = 理想方波，实线 = 受死区调制后的实际电压。同色配对，便于眼睛聚焦差异。
 */
export function DeadTimeWaveform({ samples, avgErrorV, errorPercent }: DeadTimeWaveformProps) {
  return (
    <div>
      {/* 顶部 metric 行 —— 颜色 + 形状 + sr-only 三通道（色盲/打印友好） */}
      <div className="mb-2 grid grid-cols-2 gap-2 text-caption">
        {(() => {
          const status = Math.abs(avgErrorV) < 1 ? 'measure' : Math.abs(avgErrorV) < 3 ? 'warn' : 'fault';
          const cls = status === 'measure' ? 'text-accent-measure' : status === 'warn' ? 'text-accent-warn' : 'text-accent-fault';
          const Icon = status === 'measure' ? CheckCircle2 : status === 'warn' ? AlertTriangle : AlertOctagon;
          const sr = status === 'measure' ? '正常' : status === 'warn' ? '偏大' : '严重';
          return (
            <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
              <div className="text-ink-muted">平均误差电压 ΔV</div>
              <div className={`flex items-center gap-1 font-mono ${cls}`}>
                <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="sr-only">{sr}：</span>
                {formatNumber(avgErrorV, 2)} V
              </div>
            </div>
          );
        })()}
        {(() => {
          const status = Math.abs(errorPercent) < 1 ? 'measure' : Math.abs(errorPercent) < 3 ? 'warn' : 'fault';
          const cls = status === 'measure' ? 'text-accent-measure' : status === 'warn' ? 'text-accent-warn' : 'text-accent-fault';
          const Icon = status === 'measure' ? CheckCircle2 : status === 'warn' ? AlertTriangle : AlertOctagon;
          const sr = status === 'measure' ? '正常' : status === 'warn' ? '偏大' : '严重';
          return (
            <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
              <div className="text-ink-muted">占额定 |ΔV/Udc|</div>
              <div className={`flex items-center gap-1 font-mono ${cls}`}>
                <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="sr-only">{sr}：</span>
                {formatNumber(errorPercent, 2)} %
              </div>
            </div>
          );
        })()}
      </div>

      <div className="h-56">
        <SafeResponsiveContainer>
          <ComposedChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              tickFormatter={(v) => `${Number(v).toFixed(2)}`}
              label={{ value: 't (ms)', position: 'insideBottomRight', fill: '#9eb5cb', fontSize: 10 }}
            />
            <YAxis
              tick={{ fill: '#9eb5cb', fontSize: 10 }}
              label={{ value: 'V', angle: -90, position: 'insideLeft', fill: '#9eb5cb', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 8,
                color: '#e7f3ff',
                fontSize: 11,
              }}
              labelFormatter={(v) => `t = ${Number(v).toFixed(3)} ms`}
              formatter={(value) => `${formatNumber(Number(value), 1)} V`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />

            {/* 理想三相 - 虚线 */}
            <Line
              type="stepAfter"
              dataKey="vaIdeal"
              stroke="#34d6ff"
              strokeWidth={1.1}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
              name="Va 理想"
            />
            <Line
              type="stepAfter"
              dataKey="vbIdeal"
              stroke="#43f7b5"
              strokeWidth={1.1}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
              name="Vb 理想"
            />
            <Line
              type="stepAfter"
              dataKey="vcIdeal"
              stroke="#ffb84d"
              strokeWidth={1.1}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
              name="Vc 理想"
            />

            {/* 含死区实际三相 - 实线 */}
            <Line
              type="stepAfter"
              dataKey="vaReal"
              stroke="#34d6ff"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
              name="Va 实际"
            />
            <Line
              type="stepAfter"
              dataKey="vbReal"
              stroke="#43f7b5"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
              name="Vb 实际"
            />
            <Line
              type="stepAfter"
              dataKey="vcReal"
              stroke="#ffb84d"
              strokeWidth={1.8}
              dot={false}
              isAnimationActive={false}
              name="Vc 实际"
            />
          </ComposedChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}
