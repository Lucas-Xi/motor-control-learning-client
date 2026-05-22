/**
 * 换热器 ε-NTU 模型（蒸发器 / 冷凝器，翅片管 fin-and-tube）。
 *
 * **为什么需要**：
 *   vaporCycle.ts 当前直接吃用户给的 Te / Tc（"假定理想换热"），
 *   完全没考虑换热器面积、风量是否够把热量真搬走。真实空调设计：
 *     - 蒸发器面积 / 风量 不够 → Te 实际比设计值偏低（结霜 / 制冷量下降）
 *     - 冷凝器面积 / 风量 不够 → Tc 实际比设计值偏高（高压保护 / COP 暴跌）
 *   工业上必备的"换热器选型 + 工况校核"步骤一直没被仿真覆盖。
 *
 * **公式（ε-NTU 方法）**：
 *   NTU = UA / C_min     （传热单元数）
 *   ε = 实际传热 / 最大可能传热 = Q_actual / Q_max
 *
 *   对蒸发器（制冷剂相变，等温侧，C_r = 0）：
 *     ε = 1 − exp(−NTU)
 *
 *   对冷凝器（制冷剂相变，等温侧，C_r = 0）：
 *     ε = 1 − exp(−NTU)
 *
 *   注：C_r = C_min/C_max；制冷剂相变期间它的"等效热容"无穷大（C_max=∞），
 *       所以 C_r → 0，公式退化为最简单的 ε = 1 − exp(−NTU)。
 *
 * **U 系数**：翅片管换热器典型 U·A 量级：
 *   家用空调蒸发器（1.5 HP）：UA ≈ 0.6-1.0 kW/K
 *   家用空调冷凝器（1.5 HP）：UA ≈ 0.8-1.2 kW/K
 *
 * **教学意义**：
 *   学员调"加大风量"看 ε 上升、Te 抬高（蒸发器接近室内温度），
 *   或"封住一半冷凝器"看 ε 跌、Tc 上升、COP 暴跌、最后触发高压保护。
 *   这是空调"夏季高温/冬季化霜"现象的根本数学描述。
 *
 * **参考**：
 *   - Incropera《Fundamentals of Heat and Mass Transfer》Ch.11 ε-NTU method
 *   - ASHRAE Handbook · HVAC Systems Ch.27 (Air-Cooling and Dehumidifying Coils)
 *   - Bergman et al.《Fundamentals of Heat and Mass Transfer》§11.3 Effectiveness-NTU
 *
 * **STM32 移植**：本模块给"自适应 Tc/Te 估算"用 — 当板上测得 Pd/Ps 和环温后，
 *   反推真实 ε，对比设计 ε 看换热器是否堵塞/结霜。
 */

export type HeatExchangerKind = 'evaporator' | 'condenser';

export interface HeatExchangerParams {
  /** 类型：蒸发器 / 冷凝器 */
  kind: HeatExchangerKind;
  /** 总传热系数 × 换热面积 UA (kW/K)，包含管内对流 + 管壁导热 + 翅片对流的级联热阻 */
  uaKWperK: number;
  /** 空气体积流量 (m³/s)，决定空气侧的 C 容率 */
  airFlowM3perS: number;
  /** 空气密度 (kg/m³)，~1.2 标准 */
  rhoAirKgM3?: number;
  /** 空气定压比热 (kJ/kg/K)，~1.005 标准 */
  cpAirKJkgK?: number;
}

export interface HeatExchangerInput {
  /** 制冷剂侧饱和温度 (°C) —— 蒸发温度 Te 或冷凝温度 Tc */
  TrefC: number;
  /** 空气进口温度 (°C) —— 蒸发器是室内空气，冷凝器是室外空气 */
  TairInC: number;
  /** 换热器几何 & 工况参数 */
  params: HeatExchangerParams;
}

export interface HeatExchangerResult {
  /** 实际换热量 (kW)。蒸发器为正（从空气吸热），冷凝器也为正（向空气放热） */
  qActualKW: number;
  /** 空气侧出口温度 (°C) */
  TairOutC: number;
  /** 最大可能换热量 (kW) = C_min × ΔT */
  qMaxKW: number;
  /** 换热效能 ε = qActual / qMax */
  epsilon: number;
  /** NTU = UA / C_min */
  ntu: number;
  /** 空气侧热容率 C_air = ṁ × cp (kW/K) */
  cAirKWperK: number;
}

/**
 * ε-NTU 一次性算换热器实际能搬多少热 + 空气出口温度。
 *
 * @example
 *   // 家用 1.5HP 空调冷凝器：UA=1.0 kW/K，0.4 m³/s 风量，Tc=45°C 室外 35°C
 *   const r = heatExchangerExchange({
 *     TrefC: 45,
 *     TairInC: 35,
 *     params: { kind: 'condenser', uaKWperK: 1.0, airFlowM3perS: 0.4 },
 *   });
 *   // r.cAirKWperK ≈ 0.4 × 1.2 × 1.005 ≈ 0.48 kW/K
 *   // r.ntu = 1.0 / 0.48 ≈ 2.08
 *   // r.epsilon ≈ 1 − exp(−2.08) ≈ 0.875
 *   // r.qMax = 0.48 × (45 − 35) = 4.8 kW
 *   // r.qActual ≈ 0.875 × 4.8 ≈ 4.2 kW
 *   // r.TairOut = 35 + 4.2/0.48 ≈ 43.75°C
 */
