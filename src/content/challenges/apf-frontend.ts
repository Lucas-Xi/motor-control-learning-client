import { type ChallengeDefinition } from './index';

const apfChallenges: ChallengeDefinition[] = [
  {
    id: 'apf-boost',
    module: 'apf-frontend',
    title: 'Boost 升压验证',
    description: '设置足够母线电压确保 PFC 正常工作',
    difficulty: '入门',
    editableParams: ['udcRef'],
    target: { metric: '母线电压', comparator: '>=', value: 350, unit: 'V' },
    evaluator: (ctx) => {
      const udc = (ctx.params.udcRef as number) ?? 0;
      return { current: udc, passed: udc >= 350 };
    },
    hint: '母线电压参考值调到 350 V 以上',
    solutionExplain: 'PFC 升压后母线电压需高于输入交流峰值，380 V 是常见设定',
  },
  {
    id: 'apf-inductance',
    module: 'apf-frontend',
    title: 'Boost 电感对纹波的影响',
    description: '增大电感降低电流纹波',
    difficulty: '进阶',
    editableParams: ['boostInductanceMh'],
    target: { metric: '电感量', comparator: '>=', value: 3, unit: 'mH' },
    evaluator: (ctx) => {
      const l = (ctx.params.boostInductanceMh as number) ?? 0;
      return { current: l, passed: l >= 3 };
    },
    hint: '电感调到 3 mH 以上可有效抑制纹波',
    solutionExplain: 'Boost 电感越大，ΔI = V·Δt/L 越小，纹波幅值与电感成反比',
  },
];

export { apfChallenges };