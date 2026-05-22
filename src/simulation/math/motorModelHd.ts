/**
 * 高保真 PMSM 模型 (HD = High-fidelity Drop-in)。
 *
 * 把 round-10 Tier 1 + Tier 2 全部物理效应串成一个 step 函数：
 *   • saturation.ts ：Ld(id,iq), Lq(id,iq) 交叉饱和
 *   • ironLoss.ts ：Bertotti 三项铁损（耗电流环外的功率）
 *   • cogging.ts  ：齿槽转矩 + BEMF 5/7/11/13 空间谐波（影响转矩纹波）
 *   • friction.ts ：Stribeck + Coulomb + 黏性复合摩擦
 *   • thermalRsFlux.ts ：温度补偿 Rs / ψf + 退磁告警
 *
 * **本模型 vs motorModel.ts**：
 *   - motorModel.ts 保留为"教学入门简版"（5 行 dq 方程 + 常量参数）
 *   - motorModelHd.ts 是"高保真"——学员可选用，看到所有真实效应
 *   - 接口同构（input/output schema 兼容），易于切换
 *
 * **教学意义**：让学员能 A/B 对比两个模型在同一工况下的输出差异，
 *   直观看见"假定 = 简单模型 vs 真实电机"的距离。
 */

import type { PMSMParameters, PMSMState } from './motorModel';
import { saturatedInductances, type SaturationParams, sampleSaturationParams } from './saturation';
import { ironLoss, defaultIronLossParams, type IronLossParams } from './ironLoss';
import { coggingTorque, bemfWithHarmonics, defaultBemfHarmonics, type CoggingParams, sampleCoggingParams } from './cogging';
import { compoundFriction, type FrictionParams, sampleFrictionParams } from './friction';
import { compensateForTemperature, type ThermalParams, defaultThermalParams } from './thermalRsFlux';

export interface MotorModelHdConfig {
  /** PMSM 基础参数（基准温度下） */
  base: PMSMParameters;
  /** 饱和参数；不给默认用 hitachi15HP */
  saturation?: SaturationParams;
  /** 铁损参数 */
  ironLoss?: IronLossParams;
  /** 齿槽参数 */
  cogging?: CoggingParams;
  /** 摩擦参数 */
  friction?: FrictionParams;
  /** 温度依赖参数 */
  thermal?: ThermalParams;
  /** 启用各物理效应的总开关——学员可单独关掉看影响 */
  enable?: {
    saturation?: boolean;
    ironLoss?: boolean;
    cogging?: boolean;
    bemfHarmonics?: boolean;
    friction?: boolean;
    thermalComp?: boolean;
  };
}

export interface MotorModelHdInput {
  vd: number;
  vq: number;
  loadTorque: number;
  dt: number;
  /** 电机当前绕组温度 (°C) */
  windingTempC: number;
  config: MotorModelHdConfig;
  state: PMSMState;
}

export interface MotorModelHdResult {
  state: PMSMState;
  /** 物理诊断：本步累计损耗与瞬时数值 */
  diagnostics: {
    /** 当前 (Ld, Lq) — 反映饱和状态 */
    ld: number;
    lq: number;
    saliency: number;
    /** 铁损 (W) */
    ironLossW: number;
    /** 铜损 (W) */
    copperLossW: number;
    /** 齿槽转矩 (N·m) */
    coggingTorqueNm: number;
    /** 摩擦转矩 (N·m) */
    frictionTorqueNm: number;
    /** 温度补偿后的 Rs (Ω) */
    rsCompensated: number;
    /** 温度补偿后的 ψf (Wb) */
    fluxCompensated: number;
    /** 是否触发退磁告警 */
    demagAlarm: boolean;
    /** 与 motorModel.ts 简版的转矩偏差 (% 相对) */
    torqueDeviationFromSimplePct: number;
  };
}

/**
 * 高保真 PMSM 单步推进。
 *
 * 与 stepPmsmModel 同构的入参 / 状态机；额外返回 diagnostics 让 UI 显示物理细节。
 */
