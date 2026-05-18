import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssemblySnapshot } from './assemblyProgressStore';

/**
 * 解题路径回放 store（Phase C）。
 *
 * 与 useChallengeStore（只记"通关 / 尝试次数 / 最优指标"）和 useSnapshotsStore
 * （工况快照，用于 P-h 图叠加）平行：
 *
 * 这里是"挑战模式 → 每次点'运行整机仿真' → 把当时的 slot 选型 + verdict + 4 个 KPI"
 * 串成时间线，给 SolutionReplay 组件按 5s/step 自动播放回放。
 *
 * - 每个 challengeId 独立存自己的 timeline（防止串台）
 * - persist → localStorage：刷新页面还能看
 * - 每条 timeline 最长 30 步（再多用户也很难复盘；超出从头 shift）
 *
 * Note: 这里只存"槽位 ID 字符串 + 数值 KPI + verdict"，不存完整 AssemblyResult（避免 storage 爆掉）。
 * 回放时由 UI 用 slotIds 反查库 + 把 KPI 直接显示就够；不需要重跑 simulate。
 */

const MAX_STEPS_PER_CHALLENGE = 30;
const MAX_CHALLENGES = 16;

export type ReplayVerdict = 'pass' | 'pass-warn' | 'fail';

export interface ReplayStep {
  /** 第几次尝试（1-based） */
  attemptIndex: number;
  /** 当时 6 槽位选型 */
  slotIds: AssemblySnapshot['slotIds'];
  verdict: ReplayVerdict;
  /** 4 个核心 KPI —— 与 SnapshotDiffPanel 列出的字段对齐 */
  cop: number;
  /** 稳态 Iq（A） */
  requiredIqA: number;
  /** 排气压力比（无单位）—— 对应 Pd 概念，AssemblyResult.metrics.pressureRatio */
  pressureRatio: number;
  /** 排气温度（°C） */
  Tdischarge: number;
  /** 当时的诊断标题（一句话），方便回放时给用户"当时为什么 fail" */
  summary: string;
  /** push 时间戳 */
  timestamp: number;
}

export interface ChallengeReplay {
  challengeId: string;
  steps: ReplayStep[];
}

interface ReplayState {
  /** Key = challengeId（与 assemblyChallenges.id 对齐） */
  replays: Record<string, ChallengeReplay>;
  /** push 一条新 step；同 challenge 内连续两步若 slotIds + verdict 完全相同则跳过（防抖） */
  pushStep: (challengeId: string, step: Omit<ReplayStep, 'attemptIndex' | 'timestamp'>) => void;
  /** 清掉某一题的回放（重新开始挑战时） */
  clearChallenge: (challengeId: string) => void;
  /** 清全部 */
  clearAll: () => void;
  /** 选择器：某 challenge 的所有 steps（按 attemptIndex 升序） */
  getSteps: (challengeId: string) => ReplayStep[];
}

function sameSlotsAndVerdict(a: ReplayStep, b: { slotIds: ReplayStep['slotIds']; verdict: ReplayVerdict }): boolean {
  if (a.verdict !== b.verdict) return false;
  const k = Object.keys(a.slotIds) as Array<keyof ReplayStep['slotIds']>;
  for (const key of k) if (a.slotIds[key] !== b.slotIds[key]) return false;
  return true;
}

export const useReplayStore = create<ReplayState>()(
  persist(
    (set, get) => ({
      replays: {},
      pushStep: (challengeId, step) =>
        set((state) => {
          const prev = state.replays[challengeId];
          const prevSteps = prev?.steps ?? [];
          const last = prevSteps[prevSteps.length - 1];
          // 防抖：完全相同的连续两步不入库
          if (last && sameSlotsAndVerdict(last, step)) return state;
          const next: ReplayStep = {
            ...step,
            attemptIndex: prevSteps.length + 1,
            timestamp: Date.now(),
          };
          let steps = [...prevSteps, next];
          if (steps.length > MAX_STEPS_PER_CHALLENGE) {
            steps = steps.slice(steps.length - MAX_STEPS_PER_CHALLENGE);
          }
          // 容量限制：超出 16 个 challenge 时挤掉最早 push 过的（按字典顺序兜底）
          let replays = { ...state.replays, [challengeId]: { challengeId, steps } };
          const ids = Object.keys(replays);
          if (ids.length > MAX_CHALLENGES) {
            const drop = ids[0];
            const { [drop]: _drop, ...rest } = replays;
            void _drop;
            replays = rest;
          }
          return { replays };
        }),
      clearChallenge: (challengeId) =>
        set((state) => {
          if (!state.replays[challengeId]) return state;
          const { [challengeId]: _drop, ...rest } = state.replays;
          void _drop;
          return { replays: rest };
        }),
      clearAll: () => set({ replays: {} }),
      getSteps: (challengeId) => get().replays[challengeId]?.steps ?? [],
    }),
    {
      name: 'compressor-bench-replays',
      version: 1,
      partialize: (state) => ({ replays: state.replays } as unknown as ReplayState),
    },
  ),
);

/** 选择器：取所有有 replay 的 challenge id（按最近一步的 timestamp 倒序） */
export function listChallengesWithReplay(replays: Record<string, ChallengeReplay>): string[] {
  return Object.values(replays)
    .filter((r) => r.steps.length > 0)
    .sort((a, b) => {
      const ta = a.steps[a.steps.length - 1].timestamp;
      const tb = b.steps[b.steps.length - 1].timestamp;
      return tb - ta;
    })
    .map((r) => r.challengeId);
}
