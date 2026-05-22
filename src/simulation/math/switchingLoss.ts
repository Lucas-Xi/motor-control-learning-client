/**
 * 逆变器开关损耗 + 导通损耗模型（Tier 2 物理真实化）。
 *
 * **为什么需要**：
 *   - 平均模型 inverterModel.ts 把损耗当 0；真实 IPM/MOSFET/SiC 模块损耗 = 系统效率的核心，
 *     家用变频空调全负荷损耗 30-80 W 不算夸张。
 *
 * **公式**：
 *   P_total = P_conduction + P_switching
 *
 *   IGBT: P_cond = V_ce_sat × I_rms × duty + R_ce × I_rms²
 *         P_sw  = (E_on + E_off) × f_sw × (I / I_ref) × (Vdc / V_ref)
 *
 *   MOSFET / SiC: P_cond = R_ds_on × I_rms²
 *                 P_sw  = 0.5 × Vdc × I × (t_r + t_f) × f_sw + C_oss × Vdc² × f_sw / 2
 *
 * **参考**：
 *   - Infineon AN2008-03 "IGBT Power Losses Calculation Using the Data-Sheet Parameters"
 *   - Wolfspeed CRD-22FF12N "SiC MOSFET Module Application Note"
 *   - Mohan / Undeland / Robbins《Power Electronics: Converters, Applications & Design》Ch.8
 *
 * **STM32 移植**：不在 ISR 里跑；放低频任务做"实时效率估算"上报 UI。
 */

export type DeviceType = 'IGBT' | 'MOSFET' | 'SiC';

export interface SwitchingLossParams {
  device: DeviceType;
  /** 开关频率 (Hz) */
  fsw: number;
  /** 母线电压 (V) */
  Vdc: number;
  /** 相电流 RMS (A) */
  IrmsPhase: number;
  /** 占空比平均 (0..1) */
  dutyAvg: number;
  /**
   * IGBT 专用：饱和压降 V_ce_sat (V)
   * MOSFET/SiC 用 R_ds_on 表征，本字段忽略
   */
  Vsat?: number;
  /** IGBT 等效串联电阻 (Ω) — small，正常 0.005-0.02 */
  Rce?: number;
  /** MOSFET/SiC 导通电阻 R_ds_on (Ω) */
  RdsOn?: number;
  /**
   * 开关损耗能量参数（IGBT datasheet 提供）：
   *   E_on / E_off 在参考工况 V_ref, I_ref 下的开关能量 (J)
   *   实际损耗按 (Vdc / V_ref) × (I_rms / I_ref) 线性缩放
   */
  Eon?: number;
  Eoff?: number;
  Vref?: number;
  Iref?: number;
  /** MOSFET/SiC：输出电容 C_oss (F) */
  Coss?: number;
  /** MOSFET/SiC：上升+下降时间和 (s) */
  trplustf?: number;
}

export interface SwitchingLossResult {
  /** 导通损耗 (W) */
  Pcond: number;
  /** 开关损耗 (W) */
  Psw: number;
  /** 总损耗 (W) */
  Ptotal: number;
  /** 效率（假设输出 = 输入 - 损耗） */
  efficiencyHint: number;
  /** 哪一项主导（教学用："你应该升频还是降流"） */
  dominant: 'conduction' | 'switching' | 'balanced';
}

