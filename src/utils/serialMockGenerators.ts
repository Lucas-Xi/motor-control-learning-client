/**
 * 实测对照卡片专用 Mock 数据生成器。
 *
 * 设计目的：
 *  - SerialBridge 内置的 mock 只输出"通用 ia/ib/ic + iq/id + θe"流（来自 simulateCurrentLoop），
 *    无法覆盖 4 张专项卡片对"参考值 / 死区畸变 / 故障注入"等差异化字段的需求。
 *  - 这里把每张卡需要的字段独立成纯函数，输入 (t, params, ...) → 输出一帧带物理意义的样本。
 *  - 不引入新依赖，全部复用 src/simulation/math/ 下的核心算法：
 *      • mockFocFlowSample      → motorModel.simulateCurrentLoop 阶跃响应
 *      • mockMotorBasicsSample  → transforms.electricalAngle（极对数推算）
 *      • mockInverterSample     → inverterModel.inverterAverageModel（死区平均模型）
 *      • mockFaultInjectionSample → faultWaveforms.createFaultWaveform
 *  - 所有函数都是确定性的（相同 t → 相同 sample），便于单测。
 *
 * 这些 generator 与 SerialBridge 解耦：调用方（4 张卡片）订阅 `useSerialStore.buffer`，
 * 把每帧 ia/ib/ic 转换到该卡片需要的"理论值"通过 mock generator 在浏览器侧合成。
 *
 * 单位约定（与 SerialBridge 一致）：
 *   - t 单位 ms（毫秒）
 *   - 电流单位 A
 *   - 电压单位 V
 *   - 角度单位 rad（电角度）
 */

import { simulateCurrentLoop } from '../simulation/math/motorModel';
import { inverterAverageModel } from '../simulation/math/inverterModel';
import { createFaultWaveform, isStatusOnlyFault } from '../simulation/math/faultWaveforms';
import type { FaultType } from '../simulation/engine/types';

// ---------- 通用工具 ----------

/** 线性同余伪随机：给定 seed → 确定性噪声序列，用于 mock 实测的小幅噪声。 */
function makeNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1; // [-1, 1]
  };
}

/** 反 Park：dq → αβ（电角度 theta 单位 rad）。 */
function inverseParkInline(id: number, iq: number, theta: number): { alpha: number; beta: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { alpha: id * c - iq * s, beta: id * s + iq * c };
}

/** 反 Clarke（amplitude-invariant）：αβ → abc。 */
function inverseClarkeInline(
  alpha: number,
  beta: number,
): { ia: number; ib: number; ic: number } {
  const ia = alpha;
  const ib = -0.5 * alpha + (Math.sqrt(3) / 2) * beta;
  const ic = -0.5 * alpha - (Math.sqrt(3) / 2) * beta;
  return { ia, ib, ic };
}

// ---------- 1. FOC 电流环：iq/id ref vs sim vs real ----------

export interface FocFlowMockSample {
  /** 时间，ms（从 0 开始） */
  t_ms: number;
  /** Iq 给定（阶跃指令），A */
  iqRef: number;
  /** Iq 仿真值（PI 跟踪 ref 的纯仿真结果），A */
  iqSim: number;
  /** Iq 实测值（仿真叠加测量噪声 + 略小的稳态偏差），A */
  iqReal: number;
  /** Id 给定（SPM 一般为 0；负值代表弱磁），A */
  idRef: number;
  /** Id 仿真，A */
  idSim: number;
  /** Id 实测，A */
  idReal: number;
}

export interface FocFlowMockParams {
  iqRef: number;
  idRef: number;
  kp: number;
  ki: number;
  /** 实测噪声幅值（A），典型 0.05–0.15 */
  noiseA?: number;
  /** 实测相对仿真的稳态偏差（A），模拟 ADC 偏置 / 增益误差 */
  biasA?: number;
}

