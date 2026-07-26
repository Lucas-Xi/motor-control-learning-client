import { type ChallengeDefinition } from './index';

const controlLoopsChallenges: ChallengeDefinition[] = [
  {
    id: 'control-loops-speed-gain',
    module: 'control-loops',
    title: '速度环增益',
    description: '调节速度控制器参数至合理范围',
    difficulty: '入门',
    editableParams: ['speedKp'],
    target: { metric: '速度 Kp', comparator: 'between', value: [0.3, 3], unit: '' },
    evaluator: (ctx) => {
      const kp = (ctx.params.speedKp as number) ?? 0;
      return { current: kp, passed: kp >= 0.3 && kp <= 3 };
    },
    hint: 'Kp 太小响应慢，太大会振荡。0.5-2 比较合适',
    solutionExplain: '速度环 Kp 决定带宽，过大引起机械谐振，过小无法跟踪目标速度',
  },
  {
    id: 'control-loops-inertia',
    module: 'control-loops',
    title: '转动惯量影响',
    description: '调大转动惯量观察速度响应变慢',
    difficulty: '进阶',
    editableParams: ['inertia'],
    target: { metric: '惯量', comparator: '>=', value: 200, unit: '' },
    evaluator: (ctx) => {
      const j = (ctx.params.inertia as number) ?? 0;
      return { current: j, passed: j >= 200 };
    },
    hint: '惯量增大后加速度减小，速度响应变慢',
    solutionExplain: 'Jl 越大机电时间常数 τm = Jl/B 越大，速度环带宽降低',
  },
];

export { controlLoopsChallenges };