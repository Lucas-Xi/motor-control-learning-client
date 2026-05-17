import { wrapAngleRad } from '../../utils/clamp';

export interface BemfObserverInput {
  vAlpha: number;
  vBeta: number;
  iAlpha: number;
  iBeta: number;
  prevIAlpha: number;
  prevIBeta: number;
  rs: number;
  ls: number;
  dt: number;
}

export interface BemfEstimate { eAlpha: number; eBeta: number; angle: number; speedElectrical: number; }

/**
 * 简化反电动势观测：e = v - R*i - L*di/dt。
 * 低速时反电动势幅值很小，噪声会淹没角度，这也是无感 FOC 启动困难的根源。
 *
 * 角度反推：PMSM 反电动势 e_α = -ψω·sinθ、e_β = +ψω·cosθ，
 * 所以 atan2(e_β, e_α) = atan2(ψω·cosθ, -ψω·sinθ) = θ + π/2，
 * 因此 θ = atan2(e_β, e_α) − π/2。
 * 历史上这里写成 `+π/2` 会把估算角偏 +π（即转子相位反向），导致 θ=0 实测得到 π。
 * 参考：Bose《Modern Power Electronics and AC Drives》第 8 章 PMSM Drive。
 */
export function estimateBackEmf(input: BemfObserverInput): BemfEstimate {
  const dt = Math.max(input.dt, 1e-6);
  const eAlpha = input.vAlpha - input.rs * input.iAlpha - input.ls * (input.iAlpha - input.prevIAlpha) / dt;
  const eBeta = input.vBeta - input.rs * input.iBeta - input.ls * (input.iBeta - input.prevIBeta) / dt;
  return { eAlpha, eBeta, angle: wrapAngleRad(Math.atan2(eBeta, eAlpha) - Math.PI / 2), speedElectrical: Math.hypot(eAlpha, eBeta) };
}

export interface PLLState { angle: number; omega: number; integral: number; }
export interface PLLGains { kp: number; ki: number; }

/**
 * 创建 PLL 初始状态。
 * angle 是当前估算角度，omega 是角速度估算，integral 负责消除稳态相位误差。
 */
export function createPllState(): PLLState {
  return { angle: 0, omega: 0, integral: 0 };
}

/**
 * PLL 角度跟踪：用相位误差推动角速度估计，工程上常用于 SMO/反电动势角度的平滑锁相。
 */
export function pllTrack(measuredAngle: number, state: PLLState, gains: PLLGains, dt: number): PLLState {
  const error = Math.atan2(Math.sin(measuredAngle - state.angle), Math.cos(measuredAngle - state.angle));
  const integral = state.integral + error * dt;
  const omega = gains.kp * error + gains.ki * integral;
  const angle = wrapAngleRad(state.angle + omega * dt);
  return { angle, omega, integral };
}
