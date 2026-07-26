import { describe, expect, it } from 'vitest';
import { simulateThermal } from './thermalSim';
import { defaultPmsmParameters } from './motorModel';

describe('thermalSim', () => {
  const baseConfig = {
    base: defaultPmsmParameters,
  };

  const defaultInput = {
    vd: 0,
    vq: 5,
    loadTorque: 0.2,
    duration: 3,
    dt: 0.002,
    config: baseConfig,
  };

  it('仿真产生数据点', () => {
    const r = simulateThermal(defaultInput);
    expect(r.points.length).toBeGreaterThan(100);
  });

  it('温度随时间上升', () => {
    const r = simulateThermal(defaultInput);
    const first = r.points[0];
    const last = r.points[r.points.length - 1];
    expect(last.windingTempC).toBeGreaterThanOrEqual(first.windingTempC);
  });

  it('铜损 > 0', () => {
    const r = simulateThermal(defaultInput);
    const avgCu = r.points.reduce((s, p) => s + p.copperLossW, 0) / r.points.length;
    expect(avgCu).toBeGreaterThan(0);
  });

  it('铁损 > 0（有转速）', () => {
    const r = simulateThermal(defaultInput);
    const avgFe = r.points.reduce((s, p) => s + p.ironLossW, 0) / r.points.length;
    expect(avgFe).toBeGreaterThan(0);
  });

  it('稳态温度 > 初始温度', () => {
    const r = simulateThermal(defaultInput);
    expect(r.steadyTempC).toBeGreaterThan(25);
  });

  it('热时间常数 > 0', () => {
    const r = simulateThermal(defaultInput);
    expect(r.thermalTimeConstant).toBeGreaterThan(0);
  });

  it('高电压（同负载）导致更高稳态温度', () => {
    const low = simulateThermal({ ...defaultInput, vq: 3 });
    const high = simulateThermal({ ...defaultInput, vq: 10 });
    expect(high.steadyTempC).toBeGreaterThan(low.steadyTempC);
  });
});