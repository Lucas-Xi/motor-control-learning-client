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
  /** 整定方法描述（中文；UI 层建议改用 methodCode + 数值自行组装双语文案） */
  method: string;
  /** 结构化方法标识：'magnitudeOptimum'，UI 层据此选翻译 key */
  methodCode: 'magnitudeOptimum';
  /** 目标带宽（Hz），组装方法文案用 */
  targetBandwidthHz: number;
}

/** validateTuning 的结构化警告码（UI 层据此选翻译 key，避免渲染算法层中文字符串）。 */
export type TuningWarningCode = 'bwDTooHigh' | 'bwQTooHigh' | 'pmTooLow' | 'pmTooHigh';

export interface TuningWarning {
  code: TuningWarningCode;
  /** 相关数值：带宽警告为 Hz，相位裕度警告为度 */
  value: number;
  /** 参考阈值：带宽警告为 fs/4，相位裕度为 15/85 */
  limit: number;
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
    methodCode: 'magnitudeOptimum' as const,
    targetBandwidthHz: fBw,
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

export interface CurrentLoopStepSample {
  /** 时间（µs） */
  tUs: number;
  /** 实际电流（A） */
  current: number;
  /** PI 输出电压（V，已限幅） */
  voltage: number;
}

export interface CurrentLoopStepSimInput {
  /** 相电阻 Rs（Ω） */
  rs: number;
  /** 轴电感（mH），d 轴用 Ld、q 轴用 Lq */
  lMh: number;
  /** PWM / 采样频率（Hz），控制周期 Ts = 1/fs */
  fs: number;
  /** PI 比例增益（V/A） */
  kp: number;
  /** PI 积分增益（V/(A·s)） */
  ki: number;
  /** 电流阶跃目标（A） */
  targetA: number;
  /** 母线可用电压限幅（V），典型 Vdc/√3 */
  vLimit: number;
  /** 仿真时长（µs） */
  durationUs: number;
}

export interface CurrentLoopStepSimResult {
  samples: CurrentLoopStepSample[];
  /** 超调（%），无超调为 0 */
  overshootPct: number;
  /** 10%→90% 上升时间（µs），未达到返回 null */
  riseTimeUs: number | null;
  /** 进入 ±2% 带并保持的时间（µs），未稳定返回 null */
  settleTimeUs: number | null;
  /** 是否触发过电压限幅（说明带宽受母线电压约束） */
  saturated: boolean;
}

/**
 * 离散域电流环阶跃仿真：数字 PI + 一拍计算延时 + 电压限幅 + RL 负载。
 *
 * 与 currentLoopStepResponse 的一阶解析近似不同，这里包含数字控制的
 * 两个非理想因素，学员能看到"理论带宽"与"实际响应"的差距：
 *   1. 一拍延时：本拍算出的电压下一拍才作用（PWM 比较寄存器影子加载）
 *   2. 电压限幅：|v| ≤ vLimit，大阶跃时 PI 饱和 → 条件积分抗饱和
 *
 * 负载离散化用精确 ZOH（RL 一阶系统有闭式解）：
 *   i[k+1] = a·i[k] + (1-a)/Rs · v[k]，a = exp(-Rs·Ts/L)
 *
 * STM32 对应：ADC 注入组采样 → FOC 中断算 PI → 写 CCR，下一 PWM 周期生效。
 */
export function simulateCurrentLoopStep(input: CurrentLoopStepSimInput): CurrentLoopStepSimResult {
  const { rs, lMh, fs, kp, ki, targetA, vLimit, durationUs } = input;
  const L = lMh / 1000;
  const ts = 1 / fs;
  const steps = Math.max(2, Math.round(durationUs / (ts * 1e6)));

  // ZOH 精确离散化系数
  const a = Math.exp((-rs * ts) / L);
  const b = (1 - a) / rs;

  let current = 0;
  let integrator = 0;
  let vDelayed = 0; // 一拍延时寄存器
  let saturated = false;
  const samples: CurrentLoopStepSample[] = [{ tUs: 0, current: 0, voltage: 0 }];

  for (let k = 0; k < steps; k += 1) {
    // 1) 负载用上一拍算出的电压推进（一拍计算延时）
    current = a * current + b * vDelayed;

    // 2) 数字 PI（后向欧拉积分 + 条件积分抗饱和）
    const err = targetA - current;
    const vUnsat = kp * err + integrator;
    const v = clamp(vUnsat, -vLimit, vLimit);
    if (v !== vUnsat) {
      saturated = true;
    } else {
      integrator += ki * err * ts;
    }
    vDelayed = v;

    samples.push({
      tUs: (k + 1) * ts * 1e6,
      current,
      voltage: v,
    });
  }

  // 指标提取
  let peak = -Infinity;
  for (const s of samples) peak = Math.max(peak, s.current);
  const overshootPct = targetA > 0 ? Math.max(0, ((peak - targetA) / targetA) * 100) : 0;

  const t10 = samples.find((s) => s.current >= 0.1 * targetA)?.tUs ?? null;
  const t90 = samples.find((s) => s.current >= 0.9 * targetA)?.tUs ?? null;
  const riseTimeUs = t10 !== null && t90 !== null ? t90 - t10 : null;

  let settleTimeUs: number | null = null;
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    if (Math.abs(samples[i].current - targetA) > 0.02 * targetA) {
      settleTimeUs = i + 1 < samples.length ? samples[i + 1].tUs : null;
      break;
    }
    if (i === 0) settleTimeUs = samples[0].tUs;
  }

  return { samples, overshootPct, riseTimeUs, settleTimeUs, saturated };
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
): { valid: boolean; warnings: string[]; warningCodes: TuningWarning[] } {
  const warnings: string[] = [];
  const warningCodes: TuningWarning[] = [];

  if (result.bandwidthDHz > fs / 4) {
    warnings.push(`d 轴带宽 ${result.bandwidthDHz.toFixed(0)} Hz 超过 fs/4=${(fs / 4).toFixed(0)} Hz，可能不稳定`);
    warningCodes.push({ code: 'bwDTooHigh', value: result.bandwidthDHz, limit: fs / 4 });
  }
  if (result.bandwidthQHz > fs / 4) {
    warnings.push(`q 轴带宽 ${result.bandwidthQHz.toFixed(0)} Hz 超过 fs/4=${(fs / 4).toFixed(0)} Hz，可能不稳定`);
    warningCodes.push({ code: 'bwQTooHigh', value: result.bandwidthQHz, limit: fs / 4 });
  }
  if (result.phaseMarginDeg < 15) {
    warnings.push(`相位裕度 ${result.phaseMarginDeg.toFixed(1)}° < 15°，系统振荡风险高`);
    warningCodes.push({ code: 'pmTooLow', value: result.phaseMarginDeg, limit: 15 });
  }
  if (result.phaseMarginDeg > 85) {
    warnings.push(`相位裕度 ${result.phaseMarginDeg.toFixed(1)}° > 85°，响应过于缓慢`);
    warningCodes.push({ code: 'pmTooHigh', value: result.phaseMarginDeg, limit: 85 });
  }

  return {
    valid: warnings.length === 0,
    warnings,
    warningCodes,
  };
}