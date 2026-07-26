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
import { simulateStartup } from '../simulation/math/startup';
import { simulatePfcCycle, spectrumOf, outputSampleRate } from '../simulation/math/boostPfc';
import {
  clarkeTransform,
  generateThreePhaseCurrent,
  parkTransform,
} from '../simulation/math/transforms';
import { simulatePidStepResponse } from '../simulation/math/pid';
import { calculateSvpwm, determineSvpwmSector } from '../simulation/math/svpwm';
import { checkVoltageLimit, estimateTorque } from '../simulation/math/weakField';
import { simulateCycle } from '../simulation/math/vaporCycle';
import { computeSingleSidedSpectrum } from '../components/charts/dft';
import type {
  APFParams,
  FaultType,
  PIDParams,
  RefrigerationParams,
  StartupParams,
  StartupState,
  ThreePhaseParams,
  WeakFieldParams,
} from '../simulation/engine/types';

// ---------- 通用工具 ----------

/** 线性同余伪随机：给定 seed → 确定性噪声序列，用于 mock 实测的小幅噪声。 */
function makeNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1; // [-1, 1]
  };
}

/* 反 Park：dq → αβ（电角度 theta 单位 rad）。
function inverseParkInline(id: number, iq: number, theta: number): { alpha: number; beta: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { alpha: id * c - iq * s, beta: id * s + iq * c };
} */

/* 反 Clarke（amplitude-invariant）：αβ → abc。
function inverseClarkeInline(
  alpha: number,
  beta: number,
): { ia: number; ib: number; ic: number } {
  const ia = alpha;
  const ib = -0.5 * alpha + (Math.sqrt(3) / 2) * beta;
  const ic = -0.5 * alpha - (Math.sqrt(3) / 2) * beta;
  return { ia, ib, ic };
} */

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

// ---------- 5. Speed loop step response：rpm_ref / rpm_sim / rpm_real ----------

export interface SpeedLoopMockSample {
  t_ms: number;
  /** 阶跃指令转速（rpm，t<stepMs 为 0，t>=stepMs 为 rpmRef） */
  rpmRef: number;
  /** 仿真值（二阶欠阻尼步响应：上升 + 超调 + 衰减振荡） */
  rpmSim: number;
  /** 实测值（仿真 + 测量噪声 + 静差） */
  rpmReal: number;
  /** 仿真 Iq 命令（A，比例于速度环误差） */
  iqSim: number;
  /** 实测 Iq（A，仿真 + 噪声） */
  iqReal: number;
}

export interface SpeedLoopMockParams {
  /** 转速指令幅值（rpm） */
  rpmRef: number;
  /** 阶跃时刻（ms，默认 100） */
  stepMs?: number;
  /** 二阶系统自然频率（rad/s，决定上升时间；典型 30-80） */
  omegaN?: number;
  /** 阻尼比 ζ（0.4-0.9；< 1 出现超调，越小超调越大） */
  zeta?: number;
  /** 实测稳态静差（rpm，模拟编码器/采样偏差） */
  steadyErrRpm?: number;
  /** 实测噪声幅值（rpm） */
  noiseRpm?: number;
  /** Iq/rpm 等效系数（A/rpm，仿真用，典型 0.005） */
  iqPerErrRpm?: number;
}

/**
 * 二阶欠阻尼系统的解析阶跃响应：
 *   y(t) = K · (1 − exp(-ζωn·t)/√(1−ζ²) · sin(ωd·t + φ))
 *   ωd = ωn·√(1−ζ²), φ = arctan(√(1−ζ²)/ζ)
 *
 * 上升时间 tr ≈ (π−φ)/ωd；超调量 Mp = exp(-ζπ/√(1−ζ²)) × 100%。
 *
 * 这里用解析公式而不是积分仿真：每帧 O(1)，确定性输出，方便单测。
 */
export function mockSpeedLoopSample(t_ms: number, params: SpeedLoopMockParams): SpeedLoopMockSample {
  const stepMs = params.stepMs ?? 100;
  const wn = params.omegaN ?? 50;
  const zeta = Math.min(0.95, Math.max(0.2, params.zeta ?? 0.55));
  const steadyErr = params.steadyErrRpm ?? 8;
  const noiseAmp = params.noiseRpm ?? 12;
  const iqGain = params.iqPerErrRpm ?? 0.005;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0x1234);

  const dt_s = Math.max(0, (t_ms - stepMs) / 1000);
  let rpmRefNow = 0;
  let rpmSim = 0;
  if (t_ms >= stepMs) {
    rpmRefNow = params.rpmRef;
    if (dt_s < 1e-6) {
      rpmSim = 0;
    } else {
      const wd = wn * Math.sqrt(Math.max(1e-9, 1 - zeta * zeta));
      const phi = Math.atan2(Math.sqrt(1 - zeta * zeta), zeta);
      const env = Math.exp(-zeta * wn * dt_s) / Math.sqrt(1 - zeta * zeta);
      rpmSim = params.rpmRef * (1 - env * Math.sin(wd * dt_s + phi));
    }
  }
  const rpmReal = rpmSim + (t_ms >= stepMs ? steadyErr : 0) + noise() * noiseAmp;
  const errRpm = rpmRefNow - rpmSim;
  const iqSim = errRpm * iqGain;
  const iqReal = iqSim + noise() * 0.1;

  return { t_ms, rpmRef: rpmRefNow, rpmSim, rpmReal, iqSim, iqReal };
}

// ---------- 6. HFI signal chain：inject / demod / θ̂ ----------

export interface HFIMockSample {
  t_ms: number;
  /** d 轴注入电压瞬时值（V） */
  injectV: number;
  /** 解调得到的 d-q 凸极误差信号（A 等效） */
  demodErr: number;
  /** 真实电角度（rad，wrap 到 [0, 2π)） */
  thetaReal: number;
  /** HFI 估算电角度（rad，wrap 到 [0, 2π)） */
  thetaEst: number;
  /** 估算误差（rad，wrap 到 [-π, π]） */
  thetaErr: number;
  /** 由响应幅值反推的凸极比 Lq/Ld（无量纲） */
  saliencyEst: number;
}

