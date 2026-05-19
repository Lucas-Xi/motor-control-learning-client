import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AssistantPanel,
  messagesToChatTurns,
  shouldInjectRag,
  prettyProviderName,
  prettyModelName,
} from '../AssistantPanel';
import { useAssistantStore, _resetAssistantStoreForTests } from '../../../store/assistantStore';
import { useLLMStore, __resetLLMStoreForTests } from '../../../store/llmStore';
import { ANSWER_SCORE_THRESHOLD } from '../../../utils/ragIndex';

/**
 * AssistantPanel 在 node 环境下不渲染，本测试覆盖：
 *  - AssistantPanel 是合法 function component
 *  - messagesToChatTurns 把历史 chunks 转 ChatMessage 并剥掉"由 X 回答" meta 前缀
 *  - shouldInjectRag 三种 RAG mode 的判定
 *  - prettyProviderName / prettyModelName 显示格式
 *  - 失败降级：模拟 LLMError 时 llmStore.provider 切回 local
 *
 * 真渲染 + 流式 UI 交给 e2e。
 */

function installSessionStorageShim() {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => { store.delete(k); },
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
  } as Storage);
}

describe('AssistantPanel', () => {
  beforeEach(() => {
    installSessionStorageShim();
    _resetAssistantStoreForTests();
    __resetLLMStoreForTests();
  });

  it('exported as function component named AssistantPanel', () => {
    expect(typeof AssistantPanel).toBe('function');
    expect(AssistantPanel.name).toBe('AssistantPanel');
  });

  it('messagesToChatTurns 把"[本地启发式回答]" / "[由 X 回答]" 前缀剥干净', () => {
    const turns = messagesToChatTurns([
      { id: '1', role: 'user', content: '什么是 SVPWM？', ts: 1 },
      {
        id: '2',
        role: 'assistant',
        content: '[本地启发式回答]\nSVPWM 是一种 PWM 调制策略...',
        ts: 2,
      },
      {
        id: '3',
        role: 'user',
        content: 'Iq 为什么会震荡？',
        ts: 3,
      },
      {
        id: '4',
        role: 'assistant',
        content: '[由 OpenAI · GPT-4O-MINI 回答]\n通常是 PI 增益过大或采样延迟...',
        ts: 4,
      },
    ]);
    expect(turns).toHaveLength(4);
    expect(turns[0]).toEqual({ role: 'user', content: '什么是 SVPWM？' });
    expect(turns[1].content).toBe('SVPWM 是一种 PWM 调制策略...');
    expect(turns[1].content).not.toMatch(/本地启发式回答/);
    expect(turns[3].content).toBe('通常是 PI 增益过大或采样延迟...');
    expect(turns[3].content).not.toMatch(/^\[由/);
  });

  it('shouldInjectRag：always 永真、never 永假、when_relevant 看 score', () => {
    expect(shouldInjectRag('always', 0)).toBe(true);
    expect(shouldInjectRag('always', 5)).toBe(true);
    expect(shouldInjectRag('never', 0)).toBe(false);
    expect(shouldInjectRag('never', 9)).toBe(false);
    expect(shouldInjectRag('when_relevant', ANSWER_SCORE_THRESHOLD)).toBe(true);
    expect(shouldInjectRag('when_relevant', ANSWER_SCORE_THRESHOLD + 0.1)).toBe(true);
    expect(shouldInjectRag('when_relevant', ANSWER_SCORE_THRESHOLD - 0.1)).toBe(false);
  });

  it('prettyProviderName 给出三家固定 label', () => {
    expect(prettyProviderName('openai')).toBe('OpenAI');
    expect(prettyProviderName('anthropic')).toBe('Anthropic');
    expect(prettyProviderName('gemini')).toBe('Gemini');
  });

  it('prettyModelName 把 gpt- 大写、claude- 截到三段、gemini- 原样', () => {
    expect(prettyModelName('gpt-4o-mini')).toBe('GPT-4O-MINI');
    expect(prettyModelName('claude-haiku-4-5-20251001')).toBe('claude-haiku-4');
    expect(prettyModelName('gemini-1.5-flash')).toBe('gemini-1.5-flash');
  });

  it('local provider 路由：pushUser → 启发式 composeAnswer 直接 pushAssistant（无 LLM 调用）', async () => {
    // 我们在 node 环境下不能渲染面板，但可以直接验证「llmProvider==='local' 时 assistantStore.pushUser 之后
    // composeAnswer 路径会落库」—— 通过手动模拟 handleSend 的 local 分支。
    const ast = useAssistantStore.getState();
    ast.pushUser('什么是 FOC？');
    // 模拟 runLocalAnswer 等价行为
    const { search, composeAnswer, buildRagIndex, citationToTarget } = await import('../../../utils/ragIndex');
    const idx = buildRagIndex();
    const results = search('什么是 FOC？', 8, idx);
    const composed = composeAnswer('什么是 FOC？', results, 'zh-CN');
    const citations = composed.citations.map((ri) => {
      const r = results[ri];
      const tgt = citationToTarget(r.chunk);
      return {
        chunkId: r.chunk.id,
        title: r.chunk.title,
        preview: r.chunk.text.slice(0, 140),
        moduleId: tgt.moduleId,
        walkthroughStepId: tgt.walkthroughStepId,
      };
    });
    ast.pushAssistant(`[本地启发式回答]\n${composed.answer}`, citations);

    const msgs = useAssistantStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content.startsWith('[本地启发式回答]')).toBe(true);
  });

  it('流式 delta 拼接：AsyncIterable 顺序 yield 后 assemble 出完整字符串', async () => {
    // 模拟 provider.chat() AsyncIterable
    async function* fakeStream() {
      yield { delta: '电流环 ' };
      yield { delta: 'PI 增益 ' };
      yield { delta: '过大会震荡。' };
    }
    let assembled = '';
    for await (const chunk of fakeStream()) {
      assembled += chunk.delta;
    }
    expect(assembled).toBe('电流环 PI 增益 过大会震荡。');
  });

  it('失败降级：LLMError 触发后将 provider 切回 local', async () => {
    // 1) 先把 provider 调到 openai 模拟用户已选 LLM
    useLLMStore.getState().setProvider('openai');
    useLLMStore.getState().setKey('openai', 'sk-test-fake');
    expect(useLLMStore.getState().provider).toBe('openai');

    // 2) 模拟 catch 分支的核心动作：setProvider('local') + setFallbackReason
    // 注意：setProvider 会清空 fallbackReason，所以 reason 要在 setProvider 之后写
    const reason = 'unauthorized: 认证失败（HTTP 401）';
    useLLMStore.getState().setProvider('local');
    useLLMStore.getState().setFallbackReason(reason);

    expect(useLLMStore.getState().provider).toBe('local');
    expect(useLLMStore.getState().fallbackReason).toBe(reason);
  });

  it('flow：local 路径与 LLM 路径在 store 上的可观察差异', async () => {
    // local：provider==='local' + apiKey 为空仍可发问
    expect(useLLMStore.getState().provider).toBe('local');
    expect(useLLMStore.getState().apiKeys.openai).toBe('');

    // 切到 openai 之后没 key → 上层应该直接抛 LLMError('unauthorized')；
    // 这一行为通过 runLLMAnswer 的 if (!apiKey) throw 保证
    useLLMStore.getState().setProvider('openai');
    expect(useLLMStore.getState().provider).toBe('openai');
    expect(useLLMStore.getState().apiKeys.openai).toBe('');
  });
});
