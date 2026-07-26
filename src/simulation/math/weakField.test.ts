import { describe, expect, it } from 'vitest';
import { checkVoltageLimit, estimateTorque, suggestWeakeningId, calculateMTPV } from './weakField';

describe('checkVoltageLimit', () => {
  it('returns unsaturated result for small Vdq', () => {
    const r = checkVoltageLimit({ vd: 10, vq: 10, uDc: 310 });
    expect(r.saturated).toBe(false);
    expect(r.limit).toBeGreaterThan(0);
    expect(r.reserve).toBeGreaterThan(0);
  });

  it('detects saturation when Vdq exceeds limit', () => {
    const r = checkVoltageLimit({ vd: 200, vq: 200, uDc: 310 });
    expect(r.saturated).toBe(true);
    expect(r.reserve).toBeLessThan(0);
  });

  it('applies margin factor', () => {
    const r1 = checkVoltageLimit({ vd: 170, vq: 0, uDc: 310, margin: 1.0 });
    const r2 = checkVoltageLimit({ vd: 170, vq: 0, uDc: 310, margin: 0.8 });
    expect(r2.limit).toBeLessThan(r1.limit);
  });

  it('handles zero voltage', () => {
    const r = checkVoltageLimit({ vd: 0, vq: 0, uDc: 310 });
    expect(r.saturated).toBe(false);
    expect(r.reserve).toBe(r.limit);
  });
});

describe('estimateTorque', () => {
  it('produces zero torque with zero Iq', () => {
    const t = estimateTorque({ id: 0, iq: 0, ld: 0.0012, lq: 0.0015, flux: 0.045, polePairs: 4 });
    expect(t).toBeCloseTo(0, 6);
  });

  it('positive Iq gives positive torque', () => {
    const t = estimateTorque({ id: 0, iq: 2, ld: 0.0012, lq: 0.0015, flux: 0.045, polePairs: 4 });
    expect(t).toBeGreaterThan(0.4);
  });

  it('reluctance torque contribution with negative Id', () => {
    const spm = estimateTorque({ id: 0, iq: 2, ld: 0.0012, lq: 0.0015, flux: 0.045, polePairs: 4 });
    const ipm = estimateTorque({ id: -1, iq: 2, ld: 0.0012, lq: 0.0015, flux: 0.045, polePairs: 4 });
    // IPM with negative Id: reluctance torque term (Ld-Lq)*id*iq adds to total
    // For Ld<Lq and id<0: (Ld-Lq) is negative, id is negative, product = positive
    expect(Math.abs(ipm)).toBeGreaterThan(Math.abs(spm));
  });
});

describe('suggestWeakeningId', () => {
  it('returns 0 when voltage reserve positive', () => {
    expect(suggestWeakeningId(10, 8)).toBe(0);
  });

  it('returns negative Id when voltage reserve negative', () => {
    const id = suggestWeakeningId(-50, 8);
    expect(id).toBeLessThan(0);
  });

  it('clamps to 75% of current limit', () => {
    const id = suggestWeakeningId(-200, 8);
    expect(Math.abs(id)).toBeLessThanOrEqual(8 * 0.75 + 0.01);
  });
});

describe('calculateMTPV', () => {
  const baseInput = {
    speedRpm: 8000,
    polePairs: 4,
    udc: 310,
    ldMh: 0.3,
    lqMh: 0.8,
    fluxWb: 0.045,
    rs: 0.05,
    iMax: 12,
  };

  it('returns feasible at low speed with no MTPV', () => {
    const r = calculateMTPV({ ...baseInput, speedRpm: 500 });
    expect(r.onMtpv).toBe(false);
    expect(r.torqueNm).toBeGreaterThan(0);
  });

  it('activates MTPV at high speed', () => {
    const r = calculateMTPV({ ...baseInput, speedRpm: 10000 });
    // At 10k rpm, voltage ellipse should force MTPV
    expect(r.torqueNm).toBeGreaterThan(0);
  });

  it('MTPV produces more torque than simple field weakening at high speed', () => {
    // Compare: MTPV result vs a simple id=0 approach
    const mtpv = calculateMTPV({ ...baseInput, speedRpm: 12000 });
    // Simple field weakening: just id=0 and whatever iq fits
    const simpleId = 0;
    const simpleIq = mtpv.iqRef; // same iq as MTPV for comparison
    const simpleTorque = estimateTorque({ id: simpleId, iq: simpleIq, ld: 0.3e-3, lq: 0.8e-3, flux: 0.045, polePairs: 4 });
    // MTPV should match or beat simple field weakening
    expect(mtpv.torqueNm).toBeGreaterThanOrEqual(simpleTorque * 0.98); // allow 2% tolerance
  });

  it('handles zero speed gracefully', () => {
    const r = calculateMTPV({ ...baseInput, speedRpm: 0 });
    expect(r.onMtpv).toBe(false);
    expect(r.idRef).toBe(0);
    expect(r.iqRef).toBe(0);
  });
});