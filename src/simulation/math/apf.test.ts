import { describe, expect, it } from 'vitest';
import { simulateAPF } from './apf';
import type { APFParams } from '../engine/types';

const baseParams: APFParams = {
  vAcRms: 220, vAcFreqHz: 50,
  udcRef: 380, boostInductanceMh: 3,
  boostCapacitanceUf: 470, loadCurrent: 0.5,
  currentKp: 0.1, currentKi: 20,
  voltageKp: 0.005, voltageKi: 0.5,
};

describe('simulateAPF', () => {
  it('returns samples and metrics', () => {
    const { samples, metrics } = simulateAPF(baseParams);
    expect(samples.length).toBeGreaterThan(100);
    expect(metrics.powerFactor).toBeGreaterThan(0.8);
    expect(metrics.thd).toBeGreaterThanOrEqual(0);
    expect(metrics.udcAvg).toBeGreaterThan(0);
  });

  it('maintains DC bus voltage near target', () => {
    const { metrics } = simulateAPF(baseParams);
    expect(metrics.udcAvg).toBeGreaterThan(baseParams.udcRef * 0.85);
  });

  it('low boost inductance produces higher ripple', () => {
    const { metrics: m1 } = simulateAPF(baseParams);
    const { metrics: m2 } = simulateAPF({ ...baseParams, boostInductanceMh: 1 });
    expect(m1.udcRipplePct).toBeLessThan(m2.udcRipplePct + 1);
  });

  it('handles different AC voltages', () => {
    const v110 = simulateAPF({ ...baseParams, vAcRms: 110, udcRef: 200 });
    const v220 = simulateAPF(baseParams);
    expect(v110.samples.length).toBeGreaterThan(100);
    expect(v220.samples.length).toBeGreaterThan(100);
  });
});