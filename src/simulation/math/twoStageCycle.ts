/**
 * 两级压缩 + 闪发分离 vapor-compression cycle（工业最后一公里第 4 项）。
 *
 * **为什么需要**：
 *   单级循环（vaporCycle.ts）在大压比工况下排气温度过高（> 110°C 触发压缩机过热保护），
 *   COP 也较低。高端变频空调（COP 5+ 一级能效）+ 工业冷链（Te < -20°C）必上两级。
 *
 * **流程（10 状态点）**：
 *   1 → 2  ：低压级压缩  P_s → P_i
 *   2 → 3  ：混合点（与闪发罐顶气混合），降温到状态 3
 *   3 → 4  ：高压级压缩  P_i → P_d
 *   4 → 5  ：冷凝器（等压放热）
 *   5 → 6  ：高压膨胀阀  P_d → P_i（等焓节流）
 *   6 → 7v ：闪发罐分气（饱和气）
 *   6 → 7l ：闪发罐分液（饱和液）
 *   7l → 8 ：低压膨胀阀  P_i → P_s（等焓节流）
 *   8 → 1  ：蒸发器（等压吸热到过热）
 *
 * **质量流量平衡**：
 *   m_low  : 流经蒸发器的"主路"（低压级 + 低压阀）
 *   m_flash: 从闪发罐分出的气相
 *   m_high : 高压级流量 = m_low + m_flash
 *   x_flash: 闪发分气比 = (h_6 − h_7l) / (h_7v − h_7l)
 *
 * **最优中间压力**：
 *   P_i_opt = sqrt(P_s × P_d)  ⇒ 两级压比相等，总功最小（理想气）
 *   实际略偏（含混合损失），但 sqrt(P_s·P_d) 是工程起点。
 *
 * **教学意义**：
 *   学员对比"同样 Te/Tc + 同样制冷量"下：
 *     - 单级：T_discharge ≈ 95°C, COP ≈ 3.0
 *     - 两级：T_discharge ≈ 75°C, COP ≈ 4.0
 *   立刻明白"压缩比拆分"为啥能让效率显著上升。
 *
 * **参考**：
 *   - Stoecker & Jones《Refrigeration and Air Conditioning》Ch.16 Multistage Systems
 *   - ASHRAE Handbook · Refrigeration Ch.4 (Two-Stage Compression Systems)
 *   - Wang《Handbook of Air Conditioning and Refrigeration》§9.4 Economizer Cycle
 */

import type { Refrigerant } from './refrigerantProps';
import {
  hLiqSat, hSubcooled, hSuperheated, hVapSat,
  polytropicN, rhoVapSat, tSat,
} from './refrigerantProps';
import { wagnerSaturationPressure } from './wagnerEq';

/** 私有 helper：refrigerantProps 没暴露 cpVapor，作为内部 fallback */
function cpVapor(r: Refrigerant): number {
  return r === 'R32' ? 1.05 : r === 'R410A' ? 0.97 : 1.02;
}

export interface TwoStageCycleInput {
  refrigerant: Refrigerant;
  /** 蒸发饱和温度 (°C) */
  Te: number;
  /** 冷凝饱和温度 (°C) */
  Tc: number;
  /** 中间压力 P_i (MPa)；若不传则用 sqrt(P_s × P_d) 自动选最优 */
  intermediatePressureMPa?: number;
  /** 蒸发器过热度 (K) */
  superheatK: number;
  /** 冷凝器过冷度 (K) */
  subcoolK: number;
  /** 等熵效率 (两级共用) */
  isentropicEff: number;
  /** 低压级排量 (cc/rev) */
  displacementLowCc: number;
  /** 高压级排量 (cc/rev)；可与低压级不同（高压级通常略小） */
  displacementHighCc: number;
  /** 转速 (rpm) — 两级共轴 */
  rpm: number;
  /** 余隙比 */
  clearanceRatio: number;
}

export interface TwoStageStatePoint {
  index: number;
  /** 压力 (MPa) */
  P: number;
  /** 温度 (°C) */
  T: number;
  /** 比焓 (kJ/kg) */
  h: number;
  /** 标签 */
  label: string;
}

