/**
 * PID 控制器频率分析工具
 * ========================
 * 计算连续时间 PID 传递函数 Gc(s) = Kp + Ki/s + Kd·s/(τ·s + 1)
 * 的频率响应（幅值 + 相位），用于 Bode 图绘制和 Z-N 临界增益估算。
 *
 * 离散化方法：Tustin（双线性变换）s = 2/Ts · (z-1)/(z+1)
 * 频率响应：用 s = jω 直接求复平面幅值和相角。
 */

export interface PIDGain {
  kp: number;
  ki: number;
  kd: number;
  /** 微分一阶 LPF 截止角频率（rad/s），默认 0 = 无滤波 */
  n?: number;
}

export interface BodePoint {
  freq: number;      // Hz
  magnitudeDb: number;
  phaseDeg: number;
}

/**
 * 连续域 PID 传递函数在 s = jω 处的频率响应
 *
 * Gc(jω) = Kp + Ki/(jω) + Kd·jω/(τ·jω + 1)
 *        = Kp - j·Ki/ω + j·Kd·ω / (1 + j·τ·ω)
 * 其中 τ = 1/N（N 为微分滤波器截止角频率）
 */
function evaluatePidContinuous(
  kp: number, ki: number, kd: number, tau: number, omega: number,
): { re: number; im: number; mag: number; phase: number } {
  // P 项：Kp
  const pRe = kp;
  const pIm = 0;

  // I 项：Ki/(jω) = -j·Ki/ω
  const iRe = 0;
  const iIm = omega > 1e-12 ? -ki / omega : -Infinity;

  // D 项：Kd·jω / (1 + j·τ·ω)
  let dRe = 0;
  let dIm = 0;
  if (tau > 1e-12) {
    const den = 1 + tau * tau * omega * omega;
    dRe = (kd * tau * omega * omega) / den;
    dIm = (kd * omega) / den;
  } else {
    dIm = kd * omega;
  }

  // 求和
  const re = pRe + iRe + dRe;
  const im = pIm + iIm + dIm;
  const mag = Math.hypot(re, im);
  const phase = Math.atan2(im, re);

  return { re, im, mag, phase };
}

/**
 * 计算 PID 的 Bode 图数据。
 *
 * @param gains   PID 增益
 * @param freqMin  最低频率（Hz），默认 0.1 Hz
 * @param freqMax  最高频率（Hz），默认 1000 Hz
 * @param points   对数均匀采样点数，默认 80
 */
export function computePidBode(
  gains: PIDGain,
  freqMin = 0.1,
  freqMax = 1000,
  points = 80,
): BodePoint[] {
  const tau = (gains.n ?? 0) > 1e-12 ? 1 / gains.n! : 0;
  const result: BodePoint[] = [];

  const logMin = Math.log10(freqMin);
  const logMax = Math.log10(freqMax);

  for (let i = 0; i < points; i++) {
    const freq = Math.pow(10, logMin + (i / (points - 1)) * (logMax - logMin));
    const omega = 2 * Math.PI * freq;
    const { mag, phase } = evaluatePidContinuous(gains.kp, gains.ki, gains.kd, tau, omega);
    result.push({
      freq,
      magnitudeDb: mag > 1e-15 ? 20 * Math.log10(mag) : -200,
      phaseDeg: (phase * 180) / Math.PI,
    });
  }

  return result;
}

/**
 * 根据 Bode 图数据搜索临界增益 Ku 和临界周期 Tu。
 *
 * 临界点定义为相角穿越 ±180° 附近的频率（ω180）和该点的幅值。
 * Ku = 1 / |G(j·ω180)|
 * Tu = 2π / ω180
 */
export function findUltimateGain(
  bodeData: BodePoint[],
): { Ku: number; Tu: number; fu: number } | null {
  // 找到相角穿越 -180° 的区间
  for (let i = 1; i < bodeData.length; i++) {
    const pPrev = bodeData[i - 1].phaseDeg;
    const pCurr = bodeData[i].phaseDeg;
    // 相角从 -180° 上方穿越到下方，或从下方穿越到上方
    if ((pPrev <= -180 && pCurr > -180) || (pPrev > -180 && pCurr <= -180)) {
      // 线性插值找到精确穿越频率
      const ratio = (-180 - pPrev) / (pCurr - pPrev);
      const magPrev = Math.pow(10, bodeData[i - 1].magnitudeDb / 20);
      const magCurr = Math.pow(10, bodeData[i].magnitudeDb / 20);
      const magAt180 = magPrev + ratio * (magCurr - magPrev);
      const freqAt180 = bodeData[i - 1].freq + ratio * (bodeData[i].freq - bodeData[i - 1].freq);

      if (magAt180 > 1e-15 && freqAt180 > 0) {
        return {
          Ku: 1 / magAt180,
          Tu: 1 / freqAt180,
          fu: freqAt180,
        };
      }
    }

    // 如果相角接近 -180°（误差 ±5°），也接受
    if (Math.abs(pCurr + 180) < 5) {
      const magCurr = Math.pow(10, bodeData[i].magnitudeDb / 20);
      if (magCurr > 1e-15) {
        return {
          Ku: 1 / magCurr,
          Tu: 1 / bodeData[i].freq,
          fu: bodeData[i].freq,
        };
      }
    }
  }

  return null; // 未穿越 -180°
}

