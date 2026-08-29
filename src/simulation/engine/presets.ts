import type {
  APFParams,
  FaultParams,
  FOCParams,
  HFIParams,
  InverterParams,
  ModuleId,
  ModuleMeta,
  MotorBasicsParams,
  SensorlessParams,
  RefrigerationParams,
  StartupParams,
  ThreePhaseParams,
  ClarkeParams,
  ParkParams,
  PIDParams,
  SvpwmParams,
  WeakFieldParams,
  ControlLoopParams,
} from './types';

export const moduleMetas: ModuleMeta[] = [
  { id: 'motor-basics', title: '电机基础', shortTitle: '基础', subtitle: '结构、极对数、电角度与机械角度', stage: '01', accent: '#34d6ff',
    titleEn: 'Motor Basics', shortTitleEn: 'Basics', subtitleEn: 'Construction, pole pairs, electrical vs mechanical angle' },
  { id: 'three-phase', title: '三相正弦波与旋转磁场', shortTitle: '三相磁场', subtitle: '观察三相电流如何合成旋转磁场', stage: '02', accent: '#43f7b5',
    titleEn: 'Three-Phase Sine & Rotating Field', shortTitleEn: '3-Phase', subtitleEn: 'Watch three-phase currents build a rotating field' },
  { id: 'clarke-transform', title: 'Clarke 变换', shortTitle: 'Clarke', subtitle: 'abc 到 alpha-beta 的投影', stage: '03', accent: '#ffb84d',
    titleEn: 'Clarke Transform', shortTitleEn: 'Clarke', subtitleEn: 'Projecting abc onto the alpha-beta frame' },
  { id: 'park-transform', title: 'Park 变换', shortTitle: 'Park', subtitle: 'alpha-beta 到 dq 同步旋转坐标', stage: '04', accent: '#7dd3fc',
    titleEn: 'Park Transform', shortTitleEn: 'Park', subtitleEn: 'From alpha-beta to the rotating dq frame' },
  { id: 'pid-control', title: 'PID 控制', shortTitle: 'PID', subtitle: 'P/I/D、限幅和抗积分饱和', stage: '05', accent: '#fb7185',
    titleEn: 'PID Control', shortTitleEn: 'PID', subtitleEn: 'P/I/D, output limits and anti-windup' },
  { id: 'foc-flow', title: 'FOC 总体流程', shortTitle: 'FOC 流程', subtitle: '采样、变换、电流环、SVPWM 闭环链路', stage: '06', accent: '#22d3ee',
    titleEn: 'FOC Pipeline', shortTitleEn: 'FOC Flow', subtitleEn: 'Sampling, transforms, current loop and SVPWM chain' },
  { id: 'svpwm', title: 'SVPWM', shortTitle: 'SVPWM', subtitle: '空间电压矢量、扇区、T1/T2/T0', stage: '07', accent: '#a3e635',
    titleEn: 'SVPWM', shortTitleEn: 'SVPWM', subtitleEn: 'Space vectors, sectors, T1/T2/T0' },
  { id: 'inverter', title: '三相逆变器', shortTitle: '逆变器', subtitle: '桥臂、PWM、死区和线电压', stage: '08', accent: '#f97316',
    titleEn: 'Three-Phase Inverter', shortTitleEn: 'Inverter', subtitleEn: 'Bridge legs, PWM, dead time, line voltages' },
  { id: 'control-loops', title: '电流环 / 速度环 / 位置环', shortTitle: '三闭环', subtitle: '内环快、外环慢和参数整定', stage: '09', accent: '#60a5fa',
    titleEn: 'Current / Speed / Position Loops', shortTitleEn: 'Loops', subtitleEn: 'Inner loops fast, outer loops slow, tuning' },
  { id: 'sensorless-foc', title: '无感 FOC / 观测器', shortTitle: '无感', subtitle: '反电动势、SMO、PLL 与开闭环切换', stage: '10', accent: '#c084fc',
    titleEn: 'Sensorless FOC / Observers', shortTitleEn: 'Sensorless', subtitleEn: 'Back-EMF, SMO, PLL and open/closed-loop handover' },
  { id: 'field-weakening', title: '弱磁控制', shortTitle: '弱磁', subtitle: '电压极限、负 Id、恒功率区', stage: '11', accent: '#2dd4bf',
    titleEn: 'Field Weakening', shortTitleEn: 'FW', subtitleEn: 'Voltage limit, negative Id, constant-power region' },
  { id: 'faults-debugging', title: '故障与调试', shortTitle: '调试', subtitle: '波形现象、原因定位与 STM32 排查路径', stage: '12', accent: '#ff5c7a',
    titleEn: 'Faults & Debugging', shortTitleEn: 'Debug', subtitleEn: 'Waveform symptoms, root-cause triage, STM32 paths' },
  { id: 'hfi-sensorless', title: 'HFI 高频注入低速无感', shortTitle: 'HFI', subtitle: '凸极比解调 + 零速启动的压缩机标配方案', stage: '13', accent: '#a3e635',
    titleEn: 'HFI Low-Speed Sensorless', shortTitleEn: 'HFI', subtitleEn: 'Saliency demodulation + zero-speed start for compressors' },
  { id: 'startup-statemachine', title: '压缩机启动状态机', shortTitle: '启动机', subtitle: 'V/f 启动 → HFI → BEMF → 弱磁全过程', stage: '14', accent: '#22d3ee',
    titleEn: 'Compressor Startup State Machine', shortTitleEn: 'Startup', subtitleEn: 'V/f → HFI → BEMF → field weakening, end to end' },
  { id: 'apf-frontend', title: 'APF 前级 PFC', shortTitle: 'APF', subtitle: '单相 220V → Boost PFC → 直流母线，谐波抑制 + 功率因数', stage: '15', accent: '#fb7185',
    titleEn: 'APF Front-End PFC', shortTitleEn: 'PFC', subtitleEn: 'Single-phase 220 V → Boost PFC → DC bus, THD + PF' },
  { id: 'refrigeration-bench', title: '制冷系统台架', shortTitle: '台架', subtitle: '蒸气压缩循环 + 工况输入 + 与 FOC 闭环耦合', stage: '16', accent: '#7dd3fc',
    titleEn: 'Refrigeration Bench', shortTitleEn: 'Bench', subtitleEn: 'Vapor-compression cycle coupled with the FOC loop' },
];

