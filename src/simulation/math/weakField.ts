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
  const magnitude = Math.hypot(input.vd, input.vq);
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
 * 这是弱磁和 MTPA 讲解里最常用的近似公式之一。
 */
export function estimateTorque(input: WeakFieldPointInput): number {
  return 1.5 * input.polePairs * (input.flux * input.iq + (input.ld - input.lq) * input.id * input.iq);
}

/**
 * 当电压裕量不足时，给出一个保守的负 Id 建议值。
 * 该函数更适合教学演示，不直接替代真实的弱磁调度器。
 */
export function suggestWeakeningId(voltageReserve: number, currentLimit: number): number {
  if (voltageReserve >= 0) return 0;
  return -Math.min(currentLimit * 0.75, Math.abs(voltageReserve) * 0.08);
}
