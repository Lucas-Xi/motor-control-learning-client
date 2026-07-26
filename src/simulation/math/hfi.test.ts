import { describe, expect, it } from 'vitest';
import { simulateHFI } from './hfi';

describe('simulateHFI', () => {
  const baseParams = {
    injectVoltage: 30,
    injectFreqHz: 1000,
    saliencyRatio: 1.8,
    demodCutoffHz: 100,
    pllKp: 200,
    pllKi: 3000,
    measNoise: 0.01,
    speedRpm: 100,
    trueThetaRad: 0,
  };

  it('returns samples array with proper structure', () => {
    const samples = simulateHFI(baseParams);
    expect(samples.length).toBeGreaterThan(10);
    const s = samples[0];
    expect(typeof s.t).toBe('number');
    expect(typeof s.trueDeg).toBe('number');
    expect(typeof s.estDeg).toBe('number');
    expect(typeof s.errorDeg).toBe('number');
    expect(typeof s.inLockBand).toBe('boolean');
  });

  it('works at zero speed (standstill HFI)', () => {
    const samples = simulateHFI({ ...baseParams, speedRpm: 0 });
    expect(samples.length).toBeGreaterThan(10);
    // Should not diverge completely
    const lastFew = samples.slice(-10);
    const avgErr = lastFew.reduce((sum, s) => sum + Math.abs(s.errorDeg), 0) / lastFew.length;
    expect(avgErr).toBeLessThan(100);
  });

  it('handles low saliency ratio (SPM-like)', () => {
    const samples = simulateHFI({ ...baseParams, saliencyRatio: 1.05 });
    expect(samples.length).toBeGreaterThan(10);
    expect(samples.every(s => Number.isFinite(s.errorDeg))).toBe(true);
  });
});