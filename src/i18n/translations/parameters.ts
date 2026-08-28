import { e } from '../entries';

/** parameters 命名空间（由 translations.ts 机械拆分，语义未变）。 */
export const parameters = {
  chipBalanced: e('平衡三相', 'Balanced three-phase'),
  chipManualAbc: e('手动 Ia/Ib/Ic', 'Manual Ia/Ib/Ic'),
  chipAntiWindupOn: e('抗积分饱和 开', 'Anti-windup On'),
  chipAntiWindupOff: e('抗积分饱和 关', 'Anti-windup Off'),
  chipSlowResponse: e('慢响应', 'Slow response'),
  chipOscillation: e('振荡', 'Oscillation'),
  refrigerantTitle: e('制冷剂选择：', 'Refrigerant:'),
  closedLoopTitle: e('FOC 闭环耦合', 'FOC closed-loop coupling'),
  closedLoopHint: e(
    '开启后，循环算出的负载扭矩会反映成 FOC 模块所需的 Iq 给定，让"系统侧"和"电机侧"互相印证。',
    'When enabled, the load torque from the cycle becomes the FOC Iq reference, cross-validating system-side and motor-side.',
  ),
  closedLoopEnabled: e('已启用闭环', 'Closed-loop enabled'),
  closedLoopEnable: e('启用闭环', 'Enable closed loop'),
  motorPresetsHint: e('常见压缩机 IPM 电机预设：', 'Typical compressor IPM motor presets:'),
  motorPresetHvac: e('空调压缩机', 'HVAC compressor'),
  motorPresetFridge: e('冰箱压缩机', 'Refrigerator compressor'),
  motorPresetIndustrial: e('工业制冷', 'Industrial refrigeration'),
  // —— FOC 调参 preset（FocPresets）——
  focPresetSlow: e('慢响应（保守）', 'Slow (conservative)'),
  focPresetTypical: e('压缩机典型', 'Compressor typical'),
  focPresetOvershoot: e('过激振荡', 'Aggressive / oscillation'),
  focPresetThetaErr: e('观测器角度误差', 'Observer angle error'),
  focPresetHighSpeed: e('高速 7200rpm', 'High speed 7200 rpm'),
  focPresetLowSpeed: e('低速重载', 'Low speed heavy load'),
  // —— SVPWM 极坐标联动滑块（SvpwmPolar）——
  svpwmBusUdcLabel: e('母线 Udc', 'DC bus Udc'),
  svpwmAngleLabel: e('电角度', 'Electrical angle'),
  svpwmModulationLabel: e('调制比', 'Modulation index'),
  svpwmModulationHint: e(
    'm=1 附近到达 SVPWM 线性区边界；继续增大表示过调制风险。',
    'm=1 approaches the SVPWM linear-region boundary; beyond that, over-modulation risk.',
  ),
};