export interface HFIMockParams {
  /** 注入电压幅值（V，典型 20-50） */
  injectV: number;
  /** 注入频率（Hz，典型 500-1500） */
  injectFreqHz: number;
  /** 凸极比 Lq/Ld（IPM 典型 1.5-3） */
  saliencyRatio: number;
  /** 转子真实速度（rpm） */
  rpm: number;
  /** PLL 锁相时间常数（ms，决定从 0 收敛到真实角度的速度） */
  lockTauMs?: number;
  /** 估算噪声幅值（rad） */
  noiseRad?: number;
  /** 凸极估算的相对偏差（无量纲，模拟标定误差） */
  saliencyBias?: number;
}

/**
 * HFI mock：解析合成"注入电压 → 凸极响应 → 解调 → PLL 锁相"四个通道。
 *
 * 实现要点：
 *   - 真实 θ_real = ω·t（机械连续转）；
 *   - 估算 θ_est：用一阶低通跟踪 θ_real，τ = lockTauMs/1000，
 *     模拟 PLL 收敛过程（启动瞬间 θ_err 接近 ±π，几个 τ 后收敛到 ±噪声）；
 *   - 解调误差 ∝ saliencyGain × sin(2·θ_err)（与 src/simulation/math/hfi.ts 公式一致）；
 *   - 凸极反推：由响应幅值反向估算 Lq/Ld，加一个 saliencyBias 模拟标定误差。
 */
export function mockHFISample(t_ms: number, params: HFIMockParams): HFIMockSample {
  const t_s = t_ms / 1000;
  const wInject = 2 * Math.PI * params.injectFreqHz;
  // 4 极对默认（与 src/simulation/math/hfi.ts 一致）
  const wReal = (params.rpm * 2 * Math.PI / 60) * 4;
  const tau = (params.lockTauMs ?? 30) / 1000;
  const noiseAmp = params.noiseRad ?? 0.01;
  const bias = params.saliencyBias ?? 0.08;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0xc0de);

  const injectV = params.injectV * Math.sin(wInject * t_s);

  // 凸极信号增益 (Lq-Ld)/(Lq+Ld) ∈ [0, 1)
  const r = Math.max(1, params.saliencyRatio);
  const saliencyGain = (r - 1) / (r + 1);

  // PLL 一阶跟踪：θ_est(t) = θ_real · (1 − exp(-t/τ))，τ 后收敛
  const thetaRealRaw = wReal * t_s;
  const k = 1 - Math.exp(-t_s / Math.max(tau, 1e-4));
  const thetaEstRaw = thetaRealRaw * k + noise() * noiseAmp;

  // 解调误差信号：与 sin(2·Δθ) 同号 + saliency 加权
  const dtheta = thetaRealRaw - thetaEstRaw;
  const demodErr = saliencyGain * Math.sin(2 * dtheta) * params.injectV * 0.03;

  // 凸极反推：从解调误差幅值反推 saliencyGain → r=(1+g)/(1-g)
  // 加 saliencyBias 模拟实测标定的系统误差
  const saliencyEst = Math.max(1.0, params.saliencyRatio * (1 + bias * Math.sin(t_s * 5)));

  // wrap 到 [0, 2π) / [-π, π]
  const thetaReal = wrap2pi(thetaRealRaw);
  const thetaEst = wrap2pi(thetaEstRaw);
  const thetaErr = wrapPi(thetaRealRaw - thetaEstRaw);

  return { t_ms, injectV, demodErr, thetaReal, thetaEst, thetaErr, saliencyEst };
}

// ---------- 7. Startup state machine：state + rpm + dω/dt 违规检测 ----------

export interface StartupMockSample {
  t_ms: number;
  state: StartupState;
  /** 仿真转速（rpm） */
  rpmSim: number;
  /** 实测转速（rpm，仿真 + 噪声） */
  rpmReal: number;
  /** 仿真 Iq（A） */
  iqSim: number;
  /** 板端实际 Iq（A，仿真 + 噪声） */
  iqReal: number;
  /** 是否处于反液击斜坡违规（瞬时 dω/dt > accelRampRpmS） */
  slugViolation: boolean;
}

export interface StartupMockParams {
  startup: StartupParams;
  /** 实测转速噪声幅值（rpm） */
  noiseRpm?: number;
  /** 实测斜坡违规阈值倍率（默认 1.5×accelRampRpmS） */
  slugFactor?: number;
}

/**
 * 启动状态机 mock：复用 simulateStartup 的稳定结果作为"理论值"，
 * 实测在仿真基础上叠加噪声 + 偶发斜坡过冲。
 *
 * 缓存 simulateStartup 结果（按 accelRamp + targetRpm + alignDuration 取 key），
 * 避免每帧重跑 8s 仿真。
 */
const startupCache = new Map<string, ReturnType<typeof simulateStartup>>();

function getStartupSeries(startup: StartupParams): ReturnType<typeof simulateStartup> {
  const key = `${startup.targetRpm}|${startup.accelRampRpmS}|${startup.alignDurationMs}|${startup.hfiHandoffRpm}|${startup.bemfHandoffRpm}|${startup.fieldweakRpm}`;
  const hit = startupCache.get(key);
  if (hit) return hit;
  const series = simulateStartup(startup);
  if (startupCache.size > 16) startupCache.clear();
  startupCache.set(key, series);
  return series;
}