export function stepPmsmModelHd(input: MotorModelHdInput): MotorModelHdResult {
  const { config, state } = input;
  const dt = Math.max(input.dt, 1e-6);
  const enable = config.enable ?? {};

  // 1. 温度补偿 Rs, ψf
  const baseline = { rs0: config.base.rs, flux0: config.base.flux };
  const thermal = enable.thermalComp !== false
    ? compensateForTemperature(input.windingTempC, baseline, config.thermal ?? defaultThermalParams)
    : { rs: config.base.rs, flux: config.base.flux, rsRisePct: 0, fluxDropPct: 0, demagAlarm: false, demagMarginK: 100 };

  // 2. 饱和电感
  const satParams = config.saturation ?? {
    ld0: config.base.ld,
    lq0: config.base.lq,
    iRated: 10,
    ad: sampleSaturationParams.hitachi15HP.ad,
    bd: sampleSaturationParams.hitachi15HP.bd,
    aq: sampleSaturationParams.hitachi15HP.aq,
    bq: sampleSaturationParams.hitachi15HP.bq,
    knee: sampleSaturationParams.hitachi15HP.knee,
  };
  const sat = enable.saturation !== false
    ? saturatedInductances(state.id, state.iq, satParams)
    : { ld: config.base.ld, lq: config.base.lq, saliency: config.base.lq / config.base.ld, margin: 1 };

  // 3. dq 电压方程（用补偿后的 Rs / ψf 与饱和后的 Ld / Lq）
  const omegaElec = state.omegaMechanical * config.base.polePairs;
  const did = (input.vd - thermal.rs * state.id + omegaElec * sat.lq * state.iq) / sat.ld;
  const diq = (input.vq - thermal.rs * state.iq - omegaElec * (sat.ld * state.id + thermal.flux)) / sat.lq;
  const id = state.id + did * dt;
  const iq = state.iq + diq * dt;

  // 4. 电磁转矩（含磁阻转矩）+ 齿槽 + BEMF 谐波修正
  const Te_em = 1.5 * config.base.polePairs * (thermal.flux * iq + (sat.ld - sat.lq) * id * iq);

  // BEMF 谐波对 q 轴会形成 6 倍频转矩纹波（教学近似：直接叠到 Te 上）
  let Te_harmonic = 0;
  if (enable.bemfHarmonics !== false && Math.abs(omegaElec) > 1) {
    // 用 5/7 次谐波幅值估算其对 Te 的贡献
    const harmRipple = 0.04 * Te_em * Math.sin(6 * state.thetaMechanical * config.base.polePairs);
    Te_harmonic = harmRipple;
  }

  const cogParams = config.cogging ?? { ...sampleCoggingParams.hitachi15HP, polePairs: config.base.polePairs };
  const Tcog = enable.cogging !== false
    ? coggingTorque(state.thetaMechanical, cogParams).torque
    : 0;

  const Te = Te_em + Te_harmonic + Tcog;

  // 5. 摩擦力矩
  const frictionParams = config.friction ?? sampleFrictionParams.hitachi15HP;
  const Tfriction = enable.friction !== false
    ? compoundFriction(state.omegaMechanical, frictionParams)
    : config.base.damping * state.omegaMechanical;

  // 6. 机械方程：J × dω/dt = Te − Tload − Tfriction
  const Jnet = Math.max(1e-9, config.base.inertia);
  const domega = (Te - input.loadTorque - Tfriction) / Jnet;
  const omegaMechanical = state.omegaMechanical + domega * dt;
  const thetaMechanical = state.thetaMechanical + omegaMechanical * dt;

  // 7. 诊断：铁损 + 铜损
  const ironP = enable.ironLoss !== false
    ? ironLoss(omegaElec, iq, config.ironLoss ?? defaultIronLossParams).total
    : 0;
  const copperP = 1.5 * (id * id + iq * iq) * thermal.rs;

  // 8. 与简版 motorModel.ts 的偏差对比（教学用）
  const Te_simple = 1.5 * config.base.polePairs * (config.base.flux * iq + (config.base.ld - config.base.lq) * id * iq);
  const deviationPct = Math.abs(Te_simple) > 1e-6 ? ((Te - Te_simple) / Te_simple) * 100 : 0;

  return {
    state: {
      id,
      iq,
      omegaMechanical,
      thetaMechanical,
      torque: Te,
    },
    diagnostics: {
      ld: sat.ld,
      lq: sat.lq,
      saliency: sat.saliency,
      ironLossW: ironP,
      copperLossW: copperP,
      coggingTorqueNm: Tcog,
      frictionTorqueNm: Tfriction,
      rsCompensated: thermal.rs,
      fluxCompensated: thermal.flux,
      demagAlarm: thermal.demagAlarm,
      torqueDeviationFromSimplePct: deviationPct,
    },
  };
}

/** 高保真 BEMF 瞬时值（含空间谐波，用于 observer 仿真） */
export function instantaneousBemfHd(
  thetaElecRad: number,
  flux: number,
  omegaElecRadS: number,
): number {
  return bemfWithHarmonics(thetaElecRad, flux, omegaElecRadS, defaultBemfHarmonics);
}
