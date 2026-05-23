import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sampleComplianceParams } from '../simulation/math/mechanicalCompliance';

/**
 * 主台架"机械传动柔性"开关 + 4 种传动预设。
 *
 * 默认 disabled —— useBenchCycle 直接返回纯热力学循环结果（既有行为）。
 * 开启后 useBenchCycle 会在 simulateCycle 之外，再用 stepCompliance 跑一段
 * 反液击瞬态：稳态扭矩 → 50 ms 后阶跃到 2× 扭矩 → 观察轴扭簧 Tspring 峰值，
 * 让学员看见同样的稳态 KPI 在直驱 / 皮带 / 谐波减速器下的瞬态扭矩峰值差距。
 */
export type ComplianceKey = keyof typeof sampleComplianceParams;

export interface BenchComplianceState {
  enabled: boolean;
  preset: ComplianceKey;
  setEnabled: (v: boolean) => void;
  setPreset: (k: ComplianceKey) => void;
  toggleEnabled: () => void;
}

export const useBenchComplianceStore = create<BenchComplianceState>()(
  persist(
    (set, get) => ({
      enabled: false,
      preset: 'directDriveCompressor',
      setEnabled: (enabled) => set({ enabled }),
      setPreset: (preset) => set({ preset }),
      toggleEnabled: () => set({ enabled: !get().enabled }),
    }),
    { name: 'compressor-bench-compliance' },
  ),
);
