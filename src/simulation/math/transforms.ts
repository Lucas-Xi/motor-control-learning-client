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
