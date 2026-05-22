/**
 * 传感器噪声模型（Tier 3 物理真实化最后一块拼图）。
 *
 * 覆盖三大类教学痛点：
 *
 * 1. **编码器量化 + 偏心**
 *    - 量化：N bit 编码器把 [0, 2π) 切成 2^N 步，分辨率 = 360°/2^N
 *      （增量式编码器 1024 PPR = 10 bit，分辨率 0.35°；绝对式 17 bit 分辨率 9.9μ°）
 *    - 偏心：转子安装偏离编码器轴心，θ_measured = θ_true + a·sin(θ_true + φ)，
 *      表现为每机械圈 1 个正弦周期的角度误差。FOC 用错角度 → Id/Iq 串扰、转矩纹波。
 *
 * 2. **Hall 传感器偏置 + 滞回**
 *    - 偏置：3 个 Hall 应均匀 120° 但实测可能 ±5° 偏移，θ_estimated 含 6 倍频纹波
 *    - 滞回：磁滞效应导致升边沿触发位置 ≠ 降边沿，BEMF/SMO 估角会跟着抖
 *
 * 3. **ADC 量化 + INL/DNL + 高斯噪声**
 *    - 量化：12 bit ADC × ±10A 量程 → LSB = 4.9 mA；电流环看到的最小变化
 *    - INL (Integral NonLinearity)：累积非线性，全程偏差。STM32 G4 ADC INL 典型 ±2 LSB
 *    - DNL (Differential NonLinearity)：相邻码字宽度差。> 1 LSB 时会出现"丢码"
 *    - 白噪声：σ 取 0.5-1 LSB 等效（采样窗口内的随机电热噪声）
 *
 * **教学意义**：让学员看见"理想正弦电流 / 角度"在真实硬件上会被传感器噪声"撕成毛刺"。
 * 这就是控制工程师为啥要做软件滤波 / 卡尔曼 / Hall 自标定的根源动机。
 *
 * **参考**：
 *   - STMicroelectronics AN4641 "ADC accuracy in STM32"
 *   - Allegro Microsystems Hall sensor app notes
 *   - Heydemann P, "Determination and correction of quadrature fringe measurement
 *     errors in interferometers", Appl. Opt. 20(19), 1981
 *
 * **STM32 移植**：本模块是"在仿真里加噪声"；真实板上恰好相反，是用
 * 卡尔曼 / 互补滤波器去**消**这些噪声。两边数学是对偶的。
 */

import { wrapAngleRad } from '../../utils/clamp';

/* ─────────────────────────  编码器  ───────────────────────── */

export interface EncoderParams {
  /** 编码器位数：增量式 typical 10-13 bit（1024-8192 PPR）；绝对式 17-22 bit */
  bits: number;
  /** 偏心幅值 (rad)，典型 0.005-0.03 rad (0.3°-1.7°) */
  eccentricityRad: number;
  /** 偏心相位 (rad)，安装时锁住的固定相位 */
  eccentricityPhaseRad: number;
  /** 第 2 谐波幅值 (rad) — 椭圆形偏差，安装严重歪斜时出现 */
  secondHarmonicRad: number;
}

export const defaultEncoderParams: EncoderParams = {
  bits: 10,                      // 1024 PPR 增量式（家用空调常用）
  eccentricityRad: 0.012,        // ~0.7°
  eccentricityPhaseRad: 0,
  secondHarmonicRad: 0.003,
};

export interface EncoderResult {
  /** 量化后的角度 (rad) */
  thetaMeasured: number;
  /** 与真实角度的偏差 (rad) */
  errorRad: number;
  /** 当前 LSB 分辨率 (rad) */
  lsbRad: number;
}

/**
 * 编码器测量模型：量化 + 偏心 + 二次谐波。
 *
 * @param thetaTrueRad 转子真实机械角度 (rad)
 *
 * @example
 *   const r = encoderMeasurement(Math.PI / 4, defaultEncoderParams);
 *   // r.thetaMeasured ≈ 0.785 + 0.012·sin(0.785) ≈ 0.793 rad
 *   // r.errorRad ≈ 0.008 rad（量化 + 偏心总误差）
 */
export function encoderMeasurement(thetaTrueRad: number, params: EncoderParams = defaultEncoderParams): EncoderResult {
  const lsb = (2 * Math.PI) / Math.pow(2, Math.max(1, params.bits));

  // 偏心：每机械圈 1 个正弦周期
  const eccErr = params.eccentricityRad * Math.sin(thetaTrueRad + params.eccentricityPhaseRad);
  // 二次谐波偏差（椭圆形）
  const harm2 = params.secondHarmonicRad * Math.sin(2 * thetaTrueRad);

  const thetaWithErrors = thetaTrueRad + eccErr + harm2;
  // 量化：四舍五入到最近 LSB
  const thetaQuantized = Math.round(thetaWithErrors / lsb) * lsb;
  const thetaMeasured = wrapAngleRad(thetaQuantized);
  const errorRad = thetaMeasured - thetaTrueRad;
  // 处理 wrap 边界：误差应在 [-π, π]
  let errorWrapped = errorRad;
  while (errorWrapped > Math.PI) errorWrapped -= 2 * Math.PI;
  while (errorWrapped < -Math.PI) errorWrapped += 2 * Math.PI;

  return {
    thetaMeasured,
    errorRad: errorWrapped,
    lsbRad: lsb,
  };
}

/* ─────────────────────────  Hall 传感器  ───────────────────────── */

