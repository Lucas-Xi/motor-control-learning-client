import { wrapAngleRad } from '../../utils/clamp';
import { clampError } from './limits';

/**
 * 滑模观测器（Sliding Mode Observer, SMO）
 * 工业压缩机变频器的标配中高速无感方案。
 *
 * === 算法 ===
 *
 *   αβ 静止系电机方程：
 *     L·di_α/dt = -R·i_α + v_α - e_α
 *     L·di_β/dt = -R·i_β + v_β - e_β
 *   其中 e_α = -ω·ψf·sin θ, e_β = ω·ψf·cos θ 是反电动势。
 *
 *   SMO 用"电流估算误差"作为开关面 S = i_est - i_meas，强制 S → 0：
 *     L·di_est/dt = -R·i_est + v - z
 *     z = K · sat(i_est - i_meas)         (sat 替代 sign 抑制抖振)
 *
 *   滑模成立后（误差被强制为 0），等效控制 z 即等于真实反电动势 e：
 *     z ≈ e_α, e_β     (经低通滤波平滑)
 *
 *   再用 PLL 锁相得到平滑的 θ_est：
 *     θ_meas = atan2(-z_α_lpf, z_β_lpf)
 *     PLL 跟踪 θ_meas 输出 θ_est, ω_est
 */

export interface SMOState {
  iAlphaEst: number;
  iBetaEst: number;
  zAlpha: number;
  zBeta: number;
  zAlphaLpf: number;
  zBetaLpf: number;
  pllAngle: number;
  pllOmega: number;
  pllIntegral: number;
}

export interface SMOConfig {
  rs: number;
  ls: number;
  smoGain: number;
  boundaryLayer: number;
  lpfCutoffHz: number;
  pllKp: number;
  pllKi: number;
}

export interface SMOConfigPrecomputed extends SMOConfig {
  _lpfA: number;
  _invLs: number;
  _rsOverLs: number;
}

export function createSMO(): SMOState {
  return {
    iAlphaEst: 0, iBetaEst: 0,
    zAlpha: 0, zBeta: 0,
    zAlphaLpf: 0, zBetaLpf: 0,
    pllAngle: 0, pllOmega: 0, pllIntegral: 0,
  };
}

/** 边界层 sat 函数：|x| < 1 时线性，否则截断到 ±1 */
function sat(x: number): number {
  return x > 1 ? 1 : x < -1 ? -1 : x;
}

/**
 * 预计算 SMO 配置中不随时间变化的系数（lpfA, invLs, rsOverLs）。
 * 当 cfg 或 dt 不变时只需调用一次，避免每步重算。
 */
export function precomputeSmoConfig(cfg: SMOConfig, dt: number): SMOConfigPrecomputed {
  const dtSafe = Math.max(dt, 1e-9);
  const fc = Math.max(cfg.lpfCutoffHz, 1);
  const twopiFcDt = 2 * Math.PI * fc * dtSafe;
  const _lpfA = twopiFcDt / (1 + twopiFcDt);
  const ls = Math.max(cfg.ls, 1e-12);
  return {
    ...cfg,
    _lpfA,
    _invLs: 1 / ls,
    _rsOverLs: cfg.rs,
  };
}

/**
 * SMO 单步更新。
 *
 * @param state    上一步 SMO 状态（会被原地更新返回新对象）
 * @param vAlpha   αβ 系电压指令（V）
 * @param vBeta
 * @param iAlphaMeas 实测 αβ 电流（A）
 * @param iBetaMeas
 * @param cfg      算法配置（含预计算字段）
 * @param dt       采样周期（s）
 */
