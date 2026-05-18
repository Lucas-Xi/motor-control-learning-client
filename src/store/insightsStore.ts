import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModuleId } from '../simulation/engine/types';

/**
 * 学习洞察 store —— 错题本 / 步骤回看热力图 / 挑战尝试历史。
 *
 * 与 useProgressStore / useChallengeStore 平行：那两个分别记"模块访问 + walkthrough
 * 步号"和"挑战通关结果"，本 store 专门记**学习痛点信号**：
 *
 *  - quizMistakes：每次答错（同一题反复答错累加），用于错题本面板
 *  - stepRevisits：用户多次进入同一 walkthrough 步骤的计数，用于热力图
 *  - challengeAttempts：每次"标记一次尝试"时的参数快照 + 是否通过，最多保留 30 条 / 题
 *
 * 隐私：所有数据只走 localStorage 本地 persist，不传任何外部。
 */

export interface QuizMistakeRecord {
  /** 模块 id（窄化为 string 而非 ModuleId，方便老数据 / 实验性 stepId 兼容） */
  moduleId: string;
  /** walkthrough step id 或自定义题组上下文 id；多题组场景用作分组键 */
  stepId: string;
  /** 题目 id（同一 step 内多道题用题号区分） */
  quizId: string;
  /** 用户选的选项索引（0-3） */
  chosen: number;
  /** 正确答案索引 */
  correct: number;
  /** 时间戳 */
  ts: number;
  /** 累计错过的次数（同一 moduleId.stepId.quizId 第二次错会 +1，而不是新增条目） */
  count: number;
  /** 题面快照（便于错题本面板显示，无需再 import walkthrough） */
  q?: string;
  /** 选项快照（A/B/C/D） */
  options?: string[];
  /** 解析提示 */
  hint?: string;
}

export interface ChallengeAttemptRecord {
  ts: number;
  /** 当时参数快照（任意 JSON 可序列化对象，避免在面板侧再去推断结构） */
  params: Record<string, unknown>;
  /** 该次尝试是否达标 */
  passed: boolean;
  /** 评估当时的指标值（可选，便于趋势对比） */
  currentValue?: number;
}

interface InsightsState {
  /** key = `${moduleId}.${stepId}.${quizId}` */
  quizMistakes: Record<string, QuizMistakeRecord>;
  /** key = `${moduleId}.${stepId}` */
  stepRevisits: Record<string, number>;
  /** key = challengeId；每题最多保留最近 30 条尝试记录 */
  challengeAttempts: Record<string, ChallengeAttemptRecord[]>;

  /** 答题（仅对答错走入本 store；不影响 useProgressStore 的 quizCorrect/Total 总计） */
  recordQuizAnswer: (input: {
    moduleId: string;
    stepId: string;
    quizId: string;
    chosen: number;
    correct: number;
    q?: string;
    options?: string[];
    hint?: string;
  }) => void;
  /** 第二次（及以后）进入同一 stepId 时调；首次进入不计 */
  recordStepRevisit: (moduleId: string, stepId: string) => void;
  /** 每次"标记一次尝试"调一次；按 ringbuffer 截断到 30 */
  recordChallengeAttempt: (challengeId: string, attempt: ChallengeAttemptRecord) => void;
  /** 错题本面板"我懂了"按钮 */
  dismissMistake: (moduleId: string, stepId: string, quizId: string) => void;
  /** 清空全部洞察数据（调试 / 隐私重置） */
  clearAll: () => void;
}

/** localStorage key —— 与 progress / challenge 区分；版本字段交给 zustand persist 管 */
const STORAGE_KEY = 'compressor-bench-insights';

/** 每题挑战尝试历史上限：超出按 FIFO 截断 */
const MAX_ATTEMPTS_PER_CHALLENGE = 30;

