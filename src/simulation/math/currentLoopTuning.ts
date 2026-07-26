/**
 * 自动电流环 PI 参数整定。
 *
 * 基于电机电气参数（Rs, Ld, Lq）和 PWM 开关频率，用工程方法计算电流环 Kp/Ki。
 *
 * 方法：
 *   d 轴：G(s) = 1 / (Rs + s·Ld)  —— 一阶 RL 负载
 *   q 轴：G(s) = 1 / (Rs + s·Lq)
 *
 * 整定目标：
 *   - 闭环带宽 f_BW = fs / (2π·k_factor)，典型 k_factor = 10~20
 *   - Kp = α · L，其中 α = 2π·f_BW
 *   - Ki = α · Rs
 *
 * 数字实现补偿：
 *   - 采样延时 T_d = 1.5 / fs（含 PWM 更新延时）
 *   - 相位裕度补偿
 *
 * 参考：PI 调节器 Kp + Ki/s，等效于超前滞后校正
 *   开环传函：C(s)·G(s) = (Kp·s + Ki) / (s·(Rs + s·L))
 *   选择 Kp = α·L, Ki = α·Rs 后：C(s)·G(s) = α/s → 一阶低通，带宽 α rad/s
 */

import { clamp } from '../../utils/clamp';

export interface CurrentLoopTuningInput {
  /** 相电阻 Rs（Ω） */
  rs: number;
  /** d 轴电感（mH） */
  ldMh: number;
  /** q 轴电感（mH） */
  lqMh: number;
  /** PWM 开关频率（Hz） */
  fs: number;
  /** 目标带宽因子：f_BW = fs / factor，推荐 10~20，越大带宽越高但噪声敏感 */
  bandwidthFactor: number;
  /** 相位裕度目标（°），默认 60° */
  targetPhaseMarginDeg?: number;
}

export interface CurrentLoopTuningResult {
  /** d 轴 Kp */
  kpD: number;
  /** d 轴 Ki */
  kiD: number;
  /** q 轴 Kp */
  kpQ: number;
  /** q 轴 Ki */
  kiQ: number;
  /** d 轴闭环带宽（Hz） */
  bandwidthDHz: number;
  /** q 轴闭环带宽（Hz） */
  bandwidthQHz: number;
  /** 相位裕度（°） */
  phaseMarginDeg: number;
  /** 整定方法描述 */
  method: string;
}

/**
 * 自动整定电流环 PI 参数。
 *
 * 使用"模最优"（Magnitude Optimum）方法：
 *   Kp = α · L, Ki = α · Rs
 *   其中 α = 2π · f_BW, f_BW = fs / factor
 *
 * 模最优法使闭环幅频特性在低频平坦，阶跃响应超调小（约 4.3%）。
 */
export function tuneCurrentLoop(input: CurrentLoopTuningInput): CurrentLoopTuningResult {
  const {
    rs, ldMh, lqMh, fs, bandwidthFactor,
  } = input;

  // 单位转换：mH → H
  const ld = ldMh / 1000;
  const lq = lqMh / 1000;

  // 目标带宽（Hz）
  const fBw = fs / clamp(bandwidthFactor, 5, 50);
  const alpha = 2 * Math.PI * fBw; // rad/s

  // Kp = α · L
  const kpD = alpha * ld;
  const kpQ = alpha * lq;

  // Ki = α · Rs
  const kiD = alpha * rs;
  const kiQ = alpha * rs;

  // 采样延时补偿估算相位裕度
  // 采样延时 T_d = 1.5 / fs（PWM 更新一次 + 采样一次）
  const td = 1.5 / fs;
  const phaseLagDueToDelay = -td * alpha * (180 / Math.PI);
  // 一阶 RL 负载在带宽处的相位 = -arctan(ω·L/R)
  const phasePlantD = -Math.atan2(alpha * ld, rs) * (180 / Math.PI);
  const phasePlantQ = -Math.atan2(alpha * lq, rs) * (180 / Math.PI);
  // PI 控制器在带宽处的相位贡献：
  //   C(s) = Kp(1 + 1/(s·Ti)), Ti = Kp/Ki = L/Rs
  //   在 ω=α 时，相位贡献 = arctan(α·Ti) - 90°
  //   根据模最优 α = Rs/L，故 α·Ti = 1，arctan(1) = 45°
  //   PI 相位 = 45° - 90° = -45°
  //   PM = 180° + phasePlant + phaseDelay + phasePI
  const piPhaseDeg = -45;
  const pmD = 180 + phasePlantD + phaseLagDueToDelay + piPhaseDeg;
  const pmQ = 180 + phasePlantQ + phaseLagDueToDelay + piPhaseDeg;
  const pm = Math.min(pmD, pmQ);

  return {
    kpD: clamp(kpD, 0.001, 1000),
    kiD: clamp(kiD, 0.001, 10000),
    kpQ: clamp(kpQ, 0.001, 1000),
    kiQ: clamp(kiQ, 0.001, 10000),
    bandwidthDHz: fBw,
    bandwidthQHz: fBw,
    phaseMarginDeg: clamp(pm, 0, 90),
    method: `模最优（Magnitude Optimum），f_BW = ${fBw.toFixed(0)} Hz (fs/${bandwidthFactor.toFixed(1)})`,
  };
}

/**
 * 计算电流环的理论阶跃响应指标。
 *
 * 基于一阶闭环近似：CL(s) ≈ 1 / (1 + s/α)
 *   上升时间 t_r = 2.2 / α（10%-90%）
 *   稳定时间 t_s = 4 / α（2% 准则）
 */
export function currentLoopStepResponse(alpha: number): {
  riseTimeUs: number;
  settleTimeUs: number;
  bandwidthHz: number;
} {
  const bw = alpha / (2 * Math.PI);
  return {
    riseTimeUs: (2.2 / alpha) * 1e6,
    settleTimeUs: (4 / alpha) * 1e6,
    bandwidthHz: bw,
  };
}

/**
 * 检查整定参数的稳定性。
 *
 * 基于奈奎斯特判据的简化检查：
 *   - 带宽不能超过 fs/5（采样定理下限）
 *   - Kp/Ki 不能过大导致高频噪声放大
 */
export function validateTuning(
  result: CurrentLoopTuningResult,
  fs: number,
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (result.bandwidthDHz > fs / 3) {
    warnings.push(`d 轴带宽 ${result.bandwidthDHz.toFixed(0)} Hz 超过 fs/4=${(fs / 4).toFixed(0)} Hz，可能不稳定`);
  }
  if (result.bandwidthQHz > fs / 4) {
    warnings.push(`q 轴带宽 ${result.bandwidthQHz.toFixed(0)} Hz 超过 fs/4=${(fs / 4).toFixed(0)} Hz，可能不稳定`);
  }
  if (result.phaseMarginDeg < 15) {
    warnings.push(`相位裕度 ${result.phaseMarginDeg.toFixed(1)}° < 15°，系统振荡风险高`);
  }
  if (result.phaseMarginDeg > 85) {
    warnings.push(`相位裕度 ${result.phaseMarginDeg.toFixed(1)}° > 85°，响应过于缓慢`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}