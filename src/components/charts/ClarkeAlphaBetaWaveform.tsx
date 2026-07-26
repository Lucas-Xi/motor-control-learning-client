import { useMemo } from 'react';
import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { generateThreePhaseCurrent, clarkeTransform } from '../../simulation/math/transforms';
import type { ThreePhaseParams, ClarkeParams } from '../../simulation/engine/types';
import { SafeResponsiveContainer } from './SafeResponsiveContainer';

interface Props {
  clarke: ClarkeParams;
  threePhase: ThreePhaseParams;
  /** 当前仿真时间（ms），驱动波形左滑 */
  cursorMs?: number;
}

/**
 * Clarke 变换波形叠加：同时显示 abc 三相（虚线）和 αβ 两相（实线），
 * 让学员直观看到 Clark 变换如何在保持幅值的前提下将 3 相 → 2 相。
 */
export function ClarkeAlphaBetaWaveform({ clarke, threePhase, cursorMs = 0 }: Props) {
  const windowMs = Math.max(30, Math.min(200, (4 * 1000) / Math.max(1, threePhase.frequency)));
  const points = 160;

  const data = useMemo(() => {
    const out: Array<{
      t: number;
      ia: number; ib: number; ic: number;
      alpha: number; beta: number;
    }> = [];
    const tNowSec = cursorMs / 1000;
    const tStartSec = tNowSec - windowMs / 1000;
    for (let i = 0; i < points; i++) {
      const tAbs = tStartSec + (i / (points - 1)) * (windowMs / 1000);
      const abc = generateThreePhaseCurrent({
        amplitude: threePhase.amplitude,
        frequency: threePhase.frequency,
        phaseDeg: threePhase.phaseDeg,
        balance: threePhase.balance,
        harmonic: threePhase.harmonic,
        noise: threePhase.noise,
        time: tAbs,
      });
      // 用 clarke 参数中的 ia/ib/ic 或 generator 的结果
      const ab = clarkeTransform({
        ia: clarke.ia ?? abc.ia,
        ib: clarke.ib ?? abc.ib,
        ic: clarke.ic ?? abc.ic,
      });
      out.push({ t: tAbs * 1000, ia: abc.ia, ib: abc.ib, ic: abc.ic, alpha: ab.alpha, beta: ab.beta });
    }
    return out;
  }, [clarke.ia, clarke.ib, clarke.ic, threePhase, cursorMs, windowMs]);

  return (
    <div className="h-52">
      <SafeResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(148, 210, 255, 0.1)" strokeDasharray="3 6" />
          <XAxis dataKey="t" tick={{ fill: '#8fb7c9', fontSize: 10 }} />
          <YAxis tick={{ fill: '#8fb7c9', fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: '#07111f',
              border: '1px solid rgba(52,214,255,.35)',
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <ReferenceLine y={0} stroke="rgba(148,210,255,0.25)" strokeDasharray="4 4" />

          {/* abc 三相 — 虚线 */}
          <Line type="monotone" dataKey="ia" stroke="#34d6ff" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} name="Ia" />
          <Line type="monotone" dataKey="ib" stroke="#43f7b5" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} name="Ib" />
          <Line type="monotone" dataKey="ic" stroke="#ffb84d" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} name="Ic" />

          {/* αβ 两相 — 实线 */}
          <Line type="monotone" dataKey="alpha" stroke="#a78bfa" strokeWidth={2.5} dot={false} isAnimationActive={false} name="Iα" />
          <Line type="monotone" dataKey="beta" stroke="#f472b6" strokeWidth={2.5} dot={false} isAnimationActive={false} name="Iβ" />
        </LineChart>
      </SafeResponsiveContainer>
    </div>
  );
}