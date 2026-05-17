import type { StartupParams } from '../../simulation/engine/types';
import { simulateStartup } from '../../simulation/math/startup';
import type { ChallengeDefinition } from './index';

/**
 * 启动状态机挑战：调节斜坡 / 对齐时长 / 切换阈值，让 8 秒内顺利进入 BEMF 或 fieldweak 段。
 */
function evalReachTime(p: StartupParams, threshold: number): number {
  const samples = simulateStartup(p);
  for (const s of samples) {
    if (s.rpm >= threshold) return s.t; // 单位 ms
  }
  return Infinity;
}

function reachedFinalState(p: StartupParams): boolean {
  const samples = simulateStartup(p);
  const last = samples[samples.length - 1];
  return last?.state === 'bemf' || last?.state === 'fieldweak';
}

export const startupChallenges: ChallengeDefinition[] = [
  {
    id: 'startup-reach-3000',
    module: 'startup-statemachine',
    title: '3 秒内冲上 3000 rpm',
    description:
      '调对齐 / 斜坡 / 切换阈值，让转速在 3000 ms 内到达 3000 rpm 并稳定进入 BEMF 段。',
    difficulty: '入门',
    editableParams: ['accelRampRpmS', 'alignDurationMs', 'hfiHandoffRpm', 'bemfHandoffRpm', 'targetRpm'],
    target: { metric: '到达 3000 rpm 用时', comparator: '<=', value: 3000, unit: 'ms' },
    evaluator: (ctx) => {
      const p = ctx.params as unknown as StartupParams;
      if (p.targetRpm < 3000) return { current: 99999, passed: false };
      const t = evalReachTime(p, 3000);
      const ok = reachedFinalState(p);
      const passed = t <= 3000 && ok;
      return { current: Number.isFinite(t) ? t : 99999, passed };
    },
    hint: '加速斜坡至少 1200 rpm/s；对齐时长 500–800 ms 即可；BEMF 切入别拉太高否则在 HFI 段卡太久。',
    solutionExplain:
      '加速斜坡受反液击约束（典型 300–1500 rpm/s）。状态切换阈值要踩在 BEMF 信号刚刚足够的位置——太低 BEMF 抖动失锁，太高在 HFI 段浪费时间。',
  },
  {
    id: 'startup-anti-slugging',
    module: 'startup-statemachine',
    title: '反液击柔启动',
    description:
      '加速斜坡必须 ≤ 500 rpm/s（反液击），同时在 8 秒仿真窗内进入 BEMF 段。',
    difficulty: '硬核',
    editableParams: ['accelRampRpmS', 'alignDurationMs', 'hfiHandoffRpm', 'bemfHandoffRpm', 'targetRpm'],
    target: { metric: '加速斜坡上限', comparator: '<=', value: 500, unit: 'rpm/s' },
    evaluator: (ctx) => {
      const p = ctx.params as unknown as StartupParams;
      const slow = p.accelRampRpmS <= 500;
      const ok = reachedFinalState(p);
      const passed = slow && ok;
      return { current: p.accelRampRpmS, passed };
    },
    hint: '斜坡设到 400–500 rpm/s；目标转速降到 2000–3000 rpm 让 8 秒能跑完；BEMF 切入降到 400 rpm 加快收敛。',
    solutionExplain:
      '压缩机液击 = 气缸内液态制冷剂被瞬间压缩导致阀片损坏。慢启动给吸气段足够时间把液冷蒸发掉，是空调长寿命运行的基础。',
  },
];
