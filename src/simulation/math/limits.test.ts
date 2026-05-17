import { describe, expect, it } from 'vitest';
import { applyLimits } from './limits';

const motor = {
  Ld: 0.0008,
  Lq: 0.0020,
  psi_f: 0.1,
  Ilim: 20,
  Vlim: 180, // 约 310 V Udc / √3
};

describe('applyLimits - 可行域内', () => {
  it('两个约束都不破时 feasible=true，原值返回', () => {
    const r = applyLimits({
      id: -2, iq: 5,
      Ilim: motor.Ilim, Vlim: motor.Vlim,
      omega_e: 200, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
    });
    expect(r.feasible).toBe(true);
    expect(r.activeConstraint).toBe('none');
    expect(r.projectedId).toBe(-2);
    expect(r.projectedIq).toBe(5);
    expect(r.currentMargin).toBeGreaterThan(0);
    expect(r.voltageMargin).toBeGreaterThan(0);
  });
});

describe('applyLimits - 电流圆', () => {
  it('仅破电流圆 → 沿原点连线投影到圆上', () => {
    const r = applyLimits({
      id: -15, iq: 20, // |I| ≈ 25 > Ilim=20
      Ilim: motor.Ilim, Vlim: 9999, // 电压不破
      omega_e: 10, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
    });
    expect(r.feasible).toBe(false);
    expect(r.activeConstraint).toBe('current');
    const projMag = Math.hypot(r.projectedId, r.projectedIq);
    expect(projMag).toBeCloseTo(motor.Ilim, 6);
    // 方向应保持
    expect(r.projectedId / r.projectedIq).toBeCloseTo(-15 / 20, 6);
  });

  it('电流刚好等于 Ilim：仍判为 feasible（边界非破）', () => {
    const r = applyLimits({
      id: 0, iq: motor.Ilim,
      Ilim: motor.Ilim, Vlim: 9999,
      omega_e: 0, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
    });
    expect(r.feasible).toBe(true);
  });
});

describe('applyLimits - 电压椭圆', () => {
  it('高速下椭圆收缩 → 仅破电压 → 沿椭圆中心方向投影', () => {
    // 高 ωe + id=0 → 椭圆中心在 -ψf/Ld = -125 A 处，原点 (0,0) 在椭圆右侧
    const r = applyLimits({
      id: 0, iq: 8,
      Ilim: 100, // 电流不破
      Vlim: motor.Vlim,
      omega_e: 1500, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
    });
    // |V| ≈ ωe·ψf = 1500 × 0.1 = 150 V，可能不破 → 用更高速度
    const r2 = applyLimits({
      id: 0, iq: 8,
      Ilim: 100,
      Vlim: motor.Vlim,
      omega_e: 3000, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
    });
    // |V| ≈ √(ωe·Lq·iq)² + (ωe·ψf)² = √(3000·0.002·8)² + (3000·0.1)² = √48² + 300² ≈ 303 > 180
    expect(r2.feasible).toBe(false);
    expect(r2.activeConstraint).toBe('voltage');
    // 投影后 |V| ≈ Vlim
    const vd = -3000 * motor.Lq * r2.projectedIq;
    const vq = 3000 * (motor.Ld * r2.projectedId + motor.psi_f);
    expect(Math.hypot(vd, vq)).toBeCloseTo(motor.Vlim, 0);
    void r;
  });
});

describe('applyLimits - 同时破两个约束', () => {
  it('两者都破 → activeConstraint=both，最终结果同时落在两个边界附近', () => {
    const r = applyLimits({
      id: 30, iq: 30, // |I|=42 破电流，且高速电压更破
      Ilim: motor.Ilim,
      Vlim: motor.Vlim,
      omega_e: 2000, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
    });
    expect(r.feasible).toBe(false);
    expect(r.activeConstraint).toBe('both');
    // 投影后电流幅值不超过 Ilim
    expect(Math.hypot(r.projectedId, r.projectedIq)).toBeLessThanOrEqual(motor.Ilim * 1.01);
  });
});

describe('applyLimits - Rs 影响', () => {
  it('Rs > 0 时电压估计应包含 Rs·id 项', () => {
    const r0 = applyLimits({
      id: -10, iq: 10,
      Ilim: 50, Vlim: motor.Vlim,
      omega_e: 1000, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
      Rs: 0,
    });
    const r1 = applyLimits({
      id: -10, iq: 10,
      Ilim: 50, Vlim: motor.Vlim,
      omega_e: 1000, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
      Rs: 0.5,
    });
    // Rs > 0 增加 |V|，voltageMargin 应更小
    expect(r1.voltageMargin).toBeLessThan(r0.voltageMargin);
  });
});

describe('applyLimits - 边界数值健壮性', () => {
  it('Ilim=0 / Vlim=0 时不会崩溃，按 1e-6 兜底', () => {
    const r = applyLimits({
      id: 1, iq: 1,
      Ilim: 0, Vlim: 0,
      omega_e: 100, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
    });
    expect(Number.isFinite(r.projectedId)).toBe(true);
    expect(Number.isFinite(r.projectedIq)).toBe(true);
  });

  it('omega_e=0 直流静止：电压约束极松（|V|≈Rs·I），主要受电流圆约束', () => {
    const r = applyLimits({
      id: -10, iq: 25,
      Ilim: motor.Ilim, Vlim: motor.Vlim,
      omega_e: 0, Ld: motor.Ld, Lq: motor.Lq, psi_f: motor.psi_f,
    });
    // ωe=0 + Rs=0 → 电压几乎为 0，仅电流破
    expect(r.activeConstraint).toBe('current');
  });
});
