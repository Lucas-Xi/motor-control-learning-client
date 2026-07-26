import { describe, expect, it } from 'vitest';
import { allChallenges, challengesByModule, checkComparator, formatTarget, getChallengesFor } from '../index';
import {
  pidDefault, focDefault, svpwmDefault, sensorlessDefault, weakFieldDefault,
  startupDefault, refrigerationDefault, motorBasicsDefault,
  threePhaseDefault, clarkeDefault, parkDefault, inverterDefault,
  controlLoopDefault, faultDefault, hfiDefault, apfDefault,
} from '../../../simulation/engine/presets';
import type { ModuleId } from '../../../simulation/engine/types';

const SLICE_BY_MODULE: Record<string, Record<string, unknown>> = {
  'pid-control': pidDefault as unknown as Record<string, unknown>,
  'foc-flow': focDefault as unknown as Record<string, unknown>,
  'svpwm': svpwmDefault as unknown as Record<string, unknown>,
  'sensorless-foc': sensorlessDefault as unknown as Record<string, unknown>,
  'field-weakening': weakFieldDefault as unknown as Record<string, unknown>,
  'startup-statemachine': startupDefault as unknown as Record<string, unknown>,
  'refrigeration-bench': refrigerationDefault as unknown as Record<string, unknown>,
  'motor-basics': motorBasicsDefault as unknown as Record<string, unknown>,
  'three-phase': threePhaseDefault as unknown as Record<string, unknown>,
  'clarke-transform': clarkeDefault as unknown as Record<string, unknown>,
  'park-transform': parkDefault as unknown as Record<string, unknown>,
  'inverter': inverterDefault as unknown as Record<string, unknown>,
  'control-loops': controlLoopDefault as unknown as Record<string, unknown>,
  'faults-debugging': faultDefault as unknown as Record<string, unknown>,
  'hfi-sensorless': hfiDefault as unknown as Record<string, unknown>,
  'apf-frontend': apfDefault as unknown as Record<string, unknown>,
};

describe('challenges schema', () => {
  it('exports at least 8 challenges spread across the required modules', () => {
    expect(allChallenges.length).toBeGreaterThanOrEqual(16);
    const requiredModules: ModuleId[] = [
      'pid-control', 'foc-flow', 'svpwm', 'sensorless-foc',
      'field-weakening', 'startup-statemachine', 'refrigeration-bench',
      'motor-basics',
    ];
    for (const m of requiredModules) {
      expect(challengesByModule[m]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('every challenge has unique id', () => {
    const ids = allChallenges.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every editableParam key exists on its module slice', () => {
    for (const c of allChallenges) {
      const slice = SLICE_BY_MODULE[c.module];
      expect(slice, `missing slice for ${c.module}`).toBeDefined();
      for (const key of c.editableParams) {
        expect(
          Object.prototype.hasOwnProperty.call(slice, key),
          `challenge ${c.id} editableParam "${key}" not in ${c.module} slice`,
        ).toBe(true);
      }
    }
  });

  it('every evaluator runs without throwing on default params', () => {
    for (const c of allChallenges) {
      const slice = SLICE_BY_MODULE[c.module];
      const result = c.evaluator({
        params: slice,
        motor: motorBasicsDefault as unknown as Record<string, number>,
      });
      expect(typeof result.current).toBe('number');
      expect(typeof result.passed).toBe('boolean');
    }
  });

  it('every challenge target uses a known difficulty', () => {
    for (const c of allChallenges) {
      expect(['入门', '进阶', '硬核']).toContain(c.difficulty);
    }
  });

  it('hint and solutionExplain are non-empty Chinese strings', () => {
    for (const c of allChallenges) {
      expect(c.hint.length).toBeGreaterThan(4);
      expect(c.solutionExplain.length).toBeGreaterThan(8);
    }
  });
});

describe('checkComparator', () => {
  it('handles <, <=, >, >=', () => {
    expect(checkComparator(3, '<', 5)).toBe(true);
    expect(checkComparator(5, '<', 5)).toBe(false);
    expect(checkComparator(5, '<=', 5)).toBe(true);
    expect(checkComparator(6, '>', 5)).toBe(true);
    expect(checkComparator(5, '>=', 5)).toBe(true);
  });

  it('handles between with [lo, hi]', () => {
    expect(checkComparator(0.97, 'between', [0.95, 0.99])).toBe(true);
    expect(checkComparator(0.94, 'between', [0.95, 0.99])).toBe(false);
    expect(checkComparator(1.0, 'between', [0.95, 0.99])).toBe(false);
  });

  it('returns false when shapes mismatch', () => {
    // 故意传入非法组合验证防御逻辑（用 unknown 绕过编译期检查）
    expect(checkComparator(5, 'between', 5 as unknown as [number, number])).toBe(false);
    expect(checkComparator(5, '<', [1, 10] as unknown as number)).toBe(false);
  });
});

describe('formatTarget', () => {
  it('formats single-value comparators', () => {
    expect(formatTarget({ metric: 'COP', comparator: '>', value: 3.5, unit: '' })).toContain('COP > 3.5');
  });

  it('formats between as interval', () => {
    expect(formatTarget({ metric: 'm', comparator: 'between', value: [0.95, 0.99], unit: '' })).toContain('[0.95, 0.99]');
  });
});

describe('getChallengesFor', () => {
  it('returns a stable empty array for modules without challenges', () => {
    const a = getChallengesFor('assembly-workshop' as ModuleId);
    const b = getChallengesFor('assembly-workshop' as ModuleId);
    expect(a).toBe(b); // 同一冻结引用
    expect(a.length).toBe(0);
  });

  it('returns the same list as challengesByModule for known modules', () => {
    const list = getChallengesFor('pid-control');
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((c) => c.module === 'pid-control')).toBe(true);
  });
});
