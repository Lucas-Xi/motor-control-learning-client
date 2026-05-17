import { clamp } from '../../utils/clamp';

export interface InverterInput {
  uDc: number;
  dutyA: number;
  dutyB: number;
  dutyC: number;
  deadTimeSec: number;
  pwmFrequency: number;
  iaSign?: number;
  ibSign?: number;
  icSign?: number;
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
  // 死区方向由相电流极性决定：i>0（流出桥臂）→ 占空比下降；i<0 → 占空比上升。
  // 调用方未传 iSign 时退化为旧的 sign(duty-0.5) 近似（非物理但保持兼容）。
  const correctDuty = (duty: number, iSign: number | undefined) => {
    const sign = iSign === undefined ? Math.sign(duty - 0.5) : Math.sign(iSign);
    return clamp(duty - deadLoss * sign, 0, 1);
  };
  const va = (correctDuty(input.dutyA, input.iaSign) - 0.5) * input.uDc;
  const vb = (correctDuty(input.dutyB, input.ibSign) - 0.5) * input.uDc;
  const vc = (correctDuty(input.dutyC, input.icSign) - 0.5) * input.uDc;
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
