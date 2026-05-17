import type { SensorlessParams } from '../../simulation/engine/types';
import { simulateSMO } from '../../simulation/math/smo';
import type { ChallengeDefinition } from './index';

/**
 * 无感观测器挑战：在指定转速下把 SMO+PLL 估角误差压到阈值内。
 * 用 60ms 仿真窗末 25% 的均值（avoid 收敛瞬态）作为稳态指标。
 */
function evalAngleError(params: SensorlessParams, polePairs: number) {
  const samples = simulateSMO({
    speedRpm: params.speedRpm,
    polePairs,
    rs: params.rs,
    lsMh: params.lsMh,
    fluxLinkage: params.ke,
    smoGain: 80,
    boundaryLayer: 0.5,
    lpfCutoffHz: 120,
    pllKp: params.pllKp,
    pllKi: params.pllKi,
    noise: params.noise,
  });
  if (samples.length === 0) return Infinity;
  // 取后 25% 窗口的"绝对误差均值"作为稳态估角精度
  const tail = samples.slice(Math.floor(samples.length * 0.75));
  const meanAbsErr = tail.reduce((acc, s) => acc + Math.abs(s.errorDeg), 0) / tail.length;
  return meanAbsErr;
}

export const sensorlessChallenges: ChallengeDefinition[] = [
  {
    id: 'sensorless-lock-high-speed',
    module: 'sensorless-foc',
    title: '高速锁相误差 < 3°',
    description:
      '把 SMO+PLL 调到能在 1500 rpm 稳态下保持估角误差稳态均值 < 3°（电角度）。',
    difficulty: '进阶',
    editableParams: ['speedRpm', 'pllKp', 'pllKi', 'observerGain', 'noise'],
    target: { metric: '估角稳态误差', comparator: '<', value: 3, unit: '°' },
    evaluator: (ctx) => {
      const p = ctx.params as unknown as SensorlessParams;
      const polePairs = Number(ctx.motor.polePairs ?? 4);
      const err = evalAngleError(p, polePairs);
      return { current: err, passed: err < 3 };
    },
    hint: '转速拉到 1500 rpm 以上让 BEMF 充足；PLL Kp 适中（80–120）避免抖振，Ki 不要砍太低导致相位滞后。',
    solutionExplain:
      '反电动势幅值 ∝ ω。1500 rpm 时 BEMF 信噪比足够 SMO+PLL 收敛到 ±2° 以内。压缩机变频器在 BEMF 区段稳定运行的核心指标。',
  },
];
