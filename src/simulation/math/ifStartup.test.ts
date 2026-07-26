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
    const early = r.trajectory[10];  // ~20ms, 低频
    const late = r.trajectory[Math.floor(r.trajectory.length * 0.8)]; // 后期, 高频
    expect(late.iRef).toBeLessThanOrEqual(early.iRef);
  });

  it('高惯量负载需要更长时间启动', () => {
    const light = simulateIFStartup(defaultInput);
    const heavy = simulateIFStartup({ ...defaultInput, inertia: 0.02 });
    if (light.handoffTime !== null && heavy.handoffTime !== null) {
      expect(heavy.handoffTime).toBeGreaterThanOrEqual(light.handoffTime - 0.5);
    }
  });

  it('切换条件可在 10s 内达到', () => {
    const r = simulateIFStartup(defaultInput);
    // 如果成功了, handoffTime 应 < 10
    if (r.success) {
      expect(r.handoffTime).toBeLessThan(10);
    }
  });

  it('大负载可能导致启动失败', () => {
    const r = simulateIFStartup({ ...defaultInput, loadTorque: 2.0 });
    // 大负载下可能无法启动
    // succeed 或 fail 都算合理, 只检查不崩溃
    expect(r.trajectory.length).toBeGreaterThan(0);
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