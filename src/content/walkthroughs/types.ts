import type { ModuleId } from '../../simulation/engine/types';

/**
 * 深度教学引导（walkthrough）—— 比 guidedExperiments 更丰富的一档：
 *
 *   guidedExperiments：3-4 步骤，title/action/observe/expected。
 *   walkthroughs：    5-8 步骤，每步含 goal/whyMatters/quiz；外加 pitfalls 试错按钮。
 *
 * GuidedExperimentBar 优先消费本文件；缺失时回退到旧的 guidedExperiments。
 * 每个模块的 walkthrough 在 src/content/walkthroughs/<module-id>.ts 单独定义，
 * 避免多文件同时编辑造成的合并冲突（并行 agent 工作流要求）。
 */

export interface QuizCheck {
  q: string;
  options: [string, string, string, string]; // 严格 4 个选项
  correct: 0 | 1 | 2 | 3;
  hint: string;
}

export interface WalkthroughStep {
  /** 步骤唯一标识，模块内不重复；用作 React key 与 store 进度索引 */
  id: string;
  /** 3-7 字短标题，会出现在步骤选择 chip 上 */
  title: string;
  /**
   * 英文短标题（可选）。若提供，UI 在 locale==='en-US' 时优先采用。
   * 缺失时回退到 `title`（中文）并由 UI 叠加 sr-only "(zh fallback)" 提示。
   */
  titleEn?: string;
  /** 一句话讲"这一步要让学员看到 / 理解什么"，给步骤起锚点 */
  goal: string;
  /** 具体操作指令（祈使句），如 "把极对数从 4 改到 8" */
  action: string;
  /**
   * 英文操作指令（可选）。若提供，UI 在 locale==='en-US' 时优先采用；
   * 缺失时回退到 `action`（中文）。
   */
  actionEn?: string;
  /** 操作后应该看到的现象，如 "θe 圆环角速度变成原来的 2 倍" */
  observe: string;
  /** 这一步在 FOC 全局链路里的意义；最终把"为什么"讲清 */
  whyMatters: string;
  /** 自动加载工况预设（presetId 引用 presets.ts 的 experimentPresets，可选） */
  presetId?: string;
  /** 步内小测；6 步以上模块建议穿插 2-3 道 */
  quiz?: QuizCheck;
}

export interface Pitfall {
  id: string;
  /** 按钮显示文案，如 "试错：把极对数填成极数" */
  label: string;
  /** 触发后一句话现象描述 */
  symptom: string;
  /** 为什么会这样；接回正确概念 */
  why: string;
  /** 错工况预设（presetId 引用 presets.ts，可选） */
  presetId?: string;
}

export interface ModuleWalkthrough {
  moduleId: ModuleId;
  /** 模块主旨，< 30 字 */
  bigPicture: string;
  /** 学完应能回答的核心问题 3-5 条 */
  successCriteria: string[];
  /** 主线步骤 5-8 步 */
  steps: WalkthroughStep[];
  /** 常见误区演示按钮 2-4 个 */
  pitfalls: Pitfall[];
  /** 学完到下一模块的一句话引子 */
  nextModuleHook: string;
}

/**
 * 简单完整性自检：在 dev 期帮快速发现"步骤少于 5 步" / "pitfall 少于 2 个" 这类
 * 不符合"深度教化"要求的 walkthrough。
 */
export function validateWalkthrough(w: ModuleWalkthrough): string[] {
  const errs: string[] = [];
  if (w.steps.length < 5) errs.push(`steps 少于 5 步 (${w.steps.length})`);
  if (w.steps.length > 9) errs.push(`steps 超过 9 步 (${w.steps.length})`);
  if (w.pitfalls.length < 2) errs.push(`pitfalls 少于 2 个 (${w.pitfalls.length})`);
  if (w.successCriteria.length < 3) errs.push(`successCriteria 少于 3 条`);
  const ids = new Set<string>();
  for (const s of w.steps) {
    if (ids.has(s.id)) errs.push(`step id 重复: ${s.id}`);
    ids.add(s.id);
    if (s.quiz && s.quiz.options.length !== 4) errs.push(`step ${s.id} quiz options 必须 4 个`);
  }
  return errs;
}
