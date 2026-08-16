/**
 * I/F（电流-频率比）启动模式。
 *
 * I/F 启动是开环启动的一种：用旋转的虚拟坐标系 θ* = ∫ 2π f_ref dt
 * 拖着定子电流矢量走，低速/零速时靠电流幅值 + 频率斜坡开环拖动转子，
 * 待反电势足够大、负载角足够小后再切到闭环 FOC。
 *
 * 核心策略：
 *   1. 电流幅值调度：i_ref = i_min + (i_max - i_min) * (1 - f/f_switch)
 *      低速时需要大电流克服静摩擦和惯性
 *   2. 频率斜坡：f_ref 从 0 线性增加到 f_switch（切换频率）
 *   3. 切换条件：f_ref 接近切换点、|ω_m − ω*_m| 足够小、|δ| < 70°
 *
 * 物理（本文件修正后的同步机负载角模型，不再把机械 ω 和电角频率直接相减）：
 *   θ* = ∫ 2π f_ref dt                         虚拟电角度
 *   δ  = wrapToPi(θ* − p · θ_m)                负载角
 *   电流落在虚拟坐标系超前角 γ 处，变换到转子坐标系：
 *     i_d = i_ref · cos(δ+γ),  i_q = i_ref · sin(δ+γ)
 *   T_em = 1.5 · p · [ψ_f · i_q + (L_d − L_q) · i_d · i_q]
 *   J · ω̇ = T_em − T_load − B · ω
 *
 * 旧实现用恒定超前角算转矩，并且用机械 rad/s 去比 2π f（电角频率），
 * 单位不一致，所以永远不会失步。本模型负载角冲过 ~90° 后转矩下降，
 * |δ| > 120° 判失步。
 *
 * 区别于 HFI（高频注入），I/F 不需要高频信号注入，
 * 适用于对噪声敏感或 HFI 难以收敛的大惯量负载（压缩机等）。
 *
 * 参考文献：S. Bolognani, "I/F Starting Strategy for PMSM Drives",
 *   IEEE Trans. Ind. Appl., 2020.
 */

import { clamp } from '../../utils/clamp';

