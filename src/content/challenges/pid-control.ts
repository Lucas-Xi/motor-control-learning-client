import type { PIDParams } from '../../simulation/engine/types';
import { simulatePidStepResponse, calculateStepMetrics } from '../../simulation/math/pid';
import type { ChallengeDefinition } from './index';

/**
 * PID 模块挑战：通过调 Kp / Ki / Kd / antiWindup 达成响应指标。
 * Evaluator 复用了已有的 simulatePidStepResponse + calculateStepMetrics——
 * 与右侧探针卡显示的指标完全一致，避免"右边看到 3% 超调、挑战说没过"的认知裂缝。
 */
function runPid(pid: PIDParams) {
  const data = simulatePidStepResponse(
    { kp: pid.kp, ki: pid.ki, kd: pid.kd },
    pid.target,
    pid.sampleMs / 1000,
    1.2,
    { limit: pid.limit, antiWindup: pid.antiWindup, loadDisturbance: pid.loadDisturbance },
  );
  return calculateStepMetrics(data, pid.target);
}

export const pidChallenges: ChallengeDefinition[] = [
  {
    id: 'pid-fast-no-overshoot',
    module: 'pid-control',
    title: '调出"快而稳"的 PID',
    description:
      '给定一阶电流环被控对象，要求阶跃响应上升时间 ≤ 80 ms，且超调量不超过 8%。',
    difficulty: '入门',
    editableParams: ['kp', 'ki', 'kd'],
    target: { metric: '上升时间', comparator: '<=', value: 80, unit: 'ms' },
    evaluator: (ctx) => {
      const m = runPid(ctx.params as unknown as PIDParams);
      // 复合指标：以上升时间为主，超调超 8% 视为未通过
      const riseMs = m.riseTime === null ? Infinity : m.riseTime * 1000;
      const passed = riseMs <= 80 && m.overshootPercent <= 8;
      return { current: Number.isFinite(riseMs) ? riseMs : 999, passed };
    },
    hint: '先把 Kp 拉到能让响应明显起来，再加 Ki 把稳态误差吃掉；Kd 适度抑制超调即可。',
    solutionExplain:
      'Kp 决定响应速度，Ki 决定稳态误差消除速度，Kd 抑制超调与高频毛刺。压缩机电流环典型整定：Kp ≈ 2、Ki ≈ 18、Kd ≈ 0.02 —— 上升时间 50–80 ms、超调 < 5% 的均衡区间。',
  },
  {
    id: 'pid-antiwindup',
    module: 'pid-control',
    title: '抗积分饱和救场',
    description:
      '输出限幅压到 6 V（小于稳态需求），不开抗积分饱和会出现大超调；要求稳态误差 ≤ 0.05 且超调 ≤ 15%。',
    difficulty: '进阶',
    editableParams: ['kp', 'ki', 'kd', 'antiWindup', 'limit'],
    target: { metric: '超调量', comparator: '<=', value: 15, unit: '%' },
    evaluator: (ctx) => {
      const m = runPid(ctx.params as unknown as PIDParams);
      const passed = m.overshootPercent <= 15 && Math.abs(m.steadyStateError) <= 0.05;
      return { current: m.overshootPercent, passed };
    },
    hint: '提示：当 PI 输出长期撞限幅，积分会持续累积，回到线性区瞬间巨量回吐导致超大超调——打开抗积分饱和。',
    solutionExplain:
      '抗积分饱和（Back-calculation / Clamping）在输出撞限时停止积分累积，恢复线性区时不会有巨量负误差冲击。这是压缩机电流环、APF 电压环的工程标配。',
  },
];
