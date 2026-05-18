import { describe, expect, it, beforeEach } from 'vitest';
import { listChallengesWithReplay, useReplayStore } from '../replayStore';
import type { AssemblySnapshot } from '../assemblyProgressStore';

const SLOTS_A: AssemblySnapshot['slotIds'] = {
  compressorBundleId: 'b1',
  inverterPartNo: 'inv-A',
  strategyId: 'foc-hfi',
  loadId: 'L1',
  pfcId: 'pfc1',
  separatorId: 'sep1',
};
const SLOTS_B: AssemblySnapshot['slotIds'] = { ...SLOTS_A, inverterPartNo: 'inv-B' };

describe('useReplayStore', () => {
  beforeEach(() => {
    useReplayStore.getState().clearAll();
  });

  it('pushStep assigns sequential attemptIndex per challenge', () => {
    const { pushStep } = useReplayStore.getState();
    pushStep('c1', {
      slotIds: SLOTS_A,
      verdict: 'fail',
      cop: 1.8,
      requiredIqA: 4.0,
      pressureRatio: 2.4,
      Tdischarge: 70,
      summary: 'attempt 1',
    });
    pushStep('c1', {
      slotIds: SLOTS_B,
      verdict: 'pass',
      cop: 3.0,
      requiredIqA: 4.5,
      pressureRatio: 2.5,
      Tdischarge: 80,
      summary: 'attempt 2',
    });
    const steps = useReplayStore.getState().getSteps('c1');
    expect(steps).toHaveLength(2);
    expect(steps[0].attemptIndex).toBe(1);
    expect(steps[1].attemptIndex).toBe(2);
    expect(steps[1].slotIds.inverterPartNo).toBe('inv-B');
  });

  it('pushStep debounces identical consecutive steps (same slots + verdict)', () => {
    const { pushStep } = useReplayStore.getState();
    const base = {
      slotIds: SLOTS_A,
      verdict: 'fail' as const,
      cop: 1.8,
      requiredIqA: 4.0,
      pressureRatio: 2.4,
      Tdischarge: 70,
      summary: 'duplicate',
    };
    pushStep('c1', base);
    pushStep('c1', base); // 完全相同 -> 应该跳过
    expect(useReplayStore.getState().getSteps('c1')).toHaveLength(1);
    // 改 verdict 就不去重
    pushStep('c1', { ...base, verdict: 'pass-warn' });
    expect(useReplayStore.getState().getSteps('c1')).toHaveLength(2);
  });

  it('clearChallenge removes only the given challenge', () => {
    const { pushStep, clearChallenge } = useReplayStore.getState();
    pushStep('c1', { slotIds: SLOTS_A, verdict: 'fail', cop: 1, requiredIqA: 1, pressureRatio: 2, Tdischarge: 50, summary: '' });
    pushStep('c2', { slotIds: SLOTS_B, verdict: 'pass', cop: 3, requiredIqA: 4, pressureRatio: 2.5, Tdischarge: 70, summary: '' });
    clearChallenge('c1');
    expect(useReplayStore.getState().getSteps('c1')).toEqual([]);
    expect(useReplayStore.getState().getSteps('c2')).toHaveLength(1);
  });

  it('different challenges are isolated', () => {
    const { pushStep } = useReplayStore.getState();
    pushStep('c1', { slotIds: SLOTS_A, verdict: 'fail', cop: 1, requiredIqA: 1, pressureRatio: 2, Tdischarge: 50, summary: '' });
    pushStep('c2', { slotIds: SLOTS_A, verdict: 'fail', cop: 1, requiredIqA: 1, pressureRatio: 2, Tdischarge: 50, summary: '' });
    expect(useReplayStore.getState().getSteps('c1')[0].attemptIndex).toBe(1);
    expect(useReplayStore.getState().getSteps('c2')[0].attemptIndex).toBe(1);
  });

  it('listChallengesWithReplay sorts by most-recent step', async () => {
    const { pushStep } = useReplayStore.getState();
    pushStep('older', { slotIds: SLOTS_A, verdict: 'fail', cop: 1, requiredIqA: 1, pressureRatio: 2, Tdischarge: 50, summary: '' });
    // wait so timestamps differ
    await new Promise((r) => setTimeout(r, 5));
    pushStep('newer', { slotIds: SLOTS_B, verdict: 'pass', cop: 3, requiredIqA: 4, pressureRatio: 2.5, Tdischarge: 70, summary: '' });
    const ids = listChallengesWithReplay(useReplayStore.getState().replays);
    expect(ids).toEqual(['newer', 'older']);
  });

  it('clearAll wipes everything', () => {
    const { pushStep, clearAll } = useReplayStore.getState();
    pushStep('c1', { slotIds: SLOTS_A, verdict: 'fail', cop: 1, requiredIqA: 1, pressureRatio: 2, Tdischarge: 50, summary: '' });
    clearAll();
    expect(useReplayStore.getState().replays).toEqual({});
  });
});

