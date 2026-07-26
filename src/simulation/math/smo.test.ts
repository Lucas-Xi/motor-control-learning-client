import { describe, expect, it } from 'vitest';
import { createSMO, smoStep, simulateSMO, precomputeSmoConfig } from './smo';

describe('createSMO', () => {
  it('returns zero-initialized SMO state', () => {
    const s = createSMO();
    expect(s.iAlphaEst).toBe(0);
    expect(s.iBetaEst).toBe(0);
    expect(s.zAlpha).toBe(0);
    expect(s.zBeta).toBe(0);
    expect(s.zAlphaLpf).toBe(0);
    expect(s.zBetaLpf).toBe(0);
    expect(s.pllAngle).toBe(0);
    expect(s.pllOmega).toBe(0);
    expect(s.pllIntegral).toBe(0);
  });
});

describe('precomputeSmoConfig', () => {
  it('adds precomputed fields', () => {
    const cfg = precomputeSmoConfig({ rs: 0.5, ls: 0.0012, smoGain: 80, boundaryLayer: 0.5, lpfCutoffHz: 100, pllKp: 200, pllKi: 2000 }, 1/16000);
    expect(cfg._lpfA).toBeGreaterThan(0);
    expect(cfg._lpfA).toBeLessThan(1);
    expect(cfg._invLs).toBeCloseTo(833.33, 0);
    expect(cfg._rsOverLs).toBeGreaterThan(0);
  });
});

describe('smoStep', () => {
  const cfg = precomputeSmoConfig({ rs: 0.5, ls: 0.0012, smoGain: 80, boundaryLayer: 0.5, lpfCutoffHz: 100, pllKp: 200, pllKi: 2000 }, 1 / 16000);

  it('zero voltage/current keeps est currents near zero', () => {
    const s = createSMO();
    const next = smoStep(s, 0, 0, 0, 0, cfg, 1 / 16000);
    expect(next.iAlphaEst).toBeCloseTo(0, 3);
    expect(next.iBetaEst).toBeCloseTo(0, 3);
  });

  it('produces finite output for typical inputs', () => {
    const s = createSMO();
    const next = smoStep(s, 5, 3, 1, 0.5, cfg, 1 / 16000);
    expect(Number.isFinite(next.pllAngle)).toBe(true);
    expect(Number.isFinite(next.pllOmega)).toBe(true);
    expect(Number.isFinite(next.zAlpha)).toBe(true);
    expect(Number.isFinite(next.zBeta)).toBe(true);
  });

  it('is numerically stable with high gain', () => {
    const highGain = precomputeSmoConfig({ rs: 0.5, ls: 0.0012, smoGain: 1000, boundaryLayer: 0.5, lpfCutoffHz: 100, pllKp: 200, pllKi: 2000 }, 1 / 16000);
    const s = createSMO();
    const next = smoStep(s, 10, 5, 3, 1, highGain, 1 / 16000);
    expect(Number.isFinite(next.iAlphaEst)).toBe(true);
    expect(Number.isFinite(next.pllAngle)).toBe(true);
  });

  it('drives estimation error toward zero over many steps', () => {
    let s = createSMO();
    const vAlpha = 5, vBeta = 0;
    const iAlphaMeas = 2, iBetaMeas = 0;
    for (let i = 0; i < 100; i++) {
      s = smoStep(s, vAlpha, vBeta, iAlphaMeas, iBetaMeas, cfg, 1 / 16000);
    }
    // switching surface should reduce estimation error
    expect(Math.abs(s.iAlphaEst - iAlphaMeas)).toBeLessThan(5);
  });
});

describe('simulateSMO', () => {
  it('returns samples with angle estimation', () => {
    const samples = simulateSMO({
      speedRpm: 1500, polePairs: 4, rs: 0.55, lsMh: 1.2,
      fluxLinkage: 0.045, smoGain: 80, boundaryLayer: 0.5,
      lpfCutoffHz: 100, pllKp: 200, pllKi: 2000, noise: 0.02,
    });
    expect(samples.length).toBeGreaterThan(10);
    // estimate should be finite
    const last = samples[samples.length - 1];
    expect(Number.isFinite(last.errorDeg)).toBe(true);
    expect(Number.isFinite(last.thetaEst)).toBe(true);
  });
});