export function mockStartupSample(t_ms: number, params: StartupMockParams): StartupMockSample {
  const series = getStartupSeries(params.startup);
  if (series.length === 0) {
    return {
      t_ms,
      state: 'idle',
      rpmSim: 0,
      rpmReal: 0,
      iqSim: 0,
      iqReal: 0,
      slugViolation: false,
    };
  }
  const span = series[series.length - 1].t;
  const tMod = ((t_ms % span) + span) % span;
  let best = series[0];
  let bestIdx = 0;
  for (let i = 0; i < series.length; i += 1) {
    if (Math.abs(series[i].t - tMod) < Math.abs(best.t - tMod)) {
      best = series[i];
      bestIdx = i;
    }
  }
  const noiseAmp = params.noiseRpm ?? 6;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0xbeef);

  // 斜坡违规检测：相邻两点的 dω/dt 是否超过 accelRampRpmS × slugFactor
  const slugFactor = params.slugFactor ?? 1.5;
  const limit = params.startup.accelRampRpmS * slugFactor;
  let slugViolation = false;
  if (bestIdx > 0) {
    const prev = series[bestIdx - 1];
    const dtMs = best.t - prev.t;
    if (dtMs > 0) {
      const drpm = best.rpm - prev.rpm;
      const dwdt = (drpm / dtMs) * 1000; // rpm/s
      slugViolation = Math.abs(dwdt) > limit;
    }
  }

  const rpmSim = best.rpm;
  const rpmReal = rpmSim + noise() * noiseAmp;
  const iqSim = best.iqA;
  const iqReal = iqSim + noise() * 0.15;

  return {
    t_ms,
    state: best.state,
    rpmSim,
    rpmReal,
    iqSim,
    iqReal,
    slugViolation,
  };
}

// ---------- 8. PFC：PF / THD / 谐波柱状 / Udc 纹波 ----------

export interface PfcHarmonicBin {
  /** 谐波次数 */
  order: number;
  /** 实测谐波幅值（A，相对于基波 % 表达） */
  measuredPct: number;
  /** 仿真谐波幅值（相对于基波 %） */
  simPct: number;
  /** IEC 61000-3-2 Class D 限值（相对于基波 %；只覆盖 3/5/7/9/11 次） */
  iecLimitPct: number | null;
}

export interface PfcMockResult {
  /** 实测 PF（介于 0..1） */
  pfReal: number;
  /** 仿真 PF */
  pfSim: number;
  /** 实测 THD（%） */
  thdReal: number;
  /** 仿真 THD（%） */
  thdSim: number;
  /** Udc 平均（V） */
  udcAvg: number;
  /** Udc 纹波峰峰（V） */
  udcRipple: number;
  /** 时间轴（ms） */
  t_ms: number[];
  /** 仿真 i_grid 波形（A） */
  iGridSim: number[];
  /** 实测 i_grid 波形（A，仿真 + 噪声） */
  iGridReal: number[];
  /** 仿真 Udc 时序（V） */
  udc: number[];
  /** 谐波柱状图数据（3/5/7/9/11 次） */
  harmonics: PfcHarmonicBin[];
}

export interface PfcMockParams {
  apf: APFParams;
  /** 实测电流噪声幅值（A） */
  noiseA?: number;
  /** 实测 PF 比仿真低的比例（0..0.2，模拟板上元件损耗） */
  pfDegrade?: number;
  /** 实测 THD 在仿真基础上的偏差（%，模拟 EMI 引入） */
  thdInflatePct?: number;
}

/**
 * IEC 61000-3-2 Class D（≤ 600 W 家电）部分奇次谐波限值（按基波百分比）
 * 取自标准 Table 3 列出的"A/W"（电流单位）值，
 * 这里按 1 A 基波（即 PFC 之后的额定级别）做近似换算到百分比。
 *
 * 详细：实际标准是"每瓦 mA"，工程审核时仍要回到电流绝对值；
 * 教学场景只展示相对趋势，超限/正常用颜色区分。
 */
const IEC_CLASS_D_LIMIT_PCT: Record<number, number> = {
  3: 30, // 标准给 3.4 mA/W；在 100 W 装置上 ≈ 0.34 A，对应基波 ~1A 时占 30%
  5: 19,
  7: 10,
  9: 5,
  11: 3,
};

const pfcCache = new Map<string, ReturnType<typeof simulatePfcCycle>>();

function getPfcResult(apf: APFParams): ReturnType<typeof simulatePfcCycle> {
  const key = `${apf.vAcRms}|${apf.udcRef}|${apf.boostInductanceMh}|${apf.boostCapacitanceUf}|${apf.loadCurrent}|${apf.voltageKp}|${apf.voltageKi}|${apf.currentKp}|${apf.currentKi}`;
  const hit = pfcCache.get(key);
  if (hit) return hit;
  const result = simulatePfcCycle({
    Vac_rms: apf.vAcRms,
    Vdc_ref: apf.udcRef,
    L_mH: apf.boostInductanceMh,
    C_uF: apf.boostCapacitanceUf,
    load_W: Math.max(50, apf.udcRef * apf.loadCurrent),
    Kpv: apf.voltageKp,
    Kiv: apf.voltageKi,
    Kpi: apf.currentKp,
    Kii: apf.currentKi,
  });
  if (pfcCache.size > 8) pfcCache.clear();
  pfcCache.set(key, result);
  return result;
}

export function mockPfcSample(params: PfcMockParams): PfcMockResult {
  const result = getPfcResult(params.apf);
  const noiseAmp = params.noiseA ?? 0.18;
  const pfDegrade = Math.min(0.2, Math.max(0, params.pfDegrade ?? 0.02));
  const thdInflate = params.thdInflatePct ?? 1.5;

  // 实测电流：仿真 + 噪声（按帧序号 seed 噪声 → 确定性）
  const iGridReal = new Array<number>(result.i_grid_pfc.length);
  for (let i = 0; i < result.i_grid_pfc.length; i += 1) {
    const n = makeNoise(i ^ 0xfeed);
    iGridReal[i] = result.i_grid_pfc[i] + n() * noiseAmp;
  }

  // PF：实测 = 仿真 × (1 - degrade) ；THD：实测 = 仿真 + inflate
  const pfReal = Math.max(0, result.pf * (1 - pfDegrade));
  const thdReal = Math.max(0, result.thd + thdInflate);

  // 谐波柱状：用 spectrumOf 求基波幅值再算每个奇次谐波相对值
  const fs = outputSampleRate({});
  const spec = spectrumOf(result.i_grid_pfc, fs);
  const freq = params.apf.vAcFreqHz;
  const baseBin = Math.max(1, Math.round((freq * result.i_grid_pfc.length) / fs));
  // 在 baseBin ±1 内挑实际峰
  let fundIdx = baseBin;
  for (let k = Math.max(1, baseBin - 1); k <= Math.min(spec.mag.length - 1, baseBin + 1); k += 1) {
    if (spec.mag[k] > spec.mag[fundIdx]) fundIdx = k;
  }
  const v1 = spec.mag[fundIdx] || 1e-9;
  const harmonics: PfcHarmonicBin[] = [];
  for (const order of [3, 5, 7, 9, 11]) {
    const idx = fundIdx * order;
    const simPct = idx < spec.mag.length ? (spec.mag[idx] / v1) * 100 : 0;
    // 实测稍高（含板上噪声 + 测量底）
    const measuredPct = simPct + thdInflate * 0.4 + (order === 3 ? 1.2 : order === 5 ? 0.8 : 0.3);
    harmonics.push({
      order,
      measuredPct,
      simPct,
      iecLimitPct: IEC_CLASS_D_LIMIT_PCT[order] ?? null,
    });
  }

  return {
    pfReal,
    pfSim: result.pf,
    thdReal,
    thdSim: result.thd,
    udcAvg: result.Udc_avg,
    udcRipple: result.Udc_ripple,
    t_ms: result.t_ms,
    iGridSim: result.i_grid_pfc,
    iGridReal,
    udc: result.Udc,
    harmonics,
  };
}

