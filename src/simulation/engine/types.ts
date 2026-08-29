export type ModuleId =
  | 'motor-basics'
  | 'three-phase'
  | 'clarke-transform'
  | 'park-transform'
  | 'pid-control'
  | 'foc-flow'
  | 'svpwm'
  | 'inverter'
  | 'control-loops'
  | 'sensorless-foc'
  | 'field-weakening'
  | 'faults-debugging'
  | 'hfi-sensorless'
  | 'startup-statemachine'
  | 'apf-frontend'
  | 'refrigeration-bench'
  | 'assembly-workshop';

export interface ModuleMeta {
  id: ModuleId;
  title: string;
  shortTitle: string;
  subtitle: string;
  stage: string;
  accent: string;
  /** 英文界面文案（zh 走默认字段，en 经 localizeModuleMeta 取用，缺失回退中文） */
  titleEn?: string;
  shortTitleEn?: string;
  subtitleEn?: string;
}

export interface ThreePhaseParams {
  amplitude: number;
  frequency: number;
  phaseDeg: number;
  balance: number;
  harmonic: number;
  noise: number;
}

export interface MotorBasicsParams {
  /** 极对数（不是极数） */
  polePairs: number;
  /** 当前机械角度（°），驱动 3D 模型朝向 */
  mechanicalDeg: number;
  /** 当前机械转速（rpm），驱动 3D 旋转 */
  rpm: number;
  /** 额定相电流峰值（A） */
  ratedCurrent: number;
  /** 额定转速（rpm） */
  ratedSpeed: number;
  /** 相电阻 Rs（Ω）—— 同步给电流环 / 无感观测器 */
  rs: number;
  /** d 轴电感 Ld（mH）—— 同步给电流环 / 弱磁 */
  ldMh: number;
  /** q 轴电感 Lq（mH）—— 同步给电流环 / 弱磁 */
  lqMh: number;
  /** 永磁磁链 ψf（Wb）—— 同步给反电动势观测、转矩计算、弱磁 */
  flux: number;
  /** 转动惯量 J（kg·m²×1e-6 缩放）—— 同步给三闭环 */
  inertiaUm: number;
  /** 黏性摩擦 B（N·m·s/rad ×1e-6）—— 同步给三闭环 */
  dampingUm: number;
  /** 绕组接法：Y 星形 / Δ 三角形 */
  windingType?: 'Y' | 'Δ';
  /** 退磁程度（0-1），0=无退磁，1=完全退磁 */
  demagnetizationRatio?: number;
}

export interface ClarkeParams {
  ia: number;
  ib: number;
  ic: number;
  amplitude: number;
  phaseDeg: number;
  balanced: boolean;
}

export interface ParkParams {
  thetaDeg: number;
  iAlpha: number;
  iBeta: number;
  speedRpm: number;
  loadTorque: number;
  idRef: number;
  iqRef: number;
}

export interface PIDParams {
  kp: number;
  ki: number;
  kd: number;
  target: number;
  loadDisturbance: number;
  limit: number;
  sampleMs: number;
  antiWindup: boolean;
}

export interface SvpwmParams {
  uAlpha: number;
  uBeta: number;
  uDc: number;
  electricalDeg: number;
  modulation: number;
}

export interface InverterParams {
  uDc: number;
  pwmFrequency: number;
  deadTimeUs: number;
  dutyA: number;
  dutyB: number;
  dutyC: number;
  loadInductanceMh: number;
  modulationMode: 'svpwm' | 'spwm';
}

export interface SensorlessParams {
  speedRpm: number;
  ke: number;
  rs: number;
  lsMh: number;
  observerGain: number;
  pllKp: number;
  pllKi: number;
  noise: number;
  loadDisturbance: number;
}

export interface WeakFieldParams {
  uDc: number;
  targetRpm: number;
  id: number;
  iq: number;
  ldMh: number;
  lqMh: number;
  flux: number;
  currentLimit: number;
  voltageMargin: number;
}

export type FaultType =
  | 'over-current'
  | 'phase-loss'
  | 'current-offset'
  | 'phase-order'
  | 'encoder-angle'
  | 'speed-oscillation'
  | 'voltage-saturation'
  | 'startup-fail'
  | 'liquid-slugging'
  | 'locked-rotor'
  | 'dc-undervolt'
  | 'over-temp'
  | 'vibration'
  | 'oil-low';

export interface FaultParams {
  faultType: FaultType;
  severity: number;
}

export interface ControlLoopParams {
  currentKp: number;
  currentKi: number;
  speedKp: number;
  speedKi: number;
  positionKp: number;
  positionKi: number;
  positionKd: number;
  loadTorque: number;
  inertia: number;
  damping: number;
  targetSpeed: number;
  targetPosition: number;
}

