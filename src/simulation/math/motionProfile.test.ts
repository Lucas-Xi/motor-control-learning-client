import { describe, expect, it } from 'vitest';
import { planSCurve, computeSCurveMetrics, computePositionFeedforward } from './motionProfile';

describe('motionProfile S曲线', () => {
  const defaultInput = {
    p0: 0,
    v0: 0,
    p1: 10,
    v1: 0,
    vMax: 2,
    aMax: 5,
    jMax: 50,
    dt: 0.001,
  };

  describe('planSCurve', () => {
    it('总时间 > 0', () => {
      const r = planSCurve(defaultInput);
      expect(r.totalTime).toBeGreaterThan(0);
      expect(r.feasible).toBe(true);
    });

it('终点位置 = p1（通过 segment 积累）', () => {
      const r = planSCurve(defaultInput);
      const lastSeg = r.segments[r.segments.length - 1];
      expect(lastSeg.pEnd).toBeCloseTo(10, 2);
    });

    it('终点速度 ≈ 0', () => {
      const r = planSCurve(defaultInput);
      const lastSeg = r.segments[r.segments.length - 1];
      expect(Math.abs(lastSeg.vEnd)).toBeLessThan(0.01);
    });

    it('轨迹数组越长时间越长', () => {
      const fast = planSCurve({ ...defaultInput, dt: 0.01 });
      const slow = planSCurve({ ...defaultInput, dt: 0.001 });
      expect(slow.trajectory.length).toBeGreaterThan(fast.trajectory.length);
    });

    it('正反向都工作', () => {
      const fwd = planSCurve(defaultInput);
      const rev = planSCurve({ ...defaultInput, p0: 10, p1: 0 });
      expect(fwd.totalTime).toBeGreaterThan(0);
      expect(rev.totalTime).toBeGreaterThan(0);
      expect(fwd.totalTime).toBeCloseTo(rev.totalTime, 1);
    });

    it('短距离自动降速', () => {
      const r = planSCurve({ ...defaultInput, p1: 0.1 });
      expect(r.feasible).toBe(true);
      expect(r.trajectory.length).toBeGreaterThan(1);
    });

    it('非零初速度', () => {
      const r = planSCurve({ ...defaultInput, v0: 1 });
      expect(r.trajectory.length).toBeGreaterThan(1);
    });

    it('速度不超过 vMax', () => {
      const r = planSCurve(defaultInput);
      const maxV = Math.max(...r.trajectory.map((p) => Math.abs(p.v)));
      expect(maxV).toBeLessThanOrEqual(2.01);
    });

    it('加速度不超过 aMax', () => {
      const r = planSCurve(defaultInput);
      const maxA = Math.max(...r.trajectory.map((p) => Math.abs(p.a)));
      expect(maxA).toBeLessThanOrEqual(5.1);
    });
  });

  describe('computeSCurveMetrics', () => {
    it('返回合理的指标', () => {
      const r = planSCurve(defaultInput);
      const m = computeSCurveMetrics(r);
      expect(m.totalTime).toBeGreaterThan(0);
      expect(m.peakVelocity).toBeLessThanOrEqual(2.1);
      expect(m.avgVelocity).toBeGreaterThan(0);
    });
  });

  describe('computePositionFeedforward', () => {
    it('时间 t=0 时前馈速度为 0', () => {
      const r = planSCurve(defaultInput);
      const ff = computePositionFeedforward(r, 0);
      expect(Math.abs(ff.vFeedForward)).toBeLessThan(0.01);
    });

    it('时间在中间时前馈速度 > 0', () => {
      const r = planSCurve(defaultInput);
      const ff = computePositionFeedforward(r, r.totalTime / 2);
      expect(ff.vFeedForward).toBeGreaterThan(0);
    });
  });
});