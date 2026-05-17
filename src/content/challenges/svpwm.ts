import type { SvpwmParams } from '../../simulation/engine/types';
import { calculateSvpwm } from '../../simulation/math/svpwm';
import type { ChallengeDefinition } from './index';

/**
 * SVPWM 挑战：把电压矢量推到 SVPWM 线性区上限附近但不过调制。
 * 复用 calculateSvpwm 的 modulationIndex / saturated。
 */
export const svpwmChallenges: ChallengeDefinition[] = [
  {
    id: 'svpwm-utilization',
    module: 'svpwm',
    title: '逼近线性区上限',
    description:
      '把调制比拉到 [0.95, 0.99] 区间，既榨干母线利用率又不进过调制。',
    difficulty: '入门',
    editableParams: ['uAlpha', 'uBeta', 'uDc', 'electricalDeg', 'modulation'],
    target: { metric: '调制比 m', comparator: 'between', value: [0.95, 0.99], unit: '' },
    evaluator: (ctx) => {
      const p = ctx.params as unknown as SvpwmParams;
      const r = calculateSvpwm({ uAlpha: p.uAlpha, uBeta: p.uBeta, uDc: p.uDc });
      const m = r.modulationIndex;
      const passed = m >= 0.95 && m <= 0.99 && !r.saturated;
      return { current: m, passed };
    },
    hint: '极坐标面板把"调制比"滑到 0.97 附近；m = √3·|V|/Udc，超过 1 即进入过调制。',
    solutionExplain:
      'SVPWM 线性区上限 m=1（对应 |V|=Udc/√3）。比 SPWM 的 0.866 利用率高 15%，是 SVPWM 被 99% 现代变频器选用的核心原因。',
  },
];
