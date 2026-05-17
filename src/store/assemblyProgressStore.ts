import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 整机搭建·挑战模式通关存档。
 *
 * 与 progressStore 解耦：那是 16 模块的学习进度，这是搭建挑战的成绩。
 *
 * 每个挑战记录：
 *  - bestAttempts：最少尝试次数通关（越小越好；用户用更少次数解决问题再次通关会刷新）
 *  - firstPassedAt：首次通关时间戳（Date.now()，仅作历史参考）
 */

export interface ChallengeRecord {
  bestAttempts: number;
  firstPassedAt: number;
}

/**
 * 用户保存的整机组合快照。
 *
 * slotIds 用稳定的字符串 ID 而非数组索引：库重排或新增 bundle 不会让旧快照错位。
 */
export interface AssemblySnapshot {
  id: string;
  name: string;
  createdAt: number;
  slotIds: {
    compressorBundleId: string;
    inverterPartNo: string;
    strategyId: string;
    loadId: string;
    pfcId: string;
    separatorId: string;
  };
}

const MAX_SNAPSHOTS = 5;
const MAX_HISTORY = 20;

/**
 * 历史会话归档：每次"运行整机仿真"自动 push 一条，最多保留 20 条。
 * 与 snapshots 区别：snapshot 是用户主动命名的"基线"；history 是被动记录的"日志"。
 */
export interface AssemblyHistoryEntry {
  id: string;
  timestamp: number;
  mode: 'sandbox' | 'challenge';
  challengeId?: string;
  slotIds: AssemblySnapshot['slotIds'];
  verdict: 'pass' | 'pass-warn' | 'fail';
  cop: number;
  Tdischarge: number;
  reachedTarget: boolean;
  faultCount: number;
  warnCount: number;
}

interface AssemblyProgressState {
  records: Record<string, ChallengeRecord>;
  snapshots: AssemblySnapshot[];
  history: AssemblyHistoryEntry[];
  /** 通关后调；只在 attempts 更小时刷新记录 */
  recordPass: (challengeId: string, attempts: number) => void;
  /** 清空所有挑战记录 */
  reset: () => void;
  /** 保存当前组合为快照。同名快照会覆盖（用 name 去重），最多 5 个，超过时挤掉最旧 */
  saveSnapshot: (name: string, slotIds: AssemblySnapshot['slotIds']) => void;
  /** 删除快照 */
  deleteSnapshot: (id: string) => void;
  /** 重命名 */
  renameSnapshot: (id: string, name: string) => void;
  /** 每次"运行整机仿真"自动 push 一条历史 */
  pushHistory: (entry: Omit<AssemblyHistoryEntry, 'id' | 'timestamp'>) => void;
  /** 清空历史 */
  clearHistory: () => void;
}

export const useAssemblyProgressStore = create<AssemblyProgressState>()(
  persist(
    (set) => ({
      records: {},
      snapshots: [],
      history: [],
      recordPass: (challengeId, attempts) => set((state) => {
        const prev = state.records[challengeId];
        if (prev && prev.bestAttempts <= attempts) return state;
        return {
          records: {
            ...state.records,
            [challengeId]: {
              bestAttempts: attempts,
              firstPassedAt: prev?.firstPassedAt ?? Date.now(),
            },
          },
        };
      }),
      reset: () => set({ records: {}, snapshots: [], history: [] }),
      saveSnapshot: (name, slotIds) => set((state) => {
        // 同名覆盖
        const existing = state.snapshots.findIndex((s) => s.name === name);
        if (existing >= 0) {
          const next = [...state.snapshots];
          next[existing] = { ...next[existing], slotIds, createdAt: Date.now() };
          return { snapshots: next };
        }
        // 超过上限挤掉最旧的
        const next = [...state.snapshots, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          createdAt: Date.now(),
          slotIds,
        }];
        if (next.length > MAX_SNAPSHOTS) next.shift();
        return { snapshots: next };
      }),
      deleteSnapshot: (id) => set((state) => ({
        snapshots: state.snapshots.filter((s) => s.id !== id),
      })),
      renameSnapshot: (id, name) => set((state) => ({
        snapshots: state.snapshots.map((s) => s.id === id ? { ...s, name } : s),
      })),
      pushHistory: (entry) => set((state) => {
        const next: AssemblyHistoryEntry = {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
        };
        // 去重：与上一条完全相同 slotIds + verdict 的 run 不再 push（避免无脑连点）
        const last = state.history[state.history.length - 1];
        if (last && last.verdict === next.verdict && JSON.stringify(last.slotIds) === JSON.stringify(next.slotIds)) {
          return state;
        }
        const history = [...state.history, next];
        if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
        return { history };
      }),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'compressor-bench-assembly-progress',
      version: 3,
      // 只持久化数据字段
      partialize: (state) => ({ records: state.records, snapshots: state.snapshots, history: state.history }) as unknown as AssemblyProgressState,
      migrate: (persisted: unknown, version: number) => {
        if (version < 2 && persisted && typeof persisted === 'object') {
          return { ...(persisted as Record<string, unknown>), snapshots: [], history: [] } as unknown as AssemblyProgressState;
        }
        if (version < 3 && persisted && typeof persisted === 'object') {
          return { ...(persisted as Record<string, unknown>), history: [] } as unknown as AssemblyProgressState;
        }
        return persisted as AssemblyProgressState;
      },
    },
  ),
);
