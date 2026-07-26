import { type ChallengeDefinition } from './index';

const parkChallenges: ChallengeDefinition[] = [
  {
    id: 'park-align',
    module: 'park-transform',
    title: 'Park 变换对齐',
    description: '角度 θ=0 让 d 轴与 α 轴对齐',
    difficulty: '入门',
    editableParams: ['thetaDeg', 'iAlpha', 'iBeta'],
    target: { metric: 'q', comparator: '<', value: 0.5, unit: 'A' },
    evaluator: (ctx) => {
      const q = (ctx.params.q as number) ?? 0;
      return { current: Math.abs(q), passed: Math.abs(q) < 0.5 };
    },
    hint: '设 α=3, β=0, θ=0，此时 d=α, q=0',
    solutionExplain: 'θ=0 时 Park 变换即单位矩阵，d=α, q=β，d 轴与 α 轴重合',
  },
  {
    id: 'park-rotation',
    module: 'park-transform',
    title: '旋转变换追踪',
    description: '旋转模式下观察 dq 变为直流量',
    difficulty: '进阶',
    editableParams: ['speedRpm'],
    target: { metric: '转速变化', comparator: '>=', value: 300, unit: 'rpm' },
    evaluator: (ctx) => {
      const rpm = (ctx.params.speedRpm as number) ?? 0;
      return { current: rpm, passed: rpm >= 300 };
    },
    hint: '提高电机转速到 300 rpm 以上',
    solutionExplain: '旋转时 dq 分量变为直流量，转速越高反电动势越大',
  },
];

export { parkChallenges };