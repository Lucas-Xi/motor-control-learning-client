import { describe, expect, it } from 'vitest';
import {
  defaultThermalRC,
  junctionTemperature,
  sampleDevicePresets,
  stepCaseTemperature,
  switchingLoss,
} from './switchingLoss';

describe('switchingLoss - IGBT', () => {
  it('家用空调典型工况损耗 30-100 W 量级', () => {
    const r = switchingLoss({
      ...sampleDevicePresets.igbt600v20a,
      fsw: 16000,
      Vdc: 310,
      IrmsPhase: 8,
      dutyAvg: 0.5,
    });
    expect(r.Ptotal).toBeGreaterThan(15);
    expect(r.Ptotal).toBeLessThan(150);
  });
});

describe('switchingLoss - 频率对开关损耗的影响', () => {
  it('频率从 10kHz → 30kHz 开关损耗 ~3 倍', () => {
    const base = switchingLoss({
      ...sampleDevicePresets.igbt600v20a,
      fsw: 10000,
      Vdc: 310,
      IrmsPhase: 8,
      dutyAvg: 0.5,
    });
    const high = switchingLoss({
      ...sampleDevicePresets.igbt600v20a,
      fsw: 30000,
      Vdc: 310,
      IrmsPhase: 8,
      dutyAvg: 0.5,
    });
    expect(high.Psw).toBeGreaterThan(base.Psw * 2.5);
    expect(high.Psw).toBeLessThan(base.Psw * 3.5);
  });
});

describe('switchingLoss - SiC 比 IGBT 高频更低损', () => {
  it('30 kHz 工况 SiC 总损耗 < IGBT', () => {
    const igbt = switchingLoss({
      ...sampleDevicePresets.igbt600v20a,
      fsw: 30000,
      Vdc: 400,
      IrmsPhase: 10,
      dutyAvg: 0.5,
    });
    const sic = switchingLoss({
      ...sampleDevicePresets.sicCarbide900v,
      fsw: 30000,
      Vdc: 400,
      IrmsPhase: 10,
      dutyAvg: 0.5,
    });
    expect(sic.Ptotal).toBeLessThan(igbt.Ptotal);
  });
});

describe('switchingLoss - dominant 标签', () => {
  it('低频高流 → 导通主导', () => {
    const r = switchingLoss({
      ...sampleDevicePresets.igbt600v20a,
      fsw: 4000,
      Vdc: 200,
      IrmsPhase: 18,
      dutyAvg: 0.7,
    });
    expect(r.dominant).toBe('conduction');
  });

  it('高频低流 → 开关主导', () => {
    const r = switchingLoss({
      ...sampleDevicePresets.sicCarbide900v,
      fsw: 50000,
      Vdc: 600,
      IrmsPhase: 2,
      dutyAvg: 0.3,
    });
    expect(r.dominant).toBe('switching');
  });
});

describe('switchingLoss - efficiency hint 范围', () => {
  it('合理工况下效率在 0.85..0.99 之间', () => {
    const r = switchingLoss({
      ...sampleDevicePresets.igbt600v20a,
      fsw: 16000,
      Vdc: 310,
      IrmsPhase: 8,
      dutyAvg: 0.5,
    });
    expect(r.efficiencyHint).toBeGreaterThan(0.85);
    expect(r.efficiencyHint).toBeLessThan(0.99);
  });
});

describe('junctionTemperature + stepCaseTemperature', () => {
  it('稳态 case 温度 = T_amb + P × (R_cs + R_sa)', () => {
    let Tcase = 25;
    for (let k = 0; k < 100; k += 1) {
      Tcase = stepCaseTemperature(Tcase, 25, 80, 5);
    }
    // 25 + 80 × (0.15 + 1.5) = 25 + 132 = 157°C
    expect(Tcase).toBeCloseTo(157, 0);
  });

  it('结温 = case + P × R_th_jc', () => {
    const Tj = junctionTemperature(80, 60, defaultThermalRC);
    // 60 + 80 × 0.4 = 92°C
    expect(Tj).toBeCloseTo(92, 6);
  });
});
