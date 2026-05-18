import { useMemo, useState } from 'react';
import { Line, LineChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { simulatePfcCycle, type BoostPfcResult } from '../../simulation/math/boostPfc';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * 电网电压 / 输入电流（开启 PFC vs 裸整流）/ 母线电压 三通道叠放对比。
 *
 * 这是 APF 模块最直观的一张图：一秒钟就能看到"开关 PFC 让 i_grid 从尖峰
 * 脉冲变成跟着电压同相位的正弦"。
 */

type Mode = 'pfc' | 'noPfc';

export function PfcWaveformCard({ result }: { result: BoostPfcResult }) {
  const apf = useSimulationStore((s) => s.apf);
  const [mode, setMode] = useState<Mode>('pfc');

  // 把多通道合并成单一数据数组喂给 Recharts
  const data = useMemo(() => {
    const N = result.t_ms.length;
    const rows = new Array<Record<string, number>>(N);
    for (let i = 0; i < N; i += 1) {
      rows[i] = {
        t: result.t_ms[i],
        vGrid: result.v_grid[i],
        iGrid: mode === 'pfc' ? result.i_grid_pfc[i] : result.i_grid_no_pfc[i],
        Udc: result.Udc[i],
      };
    }
    return rows;
  }, [result, mode]);

  const thd = mode === 'pfc' ? result.thd : result.thd_no_pfc;
  const pf = mode === 'pfc' ? result.pf : result.pf_no_pfc;
  const thdTone = thd < 10 ? 'measure' : thd < 30 ? 'warn' : 'fault';
  const pfTone = pf > 0.95 ? 'measure' : pf > 0.85 ? 'warn' : 'fault';
  const tone = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={mode === 'pfc' ? 'PFC 双环：i_grid 贴合电网电压' : '无 PFC：尖峰整流电流'}
      eyebrow="grid waveform"
      density="compact"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <FidelityBadge level="simplified" hint="Boost 平均模型（CCM），不仿真 PWM 开关动作；适合看双环控制效果，不适合看 di/dt 纹波" />
          <span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${tone(pfTone)}`}>PF {formatNumber(pf, 3)}</span>
          <span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${tone(thdTone)}`}>THD {formatNumber(thd, 1)}%</span>
        </div>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-line-subtle bg-bg-base p-1 text-caption">
        <button
          type="button"
          onClick={() => setMode('pfc')}
          className={`flex-1 rounded px-3 py-1.5 font-medium transition-colors ${
            mode === 'pfc' ? 'bg-accent-primary/15 text-accent-primary' : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          Boost PFC 双环
        </button>
        <button
          type="button"
          onClick={() => setMode('noPfc')}
          className={`flex-1 rounded px-3 py-1.5 font-medium transition-colors ${
            mode === 'noPfc' ? 'bg-accent-warn/15 text-accent-warn' : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          无 PFC（裸整流 + 大电容）
        </button>
      </div>

      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis yAxisId="v" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <YAxis yAxisId="i" orientation="right" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            <ReferenceLine yAxisId="v" y={0} stroke="#1e2a3d" />
            <Line yAxisId="v" type="monotone" dataKey="vGrid" dot={false} stroke="#34d6ff" strokeWidth={2} name="电网电压 V" isAnimationActive={false} />
            <Line
              yAxisId="i"
              type="monotone"
              dataKey="iGrid"
              dot={false}
              stroke={mode === 'pfc' ? '#43f7b5' : '#ffb84d'}
              strokeWidth={2}
              name={mode === 'pfc' ? '输入电流 A (PFC)' : '输入电流 A (尖峰)'}
              isAnimationActive={false}
            />
            <Line yAxisId="v" type="monotone" dataKey="Udc" dot={false} stroke="#ff5d8a" strokeWidth={1.4} strokeDasharray="4 4" name="母线 Udc V" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {mode === 'pfc' ? (
          <>
            <span className="text-accent-measure">i_grid 跟随电网电压同相位</span>，PF 趋近 1、THD 显著下降；母线 Udc 在 {formatNumber(apf.udcRef, 0)} V 上下小范围波动（100 Hz 母线纹波由 C 决定）。这是符合 IEC 61000-3-2 Class A/D 谐波限值的工业 PFC 行为。
          </>
        ) : (
          <>
            <span className="text-accent-warn">仅在电网峰值附近的尖窄区间从电网取电</span>，i_grid 是典型脉冲，THD 通常 100%+、PF ≈ 0.6。家电不带 PFC 过不了 GB/T 17625.1 谐波认证。
          </>
        )}
      </p>
    </Card>
  );
}
