/**
 * HFI 高频注入信号链可视化（教学用纯函数）
 *
 * 与 hfi.ts 区别：
 *   - hfi.ts 关注「闭环 PLL 锁相」全过程；
 *   - hfiSignals.ts 关注「单点注入 → 凸极调制 → 解调 → 误差信号」时域波形，
 *     用于让学员直接看到「为什么解调出来是 sin(2θe)」。
 *
 * 物理推导（IPM d 轴注入）：
 *   注入电压 v_d^h = V_h · sin(ω_h · t)
 *   高频近似下电感矩阵在估计 dq 系下投影后得到：
 *     i_response ≈ (V_h / ω_h) · [Σ - Δ·cos(2θe)] · cos(ω_h·t)
 *                 - (V_h / ω_h) · Δ · sin(2θe) · sin(ω_h·t) + 噪声
 *   其中 Σ = (1/Ld + 1/Lq)/2,  Δ = (Lq - Ld) / (2 · Ld · Lq)
 *
 * 解调（与 sin(ω_h·t) 同相相乘）：
 *   product = i_response · sin(ω_h·t)
 *           = [...] · cos·sin (→ 2ω_h 分量)
 *             - (V_h/ω_h) · Δ · sin(2θe) · sin² (→ 直流 + 2ω_h)
 *   sin² = (1 - cos(2ω_h·t))/2 → 直流项 = -(V_h / 2ω_h) · Δ · sin(2θe)
 *
 * 一阶低通滤波（截止 ~50 Hz，远低于 ω_h 的 2 倍频）后留下：
 *   error_signal ≈ -(V_h / 2ω_h) · Δ · sin(2θe)
 * 这就是 PLL 闭环要驱到 0 的误差。
 *
 * 输入电感单位 mH，内部转 H。所有时间单位以 ms 输出，方便 Recharts 直接画。
 */

export interface HfiSignalParams {
  /** 注入频率 Hz，典型 500-1500 */
  injectFreqHz: number;
  /** 注入电压幅值 V，典型 5-20 */
  injectAmpV: number;
  /** d 轴电感 mH */
  ld: number;
  /** q 轴电感 mH（IPM 凸极时 Lq > Ld） */
  lq: number;
  /** 当前角度估计误差 θe = θ_true - θ_est，单位 rad */
  thetaError: number;
  /** 测量电流噪声幅值 A（峰值，均匀分布） */
  noiseLevel: number;
  /** 仿真时间窗 ms */
  durationMs: number;
  /** 仿真采样率 Hz，建议 10-50 kHz，至少 10x 注入频率 */
  sampleHz: number;
}

export interface HfiSignalSample {
  /** 时间 ms */
  t: number;
  /** 注入电压 V_h·sin(ω_h·t) */
  vInject: number;
  /** 凸极调制后的电流响应（含噪声） */
  iResponse: number;
  /** 解调中间信号 = i_response · sin(ω_h·t)（含 2ω_h 振荡 + 直流误差项） */
  demodulated: number;
  /** 一阶 LPF 后的角度误差信号，∝ sin(2·θe) */
  errorSignal: number;
}

export interface HfiSignalSummary {
  samples: HfiSignalSample[];
  /** 误差信号稳态峰值（取最后 1/3 窗口绝对最大值） */
  errorPeak: number;
  /** 注入电压幅值（V），便于 UI 展示 */
  injectAmp: number;
  /** 凸极比 Lq/Ld */
  saliencyRatio: number;
  /** 解调通道 SNR（dB）：稳态误差信号 RMS / 噪声引入的高频残差 RMS */
  demodSnrDb: number;
}

/**
 * 生成 HFI 解调链路时域波形。
 *
 * 注意：本函数刻意把高频噪声留到 demodulated 通道，使学员能看到
 * "解调中间信号在 0 附近 ± 振荡，LPF 之后变成几乎平的直流"。
 */
