import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sampleHeatExchangers } from '../simulation/math/heatExchanger';

/**
 * 制冷台架"换热器耦合"开关 + UA / 风量参数。
 *
 * 默认 disabled —— 主 KPI 直接读用户输入的 Tc/Te（既有行为）。
 * 开启后 useBenchCycle 把这些 HX 参数喂给 simulateCycle.useHeatExchanger，
 * 4 次迭代求出实际 Tc/Te，让 SEER / 排气温度 / COP 端到端尊重换热器约束。
 *
 * 持久化到 localStorage 让学员的"我设定的换热器配置"刷新不丢。
 */
export interface BenchHxState {
  enabled: boolean;
  uaEvapKWperK: number;
  airFlowEvapM3perS: number;
  uaCondKWperK: number;
  airFlowCondM3perS: number;
  indoorC: number;
  outdoorC: number;
  setEnabled: (v: boolean) => void;
  setUaEvap: (v: number) => void;
  setAirFlowEvap: (v: number) => void;
  setUaCond: (v: number) => void;
  setAirFlowCond: (v: number) => void;
  setIndoor: (v: number) => void;
  setOutdoor: (v: number) => void;
}

export const useBenchHxStore = create<BenchHxState>()(
  persist(
    (set) => ({
      enabled: false,
      uaEvapKWperK: sampleHeatExchangers.homeEvap15HP.uaKWperK,
      airFlowEvapM3perS: sampleHeatExchangers.homeEvap15HP.airFlowM3perS,
      uaCondKWperK: sampleHeatExchangers.homeCond15HP.uaKWperK,
      airFlowCondM3perS: sampleHeatExchangers.homeCond15HP.airFlowM3perS,
      indoorC: 27,
      outdoorC: 35,
      setEnabled: (enabled) => set({ enabled }),
      setUaEvap: (uaEvapKWperK) => set({ uaEvapKWperK }),
      setAirFlowEvap: (airFlowEvapM3perS) => set({ airFlowEvapM3perS }),
      setUaCond: (uaCondKWperK) => set({ uaCondKWperK }),
      setAirFlowCond: (airFlowCondM3perS) => set({ airFlowCondM3perS }),
      setIndoor: (indoorC) => set({ indoorC }),
      setOutdoor: (outdoorC) => set({ outdoorC }),
    }),
    { name: 'compressor-bench-hx' },
  ),
);
