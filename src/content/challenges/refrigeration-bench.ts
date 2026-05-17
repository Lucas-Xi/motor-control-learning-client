import type { RefrigerationParams } from '../../simulation/engine/types';
import { simulateCycle, type CycleInput } from '../../simulation/math/vaporCycle';
import type { ChallengeDefinition } from './index';

/**
 * 制冷台架挑战：通过工况参数（Te / Tc / 过热度 / 过冷度 / EEV 开度 / 等熵效率）拉高 COP 或控住排温。
 * 内联 buildCycleInput，避免拉入 useBenchCycle（含 React hook）的依赖。
 */
function buildInput(refrig: RefrigerationParams, rpm: number): CycleInput {
  return {
    refrigerant: refrig.refrigerant,
    Te: refrig.Te,
    Tc: refrig.Tc,
    superheatK: refrig.superheatK,
    subcoolK: refrig.subcoolK,
    displacementCc: refrig.displacementCc,
    clearanceRatio: refrig.clearanceRatio,
    rpm: rpm > 100 ? rpm : 3000,
    isentropicEff: refrig.isentropicEff,
    eevOpening: refrig.eevOpening,
  };
}
function runCycle(p: RefrigerationParams, rpm = 3000) {
  return simulateCycle(buildInput(p, rpm));
}

export const refrigerationChallenges: ChallengeDefinition[] = [
  {
    id: 'fridge-cop-above-3',
    module: 'refrigeration-bench',
    title: 'COP > 3.5 高效工况',
    description:
      '把工况调到 COP > 3.5，且排气温度 < 95 ℃ —— 真实空调标定室的"高效工况点"。',
    difficulty: '入门',
    editableParams: ['Te', 'Tc', 'superheatK', 'subcoolK', 'eevOpening', 'isentropicEff'],
    target: { metric: 'COP', comparator: '>', value: 3.5, unit: '' },
    evaluator: (ctx) => {
      const r = runCycle(ctx.params as unknown as RefrigerationParams);
      const passed = r.cop > 3.5 && r.Tdischarge < 95;
      return { current: r.cop, passed };
    },
    hint: 'COP 主要受压比 Pd/Ps 影响。把 Te 抬到 10 ℃ 附近、Tc 压到 38 ℃ 附近，过冷度 3–5 K，COP 容易突破 3.5。',
    solutionExplain:
      'COP = Qc / Wcomp。压比越小 (Tc-Te 越小) 单位功越小、COP 越高。过冷度提高使 (h1-h4) 增大，制冷量直接受益。',
  },
  {
    id: 'fridge-discharge-safe',
    module: 'refrigeration-bench',
    title: '极端高温下排温守 110 ℃',
    description:
      '在室外 45 ℃、Tc = 55 ℃ 重载工况下，把排气温度压到 110 ℃ 以内，COP 不低于 2.0。',
    difficulty: '硬核',
    editableParams: ['Te', 'Tc', 'superheatK', 'subcoolK', 'eevOpening', 'isentropicEff'],
    target: { metric: '排气温度', comparator: '<', value: 110, unit: '°C' },
    evaluator: (ctx) => {
      const p = ctx.params as unknown as RefrigerationParams;
      // 锁定极端工况两个硬约束，确保挑战不被"把 Tc 降到 30°C"绕过
      if (p.Tc < 50) return { current: -1, passed: false };
      const r = runCycle(p);
      const passed = r.Tdischarge < 110 && r.cop >= 2.0 && p.Tc >= 50;
      return { current: r.Tdischarge, passed };
    },
    hint: '吸气过热度别拉太高（排气温度跟过热度强正相关）；过冷度尽量做足以维持 COP。',
    solutionExplain:
      '排气温度 T2 ≈ T1 · (Pd/Ps)^((n-1)/n)。压低吸气过热度即压低 T1；过冷度做足可在不抬 Pd 的前提下维持 Qc。R32 在 55 ℃ 冷凝时排温确实容易破 110 ℃，是空调高温保护的真实痛点。',
  },
];
