import { type ChallengeDefinition } from './index';

const faultsChallenges: ChallengeDefinition[] = [
  {
    id: 'faults-phase-loss',
    module: 'faults-debugging',
    title: '缺相识别',
    description: '选择缺相故障，观察电流波形特征',
    difficulty: '入门',
    editableParams: ['faultType'],
    target: { metric: '故障类型', comparator: '>=', value: 1, unit: '' },
    evaluator: (ctx) => {
      const ft = ctx.params.faultType as string;
      return { current: ft === 'phase-loss' ? 1 : 0, passed: ft === 'phase-loss' };
    },
    hint: '从故障类型下拉菜单中选择 "phase-loss"（缺相）',
    solutionExplain: '缺相时一相电流归零，三相不再对称，KCL 在另外两相之间闭合',
  },
  {
    id: 'faults-overcurrent',
    module: 'faults-debugging',
    title: '过电流保护',
    description: '选择过电流故障，波形峰值应超过 8A',
    difficulty: '进阶',
    editableParams: ['faultType'],
    target: { metric: '故障类型', comparator: '>=', value: 1, unit: '' },
    evaluator: (ctx) => {
      const ft = ctx.params.faultType as string;
      return { current: ft === 'over-current' ? 1 : 0, passed: ft === 'over-current' };
    },
    hint: '从故障类型下拉菜单中选择 "over-current"',
    solutionExplain: '过电流故障时电流幅值成倍增加，超过正常运行的 2-3 倍',
  },
];

export { faultsChallenges };