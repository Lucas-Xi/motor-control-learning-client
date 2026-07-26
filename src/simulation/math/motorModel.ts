import { createPIDState, piStep, type PIDGains, type PIDState } from './pid';

/**
 * 根据退磁比例计算有效磁链（额定的 (1 - ratio) 倍）。
 * 退磁 10% → flux 下降到 90%，转矩能力同比例下降。
 */
export function effectiveFlux(nominalFlux: number, demagnetizationRatio: number): number {
  return nominalFlux * Math.max(0, 1 - Math.min(1, demagnetizationRatio));
}

export interface PMSMParameters {
  rs: number;
  ld: number;
  lq: number;
  flux: number;
  polePairs: number;
  inertia: number;
  damping: number;
}

export interface PMSMState {
  id: number;
  iq: number;
  omegaMechanical: number;
  thetaMechanical: number;
  torque: number;
}

export interface PMSMStepInput {
  vd: number;
  vq: number;
  loadTorque: number;
  dt: number;
  params: PMSMParameters;
  state: PMSMState;
}

export const defaultPmsmParameters: PMSMParameters = {
  rs: 0.55,
  ld: 0.0012,
  lq: 0.0015,
  flux: 0.045,
  polePairs: 4,
  inertia: 0.00018,
  damping: 0.00008,
};

/**
 * 创建 PMSM 状态的初始值。
 * 用于电流环、速度环和弱磁等教学仿真，避免状态在不同模块之间互相污染。
 */
export function createPmsmState(): PMSMState {
  return { id: 0, iq: 0, omegaMechanical: 0, thetaMechanical: 0, torque: 0 };
}

/**
 * 简化 PMSM dq 模型。
 * 电压方程：Vd = Rs*Id + Ld*dId/dt - we*Lq*Iq；Vq = Rs*Iq + Lq*dIq/dt + we*(Ld*Id + flux)。
 * 机械方程：J*dω/dt = Te - Tl - B*ω。该模型用于教学观察趋势，不替代高精度电磁暂态仿真。
 */
export function stepPmsmModel(input: PMSMStepInput): PMSMState {
  const { params, state } = input;
  const dt = Math.max(input.dt, 1e-6);
  const omegaElectrical = state.omegaMechanical * params.polePairs;
  const did = (input.vd - params.rs * state.id + omegaElectrical * params.lq * state.iq) / params.ld;
  const diq = (input.vq - params.rs * state.iq - omegaElectrical * (params.ld * state.id + params.flux)) / params.lq;
  const id = state.id + did * dt;
  const iq = state.iq + diq * dt;
  const torque = 1.5 * params.polePairs * (params.flux * iq + (params.ld - params.lq) * id * iq);
  const domega = (torque - input.loadTorque - params.damping * state.omegaMechanical) / params.inertia;
  const omegaMechanical = state.omegaMechanical + domega * dt;
  const thetaMechanical = state.thetaMechanical + omegaMechanical * dt;
  return { id, iq, omegaMechanical, thetaMechanical, torque };
}

export interface CurrentLoopResultPoint { t: number; id: number; iq: number; vd: number; vq: number; }

/**
 * 用简化 PMSM 模型演示 d/q 电流环的快速闭环特性。
 * 这个函数偏向教学观察：看的是趋势、串扰和限幅，而不是高精度电磁暂态。
 */
export function simulateCurrentLoop(targetId: number, targetIq: number, gains: PIDGains, duration = 0.06): CurrentLoopResultPoint[] {
  let pmsm = createPmsmState();
  let dState: PIDState = createPIDState();
  let qState: PIDState = createPIDState();
  const dt = 0.0001;
  const result: CurrentLoopResultPoint[] = [];
  for (let t = 0; t <= duration; t += dt) {
    const dPi = piStep({ setpoint: targetId, measurement: pmsm.id, dt, gains, limits: { min: -24, max: 24 }, antiWindup: true, state: dState });
    const qPi = piStep({ setpoint: targetIq, measurement: pmsm.iq, dt, gains, limits: { min: -24, max: 24 }, antiWindup: true, state: qState });
    dState = dPi.state;
    qState = qPi.state;
    pmsm = stepPmsmModel({ vd: dPi.output, vq: qPi.output, loadTorque: 0.02, dt, params: defaultPmsmParameters, state: pmsm });
    if (result.length % 8 === 0) result.push({ t: t * 1000, id: pmsm.id, iq: pmsm.iq, vd: dPi.output, vq: qPi.output });
  }
  return result;
}

export interface SpeedLoopPoint { t: number; speedRpm: number; iqRef: number; torque: number; }

/**
 * 用外环速度 PI 驱动内层电流/转矩的简化级联示意。
 * 这里把 IqRef 直接映射到 Vq，主要用于展示速度环过快、过慢和负载扰动的影响。
 */
export function simulateSpeedLoop(targetRpm: number, gains: PIDGains, loadTorque = 0.04, duration = 1.2): SpeedLoopPoint[] {
  let pmsm = createPmsmState();
  let speedState = createPIDState();
  const dt = 0.001;
  const result: SpeedLoopPoint[] = [];
  for (let t = 0; t <= duration; t += dt) {
    const rpm = (pmsm.omegaMechanical * 60) / (2 * Math.PI);
    const speedPi = piStep({ setpoint: targetRpm, measurement: rpm, dt, gains, limits: { min: -8, max: 8 }, antiWindup: true, state: speedState });
    speedState = speedPi.state;
    const vq = 3.2 * speedPi.output;
    pmsm = stepPmsmModel({ vd: 0, vq, loadTorque, dt, params: defaultPmsmParameters, state: pmsm });
    if (result.length % 4 === 0) result.push({ t, speedRpm: rpm, iqRef: speedPi.output, torque: pmsm.torque });
  }
  return result;
}
