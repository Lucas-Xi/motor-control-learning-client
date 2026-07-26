import { clamp, wrapAngleRad } from '../../utils/clamp';
import { clampError } from './limits';

export interface SVPWMInput {
  uAlpha: number;
  uBeta: number;
  uDc: number;
  carrierPeriod?: number;
}

export type OvermodulationStrategy = 'linear' | 'overmodulation-i' | 'overmodulation-ii' | 'six-step';

export interface SVPWMResult {
  sector: number;
  angle: number;
  vectorMagnitude: number;
  modulationIndex: number;
  modulationIndexRaw: number;
  t1: number;
  t2: number;
  t0: number;
  dutyA: number;
  dutyB: number;
  dutyC: number;
  saturated: boolean;
  /** 过调制策略（linear = 线性区，overmodulation-i = 进入过调制 I 区，overmodulation-ii = II 区，six-step = 六阶梯波） */
  strategy: OvermodulationStrategy;
  busUtilization: number;
}

/**
 * 根据空间电压矢量的极角判断当前所在扇区。
 */
export function determineSvpwmSector(uAlpha: number, uBeta: number): number {
  const angle = wrapAngleRad(Math.atan2(uBeta, uAlpha));
  return Math.floor(angle / (Math.PI / 3)) + 1;
}

/**
 * 标准 T1/T2 计算（线性区，m ≤ 1）。
 */
function calcLinearTimes(ts: number, m: number, angleInSector: number): { t1: number; t2: number } {
  return {
    t1: ts * m * Math.sin(Math.PI / 3 - angleInSector),
    t2: ts * m * Math.sin(angleInSector),
  };
}

/**
 * SVPWM 时间计算，过调制策略选择。
 *
 * ===== 过调制策略 =====
 *
 * 线性区（m ≤ 1）：标准 SVPWM，T1+T2 ≤ Ts。
 *
 * 过调制 I 区（1 < m ≤ 1.083）：
 *   仍然使用标准 T1/T2 计算，T1+T2 > Ts，截断 t0 = 0。
 *   在六边形边界保持电压幅值相位不变（并非纯幅值保持）。
 *
 * 过调制 II 区（1.083 < m < 1.155）：
 *   保持电压矢量方向修正幅值。在扇区边界处矢量与六边形相交，
 *   在扇区中间沿六边形边走。
 */
