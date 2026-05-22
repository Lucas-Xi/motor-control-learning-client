import {
  type Refrigerant,
  hLiqSat, hSubcooled, hSuperheated, hVapSat,
  pSat, rhoVapSat, polytropicN, tSat,
} from './refrigerantProps';
import { volumetricEfficiency, wagnerSaturationPressure } from './wagnerEq';
import { heatExchangerExchange, type HeatExchangerParams } from './heatExchanger';

/**
 * 单级蒸气压缩制冷循环（理想 4 状态点 + 多变压缩）。
 *
 *   1 ─→ 2 ：压缩机   多变压缩   P_s, h_v_sup     →  P_d, h_2
 *   2 ─→ 3 ：冷凝器   等压放热   P_d, h_2         →  P_d, h_l_sub
 *   3 ─→ 4 ：膨胀阀   等焓节流   P_d, h_l_sub     →  P_s, h_4 (h4=h3)
 *   4 ─→ 1 ：蒸发器   等压吸热   P_s, h_4         →  P_s, h_v_sup
 *
 * 教学级近似：
 *   - 压缩机用容积效率 η_v + 多变指数 n（不区分等熵效率/机械效率）
 *   - 蒸发/冷凝器假设无压损
 *   - 膨胀阀视为理想节流：开度只影响等效流通能力 vs 压差，不直接改 h
 */

export interface CycleState {
  /** 状态点编号 1..4 */
  index: 1 | 2 | 3 | 4;
  /** 压力 (MPa) */
  P: number;
  /** 温度 (°C) */
  T: number;
  /** 比焓 (kJ/kg) */
  h: number;
  /** 标签 */
  label: string;
}

export interface CycleInput {
  refrigerant: Refrigerant;
  /** 蒸发饱和温度 (°C) — 决定 P_s */
  Te: number;
  /** 冷凝饱和温度 (°C) — 决定 P_d */
  Tc: number;
  /** 蒸发器出口（即压缩机入口）过热度 (K) */
  superheatK: number;
  /** 冷凝器出口（即节流阀入口）过冷度 (K) */
  subcoolK: number;
  /** 压缩机排量 (cc/rev) */
  displacementCc: number;
  /** 余隙比 (clearance ratio)，决定容积效率，0.03-0.08 typical */
  clearanceRatio: number;
  /** 转速 (rpm) */
  rpm: number;
  /** 等熵效率（电气-机械-气动综合），0.55-0.85 typical */
  isentropicEff: number;
  /** 膨胀阀开度 0..1，决定通过能力 m_dot_max；当流量超过此值 → 排气压力实际飙升 */
  eevOpening: number;
  /**
   * 高保真模式开关（round-11 接入）：
   *   true (默认) → Wagner 方程（±1-2% 精度）+ 容积效率 3D 曲面（含转速/温度修正）
   *   false → 老 Antoine + 简单余隙比公式（教学回看用）
   * 不传字段时按 true 处理，保持工程级精度作为默认行为。
   */
  highFidelity?: boolean;
  /**
   * 接入 ε-NTU 换热器约束（round-15 第 2 项）：
   * 当提供时，simulateCycle 不再无条件接受用户给的 Te/Tc——
   * 而是用 ε-NTU 迭代求出满足"换热平衡 + 质量流量自洽"的实际 Tc/Te。
   * 提供方式：传入 evap + cond 两个 HeatExchangerParams（UA + 风量）
   *           外加空气进口温度（蒸发器=室内、冷凝器=室外）。
   * 不传字段则保持现有行为（直接吃用户输入的 Te / Tc）。
   */
  useHeatExchanger?: {
    evap: HeatExchangerParams;
    cond: HeatExchangerParams;
    /** 室内空气进口温度（°C），蒸发器吸热侧 */
    TindoorC: number;
    /** 室外空气进口温度（°C），冷凝器放热侧 */
    ToutdoorC: number;
  };
}

