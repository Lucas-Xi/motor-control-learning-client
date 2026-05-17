import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModuleId } from '../simulation/engine/types';

/**
 * 学习进度 store。
 *
 * 与 useSimulationStore 解耦：仿真状态（time / running / params）不进 localStorage，
 * 只把"学员到底学到哪"的元数据持久化下来。
 *
 * Schema 版本策略：
 *   - 字段不向后兼容地变动 ⇒ bump `version` + 在 `migrate` 里写迁移；
 *   - 兼容的小字段新增（带默认值）⇒ 不必 bump，老数据反序列化后字段为 undefined，
 *     选择器 / UI 侧请用 `??` 兜底。
 */

export interface ModuleProgress {
  /** 是否曾经访问过 */
  visited: boolean;
  /** 累计访问次数 */
  visitCount: number;
  /** 累积停留时间（ms），仅 document.visibilityState === 'visible' 时累加 */
  totalTimeMs: number;
  /** 答对题数（同一题多次答对会累加，UI 侧可用 quizTotal 取上界） */
  quizCorrect: number;
  /** 答题总次数 */
  quizTotal: number;
  /** 上次访问时间戳（Date.now()） */
  lastVisited: number | null;
  /** 当前在 walkthrough 的第几步（深度引导）—— 让学员切走再回来能恢复到上次位置 */
  walkthroughStep?: number;
  /** walkthrough 通关清单整体勾过的次数（最后一步访问即算 +1） */
  walkthroughCompletions?: number;
}

interface ProgressState {
  /** 按模块 id 索引的进度记录；用 Record<string, …> 而非 Record<ModuleId, …>，方便老数据兼容 */
  perModule: Record<string, ModuleProgress>;
  /** 当前会话开始时间（每次 reset 或新建 store 时刷新） */
  startSession: number;
  /** 跨会话累积活跃时间（ms） */
  totalActiveMs: number;
  recordVisit: (moduleId: ModuleId) => void;
  recordQuizResult: (moduleId: ModuleId, correct: boolean) => void;
  /** 记录学员在某模块 walkthrough 走到的步数（per-module 持久化进度） */
  setWalkthroughStep: (moduleId: ModuleId, step: number, isFinal?: boolean) => void;
  /** 由 ProgressHook 的 setInterval 调，仅在 visible 时累加 */
  tickActiveTime: (ms: number) => void;
  reset: () => void;
}

/** export 给 ProgressHook / 测试用——避免到处内联同一份字面量。
 *  新加字段必须同步加在这里（带默认值），让所有 fallback 出来的 ModuleProgress 类型完整。 */
export function emptyModuleProgress(): ModuleProgress {
  return {
    visited: false,
    visitCount: 0,
    totalTimeMs: 0,
    quizCorrect: 0,
    quizTotal: 0,
    lastVisited: null,
    walkthroughStep: undefined,
    walkthroughCompletions: 0,
  };
}

// 内部别名，旧代码引用
const emptyModule = emptyModuleProgress;

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      perModule: {},
      startSession: Date.now(),
      totalActiveMs: 0,

      recordVisit: (moduleId) =>
        set((state) => {
          const prev = state.perModule[moduleId] ?? emptyModule();
          const now = Date.now();
          const next: ModuleProgress = {
            ...prev,
            visited: true,
            visitCount: prev.visitCount + 1,
            lastVisited: now,
          };
          return { perModule: { ...state.perModule, [moduleId]: next } };
        }),

      recordQuizResult: (moduleId, correct) =>
        set((state) => {
          const prev = state.perModule[moduleId] ?? emptyModule();
          const next: ModuleProgress = {
            ...prev,
            quizTotal: prev.quizTotal + 1,
            quizCorrect: prev.quizCorrect + (correct ? 1 : 0),
          };
          return { perModule: { ...state.perModule, [moduleId]: next } };
        }),

      setWalkthroughStep: (moduleId, step, isFinal) =>
        set((state) => {
          const prev = state.perModule[moduleId] ?? emptyModule();
          // 同步存当前步号；如果到了最后一步（isFinal）累加完成次数
          // —— 学员"通关 N 次"作为学习记录的强信号。
          const completionsBump = isFinal ? 1 : 0;
          const next: ModuleProgress = {
            ...prev,
            walkthroughStep: step,
            walkthroughCompletions: (prev.walkthroughCompletions ?? 0) + completionsBump,
          };
          return { perModule: { ...state.perModule, [moduleId]: next } };
        }),

      tickActiveTime: (ms) =>
        set((state) => {
          // 把活跃时间分摊给当前最近访问的模块也是合理的，但更简单稳健的方案是
          // 只累加到全局 totalActiveMs；ProgressHook 在切换模块时另行调 recordVisit。
          // 单模块的 totalTimeMs 在切换瞬间由 hook 计算 delta 后写入。
          return { totalActiveMs: state.totalActiveMs + ms };
        }),

      reset: () =>
        set({
          perModule: {},
          startSession: Date.now(),
          totalActiveMs: 0,
        }),
    }),
    {
      name: 'compressor-bench-progress',
      version: 1,
      // 显式只持久化数据字段，不持久化函数（zustand persist 默认就只序列化可枚举字段，
      // 但这里 partialize 一份白名单更稳妥，未来加非持久化字段不会泄到 localStorage）。
      partialize: (state) => ({
        perModule: state.perModule,
        startSession: state.startSession,
        totalActiveMs: state.totalActiveMs,
      }),
    },
  ),
);

/** 冻结单例，作为缺失模块的默认 fallback——所有调用者拿到同一份引用，
 *  让 Zustand 的浅相等比较生效，避免每次 emptyModule() 都触发订阅者重渲染。 */
const FROZEN_EMPTY: ModuleProgress = Object.freeze(emptyModuleProgress());

/** 选择器辅助：取某模块的进度，缺失自动补冻结默认值（不会破坏引用稳定） */
export function selectModuleProgress(moduleId: string): (state: ProgressState) => ModuleProgress {
  return (state) => state.perModule[moduleId] ?? FROZEN_EMPTY;
}