/**
 * 仿真一段电流环阶跃响应作为 reference，再用平滑插值给 t（任意 ms）返回一帧。
 *
 * 实现要点：
 *  - 把 simulateCurrentLoop(0..120ms) 缓存到模块级 Map（按 kp/ki/idRef/iqRef 取 key），
 *    避免每帧重跑 1000 步微分方程。
 *  - 实测 = 仿真 + LCG 噪声 + 固定偏置（演示 ADC 增益/偏置误差），
 *    保证"仿真平滑、实测带毛刺"的视觉对比。
 */
const focLoopCache = new Map<string, ReturnType<typeof simulateCurrentLoop>>();

function getFocLoopSeries(params: FocFlowMockParams): ReturnType<typeof simulateCurrentLoop> {
  const key = `${params.iqRef.toFixed(3)}|${params.idRef.toFixed(3)}|${params.kp.toFixed(4)}|${params.ki.toFixed(4)}`;
  const hit = focLoopCache.get(key);
  if (hit) return hit;
  const series = simulateCurrentLoop(params.idRef, params.iqRef, { kp: params.kp, ki: params.ki, kd: 0 }, 0.12);
  // 防止 cache 无限增长 —— 教学场景下 key 数有限，留个保险上限
  if (focLoopCache.size > 32) focLoopCache.clear();
  focLoopCache.set(key, series);
  return series;
}

export function mockFocFlowSample(t_ms: number, params: FocFlowMockParams): FocFlowMockSample {
  const series = getFocLoopSeries(params);
  const span = series[series.length - 1]?.t ?? 120;
  const tMod = ((t_ms % span) + span) % span;
  // 找最近一帧（线性扫描 → 序列长度 ~100，可忽略）
  let best = series[0];
  for (const s of series) {
    if (Math.abs(s.t - tMod) < Math.abs(best.t - tMod)) best = s;
  }
  const noiseAmp = params.noiseA ?? 0.08;
  const bias = params.biasA ?? 0.03;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0xa5a5);
  return {
    t_ms,
    iqRef: params.iqRef,
    iqSim: best.iq,
    iqReal: best.iq + bias + noise() * noiseAmp,
    idRef: params.idRef,
    idSim: best.id,
    idReal: best.id - bias * 0.5 + noise() * noiseAmp,
  };
}

// ---------- 2. Motor basics：theta_e real vs theory ----------

export interface MotorBasicsMockSample {
  t_ms: number;
  /** 实测电角度（仿真合成 + 小幅噪声），rad ∈ [0, 2π) */
  thetaReal: number;
  /** 由 rpm × polePairs × t 推算的理论电角度，rad ∈ [0, 2π) */
  thetaTheory: number;
  /** 瞬时角度误差 Δθ = wrap(real − theory) ∈ [−π, π]，rad */
  thetaError: number;
}

export interface MotorBasicsMockParams {
  /** 转子机械转速，rpm */
  rpm: number;
  /** 极对数 */
  polePairs: number;
  /** 实测角度的噪声幅值，rad（典型 0.005–0.05） */
  noiseRad?: number;
  /** 编码器对齐偏差（rad），表现为常数偏移 */
  alignOffsetRad?: number;
  /**
   * 若 > 0，模拟"用户极对数填错"故障：实测使用 polePairsReal 计算，
   * 理论使用 params.polePairs；从而误差呈现周期性跳变。
   */
  polePairsReal?: number;
}

/** 把 angle 包到 [0, 2π) */
function wrap2pi(angle: number): number {
  const m = angle % (2 * Math.PI);
  return m < 0 ? m + 2 * Math.PI : m;
}

/** 把 angle 包到 [−π, π) —— 用于角度差。 */
function wrapPi(angle: number): number {
  let m = angle % (2 * Math.PI);
  if (m >= Math.PI) m -= 2 * Math.PI;
  else if (m < -Math.PI) m += 2 * Math.PI;
  return m;
}