// ---------- 9. Three-phase：ia/ib/ic 理论 vs 实测 + KCL 残差 + 不平衡度 + 5/7 次谐波 ----------

export interface ThreePhaseMockSample {
  t_ms: number;
  /** 理论三相（generateThreePhaseCurrent，纯正弦平衡） */
  iaTheory: number;
  ibTheory: number;
  icTheory: number;
  /** 实测三相：理论 + 用户偏置（icCalibGain）+ 噪声；ic 可被用户校准系数缩放 */
  iaReal: number;
  ibReal: number;
  icReal: number;
  /** KCL 残差 = ia + ib + ic（理想 = 0） */
  kclResidual: number;
}

export interface ThreePhaseMockParams {
  threePhase: ThreePhaseParams;
  /** 实测 ic 校准系数（1.0 = 无校准误差；0.85 ~ 1.15 模拟 LEM 增益偏差） */
  icCalibGain?: number;
  /** ADC 直流偏置（A，全相一致） */
  adcBiasA?: number;
  /** 实测电流噪声幅值（A） */
  noiseA?: number;
}

/**
 * 三相基础对照：用 `generateThreePhaseCurrent` 输出理论平衡三相，
 * 实测在理论之上叠加 ADC 偏置、ic 校准系数、伪随机噪声。
 * KCL 残差用于探测增益失配 / 偏置（理想 = 0）。
 */
export function mockThreePhaseSample(t_ms: number, params: ThreePhaseMockParams): ThreePhaseMockSample {
  const t_s = t_ms / 1000;
  // 理论：复用 generateThreePhaseCurrent（保证与 ThreePhaseModule 视觉一致）
  const theory = generateThreePhaseCurrent({
    amplitude: params.threePhase.amplitude,
    frequency: params.threePhase.frequency,
    phaseDeg: params.threePhase.phaseDeg,
    time: t_s,
    balance: 0,
    harmonic: 0,
    noise: 0,
  });
  const gain = params.icCalibGain ?? 1.0;
  const bias = params.adcBiasA ?? 0;
  const noiseAmp = params.noiseA ?? 0.05;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0x3a3a);
  // 实测：参数中的 balance/harmonic 给到实测端，再叠 ic 增益 + ADC 偏置
  const real = generateThreePhaseCurrent({
    amplitude: params.threePhase.amplitude,
    frequency: params.threePhase.frequency,
    phaseDeg: params.threePhase.phaseDeg,
    time: t_s,
    balance: params.threePhase.balance,
    harmonic: params.threePhase.harmonic,
    noise: params.threePhase.noise,
  });
  const iaReal = real.ia + bias + noise() * noiseAmp;
  const ibReal = real.ib + bias + noise() * noiseAmp;
  const icReal = real.ic * gain + bias + noise() * noiseAmp;
  return {
    t_ms,
    iaTheory: theory.ia,
    ibTheory: theory.ib,
    icTheory: theory.ic,
    iaReal,
    ibReal,
    icReal,
    kclResidual: iaReal + ibReal + icReal,
  };
}

// ---------- 10. Clarke：alpha/beta 由 ia/ib 推算 vs 理论 + 散点轨迹 ----------

export interface ClarkeMockSample {
  t_ms: number;
  /** 理论 Clarke 输出（来自 generateThreePhaseCurrent → clarkeTransform） */
  alphaTheory: number;
  betaTheory: number;
  /** 实测 Clarke：用 ia/ib（带 ic 校准）→ Clarke → α/β */
  alphaReal: number;
  betaReal: number;
  /** 零序分量（不平衡度的直接指标，理想 = 0） */
  zeroSeq: number;
}

export interface ClarkeMockParams {
  threePhase: ThreePhaseParams;
  /** 实测 ic 校准系数（与 ThreePhaseMockParams 一致） */
  icCalibGain?: number;
  noiseA?: number;
}

/**
 * Clarke 对照：理论用 generateThreePhaseCurrent + clarkeTransform；
 * 实测在原始 ia/ib/ic 上注入 ic 校准误差，再过 Clarke。
 * 用户可调 icCalibGain：1.0 → 平衡，0.7 / 1.3 → αβ 平面从圆形变椭圆。
 */
export function mockClarkeSample(t_ms: number, params: ClarkeMockParams): ClarkeMockSample {
  const sample = mockThreePhaseSample(t_ms, {
    threePhase: params.threePhase,
    icCalibGain: params.icCalibGain,
    noiseA: params.noiseA,
  });
  const ab_theory = clarkeTransform({ ia: sample.iaTheory, ib: sample.ibTheory, ic: sample.icTheory });
  const ab_real = clarkeTransform({ ia: sample.iaReal, ib: sample.ibReal, ic: sample.icReal });
  return {
    t_ms,
    alphaTheory: ab_theory.alpha,
    betaTheory: ab_theory.beta,
    alphaReal: ab_real.alpha,
    betaReal: ab_real.beta,
    zeroSeq: ab_real.zero ?? 0,
  };
}

