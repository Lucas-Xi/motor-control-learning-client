import { wrapAngleRad } from '../../utils/clamp';

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
 *
 * === 工程要点 ===
 *   - 开关增益 K：足够大才能强制收敛，但太大放大抖振
 *   - 边界层 (boundary layer)：把 sign() 换成 sat(error/δ)，δ 是边界层宽度，平滑切换
 *   - LPF 截止频率：低频残留 BEMF 信息；过高 → 抖振；过低 → 相位滞后
 *   - 角度通过 atan2 提取后用 PLL 修正延迟
 */

export interface SMOState {
  /** 估算电流（αβ） */
  iAlphaEst: number;
  iBetaEst: number;
  /** 等效控制（开关函数原始输出） */
  zAlpha: number;
  zBeta: number;
  /** LPF 平滑后的等效控制 = BEMF 估算 */
  zAlphaLpf: number;
  zBetaLpf: number;
  /** PLL 状态 */
  pllAngle: number;
  pllOmega: number;
  pllIntegral: number;
}

export interface SMOConfig {
  rs: number;            // Ω
  ls: number;            // H（dq 等效电感平均值）
  smoGain: number;       // 开关函数增益 K（典型 30-200）
  boundaryLayer: number; // sat 边界层宽度 δ（A，典型 0.2-1.0）
  lpfCutoffHz: number;   // BEMF 低通截止（Hz，典型 50-200）
  pllKp: number;
  pllKi: number;
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
 * SMO 单步更新。每个 PWM 周期调用一次。
 *
 * @param state    上一步 SMO 状态（会被原地更新返回新对象）
 * @param vAlpha   αβ 系电压指令（V）
 * @param vBeta
 * @param iAlphaMeas 实测 αβ 电流（A）
 * @param iBetaMeas
 * @param cfg      算法配置
 * @param dt       采样周期（s）
 */
export function smoStep(
  state: SMOState,
  vAlpha: number, vBeta: number,
  iAlphaMeas: number, iBetaMeas: number,
  cfg: SMOConfig,
  dt: number,
): SMOState {
  // 1. 电流估算误差（开关面）
  const errA = state.iAlphaEst - iAlphaMeas;
  const errB = state.iBetaEst - iBetaMeas;

  // 2. 开关函数 + 边界层 → 等效控制
  const zA = -cfg.smoGain * sat(errA / cfg.boundaryLayer);
  const zB = -cfg.smoGain * sat(errB / cfg.boundaryLayer);

  // 3. 电流模型推进：L·di/dt = -R·i + v + z
  const iAlphaEst = state.iAlphaEst + ((-cfg.rs * state.iAlphaEst + vAlpha + zA) / cfg.ls) * dt;
  const iBetaEst  = state.iBetaEst  + ((-cfg.rs * state.iBetaEst  + vBeta  + zB) / cfg.ls) * dt;

  // 4. 把等效控制低通滤波 → BEMF 估算
  const lpfA = (2 * Math.PI * cfg.lpfCutoffHz * dt) / (1 + 2 * Math.PI * cfg.lpfCutoffHz * dt);
  const zAlphaLpf = state.zAlphaLpf + lpfA * (zA - state.zAlphaLpf);
  const zBetaLpf  = state.zBetaLpf  + lpfA * (zB  - state.zBetaLpf);

  // 5. 用 atan2 反推角度
  // BEMF 与角度关系：e_α = -ω·ψf·sin θ, e_β = ω·ψf·cos θ
  // → θ = atan2(-e_α, e_β)
  const thetaMeas = Math.atan2(-zAlphaLpf, zBetaLpf);

  // 6. PLL 跟踪平滑 θ_meas
  const pllErr = Math.atan2(Math.sin(thetaMeas - state.pllAngle), Math.cos(thetaMeas - state.pllAngle));
  const pllIntegral = state.pllIntegral + pllErr * dt;
  const pllOmega = cfg.pllKp * pllErr + cfg.pllKi * pllIntegral;
  const pllAngle = wrapAngleRad(state.pllAngle + pllOmega * dt);

  return {
    iAlphaEst, iBetaEst,
    zAlpha: zA, zBeta: zB,
    zAlphaLpf, zBetaLpf,
    pllAngle, pllOmega, pllIntegral,
  };
}

/**
 * 批量仿真：给定一段时间窗，输出 SMO 各阶段中间量便于教学可视化。
 *
 * 输入是简化的"理想电机"——已知真实角度 / 真实电流 / 真实 BEMF——
 * 喂给 SMO 让它"反推"一遍，对比真实值检验观测器质量。
 */
export interface SMOSimSample {
  t: number;             // ms
  iAlphaTrue: number;
  iAlphaEst: number;
  zAlphaLpf: number;     // 估算 BEMF α
  thetaTrue: number;     // 真实角度（°）
  thetaEst: number;      // PLL 估算角度（°）
  errorDeg: number;
  switchSurfaceA: number;  // 开关面 |i_est - i_meas|
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
  const totalSteps = 16000 * 0.06;     // 60ms
  const omega = (p.speedRpm * 2 * Math.PI / 60) * p.polePairs;
  const cfg: SMOConfig = {
    rs: p.rs,
    ls: p.lsMh / 1000,
    smoGain: p.smoGain,
    boundaryLayer: p.boundaryLayer,
    lpfCutoffHz: p.lpfCutoffHz,
    pllKp: p.pllKp,
    pllKi: p.pllKi,
  };
  let smo = createSMO();
  const samples: SMOSimSample[] = [];
  let outputCounter = 0;

  for (let step = 0; step < totalSteps; step++) {
    const t = step * dt;
    const thetaTrue = omega * t;
    // 假定一个稳态电流（教学简化：真实电流 = 反电动势除以阻抗）
    const eAlphaTrue = -omega * p.fluxLinkage * Math.sin(thetaTrue);
    const eBetaTrue  =  omega * p.fluxLinkage * Math.cos(thetaTrue);
    // 假设输入端电压 = 反电动势 +  R·i + L·di/dt（简化为稳态）
    const iAlphaTrue = (eAlphaTrue * 0) + 0.5 * Math.cos(thetaTrue);   // 演示电流
    const iBetaTrue  = (eBetaTrue  * 0) + 0.5 * Math.sin(thetaTrue);
    const vAlpha = p.rs * iAlphaTrue + eAlphaTrue;     // 稳态电压
    const vBeta  = p.rs * iBetaTrue  + eBetaTrue;

    // 加测量噪声
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
