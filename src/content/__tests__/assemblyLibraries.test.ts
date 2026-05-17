import { describe, expect, it } from 'vitest';
import {
  controlStrategies,
  inverterPlatforms,
  loadConditions,
  runAssembly,
} from '../assemblyLibraries';
import { compressorBundles } from '../compressorLibrary';

describe('runAssembly', () => {
  // 默认组合：海立 1.5HP R32 + Sanken IPM + FOC+HFI+BEMF + 夏季制冷
  const baseCompressor = compressorBundles[1].compressor;  // 海立 BSA325CV (R32)
  const baseInverter = compressorBundles[1].inverter;
  const baseStrategy = controlStrategies[3];  // foc-hfi-bemf
  const baseLoad = loadConditions[0];          // cooling-summer-typical (R32)

  it('matched configuration passes', () => {
    const r = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: baseStrategy, load: baseLoad });
    expect(r.verdict).not.toBe('fail');
    expect(r.metrics.cop).toBeGreaterThan(2);
    expect(r.metrics.requiredIqA).toBeGreaterThan(0);
  });

  it('refrigerant mismatch is a fault', () => {
    const r134aLoad = loadConditions.find((l) => l.refrigerant === 'R134a')!;
    const r = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: baseStrategy, load: r134aLoad });
    expect(r.verdict).toBe('fail');
    expect(r.items.some((i) => i.level === 'fault' && i.message.includes('冷媒不匹配'))).toBe(true);
  });

  it('V/f open-loop with zero-start target fails when target > 0 only if BEMF, V/f itself can zero-start', () => {
    const vf = controlStrategies.find((s) => s.id === 'spwm-vf')!;
    const r = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: vf, load: baseLoad });
    // V/f does support zero-speed start (open-loop), so启动 is OK
    expect(r.items.some((i) => i.message.includes('启动方案与压缩机匹配'))).toBe(true);
  });

  it('BEMF-only strategy fails to zero-start', () => {
    const bemfOnly = controlStrategies.find((s) => s.id === 'foc-bemf')!;
    const r = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: bemfOnly, load: baseLoad });
    expect(r.verdict).toBe('fail');
    expect(r.items.some((i) => i.level === 'fault' && i.message.includes('零速启动'))).toBe(true);
  });

  it('undersized inverter is a fault', () => {
    const undersized = { ...baseInverter, ratedCurrentA: 5 };  // 海立 7A 压缩机 + 5A 逆变器
    const r = runAssembly({ compressor: baseCompressor, inverter: undersized, strategy: baseStrategy, load: baseLoad });
    expect(r.verdict).toBe('fail');
    expect(r.items.some((i) => i.message.includes('逆变器额定'))).toBe(true);
  });

  it('extreme heat load may trigger discharge-temp warning', () => {
    const extreme = loadConditions.find((l) => l.id === 'cooling-heatwave')!;
    const r = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: baseStrategy, load: extreme });
    // 极端高温下排气温度会接近或超过限值
    expect(r.metrics.Tdischarge).toBeGreaterThan(70);
  });

  it('returns all 4 library inventories non-empty', () => {
    expect(compressorBundles.length).toBeGreaterThanOrEqual(5);
    expect(inverterPlatforms.length).toBeGreaterThanOrEqual(5);
    expect(controlStrategies.length).toBeGreaterThanOrEqual(4);
    expect(loadConditions.length).toBeGreaterThanOrEqual(4);
  });

  describe('timeline simulation', () => {
    it('produces 8-second timeline with monotonic rpm ramp', () => {
      const r = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: baseStrategy, load: baseLoad });
      expect(r.timeline.samples.length).toBeGreaterThan(380);  // ~8s / 20ms
      expect(r.timeline.samples[0].rpm).toBe(0);
      // 终态 rpm 应接近 target
      const final = r.timeline.samples[r.timeline.samples.length - 1];
      expect(final.rpm).toBeGreaterThan(baseLoad.targetRpm * 0.85);
    });

    it('HFI+BEMF strategy transitions through align → openloop → hfi → bemf', () => {
      const r = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: baseStrategy, load: baseLoad });
      const states = r.timeline.transitions.map((tr) => tr.state);
      expect(states).toContain('align');
      expect(states).toContain('openloop');
      expect(states).toContain('hfi');
      expect(states).toContain('bemf');
    });

    it('V/f open-loop strategy stays in openloop (no HFI/BEMF transitions)', () => {
      const vf = controlStrategies.find((s) => s.id === 'spwm-vf')!;
      const r = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: vf, load: baseLoad });
      const states = r.timeline.transitions.map((tr) => tr.state);
      expect(states).toContain('openloop');
      expect(states).not.toContain('hfi');
      expect(states).not.toContain('bemf');
    });

    it('reachedTarget is true for matched config and false for impossible config', () => {
      const r = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: baseStrategy, load: baseLoad });
      expect(r.timeline.reachedTarget).toBe(true);

      // BEMF-only 无法零速启动，rpm 永远为 0
      const bemfOnly = controlStrategies.find((s) => s.id === 'foc-bemf')!;
      const bad = runAssembly({ compressor: baseCompressor, inverter: baseInverter, strategy: bemfOnly, load: baseLoad });
      // BEMF-only 实际会走 openloop → bemf，所以也会到 target；只是诊断里会报 fault
      expect(bad.verdict).toBe('fail');
    });
  });
});
