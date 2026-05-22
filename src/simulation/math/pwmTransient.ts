/**
 * PWM 开关瞬态模型 —— 离散开关 + 死区 + 反向恢复的实际波形。
 *
 * **为什么需要**：
 *   inverterModel.ts 是"平均模型"——把 PWM 周期内的输出折算成一个平均电压。
 *   平均模型藏起了：
 *     1. 高频开关纹波（载波 fsw + 边带 fsw±k·fund）
 *     2. 死区造成的相电压"扁平区"——上下管都关时输出由相电流方向决定，不是 0
 *     3. 反向恢复尖峰（di/dt 让二极管反向恢复产生 ns 级电压尖刺，可达 +50% Vdc）
 *
 *   学员永远看不到示波器上的真实波形，调出来的电流环就以为是"干净阶跃"。
 *
 * **公式（中心对齐 PWM + 死区）**：
 *   一个 PWM 周期 [0, T_pwm]，duty=d。理想中心对齐：
 *     上管 ON 区间 = [T_pwm/2 − d·T_pwm/2, T_pwm/2 + d·T_pwm/2]
 *   插入死区 t_dead 后：
 *     上管 ON = [T_pwm/2 − d·T_pwm/2 + t_dead, T_pwm/2 + d·T_pwm/2 − t_dead]
 *     下管 ON = 互补，对应位置加 t_dead 死区
 *     死区期间：两管全关 → 相电压由相电流方向决定（i>0 → V_phase = −V_dc/2，
 *     i<0 → V_phase = +V_dc/2，即续流二极管接管）
 *
 * **反向恢复**：
 *   二极管反向恢复时间 t_rr 内有反向电流尖峰 I_rr_peak ≈ I_load × √(Qrr / t_rr)；
 *   叠加到相电压上看到 ns 级电压凹陷（教学上简化为一个三角形脉冲）。
 *
 * **教学意义**：
 *   学员拖 fsw / 死区 / 相电流方向，看相电压实际波形的"扁平区"宽度 / 反向恢复尖刺，
 *   再看 FFT 谱：基波 + 载波 + 边带 + 死区造成的 5/7/11/13 次低频谐波（vs 理想纯正弦）。
 *
 * **参考**：
 *   - Holmes & Lipo《Pulse Width Modulation for Power Converters》§3.5 Carrier-Based PWM
 *   - Mohan / Undeland / Robbins《Power Electronics》§8.4 Dead-Time Effect
 *   - Infineon AN2008-03 reverse-recovery loss model
 *
 * **STM32 移植**：本模块是"反向"教学——真实控制器没法看到 ns 级波形（ADC 只采中点），
 *   但学员看了仿真后就明白为啥示波器探头要差分 + 高带宽，为啥电流环带宽不能逼近 fsw。
 */

import type { SVPWMResult } from './svpwm';

export interface PwmTransientParams {
  /** 载波频率 (Hz) — typical 4-30 kHz */
  fsw: number;
  /** 死区时间 (s) — typical 0.5-3 us */
  deadTimeSec: number;
  /** DC 母线电压 (V) */
  vdc: number;
  /** 反向恢复时间 (s) — IGBT 典型 50-200 ns；SiC ~10-30 ns；0 关闭该效应 */
  trrSec: number;
  /** 反向恢复电荷 Qrr (C) — IGBT 典型 1-3 μC；0 关闭 */
  qrrCoulomb: number;
  /** 每个 PWM 周期内采样点数 — 越多越能看到细节，但计算更贵 */
  samplesPerCycle: number;
}

export const defaultPwmTransientParams: PwmTransientParams = {
  fsw: 16000,
  deadTimeSec: 1.5e-6,
  vdc: 310,
  trrSec: 100e-9,
  qrrCoulomb: 2e-6,
  samplesPerCycle: 400,
};

export interface PwmWaveformPoint {
  /** 时间 (s) */
  t: number;
  /** 三相瞬时相电压（相对母线中点 V） */
  va: number;
  vb: number;
  vc: number;
  /** A 相上管栅极信号（0/1，方便画) */
  gateA: number;
}

