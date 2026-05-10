import { clarkeTransform, generateThreePhaseCurrent, inverseParkTransform, parkTransform } from '../math/transforms';
import { calculateSvpwm } from '../math/svpwm';
import { createPIDState, piStep } from '../math/pid';
import { inverterAverageModel } from '../math/inverterModel';
import type { ParkParams, PIDParams, ThreePhaseParams } from './types';

export interface FOCStep {
  id: string;
  title: string;
  formula: string;
  input: Record<string, number | string>;
  output: Record<string, number | string>;
  note: string;
}

export interface FOCFlowSnapshot {
  steps: FOCStep[];
  activeIndex: number;
  abc: { ia: number; ib: number; ic: number };
  alphaBeta: { alpha: number; beta: number; zero?: number };
  dq: { d: number; q: number };
  vdq: { d: number; q: number };
  uAlphaBeta: { alpha: number; beta: number };
  svpwm: ReturnType<typeof calculateSvpwm>;
  inverter: ReturnType<typeof inverterAverageModel>;
}

function fixed(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

/**
 * 教学用 FOC 单周期快照。
 * 它把一次 PWM 中断中的数据链拆成步骤，便于 UI 单步显示；真实固件中这些步骤会在几十微秒内完成。
 */
export function createFocFlowSnapshot(
  threePhase: ThreePhaseParams,
  park: ParkParams,
  pid: PIDParams,
  time: number,
): FOCFlowSnapshot {
  const abc = generateThreePhaseCurrent({ ...threePhase, time });
  const alphaBeta = clarkeTransform(abc);
  const theta = (park.thetaDeg * Math.PI) / 180 + time * (park.speedRpm / 60) * 2 * Math.PI * 4;
  const dq = parkTransform(alphaBeta, theta);
  const dt = Math.max(pid.sampleMs / 1000, 0.00005);
  const dController = piStep({
    setpoint: park.idRef,
    measurement: dq.d,
    dt,
    gains: { kp: pid.kp, ki: pid.ki },
    limits: { min: -pid.limit, max: pid.limit },
    antiWindup: pid.antiWindup,
    state: createPIDState(),
  });
  const qController = piStep({
    setpoint: park.iqRef,
    measurement: dq.q,
    dt,
    gains: { kp: pid.kp, ki: pid.ki },
    limits: { min: -pid.limit, max: pid.limit },
    antiWindup: pid.antiWindup,
    state: createPIDState(),
  });
  const vdq = { d: dController.output, q: qController.output };
  const uAlphaBeta = inverseParkTransform(vdq, theta);
  const svpwm = calculateSvpwm({ uAlpha: uAlphaBeta.alpha, uBeta: uAlphaBeta.beta, uDc: 48 });
  const inverter = inverterAverageModel({
    uDc: 48,
    dutyA: svpwm.dutyA,
    dutyB: svpwm.dutyB,
    dutyC: svpwm.dutyC,
    deadTimeSec: 1e-6,
    pwmFrequency: 16000,
  });

  const steps: FOCStep[] = [
    {
      id: 'sample',
      title: '1. 采样三相电流',
      formula: 'Ia, Ib, Ic = ADC - offset',
      input: { ADC: '三相采样通道', offset: '零电流偏置' },
      output: { Ia: fixed(abc.ia), Ib: fixed(abc.ib), Ic: fixed(abc.ic) },
      note: '真实 STM32 中建议在 PWM 中点采样，先减偏置，再进入坐标变换。',
    },
    {
      id: 'clarke',
      title: '2. Clarke 变换',
      formula: 'Iα = Ia, Iβ = (Ia + 2Ib) / √3',
      input: { Ia: fixed(abc.ia), Ib: fixed(abc.ib), Ic: fixed(abc.ic) },
      output: { Ialpha: fixed(alphaBeta.alpha), Ibeta: fixed(alphaBeta.beta), I0: fixed(alphaBeta.zero ?? 0) },
      note: '把三相电流投影到静止 αβ 平面，零序用于发现偏置或不平衡。',
    },
    {
      id: 'park',
      title: '3. Park 变换',
      formula: 'Id = Iα cosθ + Iβ sinθ; Iq = -Iα sinθ + Iβ cosθ',
      input: { Ialpha: fixed(alphaBeta.alpha), Ibeta: fixed(alphaBeta.beta), theta: `${fixed((theta * 180) / Math.PI, 1)}°` },
      output: { Id: fixed(dq.d), Iq: fixed(dq.q) },
      note: '坐标系跟着转子磁链旋转，正弦交流量在 dq 坐标里变成近似直流量。',
    },
    {
      id: 'current-pi',
      title: '4. Id / Iq 电流环 PI',
      formula: 'Vd/Vq = Kp * e + Ki * ∫e dt',
      input: { IdRef: fixed(park.idRef), IqRef: fixed(park.iqRef), Id: fixed(dq.d), Iq: fixed(dq.q) },
      output: { Vd: fixed(vdq.d), Vq: fixed(vdq.q), saturated: dController.saturated || qController.saturated ? '是' : '否' },
      note: '电流环是 FOC 最内层快环，输出的是期望电压，而不是直接输出 PWM。',
    },
    {
      id: 'inverse-park',
      title: '5. 反 Park 变换',
      formula: 'Uα = Vd cosθ - Vq sinθ; Uβ = Vd sinθ + Vq cosθ',
      input: { Vd: fixed(vdq.d), Vq: fixed(vdq.q), theta: `${fixed((theta * 180) / Math.PI, 1)}°` },
      output: { Ualpha: fixed(uAlphaBeta.alpha), Ubeta: fixed(uAlphaBeta.beta) },
      note: '控制器在 dq 坐标里工作，但逆变器需要静止坐标里的电压矢量。',
    },
    {
      id: 'svpwm',
      title: '6. SVPWM',
      formula: 'sector, T1, T2, T0 -> dutyA/B/C',
      input: { Ualpha: fixed(uAlphaBeta.alpha), Ubeta: fixed(uAlphaBeta.beta), Udc: 48 },
      output: { sector: svpwm.sector, dutyA: fixed(svpwm.dutyA), dutyB: fixed(svpwm.dutyB), dutyC: fixed(svpwm.dutyC) },
      note: '把电压矢量转换成三相桥的中心对齐 PWM 占空比。',
    },
    {
      id: 'inverter',
      title: '7. 逆变器输出',
      formula: 'Va = (Da - 0.5) * Udc',
      input: { dutyA: fixed(svpwm.dutyA), dutyB: fixed(svpwm.dutyB), dutyC: fixed(svpwm.dutyC) },
      output: { Va: fixed(inverter.phaseA), Vb: fixed(inverter.phaseB), Vc: fixed(inverter.phaseC), Vab: fixed(inverter.lineAB) },
      note: '功率级把 duty 转成相电压和线电压，最终推动电机电流变化。',
    },
    {
      id: 'feedback',
      title: '8. 电机响应与角度反馈',
      formula: 'θe = p * θm 或 observer(V,I)',
      input: { voltage: fixed(svpwm.vectorMagnitude), load: fixed(park.loadTorque), speed: `${fixed(park.speedRpm, 0)} rpm` },
      output: { thetaFeedback: `${fixed((theta * 180) / Math.PI, 1)}°`, nextCycle: '进入下一 PWM 周期' },
      note: '编码器或观测器给出下一周期的电角度；角度错会直接导致 Id/Iq 串扰。',
    },
  ];

  return {
    steps,
    activeIndex: Math.floor(time * 1.6) % steps.length,
    abc,
    alphaBeta,
    dq,
    vdq,
    uAlphaBeta,
    svpwm,
    inverter,
  };
}
