import { e } from '../entries';

/** assistant 命名空间（由 translations.ts 机械拆分，语义未变）。 */
export const assistant = {
  fabLabel: e('教学助手', 'Tutor'),
  fabAria: e('打开本地教学助手', 'Open local tutor'),
  panelTitle: e('教学助手', 'Tutor Assistant'),
  panelEyebrow: e('Local Knowledge Lookup', 'Local Knowledge Lookup'),
  panelSubtitle: e(
    '纯本地检索：扫内置讲义 / 公式 / 故障卡 / 引导步骤，不连外网。',
    'Pure local search across built-in lessons / formulas / fault cards / walkthroughs. No external network.',
  ),
  inputPlaceholder: e('比如：弱磁时 Id 该取负多少？', 'e.g., How negative should Id be during field weakening?'),
  sendButton: e('发送', 'Send'),
  sendAria: e('发送问题', 'Send question'),
  clearButton: e('清空对话', 'Clear chat'),
  closeAria: e('关闭助手', 'Close tutor'),
  emptyHint: e(
    '先随便问一句，比如 "FOC 是什么"、"为什么 Iq 会震荡"、"过流怎么排查"。',
    'Try a question like "What is FOC?", "Why is Iq oscillating?", or "How do I trace an over-current fault?".',
  ),
  citationsTitle: e('引用', 'Sources'),
  jumpButton: e('跳到该模块', 'Jump to module'),
  pendingDraftHint: e('题目已填入输入框；按 Enter 发送', 'Question loaded into the input — press Enter to send'),
  askButton: e('问助手', 'Ask tutor'),
  askAria: e('用助手回答这道题', 'Ask the tutor about this question'),
  confidenceLow: e('置信度较低', 'Low confidence'),
  indexBuilding: e('正在构建本地索引…', 'Building local index…'),
  settingsAria: e('LLM 接入设置', 'LLM provider settings'),
  settingsButton: e('LLM 设置', 'LLM settings'),
  providerLocalLabel: e('本地启发式（不调外部 API）', 'Local heuristic (no external API)'),
  providerLocalBadge: e('本地', 'Local'),
  providerLLMBadge: e('云端 LLM', 'Cloud LLM'),
  fallbackNotice: e('已切回本地启发式模式', 'Switched back to local heuristic mode'),
  // 消息首行来源标记（写入 assistant message content；解析侧两种 locale 形态都要能识别）
  localAnswerMarker: e('[本地启发式回答]', '[Local heuristic answer]'),
  llmAnswerLead: e('[由 ', '[Answered by '),
  llmAnswerTail: e(' 回答]', ']'),
  llmAbortedTail: e(' 回答 · 已中止]', ' · aborted]'),
  // 流式生成 chip 与错误提示
  streamingByLead: e('由 ', 'Streaming from '),
  streamingByTail: e(' 流式生成…', '…'),
  generating: e('生成中…', 'Generating…'),
  missingApiKeyError: e('尚未配置该 provider 的 API key', 'No API key configured for this provider yet'),
};
