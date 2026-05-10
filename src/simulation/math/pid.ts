import { clamp } from '../../utils/clamp';

export interface PIDGains { kp: number; ki: number; kd: number; }
export interface PIDLimits { min: number; max: number; }
export interface PIDState { integral: number; previousError: number; previousMeasurement: number; }
export interface PIDStepInput {
  setpoint: number;
  measurement: number;
  dt: number;
  gains: PIDGains;
  limits?: PIDLimits;
  antiWindup?: boolean;
  state: PIDState;
}
export interface PIDStepOutput { output: number; error: number; p: number; i: number; d: number; state: PIDState; saturated: boolean; }

/**
 * 创建 PID / PI 控制器的初始状态。
 * integral 用于积分记忆，previousMeasurement 用于离散微分项。
 */
export function createPIDState(): PIDState {
  return { integral: 0, previousError: 0, previousMeasurement: 0 };
}

/**
 * PID 控制器离散实现。
 * Kp 负责当前误差，Ki 负责长期误差积分，Kd 对测量值变化率做阻尼。
 * dt 单位 s；输出可以是电压、电流或转矩命令，limits 对应驱动器/母线/电流限幅。
 */
export function pidStep(input: PIDStepInput): PIDStepOutput {
  const dt = Math.max(input.dt, 1e-6);
  const error = input.setpoint - input.measurement;
  const p = input.gains.kp * error;
  const candidateIntegral = input.state.integral + error * dt;
  const derivativeOnMeasurement = -(input.measurement - input.state.previousMeasurement) / dt;
  const d = input.gains.kd * derivativeOnMeasurement;
  const unsaturated = p + input.gains.ki * candidateIntegral + d;
  const limited = input.limits ? clamp(unsaturated, input.limits.min, input.limits.max) : unsaturated;
  const saturated = Math.abs(limited - unsaturated) > 1e-9;

  let integral = candidateIntegral;
  if (input.antiWindup && saturated && input.gains.ki !== 0) {
    // 抗积分饱和：输出撞限时反推积分项，避免释放限幅后长时间超调。
    integral = (limited - p - d) / input.gains.ki;
  }

  return {
    output: limited,
    error,
    p,
    i: input.gains.ki * integral,
    d,
    state: { integral, previousError: error, previousMeasurement: input.measurement },
    saturated,
  };
}

/**
 * PI 控制器是电流环和速度环里最常见的形式。
 * 这里只是把 Kd 置零，复用统一的 PID 离散实现，避免重复代码。
 */
export function piStep(input: Omit<PIDStepInput, 'gains'> & { gains: Pick<PIDGains, 'kp' | 'ki'> }): PIDStepOutput {
  return pidStep({ ...input, gains: { ...input.gains, kd: 0 } });
}

export interface StepResponsePoint { t: number; target: number; value: number; error: number; output: number; }

export interface PIDSimulationOptions {
  limit?: number;
  antiWindup?: boolean;
  loadDisturbance?: number;
  plantGain?: number;
  damping?: number;
}

export interface StepResponseMetrics {
  overshootPercent: number;
  riseTime: number | null;
  steadyStateError: number;
  peakValue: number;
}

/**
 * 二阶被控对象的简化阶跃响应仿真，用于展示参数过小/过大时的慢响应和振荡。
 */
export function simulatePidStepResponse(
  gains: PIDGains,
  target: number,
  dt = 0.002,
  duration = 1.2,
  options: PIDSimulationOptions = {},
): StepResponsePoint[] {
  let state = createPIDState();
  let value = 0;
  let velocity = 0;
  const points: StepResponsePoint[] = [];
  const limit = options.limit ?? 24;
  const loadDisturbance = options.loadDisturbance ?? 0;
  for (let t = 0; t <= duration; t += dt) {
    const result = pidStep({
      setpoint: target,
      measurement: value,
      dt,
      gains,
      limits: { min: -Math.abs(limit), max: Math.abs(limit) },
      antiWindup: options.antiWindup ?? true,
      state,
    });
    state = result.state;
    const naturalFreq = 34;
    const damping = options.damping ?? 0.55;
    const plantGain = options.plantGain ?? 1;
    const acceleration = naturalFreq * plantGain * (result.output - loadDisturbance) - 2 * damping * naturalFreq * velocity - naturalFreq * naturalFreq * value * 0.06;
    velocity += acceleration * dt;
    value += velocity * dt;
    if (points.length % 3 === 0) {
      points.push({ t, target, value, error: result.error, output: result.output });
    }
  }
  return points;
}

/**
 * 从阶跃响应曲线中提取工程上常看的指标。
 * overshootPercent 反映超调，riseTime 反映上升速度，steadyStateError 反映稳态精度。
 */
export function calculateStepMetrics(points: StepResponsePoint[], target: number): StepResponseMetrics {
  if (points.length === 0) {
    return { overshootPercent: 0, riseTime: null, steadyStateError: Math.abs(target), peakValue: 0 };
  }
  const targetAbs = Math.max(Math.abs(target), 1e-6);
  const peakValue = points.reduce((peak, point) => Math.max(peak, point.value), -Infinity);
  const overshootPercent = Math.max(0, ((peakValue - target) / targetAbs) * 100);
  const risePoint = points.find((point) => Math.abs(point.value) >= targetAbs * 0.9);
  const finalValue = points[points.length - 1].value;
  return {
    overshootPercent,
    riseTime: risePoint ? risePoint.t : null,
    steadyStateError: target - finalValue,
    peakValue,
  };
}
