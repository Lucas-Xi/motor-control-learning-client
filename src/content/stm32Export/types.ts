/**
 * STM32 工程导出器类型定义。
 *
 * 与 src/content/assemblyExport.ts（旧版单文件 .c 导出）解耦：
 * 这里输出一个多文件工程骨架（main.c + foc_isr.c + motor_param.h + ...），
 * 学员可以直接复制到 STM32CubeIDE / Keil 工程里。
 */

import type {
  ControlLoopParams,
  FaultType,
  FOCParams,
  InverterParams,
  MotorBasicsParams,
  PIDParams,
  StartupParams,
  SvpwmParams,
} from '../../simulation/engine/types';
import type { AssemblySnapshot } from '../../store/assemblyProgressStore';

/** 支持的 MCU 系列 —— 决定 HAL 头文件、时钟初始化、TIM/ADC 寄存器名 */
export type McuFamily = 'STM32G4' | 'STM32F4' | 'STM32H7';

/** 工程导出文件单元 */
export interface ExportFile {
  /** 相对路径（用 POSIX 正斜杠；不允许 .. / 绝对路径 / 非 ASCII） */
  path: string;
  /** 文件文本内容 */
  content: string;
  /** UI 显示用的中文短标题 */
  label: string;
  /** UI 显示用的一句话作用描述 */
  purpose: string;
  /** 文件类别，方便 UI 按类分组 */
  category: 'source' | 'header' | 'build' | 'doc';
}

/**
 * 仿真快照 —— 把 store 当前所有用得上的参数压成一个纯数据对象。
 * 不直接依赖 zustand store，让 generator 可测试、可在 worker 里跑。
 */
export interface SimulationSnapshot {
  motorBasics: MotorBasicsParams;
  pid: PIDParams;
  foc: FOCParams;
  svpwm: SvpwmParams;
  inverter: InverterParams;
  controlLoop: ControlLoopParams;
  startup: StartupParams;
}

/** 14 种 FaultType 的英文 enum 名 + 中文注释。和 types.ts::FaultType 严格对齐。 */
export const FAULT_ENUM_LIST: Array<{ type: FaultType; cName: string; comment: string }> = [
  { type: 'over-current', cName: 'FAULT_OVER_CURRENT', comment: '过流（硬件 OCP / 软件门限）' },
  { type: 'phase-loss', cName: 'FAULT_PHASE_LOSS', comment: '缺相（任一相电流接近 0）' },
  { type: 'current-offset', cName: 'FAULT_CURRENT_OFFSET', comment: '电流采样零漂（ADC 校准失效）' },
  { type: 'phase-order', cName: 'FAULT_PHASE_ORDER', comment: '相序错误（接线 U/V/W 调换）' },
  { type: 'encoder-angle', cName: 'FAULT_ENCODER_ANGLE', comment: '编码器角度异常（跳变 / 丢脉冲）' },
  { type: 'speed-oscillation', cName: 'FAULT_SPEED_OSC', comment: '转速振荡（外环增益过大）' },
  { type: 'voltage-saturation', cName: 'FAULT_VOLT_SAT', comment: '电压饱和（弱磁未介入）' },
  { type: 'startup-fail', cName: 'FAULT_STARTUP_FAIL', comment: '启动失败（HFI/BEMF 未锁定）' },
  { type: 'liquid-slugging', cName: 'FAULT_LIQUID_SLUGGING', comment: '液击（吸气带液撞阀片）' },
  { type: 'locked-rotor', cName: 'FAULT_LOCKED_ROTOR', comment: '堵转（速度=0 但 Iq 持续高）' },
  { type: 'dc-undervolt', cName: 'FAULT_DC_UNDERVOLT', comment: '母线欠压（PFC 失效 / 电网跌落）' },
  { type: 'over-temp', cName: 'FAULT_OVER_TEMP', comment: '过温（排气 / 模块结温超限）' },
  { type: 'vibration', cName: 'FAULT_VIBRATION', comment: '异常振动（机械故障 / 共振）' },
  { type: 'oil-low', cName: 'FAULT_OIL_LOW', comment: '缺油（润滑系统报警）' },
];

/** 启动状态机 7 状态 —— 与 types.ts::StartupState 对齐 */
export const STARTUP_STATE_LIST: Array<{ cName: string; comment: string }> = [
  { cName: 'STARTUP_IDLE', comment: '空闲：等待启动命令' },
  { cName: 'STARTUP_PRECHARGE', comment: '母线预充：抑制电容冲击电流' },
  { cName: 'STARTUP_ALIGN', comment: '对齐：注入 Id 把转子吸到 0°' },
  { cName: 'STARTUP_OPEN_LOOP', comment: '开环 V/f：爬到 BEMF/HFI 可观测速度' },
  { cName: 'STARTUP_HFI', comment: 'HFI 凸极注入：零速-低速段闭环定角度' },
  { cName: 'STARTUP_BEMF', comment: 'BEMF 观测：中高速反电动势锁角度' },
  { cName: 'STARTUP_FIELDWEAK', comment: '弱磁：注入负 Id 扩展恒功率区' },
];

/** Slot 摘要 —— 不直接依赖 AssemblyWorkshop 内部 indices，传入解析后的对象 */
export interface ProjectSlots {
  /** 选型 ID（用于文件名 / 注释，不影响生成内容） */
  slotIds: AssemblySnapshot['slotIds'];
  /** 压缩机品牌+型号 */
  compressorLabel: string;
  /** 控制策略名 */
  strategyLabel: string;
  /** 工况名 */
  loadLabel: string;
  /** PFC 平台名 */
  pfcLabel: string;
  /** 液气分离器名 */
  separatorLabel: string;
  /** 逆变器主控 MCU partNo（决定 mcuFamily 默认值） */
  inverterMcuPartNo: string;
}

/** 生成器输入 */
export interface GeneratorInput {
  snapshot: SimulationSnapshot;
  slots: ProjectSlots;
  mcuFamily: McuFamily;
  /** 可选：生成时间戳（测试时注入固定值） */
  generatedAt?: string;
}

/** 参数对照表项 —— UI 预览用 */
export interface ParamMapping {
  storeKey: string;        // 例如 'motorBasics.polePairs'
  storeValue: string | number;
  cDefine: string;         // 例如 'MOTOR_POLE_PAIRS'
  cValue: string;          // 例如 '4' 或 '0.4200f'
  unit?: string;
}
