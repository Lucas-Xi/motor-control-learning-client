/**
 * BYOK 真 LLM Provider 抽象（轮 8）。
 *
 * 设计目标：
 *  - 在保留本地 RAG 启发式回答路径的前提下，加 3 家主流云端 LLM 的可选接入；
 *  - 全部走原生 fetch，不引入任何 SDK（openai / anthropic / @google/generative-ai），
 *    避免 50-200 KB 体积膨胀 + 减少安全审计面；
 *  - API key 由用户自带（BYOK）、只存 sessionStorage、永不写 localStorage / 永不上链；
 *  - 错误友好化：401/403 → 提示 key 无效；429 → rate limit；网络抛错 → network；
 *    任意失败上层都能自动降级到本地启发式（见 AssistantPanel 路由）。
 *
 * 不实现：函数调用 / 多模态 / 工具调用 —— 教学助手只需要"流式文本输出"。
 * 不实现：response_format=json_schema —— 内置 RAG 已经提供结构化 citation；
 *         LLM 只负责把 chunks 转成自然语言回答。
 *
 * SSE 解析共用 `iterSseLines()`：把 ReadableStream 切成"data: ..." 行。
 */

// ─── 公开类型 ────────────────────────────────────────────────────────────────

export type LLMProviderName = 'openai' | 'anthropic' | 'gemini';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  /** 模型 id，例如 'gpt-4o-mini' / 'claude-haiku-4-5-20251001' / 'gemini-1.5-flash' */
  model: string;
  /** 生成上限（默认 1024，对教学场景足够） */
  maxTokens?: number;
  /** 流式中断信号（用户点"停止"按钮） */
  signal?: AbortSignal;
}

export interface ChatChunk {
  /** 增量文本（**不是**累加版） */
  delta: string;
}

export interface CostEstimate {
  input_tokens: number;
  output_tokens: number;
  usd: number;
}

export interface LLMProvider {
  name: LLMProviderName;
  /** 流式聊天；每次 yield 一个 delta（增量字符串） */
  chat(messages: ChatMessage[], opts: ChatOptions): AsyncIterable<ChatChunk>;
  /** 估算单次请求成本（不调网络；用 tokens 粗估 + 公开价格表） */
  estimateCost(messages: ChatMessage[], opts: ChatOptions): CostEstimate;
}

/** 友好错误：上层捕获后映射成中文 toast / fallback 提示 */
export class LLMError extends Error {
  code: 'unauthorized' | 'rate-limit' | 'network' | 'parse' | 'server' | 'aborted' | 'unknown';
  status?: number;
  constructor(code: LLMError['code'], message: string, status?: number) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.status = status;
  }
}

// ─── 公开常量：模型列表 + 价格表（USD per 1M tokens） ─────────────────────────

/**
 * 公开价格表来源（截至 2026-05）：
 *  - OpenAI：https://openai.com/api/pricing/
 *      gpt-4o-mini : $0.150 in / $0.600 out per 1M
 *      gpt-4o      : $2.500 in / $10.000 out per 1M
 *  - Anthropic：https://www.anthropic.com/pricing
 *      claude-haiku-4-5  : $1.000 in / $5.000  out per 1M
 *      claude-sonnet-4-6 : $3.000 in / $15.000 out per 1M
 *  - Google：https://ai.google.dev/pricing
 *      gemini-1.5-flash : $0.075 in / $0.300 out per 1M (≤128K context)
 *      gemini-1.5-pro   : $1.250 in / $5.000 out per 1M (≤128K context)
 *
 * 价格随官方调整可能漂移；用户在设置面板会看到"成本估算"+ 来源链接。
 */
export interface ModelInfo {
  id: string;
  label: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export const MODEL_CATALOG: Record<LLMProviderName, ModelInfo[]> = {
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
    { id: 'gpt-4o', label: 'GPT-4o', inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 },
  ],
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', inputPerMillionUsd: 1, outputPerMillionUsd: 5 },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  ],
  gemini: [
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', inputPerMillionUsd: 0.075, outputPerMillionUsd: 0.3 },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', inputPerMillionUsd: 1.25, outputPerMillionUsd: 5 },
  ],
};

export const DEFAULT_MODEL: Record<LLMProviderName, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-1.5-flash',
};

/** 取模型元信息（用于查价格 / label）；找不到返回 undefined */
export function lookupModel(provider: LLMProviderName, modelId: string): ModelInfo | undefined {
  return MODEL_CATALOG[provider]?.find((m) => m.id === modelId);
}

// ─── token 估算 ──────────────────────────────────────────────────────────────

