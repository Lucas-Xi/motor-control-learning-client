/**
 * 官方答案登记处：每道编程挑战必须有且至少一个满分实现。
 *
 * 用途：
 *  1. codelab 内容测试用它保证"无无解之题"；
 *  2. UI 的"看参考答案"按钮在学员放弃时展示（同时标记未通过）。
 * 答案风格故意写得朴素——贴近学员会写出的样子，而非炫技。
 */
import { clarkeSolution } from './clarke';
import { parkSolution } from './park';
import { inverseParkSolution } from './inversePark';
import { piStepSolution } from './piStep';
import { svpwmDutySolution } from './svpwmDuty';
import { deadtimeVoltSolution } from './deadtimeVolt';
import { lpfStepSolution } from './lpfStep';
import { notchCoeffSolution } from './notchCoeff';
import { mtpaIdSolution } from './mtpaId';

export const codeLabSolutions: Record<string, string> = {
  'clarke-transform': clarkeSolution,
  'park-transform': parkSolution,
  'inverse-park-transform': inverseParkSolution,
  'pi-step': piStepSolution,
  'svpwm-core': svpwmDutySolution,
  'deadtime-volt': deadtimeVoltSolution,
  'lpf-step': lpfStepSolution,
  'notch-coeff': notchCoeffSolution,
  'mtpa-id': mtpaIdSolution,
};
