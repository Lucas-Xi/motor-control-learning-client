import { clamp } from '../../utils/clamp';
import { clampError } from './limits';

export interface PIDGains { kp: number; ki: number; kd: number; }
export interface PIDLimits { min: number; max: number; }
export interface PIDState {
  integral: number;
  previousError: number;
  previousMeasurement: number;
  /** 微分项低通滤波状态（一阶 LPF） */
  dFiltered: number;
}
export interface PIDStepInput {
  setpoint: number;
  measurement: number;
  dt: number;
  gains: PIDGains;
  limits?: PIDLimits;
  antiWindup?: boolean;
  /** 微分 LPF 截止角频率，rad/s，默认 0 = 无滤波。推荐 N = 20..200 */
  derivativeFilterN?: number;
  /** 反计算抗饱和系数 Kb。典型值 0.5~2.0；越大积分复位越快。默认 1.0 */
  backCalculationKb?: number;
  state: PIDState;
}
export interface PIDStepOutput {
  output: number;
  error: number;
  p: number;
  i: number;
  d: number;
  state: PIDState;
  saturated: boolean;
}

export function createPIDState(): PIDState {
  return { integral: 0, previousError: 0, previousMeasurement: 0, dFiltered: 0 };
}

export function pidStep(input: PIDStepInput): PIDStepOutput {
  const dt = clampError(input.dt, 1e-6, 1);  // 0 -> 1e-6
  const setpoint = clampError(input.setpoint, -1e12, 1e12);
  const measurement = clampError(input.measurement, -1e12, 1e12);
  const { state, gains } = input;
  const limits = input.limits;
  const antiWindup = input.antiWindup ?? false;
  const Kb = input.backCalculationKb ?? 1.0;
  const N = input.derivativeFilterN ?? 0;

  const error = setpoint - measurement;
  const clampedError = Number.isFinite(error) ? error : 0;

  // P term
  const p = gains.kp * clampedError;

  // I term — freeze if error is NaN
  let integral = state.integral;
  if (Number.isFinite(clampedError)) {
    integral += gains.ki * clampedError * dt;
  }

  // D term — derivative on measurement with optional LPF
  const dMeasurement = measurement - state.previousMeasurement;
  let dRaw = 0;
  if (Number.isFinite(dMeasurement) && dt > 1e-12) {
    dRaw = -(gains.kd * dMeasurement) / dt;
  }

  let dFiltered: number;
  if (N > 0 && dt > 1e-12) {
    // 一阶 LPF for derivative: y += (u - y) * (N * dt) / (1 + N * dt)
    const alpha = (N * dt) / (1 + N * dt);
    dFiltered = state.dFiltered + alpha * (dRaw - state.dFiltered);
  } else {
    dFiltered = dRaw;
  }

  // Sum
  let unsaturated = p + integral + dFiltered;

  let saturated = false;
  if (limits) {
    const lo = clampError(limits.min, -1e12, 1e12);
    const hi = clampError(limits.max, -1e12, 1e12);
    const clamped = clamp(unsaturated, lo, hi);
    saturated = Math.abs(clamped - unsaturated) > 1e-12;
    unsaturated = clamped;

    // Anti-windup: back-calculate integral from saturated output
    if (saturated && antiWindup && Math.abs(gains.ki) > 1e-15) {
      integral = unsaturated - p - dFiltered;                  // 完全复位（Kb=1）
      // 按 Kb 衰减积分：integral *= 1 - Kb，等效于积分向无饱和值缓慢逼近
      // 但上述 integral = unsaturated - p - dFiltered 是完整复位，
      // 下面用 Kb 做加权：从当前积分到"理想积分"的插值
      const idealIntegral = unsaturated - p - dFiltered;
      integral = state.integral + Kb * (idealIntegral - state.integral);
    }
  }

  return {
    output: unsaturated,
    error: clampedError,
    p,
    i: integral,
    d: dFiltered,
    state: { ...state, integral, previousError: clampedError, previousMeasurement: measurement, dFiltered },
    saturated,
  };
}

export function piStep(
  input: Omit<PIDStepInput, 'gains'> & { gains: Pick<PIDGains, 'kp' | 'ki'> },
): PIDStepOutput {
  return pidStep({ ...input, gains: { ...input.gains, kd: 0, derivativeFilterN: 0 } } as PIDStepInput);
}

export interface StepResponsePoint { t: number; target: number; value: number; error: number; output: number; }
export interface PIDSimulationOptions {
  gains: PIDGains;
  target: number;
  samplePeriod: number;
  duration: number;
  disturbance?: number;
  disturbanceTime?: number;
  limits?: PIDLimits;
  antiWindup?: boolean;
  derivativeFilterN?: number;
  loadKp?: number;
  loadDisturbance?: number;
}
export interface StepResponseMetrics {
  riseTime: number | null;
  peakTime: number | null;
  peakValue: number;
  overshootPercent: number;
  settlingTime: number | null;
  steadyStateError: number;
}

export function simulatePidStepResponse(
  gains: PIDGains,
  target: number,
  samplePeriod: number,
  duration: number,
): StepResponsePoint[] {
  const dt = Math.max(samplePeriod, 1e-6);
  const steps = Math.floor(duration / dt);
  const points: StepResponsePoint[] = [];
  const state = createPIDState();
  let measurement = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const result = pidStep({
      setpoint: target, measurement, dt, gains, state,
    });
    Object.assign(state, result.state);
    points.push({ t, target, value: measurement, error: result.error, output: result.output });
    // Plant: 简单的二阶响应 G(s) = 5000 / (s² + 100s + 5000)
    const accel = 5000 * (result.output - measurement) - 100 * ((measurement - (points.length > 1 ? points[points.length - 2].value : 0)) / dt);
    measurement += accel * dt * dt;
  }
  return points;
}

export function calculateStepMetrics(points: StepResponsePoint[], target: number): StepResponseMetrics {
  if (points.length === 0) {
    return { riseTime: null, peakTime: null, peakValue: 0, overshootPercent: 0, settlingTime: null, steadyStateError: target };
  }
  const finalPoints = points.slice(-Math.min(50, Math.floor(points.length / 4) + 1));
  const steadyStateError = Math.abs(target - finalPoints.reduce((s, p) => s + p.value, 0) / finalPoints.length);
  const peak = points.reduce((m, p) => (Math.abs(p.value - target) > Math.abs(m.value - target) ? p : m), points[0]);
  const peakValue = peak.value;
  const overshootPercent = Math.sign(target) !== 0 ? Math.max(0, ((peakValue - target) / target) * 100) : 0;
  // Rise time: first time crossing 10% → 90%
  const p10 = target * 0.1 + (points[0]?.value ?? 0) * 0.9;
  const p90 = target * 0.9 + (points[0]?.value ?? 0) * 0.1;
  let t10 = -1, t90 = -1;
  for (const p of points) {
    if (t10 < 0 && p.value >= p10) t10 = p.t;
    if (t90 < 0 && p.value >= p90) t90 = p.t;
  }
  const riseTime = t10 >= 0 && t90 >= 0 ? t90 - t10 : null;
  const peakTime = points.find(p => Math.abs(p.value) === Math.abs(peakValue))?.t ?? null;
  // Settling time: within 2% band
  const band = Math.abs(target) * 0.02;
  let settlingTime: number | null = null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (Math.abs(points[i].value - target) > band) { settlingTime = points[i].t; break; }
  }
  if (settlingTime === null && points.length > 0) settlingTime = 0;
  return { riseTime, peakTime, peakValue, overshootPercent, settlingTime, steadyStateError };
}