/** 把任意弧度折到 [−π, π]。 */
function wrapToPi(rad: number): number {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

export interface IFStartupInput {
  /** 电流幅值最小值（A），低速时使用的电流 */
  iMin: number;
  /** 电流幅值最大值（A），零速时启动电流 */
  iMax: number;
  /** 切换频率（Hz），达到此频率后切换到闭环 FOC */
  switchFreqHz: number;
  /** 频率斜坡率（Hz/s） */
  rampRateHzPerSec: number;
  /** I/F 电流角度超前（°），0=纯虚拟 d 轴，正数=超前角 γ */
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
  /** 永磁磁链（Wb），默认 0.05 */
  fluxWb?: number;
  /** d 轴电感（H），默认 0.0003 */
  ldH?: number;
  /** q 轴电感（H），默认 0.0003 */
  lqH?: number;
  /** 最长模拟时间（s），默认 10 */
  maxTime?: number;
}

export interface IFStartupSample {
  t: number;
  /** 电频率指令（Hz） */
  freqRef: number;
  /** 电流幅值参考（A） */
  iRef: number;
  /** 转子实际转速（rpm） */
  rotorRpm: number;
  /** 虚拟电角度 θ*（°，0–360） */
  thetaElectrical: number;
  /** 切换标志：true 表示可以切闭环 */
  readyForHandoff: boolean;
  /** I/F 超前角 γ（°） */
  leadAngle: number;
  /** 机械转速指令 = freqRef · 60 / p */
  rpmRef: number;
  /** 负载角 δ（°） */
  loadAngleDeg: number;
  /** 本拍是否已失步 */
  lostSync: boolean;
}

export interface IFStartupResult {
  /** 状态轨迹 */
  trajectory: IFStartupSample[];
  /** 是否成功达到切换条件 */
  success: boolean;
  /** 达到切换条件的时刻（s） */
  handoffTime: number | null;
  /** 全程是否出现失步 */
  lostSync: boolean;
  /** 最大 |负载角|（°） */
  maxLoadAngleDeg: number;
  /** 切换前就失步（拉出） */
  pullOut: boolean;
}

/**
 * 模拟 I/F 启动过程（负载角同步模型 + ZOH 机械欧拉）。
 *
 * 虚拟坐标系以 f_ref 旋转；电流矢量固定在超前角 γ 上。
 * 转子坐标系下的 i_d / i_q 由负载角 δ 与 γ 共同决定，
 * 因此斜坡过快或负载过大时 δ 冲过 90°，转矩下降并失步。
 */
export function simulateIFStartup(input: IFStartupInput): IFStartupResult {
  const {
    iMin, iMax, switchFreqHz, rampRateHzPerSec,
    leadAngleDeg, polePairs, inertia, damping, loadTorque,
    dt = 0.001,
    fluxWb = 0.05,
    ldH = 0.0003,
    lqH = 0.0003,
    maxTime = 10,
  } = input;

  const gammaRad = (leadAngleDeg * Math.PI) / 180;
  const jSafe = Math.max(inertia, 1e-12);
  const fSwitch = Math.max(switchFreqHz, 1e-6);

  let thetaStar = 0; // 虚拟电角度 θ*（rad）
  let thetaM = 0;    // 转子机械位置（rad）
  let rotorOmega = 0; // 机械角速度（rad/s）
  let lostSync = false;
  let maxLoadAngleDeg = 0;
  let handoffTime: number | null = null;

  const trajectory: IFStartupSample[] = [];
  const nSteps = Math.max(1, Math.floor(maxTime / dt + 1e-9));

  for (let i = 0; i <= nSteps; i += 1) {
    const t = i * dt;
    const freqRef = Math.min(rampRateHzPerSec * t, switchFreqHz);
    const freqRatio = clamp(freqRef / fSwitch, 0, 1);
    const iRef = iMin + (iMax - iMin) * (1 - freqRatio);

    const delta = wrapToPi(thetaStar - polePairs * thetaM);
    const loadAngleDeg = (delta * 180) / Math.PI;
    const absDelta = Math.abs(loadAngleDeg);
    if (absDelta > maxLoadAngleDeg) maxLoadAngleDeg = absDelta;

    const id = iRef * Math.cos(delta + gammaRad);
    const iq = iRef * Math.sin(delta + gammaRad);
    const torque = 1.5 * polePairs * (fluxWb * iq + (ldH - lqH) * id * iq);

    const rotorRpm = (rotorOmega * 60) / (2 * Math.PI);
    const rpmRef = (freqRef * 60) / Math.max(polePairs, 1e-9);

    if (!lostSync) {
      if (t > 0.15 && absDelta > 120) lostSync = true;
      // 「明显反转」：排除启动初期负载角摆动的短暂负速，抓住真正被负载拖死
      if (freqRef > 2 && rotorOmega < -10) lostSync = true;
    }

    const speedMatch = Math.abs(rotorRpm - rpmRef) < 0.10 * Math.max(rpmRef, 30);
    const readyForHandoff = !lostSync
      && freqRef >= 0.95 * switchFreqHz
      && speedMatch
      && absDelta < 70;

    trajectory.push({
      t,
      freqRef,
      iRef,
      rotorRpm,
      thetaElectrical: ((thetaStar * 180 / Math.PI) % 360 + 360) % 360,
      readyForHandoff,
      leadAngle: leadAngleDeg,
      rpmRef,
      loadAngleDeg,
      lostSync,
    });

    if (readyForHandoff && handoffTime === null) {
      handoffTime = t;
    }

    // ZOH：本拍 f_ref / i_ref 保持恒定；机械方程前向欧拉（先更新 ω）
    const accel = (torque - loadTorque - damping * rotorOmega) / jSafe;
    rotorOmega += accel * dt;
    thetaM += rotorOmega * dt;
    thetaStar += 2 * Math.PI * freqRef * dt;
  }

  return {
    trajectory,
    success: handoffTime !== null,
    handoffTime,
    lostSync,
    maxLoadAngleDeg,
    pullOut: lostSync && handoffTime === null,
  };
}

/**
 * I/F 启动参数计算。
 *
 * 根据电机额定电流推荐 I/F 参数（80% / 30% 额定、约 2.5 s 爬到 20 Hz、超前 20°）。
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
  const iMax = ratedCurrent * 0.8;
  const iMin = ratedCurrent * 0.3;
  const targetFreq = 20;
  const rampRateHzPerSec = targetFreq / 2.5;
  const leadAngleDeg = 20;

  return {
    iMin,
    iMax,
    rampRateHzPerSec,
    leadAngleDeg,
    explanation: `基于 ${ratedCurrent.toFixed(1)}A 额定电流：iMax=${iMax.toFixed(1)}A (80%), iMin=${iMin.toFixed(1)}A (30%), ` +
      `斜坡率 ${rampRateHzPerSec.toFixed(1)} Hz/s, 超前角 ${leadAngleDeg}°`,
  };
}
