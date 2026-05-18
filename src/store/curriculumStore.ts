import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { checkpointKey, curriculumTracks, getCurriculumTrack } from '../content/curriculum';
import type { CurriculumCheckpoint, CurriculumTrack } from '../content/curriculum';

/**
 * 课程主线进度 store。
 *
 * 设计：与 useProgressStore（模块访问 / walkthrough 步）、useChallengeStore（挑战通关）
 * 解耦。课程进度是"路径维度"的元数据，每条路径维护：
 *   - startedAt：首次点击进入该路径时间戳
 *   - lastVisitedAt：最近一次访问时间戳
 *   - completed：已勾选完成的 checkpointKey 集合（用 string[] 持久化，运行时转 Set 做 O(1) 查）
 *
 * 完成判定走"学员自报"——点 CurriculumPanel 上的勾选框即视为完成。
 * 是否真的看懂由学员负责；UI 只是把路径推进、下一步、证书导出做成可视化。
 *
 * 持久化 key：`compressor-bench-curriculum`，version 1。
 */

export interface CurriculumPathProgress {
  startedAt: number;
  lastVisitedAt: number;
  /** 已完成 checkpointKey 列表（持久化用数组；getProgress 暴露 Set 形态） */
  completedCheckpoints: string[];
}

interface CurriculumState {
  /** path id → 进度记录；未启动的路径不在表里（用 getProgress 兜底） */
  paths: Record<string, CurriculumPathProgress>;
  /** 上次访问的 trackId，下次打开 CurriculumPanel 默认聚焦它 */
  lastActiveTrack: string | null;
  /** 标记单个 checkpoint 完成（幂等：重复点不会重复加） */
  markCheckpointDone: (trackId: string, checkpointId: string) => void;
  /** 取消勾选 */
  unmarkCheckpoint: (trackId: string, checkpointId: string) => void;
  /** 清空整条路径进度（保留 startedAt = now，让证书的"学习时长"重新计时） */
  resetPath: (trackId: string) => void;
  /** 记录路径被访问；不创建空 progress，只更新 lastVisitedAt */
  touchPath: (trackId: string) => void;
  /** 设置上次激活的路径 id */
  setLastActiveTrack: (trackId: string | null) => void;
  /** 全部清空 */
  resetAll: () => void;
}

/**
 * 返回某条路径的进度；缺失自动补默认值。
 * 注意：不会触发 state 写入，纯查询。
 */
export function getProgress(state: CurriculumState, trackId: string): CurriculumPathProgress {
  return (
    state.paths[trackId] ?? {
      startedAt: 0,
      lastVisitedAt: 0,
      completedCheckpoints: [],
    }
  );
}

/**
 * 返回路径的下一个待办 checkpoint（按 checkpoints 数组顺序找第一个未完成的）。
 * 若全部完成返回 null。
 */
export function getNextCheckpoint(
  state: CurriculumState,
  track: CurriculumTrack,
): CurriculumCheckpoint | null {
  const progress = getProgress(state, track.id);
  const done = new Set(progress.completedCheckpoints);
  for (const cp of track.checkpoints) {
    if (!done.has(checkpointKey(track.id, cp.id))) return cp;
  }
  return null;
}

/** 返回 0..1 完成比 */
export function getCompletionRatio(state: CurriculumState, track: CurriculumTrack): number {
  if (track.checkpoints.length === 0) return 0;
  const progress = getProgress(state, track.id);
  const done = new Set(progress.completedCheckpoints);
  let count = 0;
  for (const cp of track.checkpoints) {
    if (done.has(checkpointKey(track.id, cp.id))) count += 1;
  }
  return count / track.checkpoints.length;
}

export const useCurriculumStore = create<CurriculumState>()(
  persist(
    (set, get) => ({
      paths: {},
      lastActiveTrack: null,

      markCheckpointDone: (trackId, checkpointId) =>
        set((state) => {
          const track = getCurriculumTrack(trackId);
          if (!track) return state;
          const cpExists = track.checkpoints.some((c) => c.id === checkpointId);
          if (!cpExists) return state;
          const key = checkpointKey(trackId, checkpointId);
          const prev = state.paths[trackId];
          const now = Date.now();
          const next: CurriculumPathProgress = prev
            ? {
                startedAt: prev.startedAt || now,
                lastVisitedAt: now,
                completedCheckpoints: prev.completedCheckpoints.includes(key)
                  ? prev.completedCheckpoints
                  : [...prev.completedCheckpoints, key],
              }
            : {
                startedAt: now,
                lastVisitedAt: now,
                completedCheckpoints: [key],
              };
          return {
            paths: { ...state.paths, [trackId]: next },
          };
        }),

      unmarkCheckpoint: (trackId, checkpointId) =>
        set((state) => {
          const prev = state.paths[trackId];
          if (!prev) return state;
          const key = checkpointKey(trackId, checkpointId);
          if (!prev.completedCheckpoints.includes(key)) return state;
          return {
            paths: {
              ...state.paths,
              [trackId]: {
                ...prev,
                lastVisitedAt: Date.now(),
                completedCheckpoints: prev.completedCheckpoints.filter((k) => k !== key),
              },
            },
          };
        }),

      resetPath: (trackId) =>
        set((state) => {
          const now = Date.now();
          return {
            paths: {
              ...state.paths,
              [trackId]: { startedAt: now, lastVisitedAt: now, completedCheckpoints: [] },
            },
          };
        }),

      touchPath: (trackId) =>
        set((state) => {
          const track = getCurriculumTrack(trackId);
          if (!track) return state;
          const prev = state.paths[trackId];
          const now = Date.now();
          const next: CurriculumPathProgress = prev
            ? { ...prev, lastVisitedAt: now }
            : { startedAt: now, lastVisitedAt: now, completedCheckpoints: [] };
          return {
            paths: { ...state.paths, [trackId]: next },
            lastActiveTrack: trackId,
          };
        }),

      setLastActiveTrack: (trackId) => set({ lastActiveTrack: trackId }),

      resetAll: () => {
        // 直接调而不是 set({}) 以保留 store 对外引用稳定
        set({ paths: {}, lastActiveTrack: null });
        // 显式触发一次 lastActive，避免编译器 unused get 警告
        void get();
      },
    }),
    {
      name: 'compressor-bench-curriculum',
      version: 1,
      partialize: (state) =>
        ({
          paths: state.paths,
          lastActiveTrack: state.lastActiveTrack,
        }) as unknown as CurriculumState,
    },
  ),
);

/** 提供给测试 / 外部调用的轻量映射：trackId → 已完成数量 */
export function summarizeAllTracks(
  state: CurriculumState,
): Array<{ trackId: string; title: string; ratio: number; done: number; total: number }> {
  return curriculumTracks.map((track) => {
    const ratio = getCompletionRatio(state, track);
    const total = track.checkpoints.length;
    return {
      trackId: track.id,
      title: track.title,
      ratio,
      done: Math.round(ratio * total),
      total,
    };
  });
}
