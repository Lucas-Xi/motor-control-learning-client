import type { CodeChallenge } from './types';
import { clarkeChallenge } from './clarke';
import { parkChallenge } from './park';
import { inverseParkChallenge } from './inversePark';
import { piStepChallenge } from './piStep';
import { svpwmDutyChallenge } from './svpwmDuty';
import { deadtimeVoltChallenge } from './deadtimeVolt';
import { lpfStepChallenge } from './lpfStep';
import { notchCoeffChallenge } from './notchCoeff';
import { mtpaIdChallenge } from './mtpaId';

/** 全部编程挑战（按模块序 03→11）。新增题目：单独文件 + 在此注册。 */
export const codeChallenges: CodeChallenge[] = [
  clarkeChallenge,
  parkChallenge,
  inverseParkChallenge,
  piStepChallenge,
  svpwmDutyChallenge,
  deadtimeVoltChallenge,
  lpfStepChallenge,
  notchCoeffChallenge,
  mtpaIdChallenge,
];

export function challengesForModule(moduleId: string): CodeChallenge[] {
  return codeChallenges.filter((c) => c.moduleId === moduleId);
}
