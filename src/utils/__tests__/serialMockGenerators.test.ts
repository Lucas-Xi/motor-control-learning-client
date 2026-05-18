import { describe, expect, it } from 'vitest';
import {
  estimateDeadTimeUsFromDistortion,
  mockFaultInjectionSample,
  mockFocFlowSample,
  mockInverterSample,
  mockMotorBasicsSample,
} from '../serialMockGenerators';

describe('mockFocFlowSample', () => {
  it('iqRef / idRef 透传给定参数', () => {
    const s = mockFocFlowSample(10, { iqRef: 4, idRef: 0, kp: 0.8, ki: 50 });
    expect(s.iqRef).toBe(4);
    expect(s.idRef).toBe(0);
    expect(Number.isFinite(s.iqSim)).toBe(true);
    expect(Number.isFinite(s.iqReal)).toBe(true);
  });

  it('实测值在仿真附近（噪声 + 偏置范围内）', () => {
    const s = mockFocFlowSample(50, { iqRef: 5, idRef: 0, kp: 0.8, ki: 50, noiseA: 0.05, biasA: 0.02 });
    expect(Math.abs(s.iqReal - s.iqSim)).toBeLessThan(0.25);
  });

  it('确定性：相同 t 与参数 → 相同输出', () => {
    const a = mockFocFlowSample(25, { iqRef: 4, idRef: 0, kp: 0.8, ki: 50 });
    const b = mockFocFlowSample(25, { iqRef: 4, idRef: 0, kp: 0.8, ki: 50 });
    expect(a.iqReal).toBe(b.iqReal);
    expect(a.iqSim).toBe(b.iqSim);
  });
});

describe('mockMotorBasicsSample', () => {
  it('rpm=0 → 理论角度恒为 0（包到 [0, 2π) 后 0）', () => {
    const s = mockMotorBasicsSample(100, { rpm: 0, polePairs: 4, noiseRad: 0 });
    expect(s.thetaTheory).toBeCloseTo(0, 6);
  });

  it('theta 包在 [0, 2π) 内', () => {
    for (const t of [10, 50, 200, 1000]) {
      const s = mockMotorBasicsSample(t, { rpm: 1500, polePairs: 4 });
      expect(s.thetaReal).toBeGreaterThanOrEqual(0);
      expect(s.thetaReal).toBeLessThan(2 * Math.PI);
      expect(s.thetaTheory).toBeGreaterThanOrEqual(0);
      expect(s.thetaTheory).toBeLessThan(2 * Math.PI);
    }
  });

  it('alignOffsetRad 引入常数偏移（弱噪声场景下近似 = offset）', () => {
    const s = mockMotorBasicsSample(10, {
      rpm: 600,
      polePairs: 4,
      noiseRad: 0,
      alignOffsetRad: 0.3,
    });
    // wrap 后 |Δθ − 0.3| 应较小
    expect(Math.abs(s.thetaError - 0.3)).toBeLessThan(1e-3);
  });

  it('polePairsReal != polePairs → 误差随 t 显著增长', () => {
    const s1 = mockMotorBasicsSample(50, { rpm: 600, polePairs: 4, polePairsReal: 5, noiseRad: 0 });
    const s2 = mockMotorBasicsSample(100, { rpm: 600, polePairs: 4, polePairsReal: 5, noiseRad: 0 });
    expect(Math.abs(s1.thetaError)).toBeGreaterThan(0);
    expect(Math.abs(s2.thetaError)).not.toEqual(Math.abs(s1.thetaError));
  });
});

