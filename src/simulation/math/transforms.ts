import { wrapAngleRad } from '../../utils/clamp';

export interface ABC { ia: number; ib: number; ic: number; }
export interface AlphaBeta { alpha: number; beta: number; zero?: number; }
export interface DQ { d: number; q: number; }

/**
 * Clarke 变换：把三相静止坐标 abc 投影到二维静止坐标 alpha-beta。
 * 变量单位通常为 A（电流）或 V（电压）；平衡三相下 ia + ib + ic = 0，因此零序分量为 0。
 * 工程意义：把三相交流量压缩为两个正交分量，便于后续 Park 变换和矢量控制。
 */
export function clarkeTransform({ ia, ib, ic }: ABC): AlphaBeta {
  const alpha = ia;
  const beta = (ia + 2 * ib) / Math.sqrt(3);
  const zero = (ia + ib + ic) / 3;
  return { alpha, beta, zero };
}

/**
 * 反 Clarke 变换：把 alpha-beta 静止坐标恢复为三相量。
 * 在 SVPWM / SPWM 中常用于把电压矢量转回三相参考电压。
 */
export function inverseClarkeTransform({ alpha, beta }: AlphaBeta): ABC {
  return {
    ia: alpha,
    ib: -0.5 * alpha + (Math.sqrt(3) / 2) * beta,
    ic: -0.5 * alpha - (Math.sqrt(3) / 2) * beta,
  };
}

/**
 * Park 变换：将 alpha-beta 静止坐标旋转到随转子磁链同步旋转的 dq 坐标。
 * thetaElectrical 单位为 rad；d 轴对准转子磁链，q 轴与转矩方向正交。
 * 工程意义：在理想同步坐标中，正弦交流电流会变成近似直流 Id/Iq，PI 控制器才能稳定工作。
 */
export function parkTransform({ alpha, beta }: AlphaBeta, thetaElectrical: number): DQ {
  const theta = wrapAngleRad(thetaElectrical);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    d: alpha * c + beta * s,
    q: -alpha * s + beta * c,
  };
}

/**
 * 反 Park 变换：把控制器输出的 Vd/Vq 或 Id/Iq 参考量转回 alpha-beta。
 * SVPWM 接收的就是 alpha-beta 平面中的电压矢量。
 */
export function inverseParkTransform({ d, q }: DQ, thetaElectrical: number): AlphaBeta {
  const theta = wrapAngleRad(thetaElectrical);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    alpha: d * c - q * s,
    beta: d * s + q * c,
  };
}

export function electricalAngle(mechanicalAngle: number, polePairs: number): number {
  return wrapAngleRad(mechanicalAngle * polePairs);
}

export interface ThreePhaseOptions {
  amplitude: number;
  frequency: number;
  phaseDeg: number;
  time: number;
  balance: number;
  harmonic: number;
  noise: number;
}

/**
 * 生成三相正弦电流。balance 用于模拟三相不平衡；harmonic 表示 5 次谐波比例；noise 是确定性噪声幅度。
 */
export function generateThreePhaseCurrent(options: ThreePhaseOptions): ABC {
  const w = 2 * Math.PI * options.frequency;
  const phase = (options.phaseDeg * Math.PI) / 180;
  const base = w * options.time + phase;
  const harmonic = (angle: number) => options.harmonic * Math.sin(5 * angle);
  const pseudoNoise = (seed: number) => options.noise * Math.sin(173 * options.time + seed) * 0.45;
  const imbalance = options.balance;
  const ia = options.amplitude * (Math.sin(base) + harmonic(base)) + pseudoNoise(0.2);
  const ib = options.amplitude * (1 - imbalance) * (Math.sin(base - (2 * Math.PI) / 3) + harmonic(base - (2 * Math.PI) / 3)) + pseudoNoise(1.7);
  const ic = options.amplitude * (1 + imbalance) * (Math.sin(base + (2 * Math.PI) / 3) + harmonic(base + (2 * Math.PI) / 3)) + pseudoNoise(2.9);
  return { ia, ib, ic };
}

