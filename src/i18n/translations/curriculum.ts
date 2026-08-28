import { e } from '../entries';

/** curriculum 命名空间（由 translations.ts 机械拆分，语义未变）。 */
export const curriculum = {
  eyebrow: e('Curriculum Tracks', 'Curriculum Tracks'),
  title: e('课程主线', 'Curriculum Tracks'),
  description: e(
    '把 16 个模块串成 4 条主题路径，按学习目标推进。每个 checkpoint 完成后勾选打钩，走完整条可导出 SVG 学习证书。',
    'Sixteen modules organized into four themed tracks. Tick checkpoints as you complete them; finishing a track exports an SVG learning certificate.',
  ),
  resetProgress: e('重置进度', 'Reset progress'),
  exportCertificate: e('导出学习证书', 'Export certificate'),
  completionLabel: e('完成度', 'Completion'),
  nextStep: e('下一步：', 'Next: '),
  goNow: e('立即前往', 'Go now'),
  pathDone: e('整条路径已完成 · 可导出证书', 'Track complete · certificate available'),
  // —— 路径卡片 / checkpoint 行（TrackCard / CheckpointRow）——
  trackCardAria: e('{title}，完成 {n}%；点击展开 checkpoint 列表', '{title}, {n}% complete; click to expand the checkpoint list'),
  markDoneAria: e('标记完成 {title}', 'Mark {title} as complete'),
  unmarkAria: e('取消勾选 {title}', 'Unmark {title}'),
  walkthroughRange: e('建议 walkthrough 步骤 {a} – {b}', 'Suggested walkthrough steps {a} – {b}'),
  optionalChallenge: e('选做挑战', 'Optional challenge'),
  goAria: e('跳转到模块 {title} 并加载预设', 'Jump to module {title} and load its preset'),
  goShort: e('前往', 'Go'),
  resetConfirm: e('确认重置「{title}」的所有勾选进度？', 'Reset all checkpoint progress for "{title}"?'),
};
