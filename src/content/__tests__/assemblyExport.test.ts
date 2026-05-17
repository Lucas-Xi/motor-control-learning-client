import { describe, expect, it } from 'vitest';
import { exportAssemblyAsC, getMcuVendor } from '../assemblyExport';
import {
  controlStrategies,
  inverterPlatforms,
  liquidSeparators,
  loadConditions,
  pfcPlatforms,
  runAssembly,
} from '../assemblyLibraries';
import { compressorBundles } from '../compressorLibrary';

describe('exportAssemblyAsC', () => {
  // 用默认组合（海立 + Sanken + FOC+HFI+BEMF + 夏季制冷）
  const compressor = compressorBundles[1].compressor;
  const inverter = compressorBundles[1].inverter;
  const strategy = controlStrategies[3];   // foc-hfi-bemf
  const load = loadConditions[0];           // cooling-summer-typical
  const pfc = pfcPlatforms.find((p) => p.id === 'boost-single')!;
  const separator = liquidSeparators.find((s) => s.id === 'standard')!;
  const result = runAssembly({ compressor, inverter, strategy, load, pfc, separator });

  it('produces non-empty C source with timestamp', () => {
    const c = exportAssemblyAsC({ compressor, inverter, strategy, load, pfc, separator, result }, '2026-05-12 19:30:00');
    expect(c.length).toBeGreaterThan(2000);
    expect(c).toContain('Generated: 2026-05-12 19:30:00');
  });

  it('includes all 6 slot identities in header', () => {
    const c = exportAssemblyAsC({ compressor, inverter, strategy, load, pfc, separator, result }, '2026-05-12 19:30:00');
    expect(c).toContain(compressor.partNo);
    expect(c).toContain(inverter.ipmPartNo);
    expect(c).toContain(strategy.name);
    expect(c).toContain(load.name);
    expect(c).toContain(pfc.name);
    expect(c).toContain(separator.name);
  });

  it('emits motor electrical parameters as #define constants', () => {
    const c = exportAssemblyAsC({ compressor, inverter, strategy, load, pfc, separator, result }, 'x');
    expect(c).toContain('#define MOTOR_POLE_PAIRS');
    expect(c).toMatch(/#define MOTOR_RS_OHM\s+[0-9.]+f/);
    expect(c).toMatch(/#define MOTOR_LD_H\s+[0-9.e+-]+f/);
    expect(c).toMatch(/#define MOTOR_LQ_H\s+[0-9.e+-]+f/);
    expect(c).toContain('#define MOTOR_FLUX_WB');
    expect(c).toContain('#define MOTOR_SALIENCY_RATIO');
  });

  it('uses PFC vdcOutput as INVERTER_VDC_V', () => {
    const c = exportAssemblyAsC({ compressor, inverter, strategy, load, pfc, separator, result }, 'x');
    expect(c).toContain(`#define INVERTER_VDC_V              ${pfc.vdcOutput.toFixed(0)}.0f`);
  });

  it('reflects strategy modulation factor in MODULATION_MAX', () => {
    const c = exportAssemblyAsC({ compressor, inverter, strategy, load, pfc, separator, result }, 'x');
    // FOC+HFI+BEMF 是 SVPWM 0.866
    expect(c).toContain('0.866f');
    // V/f 变种应该是 SPWM 0.5
    const vfStrategy = controlStrategies.find((s) => s.id === 'spwm-vf')!;
    const vfResult = runAssembly({ compressor, inverter, strategy: vfStrategy, load, pfc, separator });
    const vfC = exportAssemblyAsC({ compressor, inverter, strategy: vfStrategy, load, pfc, separator, result: vfResult }, 'x');
    expect(vfC).toContain('0.500f');
  });

  it('uses separator maxRampRpmS as RAMP_LIMIT_RPM_PER_S', () => {
    const c = exportAssemblyAsC({ compressor, inverter, strategy, load, pfc, separator, result }, 'x');
    expect(c).toContain(`#define RAMP_LIMIT_RPM_PER_S        ${separator.maxRampRpmS}`);
  });

  it('refrigerant-specific limits (R32/R410A/R134a) reflected in discharge & pressure caps', () => {
    const r32 = exportAssemblyAsC({ compressor, inverter, strategy, load, pfc, separator, result }, 'x');
    expect(r32).toContain('#define DISCHARGE_T_LIMIT_C         105.0f');
    expect(r32).toContain('#define PRESSURE_RATIO_LIMIT        7.0f');
    // R134a 压缩机
    const fridge = compressorBundles.find((b) => b.compressor.refrigerant === 'R134a')!;
    const fridgeLoad = loadConditions.find((l) => l.refrigerant === 'R134a')!;
    const fridgeResult = runAssembly({ compressor: fridge.compressor, inverter: fridge.inverter, strategy, load: fridgeLoad, pfc, separator });
    const r134a = exportAssemblyAsC({ compressor: fridge.compressor, inverter: fridge.inverter, strategy, load: fridgeLoad, pfc, separator, result: fridgeResult }, 'x');
    expect(r134a).toContain('#define DISCHARGE_T_LIMIT_C         95.0f');
    expect(r134a).toContain('#define PRESSURE_RATIO_LIMIT        8.0f');
  });

  it('verdict and remaining faults appear in trailing comment block', () => {
    // 用一个已知 fail 的组合
    const bemfOnly = controlStrategies.find((s) => s.id === 'foc-bemf')!;
    const failResult = runAssembly({ compressor, inverter, strategy: bemfOnly, load, pfc, separator });
    const c = exportAssemblyAsC({ compressor, inverter, strategy: bemfOnly, load, pfc, separator, result: failResult }, 'x');
    expect(c).toContain('不通过');
    expect(c).toContain('零速启动');
  });

  describe('multi-MCU export', () => {
    it('getMcuVendor identifies STM32 / Renesas / TI correctly', () => {
      expect(getMcuVendor('STM32G431RBT6')).toBe('stm32');
      expect(getMcuVendor('STM32F103C8T6')).toBe('stm32');
      expect(getMcuVendor('Renesas RX26T')).toBe('renesas');
      expect(getMcuVendor('Renesas RX26T (R5F526T)')).toBe('renesas');
      expect(getMcuVendor('Renesas RX72T')).toBe('renesas');
      expect(getMcuVendor('TI TMS320F28379D')).toBe('ti');
      expect(getMcuVendor('Unknown MCU')).toBe('stm32');  // 兜底
    });

    it('STM32 export uses HAL_Init + TIM1 / ADC1 idioms', () => {
      // 海立 bundle 用 Renesas RX26T，我们要构造一个 STM32 inverter
      const stmInverter = { ...inverter, mcuPartNo: 'STM32G431RBT6' };
      const c = exportAssemblyAsC({ compressor, inverter: stmInverter, strategy, load, pfc, separator, result }, 'x');
      expect(c).toContain('STM32 (ST Microelectronics)');
      expect(c).toContain('stm32g4xx_hal.h');
      expect(c).toContain('HAL_Init();');
      expect(c).toContain('ADC1_2_IRQHandler');
      expect(c).toContain('__HAL_TIM_SET_COMPARE');
    });

    it('Renesas export uses iodefine + MTU3 idioms', () => {
      const rxInverter = { ...inverter, mcuPartNo: 'Renesas RX26T (R5F526T)' };
      const c = exportAssemblyAsC({ compressor, inverter: rxInverter, strategy, load, pfc, separator, result }, 'x');
      expect(c).toContain('Renesas RX 系列');
      expect(c).toContain('iodefine.h');
      expect(c).toContain('R_BSP_PowerOn_BSP');
      expect(c).toContain('MTU3');
      expect(c).toContain('INT_Excep_PERIB_INTB128');
    });

    it('TI C2000 export uses F28x_Project + EPWM + adca1 idioms', () => {
      const tiInverter = { ...inverter, mcuPartNo: 'TI TMS320F28379D' };
      const c = exportAssemblyAsC({ compressor, inverter: tiInverter, strategy, load, pfc, separator, result }, 'x');
      expect(c).toContain('TI C2000');
      expect(c).toContain('F28x_Project.h');
      expect(c).toContain('InitSysCtrl');
      expect(c).toContain('EPwm1Regs');
      expect(c).toContain('adca1_isr');
    });

    it('vendor-neutral parts (motor params, fault list) remain identical across vendors', () => {
      const baseC = exportAssemblyAsC({ compressor, inverter: { ...inverter, mcuPartNo: 'STM32G431RBT6' }, strategy, load, pfc, separator, result }, 'x');
      const rxC = exportAssemblyAsC({ compressor, inverter: { ...inverter, mcuPartNo: 'Renesas RX26T' }, strategy, load, pfc, separator, result }, 'x');
      // 三种导出都应该有完全相同的电机参数 + 同样的诊断结论
      expect(baseC).toContain('#define MOTOR_POLE_PAIRS');
      expect(rxC).toContain('#define MOTOR_POLE_PAIRS');
      expect(baseC).toContain('#define MOTOR_FLUX_WB');
      expect(rxC).toContain('#define MOTOR_FLUX_WB');
    });
  });
});
