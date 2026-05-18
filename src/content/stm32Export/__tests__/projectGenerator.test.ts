import { describe, expect, it } from 'vitest';
import {
  buildParamMappings,
  generateProject,
  packAsSingleText,
} from '../projectGenerator';
import { guessMcuFamily } from '../mcuTemplate';
import { FAULT_ENUM_LIST, type GeneratorInput, type ProjectSlots } from '../types';
import {
  controlLoopDefault,
  focDefault,
  inverterDefault,
  motorBasicsDefault,
  pidDefault,
  startupDefault,
  svpwmDefault,
} from '../../../simulation/engine/presets';

function makeInput(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  const slots: ProjectSlots = {
    slotIds: {
      compressorBundleId: 'hitachi-r32-15hp',
      inverterPartNo: 'STM32G431RBT6',
      strategyId: 'foc-hfi-bemf',
      loadId: 'cooling-summer-typical',
      pfcId: 'boost-single',
      separatorId: 'standard',
    },
    compressorLabel: '海立 1.5HP R32 转子式',
    strategyLabel: 'FOC + HFI + BEMF（压缩机标配）',
    loadLabel: '空调制冷·夏季典型',
    pfcLabel: 'Boost 单相 PFC',
    separatorLabel: '标准液气分离器',
    inverterMcuPartNo: 'STM32G431RBT6',
  };
  return {
    snapshot: {
      motorBasics: { ...motorBasicsDefault },
      pid: { ...pidDefault },
      foc: { ...focDefault },
      svpwm: { ...svpwmDefault },
      inverter: { ...inverterDefault },
      controlLoop: { ...controlLoopDefault },
      startup: { ...startupDefault },
    },
    slots,
    mcuFamily: 'STM32G4',
    generatedAt: '2026-05-17 10:00:00',
    ...overrides,
  };
}