export interface PwmWaveformInput {
  /** SVPWM 算出的 dutyA/B/C (0..1) */
  duty: { dutyA: number; dutyB: number; dutyC: number };
  /** 三相瞬时电流（A）— 决定死区期间相电压由哪个二极管续流 */
  iAbc: { ia: number; ib: number; ic: number };
  /** 跑几个 PWM 周期 */
  cycles?: number;
  params?: PwmTransientParams;
}

/**
 * 生成一段 PWM 实际波形（含死区扁平区 + 反向恢复尖刺）。
 *
 * @example
 *   // 占空比 60/50/40，电流 +5/−2/−3 A（A 相流出，B/C 流入）
 *   const wf = generatePwmWaveform({
 *     duty: { dutyA: 0.6, dutyB: 0.5, dutyC: 0.4 },
 *     iAbc: { ia: 5, ib: -2, ic: -3 },
 *     cycles: 2,
 *   });
 *   // wf 含 2 个 PWM 周期 × 400 点 = 800 点，每点 va/vb/vc
 *   // A 相波形上看到死区造成的扁平区（V_phase = -Vdc/2 因为 ia>0）
 */
export function generatePwmWaveform(input: PwmWaveformInput): PwmWaveformPoint[] {
  const p = input.params ?? defaultPwmTransientParams;
  const cycles = Math.max(1, Math.floor(input.cycles ?? 2));
  const Tpwm = 1 / p.fsw;
  const half = Tpwm / 2;
  const points: PwmWaveformPoint[] = [];

  for (let c = 0; c < cycles; c += 1) {
    const t0 = c * Tpwm;
    for (let s = 0; s < p.samplesPerCycle; s += 1) {
      const tau = (s / p.samplesPerCycle) * Tpwm;       // [0, Tpwm)
      const t = t0 + tau;
      const va = computePhase(tau, half, input.duty.dutyA, input.iAbc.ia, p);
      const vb = computePhase(tau, half, input.duty.dutyB, input.iAbc.ib, p);
      const vc = computePhase(tau, half, input.duty.dutyC, input.iAbc.ic, p);
      const gateA = isHighSideOn(tau, half, input.duty.dutyA, p) ? 1 : 0;
      points.push({ t, va, vb, vc, gateA });
    }
  }
  return points;
}

/**
 * 单相在某瞬时 τ ∈ [0, T_pwm) 的相电压（相对母线中点）。
 * 含死区导通方向逻辑 + 反向恢复尖刺。
 */
function computePhase(tau: number, half: number, duty: number, i: number, p: PwmTransientParams): number {
  const dHalf = duty * half;
  const onStart = half - dHalf;                  // 理想 HS ON 起始
  const onEnd = half + dHalf;                    // 理想 HS ON 结束
  // 对称死区：每个 gate 转换的左右各 td，总 4td 死区时间。
  // 这是 Mohan/Undeland 的标准约定，让 aErr = ±2·td·Vdc·fsw（符号由相电流方向决定）。
  const td = Math.min(p.deadTimeSec, Math.max(0, dHalf - 1e-9), Math.max(0, half - dHalf - 1e-9));
  const Vplus = p.vdc / 2;
  const Vminus = -p.vdc / 2;

  // 时序（含 LS 转换前后的死区，对称）：
  //   [0, onStart-td)            LS ON → Vminus
  //   [onStart-td, onStart+td)   死区（LS→HS 转换，td 在 LS 和 HS 两侧），i 决定续流方向
  //   [onStart+td, onEnd-td)     HS ON → Vplus
  //   [onEnd-td, onEnd+td)       死区（HS→LS 转换）
  //   [onEnd+td, Tpwm)           LS ON → Vminus
  let v: number;
  if (tau < onStart - td) {
    v = Vminus;
  } else if (tau < onStart + td) {
    v = i > 0 ? Vminus : Vplus;
  } else if (tau < onEnd - td) {
    v = Vplus;
  } else if (tau < onEnd + td) {
    v = i > 0 ? Vminus : Vplus;
  } else {
    v = Vminus;
  }

  // 反向恢复尖刺：在上管刚开通瞬间叠一个反向脉冲（i>0 时下管二极管被反向偏置）
  // 简化为一个 t_rr 宽度的三角脉冲，幅值与 Qrr × dI/dt 成正比
  if (p.trrSec > 0 && p.qrrCoulomb > 0 && Math.abs(i) > 0.5) {
    const tEdge = onStart + td;
    const dt = tau - tEdge;
    if (dt >= 0 && dt < p.trrSec) {
      const triangle = 1 - dt / p.trrSec;
      // 尖刺方向：i>0 时是负向凹陷（电压被瞬时拉低），i<0 时正向尖刺
      const Vspike = (p.qrrCoulomb / p.trrSec) * Math.abs(i) * 50; // 50 是教学放大系数
      v += (i > 0 ? -1 : 1) * triangle * Vspike;
    }
  }

  return v;
}