export function smoStep(
  state: SMOState,
  vAlpha: number, vBeta: number,
  iAlphaMeas: number, iBetaMeas: number,
  cfg: SMOConfigPrecomputed,
  dt: number,
): SMOState {
  const dtSafe = Math.max(dt, 1e-9);

  // NaN/Inf 安全防护
  const vA = clampError(vAlpha, -1e6, 1e6);
  const vB = clampError(vBeta, -1e6, 1e6);
  const iMeasA = clampError(iAlphaMeas, -1e6, 1e6);
  const iMeasB = clampError(iBetaMeas, -1e6, 1e6);

  // 1. 电流估算误差（开关面）
  const errA = state.iAlphaEst - iMeasA;
  const errB = state.iBetaEst - iMeasB;

  // 2. 边界层安全下限，防止除以零
  const bl = Math.max(cfg.boundaryLayer, 1e-6);
  const zA = -cfg.smoGain * sat(errA / bl);
  const zB = -cfg.smoGain * sat(errB / bl);

  // 3. 电流模型推进（使用预计算 invLs 和 rsOverLs 减少除法）
  const diAlpha = (-cfg._rsOverLs * state.iAlphaEst + vA + zA) * cfg._invLs * dtSafe;
  const diBeta  = (-cfg._rsOverLs * state.iBetaEst  + vB + zB) * cfg._invLs * dtSafe;
  const iAlphaEst = state.iAlphaEst + diAlpha;
  const iBetaEst  = state.iBetaEst  + diBeta;

  // 4. LPF → BEMF 估算（使用预计算 lpfA）
  const zAlphaLpf = state.zAlphaLpf + cfg._lpfA * (zA - state.zAlphaLpf);
  const zBetaLpf  = state.zBetaLpf  + cfg._lpfA * (zB - state.zBetaLpf);

  // 5. atan2 反推角度
  const thetaMeas = Math.atan2(-zAlphaLpf, zBetaLpf);

  // 6. PLL 跟踪平滑
  const pllErr = Math.atan2(Math.sin(thetaMeas - state.pllAngle), Math.cos(thetaMeas - state.pllAngle));
  const pllIntegral = state.pllIntegral + clampError(pllErr, -100, 100) * dtSafe;
  const pllOmega = cfg.pllKp * pllErr + cfg.pllKi * pllIntegral;
  const pllAngle = wrapAngleRad(state.pllAngle + pllOmega * dtSafe);

  return {
    iAlphaEst, iBetaEst,
    zAlpha: zA, zBeta: zB,
    zAlphaLpf, zBetaLpf,
    pllAngle, pllOmega, pllIntegral,
  };
}

/**
 * 批量仿真：给定一段时间窗，输出 SMO 各阶段中间量便于教学可视化。
 */
export interface SMOSimSample {
  t: number;
  iAlphaTrue: number;
  iAlphaEst: number;
  zAlphaLpf: number;
  thetaTrue: number;
  thetaEst: number;
  errorDeg: number;
  switchSurfaceA: number;
}

export interface SMOSimParams {
  speedRpm: number;
  polePairs: number;
  rs: number;
  lsMh: number;
  fluxLinkage: number;
  smoGain: number;
  boundaryLayer: number;
  lpfCutoffHz: number;
  pllKp: number;
  pllKi: number;
  noise: number;
}

export function simulateSMO(p: SMOSimParams): SMOSimSample[] {
  const dt = 1 / 16000;
  const totalSteps = 16000 * 0.06;
  const omega = (p.speedRpm * 2 * Math.PI / 60) * p.polePairs;
  const cfg = precomputeSmoConfig({
    rs: p.rs,
    ls: p.lsMh / 1000,
    smoGain: p.smoGain,
    boundaryLayer: p.boundaryLayer,
    lpfCutoffHz: p.lpfCutoffHz,
    pllKp: p.pllKp,
    pllKi: p.pllKi,
  }, dt);
  let smo = createSMO();
  const samples: SMOSimSample[] = [];
  let outputCounter = 0;

  for (let step = 0; step < totalSteps; step++) {
    const t = step * dt;
    const thetaTrue = omega * t;
    const eAlphaTrue = -omega * p.fluxLinkage * Math.sin(thetaTrue);
    const eBetaTrue  =  omega * p.fluxLinkage * Math.cos(thetaTrue);
    const iAlphaTrue = 0.5 * Math.cos(thetaTrue);
    const iBetaTrue  = 0.5 * Math.sin(thetaTrue);
    const vAlpha = p.rs * iAlphaTrue + eAlphaTrue;
    const vBeta  = p.rs * iBetaTrue  + eBetaTrue;

    const noiseA = (Math.random() - 0.5) * 2 * p.noise;
    const noiseB = (Math.random() - 0.5) * 2 * p.noise;

    smo = smoStep(smo, vAlpha, vBeta, iAlphaTrue + noiseA, iBetaTrue + noiseB, cfg, dt);

    if (++outputCounter >= 16) {
      outputCounter = 0;
      const errSigned = Math.atan2(Math.sin(thetaTrue - smo.pllAngle), Math.cos(thetaTrue - smo.pllAngle));
      samples.push({
        t: t * 1000,
        iAlphaTrue,
        iAlphaEst: smo.iAlphaEst,
        zAlphaLpf: smo.zAlphaLpf,
        thetaTrue: ((thetaTrue * 180 / Math.PI) % 360 + 360) % 360,
        thetaEst: ((smo.pllAngle * 180 / Math.PI) % 360 + 360) % 360,
        errorDeg: errSigned * 180 / Math.PI,
        switchSurfaceA: Math.abs(smo.iAlphaEst - iAlphaTrue - noiseA),
      });
    }
  }
  return samples;
}