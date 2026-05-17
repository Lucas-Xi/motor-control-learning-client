import { describe, expect, it, beforeEach } from 'vitest';
import { summarizeForModule, useChallengeStore } from '../challengeStore';

describe('useChallengeStore', () => {
  beforeEach(() => {
    useChallengeStore.getState().reset();
  });

  it('incrementAttempts increments per-challenge counter', () => {
    const { incrementAttempts } = useChallengeStore.getState();
    incrementAttempts('c1');
    incrementAttempts('c1');
    incrementAttempts('c2');
    expect(useChallengeStore.getState().records.c1.attempts).toBe(2);
    expect(useChallengeStore.getState().records.c2.attempts).toBe(1);
    expect(useChallengeStore.getState().records.c1.solved).toBe(false);
  });

  it('recordResult only writes when passed=true', () => {
    const { recordResult } = useChallengeStore.getState();
    recordResult('c1', false, 5, 'minimize');
    expect(useChallengeStore.getState().records.c1).toBeUndefined();
    recordResult('c1', true, 5, 'minimize');
    expect(useChallengeStore.getState().records.c1.solved).toBe(true);
    expect(useChallengeStore.getState().records.c1.bestValue).toBe(5);
  });

  it('recordResult with minimize semantic keeps smaller bestValue', () => {
    const { recordResult } = useChallengeStore.getState();
    recordResult('c1', true, 10, 'minimize');
    recordResult('c1', true, 6, 'minimize');
    expect(useChallengeStore.getState().records.c1.bestValue).toBe(6);
    recordResult('c1', true, 12, 'minimize');
    expect(useChallengeStore.getState().records.c1.bestValue).toBe(6); // 不刷新
  });

  it('recordResult with maximize semantic keeps larger bestValue', () => {
    const { recordResult } = useChallengeStore.getState();
    recordResult('c2', true, 3.2, 'maximize');
    recordResult('c2', true, 4.5, 'maximize');
    expect(useChallengeStore.getState().records.c2.bestValue).toBe(4.5);
    recordResult('c2', true, 3.9, 'maximize');
    expect(useChallengeStore.getState().records.c2.bestValue).toBe(4.5);
  });

  it('firstPassedAt is set once and preserved', () => {
    const { recordResult } = useChallengeStore.getState();
    recordResult('c1', true, 5, 'minimize');
    const first = useChallengeStore.getState().records.c1.firstPassedAt;
    expect(first).toBeGreaterThan(0);
    recordResult('c1', true, 4, 'minimize');
    expect(useChallengeStore.getState().records.c1.firstPassedAt).toBe(first);
  });

  it('resetOne clears a single record', () => {
    const { recordResult, resetOne } = useChallengeStore.getState();
    recordResult('c1', true, 5, 'minimize');
    recordResult('c2', true, 3, 'maximize');
    resetOne('c1');
    expect(useChallengeStore.getState().records.c1).toBeUndefined();
    expect(useChallengeStore.getState().records.c2.solved).toBe(true);
  });

  describe('summarizeForModule', () => {
    it('counts solved against total', () => {
      const { recordResult } = useChallengeStore.getState();
      recordResult('a', true, 1, 'minimize');
      recordResult('b', true, 1, 'minimize');
      const out = summarizeForModule(useChallengeStore.getState().records, ['a', 'b', 'c']);
      expect(out).toEqual({ solved: 2, total: 3 });
    });

    it('returns 0/N when nothing solved', () => {
      const out = summarizeForModule(useChallengeStore.getState().records, ['x', 'y']);
      expect(out).toEqual({ solved: 0, total: 2 });
    });
  });
});
