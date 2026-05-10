import {
  type Refrigerant,
  hLiqSat, hSubcooled, hSuperheated, hVapSat,
  pSat, rhoVapSat, polytropicN, tSat,
} from './refrigerantProps';

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

  const Ps = pSat(input.Te, r);
  const Pd = pSat(input.Tc, r);
  const pressureRatio = Pd / Ps;
  const n = polytropicN(r);

  // 状态 1：吸气过热气
  const T1 = input.Te + input.superheatK;
  const h1 = hSuperheated(input.Te, input.superheatK, r);

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

  // 状态 3：冷凝出口过冷液
  const T3 = input.Tc - input.subcoolK;
  const h3 = hSubcooled(input.Tc, input.subcoolK, r);

  // 状态 4：节流后（h 不变）
  const T4 = input.Te;       // 蒸发温度对应的两相区
  const h4 = h3;

  // 容积效率
  const C = input.clearanceRatio;
  const volumetricEff = Math.max(0.05, 1 - C * (Math.pow(pressureRatio, 1 / n) - 1));

  // 入口气相密度
  const rho1 = rhoVapSat(input.Te, r) * (T1_K / (input.Te + 273.15)); // 过热修正（理想气体近似）

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