describe('mockInverterSample', () => {
  it('理论相电压 = (duty − 0.5) × Udc（在 modAngleRad=0 时校核）', () => {
    const s = mockInverterSample(0, {
      uDc: 310,
      dutyA: 0.5,
      dutyB: 0.5,
      dutyC: 0.5,
      deadTimeUs: 0,
      pwmFrequency: 6000,
      noiseV: 0,
      modAngleRad: 0,
    });
    // sin(0)=0, sin(-2π/3) ≈ -0.866, sin(2π/3) ≈ 0.866
    expect(s.vaTheory).toBeCloseTo(0, 6);
    expect(s.vbTheory).toBeCloseTo(0.35 * Math.sin(-(2 * Math.PI) / 3) * 310, 4);
    expect(s.vcTheory).toBeCloseTo(0.35 * Math.sin((2 * Math.PI) / 3) * 310, 4);
  });

  it('deadTimeUs > 0 → 实测与理论存在畸变（无噪声场景）', () => {
    const noDead = mockInverterSample(2, {
      uDc: 310,
      dutyA: 0.5,
      dutyB: 0.5,
      dutyC: 0.5,
      deadTimeUs: 0,
      pwmFrequency: 6000,
      noiseV: 0,
    });
    const withDead = mockInverterSample(2, {
      uDc: 310,
      dutyA: 0.5,
      dutyB: 0.5,
      dutyC: 0.5,
      deadTimeUs: 4,
      pwmFrequency: 6000,
      noiseV: 0,
    });
    expect(noDead.deadTimeDistortion).toBeCloseTo(0, 6);
    expect(withDead.deadTimeDistortion).toBeGreaterThan(0);
    // 至少一相的实测 - 理论差异 > 0
    const maxErr = Math.max(
      Math.abs(withDead.vaReal - withDead.vaTheory),
      Math.abs(withDead.vbReal - withDead.vbTheory),
      Math.abs(withDead.vcReal - withDead.vcTheory),
    );
    expect(maxErr).toBeGreaterThan(0.5);
  });
});

describe('estimateDeadTimeUsFromDistortion', () => {
  it('用畸变峰值反推 t_dead', () => {
    // 给定 t_dead=2μs、Udc=310V、fsw=6kHz → deadLoss = 2e-6 × 6e3 = 0.012
    // V_error_peak ≈ deadLoss × Udc = 3.72V
    const est = estimateDeadTimeUsFromDistortion(3.72, 310, 6000);
    expect(est).toBeCloseTo(2, 1);
  });

  it('Udc 或 fsw = 0 → 安全返回 0', () => {
    expect(estimateDeadTimeUsFromDistortion(5, 0, 6000)).toBe(0);
    expect(estimateDeadTimeUsFromDistortion(5, 310, 0)).toBe(0);
  });
});

describe('mockFaultInjectionSample', () => {
  it('trigger 之前 faulted=false / tripped=false', () => {
    const s = mockFaultInjectionSample(10, {
      faultType: 'over-current',
      severity: 0.8,
      triggerMs: 30,
      ocpDelayUs: 800,
    });
    expect(s.faulted).toBe(false);
    expect(s.tripped).toBe(false);
  });

  it('trigger 之后立即 faulted=true', () => {
    const s = mockFaultInjectionSample(31, {
      faultType: 'over-current',
      severity: 0.8,
      triggerMs: 30,
      ocpDelayUs: 800,
    });
    expect(s.faulted).toBe(true);
  });

  it('保护切断后电流 → 0 且 tripped=true', () => {
    const s = mockFaultInjectionSample(100, {
      faultType: 'over-current',
      severity: 0.8,
      triggerMs: 30,
      ocpDelayUs: 800,
    });
    expect(s.tripped).toBe(true);
    expect(s.ia).toBeCloseTo(0, 6);
    expect(s.ib).toBeCloseTo(0, 6);
    expect(s.ic).toBeCloseTo(0, 6);
  });

  it('状态位故障（oil-low）退化为零电流 + 仅 faulted flag', () => {
    const s = mockFaultInjectionSample(60, {
      faultType: 'oil-low',
      severity: 0.6,
      triggerMs: 30,
    });
    expect(s.ia).toBe(0);
    expect(s.faulted).toBe(true);
    expect(s.tripped).toBe(false);
  });
});
