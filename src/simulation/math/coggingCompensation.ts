/**
 * 齿槽转矩前馈补偿（Cogging Torque Feed-Forward Compensation, CT-FFC）。
 *
 * **背景**：
 *   coggingTorque(θ) 是机械角度的周期函数 → 完全确定性的扰动 →
 *   理想情况下用一张以角度索引的查找表把"反相同幅"的 iq 加到 PI 输出上，
 *   就能在角度域消掉齿槽纹波。这是 STM32 上最便宜的转矩平顺化算法。
 *
 * **公式**：
 *   iq_ffc(θ) = −T_cog(θ) / (1.5 × p × ψf)
 *   iq_total = iq_PI + iq_ffc(θ_measured)
 *
 * **关键工程权衡**：
 *   1. **LUT 分辨率**：N = 16/32/64/128/256。N 越大量化误差越小，但占 RAM、查表 latency 高。
 *      压缩机做到 32-64 通常够（齿槽周期 3-6/rev，每周期 5-10 个采样点）。
 *   2. **角度估计误差**：sensorless 时 θ_measured 与真实角差 Δθ
 *      → iq_ffc(θ + Δθ) ≠ iq_ffc(θ_true) → 残差不为零，反而可能放大
 *      （Δθ 过零附近，相当于补偿信号变 180° 反相）。
 *      工程上要在反电动势角估准 (~< 2°) 之后才开启 FFC。
 *   3. **运行点漂移**：齿槽幅值随温度（永磁 NTC）、饱和（id 大时）略变；
 *      高端实现做"自学习"：偏置项 K_adapt 在线追踪残差均值。
 *
 * **参考**：
 *   - Ruderman M, "Tracking control of motor drives using feedforward friction
 *     observer", IEEE Trans. Ind. Electron. 2008
 *   - TI Application Report SPRABT3 "Cogging torque compensation in BLDC motors"
 */

import { coggingTorque, type CoggingParams } from './cogging';
import { wrapAngleRad } from '../../utils/clamp';

/** 前馈查找表：以 [0, 2π) 等分为 N 段，每段存一个 iq 补偿值 (A)。 */
export interface FfcLut {
  /** 表长 N（典型 16/32/64/128/256） */
  size: number;
  /** 长度 = size 的 Float64Array，索引 k 对应 θ = 2π × k / N */
  values: Float64Array;
  /** 表项对应的角度步长 (rad) */
  stepRad: number;
}

/**
 * 用解析齿槽模型预生成 N 项 LUT。
 *
 * @param N LUT 表长
 * @param cogParams 齿槽模型参数（与 coggingTorque 共用）
 * @param torqueConstant 转矩常数 K_t = 1.5 × p × ψf (N·m/A)，由学员根据电机参数算
 *
 * @returns 长度 N 的 Float64Array，第 k 项 = −T_cog(θ_k) / K_t（即 iq 补偿值，单位 A）
 */
export function buildFfcLut(
  N: number,
  cogParams: CoggingParams,
  torqueConstant: number,
): FfcLut {
  const size = Math.max(8, Math.floor(N));
  const values = new Float64Array(size);
  const stepRad = (2 * Math.PI) / size;
  const Kt = Math.max(1e-6, torqueConstant);
  for (let k = 0; k < size; k += 1) {
    const theta = k * stepRad;
    const Tcog = coggingTorque(theta, cogParams).torque;
    values[k] = -Tcog / Kt;
  }
  return { size, values, stepRad };
}

/**
 * 在线查表：给定测量角度 θ_measured，线性插值取出补偿 iq。
 *
 * @param thetaMeasuredRad 机械角度（任意值，内部会 wrap 到 [0, 2π)）
 * @param lut 预生成的 LUT
 * @returns iq 补偿值 (A)，应**加到** PI 输出 iq 上
 */
export function lookupFfc(thetaMeasuredRad: number, lut: FfcLut): number {
  const wrapped = wrapAngleRad(thetaMeasuredRad);
  const positive = wrapped < 0 ? wrapped + 2 * Math.PI : wrapped;
  const idxF = positive / lut.stepRad;
  const i0 = Math.floor(idxF) % lut.size;
  const i1 = (i0 + 1) % lut.size;
  const frac = idxF - Math.floor(idxF);
  return lut.values[i0] * (1 - frac) + lut.values[i1] * frac;
}

/**
 * 评估补偿效果：在 [0, 2π) 上扫描 M 个点，算出未补偿 / 已补偿后的转矩 RMS 纹波。
 *
 * @param lut FFC 查找表
 * @param cogParams 真实齿槽模型（仿真"真值"，模型可以与 LUT 来源不同来体现失配）
 * @param torqueConstant K_t = 1.5 × p × ψf (N·m/A)
 * @param angleErrorRad 角度估计误差 Δθ，模拟 sensorless 估角偏差（rad）
 * @param M 采样点数（默认 360）
 *
 * @returns 评估结果
 */
export function evaluateFfc(
  lut: FfcLut,
  cogParams: CoggingParams,
  torqueConstant: number,
  angleErrorRad = 0,
  M = 360,
): {
  rmsBeforeNm: number;
  rmsAfterNm: number;
  suppressionDb: number;
  samples: Array<{ thetaDeg: number; tCogNm: number; tResidualNm: number; iqFfcA: number }>;
} {
  const Kt = Math.max(1e-6, torqueConstant);
  let sumBefore = 0;
  let sumAfter = 0;
  const samples: Array<{ thetaDeg: number; tCogNm: number; tResidualNm: number; iqFfcA: number }> = [];
  for (let m = 0; m < M; m += 1) {
    const thetaTrue = (m / M) * 2 * Math.PI;
    const Tcog = coggingTorque(thetaTrue, cogParams).torque;
    // 控制器看到的角度含估计误差 → LUT 查到的是"错位"的补偿值
    const iqFfc = lookupFfc(thetaTrue + angleErrorRad, lut);
    // 实际产生的反向转矩 = K_t × iq_ffc
    const Tffc = Kt * iqFfc;
    const Tresidual = Tcog + Tffc;
    sumBefore += Tcog * Tcog;
    sumAfter += Tresidual * Tresidual;
    samples.push({
      thetaDeg: Number(((thetaTrue * 180) / Math.PI).toFixed(2)),
      tCogNm: Number(Tcog.toFixed(5)),
      tResidualNm: Number(Tresidual.toFixed(5)),
      iqFfcA: Number(iqFfc.toFixed(4)),
    });
  }
  const rmsBeforeNm = Math.sqrt(sumBefore / M);
  const rmsAfterNm = Math.sqrt(sumAfter / M);
  const suppressionDb = rmsBeforeNm > 1e-9 && rmsAfterNm > 1e-9
    ? 20 * Math.log10(rmsBeforeNm / rmsAfterNm)
    : 0;
  return { rmsBeforeNm, rmsAfterNm, suppressionDb, samples };
}