export interface CycleResult {
  states: [CycleState, CycleState, CycleState, CycleState];
  /** 压缩比 P_d/P_s */
  pressureRatio: number;
  /** 容积效率 (0..1) */
  volumetricEff: number;
  /** 质量流量 (kg/s) */
  massFlow: number;
  /** 制冷量 (kW) */
  Qc: number;
  /** 压缩机功率 (kW) — 即电机输出的有功 */
  Wcomp: number;
  /** COP */
  cop: number;
  /** 排气温度 (°C) — 状态点 2 */
  Tdischarge: number;
  /** 机械负载扭矩 (N·m) — 由 Wcomp / ω 算出，反馈给 FOC */
  torqueLoad: number;
  /** 单位排量循环功 (kJ/kg) */
  workSpec: number;
  /** EEV 是否限流 (true 表示流量被节流阀卡死，实际系统会被迫提高 P_d) */
  eevLimited: boolean;
  /** 警告信息 */
  warnings: string[];
}

/**
 * 计算稳态循环。
 *
 * 流程：
 *   1. 由 Te / Tc 算 P_s / P_d 和饱和焓
 *   2. 状态 1 = 过热气：P_s, T_e + superheat, h = h_v + cp_v×SH
 *   3. 状态 2 = 多变压缩：T2 = T1×(Pd/Ps)^((n-1)/n)；h2 用气相 cp 估算
 *   4. 状态 3 = 过冷液：P_d, T_c - subcool, h = h_l - cp_l×SC
 *   5. 状态 4 = 节流后两相：P_s, h4 = h3
 *   6. 容积效率 η_v = 1 - C·((Pd/Ps)^(1/n) - 1)
 *   7. m_dot = ρ_1 × V_disp × η_v × N(rps)
 *   8. Q_c = m_dot × (h1 - h4)
 *   9. W_comp = m_dot × (h2 - h1) / η_isentropic
 *  10. τ = W_comp / ω = W_comp / (2π × rpm/60)
 */
