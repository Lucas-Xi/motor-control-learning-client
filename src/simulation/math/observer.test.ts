import { describe, expect, it } from 'vitest';
import { blendObserverAngle, hardCutObserverAngle, sweepObserverBlend } from './observer';

describe('blendObserverAngle', () => {
  const hfi = 0.25;
  const bemf = 1.1;

  it('rpm<=low → ratio 0, angle=hfi', () => {
    const atLow = blendObserverAngle(hfi, bemf, 300, 300, 600);
    expect(atLow.blendRatio).toBe(0);
    expect(atLow.angle).toBe(hfi);

    const below = blendObserverAngle(hfi, bemf, 80, 300, 600);
    expect(below.blendRatio).toBe(0);
    expect(below.angle).toBe(hfi);
  });

  it('rpm>=high → ratio 1, angle=bemf', () => {
    const atHigh = blendObserverAngle(hfi, bemf, 600, 300, 600);
    expect(atHigh.blendRatio).toBe(1);
    expect(atHigh.angle).toBe(bemf);

    const above = blendObserverAngle(hfi, bemf, 1200, 300, 600);
    expect(above.blendRatio).toBe(1);
    expect(above.angle).toBe(bemf);
  });

  it('mid 450 with 300-600 → ratio ~0.5', () => {
    const mid = blendObserverAngle(hfi, bemf, 450, 300, 600);
    expect(mid.blendRatio).toBeCloseTo(0.5, 5);
  });
});

describe('sweepObserverBlend', () => {
  it('first rpm near min, last near max; blendRatio increases; length > 10', () => {
    const rpmMin = 0;
    const rpmMax = 1500;
    const samples = sweepObserverBlend({ rpmMin, rpmMax, points: 31 });
    expect(samples.length).toBeGreaterThan(10);
    expect(samples[0].rpm).toBeCloseTo(rpmMin, 5);
    expect(samples[samples.length - 1].rpm).toBeCloseTo(rpmMax, 5);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].blendRatio).toBeGreaterThanOrEqual(samples[i - 1].blendRatio - 1e-12);
    }
    expect(samples.every((s) => Number.isFinite(s.hardCutDeg))).toBe(true);
    expect(samples.every((s) => s.jumpDeg >= 0)).toBe(true);
  });

  it('hfiBias=20° 时中段 jumpDeg 明显大于 5°（硬切会吃这一跳）', () => {
    const samples = sweepObserverBlend({ hfiBiasDeg: 20, points: 31 });
    const mid = samples[Math.floor(samples.length / 2)];
    expect(mid.jumpDeg).toBeGreaterThan(5);
  });
});


describe('hardCutObserverAngle', () => {
  const hfi = 0.25;
  const bemf = 1.1;

  it('低于 switchRpm → HFI', () => {
    const r = hardCutObserverAngle(hfi, bemf, 400, 450);
    expect(r.source).toBe('hfi');
    expect(r.angle).toBe(hfi);
  });

  it('到达 switchRpm → BEMF，交接一次吃完 Δθ', () => {
    const r = hardCutObserverAngle(hfi, bemf, 450, 450);
    expect(r.source).toBe('bemf');
    expect(r.angle).toBe(bemf);
  });
});