// ---------- 11. Park：(α/β, θe) → Id/Iq 实测 vs 理论 + 角度误差注入 ----------

export interface ParkMockSample {
  t_ms: number;
  /** 理论 Park 输出（用正确 θ_e） */
  idTheory: number;
  iqTheory: number;
  /** 实测 Park 输出（用 θ_e + Δθ 偏差） */
  idReal: number;
  iqReal: number;
  /** 当前角度误差（rad） */
  deltaTheta: number;
}

export interface ParkMockParams {
  threePhase: ThreePhaseParams;
  /** 注入的角度偏差（度），表现为 dq 串扰 */
  thetaErrorDeg?: number;
  /** 实测 ic 校准（与上游对齐） */
  icCalibGain?: number;
  noiseA?: number;
}

/**
 * Park 对照：理论 = generateThreePhaseCurrent → Clarke → Park（用正确 θ_e）。
 * 实测 = 同一段 αβ → Park（θ_e + Δθ），让 Id/Iq 出现明显串扰。
 *
 * 工程意义：演示电角度对齐误差 1° 就会让 Id 出现 ~Iq×sin(Δθ) 的串扰，进而被 PI 误响应。
 */
export function mockParkSample(t_ms: number, params: ParkMockParams): ParkMockSample {
  const t_s = t_ms / 1000;
  const sample = mockClarkeSample(t_ms, {
    threePhase: params.threePhase,
    icCalibGain: params.icCalibGain,
    noiseA: params.noiseA,
  });
  // θ_e = ω·t + phaseDeg（弧度）；与 generateThreePhaseCurrent 的相位约定一致
  const theta = 2 * Math.PI * params.threePhase.frequency * t_s + (params.threePhase.phaseDeg * Math.PI) / 180;
  const delta = ((params.thetaErrorDeg ?? 0) * Math.PI) / 180;
  const dq_theory = parkTransform({ alpha: sample.alphaTheory, beta: sample.betaTheory }, theta);
  const dq_real = parkTransform({ alpha: sample.alphaReal, beta: sample.betaReal }, theta + delta);
  return {
    t_ms,
    idTheory: dq_theory.d,
    iqTheory: dq_theory.q,
    idReal: dq_real.d,
    iqReal: dq_real.q,
    deltaTheta: delta,
  };
}

// ---------- 12. PID 阶跃响应：实测 vs 仿真 + Ziegler-Nichols 建议 ----------

export interface PidMockSample {
  t_ms: number;
  /** 阶跃目标（PID 模块的 target） */
  ref: number;
  /** 仿真值（simulatePidStepResponse 的 value） */
  sim: number;
  /** 实测值（仿真 + 噪声 + 稳态静差） */
  real: number;
}

export interface PidMockParams {
  pid: PIDParams;
  /** 实测稳态静差幅值（同被控量单位） */
  steadyErr?: number;
  /** 实测噪声幅值 */
  noiseAmp?: number;
}

/**
 * PID 阶跃响应 mock：缓存 simulatePidStepResponse 的整段结果（按 kp/ki/kd/target 取 key），
 * 然后按 t 找最近一帧；实测 = 仿真 + 噪声 + 稳态偏差。
 */
const pidCache = new Map<string, ReturnType<typeof simulatePidStepResponse>>();

function getPidSeries(pid: PIDParams): ReturnType<typeof simulatePidStepResponse> {
  const key = `${pid.kp.toFixed(4)}|${pid.ki.toFixed(4)}|${pid.kd.toFixed(4)}|${pid.target.toFixed(3)}|${pid.sampleMs.toFixed(2)}|${pid.limit.toFixed(2)}|${pid.antiWindup ? 1 : 0}|${pid.loadDisturbance.toFixed(3)}`;
  const hit = pidCache.get(key);
  if (hit) return hit;
  const series = simulatePidStepResponse(
    { kp: pid.kp, ki: pid.ki, kd: pid.kd },
    pid.target,
    pid.sampleMs / 1000,
    1.2,
  );
  if (pidCache.size > 32) pidCache.clear();
  pidCache.set(key, series);
  return series;
}

export function mockPidSample(t_ms: number, params: PidMockParams): PidMockSample {
  const series = getPidSeries(params.pid);
  if (series.length === 0) return { t_ms, ref: params.pid.target, sim: 0, real: 0 };
  const span = series[series.length - 1].t;
  const t_s = (t_ms / 1000) % (span > 0 ? span * 1.1 : 1);
  // 找最近一帧
  let best = series[0];
  for (const s of series) {
    if (Math.abs(s.t - t_s) < Math.abs(best.t - t_s)) best = s;
  }
  const noiseAmp = params.noiseAmp ?? 0.06;
  const steady = params.steadyErr ?? 0.04;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0x5111);
  return {
    t_ms,
    ref: params.pid.target,
    sim: best.value,
    real: best.value + steady + noise() * noiseAmp,
  };
}

/**
 * Ziegler-Nichols 简化整定建议：基于阶跃响应中估算的"极限增益 Ku"和"振荡周期 Tu"。
 *
 * 这里只把"响应是否欠阻尼"判出来：超调 > 10% 且振荡 → 用 ZN PI 公式
 *   Kp_zn = 0.45 Ku  ；Ti_zn = 0.83 Tu  → Ki_zn = Kp_zn / Ti_zn
 *
 * 工程教学：演示如何根据"实测"曲线给出更合理的 Kp/Ki，而不是凭手感。
 */
export interface ZnTuning {
  /** 估算的振荡周期（s），无振荡 → NaN */
  Tu: number | null;
  /** 建议 Kp（简单 PI） */
  kpSuggest: number;
  /** 建议 Ki（简单 PI） */
  kiSuggest: number;
  /** 是否真有振荡（满足 Mp>10% 且能找到两个相邻峰） */
  oscillating: boolean;
}

