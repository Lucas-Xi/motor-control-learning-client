import { type ChallengeDefinition } from './index';

const clarkeChallenges: ChallengeDefinition[] = [
  {
    id: 'clarke-balanced',
    module: 'clarke-transform',
    title: 'Clark 变换验证',
    description: '输入平衡三相电流（Ia=4, Ib=-2, Ic=-2）确认变换结果',
    difficulty: '入门',
    editableParams: ['ia', 'ib', 'ic'],
    target: { metric: 'Ia', comparator: 'between', value: [3.9, 4.1], unit: 'A' },
    evaluator: (ctx) => {
      const ia = (ctx.params.ia as number) ?? 0;
      return { current: ia, passed: ia >= 3.9 && ia <= 4.1 };
    },
    hint: '保持 Ia=4, Ib=-2, Ic=-2 即可通过',
    solutionExplain: '平衡三相下 Clark 变换的 α = Ia（幅值不变），β = (Ia+2Ib)/√3',
  },
  {
    id: 'clarke-unbalanced',
    module: 'clarke-transform',
    title: '零序检测',
    description: '制造不平衡让零序电流非零',
    difficulty: '进阶',
    editableParams: ['ia', 'ib', 'ic'],
    target: { metric: '零序', comparator: '>', value: 0.01, unit: 'A' },
    evaluator: (ctx) => {
      const ia = (ctx.params.ia as number) ?? 0;
      const ib = (ctx.params.ib as number) ?? 0;
      const ic = (ctx.params.ic as number) ?? 0;
      const zero = Math.abs(ia + ib + ic);
      return { current: zero, passed: zero > 0.01 };
    },
    hint: '让 Ia+Ib+Ic ≠ 0，例如 Ia=5, Ib=-1, Ic=-3',
    solutionExplain: '不平衡时 Ia+Ib+Ic ≠ 0，零序电流在变换时被忽略',
  },
];

export { clarkeChallenges };