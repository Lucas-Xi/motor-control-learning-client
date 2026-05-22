import { describe, expect, it } from 'vitest';
import { pSat } from './refrigerantProps';
import { volumetricEfficiency, wagnerSaturationPressure } from './wagnerEq';

describe('wagnerSaturationPressure - R-32 数值验证', () => {
  it('R-32 在 7°C 饱和压力 ≈ 1.0 MPa (NIST REFPROP)', () => {
    const P = wagnerSaturationPressure(7, 'R32');
    expect(P).toBeGreaterThan(0.95);
    expect(P).toBeLessThan(1.10);
  });

  it('R-32 在 45°C 饱和压力 ≈ 2.8 MPa', () => {
    const P = wagnerSaturationPressure(45, 'R32');
    expect(P).toBeGreaterThan(2.6);
    expect(P).toBeLessThan(3.0);
  });
});

describe('wagnerSaturationPressure - 单调性', () => {
  it('温度增大 → 饱和压力单调增大', () => {
    for (const r of ['R32', 'R410A', 'R134a'] as const) {
      const p1 = wagnerSaturationPressure(0, r);
      const p2 = wagnerSaturationPressure(30, r);
      const p3 = wagnerSaturationPressure(50, r);
      expect(p2).toBeGreaterThan(p1);
      expect(p3).toBeGreaterThan(p2);
    }
  });
});

describe('wagnerSaturationPressure - vs Antoine', () => {
  it('R-32 在 50°C 时 Wagner 与 Antoine 偏差 < 8%（教学合理）', () => {
    const wagner = wagnerSaturationPressure(50, 'R32');
    const antoine = pSat(50, 'R32');
    const rel = Math.abs(wagner - antoine) / wagner;
    expect(rel).toBeLessThan(0.08);
  });
});

describe('wagnerSaturationPressure - 临界点保护', () => {
  it('T > T_critical 返回 P_critical (不外推)', () => {
    expect(wagnerSaturationPressure(85, 'R32')).toBeLessThanOrEqual(5.782);
    expect(wagnerSaturationPressure(80, 'R410A')).toBeLessThanOrEqual(4.901);
  });
});

describe('volumetricEfficiency - 余隙比基础', () => {
  it('压比 = 1 时 η_v 接近 1（只剩转速 + 温度修正）', () => {
    const r = volumetricEfficiency({
      clearanceRatio: 0.05,
      pressureRatio: 1,
      polytropicN: 1.2,
      rpm: 3000,
      rpmRated: 3000,
      TsucC: 25,
    });
    expect(r.etaBase).toBeCloseTo(1, 4);
    expect(r.eta_v).toBeGreaterThan(0.95);
  });
});

describe('volumetricEfficiency - 转速修正', () => {
  it('低速 (rpm/N_rated < 0.3) η 明显下降', () => {
    const low = volumetricEfficiency({
      clearanceRatio: 0.05,
      pressureRatio: 2.5,
      polytropicN: 1.2,
      rpm: 600,
      rpmRated: 3000,
      TsucC: 25,
    });
    const rated = volumetricEfficiency({
      clearanceRatio: 0.05,
      pressureRatio: 2.5,
      polytropicN: 1.2,
      rpm: 3000,
      rpmRated: 3000,
      TsucC: 25,
    });
    expect(low.eta_v).toBeLessThan(rated.eta_v);
    expect(low.speedFactor).toBeLessThan(1);
  });
});

describe('volumetricEfficiency - 高吸气温度衰减', () => {
  it('吸气温度从 25°C → 65°C 让 η_v 下降', () => {
    const cool = volumetricEfficiency({
      clearanceRatio: 0.05,
      pressureRatio: 2.5,
      polytropicN: 1.2,
      rpm: 3000,
      rpmRated: 3000,
      TsucC: 25,
    });
    const hot = volumetricEfficiency({
      clearanceRatio: 0.05,
      pressureRatio: 2.5,
      polytropicN: 1.2,
      rpm: 3000,
      rpmRated: 3000,
      TsucC: 65,
    });
    expect(hot.eta_v).toBeLessThan(cool.eta_v);
    expect(hot.tempFactor).toBeLessThan(cool.tempFactor);
  });
});

describe('volumetricEfficiency - 高压比降低 η', () => {
  it('压比从 1.5 → 5 让基础项明显下降', () => {
    const low = volumetricEfficiency({
      clearanceRatio: 0.05, pressureRatio: 1.5, polytropicN: 1.2,
      rpm: 3000, rpmRated: 3000, TsucC: 25,
    });
    const high = volumetricEfficiency({
      clearanceRatio: 0.05, pressureRatio: 5, polytropicN: 1.2,
      rpm: 3000, rpmRated: 3000, TsucC: 25,
    });
    expect(high.eta_v).toBeLessThan(low.eta_v);
    expect(high.etaBase).toBeLessThan(low.etaBase);
  });
});