export function mockMotorBasicsSample(
  t_ms: number,
  params: MotorBasicsMockParams,
): MotorBasicsMockSample {
  const omegaMech = (params.rpm * 2 * Math.PI) / 60; // rad/s（机械）
  const t_s = t_ms / 1000;
  const polePairsReal = params.polePairsReal ?? params.polePairs;
  const offset = params.alignOffsetRad ?? 0;
  const noiseAmp = params.noiseRad ?? 0.01;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0x5a5a);
  const thetaRealRaw = omegaMech * polePairsReal * t_s + offset + noise() * noiseAmp;
  const thetaTheoryRaw = omegaMech * params.polePairs * t_s;
  const thetaReal = wrap2pi(thetaRealRaw);
  const thetaTheory = wrap2pi(thetaTheoryRaw);
  const thetaError = wrapPi(thetaRealRaw - thetaTheoryRaw);
  return { t_ms, thetaReal, thetaTheory, thetaError };
}

// ---------- 3. Inverter：Va/Vb/Vc real vs theory ----------

export interface InverterMockSample {
  t_ms: number;
  /** 理论相电压 = (duty − 0.5) × Udc，V */
  vaTheory: number;
  vbTheory: number;
  vcTheory: number;
  /** 实测相电压（理论 + 死区畸变 + 测量噪声），V */
  vaReal: number;
  vbReal: number;
  vcReal: number;
  /** 该帧死区导致的占空比损失（无量纲） */
  deadTimeDistortion: number;
}

export interface InverterMockParams {
  uDc: number;
  /** 三相占空比基线（SVPWM 中点对齐时的中心值；UI 默认 0.5） */
  dutyA: number;
  dutyB: number;
  dutyC: number;
  /** 死区时间，μs */
  deadTimeUs: number;
  /** PWM 频率，Hz */
  pwmFrequency: number;
  /** 实测电压噪声幅值，V */
  noiseV?: number;
  /** 在 dutyA/B/C 基线上叠加一个 sin 调制（rad），让波形随时间动起来 */
  modAngleRad?: number;
}

export function mockInverterSample(t_ms: number, params: InverterMockParams): InverterMockSample {
  // 调制：让 duty 随时间正弦摆动，模拟稳态正弦电压输出
  // ω 由 modAngleRad 给定（rad/帧），缺省取一个典型 50Hz 折算
  const ang = params.modAngleRad ?? ((t_ms / 1000) * 2 * Math.PI * 50);
  const swing = 0.35; // 调制深度（duty 单位）
  const dutyA = params.dutyA + swing * Math.sin(ang);
  const dutyB = params.dutyB + swing * Math.sin(ang - (2 * Math.PI) / 3);
  const dutyC = params.dutyC + swing * Math.sin(ang + (2 * Math.PI) / 3);
  // 理论：纯 (duty-0.5)·Udc
  const vaTheory = (dutyA - 0.5) * params.uDc;
  const vbTheory = (dutyB - 0.5) * params.uDc;
  const vcTheory = (dutyC - 0.5) * params.uDc;
  // 实测：用 inverterAverageModel 注入死区，让相电流符号决定畸变方向
  // 相电流符号近似取 sin(ang) 同相位（实际上有一个 0–60° 滞后，这里教学场景下忽略）
  const iaSign = Math.sin(ang);
  const ibSign = Math.sin(ang - (2 * Math.PI) / 3);
  const icSign = Math.sin(ang + (2 * Math.PI) / 3);
  const inv = inverterAverageModel({
    uDc: params.uDc,
    dutyA,
    dutyB,
    dutyC,
    deadTimeSec: params.deadTimeUs * 1e-6,
    pwmFrequency: params.pwmFrequency,
    iaSign,
    ibSign,
    icSign,
  });
  const noiseAmp = params.noiseV ?? 0.8;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0x3c3c);
  return {
    t_ms,
    vaTheory,
    vbTheory,
    vcTheory,
    vaReal: inv.phaseA + noise() * noiseAmp,
    vbReal: inv.phaseB + noise() * noiseAmp,
    vcReal: inv.phaseC + noise() * noiseAmp,
    deadTimeDistortion: inv.deadTimeDistortion,
  };
}

/**
 * 从死区畸变波形反推 deadtime × f_sw。
 *
 * 原理：畸变幅值 |V_real − V_theory| 的峰值 ≈ deadLoss × Udc，
 * 其中 deadLoss = t_dead × f_sw。因此 t_dead ≈ peak / (Udc × f_sw)。
 *
 * 用于 SerialCompareDeadTimeCard 把"实测畸变"反算成"估算 t_dead"，与 UI 设置值对比。
 */
