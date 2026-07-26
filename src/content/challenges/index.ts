import type { ModuleId } from '../../simulation/engine/types';
import { pidChallenges } from './pid-control';
import { focChallenges } from './foc-flow';
import { svpwmChallenges } from './svpwm';
import { sensorlessChallenges } from './sensorless-foc';
import { fieldWeakeningChallenges } from './field-weakening';
import { startupChallenges } from './startup-statemachine';
import { refrigerationChallenges } from './refrigeration-bench';
import { motorBasicsChallenges } from './motor-basics';
import { threePhaseChallenges } from './three-phase';
import { clarkeChallenges } from './clarke-transform';
import { parkChallenges } from './park-transform';
import { inverterChallenges } from './inverter';
import { controlLoopsChallenges } from './control-loops';
import { faultsChallenges } from './faults-debugging';
import { hfiChallenges } from './hfi-sensorless';
import { apfChallenges } from './apf-frontend';

/**
 * 实验挑战（Lab Challenge）系统
 *
 * 设计目标：把"理解概念 → 通关验证"做成统一格式的小关卡。
 * 每道挑战定义：
 *   - 一个明确指标（metric）与比较器（comparator + value）
 *   - 允许玩家调的参数白名单（editableParams，必须在该模块 store slice 上真实存在）
 *   - 纯函数 evaluator：输入当前仿真状态 → 返回当前 metric 值与是否通过
 *
 * 玩家从 `ChallengePanel`（模块内部）选题，按提示调右侧参数面板里的滑块；
 * `evaluator` 实时跑分，通关后由 `useChallengeStore.recordResult` 写入持久化记录。
 *
 * 与 useSimulationStore 完全解耦：挑战只读 store 切片，不写。
 */

export type ChallengeDifficulty = '入门' | '进阶' | '硬核';
export type ChallengeComparator = '<' | '<=' | '>' | '>=' | 'between';

export interface ChallengeTarget {
  /** 中文指标短名，UI 展示用，例 "Iq 超调"、"COP"、"启动时间" */
  metric: string;
  comparator: ChallengeComparator;
  value: number | [number, number];
  unit: string;
}

/**
 * EvaluatorContext 是一个最小化的 store 快照投影。
 * 我们不让 evaluator 直接访问完整 store——只暴露它真正可能用到的切片，
 * 让每道题的依赖一目了然，也方便单测构造假数据。
 */
export interface EvaluatorContext {
  /** 当前模块的 store slice（已按 module → sliceKey 取好） */
  params: Record<string, unknown>;
  /** 额外的共享 motor 参数（极对数 / 磁链等，大多数控制类题用得到） */
  motor: Record<string, number>;
}

export interface ChallengeEvaluationResult {
  current: number;
  passed: boolean;
}

export interface ChallengeDefinition {
  id: string;
  module: ModuleId;
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
  /** 该挑战允许玩家调的参数 key（必须在 module 的 store slice 上真实存在） */
  editableParams: string[];
  target: ChallengeTarget;
  /** 评估器纯函数；ctx.params 已按 module 取好对应 slice */
  evaluator: (ctx: EvaluatorContext) => ChallengeEvaluationResult;
  hint: string;
  solutionExplain: string;
}

export const allChallenges: ChallengeDefinition[] = [
  ...pidChallenges,
  ...focChallenges,
  ...svpwmChallenges,
  ...sensorlessChallenges,
  ...fieldWeakeningChallenges,
  ...startupChallenges,
  ...refrigerationChallenges,
  ...motorBasicsChallenges,
  ...threePhaseChallenges,
  ...clarkeChallenges,
  ...parkChallenges,
  ...inverterChallenges,
  ...controlLoopsChallenges,
  ...faultsChallenges,
  ...hfiChallenges,
  ...apfChallenges,
];

/** 按 module 索引（一个模块可能多道题） */
export const challengesByModule = (() => {
  const map: Partial<Record<ModuleId, ChallengeDefinition[]>> = {};
  for (const c of allChallenges) {
    (map[c.module] ??= []).push(c);
  }
  return map;
})();

/** 返回某模块所有题目；无题返回空数组（hooks 用稳定空数组避免不必要重渲） */
const EMPTY: ChallengeDefinition[] = Object.freeze([] as ChallengeDefinition[]) as ChallengeDefinition[];
export function getChallengesFor(moduleId: ModuleId): ChallengeDefinition[] {
  return challengesByModule[moduleId] ?? EMPTY;
}

/** 评估器复用工具：根据 comparator 判断 current 是否通过 target */
export function checkComparator(
  current: number,
  comparator: ChallengeComparator,
  value: number | [number, number],
): boolean {
  if (comparator === 'between') {
    if (!Array.isArray(value)) return false;
    const [lo, hi] = value;
    return current >= lo && current <= hi;
  }
  if (Array.isArray(value)) return false;
  switch (comparator) {
    case '<': return current < value;
    case '<=': return current <= value;
    case '>': return current > value;
    case '>=': return current >= value;
  }
  return false;
}

/** 把 target 格式化成"目标：x < 5%"那种文案 */
export function formatTarget(target: ChallengeTarget): string {
  const symMap: Record<ChallengeComparator, string> = {
    '<': '<', '<=': '≤', '>': '>', '>=': '≥', 'between': '∈',
  };
  if (target.comparator === 'between' && Array.isArray(target.value)) {
    return `${target.metric} ∈ [${target.value[0]}, ${target.value[1]}] ${target.unit}`.trim();
  }
  return `${target.metric} ${symMap[target.comparator]} ${target.value}${target.unit ? ' ' + target.unit : ''}`.trim();
}