// ============================================================
// 对称分量法（Fortescue 变换）
// ============================================================

/**
 * 对称分量法结果：正序、负序、零序分量幅值和相位。
 */
export interface SymmetricalComponents {
  positive: { amplitude: number; phaseDeg: number };
  negative: { amplitude: number; phaseDeg: number };
  zero: { amplitude: number; phaseDeg: number };
  /** 三相不平衡度 = |负序| / |正序| × 100% */
  imbalancePct: number;
}

/**
 * 旋转算子 a = e^(j·120°) = -1/2 + j·√3/2
 */
const FORTESCUE_A_RE = Math.cos(2 * Math.PI / 3);
const FORTESCUE_A_IM = Math.sin(2 * Math.PI / 3);

/** a² = e^(j·240°) */
const FORTESCUE_A2_RE = Math.cos(4 * Math.PI / 3);
const FORTESCUE_A2_IM = Math.sin(4 * Math.PI / 3);

/**
 * Fortescue 变换：三相相量 → 正序/负序/零序。
 *
 * 输入为三相幅值及 A 相初相角（rad）。
 * 三相假设：频率相同，相位依次差 120°
 */
export function decomposeSymmetrical(
  iaAmp: number, ibAmp: number, icAmp: number,
  thetaA: number,
): SymmetricalComponents {
  // 构建三相相量
  const Va = { re: iaAmp * Math.cos(thetaA), im: iaAmp * Math.sin(thetaA) };
  const Vb = { re: ibAmp * Math.cos(thetaA - 2 * Math.PI / 3), im: ibAmp * Math.sin(thetaA - 2 * Math.PI / 3) };
  const Vc = { re: icAmp * Math.cos(thetaA + 2 * Math.PI / 3), im: icAmp * Math.sin(thetaA + 2 * Math.PI / 3) };

  const cmul = (x: { re: number; im: number }, y: { re: number; im: number }) => ({
    re: x.re * y.re - x.im * y.im,
    im: x.re * y.im + x.im * y.re,
  });

  // V⁺ = (Va + a·Vb + a²·Vc) / 3
  const aVb = cmul({ re: FORTESCUE_A_RE, im: FORTESCUE_A_IM }, Vb);
  const a2Vc = cmul({ re: FORTESCUE_A2_RE, im: FORTESCUE_A2_IM }, Vc);
  const posRe = (Va.re + aVb.re + a2Vc.re) / 3;
  const posIm = (Va.im + aVb.im + a2Vc.im) / 3;
  const posAmp = Math.hypot(posRe, posIm);

  // V⁻ = (Va + a²·Vb + a·Vc) / 3
  const a2Vb = cmul({ re: FORTESCUE_A2_RE, im: FORTESCUE_A2_IM }, Vb);
  const aVc = cmul({ re: FORTESCUE_A_RE, im: FORTESCUE_A_IM }, Vc);
  const negRe = (Va.re + a2Vb.re + aVc.re) / 3;
  const negIm = (Va.im + a2Vb.im + aVc.im) / 3;
  const negAmp = Math.hypot(negRe, negIm);

  // V⁰ = (Va + Vb + Vc) / 3
  const zeroRe = (Va.re + Vb.re + Vc.re) / 3;
  const zeroIm = (Va.im + Vb.im + Vc.im) / 3;
  const zeroAmp = Math.hypot(zeroRe, zeroIm);

  return {
    positive: { amplitude: posAmp, phaseDeg: Math.atan2(posIm, posRe) * 180 / Math.PI },
    negative: { amplitude: negAmp, phaseDeg: Math.atan2(negIm, negRe) * 180 / Math.PI },
    zero: { amplitude: zeroAmp, phaseDeg: Math.atan2(zeroIm, zeroRe) * 180 / Math.PI },
    imbalancePct: posAmp > 1e-12 ? (negAmp / posAmp) * 100 : 0,
  };
}
