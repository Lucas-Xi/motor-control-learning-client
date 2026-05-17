import type { WeakFieldParams } from '../../simulation/engine/types';
import { checkVoltageLimit } from '../../simulation/math/weakField';
import type { ChallengeDefinition } from './index';

/**
 * 弱磁挑战：在高转速 + 较小母线下，通过注入合适的负 Id 让工作点回到电压椭圆里。
 * 评估：电压不饱和 + Iq 不超额定 90% + 当前转速 ≥ 阈值。
 */
function evalFieldWeak(p: WeakFieldParams) {
  const ld = p.ldMh / 1000;
  const lq = p.lqMh / 1000;
  // 4 极对（沿用 weakField 模块固定值）
  const omega = ((p.targetRpm * 2 * Math.PI) / 60) * 4;
  const vd = 0.55 * p.id - omega * lq * p.iq;
  const vq = 0.55 * p.iq + omega * (ld * p.id + p.flux);
  const voltage = checkVoltageLimit({ vd, vq, uDc: p.uDc, margin: p.voltageMargin });
  const currentMag = Math.hypot(p.id, p.iq);
  return { voltage, currentMag };
}

export const fieldWeakeningChallenges: ChallengeDefinition[] = [
  {
    id: 'field-weak-7200',
    module: 'field-weakening',
    title: '7200 rpm 弱磁不饱和',
    description:
      '在 Udc = 310 V 下把目标转速 7200 rpm 跑起来：电压不能饱和；|Iq| 不得超过额定电流的 90%（10.8 A）。',
    difficulty: '硬核',
    editableParams: ['id', 'iq', 'targetRpm', 'voltageMargin', 'uDc'],
    target: { metric: '电压余量', comparator: '>=', value: 0, unit: 'V' },
    evaluator: (ctx) => {
      const p = ctx.params as unknown as WeakFieldParams;
      if (p.targetRpm < 7200) {
        return { current: -1, passed: false };
      }
      const { voltage, currentMag } = evalFieldWeak(p);
      // 三个硬条件：未饱和 + Iq ≤ 10.8A + 转速 ≥ 7200rpm（电流幅值不超 12A 也间接约束）
      const passed = !voltage.saturated && Math.abs(p.iq) <= 10.8 && currentMag <= 12;
      return { current: voltage.reserve, passed };
    },
    hint: '电压椭圆在高速时缩成扁条，工作点必须沿 -Id 方向往里移；先把 Id 推到 -4 ~ -6 A 之间，再微调 Iq 维持转矩。',
    solutionExplain:
      '负 Id 抵消一部分永磁磁链 ψf，让 vq = ω(Ld·Id + ψf) + R·Iq 不再线性增长 —— 这就是弱磁能突破基速的物理本质。变频空调 80% 工况在弱磁区。',
  },
];