describe('projectGenerator', () => {
  it('default snapshot produces main.c with expected macros + timestamp banner', () => {
    const files = generateProject(makeInput());
    const main = files.find((f) => f.path === 'Core/Src/main.c');
    expect(main).toBeDefined();
    expect(main!.content).toContain('Generated: 2026-05-17 10:00:00');
    expect(main!.content).toContain('SystemClock_Config');
    expect(main!.content).toContain('motor_param.h');
    expect(main!.content).toContain('fault_codes.h');
    // banner 中应该明确标 compressor-bench
    expect(main!.content).toContain('compressor-bench 学习客户端生成');
  });

  it('motorBasics.ldMh change propagates to MOTOR_LD_H #define', () => {
    const baseFiles = generateProject(makeInput());
    const baseHeader = baseFiles.find((f) => f.path === 'Core/Inc/motor_param.h')!.content;
    // 默认 Ld = 1.1 mH → 0.0011 H
    expect(baseHeader).toContain('MOTOR_LD_H');
    expect(baseHeader).toMatch(/MOTOR_LD_H\s+1\.100e-3f/);

    // 改成 3.3 mH → 0.0033 H
    const modified = makeInput({
      snapshot: {
        ...makeInput().snapshot,
        motorBasics: { ...motorBasicsDefault, ldMh: 3.3 },
      },
    });
    const modFiles = generateProject(modified);
    const modHeader = modFiles.find((f) => f.path === 'Core/Inc/motor_param.h')!.content;
    expect(modHeader).toMatch(/MOTOR_LD_H\s+3\.300e-3f/);
    // 同时验证 mapping 也变了
    const mappings = buildParamMappings(modified);
    const ldRow = mappings.find((m) => m.cDefine === 'MOTOR_LD_H')!;
    expect(ldRow.storeValue).toBe(3.3);
    expect(ldRow.cValue).toContain('3.300e-3');
  });

  it('STM32G4 vs STM32F4 produce different SystemClock_Config and HAL headers', () => {
    const g4 = generateProject(makeInput({ mcuFamily: 'STM32G4' }));
    const f4 = generateProject(makeInput({ mcuFamily: 'STM32F4' }));
    const g4Main = g4.find((f) => f.path === 'Core/Src/main.c')!.content;
    const f4Main = f4.find((f) => f.path === 'Core/Src/main.c')!.content;

    // G4: 170 MHz, PLLR DIV2; F4: 168 MHz, PLLP DIV2
    expect(g4Main).toContain('stm32g4xx_hal.h');
    expect(g4Main).toContain('170');               // 170 MHz 注释
    expect(g4Main).toContain('PLLR');
    expect(f4Main).toContain('stm32f4xx_hal.h');
    expect(f4Main).toContain('168');               // 168 MHz 注释
    expect(f4Main).toContain('PLLP');

    // ISR 名也不同（G4 = ADC1_2_IRQHandler，F4 = ADC_IRQHandler）
    const g4Isr = g4.find((f) => f.path === 'Core/Src/foc_isr.c')!.content;
    const f4Isr = f4.find((f) => f.path === 'Core/Src/foc_isr.c')!.content;
    expect(g4Isr).toContain('ADC1_2_IRQHandler');
    expect(f4Isr).toContain('ADC_IRQHandler');
    expect(f4Isr).not.toContain('ADC1_2_IRQHandler');
  });

  it('SVPWM mode invokes SVPWM_Calculate; SPWM mode falls back to SPWM_Calculate', () => {
    const svInput = makeInput({
      snapshot: {
        ...makeInput().snapshot,
        inverter: { ...inverterDefault, modulationMode: 'svpwm' },
      },
    });
    const svFiles = generateProject(svInput);
    const svIsr = svFiles.find((f) => f.path === 'Core/Src/foc_isr.c')!.content;
    expect(svIsr).toContain('SVPWM_Calculate(V_alpha, V_beta, INVERTER_VDC_V');
    expect(svIsr).not.toContain('SPWM_Calculate(V_alpha');

    const spInput = makeInput({
      snapshot: {
        ...makeInput().snapshot,
        inverter: { ...inverterDefault, modulationMode: 'spwm' },
      },
    });
    const spFiles = generateProject(spInput);
    const spIsr = spFiles.find((f) => f.path === 'Core/Src/foc_isr.c')!.content;
    expect(spIsr).toContain('SPWM_Calculate(V_alpha, V_beta, INVERTER_VDC_V');
    expect(spIsr).not.toContain('SVPWM_Calculate(V_alpha');

    // motor_param.h 中 MODULATION_MAX 也应跟着切：svpwm = 0.866f / spwm = 0.500f
    const svHeader = svFiles.find((f) => f.path === 'Core/Inc/motor_param.h')!.content;
    const spHeader = spFiles.find((f) => f.path === 'Core/Inc/motor_param.h')!.content;
    expect(svHeader).toContain('MODULATION_MAX');
    expect(svHeader).toContain('0.866f');
    expect(spHeader).toContain('0.500f');
  });

  it('all generated file paths are POSIX-style ASCII without odd chars', () => {
    const files = generateProject(makeInput());
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const f of files) {
      expect(f.path).toMatch(/^[A-Za-z0-9_./-]+$/);    // 仅 ASCII + 路径合法字符
      expect(f.path).not.toContain('..');
      expect(f.path).not.toContain('\\');
      expect(f.path.startsWith('/')).toBe(false);
    }
    // 关键文件都在
    const paths = files.map((f) => f.path);
    expect(paths).toContain('Core/Src/main.c');
    expect(paths).toContain('Core/Src/foc_isr.c');
    expect(paths).toContain('Core/Src/state_machine.c');
    expect(paths).toContain('Core/Inc/motor_param.h');
    expect(paths).toContain('Core/Inc/fault_codes.h');
    expect(paths).toContain('CMakeLists.txt');
    expect(paths).toContain('README.md');
  });

  it('fault_codes.h enumerates all 14 FaultType entries', () => {
    const files = generateProject(makeInput());
    const faultH = files.find((f) => f.path === 'Core/Inc/fault_codes.h')!.content;
    expect(FAULT_ENUM_LIST.length).toBe(14);
    for (const entry of FAULT_ENUM_LIST) {
      expect(faultH).toContain(entry.cName);
    }
    // FAULT_COUNT 哨兵
    expect(faultH).toContain('FAULT_COUNT');
  });

  it('packAsSingleText concatenates all files with separators', () => {
    const files = generateProject(makeInput());
    const text = packAsSingleText(files);
    for (const f of files) {
      expect(text).toContain(`FILE: ${f.path}`);
    }
    expect(text.length).toBeGreaterThan(2000);
  });

  it('guessMcuFamily maps inverter MCU partNo to family heuristically', () => {
    expect(guessMcuFamily('STM32G431RBT6')).toBe('STM32G4');
    expect(guessMcuFamily('STM32F407VGT6')).toBe('STM32F4');
    expect(guessMcuFamily('STM32H743ZIT6')).toBe('STM32H7');
    expect(guessMcuFamily('Unknown MCU')).toBe('STM32G4');  // 兜底
  });

  it('parameter mapping count is stable (≥ 25 store fields synced)', () => {
    const mappings = buildParamMappings(makeInput());
    expect(mappings.length).toBeGreaterThanOrEqual(25);
    // 必有的几条关键映射
    expect(mappings.some((m) => m.cDefine === 'MOTOR_POLE_PAIRS')).toBe(true);
    expect(mappings.some((m) => m.cDefine === 'CURRENT_PI_KP')).toBe(true);
    expect(mappings.some((m) => m.cDefine === 'INVERTER_PWM_FREQ_HZ')).toBe(true);
    expect(mappings.some((m) => m.cDefine === 'STARTUP_TARGET_RPM')).toBe(true);
  });
});
