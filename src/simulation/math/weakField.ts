import { clampError, applyLimits, type LimitInput } from './limits';

export interface VoltageLimitInput {
  vd: number;
  vq: number;
  uDc: number;
  margin?: number;
}

export interface VoltageLimitResult {
  magnitude: number;
  limit: number;
  saturated: boolean;
  reserve: number;
}

/**
 * SVPWM 线性区最大电压近似为 Udc / sqrt(3)。当 Vdq 幅值超过该限制时，电流环会失去调节余量。
 */
export function checkVoltageLimit(input: VoltageLimitInput): VoltageLimitResult {
  const limit = (input.uDc / Math.sqrt(3)) * (input.margin ?? 0.96);
  const magnitude = Math.hypot(clampError(input.vd, -1e6, 1e6), clampError(input.vq, -1e6, 1e6));
  return { magnitude, limit, saturated: magnitude > limit, reserve: limit - magnitude };
}

export interface WeakFieldPointInput {
  id: number;
  iq: number;
  ld: number;
  lq: number;
  flux: number;
  polePairs: number;
}

/**
 * 根据 dq 电流与电机参数估算电磁转矩。
 */
export function estimateTorque(input: WeakFieldPointInput): number {
  const id = clampError(input.id, -1e6, 1e6);
  const iq = clampError(input.iq, -1e6, 1e6);
  return 1.5 * input.polePairs * (input.flux * iq + (input.ld - input.lq) * id * iq);
}

/**
 * 当电压裕量不足时，给出一个保守的负 Id 建议值。
 */
export function suggestWeakeningId(voltageReserve: number, currentLimit: number): number {
  const reserve = clampError(voltageReserve, -1e6, 1e6);
  const limit = Math.max(clampError(currentLimit, 0, 1e6), 0.01);
  if (reserve >= 0) return 0;
  return -Math.min(limit * 0.75, Math.abs(reserve) * 0.08);
}

export interface MTPVInput {
  speedRpm: number;
  polePairs: number;
  udc: number;
  ldMh: number;
  lqMh: number;
  fluxWb: number;
  rs: number;
  iMax: number;
}

export interface MTPVResult {
  idRef: number;
  iqRef: number;
  /** 是否触发了 MTPV（电压椭圆限制） */
  onMtpv: boolean;
  /** 是否触发了电流极限 */
  onCurrentLimit: boolean;
  torqueNm: number;
}

/**
 * MTPV（Maximum Torque Per Voltage）轨迹搜索。
 *
 * 当速度升高到电压椭圆完全包含在电流圆内时，MTPA 解不再可行，
 * 工作点沿电压椭圆切向滑动以维持最大转矩。
 *
 * 算法：
 *   1. 先用 MTPA 试探解 (id, iq) → 如果同时满足电压和电流极限 → 返回
 *   2. 如果只破电压椭圆 → 用 applyLimits 投影到椭圆上 → 沿椭圆搜索最大转矩
 *   3. 如果破电流圆 → 先投影到圆上 → 再检查电压 → 迭代至收敛
 */
export function calculateMTPV(input: MTPVInput): MTPVResult {
  const {
    speedRpm, polePairs, udc,
    ldMh, lqMh, fluxWb, rs, iMax,
  } = input;

  // NaN/Inf 防护
  const rpm = clampError(speedRpm, 0, 100000);
  const pp = clampError(polePairs, 1, 16);
  const vdc = clampError(udc, 10, 1000);
  const ld = clampError(ldMh, 0.01, 100) / 1000;
  const lq = clampError(lqMh, 0.01, 100) / 1000;
  const psi = clampError(fluxWb, 0.001, 1);
  const r = clampError(rs, 0, 10);
  const imax = clampError(iMax, 0.1, 200);

  const omegaE = rpm * Math.PI / 30 * pp;
  const Vlim = (vdc / Math.sqrt(3)) * 0.96;

  if (omegaE < 0.01) {
    // 零速：无 MTPV 问题，返回原点
    return { idRef: 0, iqRef: 0, onMtpv: false, onCurrentLimit: false, torqueNm: 0 };
  }

  // 试探 MTPA 解 (id=0, iq=Ilim 起点)
  let id = 0;
  let iq = imax * 0.5;

  for (let iter = 0; iter < 10; iter++) {
    // 检查电压极限
    const limitInput: LimitInput = { id, iq, Ilim: imax, Vlim, omega_e: omegaE, Ld: ld, Lq: lq, psi_f: psi, Rs: r };
    const projection = applyLimits(limitInput);

    if (projection.feasible) {
      // MTPA 可行——如果仍在电压椭圆内但接近边界，强制上界
      return {
        idRef: projection.projectedId,
        iqRef: projection.projectedIq,
        onMtpv: false,
        onCurrentLimit: projection.activeConstraint === 'current' || projection.activeConstraint === 'both',
        torqueNm: estimateTorque({ id: projection.projectedId, iq: projection.projectedIq, ld, lq, flux: psi, polePairs: pp }),
      };
    }

    // 投影到可行域
    id = projection.projectedId;
    iq = projection.projectedIq;

    // 如果是电压限制，沿椭圆搜索 MTPV（减小 id 负向，调 iq 最大化转矩）
    if (projection.activeConstraint === 'voltage') {
      // 在当前椭圆投影点上，向更负的 id 方向步进，搜索更高转矩
      let bestId = id;
      let bestIq = iq;
      let bestTe = Math.abs(estimateTorque({ id, iq, ld, lq, flux: psi, polePairs: pp }));
      const step = -0.1 * imax;
      for (let s = 0; s < 20; s++) {
        const tid = id + step * s;
        const tLimit: LimitInput = { id: tid, iq, Ilim: imax, Vlim, omega_e: omegaE, Ld: ld, Lq: lq, psi_f: psi, Rs: r };
        const tProj = applyLimits(tLimit);
        if (!tProj.feasible) continue;
        const te = Math.abs(estimateTorque({ id: tProj.projectedId, iq: tProj.projectedIq, ld, lq, flux: psi, polePairs: pp }));
        if (te > bestTe) {
          bestId = tProj.projectedId;
          bestIq = tProj.projectedIq;
          bestTe = te;
        }
      }
      return {
        idRef: bestId,
        iqRef: bestIq,
        onMtpv: true,
        onCurrentLimit: false,
        torqueNm: bestTe,
      };
    }

    // 电流圆限制：缩回圆上就 OK
    id = projection.projectedId;
    iq = projection.projectedIq;
  }

  return { idRef: id, iqRef: iq, onMtpv: true, onCurrentLimit: true, torqueNm: 0 };
}