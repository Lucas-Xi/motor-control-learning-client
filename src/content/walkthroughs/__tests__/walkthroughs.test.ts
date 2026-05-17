import { describe, expect, it } from 'vitest';
import { motorBasicsWalkthrough } from '../motor-basics';
import { threePhaseWalkthrough } from '../three-phase';
import { clarkeTransformWalkthrough } from '../clarke-transform';
import { parkTransformWalkthrough } from '../park-transform';
import { pidControlWalkthrough } from '../pid-control';
import { focFlowWalkthrough } from '../foc-flow';
import { svpwmWalkthrough } from '../svpwm';
import { inverterWalkthrough } from '../inverter';
import { controlLoopsWalkthrough } from '../control-loops';
import { sensorlessFocWalkthrough } from '../sensorless-foc';
import { hfiSensorlessWalkthrough } from '../hfi-sensorless';
import { fieldWeakeningWalkthrough } from '../field-weakening';
import { faultsDebuggingWalkthrough } from '../faults-debugging';
import { startupStateMachineWalkthrough } from '../startup-statemachine';
import { apfFrontendWalkthrough } from '../apf-frontend';
import { refrigerationBenchWalkthrough } from '../refrigeration-bench';
import { assemblyWorkshopWalkthrough } from '../assembly-workshop';
import { validateWalkthrough } from '../types';

const all = [
  motorBasicsWalkthrough,
  threePhaseWalkthrough,
  clarkeTransformWalkthrough,
  parkTransformWalkthrough,
  pidControlWalkthrough,
  focFlowWalkthrough,
  svpwmWalkthrough,
  inverterWalkthrough,
  controlLoopsWalkthrough,
  sensorlessFocWalkthrough,
  hfiSensorlessWalkthrough,
  fieldWeakeningWalkthrough,
  faultsDebuggingWalkthrough,
  startupStateMachineWalkthrough,
  apfFrontendWalkthrough,
  refrigerationBenchWalkthrough,
  assemblyWorkshopWalkthrough,
];

describe('Walkthroughs schema validation', () => {
  it('17 modules covered', () => {
    expect(all).toHaveLength(17);
    const ids = new Set(all.map((w) => w.moduleId));
    expect(ids.size).toBe(17);
  });

  for (const w of all) {
    it(`${w.moduleId}: validateWalkthrough 通过`, () => {
      const errs = validateWalkthrough(w);
      expect(errs).toEqual([]);
    });
  }

  it('每个 walkthrough 至少 1 道 quiz', () => {
    for (const w of all) {
      const totalQuiz = w.steps.filter((s) => s.quiz).length;
      expect(totalQuiz, `${w.moduleId} steps with quiz`).toBeGreaterThanOrEqual(1);
    }
  });

  it('所有 quiz options 严格 4 个、correct 在 0-3', () => {
    for (const w of all) {
      for (const s of w.steps) {
        if (!s.quiz) continue;
        expect(s.quiz.options.length).toBe(4);
        expect(s.quiz.correct).toBeGreaterThanOrEqual(0);
        expect(s.quiz.correct).toBeLessThanOrEqual(3);
      }
    }
  });

  it('所有 pitfall 含必填字段', () => {
    for (const w of all) {
      for (const p of w.pitfalls) {
        expect(p.id, `${w.moduleId} pitfall.id`).toBeTruthy();
        expect(p.label, `${w.moduleId} pitfall.label`).toBeTruthy();
        expect(p.symptom, `${w.moduleId} pitfall.symptom`).toBeTruthy();
        expect(p.why, `${w.moduleId} pitfall.why`).toBeTruthy();
      }
    }
  });

  it('bigPicture 非空，且确实表达了主旨（>10 字）', () => {
    // 长度上限是软约束（GuidedExperimentBar header 用 truncate 截断），不强制。
    for (const w of all) {
      expect(w.bigPicture.trim().length, `${w.moduleId} bigPicture`).toBeGreaterThan(10);
    }
  });
});
