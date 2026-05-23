import { describe, expect, it } from 'vitest';
import { sampleCoggingParams } from './cogging';
import {
  buildFfcLut,
  evaluateFfc,
  lookupFfc,
} from './coggingCompensation';

const Kt = 1.5 * 4 * 0.045;   // p=4 ψf=0.045 → 0.27 N·m/A

describe('buildFfcLut', () => {
  it('LUT 长度等于 size，stepRad = 2π/N', () => {
    const lut = buildFfcLut(64, sampleCoggingParams.hitachi15HP, Kt);
    expect(lut.size).toBe(64);
    expect(lut.values).toHaveLength(64);
    expect(lut.stepRad).toBeCloseTo((2 * Math.PI) / 64, 6);
  });

  it('size 太小自动 clamp 到最少 8', () => {
    const lut = buildFfcLut(4, sampleCoggingParams.hitachi15HP, Kt);
    expect(lut.size).toBe(8);
  });
});

describe('lookupFfc', () => {
  it('θ wrap：负角与正角等价', () => {
    const lut = buildFfcLut(128, sampleCoggingParams.hitachi15HP, Kt);
    const a = lookupFfc(Math.PI / 3, lut);
    const b = lookupFfc(Math.PI / 3 - 2 * Math.PI, lut);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('evaluateFfc', () => {
  it('完美 LUT (size=512) + 零角度误差 → 抑制 > 30 dB', () => {
    const lut = buildFfcLut(512, sampleCoggingParams.hitachi15HP, Kt);
    const r = evaluateFfc(lut, sampleCoggingParams.hitachi15HP, Kt, 0);
    expect(r.suppressionDb).toBeGreaterThan(30);
    expect(r.rmsAfterNm).toBeLessThan(r.rmsBeforeNm * 0.05);
  });

  it('LUT 长度越大、抑制越强（hitachi 12槽8极主频 24/rev，N 必须 ≥ 48 才过 Nyquist）', () => {
    const lutSmall = buildFfcLut(32, sampleCoggingParams.hitachi15HP, Kt);
    const lutLarge = buildFfcLut(256, sampleCoggingParams.hitachi15HP, Kt);
    const rSmall = evaluateFfc(lutSmall, sampleCoggingParams.hitachi15HP, Kt, 0);
    const rLarge = evaluateFfc(lutLarge, sampleCoggingParams.hitachi15HP, Kt, 0);
    expect(rLarge.suppressionDb).toBeGreaterThan(rSmall.suppressionDb);
  });

  it('角度误差 5° → 抑制显著下降甚至变正（过补偿）', () => {
    const lut = buildFfcLut(256, sampleCoggingParams.hitachi15HP, Kt);
    const angleErr = (5 * Math.PI) / 180;
    const r = evaluateFfc(lut, sampleCoggingParams.hitachi15HP, Kt, angleErr);
    // 5° 估角误差应该让抑制比小角时差至少 6 dB
    const rPerfect = evaluateFfc(lut, sampleCoggingParams.hitachi15HP, Kt, 0);
    expect(r.suppressionDb).toBeLessThan(rPerfect.suppressionDb - 6);
  });
});