export function suggestZnTuning(samples: Array<{ t_ms: number; sim: number }>, target: number, currentKp: number): ZnTuning {
  if (samples.length < 12 || target === 0) {
    return { Tu: null, kpSuggest: currentKp, kiSuggest: 0, oscillating: false };
  }
  // 找峰：上升后第一个局部极大值与第二个局部极大值
  let peak1Idx = -1;
  let peak2Idx = -1;
  for (let i = 2; i < samples.length - 2; i += 1) {
    const v = samples[i].sim;
    const isMax = v > samples[i - 1].sim && v > samples[i + 1].sim;
    if (!isMax) continue;
    if (peak1Idx < 0) peak1Idx = i;
    else if (peak2Idx < 0) {
      peak2Idx = i;
      break;
    }
  }
  let Tu: number | null = null;
  let oscillating = false;
  if (peak1Idx > 0 && peak2Idx > peak1Idx) {
    Tu = (samples[peak2Idx].t_ms - samples[peak1Idx].t_ms) / 1000;
    const overshoot = (samples[peak1Idx].sim - target) / Math.abs(target);
    oscillating = overshoot > 0.1 && Tu > 0;
  }
  // Ku 取当前 Kp 的 1.5×（教学简化：假定当前已接近临界振荡）
  const Ku = currentKp * 1.5;
  const kpSuggest = 0.45 * Ku;
  const Ti = (Tu ?? 0.1) * 0.83;
  const kiSuggest = Ti > 0 ? kpSuggest / Ti : 0;
  return { Tu, kpSuggest, kiSuggest, oscillating };
}

// ---------- 13. SVPWM：duty 实测 vs 理论 + 扇区跟踪 + 调制比越界 ----------

export interface SvpwmMockSample {
  t_ms: number;
  /** 理论 duty（calculateSvpwm 直接给出） */
  dutyATheory: number;
  dutyBTheory: number;
  dutyCTheory: number;
  /** 实测 duty（理论 + 量化噪声 + 死区扣减） */
  dutyAReal: number;
  dutyBReal: number;
  dutyCReal: number;
  /** 当前扇区 1..6 */
  sector: number;
  /** 调制比 m = √3·|U|/Udc */
  modulationIndex: number;
  /** 调制比是否越界（≥ 1.0 进入过调制） */
  overModulation: boolean;
  /** 理论线电压 V_ab（V） */
  vabTheory: number;
}

export interface SvpwmMockParams {
  /** 直流母线（V） */
  uDc: number;
  /** 矢量幅值（V） */
  vMag: number;
  /** 旋转频率（Hz，让矢量在 αβ 平面以 ω 角速度转） */
  rotationHz: number;
  /** 死区时间（μs）—— 影响实测 duty 的扣减幅度 */
  deadTimeUs?: number;
  /** PWM 频率（Hz） */
  pwmFrequency?: number;
  /** duty 量化噪声（一般 ≤ 0.005，模拟 CCR 量化） */
  dutyNoise?: number;
}

/**
 * SVPWM 对照：让 αβ 矢量按 rotationHz 旋转，每帧调一次 calculateSvpwm 拿理论 duty；
 * 实测 = 理论 - sign(i)·deadLoss + 量化噪声。
 *
 * 死区损失 deadLoss = t_dead × f_sw（无量纲），sign(i) 用 sin(ωt + 相移) 近似。
 * 同时给出当前扇区 + 调制比 + 过调制 flag + 线电压 √3·V·sin(60°−θs+30°) 教学用。
 */
export function mockSvpwmSample(t_ms: number, params: SvpwmMockParams): SvpwmMockSample {
  const t_s = t_ms / 1000;
  const omega = 2 * Math.PI * params.rotationHz;
  const ang = omega * t_s;
  const uAlpha = params.vMag * Math.cos(ang);
  const uBeta = params.vMag * Math.sin(ang);
  const result = calculateSvpwm({ uAlpha, uBeta, uDc: params.uDc, carrierPeriod: 1 / (params.pwmFrequency ?? 16000) });
  const sector = determineSvpwmSector(uAlpha, uBeta);
  const modulationIndex = (Math.sqrt(3) * Math.hypot(uAlpha, uBeta)) / Math.max(1e-6, params.uDc);

  const deadLoss = (params.deadTimeUs ?? 0) * 1e-6 * (params.pwmFrequency ?? 16000);
  // 电流方向用 sin(ang)、sin(ang-120°)、sin(ang+120°) 近似（假定阻性负载，电流与电压同相）
  const iaSign = Math.sin(ang);
  const ibSign = Math.sin(ang - (2 * Math.PI) / 3);
  const icSign = Math.sin(ang + (2 * Math.PI) / 3);
  const noiseAmp = params.dutyNoise ?? 0.002;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0x9911);
  const dutyAReal = clamp01(result.dutyA - deadLoss * Math.sign(iaSign) * 0.5 + noise() * noiseAmp);
  const dutyBReal = clamp01(result.dutyB - deadLoss * Math.sign(ibSign) * 0.5 + noise() * noiseAmp);
  const dutyCReal = clamp01(result.dutyC - deadLoss * Math.sign(icSign) * 0.5 + noise() * noiseAmp);

  // 线电压：教学用 V_ab = √3·V·cos(ωt + 30°) 近似（基波分量）
  const vabTheory = Math.sqrt(3) * params.vMag * Math.cos(ang + Math.PI / 6);

  return {
    t_ms,
    dutyATheory: result.dutyA,
    dutyBTheory: result.dutyB,
    dutyCTheory: result.dutyC,
    dutyAReal,
    dutyBReal,
    dutyCReal,
    sector,
    modulationIndex,
    overModulation: modulationIndex >= 1.0,
    vabTheory,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------- 14. Sensorless：BEMF + PLL 锁相 ----------

export interface SensorlessMockSample {
  t_ms: number;
  /** 理论真实角度（rad，wrap 到 [0, 2π)） */
  thetaTrue: number;
  /** BEMF observer 输出角度（rad） */
  thetaObs: number;
  /** PLL 跟踪角度（rad） */
  thetaPll: number;
  /** 仿真 / 估算速度（rpm） */
  speedSim: number;
  speedEst: number;
  /** 当前角度误差（°） */
  errorDeg: number;
  /** BEMF 幅值（V，与 ω·ψf 成正比） */
  bemfMag: number;
}

export interface SensorlessMockParams {
  /** 真实转速（rpm） */
  speedRpm: number;
  /** 极对数 */
  polePairs: number;
  /** 永磁磁链 ψf（Wb） */
  flux: number;
  /** PLL 锁相时间常数（ms） */
  lockTauMs?: number;
  /** 观测噪声幅值（rad） */
  noiseRad?: number;
  /** 速度估算稳态静差比例（无量纲，0.02 ≈ 2%） */
  speedErrPct?: number;
}

/**
 * Sensorless mock：把 BEMF 观测器和 PLL 锁相的"行为"用解析式近似。
 * BEMF 跟随真实角度（小幅噪声），PLL 一阶低通追踪 BEMF（τ 收敛时间）。
 * 速度估算 = 真实速度 × (1 ± speedErrPct)。
 */
export function mockSensorlessSample(t_ms: number, params: SensorlessMockParams): SensorlessMockSample {
  const t_s = t_ms / 1000;
  const wMech = (params.speedRpm * 2 * Math.PI) / 60;
  const wElec = wMech * params.polePairs;
  const tau = (params.lockTauMs ?? 30) / 1000;
  const noiseAmp = params.noiseRad ?? 0.005;
  const errPct = params.speedErrPct ?? 0.015;
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0xa1b2);

  const thetaTrueRaw = wElec * t_s;
  // BEMF observer：高速时几乎瞬时跟，低速时被噪声主导（教学：speedRpm < 500 时误差放大）
  const lowSpeedPenalty = params.speedRpm < 500 ? 1 + (500 - params.speedRpm) / 250 : 1;
  const thetaObsRaw = thetaTrueRaw + noise() * noiseAmp * lowSpeedPenalty;
  // PLL：一阶低通把 BEMF 角度平滑过滤
  const k = 1 - Math.exp(-t_s / Math.max(tau, 1e-4));
  const thetaPllRaw = thetaObsRaw * k;

  const thetaTrue = wrap2pi(thetaTrueRaw);
  const thetaObs = wrap2pi(thetaObsRaw);
  const thetaPll = wrap2pi(thetaPllRaw);
  const errorRad = wrapPi(thetaPllRaw - thetaTrueRaw);
  const errorDeg = (errorRad * 180) / Math.PI;

  return {
    t_ms,
    thetaTrue,
    thetaObs,
    thetaPll,
    speedSim: params.speedRpm,
    speedEst: params.speedRpm * (1 + errPct * Math.sin(t_s * 3)),
    errorDeg,
    bemfMag: params.flux * Math.abs(wElec),
  };
}

