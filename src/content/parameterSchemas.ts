import type { ReactNode } from 'react';
import type { ModuleId } from '../simulation/engine/types';

/**
 * 参数面板配置驱动 schema。
 * 每个模块描述自己有哪些可调项 + 一些非滑块的特殊节点（custom）。
 * ParameterPanel 用 SchemaCard 渲染，避免 11 张手写 Card。
 */
export interface SliderItem {
  type: 'slider';
  label: string;
  /** 在该模块的 store slice 上的字段名 */
  key: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  /** 用于把 store 值缩放后展示（例如 inertia × 1e6） */
  display?: { scale: number; suffix: string };
}

export interface ToggleItem {
  type: 'toggle';
  label: string;
  key: string;
  /** 显示文本，例如开关字面 */
  textOn?: string;
  textOff?: string;
}

export interface CustomItem {
  type: 'custom';
  /** 函数式 render，因为 schema 在 .ts 文件里不能直接放 JSX；运行时由组件填充 */
  renderKey: string;
}

export type SchemaItem = SliderItem | ToggleItem | CustomItem;

export interface ParameterSchema {
  moduleId: ModuleId;
  /** 取参数对象的 store key */
  sliceKey: 'motorBasics' | 'threePhase' | 'clarke' | 'park' | 'pid' | 'svpwm' | 'inverter' | 'sensorless' | 'weakField' | 'fault' | 'controlLoop' | 'foc' | 'hfi' | 'startup' | 'apf' | 'refrigeration';
  /** 对应的 update 函数名 */
  updateKey: string;
  title: string;
  eyebrow: string;
  /** 主要可调项（滑块） */
  sliders: SliderItem[];
  /** 滑块前置的特殊节点（按钮组、模式切换等），交给组件按 key 自行渲染 */
  customSlots?: string[];
}

// 注意：customSlots 的实际 JSX 由 ParameterPanel 内部按 moduleId 分发渲染。
// 这样可以保留每个模块的特殊交互（PID 预设双 button、Clarke 平衡/手动、Inverter 调制方式、Faults 8 故障，
// SVPWM 通过极坐标联动 Uα/Uβ）。

