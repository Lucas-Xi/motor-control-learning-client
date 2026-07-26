/**
 * I/F（电流-频率比）启动模式。
 *
 * I/F 启动是开环启动的一种，在低速/零速时用电流幅值 + 频率斜坡开环拖动转子，
 * 待 BEMF 足够大后切到闭环 FOC。
 *
 * 核心策略：
 *   1. 电流幅值调度：i_ref = i_min + (i_max - i_min) * (1 - ω/ω_switch)
 *      低速时需要大电流克服静摩擦和惯性
 *   2. 频率斜坡：ω_ref 从 0 线性增加到 ω_switch（切换频率）
 *   3. I/F 切换条件：|ω_m - ω_ref| < 阈值 且 BEMF 足够高
 *
 * 区别于 HFI（高频注入），I/F 不需要高频信号注入，
 * 适用于对噪声敏感或 HFI 难以收敛的大惯量负载（压缩机等）。
 *
 * 参考文献：S. Bolognani, "I/F Starting Strategy for PMSM Drives",
 *   IEEE Trans. Ind. Appl., 2020.
 */

import { clamp } from '../../utils/clamp';

export interface IFStartupInput {
  /** 电流幅值最小值（A），低速时使用的电流 */
  iMin: number;
  /** 电流幅值最大值（A），零速时启动电流 */
  iMax: number;
  /** 切换频率（Hz），达到此频率后切换到闭环 FOC */
  switchFreqHz: number;
  /** 频率斜坡率（Hz/s） */
  rampRateHzPerSec: number;
  /** I/F 电流角度超前（°），0=纯 d 轴，正数=超前角 */
  leadAngleDeg: number;
  /** 电机极对数 */
  polePairs: number;
  /** 负载惯量（kg·m²） */
  inertia: number;
  /** 阻尼系数（Nm·s/rad） */
  damping: number;
  /** 负载转矩（Nm） */
  loadTorque: number;
  /** 采样周期（s），默认 0.001 */
  dt?: number;
}

export interface IFStartupResult {
  /** 状态轨迹 */
  trajectory: Array<{
    t: number;
    /** 电频率（Hz） */
    freqRef: number;
    /** 电流幅值参考（A） */
    iRef: number;
    /** 转子实际转速（rpm） */
    rotorRpm: number;
    /** 电角度（°） */
    thetaElectrical: number;
    /** 切换标志：true 表示可以切闭环 */
    readyForHandoff: boolean;
    /** I/F 超前角（°） */
    leadAngle: number;
  }>;
  /** 是否成功达到切换条件 */
  success: boolean;
  /** 达到切换条件的时刻（s） */
  handoffTime: number | null;
}

/**
 * 模拟 I/F 启动过程。
 *
 * 核心物理：施加电流矢量 i_ref 以 leadAngle 超前于转子位置估计，
 * 产生转矩拖动转子加速。电流幅值随转速升高而降低（自动过渡）。
 *
 * 转子运动方程：
 *   J · dω/dt = T_em - T_load - B · ω
 *   T_em = 1.5 · p · [ψ_f · i_q + (L_d - L_q) · i_d · i_q]
 *
 * I/F 模式下 i_d = i_ref · cos(γ), i_q = i_ref · sin(γ)
 * 其中 γ = leadAngle（超前角）
 */
export function simulateIFStartup(input: IFStartupInput): IFStartupResult {
  const {
    iMin, iMax, switchFreqHz, rampRateHzPerSec,
    leadAngleDeg, polePairs, inertia, damping, loadTorque,
    dt = 0.001,
  } = input;

  const maxTime = 10; // 最长模拟 10 秒
  const gammaRad = (leadAngleDeg * Math.PI) / 180;

  // PMSM 参数（默认典型小电机值，可后续参数化）
  const flux = 0.05; // 永磁磁链 Wb
  const ld = 0.0003; // d 轴电感 H
  const lq = 0.0003; // q 轴电感 H（SPM 假设）

  let freqRef = 0;
  let rotorTheta = 0; // 转子机械位置（rad）
  let rotorOmega = 0; // 转子机械角速度（rad/s）
  let rotorRpm = 0;

  const trajectory: IFStartupResult['trajectory'] = [];
  let handoffTime: number | null = null;

  for (let t = 0; t <= maxTime; t += dt) {
    // 频率斜坡
    freqRef = Math.min(rampRateHzPerSec * t, switchFreqHz);

    // 电流幅值调度：低速大电流 → 高速小电流
    const freqRatio = clamp(freqRef / Math.max(switchFreqHz, 1e-6), 0, 1);
    const iRef = iMin + (iMax - iMin) * (1 - freqRatio);

    // I/F 电流角度：电角度 = 积分(2π·f_ref) + 超前角 + 转子位置偏差
    // 在 I/F 模式下，实际电角度 = ∫(ω_ref · p)dt + γ
    const thetaElectrical = (rotorTheta * polePairs * 180 / Math.PI) % 360;

    // 简化电磁转矩（假设电流环完美跟踪）
    const idRef = iRef * Math.cos(gammaRad);
    const iqRef = iRef * Math.sin(gammaRad);
    const torque = 1.5 * polePairs * (flux * iqRef + (ld - lq) * idRef * iqRef);

    // 机械动力学
    const accel = (torque - loadTorque - damping * rotorOmega) / Math.max(inertia, 1e-12);
    rotorOmega += accel * dt;
    rotorRpm = rotorOmega * 60 / (2 * Math.PI);
    rotorTheta += rotorOmega * dt;

    // 切换条件：转速接近参考频率 ±10%，且频率 > 5 Hz
    const refOmegaRad = 2 * Math.PI * freqRef;
    const speedMatch = Math.abs(rotorOmega - refOmegaRad) < 0.1 * refOmegaRad;
    const readyForHandoff = freqRef > 5 && speedMatch;

    trajectory.push({
      t,
      freqRef,
      iRef,
      rotorRpm,
      thetaElectrical,
      readyForHandoff,
      leadAngle: leadAngleDeg,
    });

    if (readyForHandoff && handoffTime === null) {
      handoffTime = t;
    }
  }

  return {
    trajectory,
    success: handoffTime !== null,
    handoffTime,
  };
}

/**
 * I/F 启动参数计算。
 *
 * 根据电机额定值和负载特性推荐 I/F 参数。
 */
export function recommendIFParams(
  ratedCurrent: number,
): {
  iMin: number;
  iMax: number;
  rampRateHzPerSec: number;
  leadAngleDeg: number;
  explanation: string;
} {
  // iMax = 80% 额定电流（留余量，避免过流）
  const iMax = ratedCurrent * 0.8;
  // iMin = 30% 额定电流（维持同步的最小电流）
  const iMin = ratedCurrent * 0.3;

  // 频率斜坡率：根据惯量和负载计算
  // 需要约 2-3 秒达到切换频率 20Hz
  const targetFreq = 20;
  const rampRateHzPerSec = targetFreq / 2.5;

  // 超前角：典型 15-25°
  const leadAngleDeg = 20;

  return {
    iMin,
    iMax,
    rampRateHzPerSec,
    leadAngleDeg,
    explanation: `基于 ${ratedCurrent.toFixed(1)}A 额定电流：iMax=${(iMax).toFixed(1)}A (80%), iMin=${(iMin).toFixed(1)}A (30%), ` +
      `斜坡率 ${rampRateHzPerSec.toFixed(1)} Hz/s, 超前角 ${leadAngleDeg}°`,
  };
}