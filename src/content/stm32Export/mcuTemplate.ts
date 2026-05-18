/**
 * MCU 系列模板接口 —— 抽象不同 STM32 家族在 HAL / 寄存器 / 时钟上的差异。
 * 新增 STM32L4 / STM32C0 等仅需提供一份 McuFamilyTemplate 即可。
 */

import type { McuFamily } from './types';
import { stm32g4Template } from './stm32g4Templates';
import { stm32f4Template } from './stm32f4Templates';
import { stm32h7Template } from './stm32h7Templates';

export interface McuFamilyTemplate {
  family: McuFamily;
  /** 一句话芯片定位 */
  chipBlurb: string;
  /** main.c 顶部 #include 行 */
  halHeaders: string[];
  /** SystemClock_Config() 完整实现 */
  systemClockConfig: string;
  /** ADC 注入配置（同步 TIM1 TRGO） */
  adcInit: string;
  /** TIM1 PWM 启动序列 */
  tim1Init: string;
  /** 快环 ISR 函数名 */
  isrName: string;
  /** 写三相 CCR 的代码 */
  ccrWrite: string;
  /** ADC 读相电流表达式 */
  adcRead: {
    iaExpr: string;
    ibExpr: string;
  };
  /** CubeMX 使用提示 */
  cubeMxNote: string;
  /** 烧录工具 */
  flashTool: string;
  /** CMake / Makefile 编译标志 */
  cmakeMcuFlags: string;
  cmakeLinkerScript: string;
  cmakeHalLib: string;
}

export const MCU_TEMPLATES: Record<McuFamily, McuFamilyTemplate> = {
  STM32G4: stm32g4Template,
  STM32F4: stm32f4Template,
  STM32H7: stm32h7Template,
};

/** 启发式：根据 inverter MCU partNo 字符串猜默认 family。 */
export function guessMcuFamily(mcuPartNo: string): McuFamily {
  const upper = mcuPartNo.toUpperCase();
  if (upper.includes('STM32H7') || /STM32H\d/.test(upper)) return 'STM32H7';
  if (upper.includes('STM32F4') || /STM32F4\d/.test(upper)) return 'STM32F4';
  // F1 / F0 / F3 现在很少用于电机，统一回 G4（最合适的兜底）
  return 'STM32G4';
}
