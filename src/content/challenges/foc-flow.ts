import type { FOCParams } from '../../simulation/engine/types';
import { simulateFocCurrentLoop, evaluateFocLoop } from '../../simulation/math/focLoop';
import type { ChallengeDefinition } from './index';

/**
 * FOC 电流环挑战：在 PMSM dq 一阶模型 + 角度误差 + 采样延迟下，调电流环 PI 把 Iq 跟踪跑漂亮。
 * 使用 evaluateFocLoop 的 iqRiseTimeMs / iqOvershootPct / iqSteadyError / idCrossTalkPeak。
 */
function runFoc(p: FOCParams) {
  const samples = simulateFocCurrentLoop(p);
  return evaluateFocLoop(samples, p.iqRef);
}

export const focChallenges: ChallengeDefinition[] = [
  {
    id: 'foc-fast-iq-tracking',
    module: 'foc-flow',
    title: 'Iq 阶跃 4 ms 内追上',
    description:
      '给定 Iq 阶跃指令（10 A），调电流环 Kp / Ki，让 Iq 在 4 ms 内达到指令值的 90%，且超调 ≤ 10%。',
    difficulty: '进阶',
    editableParams: ['kp', 'ki', 'iqRef'],
    target: { metric: 'Iq 上升时间', comparator: '<=', value: 4, unit: 'ms' },
    evaluator: (ctx) => {
      const m = runFoc(ctx.params as unknown as FOCParams);
      const rise = m.iqRiseTimeMs ?? Infinity;
      const passed = rise <= 4 && m.iqOvershootPct <= 10;
      return { current: Number.isFinite(rise) ? rise : 999, passed };
    },
    hint: '压缩机电流环 PI 带宽 ≈ PWM 频率 / 10（16 kHz → 1.6 kHz）；从 Kp ≈ 1.2、Ki ≈ 180 起步。',
    solutionExplain:
      '电流环带宽决定整机响应上限。Kp 给瞬时电压，Ki 收敛稳态误差。带宽设到 PWM/10 是经验上限：再高，采样延迟与开关噪声会让环路振荡。',
  },
];