export function heatExchangerExchange(input: HeatExchangerInput): HeatExchangerResult {
  const rho = input.params.rhoAirKgM3 ?? 1.2;
  const cp = input.params.cpAirKJkgK ?? 1.005;
  const mAir = rho * Math.max(1e-6, input.params.airFlowM3perS); // kg/s
  const cAir = mAir * cp;                                         // kW/K

  // 空气侧温差驱动；蒸发器是 Tair > Tref（空气放热给冷剂），冷凝器是 Tref > Tair
  const dT = input.params.kind === 'evaporator'
    ? input.TairInC - input.TrefC
    : input.TrefC - input.TairInC;

  // 物理保护：温差为负或零时返回 0 换热
  if (dT <= 0) {
    return {
      qActualKW: 0,
      TairOutC: input.TairInC,
      qMaxKW: 0,
      epsilon: 0,
      ntu: 0,
      cAirKWperK: cAir,
    };
  }

  const qMax = cAir * dT;
  const ntu = input.params.uaKWperK / Math.max(1e-6, cAir);
  // 制冷剂相变 → C_max=∞，ε = 1 − exp(−NTU)
  const epsilon = 1 - Math.exp(-ntu);
  const qActual = epsilon * qMax;

  // 空气出口温度
  const TairOut = input.params.kind === 'evaporator'
    ? input.TairInC - qActual / cAir       // 蒸发器：空气被冷却
    : input.TairInC + qActual / cAir;      // 冷凝器：空气被加热

  return {
    qActualKW: qActual,
    TairOutC: TairOut,
    qMaxKW: qMax,
    epsilon,
    ntu,
    cAirKWperK: cAir,
  };
}

/**
 * 反求蒸发/冷凝温度：已知制冷剂侧所需热量 Q，已知 UA + 空气流量 + 进口温度，
 * 反推制冷剂侧饱和温度（让换热平衡）。
 *
 * 数值方法：直接闭式解
 *   q = ε × C_min × |Tair_in − Tref|
 *   ⇒ |Tair_in − Tref| = q / (ε × C_min)
 *
 * 给的 q 必须 ≤ 物理上限 q_max = C_min × (Tair_in − Tref_理论饱和点)；
 * 否则返回理论上限（换热器吃不下）。
 */
export function inverseSaturationTemp(
  qRequiredKW: number,
  TairInC: number,
  params: HeatExchangerParams,
): { TrefC: number; feasible: boolean; qActualKW: number; epsilon: number } {
  const rho = params.rhoAirKgM3 ?? 1.2;
  const cp = params.cpAirKJkgK ?? 1.005;
  const mAir = rho * Math.max(1e-6, params.airFlowM3perS);
  const cAir = mAir * cp;
  const ntu = params.uaKWperK / Math.max(1e-6, cAir);
  const epsilon = 1 - Math.exp(-ntu);

  const dTneeded = qRequiredKW / Math.max(1e-6, epsilon * cAir);

  // 蒸发器：Tref < Tair_in，所以 Tref = Tair_in − dT
  // 冷凝器：Tref > Tair_in，所以 Tref = Tair_in + dT
  const Tref = params.kind === 'evaporator' ? TairInC - dTneeded : TairInC + dTneeded;

  // 检查物理可行：温差不能太大（蒸发器 Tref 不能低于 -40，冷凝器不能高于 80）
  const feasible = params.kind === 'evaporator' ? Tref > -40 : Tref < 80;

  // 验算
  const verify = heatExchangerExchange({ TrefC: Tref, TairInC, params });

  return {
    TrefC: Tref,
    feasible,
    qActualKW: verify.qActualKW,
    epsilon,
  };
}

/**
 * 典型换热器预设。
 */
export const sampleHeatExchangers = {
  /** 家用 1.5HP 空调蒸发器（室内机） */
  homeEvap15HP: {
    kind: 'evaporator',
    uaKWperK: 0.75,
    airFlowM3perS: 0.18,   // 中速档典型 650 m³/h
  } satisfies HeatExchangerParams,
  /** 家用 1.5HP 空调冷凝器（室外机） */
  homeCond15HP: {
    kind: 'condenser',
    uaKWperK: 1.05,
    airFlowM3perS: 0.5,    // 室外风扇典型 1800 m³/h
  } satisfies HeatExchangerParams,
  /** 商用 5HP 冷柜蒸发器 */
  commercialEvap5HP: {
    kind: 'evaporator',
    uaKWperK: 2.2,
    airFlowM3perS: 0.6,
  } satisfies HeatExchangerParams,
  /** 商用 5HP 冷柜冷凝器 */
  commercialCond5HP: {
    kind: 'condenser',
    uaKWperK: 3.0,
    airFlowM3perS: 1.3,
  } satisfies HeatExchangerParams,
};
