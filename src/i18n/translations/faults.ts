import { e } from '../entries';

/** faults 命名空间（由 translations.ts 机械拆分，语义未变）。 */
export const faults = {
  overCurrent: e('过流', 'Over-current'),
  phaseLoss: e('缺相', 'Phase loss'),
  currentOffset: e('采样偏置', 'Sampling offset'),
  phaseOrder: e('相序错误', 'Phase order error'),
  encoderAngle: e('角度错误', 'Angle error'),
  speedOscillation: e('速度振荡', 'Speed oscillation'),
  voltageSaturation: e('电压饱和', 'Voltage saturation'),
  startupFail: e('启动失败', 'Startup failure'),
  liquidSlugging: e('液击', 'Liquid slugging'),
  lockedRotor: e('堵转', 'Locked rotor'),
  dcUndervolt: e('母线欠压', 'DC undervoltage'),
  overTemp: e('过温', 'Over-temperature'),
  vibration: e('振动超限', 'Vibration over limit'),
  oilLow: e('油位告警', 'Low oil alarm'),
};
