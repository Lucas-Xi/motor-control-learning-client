import { describe, expect, it } from 'vitest';
import {
  computePidBode, findUltimateGain, znTuning,
  findGainCrossover, evaluatePlantContinuous,
  computePlantBode,
} from './pidFrequency';

describe('pidFrequency', () => {
  describe('computePidBode', () => {
    it('returns correct number of points', () => {
      const data = computePidBode({ kp: 2, ki: 0, kd: 0 }, 0.1, 1000, 100);
      expect(data.length).toBe(100);
    });

    it('P-only: magnitude = 20*log10(Kp) at all frequencies (Ki=0, Kd=0)', () => {
      const kp = 5;
      const data = computePidBode({ kp, ki: 0, kd: 0 }, 0.1, 1000, 20);
      for (const pt of data) {
        expect(pt.magnitudeDb).toBeCloseTo(20 * Math.log10(kp), 1);
        expect(pt.phaseDeg).toBeCloseTo(0, 1);
      }
    });

    it('PI: phase goes from -90° (low freq) to 0° (high freq)', () => {
      const data = computePidBode({ kp: 2, ki: 10, kd: 0 }, 0.1, 1000, 50);
      const lowFreqPhase = data[0].phaseDeg;
      const highFreqPhase = data[data.length - 1].phaseDeg;
      expect(lowFreqPhase).toBeLessThan(-50);  // 低频趋近 -90°
      expect(highFreqPhase).toBeGreaterThan(-10); // 高频趋近 0°
    });

    it('PID with derivative filter: phase phase-lags above corner', () => {
      const data = computePidBode({ kp: 2, ki: 10, kd: 0.1, n: 100 }, 0.1, 1000, 50);
      const maxPhase = Math.max(...data.map((d) => d.phaseDeg));
      // 微分项给正相位贡献，某些频率相位应 > 0
      expect(maxPhase).toBeGreaterThan(10);
    });
  });

  describe('findUltimateGain', () => {
    it('returns null for P-only (no -180° crossing)', () => {
      const bode = computePidBode({ kp: 2, ki: 0, kd: 0 }, 0.1, 1000, 100);
      expect(findUltimateGain(bode)).toBeNull();
    });

    it('finds Ku/Tu for 3rd order plant with 180° crossing', () => {
      // G(s) = 1 / ((s+1)(s+2)(s+3)) — 三阶系统必然穿越 -180°
      const bode = computePlantBode([1], [1, 6, 11, 6], 0.01, 100, 300);
      const ult = findUltimateGain(bode);
      expect(ult).not.toBeNull();
      if (ult) {
        expect(ult.Ku).toBeGreaterThan(0.1);
        expect(ult.Tu).toBeGreaterThan(0.01);
        expect(ult.fu).toBeGreaterThan(0);
      }
    });
  });

  describe('znTuning', () => {
    it('returns PID values from classic formula', () => {
      const r = znTuning(10, 0.1);
      expect(r.kp).toBeCloseTo(6, 1);
      expect(r.ki).toBeCloseTo(6 / 0.05, 0);  // 0.5*Tu = 0.05
      expect(r.kd).toBeCloseTo(6 * 0.0125, 4); // 0.125*Tu = 0.0125
    });

    it('P-only type returns Ki=0 Kd=0', () => {
      const r = znTuning(10, 0.1, 'P');
      expect(r.kp).toBeCloseTo(5, 1);
      expect(r.ki).toBe(0);
      expect(r.kd).toBe(0);
    });
  });

  describe('findGainCrossover', () => {
    it('returns null if magnitude never crosses 0dB', () => {
      // Kp=0.001 永远 < 0dB
      const bode = computePidBode({ kp: 0.001, ki: 0, kd: 0 }, 1, 100, 50);
      expect(findGainCrossover(bode)).toBeNull();
    });
  });

  describe('evaluatePlantContinuous + computePlantBode', () => {
    it('evaluates a first-order plant correctly at DC', () => {
      // G(s) = 1 / (s + 1), at s=j0 → |G|=1, phase=0
      const p = evaluatePlantContinuous([1], [1, 1], 0);
      expect(p.mag).toBeCloseTo(1, 4);
      expect(p.phase).toBeCloseTo(0, 4);
    });

    it('evaluates a second-order plant magnitude', () => {
      // G(s) = 5000 / (s^2 + 100s + 5000)
      const p = evaluatePlantContinuous([5000], [1, 100, 5000], 0);
      expect(p.mag).toBeCloseTo(1, 3);
    });

    it('computePlantBode returns correct number of points', () => {
      const data = computePlantBode([5000], [1, 100, 5000], 1, 100, 10);
      expect(data.length).toBe(10);
      expect(data[0].freq).toBeCloseTo(1, 3);
    });
  });
});
