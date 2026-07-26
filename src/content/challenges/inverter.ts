import { type ChallengeDefinition } from './index';

const inverterChallenges: ChallengeDefinition[] = [
  {
    id: 'inverter-deadtime-effects',
    module: 'inverter',
    title: '死区时间效应',
    description: '调大死区时间观察电流波形畸变',
    difficulty: '入门',
    editableParams: ['deadTimeUs'],
    target: { metric: '死区时间', comparator: '>=', value: 2, unit: 'μs' },
    evaluator: (ctx) => {
      const dt = (ctx.params.deadTimeUs as number) ?? 0;
      return { current: dt, passed: dt >= 2 };
    },
    hint: '死区时间调到 2 μs 以上',
    solutionExplain: '死区时间越大，输出电压畸变越明显，尤其在过零点附近',
  },
  {
    id: 'inverter-switching-loss',
    module: 'inverter',
    title: '开关频率与损耗',
    description: '提高开关频率观察损耗增加',
    difficulty: '进阶',
    editableParams: ['pwmFrequency'],
    target: { metric: 'PWM 频率', comparator: '>=', value: 12000, unit: 'Hz' },
    evaluator: (ctx) => {
      const freq = (ctx.params.pwmFrequency as number) ?? 4000;
      return { current: freq, passed: freq >= 12000 };
    },
    hint: 'PWM 频率调到 12 kHz 以上',
    solutionExplain: '开关损耗与频率成正比，16 kHz 时损耗约为 4 kHz 的 4 倍',
  },
];

export { inverterChallenges };