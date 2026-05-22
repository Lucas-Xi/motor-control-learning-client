import { describe, expect, it } from 'vitest';
import { compensateForTemperature, defaultThermalParams, stepThermal } from './thermalRsFlux';

describe('compensateForTemperature - 基准温度', () => {
  it('T0=25°C 时返回基准值', () => {
    const r = compensateForTemperature(25, { rs0: 0.5, flux0: 0.045 });
    expect(r.rs).toBeCloseTo(0.5, 6);
    expect(r.flux).toBeCloseTo(0.045, 6);
    expect(r.rsRisePct).toBeCloseTo(0, 6);
    expect(r.fluxDropPct).toBeCloseTo(0, 6);
    expect(r.demagAlarm).toBe(false);
  });
});

describe('compensateForTemperature - 热机', () => {
  it('120°C 时 Rs 升 +37%、ψf 降 ~11%', () => {
    const r = compensateForTemperature(120, { rs0: 0.5, flux0: 0.045 });
    expect(r.rsRisePct).toBeGreaterThan(35);
    expect(r.rsRisePct).toBeLessThan(40);
    expect(r.fluxDropPct).toBeGreaterThan(10);
    expect(r.fluxDropPct).toBeLessThan(13);
    expect(r.demagAlarm).toBe(true); // 120 > 100°C
    expect(r.demagMarginK).toBe(-20);
  });
});

describe('compensateForTemperature - 退磁告警', () => {
  it('99°C 安全；101°C 告警', () => {
    expect(compensateForTemperature(99, { rs0: 0.5, flux0: 0.045 }).demagAlarm).toBe(false);
    expect(compensateForTemperature(101, { rs0: 0.5, flux0: 0.045 }).demagAlarm).toBe(true);
  });
});

describe('stepThermal - 一阶滞后', () => {
  it('稳态收敛到 T_ambient + P×R_th', () => {
    let T = 25;
    // 跑 30 个 τ 步长（τ=600s, dt=60s）让系统接近稳态
    for (let k = 0; k < 60; k += 1) {
      T = stepThermal(T, 25, 80, 60); // 80W 损耗
    }
    // 稳态 = 25 + 80 × 0.5 = 65°C
    expect(T).toBeCloseTo(65, 0);
  });

  it('零损耗时温度回到环境', () => {
    let T = 80;
    for (let k = 0; k < 60; k += 1) {
      T = stepThermal(T, 25, 0, 60);
    }
    expect(T).toBeCloseTo(25, 0);
  });
});

describe('compensateForTemperature - 物理下限保护', () => {
  it('极端低温不让 Rs 跌穿', () => {
    const r = compensateForTemperature(-200, { rs0: 0.5, flux0: 0.045 });
    expect(r.rs).toBeGreaterThanOrEqual(0.5 * 0.5);
  });

  it('极端高温不让 ψf 跌穿', () => {
    const r = compensateForTemperature(500, { rs0: 0.5, flux0: 0.045 });
    expect(r.flux).toBeGreaterThanOrEqual(0.045 * 0.3);
  });
});

describe('compensateForTemperature - 自定义阈值', () => {
  it('N42SH grade T_demag=150°C 时 130°C 仍安全', () => {
    const r = compensateForTemperature(130, { rs0: 0.5, flux0: 0.045 }, {
      ...defaultThermalParams,
      TdemagC: 150,
    });
    expect(r.demagAlarm).toBe(false);
  });
});