/**
 * 粗估 token 数：
 *  - ASCII 段按 4 字符 ≈ 1 token（OpenAI 经验值）
 *  - 中文段按 1.5 字符 ≈ 1 token（CJK 在 BPE 下大致 2 字符 = 3 tokens，向上取整简单化）
 *
 * 与官方 tokenizer 误差 ±25%，足够"提醒用户大概花多少钱"的场景；
 * 不引入 tiktoken / @anthropic-ai/tokenizer（额外 1-3 MB WASM）。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // 简化 CJK 判断：BMP 内的 CJK Unified Ideographs / Hiragana / Katakana / Hangul
    if (
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      cjk++;
    } else {
      other++;
    }
  }
  return Math.max(1, Math.ceil(cjk / 1.5) + Math.ceil(other / 4));
}

/** 把 messages 拼起来按字符总长估算输入 tokens */
export function estimateInputTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const m of messages) {
    // 每条消息额外 ~4 tokens 用于角色 / 分隔符
    total += 4 + estimateTokens(m.content);
  }
  return total;
}

/** 估算成本（输入实测 + 输出按 max_tokens 上界） */
export function estimateCostFor(
  provider: LLMProviderName,
  modelId: string,
  messages: ChatMessage[],
  maxTokens: number,
): CostEstimate {
  const model = lookupModel(provider, modelId);
  const input = estimateInputTokens(messages);
  const output = Math.max(1, maxTokens);
  if (!model) return { input_tokens: input, output_tokens: output, usd: 0 };
  const usd = (input / 1_000_000) * model.inputPerMillionUsd
    + (output / 1_000_000) * model.outputPerMillionUsd;
  return { input_tokens: input, output_tokens: output, usd };
}

// ─── SSE 解析 ────────────────────────────────────────────────────────────────

/**
 * 把 ReadableStream<Uint8Array> 切成完整的 "data: <json>" 行（不含 'data: ' 前缀）。
 *
 * 三家 provider 的 SSE 都是
 *   data: {...}\n
 *   data: [DONE]\n  (OpenAI)
 *   data: {...}\n   (Anthropic — 还有 event: 行；我们只关心 data: 行)
 *
 * Gemini 是 SSE 风格的 streamGenerateContent?alt=sse；同样按行切 data:。
 *
 * 中断：通过 reader.cancel() 释放上游；signal.aborted 时直接 throw LLMError('aborted')。
 */
export async function* iterSseLines(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) throw new LLMError('aborted', '请求被用户取消');
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // 按 \n\n 切事件块（SSE 规范）；但实际服务有些只给 \n，所以两种都接
      let idx: number;
      while (true) {
        const nn = buffer.indexOf('\n\n');
        const nr = buffer.indexOf('\r\n\r\n');
        idx = nn === -1 ? nr : (nr === -1 ? nn : Math.min(nn, nr));
        if (idx === -1) break;
        const sep = buffer.slice(idx, idx + 4).startsWith('\r\n') ? 4 : 2;
        const eventBlock = buffer.slice(0, idx);
        buffer = buffer.slice(idx + sep);
        // 一个事件块内可能有多行（event: / data: / id: ...），只取 data:
        for (const line of eventBlock.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            yield trimmed.slice(5).trimStart();
          }
        }
      }
    }
    // flush 尾部残留
    const tail = buffer.trim();
    if (tail) {
      for (const line of tail.split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith('data:')) yield t.slice(5).trimStart();
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* 已经 cancel 过 / 流已关闭 → 忽略 */
    }
  }
}

// ─── 共用：错误响应 → LLMError ────────────────────────────────────────────────

function mapHttpStatus(status: number, bodyText: string): LLMError {
  if (status === 401 || status === 403) {
    return new LLMError('unauthorized', `认证失败（HTTP ${status}）：${bodyText.slice(0, 200)}`, status);
  }
  if (status === 429) {
    return new LLMError('rate-limit', `速率受限（HTTP 429）：${bodyText.slice(0, 200)}`, status);
  }
  if (status >= 500) {
    return new LLMError('server', `服务端错误（HTTP ${status}）：${bodyText.slice(0, 200)}`, status);
  }
  return new LLMError('unknown', `HTTP ${status}：${bodyText.slice(0, 200)}`, status);
}

async function readErrorBody(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return resp.statusText;
  }
}

// ─── OpenAI Provider ────────────────────────────────────────────────────────

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export function openaiProvider(apiKey: string): LLMProvider {
  return {
    name: 'openai',
    estimateCost: (messages, opts) => estimateCostFor('openai', opts.model, messages, opts.maxTokens ?? 1024),
    chat: (messages, opts) => openaiChat(apiKey, messages, opts),
  };
}

async function* openaiChat(
  apiKey: string,
  messages: ChatMessage[],
  opts: ChatOptions,
): AsyncIterable<ChatChunk> {
  let resp: Response;
  try {
    resp = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        stream: true,
        max_tokens: opts.maxTokens ?? 1024,
      }),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new LLMError('aborted', '请求被取消');
    }
    throw new LLMError('network', `网络错误：${(err as Error).message}`);
  }
  if (!resp.ok) {
    const body = await readErrorBody(resp);
    throw mapHttpStatus(resp.status, body);
  }
  if (!resp.body) throw new LLMError('parse', 'OpenAI 返回空 stream');

  for await (const data of iterSseLines(resp.body, opts.signal)) {
    if (data === '[DONE]') return;
    if (!data) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue; // 跳过 keep-alive / 注释
    }
    const obj = parsed as { choices?: Array<{ delta?: { content?: string } }> };
    const delta = obj.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta.length > 0) yield { delta };
  }
}

