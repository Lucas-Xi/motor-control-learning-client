import { create } from 'zustand';
import {
  DEFAULT_MODEL,
  estimateCostFor,
  type ChatMessage,
  type LLMProviderName,
} from '../utils/llmProviders';

/**
 * BYOK LLM 设置 store（轮 8）。
 *
 * 选用 'local' | provider 四态：
 *   - 'local' 是默认；走 ragIndex + composeAnswer 启发式（即轮 7 路径）
 *   - 'openai' | 'anthropic' | 'gemini' 三家任意一家，必须配 key 才能真正调用
 *
 * 安全约定（参照 cloudShareStore 的 PAT 范式）：
 *   - 所有 apiKeys + 当前 provider/model + 配额计数全部仅写 sessionStorage；
 *   - **绝不**写 localStorage（关掉标签页就清）；
 *   - 不持久化到 zustand persist（避免误把 key 序列化到 IndexedDB / 任何 long-term）。
 *
 * 单元测试通过 vi.stubGlobal('sessionStorage', memoryImpl) 验证：
 *   - setKey('openai', 'sk-x') 后 sessionStorage 命中、localStorage 未命中
 *   - clearAll() 把所有 session key 都清掉
 */

// ─── 公开常量 ───────────────────────────────────────────────────────────────

export type AssistantProvider = 'local' | LLMProviderName;

export type RagMode = 'always' | 'when_relevant' | 'never';

export const LLM_SESSION_KEYS = {
  provider: 'compbench:llm:provider',
  model: 'compbench:llm:model',
  ragMode: 'compbench:llm:rag-mode',
  maxTokens: 'compbench:llm:max-tokens',
  monthlyBudgetUsd: 'compbench:llm:monthly-budget-usd',
  /** 用量累计（usd）；每次成功完成生成后更新 */
  spentUsd: 'compbench:llm:spent-usd',
  /** 用量累计（tokens） */
  spentTokens: 'compbench:llm:spent-tokens',
  keyPrefix: 'compbench:llm:key:',
} as const;

const ALL_PROVIDERS: LLMProviderName[] = ['openai', 'anthropic', 'gemini'];

// ─── 内存 + sessionStorage IO 工具 ──────────────────────────────────────────