export function switchingLoss(input: SwitchingLossParams): SwitchingLossResult {
  let Pcond = 0;
  let Psw = 0;

  if (input.device === 'IGBT') {
    const Vsat = input.Vsat ?? 1.8;
    const Rce = input.Rce ?? 0.012;
    Pcond = Vsat * input.IrmsPhase * input.dutyAvg + Rce * input.IrmsPhase * input.IrmsPhase;
    // 6 个器件（3 相 × 上下管）的开关损耗
    const Eon = input.Eon ?? 0.0008; // 0.8 mJ @ ref
    const Eoff = input.Eoff ?? 0.0012;
    const Vref = input.Vref ?? 600;
    const Iref = input.Iref ?? 20;
    const scale = (input.Vdc / Vref) * (input.IrmsPhase / Math.max(0.1, Iref));
    Psw = 6 * (Eon + Eoff) * input.fsw * Math.max(0, scale);
  } else {
    // MOSFET / SiC
    const Rds = input.RdsOn ?? (input.device === 'SiC' ? 0.025 : 0.05);
    Pcond = Rds * input.IrmsPhase * input.IrmsPhase * 3; // 3 相
    const tt = input.trplustf ?? (input.device === 'SiC' ? 30e-9 : 80e-9);
    const PswResistive = 6 * 0.5 * input.Vdc * input.IrmsPhase * tt * input.fsw;
    const Coss = input.Coss ?? (input.device === 'SiC' ? 300e-12 : 1500e-12);
    const PswCoss = 6 * Coss * input.Vdc * input.Vdc * input.fsw * 0.5;
    Psw = PswResistive + PswCoss;
  }

  const Ptotal = Pcond + Psw;
  const Pout = 1.5 * input.Vdc * input.IrmsPhase * input.dutyAvg; // 粗略 output power
  const efficiencyHint = Pout > 1 ? Pout / (Pout + Ptotal) : 0;
  let dominant: SwitchingLossResult['dominant'] = 'balanced';
  if (Pcond > Psw * 1.5) dominant = 'conduction';
  else if (Psw > Pcond * 1.5) dominant = 'switching';

  return { Pcond, Psw, Ptotal, efficiencyHint, dominant };
}

/**
 * 一阶 RC 结温模型：T_j = T_case + P × R_th_jc
 *   case 跟散热器，散热器跟环境，长时间稳态时 T_case ≈ T_amb + P × (R_th_cs + R_th_sa)。
 *
 * **教学用**：让学员看"长时间满载是否过热"。生产代码用 4 段 Cauer / Foster ladder 更精确。
 */
export interface ThermalRCParams {
  /** 结到 case 热阻 R_th_jc (K/W) */
  RthJC: number;
  /** Case 到散热器 R_th_cs (K/W) */
  RthCS: number;
  /** 散热器到环境 R_th_sa (K/W) */
  RthSA: number;
  /** Case 热时间常数 (s) — 决定快慢响应 */
  tauCase: number;
}

export const defaultThermalRC: ThermalRCParams = {
  RthJC: 0.4,
  RthCS: 0.15,
  RthSA: 1.5,
  tauCase: 30,
};

/** 计算给定瞬时损耗、case 温度下的结温（稳态近似） */
export function junctionTemperature(
  PlossW: number,
  TcaseC: number,
  params: ThermalRCParams = defaultThermalRC,
): number {
  return TcaseC + PlossW * params.RthJC;
}

/** 推进 case 温度一步（一阶滞后跟稳态 T_amb + P × (R_cs + R_sa)） */
export function stepCaseTemperature(
  TcurrentCaseC: number,
  TambientC: number,
  PlossW: number,
  dtSec: number,
  params: ThermalRCParams = defaultThermalRC,
): number {
  const Tsteady = TambientC + PlossW * (params.RthCS + params.RthSA);
  const alpha = Math.min(1, dtSec / Math.max(1e-3, params.tauCase));
  return TcurrentCaseC + (Tsteady - TcurrentCaseC) * alpha;
}

/** 三种器件的典型样本（用于卡片对比 / 默认值） */
export const sampleDevicePresets = {
  /** 家用变频空调主流：Sanken / Onsemi IGBT 600V/20A */
  igbt600v20a: {
    device: 'IGBT' as const,
    Vsat: 1.8,
    Rce: 0.012,
    Eon: 0.0008,
    Eoff: 0.0012,
    Vref: 600,
    Iref: 20,
  },
  /** 中高端 MOSFET：Infineon 600V Si 100mΩ */
  mosfetSi600v: {
    device: 'MOSFET' as const,
    RdsOn: 0.10,
    Coss: 1500e-12,
    trplustf: 80e-9,
  },
  /** SiC 高频高效：Wolfspeed C3M0065090D 900V 25mΩ */
  sicCarbide900v: {
    device: 'SiC' as const,
    RdsOn: 0.025,
    Coss: 300e-12,
    trplustf: 30e-9,
  },
} satisfies Record<string, Partial<SwitchingLossParams>>;