/** 按 locale 取模块元数据文案；en 缺字段时回退中文。 */
export function localizeModuleMeta(
  meta: ModuleMeta,
  locale: 'zh-CN' | 'en-US',
): { title: string; shortTitle: string; subtitle: string } {
  if (locale !== 'en-US') {
    return { title: meta.title, shortTitle: meta.shortTitle, subtitle: meta.subtitle };
  }
  return {
    title: meta.titleEn ?? meta.title,
    shortTitle: meta.shortTitleEn ?? meta.shortTitle,
    subtitle: meta.subtitleEn ?? meta.subtitle,
  };
}

export const threePhaseDefault: ThreePhaseParams = {
  amplitude: 6,
  frequency: 50,
  phaseDeg: 0,
  balance: 0,
  harmonic: 0,
  noise: 0,
};

export const clarkeDefault: ClarkeParams = {
  ia: 4,
  ib: -2,
  ic: -2,
  amplitude: 5,
  phaseDeg: 0,
  balanced: true,
};

export const parkDefault: ParkParams = {
  thetaDeg: 35,
  iAlpha: 3.6,
  iBeta: 4.2,
  speedRpm: 1200,
  loadTorque: 0.12,
  idRef: 0,
  iqRef: 5,
};

// 默认对标空调压缩机：4 极对、IPM 凸极电机（Lq > Ld，约 2× 凸极比适合 HFI 低速无感），
// 额定 12A、最高 7200 rpm（电频率 480 Hz），惯量适中。
export const motorBasicsDefault: MotorBasicsParams = {
  polePairs: 4,
  mechanicalDeg: 0,
  rpm: 120,           // 演示用；实际压缩机典型工作 1500-7200 rpm
  ratedCurrent: 12,
  ratedSpeed: 7200,
  rs: 0.42,
  ldMh: 1.1,
  lqMh: 2.4,          // 显著大于 Ld → IPM 凸极 → HFI 可用
  flux: 0.052,
  inertiaUm: 320,
  dampingUm: 120,
  windingType: 'Y',
  demagnetizationRatio: 0,
};

