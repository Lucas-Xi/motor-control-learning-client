/**
 * 编程实验室（Code Lab）内容 schema。
 *
 * 每道题 = 一个纯函数实现任务：题面（中英）+ 起手代码 + 冻结的测试向量
 * （期望值由 src/simulation/math 参考实现一次性生成后写死为字面量，
 * 运行期零依赖）+ 分级提示 + STM32 C 参考实现（全部通过后解锁展示）。
 *
 * 双语文案直接内嵌为 TranslationEntry（不进全局 translations 表），
 * 由 codelab.test.ts 做等价校验：en 无 CJK / zh,en 非空。
 */

import type { TranslationEntry } from '../../i18n/types';
import type { ModuleId } from '../../simulation/engine/types';

/** 单个测试用例。args 传给学员函数；expected 与返回值逐元素按容差比对。 */
export interface CodeLabCase {
  /** 展示用的输入标签（如 "Ia=1, Ib=-0.5, Ic=-0.5"），中英由外层 entry 处理或纯符号 */
  label: string;
  args: number[];
  /** 期望返回（学员函数应返回数组或单值；单值会包装成 [v]） */
  expected: number[];
  /** 逐元素绝对容差；默认 1e-4 */
  tol?: number;
}

export interface CodeChallenge {
  id: string;
  moduleId: ModuleId;
  /** 学员要实现的函数名（起手代码里的 TODO 函数） */
  functionName: string;
  /** 题面（中英） */
  title: TranslationEntry;
  statement: TranslationEntry;
  /** 起手代码（含函数签名与 TODO 注释） */
  starter: string;
  cases: CodeLabCase[];
  /** 分级提示（中英），按序解锁 */
  hints: TranslationEntry[];
  /** STM32 C 参考实现（全部通过后展示；也可提前"偷看"并标记） */
  cReference: string;
  /** 难度 1-3 */
  difficulty: 1 | 2 | 3;
}

/** 由内容目录聚合（codelab/index.ts 导出 challenges 数组）。 */
export type CodeChallengeSet = CodeChallenge[];