function mistakeKey(moduleId: string, stepId: string, quizId: string): string {
  return `${moduleId}.${stepId}.${quizId}`;
}
function stepKey(moduleId: string, stepId: string): string {
  return `${moduleId}.${stepId}`;
}

export const useInsightsStore = create<InsightsState>()(
  persist(
    (set) => ({
      quizMistakes: {},
      stepRevisits: {},
      challengeAttempts: {},

      recordQuizAnswer: (input) =>
        set((state) => {
          // 仅记录答错。答对意味着学员已掌握，不必入错题本（useProgressStore 已经累计正确数）。
          if (input.chosen === input.correct) return state;
          const key = mistakeKey(input.moduleId, input.stepId, input.quizId);
          const prev = state.quizMistakes[key];
          const next: QuizMistakeRecord = {
            moduleId: input.moduleId,
            stepId: input.stepId,
            quizId: input.quizId,
            chosen: input.chosen,
            correct: input.correct,
            ts: Date.now(),
            count: (prev?.count ?? 0) + 1,
            q: input.q ?? prev?.q,
            options: input.options ?? prev?.options,
            hint: input.hint ?? prev?.hint,
          };
          return { quizMistakes: { ...state.quizMistakes, [key]: next } };
        }),

      recordStepRevisit: (moduleId, stepId) =>
        set((state) => {
          const key = stepKey(moduleId, stepId);
          const prev = state.stepRevisits[key] ?? 0;
          return { stepRevisits: { ...state.stepRevisits, [key]: prev + 1 } };
        }),

      recordChallengeAttempt: (challengeId, attempt) =>
        set((state) => {
          const prev = state.challengeAttempts[challengeId] ?? [];
          const merged = [...prev, attempt];
          // FIFO 截断到 MAX_ATTEMPTS_PER_CHALLENGE 条，避免 localStorage 无限增长
          const trimmed = merged.length > MAX_ATTEMPTS_PER_CHALLENGE
            ? merged.slice(merged.length - MAX_ATTEMPTS_PER_CHALLENGE)
            : merged;
          return {
            challengeAttempts: {
              ...state.challengeAttempts,
              [challengeId]: trimmed,
            },
          };
        }),

      dismissMistake: (moduleId, stepId, quizId) =>
        set((state) => {
          const key = mistakeKey(moduleId, stepId, quizId);
          if (!(key in state.quizMistakes)) return state;
          const next = { ...state.quizMistakes };
          delete next[key];
          return { quizMistakes: next };
        }),

      clearAll: () => set({ quizMistakes: {}, stepRevisits: {}, challengeAttempts: {} }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        quizMistakes: state.quizMistakes,
        stepRevisits: state.stepRevisits,
        challengeAttempts: state.challengeAttempts,
      }),
    },
  ),
);

// ---------------- 选择器 / 派生计算 ----------------

/**
 * 弱项打分公式（数值越大越弱）：
 *
 *   weakness(m) = 3 × mistakeCount(m)             // 答错占主导：直接证据
 *               + 1 × Σ revisits(m, *)             // 反复回看次要：可能只是兴趣
 *               + 4 × challengeFailures(m)         // 挑战未通过的尝试占重：综合应用失败
 *
 * 权重选择理由：
 *  - mistakeCount × 3：每错一道题已经是明确的"概念没掌握"信号，权重比 revisit 高 3 倍。
 *  - revisits × 1：仅作辅助；勤奋复盘者也会高 revisit，单独不应判弱。
 *  - challengeFailures × 4：挑战需要综合调参 → 失败说明工程感不够，最强信号。
 *
 * 注意：挑战归属哪个模块靠 challengeId 前缀匹配（约定 challenges/<moduleId>.ts 定义里
 * id 通常以 moduleId-* 开头）；若约定不成立，返回的 weakTopics 只会少计该挑战，不会错位。
 */
export interface WeaknessScore {
  moduleId: string;
  mistakeCount: number;
  revisitCount: number;
  challengeFailures: number;
  score: number;
}