export const pidDefault: PIDParams = {
  kp: 2.2,
  ki: 18,
  kd: 0.02,
  target: 1,
  loadDisturbance: 0.12,
  limit: 24,
  sampleMs: 2,
  antiWindup: true,
};

// SVPWM 默认母线对齐 310V（压缩机典型直流侧），调制比 0.65 留些余量给弱磁
export const svpwmDefault: SvpwmParams = {
  uAlpha: 116,
  uBeta: 52,
  uDc: 310,
  electricalDeg: 24,
  modulation: 0.65,
};

// 压缩机变频器：母线 310V（单相 220V 整流后）、PWM 6kHz（折中开关损耗与控制带宽）、死区 2μs（IGBT 典型）
export const inverterDefault: InverterParams = {
  uDc: 310,
  pwmFrequency: 6000,
  deadTimeUs: 2,
  dutyA: 0.62,
  dutyB: 0.38,
  dutyC: 0.5,
  loadInductanceMh: 1.5,
  modulationMode: 'svpwm',
};

// 压缩机无感观测器默认：默认 1500 rpm 工作点（BEMF 已可信），
// 参数同步 motor profile 默认（Rs 0.42、Ls=(Ld+Lq)/2=1.75mH、ψf 0.052）
export const sensorlessDefault: SensorlessParams = {
  speedRpm: 1500,
  ke: 0.052,
  rs: 0.42,
  lsMh: 1.75,
  observerGain: 0.8,
  pllKp: 80,
  pllKi: 1200,
  noise: 0.08,
  loadDisturbance: 0.1,
};

// 压缩机弱磁场景：母线 310V，目标 7200rpm（4 极对 = 480 Hz 电频率，恒功率上限附近）
export const weakFieldDefault: WeakFieldParams = {
  uDc: 310,
  targetRpm: 7200,
  id: -3.5,
  iq: 8,
  ldMh: 1.1,
  lqMh: 2.4,
  flux: 0.052,
  currentLimit: 12,
  voltageMargin: 0.92,    // 留 8% 给瞬态 / 动态响应
};

export const faultDefault: FaultParams = {
  faultType: 'current-offset',
  severity: 0.55,
};

export const hfiDefault: HFIParams = {
  injectVoltage: 30,        // V，比工作电压低一数量级
  injectFreqHz: 800,        // 典型 500-1500Hz；过低受 PWM 谐波干扰，过高 PWM 8kHz 装不下
  speedRpm: 50,             // 演示低速场景
  saliencyRatio: 2.18,      // Lq/Ld = 2.4/1.1 ≈ 2.18，压缩机 IPM 典型
  demodCutoffHz: 200,       // 解调后低通截止
  pllKp: 100,
  pllKi: 1500,
  measNoise: 0.03,
  trueThetaRad: 0,
};

export const apfDefault: APFParams = {
  vAcRms: 220,
  vAcFreqHz: 50,
  udcRef: 380,
  boostInductanceMh: 1.5,
  boostCapacitanceUf: 470,
  loadCurrent: 4,
  currentKp: 0.05,
  currentKi: 50,
  voltageKp: 0.5,
  voltageKi: 5,
};