function isHighSideOn(tau: number, half: number, duty: number, p: PwmTransientParams): boolean {
  const dHalf = duty * half;
  const onStart = half - dHalf + p.deadTimeSec;
  const onEnd = half + dHalf - p.deadTimeSec;
  return tau >= onStart && tau < onEnd;
}

/**
 * 算波形的平均相电压（理论上应等于平均模型 (duty − 0.5) × Vdc，含死区误差）。
 */
export function meanPhaseVoltage(points: PwmWaveformPoint[], channel: 'va' | 'vb' | 'vc'): number {
  if (points.length === 0) return 0;
  let sum = 0;
  for (const p of points) sum += p[channel];
  return sum / points.length;
}

/**
 * 死区造成的平均电压误差 = (实际平均 − 理想平均)，单位 V。
 * 教学含义：死区让电流波形偏离正弦，产生 5/7/11/13 次低频谐波。
 */
export function deadtimeMeanError(
  points: PwmWaveformPoint[],
  duty: { dutyA: number; dutyB: number; dutyC: number },
  vdc: number,
): { aErr: number; bErr: number; cErr: number } {
  const idealA = (duty.dutyA - 0.5) * vdc;
  const idealB = (duty.dutyB - 0.5) * vdc;
  const idealC = (duty.dutyC - 0.5) * vdc;
  return {
    aErr: meanPhaseVoltage(points, 'va') - idealA,
    bErr: meanPhaseVoltage(points, 'vb') - idealB,
    cErr: meanPhaseVoltage(points, 'vc') - idealC,
  };
}

/**
 * 简单 DFT 算波形频谱（前 N 个 bin）。返回幅值 (V)。
 * 用现成的就好；这里独立写以保持本模块自包含。
 */
export function pwmSpectrum(
  points: PwmWaveformPoint[],
  channel: 'va' | 'vb' | 'vc',
  maxBins = 64,
): { freq: number[]; mag: number[] } {
  const N = points.length;
  if (N < 2) return { freq: [], mag: [] };
  const t0 = points[0].t;
  const tEnd = points[N - 1].t;
  const fs = N / Math.max(1e-9, tEnd - t0);
  const half = Math.min(maxBins, Math.floor(N / 2));
  const freq = new Array<number>(half + 1);
  const mag = new Array<number>(half + 1);
  for (let k = 0; k <= half; k += 1) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n += 1) {
      const ang = (2 * Math.PI * k * n) / N;
      re += points[n][channel] * Math.cos(ang);
      im -= points[n][channel] * Math.sin(ang);
    }
    freq[k] = (k * fs) / N;
    mag[k] = (2 * Math.sqrt(re * re + im * im)) / N;
  }
  // 直流分量不乘 2
  mag[0] /= 2;
  return { freq, mag };
}

/**
 * 把现成的 SVPWMResult 喂给波形生成器（便利封装，省一次手填 duty）。
 */
export function pwmWaveformFromSvpwm(
  svpwm: Pick<SVPWMResult, 'dutyA' | 'dutyB' | 'dutyC'>,
  iAbc: { ia: number; ib: number; ic: number },
  cycles = 2,
  params: PwmTransientParams = defaultPwmTransientParams,
): PwmWaveformPoint[] {
  return generatePwmWaveform({
    duty: { dutyA: svpwm.dutyA, dutyB: svpwm.dutyB, dutyC: svpwm.dutyC },
    iAbc,
    cycles,
    params,
  });
}