const WEIGHT_MISTAKE = 3;
const WEIGHT_REVISIT = 1;
const WEIGHT_CHALLENGE_FAIL = 4;

/** 从 challengeId 推测 moduleId：约定 challenges/<moduleId>.ts 内 id 以 moduleId-* 开头。
 * 实际识别用反向最长匹配：把已知 moduleIds 排序后看 challengeId 哪个前缀匹配。 */
function inferModuleIdFromChallengeId(
  challengeId: string,
  knownModuleIds: readonly string[],
): string | null {
  // 长前缀优先，避免 'foc' 错配到 'foc-flow' 与 'foc-something' 的冲突
  const sorted = [...knownModuleIds].sort((a, b) => b.length - a.length);
  for (const id of sorted) {
    if (challengeId === id || challengeId.startsWith(`${id}-`) || challengeId.startsWith(`${id}_`) || challengeId.startsWith(id)) {
      // startsWith(id) 兜底，但只在前面"完整 id + 分隔符"未命中时才接受
      if (challengeId === id) return id;
      const rest = challengeId.slice(id.length);
      if (rest.startsWith('-') || rest.startsWith('_') || rest.startsWith('.')) return id;
    }
  }
  return null;
}

export function computeWeaknessScores(
  state: Pick<InsightsState, 'quizMistakes' | 'stepRevisits' | 'challengeAttempts'>,
  knownModuleIds: readonly string[],
): WeaknessScore[] {
  const acc: Record<string, WeaknessScore> = {};
  const ensure = (m: string): WeaknessScore => {
    if (!acc[m]) {
      acc[m] = { moduleId: m, mistakeCount: 0, revisitCount: 0, challengeFailures: 0, score: 0 };
    }
    return acc[m];
  };

  // 错题：count 是同一题反复答错的次数，越大说明越不会
  for (const rec of Object.values(state.quizMistakes)) {
    ensure(rec.moduleId).mistakeCount += rec.count;
  }

  // step 回看：所有步骤回看次数汇总到 moduleId
  for (const [key, n] of Object.entries(state.stepRevisits)) {
    const dot = key.indexOf('.');
    if (dot <= 0) continue;
    const m = key.slice(0, dot);
    ensure(m).revisitCount += n;
  }

  // 挑战失败：每条 attempt 中 passed=false 计入
  for (const [challengeId, attempts] of Object.entries(state.challengeAttempts)) {
    const m = inferModuleIdFromChallengeId(challengeId, knownModuleIds);
    if (!m) continue;
    const fails = attempts.reduce((acc2, a) => acc2 + (a.passed ? 0 : 1), 0);
    if (fails > 0) ensure(m).challengeFailures += fails;
  }

  for (const v of Object.values(acc)) {
    v.score =
      WEIGHT_MISTAKE * v.mistakeCount +
      WEIGHT_REVISIT * v.revisitCount +
      WEIGHT_CHALLENGE_FAIL * v.challengeFailures;
  }

  // 仅返回 score > 0 的；按 score 倒排
  return Object.values(acc)
    .filter((v) => v.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** 选择器辅助：返回前 N 个弱项 moduleId */
export function getWeakTopics(
  state: Pick<InsightsState, 'quizMistakes' | 'stepRevisits' | 'challengeAttempts'>,
  knownModuleIds: readonly string[],
  n: number,
): string[] {
  return computeWeaknessScores(state, knownModuleIds).slice(0, n).map((w) => w.moduleId);
}

/** 错题本汇总统计 */
export function summarizeMistakes(
  quizMistakes: Record<string, QuizMistakeRecord>,
): { totalMistakes: number; modules: number } {
  const list = Object.values(quizMistakes);
  const modules = new Set(list.map((r) => r.moduleId));
  return { totalMistakes: list.length, modules: modules.size };
}

/** 类型导出便于消费 */
export type { ModuleId };
