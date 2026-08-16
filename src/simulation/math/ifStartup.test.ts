import { describe, expect, it } from 'vitest';
import { simulateIFStartup, recommendIFParams } from './ifStartup';

describe('simulateIFStartup', () => {
  const defaultInput = {
    iMin: 1,
    iMax: 5,
    switchFreqHz: 20,
    rampRateHzPerSec: 8,
    leadAngleDeg: 20,
    polePairs: 4,
    inertia: 0.002,
    damping: 0.001,
    loadTorque: 0.1,
    dt: 0.002,
  };

  it('生成轨迹且终态转速 > 0', () => {
    const r = simulateIFStartup(defaultInput);
    expect(r.trajectory.length).toBeGreaterThan(10);
    const last = r.trajectory[r.trajectory.length - 1];
    expect(last.rotorRpm).toBeGreaterThan(0);
  });

  it('频率从 0 开始斜坡增加到 switchFreqHz', () => {
    const r = simulateIFStartup(defaultInput);
    expect(r.trajectory[0].freqRef).toBeCloseTo(0, 1);
    const last = r.trajectory[r.trajectory.length - 1];
    expect(last.freqRef).toBeGreaterThanOrEqual(19);
  });

  it('电流幅值随频率升高而降低', () => {
    const r = simulateIFStartup(defaultInput);
    const early = r.trajectory[10];
    const late = r.trajectory[Math.floor(r.trajectory.length * 0.8)];
    expect(late.iRef).toBeLessThanOrEqual(early.iRef);
  });

  it('默认工况成功切换且 handoffTime < 6 s', () => {
    const r = simulateIFStartup(defaultInput);
    expect(r.success).toBe(true);
    expect(r.handoffTime).not.toBeNull();
    expect(r.handoffTime as number).toBeLessThan(6);
  });

  it('rpmRef ≈ freqRef × 60 / polePairs', () => {
    const r = simulateIFStartup(defaultInput);
    const last = r.trajectory[r.trajectory.length - 1];
    expect(last.rpmRef).toBeCloseTo(last.freqRef * 60 / defaultInput.polePairs, 5);
  });

  it('大负载拉出：loadTorque=2.0 不得成功切换', () => {
    const r = simulateIFStartup({ ...defaultInput, loadTorque: 2.0 });
    expect(r.success).toBe(false);
    expect(r.pullOut || !r.success).toBe(true);
  });

  it('过快斜坡更容易失步或负载角更大', () => {
    const slow = simulateIFStartup(defaultInput);
    const fast = simulateIFStartup({ ...defaultInput, rampRateHzPerSec: 80 });
    expect(fast.lostSync || fast.maxLoadAngleDeg > slow.maxLoadAngleDeg).toBe(true);
  });

  it('成功工况负载角有限且 |maxLoadAngleDeg| < 180', () => {
    const r = simulateIFStartup(defaultInput);
    expect(r.success).toBe(true);
    expect(Number.isFinite(r.maxLoadAngleDeg)).toBe(true);
    expect(Math.abs(r.maxLoadAngleDeg)).toBeLessThan(180);
  });
});

describe('recommendIFParams', () => {
  it('返回合理的参数', () => {
    const p = recommendIFParams(10);
    expect(p.iMax).toBeGreaterThan(p.iMin);
    expect(p.iMax).toBeLessThanOrEqual(10);
    expect(p.rampRateHzPerSec).toBeGreaterThan(0);
    expect(p.leadAngleDeg).toBeGreaterThan(0);
  });
});