function readSession(key: string): string {
  if (typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeSession(key: string, value: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* sessionStorage quota / disabled → 静默忽略 */
  }
}

// ─── State / Actions ────────────────────────────────────────────────────────

export interface LLMState {
  provider: AssistantProvider;
  apiKeys: Record<LLMProviderName, string>;
  /** 当前选中的模型 id（按 provider 切换会自动重置为该家默认模型） */
  model: string;
  /** RAG 注入策略 */
  ragMode: RagMode;
  /** 单次请求最大输出 tokens */
  maxTokens: number;
  /** 月度预算（USD）；0 = 无限 */
  monthlyBudgetUsd: number;
  /** 累计花费（USD，sessionStorage 持久） */
  spentUsd: number;
  /** 累计 tokens（USD 估算之外的可读量） */
  spentTokens: number;
  /** 最近一次降级原因（'local' 时若由真 LLM 失败回退会带 reason） */
  fallbackReason: string;

  setProvider: (provider: AssistantProvider) => void;
  setKey: (provider: LLMProviderName, key: string) => void;
  setModel: (model: string) => void;
  setRagMode: (mode: RagMode) => void;
  setMaxTokens: (n: number) => void;
  setMonthlyBudgetUsd: (usd: number) => void;
  /** 记录一次成功调用的成本 */
  recordSpend: (usd: number, tokens: number) => void;
  /** 用户手动重置月度计数 */
  resetSpend: () => void;
  /** 清空所有 key + 所有 session 持久；切回 local */
  clearAll: () => void;
  /** 设置降级原因（pure setter，不触发任何 IO） */
  setFallbackReason: (reason: string) => void;
  /** 估算下一次请求成本（不调网络） */
  estimateNext: (messages: ChatMessage[]) => { input_tokens: number; output_tokens: number; usd: number };
  /** 月度预算是否超限 */
  isOverBudget: () => boolean;
}

function parseProvider(raw: string): AssistantProvider {
  if (raw === 'openai' || raw === 'anthropic' || raw === 'gemini' || raw === 'local') return raw;
  return 'local';
}

function parseRagMode(raw: string): RagMode {
  if (raw === 'always' || raw === 'when_relevant' || raw === 'never') return raw;
  return 'when_relevant';
}

function parsePosNumber(raw: string, fallback: number): number {
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function initialState(): Pick<
  LLMState,
  | 'provider'
  | 'apiKeys'
  | 'model'
  | 'ragMode'
  | 'maxTokens'
  | 'monthlyBudgetUsd'
  | 'spentUsd'
  | 'spentTokens'
  | 'fallbackReason'
> {
  const provider = parseProvider(readSession(LLM_SESSION_KEYS.provider));
  const apiKeys: Record<LLMProviderName, string> = {
    openai: readSession(LLM_SESSION_KEYS.keyPrefix + 'openai'),
    anthropic: readSession(LLM_SESSION_KEYS.keyPrefix + 'anthropic'),
    gemini: readSession(LLM_SESSION_KEYS.keyPrefix + 'gemini'),
  };
  const storedModel = readSession(LLM_SESSION_KEYS.model);
  const model = storedModel || (provider === 'local' ? DEFAULT_MODEL.openai : DEFAULT_MODEL[provider]);
  return {
    provider,
    apiKeys,
    model,
    ragMode: parseRagMode(readSession(LLM_SESSION_KEYS.ragMode)),
    maxTokens: Math.min(8192, Math.max(64, parsePosNumber(readSession(LLM_SESSION_KEYS.maxTokens), 1024))),
    monthlyBudgetUsd: parsePosNumber(readSession(LLM_SESSION_KEYS.monthlyBudgetUsd), 0),
    spentUsd: parsePosNumber(readSession(LLM_SESSION_KEYS.spentUsd), 0),
    spentTokens: parsePosNumber(readSession(LLM_SESSION_KEYS.spentTokens), 0),
    fallbackReason: '',
  };
}

const seed = initialState();

export const useLLMStore = create<LLMState>((set, get) => ({
  ...seed,

  setProvider: (provider) => {
    writeSession(LLM_SESSION_KEYS.provider, provider);
    // 切 provider 时若当前 model 不在该家目录里，重置为该家默认
    let nextModel = get().model;
    if (provider !== 'local') {
      const defaultM = DEFAULT_MODEL[provider];
      // 用启发式判断：若当前 model 串不在新 provider 默认列表里就重置
      // （不要求强一致 —— 设置面板会强制让用户选）
      if (!nextModel || (!nextModel.startsWith(provider) && !modelLooksFromProvider(nextModel, provider))) {
        nextModel = defaultM;
        writeSession(LLM_SESSION_KEYS.model, nextModel);
      }
    }
    set({ provider, model: nextModel, fallbackReason: '' });
  },

  setKey: (provider, key) => {
    const trimmed = (key ?? '').trim();
    writeSession(LLM_SESSION_KEYS.keyPrefix + provider, trimmed);
    set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: trimmed } }));
  },

  setModel: (model) => {
    writeSession(LLM_SESSION_KEYS.model, model);
    set({ model });
  },

  setRagMode: (mode) => {
    writeSession(LLM_SESSION_KEYS.ragMode, mode);
    set({ ragMode: mode });
  },

  setMaxTokens: (n) => {
    const clamped = Math.min(8192, Math.max(64, Math.floor(n)));
    writeSession(LLM_SESSION_KEYS.maxTokens, String(clamped));
    set({ maxTokens: clamped });
  },

  setMonthlyBudgetUsd: (usd) => {
    const clamped = Math.max(0, Number(usd) || 0);
    writeSession(LLM_SESSION_KEYS.monthlyBudgetUsd, String(clamped));
    set({ monthlyBudgetUsd: clamped });
  },

  recordSpend: (usd, tokens) => {
    set((s) => {
      const nextUsd = s.spentUsd + Math.max(0, usd);
      const nextTok = s.spentTokens + Math.max(0, Math.floor(tokens));
      writeSession(LLM_SESSION_KEYS.spentUsd, String(nextUsd));
      writeSession(LLM_SESSION_KEYS.spentTokens, String(nextTok));
      return { spentUsd: nextUsd, spentTokens: nextTok };
    });
  },

  resetSpend: () => {
    writeSession(LLM_SESSION_KEYS.spentUsd, '');
    writeSession(LLM_SESSION_KEYS.spentTokens, '');
    set({ spentUsd: 0, spentTokens: 0 });
  },

  clearAll: () => {
    // 把所有 key 都清掉
    for (const p of ALL_PROVIDERS) writeSession(LLM_SESSION_KEYS.keyPrefix + p, '');
    writeSession(LLM_SESSION_KEYS.provider, 'local');
    writeSession(LLM_SESSION_KEYS.model, '');
    writeSession(LLM_SESSION_KEYS.spentUsd, '');
    writeSession(LLM_SESSION_KEYS.spentTokens, '');
    set({
      provider: 'local',
      apiKeys: { openai: '', anthropic: '', gemini: '' },
      model: DEFAULT_MODEL.openai,
      spentUsd: 0,
      spentTokens: 0,
      fallbackReason: '',
    });
  },

  setFallbackReason: (reason) => set({ fallbackReason: reason }),

  estimateNext: (messages) => {
    const s = get();
    if (s.provider === 'local') return { input_tokens: 0, output_tokens: 0, usd: 0 };
    return estimateCostFor(s.provider, s.model, messages, s.maxTokens);
  },

  isOverBudget: () => {
    const s = get();
    return s.monthlyBudgetUsd > 0 && s.spentUsd >= s.monthlyBudgetUsd;
  },
}));

/** 启发式：判断已存 model 是否看起来属于指定 provider（用于 provider 切换时是否需要重置） */
function modelLooksFromProvider(model: string, provider: LLMProviderName): boolean {
  const m = model.toLowerCase();
  if (provider === 'openai') return m.startsWith('gpt-') || m.startsWith('o') || m.includes('openai');
  if (provider === 'anthropic') return m.startsWith('claude-');
  if (provider === 'gemini') return m.startsWith('gemini-');
  return false;
}

/** 测试用：重置 in-memory 状态（不清 sessionStorage） */
export function __resetLLMStoreForTests(): void {
  useLLMStore.setState({
    provider: 'local',
    apiKeys: { openai: '', anthropic: '', gemini: '' },
    model: DEFAULT_MODEL.openai,
    ragMode: 'when_relevant',
    maxTokens: 1024,
    monthlyBudgetUsd: 0,
    spentUsd: 0,
    spentTokens: 0,
    fallbackReason: '',
  });
}
