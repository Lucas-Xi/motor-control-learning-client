import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 实验挑战通关记录 store。
 *
 * 与 useProgressStore / useAssemblyProgressStore 平行：那些分别记录"模块访问/walkthrough"
 * 和"整机搭建挑战"，本 store 专门记 16 模块内嵌的"参数挑战"通关情况。
 *
 * 每道挑战 (challenge.id) 持久化：
 *  - solved：是否曾经达成目标
 *  - attempts：评估器命中次数（按用户在 ChallengePanel 里"开始尝试"次数累计）
 *  - bestValue：通关时记录到的最优指标值（comparator 决定"最优"是 min 还是 max）
 *  - firstPassedAt：首次通关时间戳
 */

export type ComparatorSemantic = 'minimize' | 'maximize';

export interface ChallengeRecord {
  solved: boolean;
  attempts: number;
  bestValue: number | null;
  firstPassedAt: number | null;
}

interface ChallengeState {
  records: Record<string, ChallengeRecord>;
  /** 标记开始一次尝试（用户点击"开始挑战"按钮调用）；attempts +1 */
  incrementAttempts: (challengeId: string) => void;
  /** 评估器结果汇报：仅在 passed=true 时落库 solved + 记 bestValue（按 semantic） */
  recordResult: (
    challengeId: string,
    passed: boolean,
    currentValue: number,
    semantic: ComparatorSemantic,
  ) => void;
  /** 重置全部挑战记录 */
  reset: () => void;
  /** 重置单题 */
  resetOne: (challengeId: string) => void;
}

function emptyRecord(): ChallengeRecord {
  return { solved: false, attempts: 0, bestValue: null, firstPassedAt: null };
}

/** 按 semantic 决定"更好的值"：minimize → 小为佳；maximize → 大为佳 */
function pickBetter(prev: number | null, next: number, semantic: ComparatorSemantic): number {
  if (prev === null || !Number.isFinite(prev)) return next;
  if (!Number.isFinite(next)) return prev;
  return semantic === 'minimize' ? Math.min(prev, next) : Math.max(prev, next);
}

export const useChallengeStore = create<ChallengeState>()(
  persist(
    (set) => ({
      records: {},
      incrementAttempts: (challengeId) =>
        set((state) => {
          const prev = state.records[challengeId] ?? emptyRecord();
          return {
            records: {
              ...state.records,
              [challengeId]: { ...prev, attempts: prev.attempts + 1 },
            },
          };
        }),
      recordResult: (challengeId, passed, currentValue, semantic) =>
        set((state) => {
          if (!passed) return state;
          const prev = state.records[challengeId] ?? emptyRecord();
          const next: ChallengeRecord = {
            solved: true,
            attempts: prev.attempts, // attempts 在 incrementAttempts 里累加，这里不再 +1
            bestValue: pickBetter(prev.bestValue, currentValue, semantic),
            firstPassedAt: prev.firstPassedAt ?? Date.now(),
          };
          return { records: { ...state.records, [challengeId]: next } };
        }),
      reset: () => set({ records: {} }),
      resetOne: (challengeId) =>
        set((state) => {
          const next = { ...state.records };
          delete next[challengeId];
          return { records: next };
        }),
    }),
    {
      name: 'compressor-bench-challenges',
      version: 1,
      partialize: (state) => ({ records: state.records } as unknown as ChallengeState),
    },
  ),
);

/** 选择器：某模块通关数 / 总题数（外部 import {allChallenges} 配合用） */
export function summarizeForModule(
  records: Record<string, ChallengeRecord>,
  challengeIds: string[],
): { solved: number; total: number } {
  const total = challengeIds.length;
  const solved = challengeIds.reduce((acc, id) => acc + (records[id]?.solved ? 1 : 0), 0);
  return { solved, total };
}
