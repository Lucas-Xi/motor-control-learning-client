import type {
  FOCParams,
  InverterParams,
  MotorBasicsParams,
  RefrigerationParams,
  StartupParams,
  SvpwmParams,
  WeakFieldParams,
  Refrigerant,
} from '../simulation/engine/types';

/**
 * 压缩机机型 + 变频器平台库
 *
 * 数据精度声明：型号、应用场景与功率等级取自厂商常见型录与公开资料；
 * 电机绕组参数（Ld、Lq、ψf、Rs）和典型工况采用工程上"合理范围"的估值，
 * 用于让仿真接近真机感受，不替代厂商正式 datasheet。
 *
 * 这里的"变频器平台"包含 IPM/IGBT 功率模块 + 主控 MCU 两部分；
 * 是常见组合参考，并非厂商唯一指定方案。
 */

export interface CompressorSpec {
  /** 压缩机厂商 */
  brand: string;
  /** 型号（真实型录上可查的型号号） */
  partNo: string;
  /** 结构类型 */
  type: '滚动转子' | '双转子' | '涡旋' | '往复活塞';
  /** 标称马力 */
  hp: number;
  /** 标称制冷量（W）—— ARI / GB 标准工况下 */
  coolingW: number;
  /** 适用冷媒 */
  refrigerant: Refrigerant;
  /** 排量 (cc/rev) */
  displacementCc: number;
  /** 极对数 */
  polePairs: number;
  /** 额定相电流峰值（A） */
  ratedCurrentA: number;
  /** 最高机械转速（rpm） */
  maxRpm: number;
  /** d 轴电感（mH） */
  ldMh: number;
  /** q 轴电感（mH） */
  lqMh: number;
  /** 永磁磁链（Wb） */
  flux: number;
  /** 单相相电阻（mΩ） */
  rsMohm: number;
  /** 备注（结构 / 制冷剂选择理由 / 典型整机用途） */
  notes?: string;
}

export interface InverterPlatform {
  /** 功率模块厂商 + 型号 */
  ipmBrand: string;
  ipmPartNo: string;
  /** 模块结构（IPM 集成模块 / 分立 IGBT+驱动 / GaN 集成） */
  topology: 'IPM' | 'DIPIPM' | '分立 IGBT + 驱动 IC' | 'GaN 集成';
  /** 主控 MCU */
  mcuPartNo: string;
  /** 额定相电流（A） */
  ratedCurrentA: number;
  /** 额定母线电压（V） */
  ratedBusV: number;
  /** 推荐 PWM 载频（Hz） */
  pwmFreqHz: number;
  /** 推荐死区（μs） */
  deadTimeUs: number;
  /** 备注（典型驱动 IC、PFC 是否集成等） */
  notes?: string;
}

export interface CompressorBundle {
  id: string;
  name: string;
  application: string;
  compressor: CompressorSpec;
  inverter: InverterPlatform;
  typicalCondition: {
    Te: number;
    Tc: number;
    superheatK: number;
    subcoolK: number;
    ambientIndoorC: number;
    ambientOutdoorC: number;
  };
  /** 各模块的 patch —— Apply 时一次性批量写入 */
  patch: {
    motorBasics: Partial<MotorBasicsParams>;
    refrigeration: Partial<RefrigerationParams>;
    inverter: Partial<InverterParams>;
    svpwm: Partial<SvpwmParams>;
    weakField: Partial<WeakFieldParams>;
    startup: Partial<StartupParams>;
    foc: Partial<FOCParams>;
  };
}