// ─── Anthropic Provider ─────────────────────────────────────────────────────

export const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

export function anthropicProvider(apiKey: string): LLMProvider {
  return {
    name: 'anthropic',
    estimateCost: (messages, opts) => estimateCostFor('anthropic', opts.model, messages, opts.maxTokens ?? 1024),
    chat: (messages, opts) => anthropicChat(apiKey, messages, opts),
  };
}

async function* anthropicChat(
  apiKey: string,
  messages: ChatMessage[],
  opts: ChatOptions,
): AsyncIterable<ChatChunk> {
  // Anthropic 把 system 当独立字段；其它角色保持 user / assistant
  const systemParts: string[] = [];
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (m.role === 'system') systemParts.push(m.content);
    else turns.push({ role: m.role, content: m.content });
  }
  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        // 允许浏览器直接调用（Anthropic 默认拒 CORS）
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 1024,
        system: systemParts.join('\n\n') || undefined,
        messages: turns,
        stream: true,
      }),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new LLMError('aborted', '请求被取消');
    }
    throw new LLMError('network', `网络错误：${(err as Error).message}`);
  }
  if (!resp.ok) {
    const body = await readErrorBody(resp);
    throw mapHttpStatus(resp.status, body);
  }
  if (!resp.body) throw new LLMError('parse', 'Anthropic 返回空 stream');

  for await (const data of iterSseLines(resp.body, opts.signal)) {
    if (!data) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    // Anthropic 事件流类型：message_start / content_block_start / content_block_delta /
    // content_block_stop / message_delta / message_stop / ping
    const obj = parsed as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta' && obj.delta.text) {
      yield { delta: obj.delta.text };
    }
    if (obj.type === 'message_stop') return;
  }
}

// ─── Gemini Provider ────────────────────────────────────────────────────────

export const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiProvider(apiKey: string): LLMProvider {
  return {
    name: 'gemini',
    estimateCost: (messages, opts) => estimateCostFor('gemini', opts.model, messages, opts.maxTokens ?? 1024),
    chat: (messages, opts) => geminiChat(apiKey, messages, opts),
  };
}

async function* geminiChat(
  apiKey: string,
  messages: ChatMessage[],
  opts: ChatOptions,
): AsyncIterable<ChatChunk> {
  // Gemini 没有 system role；把 system 内容并到第一条 user 前置 ; assistant → model
  const systemParts: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }
  }
  // 把 system 段挂到 systemInstruction 字段（v1beta 支持）
  const payload = {
    contents,
    systemInstruction: systemParts.length
      ? { role: 'system', parts: [{ text: systemParts.join('\n\n') }] }
      : undefined,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 1024,
    },
  };
  const url = `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new LLMError('aborted', '请求被取消');
    }
    throw new LLMError('network', `网络错误：${(err as Error).message}`);
  }
  if (!resp.ok) {
    const body = await readErrorBody(resp);
    throw mapHttpStatus(resp.status, body);
  }
  if (!resp.body) throw new LLMError('parse', 'Gemini 返回空 stream');

  for await (const data of iterSseLines(resp.body, opts.signal)) {
    if (!data) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    const obj = parsed as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const parts = obj.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (typeof p.text === 'string' && p.text.length > 0) yield { delta: p.text };
      }
    }
  }
}

// ─── Provider 工厂 ──────────────────────────────────────────────────────────

export function makeProvider(name: LLMProviderName, apiKey: string): LLMProvider {
  if (name === 'openai') return openaiProvider(apiKey);
  if (name === 'anthropic') return anthropicProvider(apiKey);
  if (name === 'gemini') return geminiProvider(apiKey);
  throw new LLMError('unknown', `未知 provider：${String(name)}`);
}

/**
 * 测连接：发一句最小请求看是否返回非空 delta；用于设置面板"测试 key"按钮。
 *
 * 用 maxTokens=8 限制成本；任何 throw 直接冒泡，UI 层映射到中文提示。
 */
export async function testProviderKey(
  name: LLMProviderName,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<{ ok: true; sample: string }> {
  const provider = makeProvider(name, apiKey);
  let sample = '';
  for await (const chunk of provider.chat(
    [
      { role: 'system', content: 'Reply with the single word OK.' },
      { role: 'user', content: 'ping' },
    ],
    { model, maxTokens: 8, signal },
  )) {
    sample += chunk.delta;
    if (sample.length > 64) break;
  }
  return { ok: true, sample };
}