export const parameterSchemas: Record<ModuleId, ParameterSchema> = {
  'motor-basics': {
    moduleId: 'motor-basics',
    sliceKey: 'motorBasics',
    updateKey: 'updateMotorBasics',
    title: '电机模型参数',
    eyebrow: 'motor profile',
    customSlots: ['motor-presets'],
    sliders: [
      { type: 'slider', label: '极对数 p', key: 'polePairs', min: 1, max: 8, step: 1 },
      { type: 'slider', label: '机械角度 θm', key: 'mechanicalDeg', min: 0, max: 360, step: 1, unit: '°' },
      { type: 'slider', label: '机械转速', key: 'rpm', min: 0, max: 6000, step: 50, unit: ' rpm' },
      { type: 'slider', label: '相电阻 Rs', key: 'rs', min: 0.05, max: 5, step: 0.05, unit: ' Ω',
        hint: '同步给无感观测器 / 电流环' },
      { type: 'slider', label: 'd 轴电感 Ld', key: 'ldMh', min: 0.1, max: 8, step: 0.1, unit: ' mH',
        hint: '同步给弱磁电压方程 / 电流环' },
      { type: 'slider', label: 'q 轴电感 Lq', key: 'lqMh', min: 0.1, max: 10, step: 0.1, unit: ' mH',
        hint: '内嵌式电机 Lq > Ld；表贴式 Lq ≈ Ld' },
      { type: 'slider', label: '永磁磁链 ψf', key: 'flux', min: 0.005, max: 0.2, step: 0.001, unit: ' Wb',
        hint: '同步给 BEMF 估算、转矩、弱磁' },
      { type: 'slider', label: '转动惯量 J', key: 'inertiaUm', min: 20, max: 1500, step: 10, unit: ' μkg·m²',
        hint: '同步给三闭环动力学' },
      { type: 'slider', label: '黏性摩擦 B', key: 'dampingUm', min: 5, max: 300, step: 5, unit: ' μN·m·s/rad' },
      { type: 'slider', label: '额定电流', key: 'ratedCurrent', min: 1, max: 30, step: 0.5, unit: ' A' },
    ],
  },
  'three-phase': {
    moduleId: 'three-phase',
    sliceKey: 'threePhase',
    updateKey: 'updateThreePhase',
    title: '三相电流参数',
    eyebrow: '3-phase current',
    sliders: [
      { type: 'slider', label: '电流幅值', key: 'amplitude', min: 0, max: 12, step: 0.1, unit: ' A' },
      { type: 'slider', label: '频率', key: 'frequency', min: 1, max: 220, step: 1, unit: ' Hz' },
      { type: 'slider', label: '初始相位', key: 'phaseDeg', min: -180, max: 180, step: 1, unit: '°' },
      { type: 'slider', label: '三相不平衡', key: 'balance', min: -0.45, max: 0.45, step: 0.01, hint: '0 表示三相完全平衡，偏离后合成磁场会变成椭圆。' },
      { type: 'slider', label: '5 次谐波', key: 'harmonic', min: 0, max: 0.35, step: 0.01 },
      { type: 'slider', label: '采样噪声', key: 'noise', min: 0, max: 1.8, step: 0.05, unit: ' A' },
    ],
  },
  'clarke-transform': {
    moduleId: 'clarke-transform',
    sliceKey: 'clarke',
    updateKey: 'updateClarke',
    title: 'Clarke 输入',
    eyebrow: 'abc to αβ',
    customSlots: ['clarke-mode'],
    sliders: [
      // 实际显示由 ParameterPanel 根据 balanced 切换
      { type: 'slider', label: '电流幅值', key: 'amplitude', min: 0, max: 10, step: 0.1, unit: ' A' },
      { type: 'slider', label: '相位', key: 'phaseDeg', min: -180, max: 180, step: 1, unit: '°' },
      { type: 'slider', label: 'Ia', key: 'ia', min: -8, max: 8, step: 0.1, unit: ' A' },
      { type: 'slider', label: 'Ib', key: 'ib', min: -8, max: 8, step: 0.1, unit: ' A' },
      { type: 'slider', label: 'Ic', key: 'ic', min: -8, max: 8, step: 0.1, unit: ' A' },
    ],
  },
  'park-transform': {
    moduleId: 'park-transform',
    sliceKey: 'park',
    updateKey: 'updatePark',
    title: 'Park 坐标参数',
    eyebrow: 'αβ to dq',
    sliders: [
      { type: 'slider', label: '电角度 θ', key: 'thetaDeg', min: 0, max: 360, step: 1, unit: '°' },
      { type: 'slider', label: 'Iα', key: 'iAlpha', min: -8, max: 8, step: 0.1, unit: ' A' },
      { type: 'slider', label: 'Iβ', key: 'iBeta', min: -8, max: 8, step: 0.1, unit: ' A' },
    ],
  },
  'pid-control': {
    moduleId: 'pid-control',
    sliceKey: 'pid',
    updateKey: 'updatePid',
    title: 'PID / PI 阶跃实验',
    eyebrow: 'closed loop tuning',
    customSlots: ['pid-presets'],
    sliders: [
      { type: 'slider', label: 'Kp', key: 'kp', min: 0, max: 10, step: 0.05 },
      { type: 'slider', label: 'Ki', key: 'ki', min: 0, max: 80, step: 0.5 },
      { type: 'slider', label: 'Kd', key: 'kd', min: 0, max: 0.4, step: 0.005 },
      { type: 'slider', label: '目标值', key: 'target', min: 0.2, max: 3, step: 0.05 },
      { type: 'slider', label: '负载扰动', key: 'loadDisturbance', min: 0, max: 1.5, step: 0.02 },
      { type: 'slider', label: '输出限幅', key: 'limit', min: 2, max: 36, step: 0.5, unit: ' V' },
      { type: 'slider', label: '采样周期', key: 'sampleMs', min: 0.2, max: 10, step: 0.1, unit: ' ms' },
    ],
  },
  'foc-flow': {
    moduleId: 'foc-flow',
    sliceKey: 'foc',
    updateKey: 'updateFoc',
    title: 'FOC 电流环参数',
    eyebrow: 'current loop tuning',
    customSlots: ['foc-presets'],
    sliders: [
      { type: 'slider', label: 'Iq 阶跃指令', key: 'iqRef', min: -20, max: 20, step: 0.2, unit: ' A',
        hint: '压缩机额定 12-30A 不等' },
      { type: 'slider', label: 'Id 指令', key: 'idRef', min: -10, max: 4, step: 0.1, unit: ' A',
        hint: '压缩机 IPM 电机弱磁时注入负 Id' },
      { type: 'slider', label: '电流环 Kp', key: 'kp', min: 0.1, max: 6, step: 0.05 },
      { type: 'slider', label: '电流环 Ki', key: 'ki', min: 0, max: 1500, step: 10 },
      { type: 'slider', label: '电频率 ω', key: 'electricalFreq', min: 0, max: 600, step: 10, unit: ' Hz',
        hint: '空调压缩机最高电频率 480 Hz（4 极对 7200rpm），高于此进入深度弱磁' },
      { type: 'slider', label: '角度误差 Δθ', key: 'thetaErrorDeg', min: -30, max: 30, step: 1, unit: '°',
        hint: '观测器误差或编码器零位偏置，造成 Id/Iq 串扰' },
      { type: 'slider', label: '采样延迟', key: 'samplingDelaySamples', min: 0, max: 4, step: 1, unit: ' 周期' },
      { type: 'slider', label: '电压限幅', key: 'voltageLimit', min: 50, max: 240, step: 5, unit: ' V',
        hint: '310V 母线下 SVPWM 线性区上限 ≈ 179V' },
    ],
  },
  svpwm: {
    moduleId: 'svpwm',
    sliceKey: 'svpwm',
    updateKey: 'updateSvpwm',
    title: 'SVPWM / 母线参数',
    eyebrow: 'voltage vector',
    customSlots: ['svpwm-polar'],
    sliders: [
      { type: 'slider', label: 'Uα', key: 'uAlpha', min: -250, max: 250, step: 1, unit: ' V' },
      { type: 'slider', label: 'Uβ', key: 'uBeta', min: -250, max: 250, step: 1, unit: ' V' },
    ],
  },
  inverter: {
    moduleId: 'inverter',
    sliceKey: 'inverter',
    updateKey: 'updateInverter',
    title: '三相逆变器参数',
    eyebrow: 'power stage',
    sliders: [
      { type: 'slider', label: '母线 Udc', key: 'uDc', min: 60, max: 600, step: 5, unit: ' V',
        hint: '空调 / 冰箱压缩机典型 280-340V；直流变频空调 380V' },
      { type: 'slider', label: 'PWM 频率', key: 'pwmFrequency', min: 2000, max: 16000, step: 500, unit: ' Hz',
        hint: '压缩机为降低开关损耗常用 4-8kHz；过低会增加电流谐波' },
      { type: 'slider', label: '死区时间', key: 'deadTimeUs', min: 0, max: 5, step: 0.05, unit: ' μs',
        hint: 'IGBT 典型 1.5-3μs；低速小电流影响显著' },
      { type: 'slider', label: 'A 相占空比', key: 'dutyA', min: 0.02, max: 0.98, step: 0.01 },
      { type: 'slider', label: 'B 相占空比', key: 'dutyB', min: 0.02, max: 0.98, step: 0.01 },
      { type: 'slider', label: 'C 相占空比', key: 'dutyC', min: 0.02, max: 0.98, step: 0.01 },
    ],
  },
  'control-loops': {
    moduleId: 'control-loops',
    sliceKey: 'controlLoop',
    updateKey: 'updateControlLoop',
    title: '三闭环整定参数',
    eyebrow: 'current / speed / position',
    sliders: [
      { type: 'slider', label: '电流环 Kp', key: 'currentKp', min: 0.1, max: 8, step: 0.05 },
      { type: 'slider', label: '电流环 Ki', key: 'currentKi', min: 0, max: 100, step: 1 },
      { type: 'slider', label: '速度环 Kp', key: 'speedKp', min: 0.005, max: 0.4, step: 0.005 },
      { type: 'slider', label: '速度环 Ki', key: 'speedKi', min: 0, max: 5, step: 0.05 },
      { type: 'slider', label: '位置环 Kp', key: 'positionKp', min: 0, max: 12, step: 0.1 },
      { type: 'slider', label: '位置环 Ki', key: 'positionKi', min: 0, max: 2, step: 0.02 },
      { type: 'slider', label: '位置环 Kd', key: 'positionKd', min: 0, max: 1, step: 0.01 },
      { type: 'slider', label: '负载转矩', key: 'loadTorque', min: 0, max: 0.6, step: 0.01, unit: ' Nm' },
      { type: 'slider', label: '惯量 J', key: 'inertia', min: 0.00005, max: 0.0012, step: 0.00001, unit: ' kg·m²' },
      { type: 'slider', label: '目标速度', key: 'targetSpeed', min: 0, max: 5000, step: 50, unit: ' rpm' },
      { type: 'slider', label: '目标位置', key: 'targetPosition', min: 0, max: 1440, step: 10, unit: '°' },
    ],
  },
  'sensorless-foc': {
    moduleId: 'sensorless-foc',
    sliceKey: 'sensorless',
    updateKey: 'updateSensorless',
    title: '无感观测器参数',
    eyebrow: 'observer / pll',
    sliders: [
      { type: 'slider', label: '转速', key: 'speedRpm', min: 20, max: 14000, step: 50, unit: ' rpm',
        hint: '压缩机典型工作 1500-7200 rpm；< 500 rpm 需切 HFI' },
      { type: 'slider', label: '反电动势 Ke', key: 'ke', min: 0.01, max: 0.15, step: 0.001 },
      { type: 'slider', label: '相电阻 Rs', key: 'rs', min: 0.05, max: 5, step: 0.01, unit: ' Ω' },
      { type: 'slider', label: '相电感 Ls', key: 'lsMh', min: 0.1, max: 12, step: 0.05, unit: ' mH' },
      { type: 'slider', label: '观测器增益', key: 'observerGain', min: 0.1, max: 2.5, step: 0.05 },
      { type: 'slider', label: 'PLL Kp', key: 'pllKp', min: 5, max: 180, step: 1 },
      { type: 'slider', label: 'PLL Ki', key: 'pllKi', min: 0, max: 3200, step: 20 },
      { type: 'slider', label: '噪声', key: 'noise', min: 0, max: 0.8, step: 0.01 },
    ],
  },
  'field-weakening': {
    moduleId: 'field-weakening',
    sliceKey: 'weakField',
    updateKey: 'updateWeakField',
    title: '弱磁控制参数',
    eyebrow: 'id / iq limit',
    sliders: [
      { type: 'slider', label: '母线 Udc', key: 'uDc', min: 60, max: 600, step: 5, unit: ' V' },
      { type: 'slider', label: '目标转速', key: 'targetRpm', min: 500, max: 14000, step: 100, unit: ' rpm',
        hint: '空调压缩机典型最高 7200 rpm，工业制冷可达 12000+' },
      { type: 'slider', label: 'Id', key: 'id', min: -15, max: 4, step: 0.1, unit: ' A',
        hint: '弱磁注入负 Id；过大有退磁风险' },
      { type: 'slider', label: 'Iq', key: 'iq', min: 0, max: 30, step: 0.1, unit: ' A' },
      { type: 'slider', label: 'Ld', key: 'ldMh', min: 0.2, max: 8, step: 0.05, unit: ' mH' },
      { type: 'slider', label: 'Lq', key: 'lqMh', min: 0.2, max: 12, step: 0.05, unit: ' mH' },
      { type: 'slider', label: '磁链 ψf', key: 'flux', min: 0.01, max: 0.15, step: 0.001, unit: ' Wb' },
      { type: 'slider', label: '电流限制', key: 'currentLimit', min: 2, max: 35, step: 0.5, unit: ' A' },
    ],
  },
  'faults-debugging': {
    moduleId: 'faults-debugging',
    sliceKey: 'fault',
    updateKey: 'updateFault',
    title: '故障注入实验',
    eyebrow: 'fault injection',
    customSlots: ['fault-types'],
    sliders: [
      { type: 'slider', label: '故障严重度', key: 'severity', min: 0, max: 1, step: 0.01 },
    ],
  },
  'hfi-sensorless': {
    moduleId: 'hfi-sensorless',
    sliceKey: 'hfi',
    updateKey: 'updateHfi',
    title: 'HFI 高频注入参数',
    eyebrow: 'high-frequency injection',
    sliders: [
      { type: 'slider', label: '注入电压', key: 'injectVoltage', min: 5, max: 80, step: 1, unit: ' V',
        hint: '过低信号噪比差；过高听感噪声大' },
      { type: 'slider', label: '注入频率', key: 'injectFreqHz', min: 200, max: 2000, step: 50, unit: ' Hz',
        hint: '> 1kHz 可避开人耳敏感段；要远低于 PWM 频率' },
      { type: 'slider', label: '当前转速', key: 'speedRpm', min: 0, max: 500, step: 10, unit: ' rpm',
        hint: 'HFI 工作区：0 ~ 500 rpm；高于此切 SMO' },
      { type: 'slider', label: '凸极比 Lq/Ld', key: 'saliencyRatio', min: 1.0, max: 3.5, step: 0.05,
        hint: 'IPM 凸极比；表贴式 = 1（HFI 不可用）' },
      { type: 'slider', label: '解调 LPF 截止', key: 'demodCutoffHz', min: 50, max: 500, step: 10, unit: ' Hz' },
      { type: 'slider', label: 'PLL Kp', key: 'pllKp', min: 10, max: 300, step: 5 },
      { type: 'slider', label: 'PLL Ki', key: 'pllKi', min: 100, max: 5000, step: 50 },
      { type: 'slider', label: '测量噪声', key: 'measNoise', min: 0, max: 0.2, step: 0.005, unit: ' A' },
    ],
  },
  'startup-statemachine': {
    moduleId: 'startup-statemachine',
    sliceKey: 'startup',
    updateKey: 'updateStartup',
    title: '启动状态机参数',
    eyebrow: 'startup sequence',
    sliders: [
      { type: 'slider', label: '目标转速', key: 'targetRpm', min: 500, max: 14000, step: 100, unit: ' rpm' },
      { type: 'slider', label: '加速斜坡', key: 'accelRampRpmS', min: 100, max: 3000, step: 50, unit: ' rpm/s',
        hint: '反液击：典型 300-800；过快有液击风险' },
      { type: 'slider', label: '对齐时长', key: 'alignDurationMs', min: 200, max: 2000, step: 50, unit: ' ms' },
      { type: 'slider', label: 'HFI 切入', key: 'hfiHandoffRpm', min: 30, max: 300, step: 10, unit: ' rpm' },
      { type: 'slider', label: 'BEMF 切入', key: 'bemfHandoffRpm', min: 200, max: 1500, step: 50, unit: ' rpm' },
      { type: 'slider', label: '弱磁介入', key: 'fieldweakRpm', min: 1000, max: 12000, step: 100, unit: ' rpm' },
    ],
  },
  'refrigeration-bench': {
    moduleId: 'refrigeration-bench',
    sliceKey: 'refrigeration',
    updateKey: 'updateRefrigeration',
    title: '工况输入 / 制冷系统参数',
    eyebrow: 'thermodynamic conditions',
    customSlots: ['refrigerant-picker', 'closed-loop-toggle'],
    sliders: [
      { type: 'slider', label: '蒸发温度 T_e', key: 'Te', min: -30, max: 18, step: 0.5, unit: ' °C',
        hint: '空调制冷 6-12℃；冷藏 -5~5℃；冷冻 -25~-15℃' },
      { type: 'slider', label: '冷凝温度 T_c', key: 'Tc', min: 25, max: 65, step: 0.5, unit: ' °C',
        hint: '室外 35℃ 时 T_c≈45℃；高温季可达 55-60℃' },
      { type: 'slider', label: '吸气过热度', key: 'superheatK', min: 0, max: 15, step: 0.5, unit: ' K',
        hint: '过低有液击风险；EEV 控制目标常设 5K' },
      { type: 'slider', label: '冷凝出口过冷度', key: 'subcoolK', min: 0, max: 12, step: 0.5, unit: ' K',
        hint: '提高过冷度 → 增大单位制冷量但占用冷凝面积' },
      { type: 'slider', label: '室外环温', key: 'ambientOutdoorC', min: -10, max: 50, step: 1, unit: ' °C',
        hint: 'T_c 比室外高约 8-15K；超 45℃ 易触发高压保护' },
      { type: 'slider', label: '室内环温', key: 'ambientIndoorC', min: -20, max: 32, step: 1, unit: ' °C',
        hint: 'T_e 比室内低约 8-15K' },
      { type: 'slider', label: '膨胀阀开度', key: 'eevOpening', min: 0.1, max: 1.0, step: 0.05,
        hint: 'EEV 实际由过热度反馈控制；这里手动设定上限' },
      { type: 'slider', label: '压缩机排量', key: 'displacementCc', min: 4, max: 30, step: 0.5, unit: ' cc/rev',
        hint: '1HP≈8cc，1.5HP≈10cc，2HP≈12cc' },
      { type: 'slider', label: '余隙比 C', key: 'clearanceRatio', min: 0.02, max: 0.12, step: 0.005,
        hint: '余隙越大 → 容积效率随压比下降越快' },
      { type: 'slider', label: '等熵效率 η_s', key: 'isentropicEff', min: 0.4, max: 0.92, step: 0.01,
        hint: '高速变频压缩机 0.7-0.85；低速运行降至 0.55' },
    ],
  },
  'apf-frontend': {
    moduleId: 'apf-frontend',
    sliceKey: 'apf',
    updateKey: 'updateApf',
    title: 'APF / Boost PFC 参数',
    eyebrow: 'pfc front-end',
    sliders: [
      { type: 'slider', label: '电网电压 RMS', key: 'vAcRms', min: 90, max: 265, step: 5, unit: ' V',
        hint: '中国 220V，欧 230V，美 110V/220V' },
      { type: 'slider', label: '电网频率', key: 'vAcFreqHz', min: 45, max: 65, step: 1, unit: ' Hz' },
      { type: 'slider', label: '母线目标 Udc', key: 'udcRef', min: 250, max: 450, step: 5, unit: ' V',
        hint: '380-400V 给压缩机变频器留弱磁余量' },
      { type: 'slider', label: 'Boost 电感 L', key: 'boostInductanceMh', min: 0.5, max: 5, step: 0.1, unit: ' mH' },
      { type: 'slider', label: '母线电容 C', key: 'boostCapacitanceUf', min: 100, max: 2000, step: 50, unit: ' μF' },
      { type: 'slider', label: '负载电流', key: 'loadCurrent', min: 0.5, max: 15, step: 0.5, unit: ' A',
        hint: '后级压缩机变频器消耗电流' },
      { type: 'slider', label: '电流环 Kp', key: 'currentKp', min: 0.01, max: 0.5, step: 0.01 },
      { type: 'slider', label: '电流环 Ki', key: 'currentKi', min: 5, max: 200, step: 5 },
      { type: 'slider', label: '电压环 Kp', key: 'voltageKp', min: 0.05, max: 5, step: 0.05 },
      { type: 'slider', label: '电压环 Ki', key: 'voltageKi', min: 0.5, max: 50, step: 0.5 },
    ],
  },
};

// 仅类型导出辅助
export type { ReactNode };
