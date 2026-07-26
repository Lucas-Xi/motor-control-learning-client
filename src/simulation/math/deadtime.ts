/**
 * 死区时间补偿前馈计算。
 *
 * 原理：
 *   死区时间内上下管同时关断，电流通过续流二极管续流，导致输出电压与指令值之间产生误差。
 *   误差方向取决于电流极性：iₓ > 0 时电压损失 ≈ Vdc · Tdead/Tsw；
 *                           iₓ < 0 时电压增加 ≈ Vdc · Tdead/Tsw。
 *   补偿方法：在指令电压上叠加一个与电流极性同向的补偿量 Δv。
 */

export interface DeadTimeInput {
  ia: number;
  ib: number;
  ic: number;
  t_dead_us: number;
  t_sw_us: number;
  Vdc: number;
  i_hys: number;
  prevSign: { a: number; b: number; c: number };
}

export interface DeadTimeResult {
  signA: number;
  signB: number;
  signC: number;
  vErrorA: number;
  vErrorB: number;
  vErrorC: number;
  /** 占空比损失 = Tdead/Tsw */
  ddA: number;
  ddB: number;
  ddC: number;
  /** 电压损失 = dd * Vdc */
  dvA: number;
  dvB: number;
  dvC: number;
}

/**
 * 带滞环的三相死区补偿计算（匹配 DeadTimeCompensationCard 输入接口）。
 *
 * @returns {signA, signB, signC, vErrorA, vErrorB, vErrorC}
 *   sign = ±1 表示电压误差方向，vError 是死区造成的平均电压误差值（Vdc × Tdead/Tsw）。
 *   补偿时应在指令电压上叠加 sign · vError · gain。
 */
export function compensateDeadTime(input: DeadTimeInput): DeadTimeResult {
  const { ia, ib, ic, t_dead_us, t_sw_us, Vdc, i_hys, prevSign } = input;

  const dtRatio = t_dead_us / Math.max(t_sw_us, 1);
  const vError = Vdc * dtRatio;

  // 滞环比较：在过零点附近保持上一拍符号，避免过零抖动
  const hysteresisSign = (current: number, prev: number, hys: number): number => {
    // hys=0 时无滞环，直接用 sign（但零电流时保持 prev）
    if (hys === 0) return current > 1e-12 ? 1 : current < -1e-12 ? -1 : prev;
    // 有滞环：只有当 |current| >= hys 时才切换
    if (current >= hys) return 1;
    if (current <= -hys) return -1;
    return prev;
  };

  const signA = hysteresisSign(ia, prevSign.a, i_hys);
  const signB = hysteresisSign(ib, prevSign.b, i_hys);
  const signC = hysteresisSign(ic, prevSign.c, i_hys);

  return {
    signA, signB, signC,
    vErrorA: signA * vError,
    vErrorB: signB * vError,
    vErrorC: signC * vError,
    ddA: -signA * dtRatio, ddB: -signB * dtRatio, ddC: -signC * dtRatio,
    dvA: signA * vError, dvB: signB * vError, dvC: signC * vError,
  };
}

/**
 * 对单相进行死区补偿：在指令电压上叠加补偿量。
 *
 * @param vRef          指令电压（V）
 * @param iPhase        相电流（A）
 * @param vDc           母线电压（V）
 * @param deadTimeUs    死区时间（μs）
 * @param switchingPeriodUs PWM 周期（μs）
 * @param compensationGain  补偿增益（0-1），默认 1.0
 * @returns 补偿后的电压指令（V）
 */
export function deadtimeCompensation(
  vRef: number,
  iPhase: number,
  vDc: number,
  deadTimeUs: number,
  switchingPeriodUs: number,
  compensationGain = 1.0,
): number {
  if (deadTimeUs <= 0 || switchingPeriodUs <= 0 || vDc <= 0) return vRef;

  const dtRatio = deadTimeUs / switchingPeriodUs;
  const vError = vDc * dtRatio;
  const sign = Math.tanh(iPhase * 10);
  const delta = sign * vError * compensationGain;

  return vRef + delta;
}

/**
 * 三相死区补偿（对每相独立计算）。
 */
export function deadtimeCompensation3Phase(
  vA: number, vB: number, vC: number,
  iA: number, iB: number, iC: number,
  vDc: number,
  deadTimeUs: number,
  switchingPeriodUs: number,
  compensationGain = 1.0,
): { va: number; vb: number; vc: number } {
  return {
    va: deadtimeCompensation(vA, iA, vDc, deadTimeUs, switchingPeriodUs, compensationGain),
    vb: deadtimeCompensation(vB, iB, vDc, deadTimeUs, switchingPeriodUs, compensationGain),
    vc: deadtimeCompensation(vC, iC, vDc, deadTimeUs, switchingPeriodUs, compensationGain),
  };
}