export interface APFParams {
  /** 输入电网电压 RMS（V） */
  vAcRms: number;
  /** 电网频率（Hz，国内 50） */
  vAcFreqHz: number;
  /** 输出母线目标电压（V） */
  udcRef: number;
  /** Boost 电感 L（mH） */
  boostInductanceMh: number;
  /** Boost 输出电容 C（μF） */
  boostCapacitanceUf: number;
  /** 负载电流（A，等效压缩机 + 控制板） */
  loadCurrent: number;
  /** 电流环 PI Kp */
  currentKp: number;
  /** 电流环 PI Ki */
  currentKi: number;
  /** 电压环 PI Kp（外环） */
  voltageKp: number;
  /** 电压环 PI Ki */
  voltageKi: number;
}

export interface HFIParams {
  /** 高频注入电压幅值（V） */
  injectVoltage: number;
  /** 高频注入频率（Hz）—— 典型 500-1500Hz */
  injectFreqHz: number;
  /** 当前转子真实转速（rpm，仿真用） */
  speedRpm: number;
  /** 凸极比 Lq/Ld（IPM 越大越好，表贴式接近 1 → HFI 失效） */
  saliencyRatio: number;
  /** 解调低通截止频率（Hz） */
  demodCutoffHz: number;
  /** PLL 增益 */
  pllKp: number;
  pllKi: number;
  /** 测量噪声水平（A） */
  measNoise: number;
  /** 当前真实电角度（rad，仿真用） */
  trueThetaRad: number;
}

export type StartupState = 'idle' | 'precharge' | 'align' | 'open-loop' | 'hfi' | 'bemf' | 'fieldweak' | 'fault';

export interface StartupParams {
  /** 当前状态 */
  state: StartupState;
  /** 目标转速（rpm） */
  targetRpm: number;
  /** 当前转速（rpm，仿真给定值） */
  currentRpm: number;
  /** 加速斜坡（rpm/s）—— 反液击限制 */
  accelRampRpmS: number;
  /** 对齐持续时间（ms） */
  alignDurationMs: number;
  /** 负载转矩（N·m，影响 Iq 输出） */
  loadTorque?: number;
  /** 开环 V/f 切到 HFI 的阈值（rpm） */
  hfiHandoffRpm: number;
  /** HFI 切到 BEMF 的阈值（rpm） */
  bemfHandoffRpm: number;
  /** 弱磁介入阈值（rpm） */
  fieldweakRpm: number;
}

export type Refrigerant = 'R32' | 'R410A' | 'R134a';

export interface RefrigerationParams {
  refrigerant: Refrigerant;
  /** 蒸发饱和温度 (°C) — 决定吸气压力 P_s */
  Te: number;
  /** 冷凝饱和温度 (°C) — 决定排气压力 P_d */
  Tc: number;
  /** 吸气过热度 (K) */
  superheatK: number;
  /** 出冷凝器过冷度 (K) */
  subcoolK: number;
  /** 室外环境温度 (°C) — 影响冷凝器换热，决定可达 Tc 下限 */
  ambientOutdoorC: number;
  /** 室内环境温度 (°C) — 影响蒸发器换热，决定可达 Te 上限 */
  ambientIndoorC: number;
  /** 膨胀阀开度 0..1 */
  eevOpening: number;
  /** 压缩机排量 (cc/rev) — R-32 1.5HP 空调约 9-11 cc */
  displacementCc: number;
  /** 压缩机余隙比 0.03-0.10 */
  clearanceRatio: number;
  /** 等熵效率 0.5-0.9 */
  isentropicEff: number;
  /** 是否把循环算出的负载扭矩反馈给 FOC 闭环 */
  closedLoop: boolean;
}

export interface FOCParams {
  /** Iq 阶跃指令值（A），t=0 后维持在此 */
  iqRef: number;
  /** Id 指令值（A），SPM 一般为 0；负值代表弱磁注入 */
  idRef: number;
  /** 电流环 PI 比例增益 */
  kp: number;
  /** 电流环 PI 积分增益 */
  ki: number;
  /** 角度测量误差（度），演示坐标系不对齐造成的 dq 串扰 */
  thetaErrorDeg: number;
  /** 采样到 PWM 输出的延迟（PWM 周期数） */
  samplingDelaySamples: number;
  /** 输出电压限幅（V），近似 SVPWM 线性区上限 */
  voltageLimit: number;
  /** 电频率（Hz）—— 用于在仿真中提供 ω 项以观察 BackEMF 抗扰能力 */
  electricalFreq: number;
  /** 启用 dq 解耦前馈：vd += -ω·Lq·iq, vq += ω·Ld·id + ω·ψf */
  decoupleEnabled?: boolean;
}

export interface SimulationSnapshot {
  activeModule: ModuleId;
  time: number;
  running: boolean;
  mode: 'teach' | 'lab';
  fullScreen: boolean;
}
