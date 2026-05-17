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
 * Phase B 拖拽画布的 6 节点 ID（slot 维度，跟 SlotKey 对应）。
 * 单独导出，避免和别处 SlotKey 字面量耦合（那是 SystemSchematic 里的 union）。
 */
export type WorkshopNodeId = 'load' | 'separator' | 'compressor' | 'pfc' | 'inverter' | 'strategy';

export interface NodePosition { x: number; y: number; }

/**
 * 画布默认坐标（百分比；x,y ∈ [0,100]）—— 上排机械链路、下排电气链路。
 * 与 SystemSchematic 的 2 行布局保持一致，第一次打开 Phase B 画布即视觉对齐。
 */
export const DEFAULT_NODE_POSITIONS: Record<WorkshopNodeId, NodePosition> = {
  load:       { x: 8,  y: 18 },
  separator:  { x: 38, y: 18 },
  compressor: { x: 68, y: 18 },
  pfc:        { x: 8,  y: 70 },
  inverter:   { x: 38, y: 70 },
  strategy:   { x: 68, y: 70 },
};

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
  /** Phase B：画布上 6 节点的当前坐标（百分比 0..100） */
  nodePositions: Record<WorkshopNodeId, NodePosition>;
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
  /** Phase B：拖拽更新单个节点坐标（百分比，自动 clamp 0..100） */
  setNodePosition: (id: WorkshopNodeId, pos: NodePosition) => void;
  /** Phase B：恢复 6 节点到 DEFAULT_NODE_POSITIONS */
  resetNodePositions: () => void;
}

export const useAssemblyProgressStore = create<AssemblyProgressState>()(
  persist(
    (set) => ({
      records: {},
      snapshots: [],
      history: [],
      nodePositions: { ...DEFAULT_NODE_POSITIONS },
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
      reset: () => set({ records: {}, snapshots: [], history: [], nodePositions: { ...DEFAULT_NODE_POSITIONS } }),
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
      setNodePosition: (id, pos) => set((state) => ({
        nodePositions: {
          ...state.nodePositions,
          [id]: {
            x: Math.max(0, Math.min(100, pos.x)),
            y: Math.max(0, Math.min(100, pos.y)),
          },
        },
      })),
      resetNodePositions: () => set({ nodePositions: { ...DEFAULT_NODE_POSITIONS } }),
    }),
    {
      name: 'compressor-bench-assembly-progress',
      version: 4,
      // 只持久化数据字段
      partialize: (state) => ({
        records: state.records,
        snapshots: state.snapshots,
        history: state.history,
        nodePositions: state.nodePositions,
      }) as unknown as AssemblyProgressState,
      migrate: (persisted: unknown, version: number) => {
        if (version < 2 && persisted && typeof persisted === 'object') {
          return { ...(persisted as Record<string, unknown>), snapshots: [], history: [] } as unknown as AssemblyProgressState;
        }
        if (version < 3 && persisted && typeof persisted === 'object') {
          return { ...(persisted as Record<string, unknown>), history: [] } as unknown as AssemblyProgressState;
        }
        if (version < 4 && persisted && typeof persisted === 'object') {
          return { ...(persisted as Record<string, unknown>), nodePositions: { ...DEFAULT_NODE_POSITIONS } } as unknown as AssemblyProgressState;
        }
        return persisted as AssemblyProgressState;
      },
    },
  ),
);
