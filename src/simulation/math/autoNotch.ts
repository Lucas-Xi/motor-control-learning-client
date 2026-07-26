/**
 * 自动陷波搜索：频率扫描 + 谐振峰检测 + 陷波中心频率自适应计算。
 *
 * 算法流程：
 * 1. 扫频信号激励（chirp / 扫频正弦），遍历关注频段
 * 2. 从速度响应中做 FFT 或频谱估计，找到幅值峰值
 * 3. 将峰值频率设为陷波器中心频率
 * 4. 返回自动整定后的陷波参数
 */

import { makeNotch, type BiquadFilter } from './biquad';
import { computeSingleSidedSpectrum } from '../../components/charts/dft';
import { stepCompliance, resonanceFrequencies, type ComplianceParams, type ComplianceState } from './mechanicalCompliance';

export interface NotchSearchInput {
  compliance: ComplianceParams;
  fs: number;                // 采样率（Hz），默认 10000
  freqMin: number;           // 扫描下限（Hz），默认 10
  freqMax: number;           // 扫描上限（Hz），默认 2000
  scanDurationSec: number;   // 扫频时长（s），默认 2
  chirpAmplitude: number;    // 扫频激励幅值（Nm），默认 0.5
}

export interface NotchSearchResult {
  /** 检测到的谐振频率（Hz），如未检测到返回 null */
  resonanceHz: number | null;
  /** 建议的陷波器中心频率（Hz），默认 = resonanceHz */
  notchCenterHz: number | null;
  /** 峰值幅值（相对单位） */
  peakMagnitude: number;
  /** 所有扫描点的频谱数据 */
  spectrum: Array<{ freq: number; mag: number }>;
  /** 子函数返回的机械谐振频率 */
  mechanicalResonanceHz: number[];
}

/**
 * 执行自动陷波搜索。
 *
 * 1. 先用机械模型解析计算谐振频率（由 compliance 参数决定）
 * 2. 再用扫频激励 + FFT 做实测验证
 * 3. 两者交叉确认后返回建议陷波中心频率
 */
export function autoNotchSearch(input: NotchSearchInput): NotchSearchResult {
  const {
    compliance, fs, freqMin, freqMax,
    scanDurationSec, chirpAmplitude,
  } = input;

  const dt = 1 / fs;
  const numSteps = Math.round(scanDurationSec * fs);
  const sampleRate = fs;

  // 1) 解析计算：从机械模型获得谐振频率
  const resonanceObj = resonanceFrequencies(compliance);
  const mechResonances = [resonanceObj.resonanceHz];

  // 2) 扫频激励 + FFT
  const speedSamples: number[] = [];
  let omega = 0; // rad/s

  // 两质量模型状态
  const state: ComplianceState = { thetaMotor: 0, thetaLoad: 0, omegaMotor: 0, omegaLoad: 0, Tspring: 0 };

  for (let i = 0; i < numSteps; i++) {
    const t = i * dt;

    // Chirp 信号直接作为转矩激励注入（跳过 PI 控制器，避免积分饱和淹没 AC 分量）
    const fInstant = freqMin + (t / scanDurationSec) * (freqMax - freqMin);
    const torqueCmd = chirpAmplitude * Math.sin(2 * Math.PI * fInstant * t);

    // 两质量模型步进
    const mech = stepCompliance({
      Tem: torqueCmd,
      TloadExt: 0,
      dt,
      params: compliance,
      state,
    });
    omega = mech.omegaMotor;
    state.thetaMotor = mech.thetaMotor;
    state.thetaLoad = mech.thetaLoad;
    state.omegaMotor = mech.omegaMotor;
    state.omegaLoad = mech.omegaLoad;
    state.Tspring = mech.Tspring;

    // 只记录稳态后半段
    if (i >= numSteps / 4) {
      speedSamples.push(omega);
    }
  }

  // 3) FFT 分析 — 先去除 DC 分量
  const meanOmega = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
  const acSamples = speedSamples.map((v) => v - meanOmega);
  const { freq, mag } = computeSingleSidedSpectrum(acSamples, sampleRate);

  // 4) 在关注频段内找峰值
  let maxMag = 0;
  let peakFreq: number | null = null;

  const spectrum = freq.map((f, i) => ({ freq: f, mag: mag[i] })).filter((p) => p.freq >= freqMin && p.freq <= freqMax);

  for (const pt of spectrum) {
    if (pt.mag > maxMag) {
      maxMag = pt.mag;
      peakFreq = pt.freq;
    }
  }

  // 5) 交叉确认：如果扫频谱峰与机械模型谐振匹配（误差 < 20%），用模型值更可靠
  let finalResonanceHz = peakFreq;
  if (mechResonances.length > 0 && peakFreq !== null) {
    const closest = mechResonances.reduce((prev, curr) =>
      Math.abs(curr - peakFreq!) < Math.abs(prev - peakFreq!) ? curr : prev,
    );
    // 若差距 < 20%，取模型值（更精确）
    if (Math.abs(closest - peakFreq) / peakFreq < 0.2) {
      finalResonanceHz = closest;
    }
  } else if (mechResonances.length > 0 && peakFreq === null) {
    finalResonanceHz = mechResonances[0];
  }

  return {
    resonanceHz: finalResonanceHz,
    notchCenterHz: finalResonanceHz,
    peakMagnitude: maxMag,
    spectrum,
    mechanicalResonanceHz: mechResonances,
  };
}

/**
 * 根据自动搜索结果为指定采样率创建陷波滤波器。
 */
export function createAutoNotchFilter(
  resonanceHz: number,
  fs: number,
  Q = 5,
  detuneFrac = 0,
): BiquadFilter {
  const fc = resonanceHz * (1 + detuneFrac);
  return makeNotch(fc, fs, Q);
}

/**
 * 检测是否有多处谐振峰（多质量耦合系统可能有多阶谐振）。
 * 返回按幅值降序排列的显著谐振频率列表。
 */
export function findMultipleResonances(
  spectrum: Array<{ freq: number; mag: number }>,
  minPeakSeparationHz = 50,
  magThreshold = 0.05,
): Array<{ freq: number; mag: number }> {
  const peaks: Array<{ freq: number; mag: number }> = [];

  for (let i = 1; i < spectrum.length - 1; i++) {
    const prev = spectrum[i - 1];
    const curr = spectrum[i];
    const next = spectrum[i + 1];

    // 局部极大值 + 超过阈值
    if (curr.mag > prev.mag && curr.mag > next.mag && curr.mag > magThreshold) {
      // 确保与已有峰值间距足够
      const tooClose = peaks.some((p) => Math.abs(p.freq - curr.freq) < minPeakSeparationHz);
      if (!tooClose) {
        peaks.push({ freq: curr.freq, mag: curr.mag });
      }
    }
  }

  return peaks.sort((a, b) => b.mag - a.mag);
}