export function simulateCycle(input: CycleInput): CycleResult {
  const r = input.refrigerant;
  const warnings: string[] = [];

  // 边界检查
  if (input.Tc <= input.Te) warnings.push('冷凝温度必须高于蒸发温度');
  if (input.Tc > 75) warnings.push(`冷凝温度 ${input.Tc.toFixed(1)}°C 接近临界温度，模型外推`);

  // round-15 step B：若提供换热器约束，先迭代求出与 HX 平衡的 Te / Tc
  // 算法：从用户输入的 Te/Tc 出发，跑 3 次"裸循环 → 提取 Q → HX 反求 Tref → 松弛更新"
  let Te = input.Te;
  let Tc = input.Tc;
  if (input.useHeatExchanger) {
    const hx = input.useHeatExchanger;
    for (let iter = 0; iter < 4; iter += 1) {
      // 用当前 Te/Tc 跑一次"轻量"循环估算 Qc / Qd（与下面主体逻辑一致但只取关键量）
      const hd_iter = input.highFidelity !== false;
      const PsIt = hd_iter ? wagnerSaturationPressure(Te, r) : pSat(Te, r);
      const PdIt = hd_iter ? wagnerSaturationPressure(Tc, r) : pSat(Tc, r);
      const pri = PdIt / Math.max(1e-6, PsIt);
      const nIt = polytropicN(r);
      const T1i = Te + input.superheatK;
      const h1i = hSuperheated(Te, input.superheatK, r);
      const T1iK = T1i + 273.15;
      const T2iK = T1iK * Math.pow(pri, (nIt - 1) / nIt);
      const Tsat_di = tSat(PdIt, r);
      const h_v_at_Pd = hVapSat(Tsat_di, r);
      const dischSHi = Math.max(0, T2iK - 273.15 - Tsat_di);
      const h2_iseni = h_v_at_Pd + cpVapor(r) * dischSHi;
      const h2i = h1i + (h2_iseni - h1i) / Math.max(0.3, input.isentropicEff);
      const h3i = hSubcooled(Tc, input.subcoolK, r);
      const h4i = h3i;
      const etaVit = hd_iter
        ? volumetricEfficiency({
            clearanceRatio: input.clearanceRatio, pressureRatio: pri,
            polytropicN: nIt, rpm: input.rpm, rpmRated: 3000, TsucC: T1i,
          }).eta_v
        : Math.max(0.05, 1 - input.clearanceRatio * (Math.pow(pri, 1 / nIt) - 1));
      const rho1i = rhoVapSat(Te, r) * ((Te + 273.15) / T1iK);
      const Vdispi = (input.displacementCc * 1e-6) * (input.rpm / 60);
      const mDoti = rho1i * Vdispi * etaVit;
      const QcEst = mDoti * (h1i - h4i);                 // 蒸发器需吸的热 (kW)
      const QdEst = mDoti * (h2i - h3i);                 // 冷凝器要散的热 (kW)

      // ε-NTU 反求：给定 Q 与空气进口温度，反推制冷剂侧饱和温度
      const evapExch = heatExchangerExchange({ TrefC: Te, TairInC: hx.TindoorC, params: hx.evap });
      const condExch = heatExchangerExchange({ TrefC: Tc, TairInC: hx.ToutdoorC, params: hx.cond });
      // 用换热效能 + Q 反推：T_ref_new = T_air - Q / (ε · C_air) (蒸发) 或 + (冷凝)
      const cAirEvap = evapExch.cAirKWperK;
      const cAirCond = condExch.cAirKWperK;
      const epsEvap = evapExch.epsilon || 0.5;
      const epsCond = condExch.epsilon || 0.5;
      const TeNew = hx.TindoorC - QcEst / Math.max(1e-3, epsEvap * cAirEvap);
      const TcNew = hx.ToutdoorC + QdEst / Math.max(1e-3, epsCond * cAirCond);

      // 0.6 松弛系数防过冲
      Te = Te * 0.4 + TeNew * 0.6;
      Tc = Tc * 0.4 + TcNew * 0.6;
    }
    warnings.push(`HX 约束：Te = ${Te.toFixed(1)}°C, Tc = ${Tc.toFixed(1)}°C（输入 ${input.Te.toFixed(1)}/${input.Tc.toFixed(1)}）`);
  }

  // 高保真模式（默认）→ Wagner ±1-2%；回退模式 → Antoine ±5%
  const hd = input.highFidelity !== false;
  const Ps = hd ? wagnerSaturationPressure(Te, r) : pSat(Te, r);
  const Pd = hd ? wagnerSaturationPressure(Tc, r) : pSat(Tc, r);
  const pressureRatio = Pd / Math.max(1e-6, Ps);
  const n = polytropicN(r);

  // 状态 1：吸气过热气（用迭代后的 Te；无 HX 约束时与 input.Te 相同）
  const T1 = Te + input.superheatK;
  const h1 = hSuperheated(Te, input.superheatK, r);

  // 状态 2：多变压缩排气
  const T1_K = T1 + 273.15;
  const T2_K = T1_K * Math.pow(pressureRatio, (n - 1) / n);
  const T2 = T2_K - 273.15;
  // 排气焓：以 P_d 上的饱和气为基准，加过热段 cp 偏移
  const Tsat_d = tSat(Pd, r);
  const h_v_at_Pd = hVapSat(Tsat_d, r);
  const dischSH = Math.max(0, T2 - Tsat_d);
  const h2_isentropic = h_v_at_Pd + cpVapor(r) * dischSH;
  // 实际排气焓 = h1 + (h2_等熵 - h1) / η_isentropic（比理想多消耗的功转化为额外焓升）
  const h2 = h1 + (h2_isentropic - h1) / Math.max(0.3, input.isentropicEff);

  // 状态 3：冷凝出口过冷液（用迭代后的 Tc）
  const T3 = Tc - input.subcoolK;
  const h3 = hSubcooled(Tc, input.subcoolK, r);

  // 状态 4：节流后（h 不变）
  const T4 = Te;             // 蒸发温度对应的两相区
  const h4 = h3;

  // 容积效率：高保真用 3D 曲面（基础 × 转速因子 × 温度因子）；简版只看余隙×压比
  const C = input.clearanceRatio;
  const volumetricEff = hd
    ? volumetricEfficiency({
        clearanceRatio: C,
        pressureRatio,
        polytropicN: n,
        rpm: input.rpm,
        rpmRated: 3000,
        TsucC: T1,
      }).eta_v
    : Math.max(0.05, 1 - C * (Math.pow(pressureRatio, 1 / n) - 1));

  // 入口气相密度（过热气，等压理想气体近似 PV = mRT → ρ ∝ 1/T）。
  // 过热度 ↑ → T1 > Te → 密度下降 → 质量流量下降。
  // 历史上这里写成 ρ_sat×(T1/Te) 把比值颠倒，过热度越大反而流量越大，与热力学相反。
  // 参考：ASHRAE Handbook · Fundamentals 第 30 章 Thermophysical Properties of Refrigerants。
  const rho1 = rhoVapSat(Te, r) * ((Te + 273.15) / T1_K);

  // 排量 (m³/s) = displacement × rpm / 60
  const Vdisp = (input.displacementCc * 1e-6) * (input.rpm / 60);

  // 质量流量 m_dot
  let mDot = rho1 * Vdisp * volumetricEff;

  // EEV 限流：开度等效一个 m_dot_max。若超过 → 系统实际无法稳态在此 Tc/Te，会自动抬高 Pd（这里仅警告）
  const mDotMax = 0.005 + input.eevOpening * 0.04;     // 0..0.045 kg/s 量级
  let eevLimited = false;
  if (mDot > mDotMax) {
    eevLimited = true;
    warnings.push('EEV 开度限制：实际系统会抬高排气压力或转子降速来匹配');
    mDot = mDotMax;
  }

  // 制冷量 / 压缩功 / COP
  const Qc = mDot * (h1 - h4);                  // kW (kJ/s)
  const Wcomp = mDot * (h2 - h1);               // kW
  const cop = Wcomp > 1e-6 ? Qc / Wcomp : 0;
  const workSpec = h2 - h1;

  // 机械负载扭矩
  const omega = (2 * Math.PI * input.rpm) / 60; // rad/s
  const torqueLoad = omega > 1e-3 ? (Wcomp * 1000) / omega : 0;  // N·m，Wcomp×1000 把 kW → W

  const states: [CycleState, CycleState, CycleState, CycleState] = [
    { index: 1, P: Ps, T: T1, h: h1, label: '吸气过热' },
    { index: 2, P: Pd, T: T2, h: h2, label: '排气' },
    { index: 3, P: Pd, T: T3, h: h3, label: '冷凝过冷' },
    { index: 4, P: Ps, T: T4, h: h4, label: '节流后两相' },
  ];

  return {
    states,
    pressureRatio,
    volumetricEff,
    massFlow: mDot,
    Qc,
    Wcomp,
    cop,
    Tdischarge: T2,
    torqueLoad,
    workSpec,
    eevLimited,
    warnings,
  };
}

function cpVapor(r: Refrigerant): number {
  return r === 'R32' ? 1.05 : r === 'R410A' ? 0.97 : 1.02;
}

/** 输入扭矩 + 电机参数，反算所需 Iq。教学用：把"系统侧"和"电机侧"挂起来。 */
export function torqueToIq(torque_Nm: number, polePairs: number, fluxWb: number, ld_H = 0, lq_H = 0, id_A = 0): number {
  // τ = 1.5·Pp·(ψf·Iq + (Ld-Lq)·Id·Iq)
  const denom = 1.5 * polePairs * (fluxWb + (ld_H - lq_H) * id_A);
  if (Math.abs(denom) < 1e-6) return 0;
  return torque_Nm / denom;
}
