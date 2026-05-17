import { describe, expect, it } from 'vitest';
import { _buildCycleInput, _cycleFingerprint, runBenchCycle } from '../useBenchCycle';
import type { RefrigerationParams } from '../../../simulation/engine/types';

const refrig: RefrigerationParams = {
  refrigerant: 'R32',
  Te: 5, Tc: 45,
  superheatK: 5, subcoolK: 3,
  displacementCc: 12, clearanceRatio: 0.05,
  isentropicEff: 0.7,
  eevOpening: 0.6,
  closedLoop: false,
  ambientIndoorC: 26,
  ambientOutdoorC: 35,
};

describe('_buildCycleInput', () => {
  it('正常 rpm 直接透传', () => {
    const input = _buildCycleInput(refrig, 4500);
    expect(input.rpm).toBe(4500);
  });

  it('rpm < 100 用 3000 兜底（避免循环模型在停转时崩）', () => {
    expect(_buildCycleInput(refrig, 50).rpm).toBe(3000);
    expect(_buildCycleInput(refrig, 0).rpm).toBe(3000);
    expect(_buildCycleInput(refrig, -10).rpm).toBe(3000);
  });

  it('rpm = 100 边界：仍走兜底（rpm > 100 才算正常）', () => {
    expect(_buildCycleInput(refrig, 100).rpm).toBe(3000);
    expect(_buildCycleInput(refrig, 101).rpm).toBe(101);
  });

  it('其它参数原样透传', () => {
    const input = _buildCycleInput(refrig, 4500);
    expect(input.Te).toBe(5);
    expect(input.Tc).toBe(45);
    expect(input.refrigerant).toBe('R32');
  });
});

describe('_cycleFingerprint', () => {
  it('相同入参 → 相同 fingerprint', () => {
    expect(_cycleFingerprint(refrig, 4500)).toBe(_cycleFingerprint(refrig, 4500));
  });

  it('Te 不同 → fingerprint 不同', () => {
    expect(_cycleFingerprint(refrig, 4500)).not.toBe(_cycleFingerprint({ ...refrig, Te: 6 }, 4500));
  });

  it('rpm 不同 → fingerprint 不同', () => {
    expect(_cycleFingerprint(refrig, 4500)).not.toBe(_cycleFingerprint(refrig, 4501));
  });

  it('用 | 分隔避免 (1, 23) 和 (12, 3) 撞', () => {
    // 数值 12 / 3 与 1 / 23 没有有效压缩机配置，但作为字符串语义测试合理
    const a = _cycleFingerprint({ ...refrig, displacementCc: 12, clearanceRatio: 0.3 }, 4500);
    const b = _cycleFingerprint({ ...refrig, displacementCc: 1, clearanceRatio: 23 }, 4500);
    expect(a).not.toBe(b);
  });
});

describe('runBenchCycle (无缓存)', () => {
  it('返回完整 CycleResult', () => {
    const r = runBenchCycle(refrig, 4500);
    expect(r.states).toHaveLength(4);
    expect(r.cop).toBeGreaterThan(0);
    expect(r.massFlow).toBeGreaterThan(0);
  });

  it('对同样入参产生相同结果（pure）', () => {
    const a = runBenchCycle(refrig, 4500);
    const b = runBenchCycle(refrig, 4500);
    expect(a.cop).toBe(b.cop);
    expect(a.Tdischarge).toBe(b.Tdischarge);
  });
});
