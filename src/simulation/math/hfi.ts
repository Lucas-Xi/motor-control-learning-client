import type { HFIParams } from '../engine/types';

/**
 * 高频注入（HFI / High-Frequency Injection）低速无感简化仿真。
 *
 * 物理直觉：
 *   IPM 电机 d / q 轴电感 Ld < Lq（凸极）。如果在 d 轴注入正弦高频电压 V_h·sin(ω_h·t)，
 *   电感不对称会让响应电流幅值在 d 和 q 分量间产生与 2·θ_e 相关的差异。
 *   把响应解调（同相、正交）后能反推出 sin(2·Δθ)，再 PLL 锁相到 0 → 估算角度。
 *
 * 教学级简化（非完整电流方程）：
 *   error_signal(t) ≈ K · (Lq - Ld) / (Ld·Lq) · V_h · sin(2·(θ_true - θ_est)) + 噪声
 *   PLL 用 sin(2·Δθ) 误差闭环 θ_est。
 *
 * 输出 60ms 时间窗的：注入电压 / 响应电流幅值 / 真实角度 / 估算角度 / 误差。
 */
export interface HFISample {
  t: number;             // ms
  injectV: number;       // 注入电压 V
  responseI: number;     // 解调后的误差信号 (A 等效)
  trueDeg: number;
  estDeg: number;
  errorDeg: number;
  inLockBand: boolean;   // |误差| < 5° 视为锁定
}

const TOTAL_SEC = 0.06;

export function simulateHFI(params: HFIParams): HFISample[] {
  const omegaH = 2 * Math.PI * params.injectFreqHz;
  const omegaTrue = (params.speedRpm * 2 * Math.PI / 60) * 4; // 假设 4 极对
  const dt = 1e-5;                         // 100 kHz 内部步长（要远高于 ω_h）
  const totalSteps = Math.round(TOTAL_SEC / dt);
  const samples: HFISample[] = [];

  // 凸极性带来的"信号增益"：(Lq - Ld) / (Ld·Lq)，归一化到 0-1
  const r = Math.max(1.0, params.saliencyRatio);
  const saliencyGain = (r - 1) / (r + 1);

  // PLL 状态
  let theta_est = 0;
  let pll_int = 0;
  let theta_true = params.trueThetaRad;

  // 解调低通：一阶 RC，截止频率 demodCutoffHz
  const lpf_alpha = (2 * Math.PI * params.demodCutoffHz * dt) /
                    (1 + 2 * Math.PI * params.demodCutoffHz * dt);
  let demod_lp = 0;

  let outputCounter = 0;

  for (let step = 0; step < totalSteps; step++) {
    const t = step * dt;
    theta_true += omegaTrue * dt;

    // 注入电压（d 轴）
    const v_inject = params.injectVoltage * Math.sin(omegaH * t);

    // 真实响应（教学简化）：sin(ω_h·t) × sin(2·Δθ) × saliencyGain + 噪声
    const dtheta = theta_true - theta_est;
    const raw_response = saliencyGain * Math.sin(omegaH * t) * Math.sin(2 * dtheta);
    const noise = (Math.random() - 0.5) * 2 * params.measNoise;
    const measured = raw_response + noise;

    // 解调：与 sin(ω_h·t) 同相相乘 → 直流分量 ∝ sin(2·Δθ)
    const product = measured * Math.sin(omegaH * t);
    demod_lp += lpf_alpha * (product - demod_lp);

    // 用解调结果驱动 PLL 锁相
    const err = -demod_lp;     // 让 sin(2·Δθ) → 0
    pll_int += params.pllKi * err * dt;
    const omega_est = params.pllKp * err + pll_int;
    theta_est += omega_est * dt;

    // 每隔若干步输出一个样本
    if (++outputCounter >= 30) {
      outputCounter = 0;
      const errDeg = ((dtheta * 180) / Math.PI + 360) % 360;
      const errSigned = errDeg > 180 ? errDeg - 360 : errDeg;
      samples.push({
        t: t * 1000,
        injectV: v_inject,
        responseI: demod_lp * 100,    // 缩放到可见范围
        trueDeg: ((theta_true * 180) / Math.PI % 360 + 360) % 360,
        estDeg: ((theta_est * 180) / Math.PI % 360 + 360) % 360,
        errorDeg: errSigned,
        inLockBand: Math.abs(errSigned) < 5,
      });
    }
  }

  return samples;
}

export interface HFIMetrics {
  lockTimeMs: number | null;        // 进入锁定带的时间
  finalErrorDeg: number;
  saliencyGainPct: number;          // (Lq-Ld)/(Lq+Ld) % —— 信号强度
}

export function evaluateHFI(samples: HFISample[], saliencyRatio: number): HFIMetrics {
  let lockTime: number | null = null;
  for (const s of samples) {
    if (s.inLockBand && lockTime === null) lockTime = s.t;
  }
  const last = samples[samples.length - 1];
  const r = Math.max(1.0, saliencyRatio);
  return {
    lockTimeMs: lockTime,
    finalErrorDeg: last?.errorDeg ?? 0,
    saliencyGainPct: ((r - 1) / (r + 1)) * 100,
  };
}
