import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 主台架 P-h 图"两级压缩 + 闪发分离"叠加开关 + 中间压力手动覆盖。
 *
 * 默认 disabled —— 主 P-h 图保持原 4 状态点单级循环（既有行为）。
 * 开启后 RefrigerationBenchModule 会用同样的 refrig 参数跑一次 simulateTwoStageCycle，
 * 把 9 个状态点（含闪发气 7v / 闪发液 7l）以紫色三角覆盖到 P-h 上，
 * 让学员同时看见单级 vs 两级的循环路径差，呼应 TwoStageCycleCard 的教学结论。
 *
 * `manualPiMPa`：中间压力手动覆盖；null = 用 sqrt(Ps·Pd) 自动最优。
 */
export interface BenchTwoStageState {
  enabled: boolean;
  manualPiMPa: number | null;
  setEnabled: (v: boolean) => void;
  setManualPi: (v: number | null) => void;
  toggleEnabled: () => void;
}

export const useBenchTwoStageStore = create<BenchTwoStageState>()(
  persist(
    (set, get) => ({
      enabled: false,
      manualPiMPa: null,
      setEnabled: (enabled) => set({ enabled }),
      setManualPi: (manualPiMPa) => set({ manualPiMPa }),
      toggleEnabled: () => set({ enabled: !get().enabled }),
    }),
    { name: 'compressor-bench-twoStage' },
  ),
);
