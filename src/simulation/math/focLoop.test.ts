import { describe, expect, it } from 'vitest';
import { simulateFocCurrentLoop } from './focLoop';
import type { FOCParams } from '../engine/types';

describe('simulateFocCurrentLoop', () => {
  const baseParams: FOCParams = {
    iqRef: 2, idRef: 0, kp: 12, ki: 400,
    thetaErrorDeg: 0, samplingDelaySamples: 0,
    voltageLimit: 24, electricalFreq: 50,
  };

  it('returns samples with dq fields', () => {
    const samples = simulateFocCurrentLoop(baseParams);
    expect(samples.length).toBeGreaterThan(50);
    const s = samples[0];
    expect(s.t).toBeDefined();
    expect(s.id).toBeDefined();
    expect(s.iq).toBeDefined();
    expect(s.vd).toBeDefined();
    expect(s.vq).toBeDefined();
  });

  it('Iq tracks positive reference', () => {
    const samples = simulateFocCurrentLoop(baseParams);
    const final = samples.slice(-20);
    const avgIq = final.reduce((sum, s) => sum + s.iq, 0) / final.length;
    expect(avgIq).toBeGreaterThan(1.0);
  });

  it('handles high fidelity option', () => {
    const samples = simulateFocCurrentLoop(baseParams, { highFidelity: true });
    expect(samples.length).toBeGreaterThan(50);
  });

  it('handles winding temperature', () => {
    const hot = simulateFocCurrentLoop(baseParams, { highFidelity: true, windingTempC: 120 });
    expect(hot.length).toBeGreaterThan(50);
  });

  it('handles angle error (dq cross-talk)', () => {
    const withError = simulateFocCurrentLoop({ ...baseParams, thetaErrorDeg: 15 });
    const withoutError = simulateFocCurrentLoop(baseParams);
    // Angle error should cause non-zero Id even when idRef=0
    const avgIdErr = withError.slice(-20).reduce((s, p) => s + Math.abs(p.id), 0) / 20;
    const avgIdRef = withoutError.slice(-20).reduce((s, p) => s + Math.abs(p.id), 0) / 20;
    expect(avgIdErr).toBeGreaterThanOrEqual(avgIdRef);
  });
});