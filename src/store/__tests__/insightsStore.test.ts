import { describe, expect, it, beforeEach } from 'vitest';
import {
  computeWeaknessScores,
  getWeakTopics,
  summarizeMistakes,
  useInsightsStore,
} from '../insightsStore';

const KNOWN_MODULES = [
  'motor-basics',
  'three-phase',
  'clarke-transform',
  'park-transform',
  'pid-control',
  'foc-flow',
  'svpwm',
];

describe('useInsightsStore', () => {
  beforeEach(() => {
    useInsightsStore.getState().clearAll();
  });

  describe('recordQuizAnswer', () => {
    it('records a mistake when chosen != correct', () => {
      useInsightsStore.getState().recordQuizAnswer({
        moduleId: 'pid-control',
        stepId: 'step-1',
        quizId: 'q1',
        chosen: 0,
        correct: 2,
        q: 'P 增大会怎样？',
        options: ['上升时间↓', '稳态误差↑', '响应速度↓', '过冲↓'],
        hint: 'P 越大响应越快',
      });
      const m = useInsightsStore.getState().quizMistakes;
      expect(Object.keys(m)).toHaveLength(1);
      expect(m['pid-control.step-1.q1'].count).toBe(1);
      expect(m['pid-control.step-1.q1'].chosen).toBe(0);
      expect(m['pid-control.step-1.q1'].q).toBe('P 增大会怎样？');
    });

    it('does NOT record when chosen === correct', () => {
      useInsightsStore.getState().recordQuizAnswer({
        moduleId: 'svpwm',
        stepId: 's1',
        quizId: 'q1',
        chosen: 1,
        correct: 1,
      });
      expect(Object.keys(useInsightsStore.getState().quizMistakes)).toHaveLength(0);
    });

    it('accumulates count when same question is missed multiple times', () => {
      const args = {
        moduleId: 'foc-flow',
        stepId: 's2',
        quizId: 'q3',
        chosen: 3,
        correct: 0,
      };
      useInsightsStore.getState().recordQuizAnswer(args);
      useInsightsStore.getState().recordQuizAnswer(args);
      useInsightsStore.getState().recordQuizAnswer(args);
      expect(useInsightsStore.getState().quizMistakes['foc-flow.s2.q3'].count).toBe(3);
    });

    it('keeps existing q/options/hint when later call omits them', () => {
      useInsightsStore.getState().recordQuizAnswer({
        moduleId: 'pid-control',
        stepId: 's1',
        quizId: 'q1',
        chosen: 0,
        correct: 2,
        q: '问题文本',
        hint: '某提示',
      });
      useInsightsStore.getState().recordQuizAnswer({
        moduleId: 'pid-control',
        stepId: 's1',
        quizId: 'q1',
        chosen: 0,
        correct: 2,
        // 不传 q/hint
      });
      const rec = useInsightsStore.getState().quizMistakes['pid-control.s1.q1'];
      expect(rec.q).toBe('问题文本');
      expect(rec.hint).toBe('某提示');
      expect(rec.count).toBe(2);
    });
  });

  describe('recordStepRevisit', () => {
    it('increments count per moduleId+stepId', () => {
      const { recordStepRevisit } = useInsightsStore.getState();
      recordStepRevisit('motor-basics', 's1');
      recordStepRevisit('motor-basics', 's1');
      recordStepRevisit('motor-basics', 's2');
      const rv = useInsightsStore.getState().stepRevisits;
      expect(rv['motor-basics.s1']).toBe(2);
      expect(rv['motor-basics.s2']).toBe(1);
    });
  });

  describe('recordChallengeAttempt', () => {
    it('appends attempts to a per-challenge list', () => {
      const { recordChallengeAttempt } = useInsightsStore.getState();
      recordChallengeAttempt('pid-control-1', {
        ts: 1,
        params: { kp: 1 },
        passed: false,
        currentValue: 12.3,
      });
      recordChallengeAttempt('pid-control-1', {
        ts: 2,
        params: { kp: 2 },
        passed: true,
      });
      const list = useInsightsStore.getState().challengeAttempts['pid-control-1'];
      expect(list).toHaveLength(2);
      expect(list[0].params.kp).toBe(1);
      expect(list[1].passed).toBe(true);
    });

    it('caps history at MAX (30) via FIFO', () => {
      const { recordChallengeAttempt } = useInsightsStore.getState();
      for (let i = 0; i < 35; i++) {
        recordChallengeAttempt('cx', { ts: i, params: { i }, passed: false });
      }
      const list = useInsightsStore.getState().challengeAttempts['cx'];
      expect(list).toHaveLength(30);
      // FIFO 截断保留最新 30 条（i = 5..34）
      expect(list[0].params.i).toBe(5);
      expect(list[29].params.i).toBe(34);
    });
  });

  describe('dismissMistake', () => {
    it('removes a single mistake entry', () => {
      const s = useInsightsStore.getState();
      s.recordQuizAnswer({ moduleId: 'pid-control', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      s.recordQuizAnswer({ moduleId: 'svpwm', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      expect(Object.keys(useInsightsStore.getState().quizMistakes)).toHaveLength(2);
      useInsightsStore.getState().dismissMistake('pid-control', 's1', 'q1');
      const m = useInsightsStore.getState().quizMistakes;
      expect(Object.keys(m)).toHaveLength(1);
      expect(m['svpwm.s1.q1']).toBeDefined();
    });
  });

  describe('clearAll', () => {
    it('resets all three tables', () => {
      const s = useInsightsStore.getState();
      s.recordQuizAnswer({ moduleId: 'pid-control', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      s.recordStepRevisit('pid-control', 's1');
      s.recordChallengeAttempt('cx', { ts: 1, params: {}, passed: false });
      useInsightsStore.getState().clearAll();
      const st = useInsightsStore.getState();
      expect(Object.keys(st.quizMistakes)).toHaveLength(0);
      expect(Object.keys(st.stepRevisits)).toHaveLength(0);
      expect(Object.keys(st.challengeAttempts)).toHaveLength(0);
    });
  });

  describe('computeWeaknessScores', () => {
    it('returns empty when no data', () => {
      const out = computeWeaknessScores(
        { quizMistakes: {}, stepRevisits: {}, challengeAttempts: {} },
        KNOWN_MODULES,
      );
      expect(out).toEqual([]);
    });

    it('weights mistakes×3 + revisits×1 + challengeFailures×4', () => {
      const s = useInsightsStore.getState();
      // pid-control: 2 mistakes (count=2 → mistakeCount=2), 3 revisits, 1 challenge fail
      s.recordQuizAnswer({ moduleId: 'pid-control', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      s.recordQuizAnswer({ moduleId: 'pid-control', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      s.recordStepRevisit('pid-control', 's1');
      s.recordStepRevisit('pid-control', 's1');
      s.recordStepRevisit('pid-control', 's2');
      s.recordChallengeAttempt('pid-control-1', { ts: 1, params: {}, passed: false });
      // svpwm: 1 mistake only
      s.recordQuizAnswer({ moduleId: 'svpwm', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      const scores = computeWeaknessScores(useInsightsStore.getState(), KNOWN_MODULES);
      expect(scores).toHaveLength(2);
      // pid-control: 3*2 + 1*3 + 4*1 = 13
      // svpwm: 3*1 + 0 + 0 = 3
      expect(scores[0].moduleId).toBe('pid-control');
      expect(scores[0].score).toBe(13);
      expect(scores[0].mistakeCount).toBe(2);
      expect(scores[0].revisitCount).toBe(3);
      expect(scores[0].challengeFailures).toBe(1);
      expect(scores[1].moduleId).toBe('svpwm');
      expect(scores[1].score).toBe(3);
    });

    it('only counts failed challenge attempts toward score', () => {
      const s = useInsightsStore.getState();
      s.recordChallengeAttempt('svpwm-1', { ts: 1, params: {}, passed: true });
      s.recordChallengeAttempt('svpwm-1', { ts: 2, params: {}, passed: false });
      s.recordChallengeAttempt('svpwm-1', { ts: 3, params: {}, passed: false });
      const scores = computeWeaknessScores(useInsightsStore.getState(), KNOWN_MODULES);
      const row = scores.find((r) => r.moduleId === 'svpwm');
      expect(row?.challengeFailures).toBe(2);
      expect(row?.score).toBe(8); // 4 * 2
    });

    it('infers moduleId from challengeId using longest prefix match', () => {
      const s = useInsightsStore.getState();
      // 'foc-flow-easy' should match 'foc-flow' not 'foc' (long-prefix-first)
      s.recordChallengeAttempt('foc-flow-easy', { ts: 1, params: {}, passed: false });
      const scores = computeWeaknessScores(useInsightsStore.getState(), KNOWN_MODULES);
      expect(scores[0]?.moduleId).toBe('foc-flow');
    });

    it('sorts by score descending', () => {
      const s = useInsightsStore.getState();
      // svpwm: 1 mistake → 3
      s.recordQuizAnswer({ moduleId: 'svpwm', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      // pid-control: 5 mistakes (count=5) → 15
      for (let i = 0; i < 5; i++) {
        s.recordQuizAnswer({ moduleId: 'pid-control', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      }
      // motor-basics: 10 revisits → 10
      for (let i = 0; i < 10; i++) s.recordStepRevisit('motor-basics', 's1');
      const scores = computeWeaknessScores(useInsightsStore.getState(), KNOWN_MODULES);
      expect(scores.map((s) => s.moduleId)).toEqual(['pid-control', 'motor-basics', 'svpwm']);
    });
  });

  describe('getWeakTopics', () => {
    it('returns top N moduleIds', () => {
      const s = useInsightsStore.getState();
      s.recordQuizAnswer({ moduleId: 'svpwm', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      for (let i = 0; i < 5; i++) {
        s.recordQuizAnswer({ moduleId: 'pid-control', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      }
      for (let i = 0; i < 10; i++) s.recordStepRevisit('motor-basics', 's1');
      const top2 = getWeakTopics(useInsightsStore.getState(), KNOWN_MODULES, 2);
      expect(top2).toEqual(['pid-control', 'motor-basics']);
    });
  });

  describe('summarizeMistakes', () => {
    it('counts total mistake entries and unique modules', () => {
      const s = useInsightsStore.getState();
      s.recordQuizAnswer({ moduleId: 'a', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      s.recordQuizAnswer({ moduleId: 'a', stepId: 's2', quizId: 'q1', chosen: 0, correct: 1 });
      s.recordQuizAnswer({ moduleId: 'b', stepId: 's1', quizId: 'q1', chosen: 0, correct: 1 });
      const stats = summarizeMistakes(useInsightsStore.getState().quizMistakes);
      expect(stats.totalMistakes).toBe(3);
      expect(stats.modules).toBe(2);
    });
  });
});
