import { describe, expect, it } from 'vitest';
import { autoNotchSearch, findMultipleResonances, createAutoNotchFilter } from './autoNotch';

describe('autoNotch', () => {
  const sampleCompliance = {
    Jmotor: 0.001,    // 电机惯量 kg·m²
    Jload: 0.005,     // 负载惯量
    Ks: 1000,         // 刚度 Nm/rad
    Ds: 0.01,         // 阻尼 Nm·s/rad
    backlashRad: 0,
  };

  describe('autoNotchSearch', () => {
    it('returns mechanical resonance frequencies from the model', () => {
      const result = autoNotchSearch({
        compliance: sampleCompliance,
        fs: 5000,
        freqMin: 10,
        freqMax: 1000,
        scanDurationSec: 1.5,
        chirpAmplitude: 0.3,
      });

      expect(result.mechanicalResonanceHz.length).toBeGreaterThan(0);
      // 两质量系统：fr = sqrt(Ks*(Jm+Jl)/(Jm*Jl)) / (2*PI)
      const expectedFr = Math.sqrt(1000 * (0.001 + 0.005) / (0.001 * 0.005)) / (2 * Math.PI);
      expect(result.mechanicalResonanceHz[0]).toBeCloseTo(expectedFr, 0);
    });

    it('returns a resonanceHz value', () => {
      const result = autoNotchSearch({
        compliance: sampleCompliance,
        fs: 5000,
        freqMin: 10,
        freqMax: 1000,
        scanDurationSec: 1.0,
        chirpAmplitude: 0.5,
      });

      expect(result.resonanceHz).not.toBeNull();
      if (result.resonanceHz !== null) {
        expect(result.resonanceHz).toBeGreaterThan(0);
      }
    });

    it('identifies drifted resonance within 10% across engaged presets (round-24 chirp phase regression)', () => {
      // 回归：chirp 相位必须积分累加（∫f dτ），写成 sin(2π·f(t)·t) 会以
      // 双倍速率扫频，谱峰系统性偏移——agedDrive 曾抓到 177 Hz（真值 139 Hz）。
      // backlash=0 模拟产线预紧后扫频（AutoNotchCard 的用法）。
      const presets = [
        { Jmotor: 5e-3, Jload: 2e-2, Ks: 14000, Ds: 2, backlashRad: 0 },      // industrialFanBelt
        { Jmotor: 1.2e-3, Jload: 8e-3, Ks: 1500, Ds: 0.15, backlashRad: 0 },  // roboticJoint（预紧）
        { Jmotor: 1.2e-3, Jload: 8e-3, Ks: 800, Ds: 0.04, backlashRad: 0 },   // agedDrive（预紧）
      ];
      for (const nominal of presets) {
        for (const drift of [-0.3, 0, 0.3]) {
          const compliance = { ...nominal, Ks: nominal.Ks * (1 + drift) };
          const expectedFr = Math.sqrt(compliance.Ks * (compliance.Jmotor + compliance.Jload)
            / (compliance.Jmotor * compliance.Jload)) / (2 * Math.PI);
          const r = autoNotchSearch({
            compliance,
            fs: 2000,
            freqMin: 10,
            freqMax: 600,
            scanDurationSec: 1.0,
            chirpAmplitude: 0.5,
          });
          expect(r.resonanceHz).not.toBeNull();
          expect(Math.abs(r.resonanceHz! - expectedFr) / expectedFr).toBeLessThan(0.1);
        }
      }
    });

    it('returns spectrum with data points', () => {
      const result = autoNotchSearch({
        compliance: sampleCompliance,
        fs: 5000,
        freqMin: 1,
        freqMax: 500,
        scanDurationSec: 4.0,
        chirpAmplitude: 2.0,
      });

      expect(result.spectrum.length).toBeGreaterThan(10);
      // 有频谱数据返回 — 调查峰值，可能不是精确值
      expect(result.resonanceHz).not.toBeNull();
    });
  });

  describe('findMultipleResonances', () => {
    it('finds single peak in simple spectrum', () => {
      const spectrum = [
        { freq: 10, mag: 0.01 },
        { freq: 50, mag: 0.02 },
        { freq: 100, mag: 0.5 },  // peak
        { freq: 150, mag: 0.03 },
        { freq: 200, mag: 0.01 },
      ];
      const peaks = findMultipleResonances(spectrum, 50, 0.05);
      expect(peaks.length).toBeGreaterThanOrEqual(1);
      expect(peaks[0].freq).toBe(100);
    });

    it('finds multiple peaks with sufficient separation', () => {
      const spectrum = [
        { freq: 10, mag: 0.01 },
        { freq: 80, mag: 0.3 },   // peak 1
        { freq: 90, mag: 0.1 },
        { freq: 200, mag: 0.4 },  // peak 2
        { freq: 250, mag: 0.01 },
      ];
      const peaks = findMultipleResonances(spectrum, 50, 0.05);
      expect(peaks.length).toBe(2);
    });
  });

  describe('createAutoNotchFilter', () => {
    it('creates a functional notch filter', () => {
      const filter = createAutoNotchFilter(100, 10000, 5);
      expect(filter).toBeDefined();
      expect(typeof filter.step).toBe('function');

      // Step response: DC should pass through (notch doesn't block DC)
      const dcOut = filter.step(1);
      expect(dcOut).toBeGreaterThan(0.9);
    });
  });
});