import type { TranslationDict } from './types';
import { e } from './entries';

import { common } from './translations/common';
import { shell } from './translations/shell';
import { curriculum } from './translations/curriculum';
import { parameters } from './translations/parameters';
import { faults } from './translations/faults';
import { motorBasics } from './translations/motorBasics';
import { focFlow } from './translations/focFlow';
import { refrigerationBench } from './translations/refrigerationBench';
import { threePhase } from './translations/threePhase';
import { clarkeTransform } from './translations/clarkeTransform';
import { parkTransform } from './translations/parkTransform';
import { pidControl } from './translations/pidControl';
import { svpwm } from './translations/svpwm';
import { inverter } from './translations/inverter';
import { controlLoops } from './translations/controlLoops';
import { sensorlessFoc } from './translations/sensorlessFoc';
import { weakField } from './translations/weakField';
import { faultsDebugging } from './translations/faultsDebugging';
import { hfiSensorless } from './translations/hfiSensorless';
import { startupStateMachine } from './translations/startupStateMachine';
import { apfFrontend } from './translations/apfFrontend';
import { assemblyWorkshop } from './translations/assemblyWorkshop';
import { guidedLab } from './translations/guidedLab';
import { glossary } from './translations/glossary';
import { assistant } from './translations/assistant';
import { llmSettings } from './translations/llmSettings';
import { share } from './translations/share';
import { lab } from './translations/lab';
import { charts } from './translations/charts';
import { three } from './translations/three';
import { insights } from './translations/insights';

/**
 * 翻译表（按命名空间拆分到 src/i18n/translations/<ns>.ts，本文件只做聚合）。
 *
 * 维护原则：
 *  - 翻译值不掺中英混排（除非是术语缩写如 PMSM / SVPWM / Iq）。
 *  - 英文值禁止出现中文字符（单测会校验）。
 *  - 新增 key 必须同时填两种语言；缺一即 TS 类型报错（TranslationEntry 强制 'zh-CN' + 'en-US'）。
 *  - e() 构造器在 ./entries，命名空间文件共享，勿在各文件重复定义。
 */
export const translations = {
  common,
  shell,
  curriculum,
  parameters,
  faults,
  motorBasics,
  focFlow,
  refrigerationBench,
  threePhase,
  clarkeTransform,
  parkTransform,
  pidControl,
  svpwm,
  inverter,
  controlLoops,
  sensorlessFoc,
  weakField,
  faultsDebugging,
  hfiSensorless,
  startupStateMachine,
  apfFrontend,
  assemblyWorkshop,
  guidedLab,
  glossary,
  assistant,
  llmSettings,
  share,
  lab,
  charts,
  three,
  insights,
} satisfies TranslationDict;

export type Translations = typeof translations;
export { e };
