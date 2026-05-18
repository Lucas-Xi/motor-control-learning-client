import { describe, expect, it } from 'vitest';
import {
  estimateDeadTimeUsFromDistortion,
  mockFaultInjectionSample,
  mockFocFlowSample,
  mockHFISample,
  mockInverterSample,
  mockMotorBasicsSample,
  mockPfcSample,
  mockSpeedLoopSample,
  mockStartupSample,
} from '../serialMockGenerators';
import { startupDefault, apfDefault } from '../../simulation/engine/presets';

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

describe('mockSpeedLoopSample', () => {
  it('阶跃前 rpmRef = 0、rpmSim = 0', () => {
    const s = mockSpeedLoopSample(50, { rpmRef: 1500, stepMs: 100 });
    expect(s.rpmRef).toBe(0);
    expect(s.rpmSim).toBe(0);
  });

  it('阶跃后 rpmRef 等于指令', () => {
    const s = mockSpeedLoopSample(200, { rpmRef: 1500, stepMs: 100 });
    expect(s.rpmRef).toBe(1500);
    expect(Number.isFinite(s.rpmSim)).toBe(true);
  });

  it('确定性：相同入参 → 相同输出', () => {
    const a = mockSpeedLoopSample(250, { rpmRef: 1500, stepMs: 100, zeta: 0.5 });
    const b = mockSpeedLoopSample(250, { rpmRef: 1500, stepMs: 100, zeta: 0.5 });
    expect(a.rpmReal).toBe(b.rpmReal);
    expect(a.rpmSim).toBe(b.rpmSim);
  });

  it('rpmSim 最终收敛到指令附近（5 倍 τ ≈ 5/ωn 后）', () => {
    // ωn=50, ζ=0.7 → 5/50 = 100ms 足以稳定
    const s = mockSpeedLoopSample(800, {
      rpmRef: 1500,
      stepMs: 100,
      omegaN: 50,
      zeta: 0.7,
      noiseRpm: 0,
      steadyErrRpm: 0,
    });
    expect(Math.abs(s.rpmSim - 1500)).toBeLessThan(50);
  });
});

describe('mockHFISample', () => {
  it('注入电压幅值不超过 injectV', () => {
    for (const t of [10, 25, 80]) {
      const s = mockHFISample(t, { injectV: 30, injectFreqHz: 800, saliencyRatio: 2.0, rpm: 100 });
      expect(Math.abs(s.injectV)).toBeLessThanOrEqual(30 + 1e-9);
    }
  });

  it('thetaReal / thetaEst 都在 [0, 2π) 内', () => {
    const s = mockHFISample(50, { injectV: 30, injectFreqHz: 800, saliencyRatio: 2.0, rpm: 600 });
    expect(s.thetaReal).toBeGreaterThanOrEqual(0);
    expect(s.thetaReal).toBeLessThan(2 * Math.PI);
    expect(s.thetaEst).toBeGreaterThanOrEqual(0);
    expect(s.thetaEst).toBeLessThan(2 * Math.PI);
  });

  it('lockTauMs 几个 τ 后 |thetaErr| 显著小', () => {
    const early = mockHFISample(5, { injectV: 30, injectFreqHz: 800, saliencyRatio: 2.0, rpm: 600, lockTauMs: 10, noiseRad: 0 });
    const late = mockHFISample(150, { injectV: 30, injectFreqHz: 800, saliencyRatio: 2.0, rpm: 600, lockTauMs: 10, noiseRad: 0 });
    expect(Math.abs(late.thetaErr)).toBeLessThan(Math.abs(early.thetaErr));
  });

  it('saliencyEst 不小于 1（物理下限）', () => {
    const s = mockHFISample(60, { injectV: 30, injectFreqHz: 800, saliencyRatio: 1.0, rpm: 0 });
    expect(s.saliencyEst).toBeGreaterThanOrEqual(1.0);
  });
});

describe('mockStartupSample', () => {
  it('返回有效 state 与 rpm', () => {
    const s = mockStartupSample(500, { startup: startupDefault });
    expect(['idle', 'precharge', 'align', 'open-loop', 'hfi', 'bemf', 'fieldweak']).toContain(s.state);
    expect(Number.isFinite(s.rpmSim)).toBe(true);
    expect(Number.isFinite(s.rpmReal)).toBe(true);
  });

  it('rpmReal 在 rpmSim 附近（噪声 ±2σ 内）', () => {
    const s = mockStartupSample(2000, { startup: startupDefault, noiseRpm: 5 });
    expect(Math.abs(s.rpmReal - s.rpmSim)).toBeLessThan(20);
  });

  it('slugViolation 是布尔值', () => {
    const s = mockStartupSample(1000, { startup: startupDefault });
    expect(typeof s.slugViolation).toBe('boolean');
  });
});

describe('mockPfcSample', () => {
  it('返回 PF/THD/Udc 完整字段', () => {
    const r = mockPfcSample({ apf: apfDefault });
    expect(r.pfReal).toBeGreaterThanOrEqual(0);
    expect(r.pfReal).toBeLessThanOrEqual(1);
    expect(r.pfSim).toBeGreaterThanOrEqual(0);
    expect(r.thdReal).toBeGreaterThanOrEqual(0);
    expect(r.udcAvg).toBeGreaterThan(0);
    expect(r.udcRipple).toBeGreaterThanOrEqual(0);
  });

  it('实测 PF 在仿真 PF 下方（pfDegrade > 0 默认）', () => {
    const r = mockPfcSample({ apf: apfDefault, pfDegrade: 0.05 });
    expect(r.pfReal).toBeLessThanOrEqual(r.pfSim + 1e-6);
  });

  it('谐波柱状包含 3/5/7/9/11 次 + IEC 限值', () => {
    const r = mockPfcSample({ apf: apfDefault });
    expect(r.harmonics.map((h) => h.order)).toEqual([3, 5, 7, 9, 11]);
    for (const h of r.harmonics) {
      expect(h.iecLimitPct).not.toBeNull();
      expect(h.measuredPct).toBeGreaterThanOrEqual(0);
    }
  });

  it('iGridReal 长度与 iGridSim 相同', () => {
    const r = mockPfcSample({ apf: apfDefault, noiseA: 0.1 });
    expect(r.iGridReal.length).toBe(r.iGridSim.length);
  });
});
