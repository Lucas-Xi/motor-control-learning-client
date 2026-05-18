/**
 * STM32G4 系列模板（Cortex-M4 + FPU @ 170MHz）。
 *
 * G4 是 ST 主推的电机控制 MCU：自带 HRTIM 高分辨率 PWM、ADC 5MSPS、
 * CORDIC / FMAC 硬件加速 sin/cos / 滤波。压缩机变频器近年首选。
 */

import type { McuFamilyTemplate } from './mcuTemplate';

export const stm32g4Template: McuFamilyTemplate = {
  family: 'STM32G4',
  chipBlurb: 'STM32G4 Cortex-M4 + FPU @ 170MHz；CORDIC 硬件 sin/cos；HRTIM 184ps 高分辨率 PWM。',
  halHeaders: [
    '#include "stm32g4xx_hal.h"',
    '#include "stm32g4xx_ll_tim.h"',
    '#include "stm32g4xx_ll_adc.h"',
  ],
  // SystemClock_Config：HSE 24MHz → PLL → 170MHz
  systemClockConfig: `static void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    /* HSE 24MHz → PLL R = 170MHz */
    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    RCC_OscInitStruct.HSEState = RCC_HSE_ON;
    RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
    RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    RCC_OscInitStruct.PLL.PLLM = RCC_PLLM_DIV6;     /* 24 / 6 = 4 MHz */
    RCC_OscInitStruct.PLL.PLLN = 85;                /* 4 * 85 = 340 MHz */
    RCC_OscInitStruct.PLL.PLLR = RCC_PLLR_DIV2;     /* 340 / 2 = 170 MHz */
    HAL_RCC_OscConfig(&RCC_OscInitStruct);

    RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
                                  RCC_CLOCKTYPE_PCLK1  | RCC_CLOCKTYPE_PCLK2;
    RCC_ClkInitStruct.SYSCLKSource   = RCC_SYSCLKSOURCE_PLLCLK;
    RCC_ClkInitStruct.AHBCLKDivider  = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
    RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;
    HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_4);
}`,
  // ADC injected by TIM1 TRGO（中心对齐谷值采样）
  adcInit: `    /* ADC1 注入序列 = TIM1 TRGO 触发：PWM 中心对齐谷值采样 */
    ADC1->CFGR &= ~ADC_CFGR_CONT;
    ADC1->JSQR  = (1 << ADC_JSQR_JL_Pos)        /* 2 通道 */
                | (9 << ADC_JSQR_JEXTSEL_Pos)   /* TIM1_TRGO */
                | (1 << ADC_JSQR_JEXTEN_Pos);   /* 上升沿 */
    HAL_ADCEx_InjectedStart_IT(&hadc1);`,
  // TIM1 中心对齐 + 死区
  tim1Init: `    /* TIM1 中心对齐 + 互补输出 + 死区。
     * ARR = 170MHz / (2 * PWM_FREQ_HZ) - 1（center-aligned 计两次）
     * BDTR.DTG 按死区时间换算（参考 RM0440 27.4.18 章节）
     */
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);
    HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1);
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_2);
    HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_2);
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_3);
    HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_3);`,
  isrName: 'ADC1_2_IRQHandler',
  ccrWrite: `    /* 写比较寄存器（CCR ∈ [0, ARR]，中心对齐） */
    TIM1->CCR1 = (uint32_t)(dutyA * TIM1->ARR);
    TIM1->CCR2 = (uint32_t)(dutyB * TIM1->ARR);
    TIM1->CCR3 = (uint32_t)(dutyC * TIM1->ARR);`,
  adcRead: {
    iaExpr: 'HAL_ADCEx_InjectedGetValue(&hadc1, ADC_INJECTED_RANK_1)',
    ibExpr: 'HAL_ADCEx_InjectedGetValue(&hadc1, ADC_INJECTED_RANK_2)',
  },
  cubeMxNote: '推荐用 STM32CubeMX 生成时钟 / GPIO / DMA / NVIC 配置，再把本工程的 foc_isr.c / motor_param.h 拖入 Core/Src 与 Core/Inc。',
  flashTool: 'STM32CubeProgrammer (ST-LINK V3 / J-Link)',
  cmakeMcuFlags: '-mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard',
  cmakeLinkerScript: 'STM32G431RBTx_FLASH.ld',
  cmakeHalLib: 'CMSIS_DEVICE=STM32G431xx HAL_DRIVER=stm32g4xx',
};
