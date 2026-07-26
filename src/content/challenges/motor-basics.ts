import { type ChallengeDefinition } from './index';

const motorBasicsChallenges: ChallengeDefinition[] = [
  {
    id: 'motor-basics-poles',
    module: 'motor-basics',
    title: '极对数与转速',
    description: '调整极对数让电气频率保持在 50 Hz 附近',
    difficulty: '入门',
    editableParams: ['polePairs', 'rpm'],
    target: { metric: '电气频率', comparator: 'between', value: [45, 55], unit: 'Hz' },
    evaluator: (ctx) => {
      const pp = (ctx.params.polePairs as number) ?? 4;
      const rpm = (ctx.params.rpm as number) ?? 1500;
      const freq = (pp * rpm) / 60;
      return { current: freq, passed: freq >= 45 && freq <= 55 };
    },
    hint: '电气频率 = 极对数 × 转速 / 60',
    solutionExplain: '假设目标转速 1500 rpm，选 2 对极则频率 50 Hz；调整滑块使频率落在 45-55 Hz 即可',
  },
  {
    id: 'motor-basics-rated-current',
    module: 'motor-basics',
    title: '磁饱和触发',
    description: '用大电流让磁路进入饱和（Ld/Lq 下降）',
    difficulty: '入门',
    editableParams: ['ratedCurrent'],
    target: { metric: '额定电流', comparator: '>=', value: 18, unit: 'A' },
    evaluator: (ctx) => {
      const rated = (ctx.params.ratedCurrent as number) ?? 8;
      return { current: rated, passed: rated >= 18 };
    },
    hint: '额定电流超过 18 A 后电感开始明显下降',
    solutionExplain: '把额定电流滑块拉到 18 A 以上即可进入饱和区',
  },
];

export { motorBasicsChallenges };