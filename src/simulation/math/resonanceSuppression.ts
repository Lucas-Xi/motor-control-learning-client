/**
 * 机械共振陷波抑制（Anti-Resonance Notch）—— 速度环 iq 命令 biquad 陷波闭环仿真。
 *
 * **背景**：
 *   mechanicalCompliance.ts 算出双质量传动的共振峰；速度环 PI 增益高时会被这个峰
 *   反馈成持续振荡（电机端 omegaMotor 在共振频率上下抖）。STM32 上最便宜的对策：
 *   在速度 PI 输出（iq_cmd）和电机之间串一个二阶陷波，中心频率 = 共振 Hz、Q ≈ 5-15。
 *
 * **关键工程权衡**：
 *   1. **陷波 Q 取值**：Q 越大陷得越窄越深、对带宽损失越小，但
 *      温度漂移、惯量变化（负载切换）让真实共振点漂出陷波带宽 → 失效；
 *      Q 太小则连带把控制带宽内的有效信号也滤掉，速度环响应变慢。
 *   2. **频率失配 Δf**：真实共振频率与陷波中心差 5% 就足够让抑制下降 6-12 dB。
 *      高端方案在线辨识共振（FFT / Goertzel）+ 适应陷波，本卡只演示固定陷波。
 *   3. **群延时**：陷波在中心频率附近群延时显著 → 速度阶跃响应稍慢（10-30 ms 多）。
 *      教学意义：抑制振荡和响应速度永远在 trade-off。
 *
 * **参考**：
 *   - Vukosavic & Stojic, "Suppression of torsional oscillations in a high-performance
 *     speed servo drive", IEEE Trans. Ind. Electron. 1998
 *   - Schaefer "Anti-resonance feedback design for electric vehicle drives" 2017
 */

import { makeNotch } from './biquad';
import {
  createComplianceState,
  stepCompliance,
  resonanceFrequencies,
  type ComplianceParams,
} from './mechanicalCompliance';

export interface NotchSweepInput {
  /** 机械传动柔性参数（决定共振峰） */
  params: ComplianceParams;
  /** 速度阶跃指令 (rad/s) */
  omegaRefRadS: number;
  /** 速度环 Kp（PI 比例增益，故意取偏大以激发共振） */
  Kp: number;
  /** 速度环 Ki（PI 积分增益） */
  Ki: number;
  /** 转矩常数 K_t = 1.5·p·ψf (N·m/A) */
  Kt: number;
  /** 仿真时长 (s) */
  durationSec: number;
  /** 步长 (s) */
  dtSec: number;
  /** 启用陷波（false = 纯 PI 直接接电机，作对照） */
  useNotch: boolean;
  /** 陷波中心相对真实共振频率的失配比例 0..1（0 = 完美对齐；0.05 = 偏 5%） */
  detuneFrac?: number;
  /** 陷波 Q（默认 8） */
  Q?: number;
}

export interface NotchSweepSample {
  /** 时间 (ms) */
  tMs: number;
  /** 电机机械角速度 (rad/s) */
  omegaMotor: number;
  /** 负载机械角速度 (rad/s) */
  omegaLoad: number;
  /** 速度环 PI 输出（陷波**前**） */
  iqRaw: number;
  /** 陷波后送给电机的 iq（useNotch=false 时与 iqRaw 相等） */
  iqMotor: number;
  /** 轴扭簧瞬时扭矩 (N·m) */
  Tspring: number;
}

export interface NotchSweepResult {
  samples: NotchSweepSample[];
  /** 稳态参考速度 */
  omegaRefRadS: number;
  /** 共振频率 (Hz)，作为陷波中心的真值 */
  resonanceHz: number;
  /** 实际陷波中心 (Hz)，含失配 */
  notchCenterHz: number;
  /** 稳态后期（最后 30%）omegaMotor 围绕参考的 RMS 误差 */
  rmsErrorRadS: number;
  /** 阶跃响应 90% 上升时间 (ms)，未达 90% 返回 null */
  riseTime90Ms: number | null;
  /** omegaMotor 峰值超调比例 (omega_max - omega_ref) / omega_ref */
  overshootFrac: number;
}

/**
 * 跑一段速度阶跃 → PI → (可选 notch) → stepCompliance 双质量 → 反馈测速的闭环。
 *
 * 速度环用经典 PI：
 *   error = ω_ref − ω_motor
 *   iq_raw = Kp · error + Ki · ∫error dt   (积分限幅 ±200)
 *
 * 然后根据 useNotch 决定 iq_motor = iq_raw 或 iq_motor = notch.step(iq_raw)。
 * 电磁转矩 Tem = Kt · iq_motor 喂给 stepCompliance；测速从 omegaMotor 反馈回 PI。
 */
export function simulateNotchSweep(input: NotchSweepInput): NotchSweepResult {
  const fs = 1 / input.dtSec;
  const { resonanceHz } = resonanceFrequencies(input.params);
  const detune = input.detuneFrac ?? 0;
  const Q = input.Q ?? 8;
  const notchCenterHz = resonanceHz * (1 + detune);
  const notch = makeNotch(notchCenterHz, fs, Q);

  let state = createComplianceState();
  let integ = 0;
  const samples: NotchSweepSample[] = [];

  const N = Math.max(2, Math.round(input.durationSec / input.dtSec));
  let omegaMax = -Infinity;
  for (let i = 0; i < N; i += 1) {
    const t = i * input.dtSec;
    const error = input.omegaRefRadS - state.omegaMotor;
    integ = Math.max(-200, Math.min(200, integ + error * input.dtSec));
    const iqRaw = input.Kp * error + input.Ki * integ;
    const iqMotor = input.useNotch ? notch.step(iqRaw) : iqRaw;
    const Tem = input.Kt * iqMotor;
    state = stepCompliance({
      Tem,
      TloadExt: 0,
      dt: input.dtSec,
      params: input.params,
      state,
    });
    if (state.omegaMotor > omegaMax) omegaMax = state.omegaMotor;
    // 每 ~1 ms 一个采样（步长 dt 通常 ~100 μs），避免图表数据过密
    const tickEveryNStep = Math.max(1, Math.floor(1e-3 / input.dtSec));
    if (i % tickEveryNStep === 0) {
      samples.push({
        tMs: Number((t * 1000).toFixed(2)),
        omegaMotor: state.omegaMotor,
        omegaLoad: state.omegaLoad,
        iqRaw,
        iqMotor,
        Tspring: state.Tspring,
      });
    }
  }

  // 稳态 RMS：最后 30% 窗口
  const tailStart = Math.floor(samples.length * 0.7);
  let sq = 0;
  let cnt = 0;
  for (let k = tailStart; k < samples.length; k += 1) {
    const e = samples[k].omegaMotor - input.omegaRefRadS;
    sq += e * e;
    cnt += 1;
  }
  const rmsErrorRadS = cnt > 0 ? Math.sqrt(sq / cnt) : 0;

  // 90% 上升时间
  const target90 = 0.9 * input.omegaRefRadS;
  let riseTime90Ms: number | null = null;
  for (const s of samples) {
    if (Math.abs(s.omegaMotor) >= Math.abs(target90)) {
      riseTime90Ms = s.tMs;
      break;
    }
  }

  const overshootFrac =
    Math.abs(input.omegaRefRadS) > 1e-6
      ? Math.max(0, (omegaMax - input.omegaRefRadS) / input.omegaRefRadS)
      : 0;

  return {
    samples,
    omegaRefRadS: input.omegaRefRadS,
    resonanceHz,
    notchCenterHz,
    rmsErrorRadS,
    riseTime90Ms,
    overshootFrac,
  };
}
