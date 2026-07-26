import { type ChallengeDefinition } from './index';

const hfiChallenges: ChallengeDefinition[] = [
  {
    id: 'hfi-saliency',
    module: 'hfi-sensorless',
    title: '凸极比与收敛速度',
    description: '调高凸极比加速 HFI 角度收敛',
    difficulty: '入门',
    editableParams: ['saliencyRatio'],
    target: { metric: '凸极比', comparator: '>=', value: 1.5, unit: '' },
    evaluator: (ctx) => {
      const sr = (ctx.params.saliencyRatio as number) ?? 1;
      return { current: sr, passed: sr >= 1.5 };
    },
    hint: '凸极比拉到 1.5 以上即可',
    solutionExplain: '凸极比越大，HFI 信号强度越大，PLL 收敛越快',
  },
  {
    id: 'hfi-injection-level',
    module: 'hfi-sensorless',
    title: '注入幅值整定',
    description: '在零速下提高注入电压至 40 V 以上确保锁定',
    difficulty: '进阶',
    editableParams: ['injectVoltage'],
    target: { metric: '注入电压', comparator: '>=', value: 40, unit: 'V' },
    evaluator: (ctx) => {
      const v = (ctx.params.injectVoltage as number) ?? 0;
      return { current: v, passed: v >= 40 };
    },
    hint: '注入电压调到 40 V 以上可提高信号噪声比',
    solutionExplain: '注入电压越大，高频电流响应幅值越高，信噪比越好，但会增加损耗和噪音',
  },
];

export { hfiChallenges };