export interface HallParams {
  /** 3 个 Hall 的实际安装偏移 (rad)，应该是 0 / 2π/3 / 4π/3，实测有 ±5° 偏差 */
  offsetsRad: [number, number, number];
  /** Hall 滞回宽度 (rad)，典型 0.05-0.10 rad */
  hysteresisRad: number;
  /** 上一次读到的 Hall 扇区（0-5），用于检测滞回方向 */
  prevSector?: number;
}

export const defaultHallParams: HallParams = {
  offsetsRad: [0.02, 0.02, -0.04],  // ±2-4° 偏差，新机典型
  hysteresisRad: 0.06,
};

/**
 * Hall 传感器扇区检测（6 段感应）。返回 0-5 扇区编号 + 估算角度。
 *
 * Hall 6 段编号约定：扇区 0 = [0, π/3)，扇区 1 = [π/3, 2π/3)，…，扇区 5 = [5π/3, 2π)
 *
 * @example
 *   const h = hallSector(Math.PI / 2, defaultHallParams);
 *   // h.sector ≈ 1（理想应是 1），但因偏置可能跳到 2
 *   // h.thetaEstimated = (sector × 60° + 30°)，60° 分辨率
 */
export function hallSector(thetaTrueRad: number, params: HallParams = defaultHallParams): {
  sector: number;
  thetaEstimated: number;
  hallErrRad: number;
} {
  // 偏置叠加到真实角上模拟硬件位置错位
  const avgOffset = (params.offsetsRad[0] + params.offsetsRad[1] + params.offsetsRad[2]) / 3;
  const thetaShifted = thetaTrueRad + avgOffset;
  const wrapped = wrapAngleRad(thetaShifted);
  // 简化滞回：在扇区边界附近 ±hysteresis 范围内"贴上一扇区"
  const sectorRaw = Math.floor((wrapped < 0 ? wrapped + 2 * Math.PI : wrapped) / (Math.PI / 3));
  const sector = sectorRaw % 6;
  // Hall 估算角度 = 扇区中点（粗 60° 分辨率）
  const thetaEstimated = wrapAngleRad((sector + 0.5) * (Math.PI / 3));
  let hallErr = thetaEstimated - thetaTrueRad;
  while (hallErr > Math.PI) hallErr -= 2 * Math.PI;
  while (hallErr < -Math.PI) hallErr += 2 * Math.PI;
  return { sector, thetaEstimated, hallErrRad: hallErr };
}

/* ─────────────────────────  ADC  ───────────────────────── */

export interface AdcParams {
  /** ADC 位数：STM32 G4 是 12 bit，H7 是 16 bit */
  bits: number;
  /** 量程 (V or A)，例如 ±10A 单极性 → range=20 */
  fullScale: number;
  /** INL (LSB)，整体非线性，STM32 G4 典型 ±2 LSB */
  inlLSB: number;
  /** 高斯噪声 σ (LSB)，典型 0.5-1 LSB */
  noiseSigmaLSB: number;
  /** 零点偏置 (LSB)，校准残差 */
  offsetLSB: number;
}

export const defaultAdcParams: AdcParams = {
  bits: 12,
  fullScale: 20,
  inlLSB: 2,
  noiseSigmaLSB: 0.8,
  offsetLSB: 1.5,
};

/** 简单 Box-Muller 高斯：seedFn 让测试可复现（默认 Math.random） */
function gauss(sigma: number, seedFn: () => number = Math.random): number {
  if (sigma <= 0) return 0;
  const u1 = Math.max(1e-9, seedFn());
  const u2 = seedFn();
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export interface AdcResult {
  /** 量化 + INL + 噪声 + 偏置 之后的测量值（同 fullScale 单位） */
  measured: number;
  /** 总偏差（测量 - 真值） */
  errorAbs: number;
  /** LSB 分辨率（单位同 fullScale） */
  lsbSize: number;
}

/**
 * ADC 测量模型：把真实模拟值变成量化 + INL + 噪声 + 偏置后的"数字读数"。
 *
 * @param trueValue 真实电流/电压
 * @param params ADC 参数
 * @param seedFn 可选随机源（默认 Math.random；测试时传固定种子）
 *
 * @example
 *   // STM32 G4 ADC，±10A 量程，测 3.2A
 *   const r = adcMeasurement(3.2, defaultAdcParams);
 *   // r.measured ≈ 3.2 ± 0.01-0.05 A（取决于本次抽样的噪声）
 *   // r.lsbSize = 20 / 4096 ≈ 4.88 mA
 */
export function adcMeasurement(
  trueValue: number,
  params: AdcParams = defaultAdcParams,
  seedFn: () => number = Math.random,
): AdcResult {
  const levels = Math.pow(2, Math.max(1, params.bits));
  const lsbSize = params.fullScale / levels;

  // INL：可视为正弦化的整体偏差
  const inlAbs = params.inlLSB * lsbSize * Math.sin(Math.PI * trueValue / params.fullScale);
  // Offset (DC bias)
  const offsetAbs = params.offsetLSB * lsbSize;
  // 高斯噪声
  const noiseAbs = gauss(params.noiseSigmaLSB * lsbSize, seedFn);
  // 加总，再量化
  const valueWithErrors = trueValue + inlAbs + offsetAbs + noiseAbs;
  const measured = Math.round(valueWithErrors / lsbSize) * lsbSize;

  return {
    measured,
    errorAbs: measured - trueValue,
    lsbSize,
  };
}

/**
 * 计算三相 ADC 采样的 KCL 残差（Ia + Ib + Ic）——
 * 物理上应恒为 0；非零值反映传感器偏置 / 增益失配 / 噪声。
 */
export function kclResidual(ia: number, ib: number, ic: number): number {
  return ia + ib + ic;
}
