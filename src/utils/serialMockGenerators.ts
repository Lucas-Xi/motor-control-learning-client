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
import type { APFParams, FaultType, StartupParams, StartupState } from '../simulation/engine/types';

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