export interface TwoStageCycleResult {
  /** 10 状态点（1, 2, 3, 4, 5, 6, 7v, 7l, 8, 8'=1） */
  states: TwoStageStatePoint[];
  /** 中间压力 (MPa) */
  Pi: number;
  /** 闪发分气比 0..1 */
  flashFraction: number;
  /** 主路（蒸发器）质量流量 (kg/s) */
  mLowKgs: number;
  /** 高压级质量流量 (kg/s) = mLow + mFlash */
  mHighKgs: number;
  /** 制冷量 Q_c (kW) */
  Qc: number;
  /** 低压级功率 (kW) */
  WlowKW: number;
  /** 高压级功率 (kW) */
  WhighKW: number;
  /** 总功率 (kW) */
  WtotKW: number;
  /** COP = Q_c / W_total */
  cop: number;
  /** 高压级排气温度 T_4 (°C) */
  TdischargeC: number;
  /** 低压级排气温度 T_2 (°C)，混合前 */
  TstageOneDischargeC: number;
  /** 总扭矩（双轴并联在同一转子上，所以求和）(N·m) */
  torqueLoadNm: number;
  /** 与等价单级循环的 COP 提升百分比（教学对比） */
  copGainVsSingleStagePct: number;
  warnings: string[];
}

export function simulateTwoStageCycle(input: TwoStageCycleInput): TwoStageCycleResult {
  const r = input.refrigerant;
  const warnings: string[] = [];

  const Ps = wagnerSaturationPressure(input.Te, r);
  const Pd = wagnerSaturationPressure(input.Tc, r);
  const Pi = input.intermediatePressureMPa ?? Math.sqrt(Math.max(Ps * Pd, 1e-6));
  if (Pi <= Ps || Pi >= Pd) warnings.push(`中间压力 ${Pi.toFixed(3)} MPa 越界 (Ps=${Ps.toFixed(3)}, Pd=${Pd.toFixed(3)})`);

  const Ti = tSat(Pi, r);
  const n = polytropicN(r);

  // 状态 1：蒸发器出口过热气
  const T1 = input.Te + input.superheatK;
  const h1 = hSuperheated(input.Te, input.superheatK, r);

  // 状态 2：低压级压缩排气（P_s → P_i 多变压缩）
  const T1K = T1 + 273.15;
  const T2K = T1K * Math.pow(Pi / Math.max(1e-6, Ps), (n - 1) / n);
  const T2 = T2K - 273.15;
  const h2_isen = hVapSat(Ti, r) + cpVapor(r) * Math.max(0, T2 - Ti);
  const h2 = h1 + (h2_isen - h1) / Math.max(0.3, input.isentropicEff);

  // 状态 5：冷凝器出口过冷液（先算因为状态 6 闪发要用 h_5）
  const T5 = input.Tc - input.subcoolK;
  const h5 = hSubcooled(input.Tc, input.subcoolK, r);

  // 状态 6：高压膨胀阀出口（等焓节流到 P_i）
  const h6 = h5;
  const T6 = Ti;  // 在 P_i 上，两相区

  // 闪发分气比：x = (h_6 − h_7l) / (h_7v − h_7l)
  const h7l = hLiqSat(Ti, r);
  const h7v = hVapSat(Ti, r);
  const xFlash = Math.max(0, Math.min(1, (h6 - h7l) / Math.max(1e-3, h7v - h7l)));

  // 状态 3：混合（低压级排气 m_low @ h_2 + 闪发分气 m_flash @ h_7v → m_high @ h_3）
  // m_flash / m_low = xFlash / (1 − xFlash)
  // h_3 = ((1−x)·h_2 + x·h_7v)
  const h3 = (1 - xFlash) * h2 + xFlash * h7v;
  // T_3 在 P_i 处的过热气状态：T_3 = Ti + (h_3 − h_v_at_Pi) / cp_v
  const T3 = Ti + Math.max(0, (h3 - h7v) / cpVapor(r));

  // 状态 4：高压级压缩排气（P_i → P_d 多变压缩）
  const T3K = T3 + 273.15;
  const T4K = T3K * Math.pow(Pd / Math.max(1e-6, Pi), (n - 1) / n);
  const T4 = T4K - 273.15;
  const h4_isen = hVapSat(input.Tc, r) + cpVapor(r) * Math.max(0, T4 - input.Tc);
  const h4 = h3 + (h4_isen - h3) / Math.max(0.3, input.isentropicEff);

  // 状态 8：低压膨胀阀出口（等焓节流到 P_s）
  const h8 = h7l;

  // 质量流量
  // rhoVapSat 在极低温（< -26°C）线性近似失效给出负值；这里 clamp 防止 mDot 反号。
  const rho1 = Math.max(0.5, rhoVapSat(input.Te, r)) * ((input.Te + 273.15) / T1K);
  const VdispLow = (input.displacementLowCc * 1e-6) * (input.rpm / 60);
  const etaV = Math.max(0.05, 1 - input.clearanceRatio * (Math.pow(Pi / Math.max(1e-6, Ps), 1 / n) - 1));
  const mLow = rho1 * VdispLow * etaV;
  const mFlash = mLow * xFlash / Math.max(1e-6, 1 - xFlash);
  const mHigh = mLow + mFlash;

  // 制冷量 + 双级功率
  const Qc = mLow * (h1 - h8);
  const Wlow = mLow * (h2 - h1);
  const Whigh = mHigh * (h4 - h3);
  const Wtot = Wlow + Whigh;
  const cop = Wtot > 1e-6 ? Qc / Wtot : 0;

  // 与等价单级循环 COP 对比（简化：相同 Ps/Pd/m_dot，单级排气焓由 T_d_single 决定）
  const T2K_single = T1K * Math.pow(Pd / Math.max(1e-6, Ps), (n - 1) / n);
  const T2_single = T2K_single - 273.15;
  const h2_iseS = hVapSat(input.Tc, r) + cpVapor(r) * Math.max(0, T2_single - input.Tc);
  const h2_single = h1 + (h2_iseS - h1) / Math.max(0.3, input.isentropicEff);
  const W_single = mLow * (h2_single - h1);
  const cop_single = W_single > 1e-6 ? (mLow * (h1 - h5)) / W_single : 0;
  const copGain = cop_single > 1e-3 ? ((cop - cop_single) / cop_single) * 100 : 0;

  // 扭矩（共轴：两级合并到同一转子）
  const omega = (2 * Math.PI * input.rpm) / 60;
  const torque = omega > 1e-3 ? (Wtot * 1000) / omega : 0;

  const states: TwoStageStatePoint[] = [
    { index: 1, P: Ps, T: T1, h: h1, label: '蒸发出口过热气' },
    { index: 2, P: Pi, T: T2, h: h2, label: '低压级排气' },
    { index: 3, P: Pi, T: T3, h: h3, label: '混合后' },
    { index: 4, P: Pd, T: T4, h: h4, label: '高压级排气' },
    { index: 5, P: Pd, T: T5, h: h5, label: '冷凝过冷液' },
    { index: 6, P: Pi, T: T6, h: h6, label: '高阀后两相' },
    { index: 7, P: Pi, T: Ti, h: h7v, label: '闪发气' },
    { index: 8, P: Pi, T: Ti, h: h7l, label: '闪发液' },
    { index: 9, P: Ps, T: input.Te, h: h8, label: '低阀后两相' },
  ];

  if (T4 > 110) warnings.push(`高压级排气温度 ${T4.toFixed(1)}°C 接近压缩机限值`);
  if (xFlash > 0.5) warnings.push(`闪发分气比 ${(xFlash * 100).toFixed(0)}% 过高，膨胀阀选型偏小`);

  return {
    states,
    Pi,
    flashFraction: xFlash,
    mLowKgs: mLow,
    mHighKgs: mHigh,
    Qc,
    WlowKW: Wlow,
    WhighKW: Whigh,
    WtotKW: Wtot,
    cop,
    TdischargeC: T4,
    TstageOneDischargeC: T2,
    torqueLoadNm: torque,
    copGainVsSingleStagePct: copGain,
    warnings,
  };
}

/**
 * 闪发分气比的闭式公式（教学用，与 simulateTwoStageCycle 内部一致）。
 */
export function flashFraction(input: Pick<TwoStageCycleInput, 'refrigerant' | 'Tc' | 'subcoolK' | 'intermediatePressureMPa'> & { Te?: number }): number {
  const r = input.refrigerant;
  const Ti = input.intermediatePressureMPa
    ? tSat(input.intermediatePressureMPa, r)
    : (() => {
        const Te = input.Te ?? -10;
        const Ps = wagnerSaturationPressure(Te, r);
        const Pd = wagnerSaturationPressure(input.Tc, r);
        return tSat(Math.sqrt(Ps * Pd), r);
      })();
  const h_subcooled = hSubcooled(input.Tc, input.subcoolK, r);
  const h7l = hLiqSat(Ti, r);
  const h7v = hVapSat(Ti, r);
  return Math.max(0, Math.min(1, (h_subcooled - h7l) / Math.max(1e-3, h7v - h7l)));
}

