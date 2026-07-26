import { type ChallengeDefinition } from './index';

const threePhaseChallenges: ChallengeDefinition[] = [
  {
    id: 'three-phase-balance',
    module: 'three-phase',
    title: '三相平衡',
    description: '调节幅度和相位让三相完全对称（平衡度=1）',
    difficulty: '入门',
    editableParams: ['balance'],
    target: { metric: '平衡度', comparator: '>=', value: 0.99, unit: '' },
    evaluator: (ctx) => {
      const balance = (ctx.params.balance as number) ?? 1;
      return { current: balance, passed: balance >= 0.99 };
    },
    hint: '平衡度滑块拉到 1.0 即可使三相完全对称',
    solutionExplain: '平衡度设置为 1.0 时三相电流幅值相等、相位差 120°',
  },
  {
    id: 'three-phase-harmonic',
    module: 'three-phase',
    title: '谐波失真',
    description: '添加 5 次谐波观察波形失真',
    difficulty: '进阶',
    editableParams: ['harmonic'],
    target: { metric: '谐波含量', comparator: '>=', value: 0.2, unit: '倍' },
    evaluator: (ctx) => {
      const h = (ctx.params.harmonic as number) ?? 0;
      return { current: h, passed: h >= 0.2 };
    },
    hint: '增加谐波滑块 > 0.2 即可看到明显的波形失真',
    solutionExplain: '谐波含量设为 0.2 以上时，电流波形明显偏离正弦，THD 增大',
  },
];

export { threePhaseChallenges };