// ---------- 15. Field-weakening：(Id,Iq) 工作点 vs MTPA/MTPV + 电压撞限 + 铁损 ----------

export interface FieldWeakeningMockSample {
  t_ms: number;
  /** 实测工作点 Id（A，叠了小幅噪声） */
  idReal: number;
  iqReal: number;
  /** 理论 MTPA 工作点对应当前 Iq（A） */
  idMtpa: number;
  /** 电压幅值（V） */
  vMag: number;
  /** 电压极限（Udc / √3 × margin，V） */
  vLimit: number;
  /** 是否撞限 */
  saturated: boolean;
  /** 实时铁损（W，简化模型 P_iron = k_e·ω² + k_h·ω） */
  ironLossW: number;
  /** 估算转矩（N·m） */
  torque: number;
}

export interface FieldWeakeningMockParams {
  weakField: WeakFieldParams;
  /** 极对数 */
  polePairs: number;
  /** 铁损系数 k_e（涡流，W/(rad/s)²） */
  ironLossKe?: number;
  /** 铁损系数 k_h（磁滞，W/(rad/s)） */
  ironLossKh?: number;
  /** 实测电流噪声幅值（A） */
  noiseA?: number;
}

/**
 * 弱磁工作点 mock：用 store.weakField 拿到 (Id, Iq, Udc, targetRpm, Ld, Lq, ψf, voltageMargin)；
 * 调 checkVoltageLimit 判断是否撞限；同时给出 MTPA 理论 Id（IPM 简化公式）和铁损。
 *
 * MTPA（IPM 表达式简化）：当 Lq > Ld 时，最大转矩/电流轨迹满足
 *   Id_mtpa = ψf/(4·(Lq−Ld)) − √(ψf²/(4·(Lq−Ld))² + Iq²/2)  （Id ≤ 0）
 * SPM 退化（Ld≈Lq）时直接取 Id_mtpa = 0。
 */
export function mockFieldWeakeningSample(t_ms: number, params: FieldWeakeningMockParams): FieldWeakeningMockSample {
  const t_s = t_ms / 1000;
  const ld = params.weakField.ldMh / 1000;
  const lq = params.weakField.lqMh / 1000;
  const wMech = (params.weakField.targetRpm * 2 * Math.PI) / 60;
  const wElec = wMech * params.polePairs;
  // 简化 vd / vq（与 FieldWeakeningModule 中一致）
  const vd = 0.55 * params.weakField.id - wElec * lq * params.weakField.iq;
  const vq = 0.55 * params.weakField.iq + wElec * (ld * params.weakField.id + params.weakField.flux);
  const voltage = checkVoltageLimit({ vd, vq, uDc: params.weakField.uDc, margin: params.weakField.voltageMargin });
  const torque = estimateTorque({
    id: params.weakField.id,
    iq: params.weakField.iq,
    ld,
    lq,
    flux: params.weakField.flux,
    polePairs: params.polePairs,
  });

  // MTPA 理论 Id（IPM）；SPM 时 |Ld-Lq|≈0 → 直接 0
  let idMtpa = 0;
  const dl = lq - ld;
  if (Math.abs(dl) > 1e-6) {
    const k = params.weakField.flux / (4 * dl);
    idMtpa = k - Math.sqrt(k * k + (params.weakField.iq * params.weakField.iq) / 2);
    // Id_mtpa 物理上应 ≤ 0（IPM 凸极引入的负 Id 节流）
    if (idMtpa > 0) idMtpa = 0;
  }

  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0xbaba);
  const noiseAmp = params.noiseA ?? 0.06;
  const idReal = params.weakField.id + noise() * noiseAmp;
  const iqReal = params.weakField.iq + noise() * noiseAmp;

  // 铁损：P_iron = ke·ω² + kh·|ω|（电频率）
  const ke = params.ironLossKe ?? 0.0008;
  const kh = params.ironLossKh ?? 0.02;
  const ironLossW = ke * wElec * wElec + kh * Math.abs(wElec);

  // 让 vMag / saturated 略带 0.5 Hz 慢慢摆动，方便 UI 看到撞限动态（避免完全静态）
  const dither = 1 + 0.02 * Math.sin(t_s * Math.PI);

  return {
    t_ms,
    idReal,
    iqReal,
    idMtpa,
    vMag: voltage.magnitude * dither,
    vLimit: voltage.limit,
    saturated: voltage.saturated,
    ironLossW,
    torque,
  };
}

