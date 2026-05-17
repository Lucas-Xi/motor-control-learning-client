import { describe, expect, it } from 'vitest';
import { computeSingleSidedSpectrum, computeTHD } from '../dft';

describe('computeSingleSidedSpectrum', () => {
  it('DC 信号：能量集中在 0 Hz', () => {
    const N = 128;
    const samples = new Array(N).fill(5);
    const { mag } = computeSingleSidedSpectrum(samples, 1000);
    expect(mag[0]).toBeCloseTo(5, 2);
    // 其它 bin 应接近 0
    for (let k = 1; k < mag.length; k += 1) {
      expect(mag[k]).toBeLessThan(0.001);
    }
  });

  it('纯单频正弦：峰值出现在对应 freq bin，幅值≈A', () => {
    const N = 200;
    const fs = 2000;
    const f0 = 100;  // 选整除：100Hz = 10 周期 / 200 样本 fs=2k
    const A = 3;
    const samples = Array.from({ length: N }, (_, n) => A * Math.sin((2 * Math.PI * f0 * n) / fs));
    const { freq, mag } = computeSingleSidedSpectrum(samples, fs);
    // 找最大幅值的 bin
    let maxIdx = 0;
    for (let k = 1; k < mag.length; k += 1) if (mag[k] > mag[maxIdx]) maxIdx = k;
    expect(freq[maxIdx]).toBeCloseTo(f0, 0);
    expect(mag[maxIdx]).toBeCloseTo(A, 1);
  });

  it('基频 + 5 次谐波：两个峰', () => {
    const N = 200;
    const fs = 2000;
    const f0 = 50;
    const samples = Array.from({ length: N }, (_, n) => {
      const t = n / fs;
      return Math.sin(2 * Math.PI * f0 * t) + 0.3 * Math.sin(2 * Math.PI * f0 * 5 * t);
    });
    const { freq, mag } = computeSingleSidedSpectrum(samples, fs);
    // 找最大两个峰
    const peaks = freq.map((f, k) => ({ f, m: mag[k] })).sort((a, b) => b.m - a.m).slice(0, 2);
    const peakFreqs = peaks.map((p) => p.f).sort((a, b) => a - b);
    expect(peakFreqs[0]).toBeCloseTo(50, 0);
    expect(peakFreqs[1]).toBeCloseTo(250, 0);
  });

  it('N < 2 返回空数组', () => {
    expect(computeSingleSidedSpectrum([], 1000).mag).toEqual([]);
    expect(computeSingleSidedSpectrum([1], 1000).mag).toEqual([]);
  });
});

describe('computeTHD', () => {
  it('纯单频 → THD ≈ 0', () => {
    const N = 200;
    const fs = 2000;
    const samples = Array.from({ length: N }, (_, n) => Math.sin((2 * Math.PI * 50 * n) / fs));
    const { mag } = computeSingleSidedSpectrum(samples, fs);
    const thd = computeTHD(mag);
    expect(thd).toBeLessThan(0.1);
  });

  it('基频 1 + 5 次谐波 0.3 → THD ≈ 30%', () => {
    const N = 200;
    const fs = 2000;
    const f0 = 50;
    const samples = Array.from({ length: N }, (_, n) => {
      const t = n / fs;
      return Math.sin(2 * Math.PI * f0 * t) + 0.3 * Math.sin(2 * Math.PI * f0 * 5 * t);
    });
    const { mag } = computeSingleSidedSpectrum(samples, fs);
    const thd = computeTHD(mag);
    expect(thd).toBeGreaterThan(28);
    expect(thd).toBeLessThan(32);
  });

  it('零信号 → NaN（无基频可识别）', () => {
    const mag = new Array(100).fill(0);
    const thd = computeTHD(mag);
    expect(Number.isNaN(thd)).toBe(true);
  });
});
