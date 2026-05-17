import { clamp, wrapAngleRad } from '../../utils/clamp';

export interface SVPWMInput {
  uAlpha: number;
  uBeta: number;
  uDc: number;
  carrierPeriod?: number;
}

export interface SVPWMResult {
  sector: number;
  angle: number;
  vectorMagnitude: number;
  modulationIndex: number;
  t1: number;
  t2: number;
  t0: number;
  dutyA: number;
  dutyB: number;
  dutyC: number;
  saturated: boolean;
  busUtilization: number;
}

/**
 * 根据空间电压矢量的极角判断当前所在扇区。
 * 扇区编号 1~6 对应六个 60° 区间，是后续 T1/T2/T0 排列的前提。
 */
export function determineSvpwmSector(uAlpha: number, uBeta: number): number {
  const angle = wrapAngleRad(Math.atan2(uBeta, uAlpha));
  return Math.floor(angle / (Math.PI / 3)) + 1;
}

/**
 * SVPWM 时间计算。
 * Ualpha/Ubeta 单位 V，Udc 为直流母线电压 V，carrierPeriod 单位 s。
 * modulationIndex 近似为 sqrt(3) * |Uref| / Udc；大于 1 表示进入过调制/电压饱和。
 */
export function calculateSvpwm(input: SVPWMInput): SVPWMResult {
  const ts = input.carrierPeriod ?? 1 / 16000;
  const uDc = Math.max(input.uDc, 1e-6);
  const angle = wrapAngleRad(Math.atan2(input.uBeta, input.uAlpha));
  const sector = determineSvpwmSector(input.uAlpha, input.uBeta);
  const vectorMagnitude = Math.hypot(input.uAlpha, input.uBeta);
  const modulationIndexRaw = (Math.sqrt(3) * vectorMagnitude) / uDc;
  const modulationIndex = clamp(modulationIndexRaw, 0, 0.999);
  const angleInSector = angle - (sector - 1) * (Math.PI / 3);
  // 用 m = √3·|U|/Udc（亦即 |U|/(Udc/√3)）作归一时，标准 SVPWM 时间公式：
  //   T1 = ts·m·sin(π/3 − θs)
  //   T2 = ts·m·sin(θs)
  // 不需要再除 sin(π/3) ——否则 m=1、θs=π/6 处会得到 T1+T2 = 1.155·ts，
  // 违反线性区上限 T1+T2 ≤ ts 的基本不变量。
  // 参考：Holmes & Lipo《Pulse Width Modulation for Power Converters》§6.4。
  const t1 = ts * modulationIndex * Math.sin(Math.PI / 3 - angleInSector);
  const t2 = ts * modulationIndex * Math.sin(angleInSector);
  const t0 = Math.max(0, ts - t1 - t2);
  const halfZero = t0 / 2;

  let ta = halfZero;
  let tb = halfZero;
  let tc = halfZero;
  switch (sector) {
    case 1:
      ta = t1 + t2 + halfZero; tb = t2 + halfZero; tc = halfZero; break;
    case 2:
      ta = t1 + halfZero; tb = t1 + t2 + halfZero; tc = halfZero; break;
    case 3:
      ta = halfZero; tb = t1 + t2 + halfZero; tc = t2 + halfZero; break;
    case 4:
      ta = halfZero; tb = t1 + halfZero; tc = t1 + t2 + halfZero; break;
    case 5:
      ta = t2 + halfZero; tb = halfZero; tc = t1 + t2 + halfZero; break;
    default:
      ta = t1 + t2 + halfZero; tb = halfZero; tc = t1 + halfZero; break;
  }

  return {
    sector,
    angle,
    vectorMagnitude,
    modulationIndex,
    t1,
    t2,
    t0,
    dutyA: clamp(ta / ts, 0, 1),
    dutyB: clamp(tb / ts, 0, 1),
    dutyC: clamp(tc / ts, 0, 1),
    saturated: modulationIndexRaw >= 1,
    busUtilization: clamp(vectorMagnitude / (uDc / Math.sqrt(3)), 0, 1.4),
  };
}

/**
 * 对比同一电压矢量下 SPWM 与 SVPWM 的母线利用率。
 * 教学上用于解释为什么 SVPWM 的线性区更“省母线”。
 */
export function compareSpwmUtilization(vectorMagnitude: number, uDc: number): { spwm: number; svpwm: number } {
  return {
    spwm: clamp(vectorMagnitude / (uDc / 2), 0, 1.4),
    svpwm: clamp(vectorMagnitude / (uDc / Math.sqrt(3)), 0, 1.4),
  };
}