/**
 * Ziegler-Nichols PID 整定表（频率响应法）。
 *
 * 基于振荡法（临界增益 Ku，临界周期 Tu）：
 *
 * | 类型   | Kp      | Ti        | Td         |
 * |--------|---------|-----------|------------|
 * | P      | 0.5·Ku  | —         | —          |
 * | PI     | 0.45·Ku | 0.83·Tu   | —          |
 * | PID    | 0.60·Ku | 0.50·Tu   | 0.125·Tu   |
 * | PID(no overshoot) | 0.20·Ku | 0.50·Tu | 0.33·Tu |
 */
export function znTuning(
  Ku: number,
  Tu: number,
  type: 'P' | 'PI' | 'PID' | 'PID-no-os' = 'PID',
): { kp: number; ki: number; kd: number } {
  switch (type) {
    case 'P':
      return { kp: 0.5 * Ku, ki: 0, kd: 0 };
    case 'PI':
      return { kp: 0.45 * Ku, ki: 0.45 * Ku / (0.83 * Tu), kd: 0 };
    case 'PID-no-os':
      return { kp: 0.20 * Ku, ki: 0.20 * Ku / (0.50 * Tu), kd: 0.20 * Ku * (0.33 * Tu) };
    case 'PID':
    default:
      return { kp: 0.60 * Ku, ki: 0.60 * Ku / (0.50 * Tu), kd: 0.60 * Ku * (0.125 * Tu) };
  }
}

/**
 * 开环对数幅频特性交叉频率和相位裕量计算。
 *
 * @param bodeData Bode 图数据点（已按频率排序）
 * @returns 增益穿越频率 f0dB（Hz）和相位裕量 PM（度）
 */
export function findGainCrossover(bodeData: BodePoint[]): { f0dB: number; pm: number } | null {
  for (let i = 1; i < bodeData.length; i++) {
    const mPrev = bodeData[i - 1].magnitudeDb;
    const mCurr = bodeData[i].magnitudeDb;
    if (mPrev >= 0 && mCurr < 0) {
      const ratio = -mPrev / (mCurr - mPrev);
      const freqAt0 = bodeData[i - 1].freq + ratio * (bodeData[i].freq - bodeData[i - 1].freq);
      const phaseAt0 = bodeData[i - 1].phaseDeg + ratio * (bodeData[i].phaseDeg - bodeData[i - 1].phaseDeg);
      return { f0dB: freqAt0, pm: 180 + phaseAt0 };
    }
  }
  return null;
}

// =============================================================================
// 被控对象频域建模
// =============================================================================

/**
 * 计算连续时间被控对象（有理传递函数）在 s = jω 处的频率响应。
 *
 * G(s) = b0·s^m + b1·s^(m-1) + ... + bm
 *        ────────────────────────────────
 *        a0·s^n + a1·s^(n-1) + ... + an
 *
 * @param bNum  分子系数（从最高次到常数，如 [5000] = 5000）
 * @param aDen  分母系数（从最高次到常数，如 [1, 100, 5000] = s²+100s+5000）
 * @param omega 角频率（rad/s）
 */
export function evaluatePlantContinuous(
  bNum: number[],
  aDen: number[],
  omega: number,
): { re: number; im: number; mag: number; phase: number } {
  const evalPoly = (coeffs: number[], s: { re: number; im: number }): { re: number; im: number } => {
    let re = 0;
    let im = 0;
    const n = coeffs.length - 1;
    // s = jω, use im for ω (just to suppress unused warning)
    void s;
    for (let i = 0; i <= n; i++) {
      // 项 coeffs[i] * s^(n-i)
      const exp = n - i;
      // s^k = (jω)^k = j^k * ω^k
      // k=0: 1, k=1: j, k=2: -1, k=3: -j, k=4: 1, ...
      const wPow = Math.pow(omega, exp);
      switch (exp % 4) {
        case 0: re += coeffs[i] * wPow; break;  // 1
        case 1: im += coeffs[i] * wPow; break;  // j
        case 2: re -= coeffs[i] * wPow; break;  // -1
        case 3: im -= coeffs[i] * wPow; break;  // -j
      }
    }
    return { re, im };
  };

  const s = { re: 0, im: omega };
  const num = evalPoly(bNum, s);
  const den = evalPoly(aDen, s);

  // 复数除法：num / den
  const denSq = den.re * den.re + den.im * den.im;
  if (denSq < 1e-30) return { re: 0, im: 0, mag: Infinity, phase: 0 };

  const re = (num.re * den.re + num.im * den.im) / denSq;
  const im = (num.im * den.re - num.re * den.im) / denSq;
  const mag = Math.hypot(re, im);
  const phase = Math.atan2(im, re);

  return { re, im, mag, phase };
}

/**
 * 计算被控对象的 Bode 图数据。
 *
 * @param bNum     分子系数
 * @param aDen     分母系数
 * @param freqMin  最低频率（Hz）
 * @param freqMax  最高频率（Hz）
 * @param points   对数均匀采样点数
 */
export function computePlantBode(
  bNum: number[],
  aDen: number[],
  freqMin = 0.1,
  freqMax = 1000,
  points = 80,
): BodePoint[] {
  const result: BodePoint[] = [];
  const logMin = Math.log10(freqMin);
  const logMax = Math.log10(freqMax);

  for (let i = 0; i < points; i++) {
    const freq = Math.pow(10, logMin + (i / (points - 1)) * (logMax - logMin));
    const omega = 2 * Math.PI * freq;
    const { mag, phase } = evaluatePlantContinuous(bNum, aDen, omega);
    result.push({
      freq,
      magnitudeDb: mag > 1e-15 ? 20 * Math.log10(mag) : -200,
      phaseDeg: (phase * 180) / Math.PI,
    });
  }

  return result;
}