export const refrigerationDefault: RefrigerationParams = {
  refrigerant: 'R32',
  Te: 7,                  // 蒸发温度 (°C) — 空调制冷工况典型值
  Tc: 45,                 // 冷凝温度 (°C) — 室外 35°C 时
  superheatK: 5,
  subcoolK: 3,
  ambientOutdoorC: 35,
  ambientIndoorC: 27,
  eevOpening: 0.55,
  displacementCc: 9.5,    // 1.5HP 转子式压缩机典型排量
  clearanceRatio: 0.05,
  isentropicEff: 0.72,
  closedLoop: true,
};

export const startupDefault: StartupParams = {
  state: 'idle',
  targetRpm: 3000,
  currentRpm: 0,
  accelRampRpmS: 600,        // 反液击：每秒不超 600 rpm 升速
  alignDurationMs: 800,      // 对齐持续时间
  hfiHandoffRpm: 100,         // 100 rpm 进 HFI
  bemfHandoffRpm: 500,        // 500 rpm 切 BEMF
  fieldweakRpm: 5000,         // 5000 rpm 介入弱磁
};

// 压缩机 FOC 电流环典型整定：6kHz PWM、PI 带宽 ~500-800Hz
export const focDefault: FOCParams = {
  iqRef: 8,
  idRef: 0,
  kp: 1.2,
  ki: 180,
  thetaErrorDeg: 0,
  samplingDelaySamples: 1,
  voltageLimit: 180,    // ≈ 310/√3 = 179V SVPWM 线性区
  electricalFreq: 100,  // 1500rpm × 4 极对 / 60 = 100 Hz 典型工作点
  decoupleEnabled: false, // 默认关闭前馈，让学员看到耦合效应后手动开启对比
};

export const controlLoopDefault: ControlLoopParams = {
  currentKp: 2.2,
  currentKi: 28,
  speedKp: 0.08,
  speedKi: 0.8,
  positionKp: 3.5,
  positionKi: 0.2,
  positionKd: 0.08,
  loadTorque: 0.08,
  inertia: 0.00022,
  damping: 0.00008,
  targetSpeed: 1500,
  targetPosition: 360,
};

/** 实验预设（右侧"案例"卡片）。中文为默认文案，En 字段供 en-US 界面取用，缺失回退中文。 */
export interface ExperimentPreset {
  id: string;
  moduleId: ModuleId;
  title: string;
  description: string;
  /** 英文界面文案（消费方按 locale 取用） */
  titleEn?: string;
  descriptionEn?: string;
}