// ---------- 16. Refrigeration bench：实测 P/T/I vs 仿真 + COP 偏差 + 等熵效率反推 ----------

export interface RefrigerationMockSample {
  t_ms: number;
  /** 实测吸气压力（MPa） */
  psReal: number;
  psSim: number;
  /** 实测排气压力（MPa） */
  pdReal: number;
  pdSim: number;
  /** 实测排气温度（°C） */
  tdReal: number;
  tdSim: number;
  /** 实测压缩机电流（A，由 Wcomp / Udc 反算 + 噪声） */
  currentReal: number;
  currentSim: number;
  /** 实测 COP */
  copReal: number;
  copSim: number;
  /** 等熵效率反推（从实测 COP × 仿真 ΔH × m_dot → 反推 η） */
  isentropicEffEst: number;
}

export interface RefrigerationMockParams {
  refrig: RefrigerationParams;
  /** 压缩机转速（rpm） */
  rpm: number;
  /** 直流母线电压（V，用于反推电流） */
  udc?: number;
  /** 实测 COP 相对仿真的退化比例（含管路损失 / 换热损失） */
  copDegrade?: number;
  /** 实测压力噪声幅值（MPa） */
  noiseMpa?: number;
  /** 实测温度噪声幅值（°C） */
  noiseC?: number;
  /** 实测电流噪声幅值（A） */
  noiseA?: number;
}

/**
 * 制冷台架 mock：缓存 simulateCycle 的稳态结果（按 Te/Tc/SH/SC/rpm 取 key），
 * 实测在每帧上加噪声 + 把 COP 退化 1-5% 模拟实际系统的非理想（管路压损、换热温差）。
 *
 * 等熵效率反推：η_est = m_dot · ΔH_isentropic / W_real，其中 W_real 由 cop_real × Q_c 反推。
 * 教学用：让用户看"实测 COP 退一点 → 反推 η_isentropic 跟着退多少"。
 */
const refrigCache = new Map<string, ReturnType<typeof simulateCycle>>();

function getRefrigCycle(refrig: RefrigerationParams, rpm: number): ReturnType<typeof simulateCycle> {
  const key = `${refrig.refrigerant}|${refrig.Te.toFixed(2)}|${refrig.Tc.toFixed(2)}|${refrig.superheatK.toFixed(2)}|${refrig.subcoolK.toFixed(2)}|${refrig.displacementCc.toFixed(2)}|${refrig.clearanceRatio.toFixed(4)}|${refrig.isentropicEff.toFixed(3)}|${refrig.eevOpening.toFixed(3)}|${rpm.toFixed(0)}`;
  const hit = refrigCache.get(key);
  if (hit) return hit;
  const result = simulateCycle({
    refrigerant: refrig.refrigerant,
    Te: refrig.Te,
    Tc: refrig.Tc,
    superheatK: refrig.superheatK,
    subcoolK: refrig.subcoolK,
    displacementCc: refrig.displacementCc,
    clearanceRatio: refrig.clearanceRatio,
    rpm: Math.max(100, rpm),
    isentropicEff: refrig.isentropicEff,
    eevOpening: refrig.eevOpening,
  });
  if (refrigCache.size > 16) refrigCache.clear();
  refrigCache.set(key, result);
  return result;
}

export function mockRefrigerationSample(t_ms: number, params: RefrigerationMockParams): RefrigerationMockSample {
  const cycle = getRefrigCycle(params.refrig, params.rpm);
  const noise = makeNoise(Math.floor(t_ms * 1000) ^ 0xcafe);
  const ps_n = params.noiseMpa ?? 0.005;
  const t_n = params.noiseC ?? 0.6;
  const i_n = params.noiseA ?? 0.15;
  const udc = params.udc ?? 310;
  const copDeg = Math.min(0.2, Math.max(0, params.copDegrade ?? 0.04));

  // 仿真电流：Wcomp(kW) × 1000 / Udc / 单相功率因数 0.95 ≈ I
  const currentSim = (cycle.Wcomp * 1000) / Math.max(udc, 1) / 0.95;
  const copSim = cycle.cop;
  const copReal = Math.max(0, copSim * (1 - copDeg));
  // 等熵效率反推：η_est × η_param = COP_real / COP_sim × η_param
  // （因为 COP ∝ Q_c / W_comp，W_comp 中已经 ÷ η_isentropic，所以 COP_real/COP_sim 比例反推 η_real）
  const isentropicEffEst = params.refrig.isentropicEff * (copReal / Math.max(1e-6, copSim));

  return {
    t_ms,
    psReal: cycle.states[0].P + noise() * ps_n,
    psSim: cycle.states[0].P,
    pdReal: cycle.states[1].P + noise() * ps_n,
    pdSim: cycle.states[1].P,
    tdReal: cycle.states[1].T + noise() * t_n,
    tdSim: cycle.states[1].T,
    currentReal: currentSim + noise() * i_n,
    currentSim,
    copReal,
    copSim,
    isentropicEffEst,
  };
}

/**
 * 把一段时序样本的某通道做 FFT，返回单边谱（freq, mag）。
 * 复用 dft.ts::computeSingleSidedSpectrum，让卡片不直接依赖 charts/dft 入口。
 */
export function spectrumOfChannel(samples: number[], sampleRateHz: number): { freq: number[]; mag: number[] } {
  return computeSingleSidedSpectrum(samples, sampleRateHz);
}
