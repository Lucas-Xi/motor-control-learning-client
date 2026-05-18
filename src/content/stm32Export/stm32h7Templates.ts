/**
 * STM32H7 系列模板（Cortex-M7 + DP-FPU @ 480MHz）。
 *
 * H7 是 ST 旗舰：双精度 FPU、L1 cache、高带宽 ADC（3.6MSPS）。
 * 适合多电机协调、高速 FOC（>32kHz）或额外跑算法（图像 / 通信协议栈）。
 * 缺点：cache 带来时序不确定性，电机控制中断里要小心 invalidate。
 */

import type { McuFamilyTemplate } from './mcuTemplate';

export const stm32h7Template: McuFamilyTemplate = {
  family: 'STM32H7',
  chipBlurb: 'STM32H7 Cortex-M7 + 双精度 FPU @ 480MHz；L1 cache 32KB；适合多电机或叠加重算法的高端方案。',
  halHeaders: [
    '#include "stm32h7xx_hal.h"',
    '#include "stm32h7xx_ll_tim.h"',
    '#include "stm32h7xx_ll_adc.h"',
  ],
  systemClockConfig: `static void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    /* HSE 25MHz → PLL1 → 480MHz */
    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE0);
    while (!__HAL_PWR_GET_FLAG(PWR_FLAG_VOSRDY)) {}

    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    RCC_OscInitStruct.HSEState = RCC_HSE_ON;
    RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
    RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    RCC_OscInitStruct.PLL.PLLM = 5;        /* 25 / 5 = 5 MHz */
    RCC_OscInitStruct.PLL.PLLN = 192;      /* 5 * 192 = 960 MHz VCO */
    RCC_OscInitStruct.PLL.PLLP = 2;        /* 960 / 2 = 480 MHz SYSCLK */
    RCC_OscInitStruct.PLL.PLLQ = 4;
    RCC_OscInitStruct.PLL.PLLR = 2;
    HAL_RCC_OscConfig(&RCC_OscInitStruct);

    RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
                                  RCC_CLOCKTYPE_D1PCLK1 | RCC_CLOCKTYPE_PCLK1 |
                                  RCC_CLOCKTYPE_PCLK2  | RCC_CLOCKTYPE_D3PCLK1;
    RCC_ClkInitStruct.SYSCLKSource    = RCC_SYSCLKSOURCE_PLLCLK;
    RCC_ClkInitStruct.SYSCLKDivider   = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.AHBCLKDivider   = RCC_HCLK_DIV2;
    RCC_ClkInitStruct.APB3CLKDivider  = RCC_APB3_DIV2;
    RCC_ClkInitStruct.APB1CLKDivider  = RCC_APB1_DIV2;
    RCC_ClkInitStruct.APB2CLKDivider  = RCC_APB2_DIV2;
    RCC_ClkInitStruct.APB4CLKDivider  = RCC_APB4_DIV2;
    HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_4);
}`,
  adcInit: `    /* ADC1 注入序列 = TIM1 TRGO 触发；H7 ADC 3.6MSPS 单端模式 */
    ADC1->CFGR &= ~ADC_CFGR_CONT;
    /* JEXTSEL = TIM1_TRGO（H7 上为 idx 0x0 / 0x1 视具体型号；以 CubeMX 生成为准） */
    HAL_ADCEx_InjectedStart_IT(&hadc1);`,
  tim1Init: `    /* TIM1 中心对齐 + 互补输出 + 死区；APB2 频率 = SYSCLK/4，TIM 时钟 ×2。
     * 重要：H7 ICACHE / DCACHE 开启时，进 ISR 不要 SCB_InvalidateDCache_by_Addr 区段太长。
     */
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);
    HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1);
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_2);
    HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_2);
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_3);
    HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_3);`,
  isrName: 'ADC_IRQHandler',
  ccrWrite: `    /* 写比较寄存器（CCR ∈ [0, ARR]，中心对齐） */
    TIM1->CCR1 = (uint32_t)(dutyA * TIM1->ARR);
    TIM1->CCR2 = (uint32_t)(dutyB * TIM1->ARR);
    TIM1->CCR3 = (uint32_t)(dutyC * TIM1->ARR);`,
  adcRead: {
    iaExpr: 'HAL_ADCEx_InjectedGetValue(&hadc1, ADC_INJECTED_RANK_1)',
    ibExpr: 'HAL_ADCEx_InjectedGetValue(&hadc1, ADC_INJECTED_RANK_2)',
  },
  cubeMxNote: '推荐用 STM32CubeMX 选择 STM32H743 / H723 系列；务必启用 ICACHE / DCACHE 并在 ADC DMA 缓冲区前后用 SCB_InvalidateDCache_by_Addr。',
  flashTool: 'STM32CubeProgrammer (ST-LINK V3 / J-Link Plus)',
  cmakeMcuFlags: '-mcpu=cortex-m7 -mthumb -mfpu=fpv5-d16 -mfloat-abi=hard',
  cmakeLinkerScript: 'STM32H743ZITx_FLASH.ld',
  cmakeHalLib: 'CMSIS_DEVICE=STM32H743xx HAL_DRIVER=stm32h7xx',
};