/** 5 个真机型号 + 变频器平台搭配，覆盖入门家用 1HP → 高端家用 2HP + 冰箱场景 */
export const compressorBundles: CompressorBundle[] = [
  // —— 1 ———————————————————————————————————————————————————————————
  {
    id: 'gmcc-1hp-r32-onsemi',
    name: '美芝 GMCC ATQ425DUB + Onsemi NFAM5065 + STM32G4',
    application: '家用空调外机 1HP，美的/格力/海尔常见入门搭配',
    compressor: {
      brand: 'GMCC（美芝）',
      partNo: 'ATQ425D1UMT',
      type: '滚动转子',
      hp: 1,
      coolingW: 2650,
      refrigerant: 'R32',
      displacementCc: 7.0,
      polePairs: 4,
      ratedCurrentA: 5.5,
      maxRpm: 9000,
      ldMh: 5.0,
      lqMh: 6.5,
      flux: 0.060,
      rsMohm: 700,
      notes: '8 极 IPM 转子，弱凸极。R32 制冷剂 GWP=675 远低于 R410A。',
    },
    inverter: {
      ipmBrand: 'Onsemi',
      ipmPartNo: 'NFAM5065L4B',
      topology: 'IPM',
      mcuPartNo: 'STM32G431RBT6',
      ratedCurrentA: 15,
      ratedBusV: 600,
      pwmFreqHz: 6000,
      deadTimeUs: 2.0,
      notes: 'CIPOS Mini 系列，集成栅极驱动 + 自举二极管 + 过流过温保护。Arm Cortex-M4 170MHz + 4 路 ADC。',
    },
    typicalCondition: { Te: 7.2, Tc: 45, superheatK: 5, subcoolK: 3, ambientIndoorC: 27, ambientOutdoorC: 35 },
    patch: {
      motorBasics: { polePairs: 4, ratedCurrent: 5.5, ratedSpeed: 5400, rs: 0.7, ldMh: 5.0, lqMh: 6.5, flux: 0.060 },
      refrigeration: { refrigerant: 'R32', Te: 7.2, Tc: 45, superheatK: 5, subcoolK: 3, ambientIndoorC: 27, ambientOutdoorC: 35, displacementCc: 7.0, clearanceRatio: 0.05, isentropicEff: 0.72 },
      inverter: { pwmFrequency: 6000, deadTimeUs: 2.0, uDc: 310, modulationMode: 'svpwm' },
      svpwm: { uDc: 310 },
      weakField: { uDc: 310, currentLimit: 5.5, flux: 0.060, ldMh: 5.0, lqMh: 6.5 },
      startup: { targetRpm: 4500, accelRampRpmS: 800, alignDurationMs: 300, hfiHandoffRpm: 200, bemfHandoffRpm: 600, fieldweakRpm: 6500 },
      foc: { kp: 6, ki: 800, voltageLimit: 155 },
    },
  },

  // —— 2 ———————————————————————————————————————————————————————————
  {
    id: 'highly-15hp-r32-sanken',
    name: '海立 BSA325CV + Sanken SCM1241MF + Renesas RX26T',
    application: '家用空调外机 1.5HP，Midea / Haier / TCL 主流变频机配置',
    compressor: {
      brand: '海立（Highly / 上海日立）',
      partNo: 'BSA325CV',
      type: '滚动转子',
      hp: 1.5,
      coolingW: 3550,
      refrigerant: 'R32',
      displacementCc: 9.5,
      polePairs: 3,
      ratedCurrentA: 7.0,
      maxRpm: 8500,
      ldMh: 4.0,
      lqMh: 6.0,
      flux: 0.070,
      rsMohm: 500,
      notes: '日立技术授权 6 极 IPM 电机，凸极比 1.5。',
    },
    inverter: {
      ipmBrand: 'Sanken',
      ipmPartNo: 'SCM1241MF',
      topology: 'IPM',
      mcuPartNo: 'Renesas RX26T (R5F526T)',
      ratedCurrentA: 15,
      ratedBusV: 600,
      pwmFreqHz: 5000,
      deadTimeUs: 2.5,
      notes: 'Sanken 全桥 IPM，集成 HVIC + LVIC 驱动 + 比较器过流。RX26T 是日系空调主流 MCU，硬件 FOC 加速器。',
    },
    typicalCondition: { Te: 7.2, Tc: 45, superheatK: 5, subcoolK: 3, ambientIndoorC: 27, ambientOutdoorC: 35 },
    patch: {
      motorBasics: { polePairs: 3, ratedCurrent: 7.0, ratedSpeed: 5400, rs: 0.5, ldMh: 4.0, lqMh: 6.0, flux: 0.070 },
      refrigeration: { refrigerant: 'R32', Te: 7.2, Tc: 45, superheatK: 5, subcoolK: 3, ambientIndoorC: 27, ambientOutdoorC: 35, displacementCc: 9.5, clearanceRatio: 0.05, isentropicEff: 0.75 },
      inverter: { pwmFrequency: 5000, deadTimeUs: 2.5, uDc: 310, modulationMode: 'svpwm' },
      svpwm: { uDc: 310 },
      weakField: { uDc: 310, currentLimit: 7.0, flux: 0.070, ldMh: 4.0, lqMh: 6.0 },
      startup: { targetRpm: 5000, accelRampRpmS: 1000, alignDurationMs: 250, hfiHandoffRpm: 180, bemfHandoffRpm: 500, fieldweakRpm: 6000 },
      foc: { kp: 8, ki: 1000, voltageLimit: 155 },
    },
  },

  // —— 3 ———————————————————————————————————————————————————————————
  {
    id: 'panasonic-15hp-r32-mip',
    name: 'Panasonic 5RS102XAA21 + Panasonic MIP6P011W + Renesas RX26T',
    application: '家用空调 1.5HP 高端，日系整机厂常用方案（松下 / 大金分体机）',
    compressor: {
      brand: 'Panasonic（松下）',
      partNo: '5RS102XAA21',
      type: '滚动转子',
      hp: 1.5,
      coolingW: 3600,
      refrigerant: 'R32',
      displacementCc: 10.2,
      polePairs: 3,
      ratedCurrentA: 7.5,
      maxRpm: 8400,
      ldMh: 3.5,
      lqMh: 5.5,
      flux: 0.075,
      rsMohm: 450,
      notes: '稀土钕铁硼 + 双层 V 字埋入磁体，效率达 IE5 级别。',
    },
    inverter: {
      ipmBrand: 'Panasonic',
      ipmPartNo: 'MIP6P011W',
      topology: 'IPM',
      mcuPartNo: 'Renesas RX26T',
      ratedCurrentA: 10,
      ratedBusV: 600,
      pwmFreqHz: 6000,
      deadTimeUs: 2.0,
      notes: '松下自家 IPM 系列，与压缩机配套已做静噪 + 损耗优化。',
    },
    typicalCondition: { Te: 7.2, Tc: 45, superheatK: 5, subcoolK: 3, ambientIndoorC: 27, ambientOutdoorC: 35 },
    patch: {
      motorBasics: { polePairs: 3, ratedCurrent: 7.5, ratedSpeed: 5400, rs: 0.45, ldMh: 3.5, lqMh: 5.5, flux: 0.075 },
      refrigeration: { refrigerant: 'R32', Te: 7.2, Tc: 45, superheatK: 5, subcoolK: 3, ambientIndoorC: 27, ambientOutdoorC: 35, displacementCc: 10.2, clearanceRatio: 0.04, isentropicEff: 0.78 },
      inverter: { pwmFrequency: 6000, deadTimeUs: 2.0, uDc: 310, modulationMode: 'svpwm' },
      svpwm: { uDc: 310 },
      weakField: { uDc: 310, currentLimit: 7.5, flux: 0.075, ldMh: 3.5, lqMh: 5.5 },
      startup: { targetRpm: 5200, accelRampRpmS: 1200, alignDurationMs: 200, hfiHandoffRpm: 150, bemfHandoffRpm: 450, fieldweakRpm: 6200 },
      foc: { kp: 9, ki: 1200, voltageLimit: 155 },
    },
  },

  // —— 4 ———————————————————————————————————————————————————————————
  {
    id: 'mitsubishi-2hp-r410-dipipm',
    name: 'Mitsubishi RM5505EAD-L + Mitsubishi DIPIPM PSS15S92F6 + Renesas RX72T',
    application: '高端家用 / 准商用 2HP，三菱原装外机配置',
    compressor: {
      brand: 'Mitsubishi Electric（三菱电机）',
      partNo: 'RM5505EAD-L',
      type: '双转子',
      hp: 2,
      coolingW: 5300,
      refrigerant: 'R410A',
      displacementCc: 14.0,
      polePairs: 4,
      ratedCurrentA: 9.0,
      maxRpm: 7800,
      ldMh: 3.0,
      lqMh: 4.5,
      flux: 0.065,
      rsMohm: 380,
      notes: '双滚动转子结构降振降噪，R410A 压比较高需要更强结构。',
    },
    inverter: {
      ipmBrand: 'Mitsubishi Electric',
      ipmPartNo: 'PSS15S92F6（DIPIPM）',
      topology: 'DIPIPM',
      mcuPartNo: 'Renesas RX72T',
      ratedCurrentA: 15,
      ratedBusV: 600,
      pwmFreqHz: 4500,
      deadTimeUs: 3.0,
      notes: '三菱 DIPIPM 系列，HVIC 引线键合工艺。死区 3μs 偏大，需在 STM32 死区补偿模块对应展开。',
    },
    typicalCondition: { Te: 7.2, Tc: 48, superheatK: 5, subcoolK: 4, ambientIndoorC: 27, ambientOutdoorC: 35 },
    patch: {
      motorBasics: { polePairs: 4, ratedCurrent: 9.0, ratedSpeed: 4200, rs: 0.38, ldMh: 3.0, lqMh: 4.5, flux: 0.065 },
      refrigeration: { refrigerant: 'R410A', Te: 7.2, Tc: 48, superheatK: 5, subcoolK: 4, ambientIndoorC: 27, ambientOutdoorC: 35, displacementCc: 14.0, clearanceRatio: 0.05, isentropicEff: 0.78 },
      inverter: { pwmFrequency: 4500, deadTimeUs: 3.0, uDc: 310, modulationMode: 'svpwm' },
      svpwm: { uDc: 310 },
      weakField: { uDc: 310, currentLimit: 9.0, flux: 0.065, ldMh: 3.0, lqMh: 4.5 },
      startup: { targetRpm: 4800, accelRampRpmS: 700, alignDurationMs: 350, hfiHandoffRpm: 220, bemfHandoffRpm: 650, fieldweakRpm: 5500 },
      foc: { kp: 7, ki: 900, voltageLimit: 155 },
    },
  },

  // —— 5 ———————————————————————————————————————————————————————————
  {
    id: 'embraco-fridge-r134a-st',
    name: 'Embraco EMX80HEP + ST STGIPN3H60A + STM32F103',
    application: '冰箱压缩机 1/8HP，Aspera/Embraco 是 Whirlpool/Haier 冰箱标配',
    compressor: {
      brand: 'Embraco / Aspera',
      partNo: 'EMX80HEP',
      type: '往复活塞',
      hp: 0.125,
      coolingW: 200,
      refrigerant: 'R134a',
      displacementCc: 5.6,
      polePairs: 2,
      ratedCurrentA: 1.2,
      maxRpm: 4500,
      ldMh: 30.0,
      lqMh: 35.0,
      flux: 0.035,
      rsMohm: 4500,
      notes: '单缸活塞式，电机尺寸小、电感大、相电阻高。变频版本对低速 HFI 启动尤其敏感。',
    },
    inverter: {
      ipmBrand: 'STMicroelectronics',
      ipmPartNo: 'STGIPN3H60A',
      topology: 'IPM',
      mcuPartNo: 'STM32F103C8T6',
      ratedCurrentA: 3,
      ratedBusV: 600,
      pwmFreqHz: 16000,
      deadTimeUs: 1.0,
      notes: '小功率 SLLIMM-nano 系列，整流 + 逆变一体。冰箱场景对噪音敏感，PWM 频率拉到 16kHz 避免可闻啸叫。',
    },
    typicalCondition: { Te: -23, Tc: 38, superheatK: 5, subcoolK: 3, ambientIndoorC: 4, ambientOutdoorC: 25 },
    patch: {
      motorBasics: { polePairs: 2, ratedCurrent: 1.2, ratedSpeed: 2700, rs: 4.5, ldMh: 30.0, lqMh: 35.0, flux: 0.035 },
      refrigeration: { refrigerant: 'R134a', Te: -23, Tc: 38, superheatK: 5, subcoolK: 3, ambientIndoorC: 4, ambientOutdoorC: 25, displacementCc: 5.6, clearanceRatio: 0.06, isentropicEff: 0.65 },
      inverter: { pwmFrequency: 16000, deadTimeUs: 1.0, uDc: 310, modulationMode: 'svpwm' },
      svpwm: { uDc: 310 },
      weakField: { uDc: 310, currentLimit: 1.2, flux: 0.035, ldMh: 30.0, lqMh: 35.0 },
      startup: { targetRpm: 2800, accelRampRpmS: 200, alignDurationMs: 500, hfiHandoffRpm: 100, bemfHandoffRpm: 300, fieldweakRpm: 3500 },
      foc: { kp: 3, ki: 400, voltageLimit: 155 },
    },
  },
];

export function getBundleById(id: string): CompressorBundle | undefined {
  return compressorBundles.find((b) => b.id === id);
}
