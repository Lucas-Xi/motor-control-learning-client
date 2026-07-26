import { describe, expect, it } from 'vitest';
import {
  createPIDState,
  pidStep,
  piStep,
  simulatePidStepResponse,
  calculateStepMetrics,
  type PIDGains,
} from './pid';

describe('createPIDState', () => {
  it('returns zero-initialized state', () => {
    const state = createPIDState();
    expect(state.integral).toBe(0);
    expect(state.previousError).toBe(0);
    expect(state.previousMeasurement).toBe(0);
  });
});

describe('pidStep', () => {
  it('P-only: output = kp * error', () => {
    const state = createPIDState();
    const r = pidStep({
      setpoint: 10,
      measurement: 5,
      dt: 0.001,
      gains: { kp: 2, ki: 0, kd: 0 },
      state,
    });
    expect(r.error).toBeCloseTo(5, 6);
    expect(r.p).toBeCloseTo(10, 4);
    expect(r.i).toBeCloseTo(0, 6);
    expect(r.d).toBeCloseTo(0, 6);
    expect(r.output).toBeCloseTo(10, 4);
  });

  it('integrates error over time (I term grows)', () => {
    const state = createPIDState();
    const gains: PIDGains = { kp: 0, ki: 100, kd: 0 };
    const r1 = pidStep({ setpoint: 1, measurement: 0, dt: 0.01, gains, state });
    const r2 = pidStep({ setpoint: 1, measurement: 0, dt: 0.01, gains, state: r1.state });
    expect(r2.i).toBeGreaterThan(1);  // ki * (0.01+0.01) * 1 = 2
  });

  it('derivative on measurement dampens changes', () => {
    const state = createPIDState();
    const gains: PIDGains = { kp: 0, ki: 0, kd: 5 };
    const r = pidStep({ setpoint: 1, measurement: 1, dt: 0.001, gains, state });
    expect(r.d).toBeLessThan(0);  // measurement increased → negative derivative term
  });

  it('clamps output to limits', () => {
    const state = createPIDState();
    const r = pidStep({
      setpoint: 100, measurement: 0, dt: 0.001,
      gains: { kp: 50, ki: 0, kd: 0 },
      limits: { min: -10, max: 10 }, state,
    });
    expect(r.output).toBe(10);
  });

  it('anti-windup back-calculates integral when saturated', () => {
    const state = createPIDState();
    const r = pidStep({
      setpoint: 100, measurement: 0, dt: 0.01,
      gains: { kp: 5, ki: 100, kd: 0 },
      limits: { min: -10, max: 10 },
      antiWindup: true, state,
    });
    // 输出撞上限 10 → integral = (10 - p) / ki
    expect(r.state.integral).toBeLessThan(0);
    expect(r.saturated).toBe(true);
  });

  it('handles dt=0 gracefully (clamped to 1e-6)', () => {
    const state = createPIDState();
    expect(() => pidStep({
      setpoint: 1, measurement: 0, dt: 0,
      gains: { kp: 1, ki: 1, kd: 1 }, state,
    })).not.toThrow();
  });
});

describe('piStep', () => {
  it('produces output matching pidStep with kd=0', () => {
    const pi = piStep({ setpoint: 5, measurement: 2, dt: 0.001, gains: { kp: 3, ki: 10 }, state: createPIDState() });
    const pid = pidStep({ setpoint: 5, measurement: 2, dt: 0.001, gains: { kp: 3, ki: 10, kd: 0 }, state: createPIDState() });
    expect(Math.abs(pi.output - pid.output)).toBeLessThan(1e-6);
  });
});

describe('simulatePidStepResponse', () => {
  it('returns points array and has correct initial time', () => {
    const points = simulatePidStepResponse({ kp: 5, ki: 50, kd: 0.1 }, 1, 0.002, 0.5);
    expect(Array.isArray(points)).toBe(true);
    if (points.length > 0) {
      expect(points[0].t).toBe(0);
    }
  });
});

describe('calculateStepMetrics', () => {
  it('returns valid metrics for step response', () => {
    const target = 1;
    const points = simulatePidStepResponse({ kp: 12, ki: 60, kd: 0.3 }, target, 0.002, 1.0);
    const metrics = calculateStepMetrics(points, target);
    expect(metrics.overshootPercent).toBeGreaterThanOrEqual(0);
    if (metrics.riseTime !== null) {
      expect(metrics.riseTime).toBeGreaterThan(0);
    }
  });

  it('handles empty points array', () => {
    const metrics = calculateStepMetrics([], 10);
    expect(metrics.riseTime).toBeNull();
    expect(metrics.steadyStateError).toBeCloseTo(10, 4);
  });
});