export function calculateSvpwm(input: SVPWMInput): SVPWMResult {
  const ts = clampError(input.carrierPeriod ?? 1 / 16000, 1e-9, 1);
  const uDc = Math.max(clampError(input.uDc, 1, 10000), 1e-6);
  const angle = wrapAngleRad(Math.atan2(input.uBeta, input.uAlpha));
  const sector = determineSvpwmSector(input.uAlpha, input.uBeta);
  const vectorMagnitude = Math.hypot(clampError(input.uAlpha, -1e6, 1e6), clampError(input.uBeta, -1e6, 1e6));
  const modulationIndexRaw = (Math.sqrt(3) * vectorMagnitude) / uDc;
  const angleInSector = angle - (sector - 1) * (Math.PI / 3);

  // 选择过调制策略
  let strategy: OvermodulationStrategy;
  let modulationIndex: number;
  let t1: number;
  let t2: number;

  if (modulationIndexRaw <= 1) {
    // 线性区
    strategy = 'linear';
    modulationIndex = Math.max(0, modulationIndexRaw);
    const times = calcLinearTimes(ts, modulationIndex, angleInSector);
    t1 = times.t1;
    t2 = times.t2;
  } else if (modulationIndexRaw <= 1.083) {
    // 过调制 I 区：标准时间计算，允许 T1+T2 > Ts
    strategy = 'overmodulation-i';
    modulationIndex = 1;  // 以线性区上限计算
    const times = calcLinearTimes(ts, modulationIndex, angleInSector);
    t1 = times.t1;
    t2 = times.t2;
    // 保持矢量方向，超出的部分被 t0=0 自动截断
  } else if (modulationIndexRaw < 1.155) {
    // 过调制 II 区：沿六边形保持幅值，修正 T1/T2
    strategy = 'overmodulation-ii';
    modulationIndex = 1;
    const times = calcLinearTimes(ts, modulationIndex, angleInSector);
    t1 = times.t1;
    t2 = times.t2;
    // 幅值从六边形边界持续升至六阶梯波的基波幅值
    const alpha = (modulationIndexRaw - 1.083) / (1.155 - 1.083);
    const satScale = 1 + alpha * 0.07;  // 经验扩展
    t1 = Math.min(t1 * satScale, ts);
    t2 = Math.min(t2 * satScale, ts);
  } else {
    // 六阶梯波
    strategy = 'six-step';
    modulationIndex = 1.155;
    t1 = 0;
    t2 = 0;
  }

  const t0 = Math.max(0, ts - t1 - t2);
  const halfZero = t0 / 2;

  let ta = halfZero;
  let tb = halfZero;
  let tc = halfZero;
  switch (sector) {
    case 1: ta = t1 + t2 + halfZero; tb = t2 + halfZero; tc = halfZero; break;
    case 2: ta = t1 + halfZero; tb = t1 + t2 + halfZero; tc = halfZero; break;
    case 3: ta = halfZero; tb = t1 + t2 + halfZero; tc = t2 + halfZero; break;
    case 4: ta = halfZero; tb = t1 + halfZero; tc = t1 + t2 + halfZero; break;
    case 5: ta = t2 + halfZero; tb = halfZero; tc = t1 + t2 + halfZero; break;
    default: ta = t1 + t2 + halfZero; tb = halfZero; tc = t1 + halfZero; break;
  }

  return {
    sector,
    angle,
    vectorMagnitude,
    modulationIndex: strategy === 'six-step' ? 1.155 : Math.max(0, modulationIndexRaw),
    modulationIndexRaw,
    t1: Math.max(0, t1),
    t2: Math.max(0, t2),
    t0,
    dutyA: clamp(ta / ts, 0, 1),
    dutyB: clamp(tb / ts, 0, 1),
    dutyC: clamp(tc / ts, 0, 1),
    saturated: modulationIndexRaw > 1,
    strategy,
    busUtilization: clamp(vectorMagnitude / (uDc / Math.sqrt(3)), 0, 1.4),
  };
}

export function compareSpwmUtilization(vectorMagnitude: number, uDc: number): { spwm: number; svpwm: number } {
  return {
    spwm: clamp(vectorMagnitude / (uDc / 2), 0, 1.4),
    svpwm: clamp(vectorMagnitude / (uDc / Math.sqrt(3)), 0, 1.4),
  };
}

/**
 * 六阶梯波电压频谱分析。
 *
 * 理想六阶梯波（120°导通）的相电压含基波 + 5/7/11/13 次谐波：
 *   V_n / V_1 = 1/n  （n = 6k±1, k=1,2,...）
 * 即 5 次 = -20%, 7 次 = +14.3%, 11 次 = -9.1%, 13 次 = +7.7%
 *
 * @param fundFreq 基波频率（Hz）
 * @param vPeak    相电压峰值（V）
 * @param nHarm    最大谐波次数，默认 19
 */
export function computeSixStepSpectrum(fundFreq: number, vPeak: number, nHarm = 19): Array<{ order: number; freq: number; mag: number; magPct: number }> {
  const result: Array<{ order: number; freq: number; mag: number; magPct: number }> = [];
  for (let n = 1; n <= nHarm; n += 2) {
    // 六阶梯波只有奇次谐波
    const magN = n === 1 ? vPeak : vPeak / n;
    result.push({
      order: n,
      freq: n * fundFreq,
      mag: Math.abs(magN),
      magPct: n === 1 ? 100 : (Math.abs(magN) / vPeak) * 100,
    });
  }
  return result;
}