export const experimentPresets: ExperimentPreset[] = [
  { id: 'rotating-field', title: '三相正弦电流形成旋转磁场', moduleId: 'three-phase', description: '调节幅值和频率，观察合成磁场矢量的角速度与幅值。',
    titleEn: 'Three-phase sine currents build a rotating field', descriptionEn: 'Vary amplitude and frequency, then watch the angular speed and magnitude of the resulting field vector.' },
  { id: 'clarke-projection', title: 'Clarke 变换观察三相到 αβ', moduleId: 'clarke-transform', description: '切换三相平衡/不平衡，观察零序分量和 αβ 矢量。',
    titleEn: 'Clarke transform: from abc to αβ', descriptionEn: 'Toggle balanced/unbalanced three-phase and watch the zero-sequence component and the αβ vector.' },
  { id: 'park-dc', title: 'Park 变换观察交流量变直流量', moduleId: 'park-transform', description: '改变电角度，观察 Id/Iq 如何随旋转坐标变化。',
    titleEn: 'Park transform: AC quantities become DC', descriptionEn: 'Change the electrical angle and watch how Id/Iq follow the rotating frame.' },
  { id: 'pi-slow', title: 'PI 参数过小导致响应慢', moduleId: 'pid-control', description: '低 Kp/Ki 下电流上升慢，稳态误差消除也慢。',
    titleEn: 'Under-sized PI gains give a slow response', descriptionEn: 'With low Kp/Ki the current rises slowly and the steady-state error decays slowly too.' },
  { id: 'pi-oscillate', title: 'PI 参数过大导致振荡', moduleId: 'pid-control', description: '过高增益会放大采样延迟，形成超调和振荡。',
    titleEn: 'Over-sized PI gains cause oscillation', descriptionEn: 'Excessive gain amplifies sampling delay into overshoot and oscillation.' },
  { id: 'svpwm-sector', title: 'SVPWM 扇区切换', moduleId: 'svpwm', description: '旋转电压矢量，观察六个扇区依次点亮。',
    titleEn: 'SVPWM sector switching', descriptionEn: 'Rotate the voltage vector and watch the six sectors light up in turn.' },
  { id: 'vbus-drop', title: '母线电压降低导致电压饱和', moduleId: 'field-weakening', description: '降低 Udc 后，电压极限圆缩小，电流环失去余量。',
    titleEn: 'Bus voltage drop causes voltage saturation', descriptionEn: 'After lowering Udc the voltage-limit circle shrinks and the current loop loses headroom.' },
  { id: 'negative-id', title: 'Id 负值注入实现弱磁', moduleId: 'field-weakening', description: '给定负 Id，减小等效磁链以换取高速运行空间。',
    titleEn: 'Negative Id injection for field weakening', descriptionEn: 'Command a negative Id to reduce the effective flux and buy high-speed operating room.' },
  { id: 'speed-loop-osc', title: '速度环参数过大导致电机振荡', moduleId: 'control-loops', description: '外环过快会追着电流环跑，造成转速摆动。',
    titleEn: 'Over-gained speed loop makes the motor oscillate', descriptionEn: 'An outer loop that is too fast chases the current loop and makes the speed swing.' },
  { id: 'low-speed-sensorless', title: '低速无感估算失败', moduleId: 'sensorless-foc', description: '低速反电动势幅值小，角度估计受噪声影响明显。',
    titleEn: 'Low-speed sensorless estimation fails', descriptionEn: 'The low-speed back-EMF is tiny, so the angle estimate is clearly degraded by noise.' },
  { id: 'phase-order-error', title: '相序错误导致电机反转', moduleId: 'faults-debugging', description: '调换任意两相后旋转磁场方向反转。',
    titleEn: 'Wrong phase order reverses the motor', descriptionEn: 'Swap any two phases and the rotating field reverses direction.' },
  { id: 'current-offset', title: '电流采样偏置导致 Id/Iq 异常', moduleId: 'faults-debugging', description: '采样零点漂移会让 dq 电流出现固定偏差。',
    titleEn: 'Current sampling offset corrupts Id/Iq', descriptionEn: 'Sampling zero drift leaves a fixed bias on the dq currents.' },
  { id: 'fridge-low-load', title: '空调冬季制冷工况（低负载）', moduleId: 'refrigeration-bench', description: 'Te=12℃、Tc=38℃ 低压差，电机 Iq 需求小、COP 高。',
    titleEn: 'AC winter cooling condition (low load)', descriptionEn: 'Te=12°C, Tc=38°C with low pressure lift: small Iq demand and high COP.' },
  { id: 'fridge-high-load', title: '空调极端高温工况（重载）', moduleId: 'refrigeration-bench', description: 'Te=5℃、Tc=55℃ 大压差，排气温度逼近 110℃，COP 跌穿 2.5。',
    titleEn: 'AC extreme-heat condition (heavy load)', descriptionEn: 'Te=5°C, Tc=55°C with a large pressure lift: discharge temperature near 110°C and COP below 2.5.' },
  { id: 'fridge-frozen', title: '冷冻应用（R-134a 低蒸发）', moduleId: 'refrigeration-bench', description: 'Te=-25℃、Tc=40℃ 模拟商用冰柜：质量流量小但单位功大。',
    titleEn: 'Freezer application (R-134a low evaporation)', descriptionEn: 'Te=-25°C, Tc=40°C, mimicking a commercial freezer: small mass flow but high specific work.' },
];