export function estimateDeadTimeUsFromDistortion(
  vErrorPeak: number,
  uDc: number,
  pwmFrequencyHz: number,
): number {
  if (uDc <= 0 || pwmFrequencyHz <= 0) return 0;
  const deadLoss = Math.abs(vErrorPeak) / uDc;
  const t_dead_s = deadLoss / pwmFrequencyHz;
  return t_dead_s * 1e6; // → μs
}

// ---------- 4. Fault injection：Ia/Ib/Ic + 触发标记 ----------

export interface FaultInjectionMockSample {
  t_ms: number;
  ia: number;
  ib: number;
  ic: number;
  /** 故障触发瞬间标记（true 仅在 t_ms ≥ triggerMs 的首帧后持续置位） */
  faulted: boolean;
  /** 保护切断瞬间标记（true 仅在切断帧及之后；用于在 UI 上画 reference line） */
  tripped: boolean;
}

export interface FaultInjectionMockParams {
  faultType: FaultType;
  severity: number;
  /** 故障注入触发时刻，ms（默认 30ms） */
  triggerMs?: number;
  /** OCP 保护切断时延，μs（默认 800μs；用于估算保护响应） */
  ocpDelayUs?: number;
  /** 状态位类故障（油位 / 振动 / 过温 / 缺相<part>）时无电气特征，
   * UI 显示 fallback 提示而不画波形。 */
}

/**
 * 故障注入 mock：用 createFaultWaveform 拿到 100 个采样点（t∈[0,100]%），
 * 再把 100% 时间线映射到一段 t_ms 上：
 *   - t_ms < triggerMs       → 正常波形（ia/ib/ic ≈ 故障前 baseline）
 *   - triggerMs ≤ t_ms       → 故障波形，faulted=true
 *   - 超过 (trigger + ocpDelayUs) → 电流被切断 ≈ 0，tripped=true
 *
 * 把状态位类故障（isStatusOnlyFault）的电流近似为 0，让 UI 提示走专门 fallback。
 */
export function mockFaultInjectionSample(
  t_ms: number,
  params: FaultInjectionMockParams,
): FaultInjectionMockSample {
  const triggerMs = params.triggerMs ?? 30;
  const ocpDelayMs = (params.ocpDelayUs ?? 800) / 1000;
  const tripMs = triggerMs + ocpDelayMs;
  // 状态位故障 —— 直接返回静态电流 + flags（UI 侧据此显示告警 fallback）
  if (isStatusOnlyFault(params.faultType)) {
    return {
      t_ms,
      ia: 0,
      ib: 0,
      ic: 0,
      faulted: t_ms >= triggerMs,
      tripped: false,
    };
  }
  const waveform = createFaultWaveform(params.faultType, params.severity);
  // waveform 的 t 字段为 [0, 100]（百分比），映射到 100 ms 周期循环显示
  const cycleMs = 100;
  const tMod = ((t_ms % cycleMs) + cycleMs) % cycleMs; // → [0, 100)
  let best = waveform[0];
  for (const s of waveform) {
    if (Math.abs(s.t - tMod) < Math.abs(best.t - tMod)) best = s;
  }
  // baseline = waveform[0]（教学波形以"正常态"开头）
  const baseline = waveform[0];
  const inFault = t_ms >= triggerMs;
  const tripped = t_ms >= tripMs;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0xf00d);
  // 三相电流：切断 → 0；故障态 → 故障波形；正常态 → baseline + 轻微噪声
  const ia = tripped ? 0 : inFault ? best.ia : baseline.ia + noise() * 0.05;
  const ib = tripped ? 0 : inFault ? best.ib : baseline.ib + noise() * 0.05;
  const ic = tripped ? 0 : inFault ? best.ic : baseline.ic + noise() * 0.05;
  return { t_ms, ia, ib, ic, faulted: inFault, tripped };
}
