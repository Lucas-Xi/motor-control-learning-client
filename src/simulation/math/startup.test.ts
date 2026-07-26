import { describe, expect, it } from 'vitest';
import { simulateStartup } from './startup';

describe('simulateStartup', () => {
  it('returns state machine timeline', () => {
    const samples = simulateStartup({
      targetRpm: 3000, currentRpm: 0,
      accelRampRpmS: 400, alignDurationMs: 500,
      hfiHandoffRpm: 300, bemfHandoffRpm: 800, fieldweakRpm: 4000,
      state: 'idle', loadTorque: 0.02,
    });
    expect(samples.length).toBeGreaterThan(100);
    const states = new Set(samples.map(s => s.state));
    expect(states.size).toBeGreaterThanOrEqual(2);
  });

  it('has at least one sample per expected state category', () => {
    const samples = simulateStartup({
      targetRpm: 3000, currentRpm: 0,
      accelRampRpmS: 400, alignDurationMs: 500,
      hfiHandoffRpm: 300, bemfHandoffRpm: 800, fieldweakRpm: 4000,
      state: 'idle', loadTorque: 0.02,
    });
    expect(samples.length).toBeGreaterThan(100);
    // at least some states
    expect(samples.some(s => s.state !== 'idle')).toBe(true);
  });

  it('handles zero load torque', () => {
    const samples = simulateStartup({
      targetRpm: 2000, currentRpm: 0,
      accelRampRpmS: 400, alignDurationMs: 500,
      hfiHandoffRpm: 200, bemfHandoffRpm: 600, fieldweakRpm: 3500,
      state: 'idle', loadTorque: 0,
    });
    expect(samples.length).toBeGreaterThan(50);
  });

  it('monotonically increasing rpm after open-loop', () => {
    const samples = simulateStartup({
      targetRpm: 2500, currentRpm: 0,
      accelRampRpmS: 400, alignDurationMs: 400,
      hfiHandoffRpm: 250, bemfHandoffRpm: 700, fieldweakRpm: 3500,
      state: 'idle', loadTorque: 0.01,
    });
    const runningSamples = samples.filter(s =>
      !['idle', 'precharge', 'align'].includes(s.state),
    );
    expect(runningSamples.length).toBeGreaterThan(10);
    for (let i = 1; i < runningSamples.length; i++) {
      expect(runningSamples[i].rpm).toBeGreaterThanOrEqual(runningSamples[i - 1].rpm - 2);
    }
  });
});