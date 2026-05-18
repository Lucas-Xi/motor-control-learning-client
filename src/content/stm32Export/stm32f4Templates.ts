/**
 * STM32F4 系列模板（Cortex-M4 + FPU @ 168MHz）。
 *
 * F4 是 ST 早期主推的高性能 MCU，工业现场存量大；没有 CORDIC，
 * sin/cos 需要软件实现或查表，比 G4 略慢。FOC 频率上限约 16kHz。
 */

import type { McuFamilyTemplate } from './mcuTemplate';

export const stm32f4Template: McuFamilyTemplate = {
  family: 'STM32F4',
  chipBlurb: 'STM32F4 Cortex-M4 + FPU @ 168MHz；无 CORDIC，sin/cos 查表加速；存量场景的稳定选择。',
  halHeaders: [
    '#include "stm32f4xx_hal.h"',
    '#include "stm32f4xx_ll_tim.h"',
    '#include "stm32f4xx_ll_adc.h"',
  ],
  systemClockConfig: `static void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    /* HSE 8MHz → PLL → 168MHz */
    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    RCC_OscInitStruct.HSEState = RCC_HSE_ON;
    RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
    RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    RCC_OscInitStruct.PLL.PLLM = 8;       /* 8 / 8 = 1 MHz */
    RCC_OscInitStruct.PLL.PLLN = 336;     /* 1 * 336 = 336 MHz */
    RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;  /* 336 / 2 = 168 MHz */
    RCC_OscInitStruct.PLL.PLLQ = 7;
    HAL_RCC_OscConfig(&RCC_OscInitStruct);

    RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
                                  RCC_CLOCKTYPE_PCLK1  | RCC_CLOCKTYPE_PCLK2;
    RCC_ClkInitStruct.SYSCLKSource   = RCC_SYSCLKSOURCE_PLLCLK;
    RCC_ClkInitStruct.AHBCLKDivider  = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV4;
    RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV2;
    HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_5);
}`,
  adcInit: `    /* ADC1 注入序列 = TIM1 TRGO 触发：PWM 中心对齐谷值采样 */
    ADC1->CR2 |= ADC_CR2_JEXTEN_0;
    ADC1->CR2 |= (1 << ADC_CR2_JEXTSEL_Pos);  /* TIM1_TRGO */
    HAL_ADCEx_InjectedStart_IT(&hadc1);`,
  tim1Init: `    /* TIM1 中心对齐 + 互补输出 + 死区，APB2 = 84MHz。
     * ARR = 168MHz / (2 * PWM_FREQ_HZ) - 1（center-aligned 计两次）
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
  cubeMxNote: '推荐用 STM32CubeMX 选择 STM32F407 / F405 系列，生成时钟 / TIM1 PWM / ADC1 injected 配置后把本工程文件拷入。',
  flashTool: 'STM32CubeProgrammer (ST-LINK V2)',
  cmakeMcuFlags: '-mcpu=cortex-m4 -mthumb -mfpu=fpv4-sp-d16 -mfloat-abi=hard',
  cmakeLinkerScript: 'STM32F407VGTx_FLASH.ld',
  cmakeHalLib: 'CMSIS_DEVICE=STM32F407xx HAL_DRIVER=stm32f4xx',
};
