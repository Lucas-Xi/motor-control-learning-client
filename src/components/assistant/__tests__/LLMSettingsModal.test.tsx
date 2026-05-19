import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMSettingsModal, mapTestErrorMessageKey } from '../LLMSettingsModal';
import { useLLMStore, __resetLLMStoreForTests } from '../../../store/llmStore';
import { LLMError, MODEL_CATALOG } from '../../../utils/llmProviders';
import { translations } from '../../../i18n/translations';

/**
 * 因为 vitest 跑在 node 环境（无 jsdom + 无 @testing-library），
 * 本测试只做"轻量化静态/逻辑断言"——
 *  - 组件是合法 function component
 *  - 错误映射函数返回正确 i18n key
 *  - provider 切换写 store
 *  - 隐私警示 / Esc 提示等 i18n key 存在
 *  - 模型下拉来源 MODEL_CATALOG 与各 provider 对齐
 *
 * 真渲染 + 键盘交互交给 e2e（tests/e2e/）。
 */

// 用 in-memory shim 替换 sessionStorage（jsdom 不可用时 llmStore 走 typeof undefined 分支）
function installSessionStorageShim() {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => {
      store.delete(k);
    },
    setItem: (k, v) => {
      store.set(k, String(v));
    },
  };
  vi.stubGlobal('sessionStorage', shim);
}

describe('LLMSettingsModal', () => {
  beforeEach(() => {
    installSessionStorageShim();
    __resetLLMStoreForTests();
  });

  it('exported as function component named LLMSettingsModal', () => {
    expect(typeof LLMSettingsModal).toBe('function');
    expect(LLMSettingsModal.name).toBe('LLMSettingsModal');
  });

  it('mapTestErrorMessageKey 把 4 类 LLMError 正确映射成 i18n key', () => {
    expect(mapTestErrorMessageKey(new LLMError('unauthorized', 'bad', 401)).messageKey).toBe(
      'llmSettings.testFailUnauthorized',
    );
    expect(mapTestErrorMessageKey(new LLMError('rate-limit', '429')).messageKey).toBe(
      'llmSettings.testFailRateLimit',
    );
    expect(mapTestErrorMessageKey(new LLMError('network', 'no net')).messageKey).toBe(
      'llmSettings.testFailNetwork',
    );
    expect(mapTestErrorMessageKey(new LLMError('server', '500')).messageKey).toBe(
      'llmSettings.testFailOther',
    );
    expect(mapTestErrorMessageKey(new Error('boom')).messageKey).toBe(
      'llmSettings.testFailOther',
    );
  });

  it('llmSettings i18n namespace 含必备 key（隐私横幅 / 关闭 aria / 4 个 provider）', () => {
    const ns = translations.llmSettings;
    expect(ns.privacyTitle['zh-CN']).toBeTruthy();
    expect(ns.privacyBody['zh-CN']).toMatch(/session/i);
    expect(ns.closeAria['zh-CN']).toBeTruthy();
    expect(ns.providerLocal['zh-CN']).toBeTruthy();
    expect(ns.providerOpenAI['zh-CN']).toBeTruthy();
    expect(ns.providerAnthropic['zh-CN']).toBeTruthy();
    expect(ns.providerGemini['zh-CN']).toBeTruthy();
    // 测试连接相关 4 个 fail key + ok
    expect(ns.testOk['zh-CN']).toBeTruthy();
    expect(ns.testFailUnauthorized['zh-CN']).toBeTruthy();
    expect(ns.testFailRateLimit['zh-CN']).toBeTruthy();
    expect(ns.testFailNetwork['zh-CN']).toBeTruthy();
    expect(ns.testFailOther['zh-CN']).toBeTruthy();
  });

  it('provider 切换：setProvider 写 store，model 同步重置为该家默认', () => {
    const store = useLLMStore.getState();
    expect(store.provider).toBe('local');

    store.setProvider('openai');
    expect(useLLMStore.getState().provider).toBe('openai');
    // openai 默认模型在 catalog 列表里
    const openaiModels = MODEL_CATALOG.openai.map((m) => m.id);
    expect(openaiModels).toContain(useLLMStore.getState().model);

    store.setProvider('anthropic');
    expect(useLLMStore.getState().provider).toBe('anthropic');
    const anthropicModels = MODEL_CATALOG.anthropic.map((m) => m.id);
    expect(anthropicModels).toContain(useLLMStore.getState().model);

    store.setProvider('gemini');
    expect(useLLMStore.getState().provider).toBe('gemini');
    const geminiModels = MODEL_CATALOG.gemini.map((m) => m.id);
    expect(geminiModels).toContain(useLLMStore.getState().model);

    store.setProvider('local');
    expect(useLLMStore.getState().provider).toBe('local');
  });

  it('API key 写入仅命中 sessionStorage（永不 localStorage）', () => {
    // 用 spy 监控 localStorage.setItem 是否被 llm key 触发
    const localSet = vi.fn();
    vi.stubGlobal('localStorage', {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: localSet,
    } as Storage);

    useLLMStore.getState().setKey('openai', 'sk-test-deadbeef');
    expect(useLLMStore.getState().apiKeys.openai).toBe('sk-test-deadbeef');
    // 任何对 localStorage 的写入都不应包含 llm key
    for (const call of localSet.mock.calls) {
      const [key] = call as [string, string];
      expect(key.startsWith('compbench:llm:key:')).toBe(false);
    }
    // sessionStorage 那侧应该已存了
    expect(sessionStorage.getItem('compbench:llm:key:openai')).toBe('sk-test-deadbeef');
  });

  it('RAG 模式 3 选 1：always / when_relevant / never 都能被 setRagMode 接收', () => {
    const store = useLLMStore.getState();
    store.setRagMode('always');
    expect(useLLMStore.getState().ragMode).toBe('always');
    store.setRagMode('when_relevant');
    expect(useLLMStore.getState().ragMode).toBe('when_relevant');
    store.setRagMode('never');
    expect(useLLMStore.getState().ragMode).toBe('never');
  });

  it('maxTokens 滑块范围 256-4096 被 clamp 函数收紧（store 内 hardware clamp 64-8192）', () => {
    const store = useLLMStore.getState();
    store.setMaxTokens(2048);
    expect(useLLMStore.getState().maxTokens).toBe(2048);
    // store 自身只 clamp 到 [64, 8192]；UI 滑块再 clamp 到 [256, 4096]
    // 此处验证 store 接受 1024 / 4096 / 256 三个 UI 合法值
    for (const v of [256, 1024, 4096]) {
      store.setMaxTokens(v);
      expect(useLLMStore.getState().maxTokens).toBe(v);
    }
  });

  it('clearAll 把所有 key 都清掉、切回 local', () => {
    const store = useLLMStore.getState();
    store.setProvider('openai');
    store.setKey('openai', 'sk-x');
    store.setKey('anthropic', 'sk-ant-y');
    store.setKey('gemini', 'AIza-z');
    store.clearAll();
    const after = useLLMStore.getState();
    expect(after.provider).toBe('local');
    expect(after.apiKeys.openai).toBe('');
    expect(after.apiKeys.anthropic).toBe('');
    expect(after.apiKeys.gemini).toBe('');
  });
});