export function generateHfiSignals(p: HfiSignalParams): HfiSignalSample[] {
  const { samples } = computeHfiSignals(p);
  return samples;
}

export function computeHfiSignals(p: HfiSignalParams): HfiSignalSummary {
  const ld = Math.max(1e-4, p.ld * 1e-3); // mH → H
  const lq = Math.max(1e-4, p.lq * 1e-3);
  const omegaH = 2 * Math.PI * Math.max(1, p.injectFreqHz);
  const Vh = p.injectAmpV;

  // Σ = (1/Ld + 1/Lq)/2,  Δ = (Lq - Ld) / (2·Ld·Lq)
  const sigma = (1 / ld + 1 / lq) / 2;
  const delta = (lq - ld) / (2 * ld * lq);

  const fs = Math.max(1000, p.sampleHz);
  const dt = 1 / fs;
  const totalSteps = Math.max(8, Math.round((p.durationMs / 1000) * fs));

  // 一阶 LPF：截止 50 Hz，足以滤掉 2ω_h 高频项
  const cutoffHz = 50;
  const lpfAlpha = (2 * Math.PI * cutoffHz * dt) / (1 + 2 * Math.PI * cutoffHz * dt);
  let lpfState = 0;

  const sin2e = Math.sin(2 * p.thetaError);
  const cos2e = Math.cos(2 * p.thetaError);

  // 缩放因子：让响应电流落在「几个安培」的工程量级
  // (V_h/ω_h) 量级 ~ 10/6280 ≈ 1.6e-3 V·s, * Σ (1/H 量级 ~1e3) → ~1.6 A，合适
  const ampCommon = (Vh / omegaH) * (sigma - delta * cos2e);
  const ampSaliency = (Vh / omegaH) * delta * sin2e;

  const samples: HfiSignalSample[] = [];

  // 简单 LCG 伪随机：避免 Math.random 多次调用导致重复渲染抖动
  let seed = 0x9e3779b1;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff - 0.5;
  };

  for (let i = 0; i < totalSteps; i += 1) {
    const t = i * dt;
    const sH = Math.sin(omegaH * t);
    const cH = Math.cos(omegaH * t);

    const vInject = Vh * sH;

    // 凸极电流响应（教学物理模型）
    const noise = rand() * 2 * p.noiseLevel;
    const iResponse = ampCommon * cH - ampSaliency * sH + noise;

    // 解调：与 sin(ω_h·t) 同相相乘
    const demod = iResponse * sH;

    // 一阶 LPF
    lpfState += lpfAlpha * (demod - lpfState);

    samples.push({
      t: t * 1000,
      vInject,
      iResponse,
      demodulated: demod,
      errorSignal: lpfState,
    });
  }

  // 末段 1/3 估计稳态指标
  const tailStart = Math.floor(totalSteps * 2 / 3);
  let errMax = 0;
  let errSqSum = 0;
  let demodSqSum = 0;
  let tailCount = 0;
  for (let i = tailStart; i < samples.length; i += 1) {
    const e = samples[i].errorSignal;
    if (Math.abs(e) > errMax) errMax = Math.abs(e);
    errSqSum += e * e;
    // demodulated 减去其直流估计（≈ errorSignal）后剩下的就是高频 + 噪声残差
    const residual = samples[i].demodulated - samples[i].errorSignal;
    demodSqSum += residual * residual;
    tailCount += 1;
  }
  const errRms = tailCount > 0 ? Math.sqrt(errSqSum / tailCount) : 0;
  const noiseRms = tailCount > 0 ? Math.sqrt(demodSqSum / tailCount) : 1;
  const snr = errRms > 0 && noiseRms > 0 ? 20 * Math.log10(errRms / noiseRms) : 0;

  return {
    samples,
    errorPeak: errMax,
    injectAmp: Vh,
    saliencyRatio: lq / ld,
    demodSnrDb: snr,
  };
}
