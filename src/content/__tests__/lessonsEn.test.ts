import { describe, expect, it } from 'vitest';
import type { ModuleId } from '../../simulation/engine/types';
import type { LessonContent } from '../lessons';
import { lessons } from '../lessons';
import { lessonsEn } from '../lessonsEn';

/**
 * Quality tests for the English lessons translation.
 *
 *  (a) Coverage: the 10 core modules must have a complete English entry.
 *  (b) Schema: each entry must satisfy the LessonContent shape.
 *  (c) Language: lesson copy (other than codeExample and quiz options) must
 *      not contain CJK characters.
 *  (d) Parity: quiz.correct indices for each module must match the zh-CN
 *      version one-to-one (so the answer key stays valid).
 */

const REQUIRED_MODULES: ModuleId[] = [
  'motor-basics',
  'three-phase',
  'clarke-transform',
  'park-transform',
  'pid-control',
  'foc-flow',
  'svpwm',
  'inverter',
  'sensorless-foc',
  'refrigeration-bench',
];

// Matches Han characters (CJK Unified Ideographs + Extension A) plus common
// CJK punctuation that signals untranslated Chinese content.
const CJK_RE = /[一-鿿㐀-䶿　-〿＀-￯]/;

function listCjkOffenders(label: string, value: string): string[] {
  return CJK_RE.test(value) ? [`${label} -> ${value.slice(0, 80)}`] : [];
}

function assertSchema(id: ModuleId, lesson: LessonContent): string[] {
  const fails: string[] = [];
  if (lesson.id !== id) fails.push(`id mismatch (expected ${id}, got ${lesson.id})`);
  for (const k of ['learningGoals', 'concepts', 'engineeringMeaning', 'stm32Guide', 'commonMistakes', 'debugMethods', 'experiments', 'nextSteps'] as const) {
    if (!Array.isArray(lesson[k])) fails.push(`${k} must be an array`);
    else if ((lesson[k] as string[]).length === 0) fails.push(`${k} is empty`);
  }
  if (!Array.isArray(lesson.formulas) || lesson.formulas.length === 0) fails.push('formulas is empty');
  for (const f of lesson.formulas) {
    if (typeof f.title !== 'string' || typeof f.expression !== 'string' || typeof f.explanation !== 'string') {
      fails.push(`formula entry malformed: ${JSON.stringify(f).slice(0, 80)}`);
    }
  }
  if (typeof lesson.summary !== 'string' || lesson.summary.length === 0) fails.push('summary missing');
  if (typeof lesson.codeExample !== 'string' || lesson.codeExample.length === 0) fails.push('codeExample missing');
  if (lesson.introBeginner) {
    for (const k of ['metaphor', 'coreIdea', 'firstAction'] as const) {
      if (typeof lesson.introBeginner[k] !== 'string') fails.push(`introBeginner.${k} missing`);
    }
    if (!Array.isArray(lesson.introBeginner.whyCare) || lesson.introBeginner.whyCare.length === 0) {
      fails.push('introBeginner.whyCare missing/empty');
    }
  }
  if (lesson.quiz) {
    for (let i = 0; i < lesson.quiz.length; i++) {
      const q = lesson.quiz[i];
      if (typeof q.q !== 'string' || typeof q.hint !== 'string') fails.push(`quiz[${i}] missing q/hint`);
      if (!Array.isArray(q.options) || q.options.length !== 4) fails.push(`quiz[${i}] must have 4 options`);
      if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 3) fails.push(`quiz[${i}].correct out of range`);
    }
  }
  return fails;
}

describe('lessonsEn coverage and schema', () => {
  it('covers the 10 core modules', () => {
    const missing = REQUIRED_MODULES.filter((id) => !lessonsEn[id]);
    expect(missing, `missing English lesson entries: ${missing.join(', ')}`).toEqual([]);
  });

  it('every English entry satisfies the LessonContent schema', () => {
    const errors: string[] = [];
    for (const id of REQUIRED_MODULES) {
      const lesson = lessonsEn[id]!;
      const fails = assertSchema(id, lesson);
      for (const f of fails) errors.push(`${id}: ${f}`);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

describe('lessonsEn text language hygiene', () => {
  it('lesson copy does not contain CJK characters (excluding codeExample comments and quiz options)', () => {
    const offenders: string[] = [];
    for (const id of REQUIRED_MODULES) {
      const lesson = lessonsEn[id]!;
      // Strings that should be pure English / ASCII.
      const textFields: Array<[string, string]> = [
        ['summary', lesson.summary],
      ];
      lesson.learningGoals.forEach((s, i) => textFields.push([`learningGoals[${i}]`, s]));
      lesson.concepts.forEach((s, i) => textFields.push([`concepts[${i}]`, s]));
      lesson.engineeringMeaning.forEach((s, i) => textFields.push([`engineeringMeaning[${i}]`, s]));
      lesson.stm32Guide.forEach((s, i) => textFields.push([`stm32Guide[${i}]`, s]));
      lesson.commonMistakes.forEach((s, i) => textFields.push([`commonMistakes[${i}]`, s]));
      lesson.debugMethods.forEach((s, i) => textFields.push([`debugMethods[${i}]`, s]));
      lesson.experiments.forEach((s, i) => textFields.push([`experiments[${i}]`, s]));
      lesson.nextSteps.forEach((s, i) => textFields.push([`nextSteps[${i}]`, s]));
      lesson.formulas.forEach((f, i) => {
        textFields.push([`formulas[${i}].title`, f.title]);
        textFields.push([`formulas[${i}].explanation`, f.explanation]);
      });
      if (lesson.introBeginner) {
        textFields.push([`introBeginner.metaphor`, lesson.introBeginner.metaphor]);
        textFields.push([`introBeginner.coreIdea`, lesson.introBeginner.coreIdea]);
        textFields.push([`introBeginner.firstAction`, lesson.introBeginner.firstAction]);
        lesson.introBeginner.whyCare.forEach((s, i) => textFields.push([`introBeginner.whyCare[${i}]`, s]));
      }
      if (lesson.quiz) {
        lesson.quiz.forEach((q, i) => {
          textFields.push([`quiz[${i}].q`, q.q]);
          textFields.push([`quiz[${i}].hint`, q.hint]);
        });
      }
      for (const [label, value] of textFields) {
        offenders.push(...listCjkOffenders(`${id}.${label}`, value));
      }
    }
    expect(offenders, `CJK characters detected in: \n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('lessonsEn quiz parity with zh-CN', () => {
  it('quiz.correct indices match the zh-CN version one-to-one', () => {
    const mismatches: string[] = [];
    for (const id of REQUIRED_MODULES) {
      const en = lessonsEn[id]!;
      const zh = lessons[id];
      if (!en.quiz || !zh?.quiz) continue;
      if (en.quiz.length !== zh.quiz.length) {
        mismatches.push(`${id}: quiz length differs (en=${en.quiz.length}, zh=${zh.quiz.length})`);
        continue;
      }
      for (let i = 0; i < en.quiz.length; i++) {
        if (en.quiz[i].correct !== zh.quiz[i].correct) {
          mismatches.push(`${id}.quiz[${i}].correct: en=${en.quiz[i].correct}, zh=${zh.quiz[i].correct}`);
        }
        if (en.quiz[i].options.length !== zh.quiz[i].options.length) {
          mismatches.push(`${id}.quiz[${i}] options length differs`);
        }
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });
});
