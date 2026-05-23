import { describe, expect, it } from 'vitest';
import { sampleComplianceParams } from './mechanicalCompliance';
import { simulateNotchSweep } from './resonanceSuppression';

const Kt = 1.5 * 4 * 0.045;   // 0.27 N·m/A

const baseInput = {
  params: sampleComplianceParams.industrialFanBelt,
  omegaRefRadS: 100,
  Kp: 0.4,
  Ki: 5,
  Kt,
  durationSec: 0.25,
  dtSec: 1e-4,
};

describe('simulateNotchSweep', () => {
  it('陷波中心 = 共振频率（detuneFrac = 0）', () => {
    const r = simulateNotchSweep({ ...baseInput, useNotch: true, detuneFrac: 0 });
    expect(r.notchCenterHz).toBeCloseTo(r.resonanceHz, 3);
  });

  it('detune ±10% → 陷波中心偏离同比例', () => {
    const r = simulateNotchSweep({ ...baseInput, useNotch: true, detuneFrac: 0.1 });
    expect(r.notchCenterHz).toBeCloseTo(r.resonanceHz * 1.1, 3);
  });

  it('启陷波 vs 不启 → iqMotor 序列不同（验证滤波生效，非全等）', () => {
    const off = simulateNotchSweep({ ...baseInput, useNotch: false });
    const on = simulateNotchSweep({ ...baseInput, useNotch: true, Q: 8 });
    // 至少 30% 的采样点上两条 iqMotor 数值不同（typical biquad notch 会显著改变信号）
    let diff = 0;
    const N = Math.min(off.samples.length, on.samples.length);
    for (let i = 0; i < N; i += 1) {
      if (Math.abs(off.samples[i].iqMotor - on.samples[i].iqMotor) > 1e-3) diff += 1;
    }
    expect(diff / N).toBeGreaterThan(0.3);
  });

  it('useNotch=false 时 iqMotor 与 iqRaw 完全相等', () => {
    const r = simulateNotchSweep({ ...baseInput, useNotch: false });
    for (const s of r.samples) {
      expect(s.iqMotor).toBe(s.iqRaw);
    }
  });

  it('采样点全部数值有限（无 NaN/Infinity，定点 q15 移植关键前提）', () => {
    const r = simulateNotchSweep({ ...baseInput, useNotch: true, Q: 12 });
    for (const s of r.samples) {
      expect(Number.isFinite(s.omegaMotor)).toBe(true);
      expect(Number.isFinite(s.iqMotor)).toBe(true);
      expect(Number.isFinite(s.Tspring)).toBe(true);
    }
  });
});
