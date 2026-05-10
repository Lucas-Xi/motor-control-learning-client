import { clamp } from '../../utils/clamp';

export interface InverterInput {
  uDc: number;
  dutyA: number;
  dutyB: number;
  dutyC: number;
  deadTimeSec: number;
  pwmFrequency: number;
}

export interface InverterOutput {
  phaseA: number;
  phaseB: number;
  phaseC: number;
  lineAB: number;
  lineBC: number;
  lineCA: number;
  deadTimeDistortion: number;
}

/**
 * 两电平三相逆变器平均模型。
 * duty 表示上桥臂占空比，输出为相对直流母线中点的平均相电压。
 * deadTimeSec / pwmFrequency 用于估算死区导致的有效占空比损失。
 */
export function inverterAverageModel(input: InverterInput): InverterOutput {
  const deadLoss = clamp(input.deadTimeSec * input.pwmFrequency, 0, 0.2);
  const signedDuty = (duty: number) => clamp(duty - deadLoss * Math.sign(duty - 0.5), 0, 1);
  const va = (signedDuty(input.dutyA) - 0.5) * input.uDc;
  const vb = (signedDuty(input.dutyB) - 0.5) * input.uDc;
  const vc = (signedDuty(input.dutyC) - 0.5) * input.uDc;
  return {
    phaseA: va,
    phaseB: vb,
    phaseC: vc,
    lineAB: va - vb,
    lineBC: vb - vc,
    lineCA: vc - va,
    deadTimeDistortion: deadLoss,
  };
}
