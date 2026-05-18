import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 本地教学助手 store —— 对话状态、历史、面板开关。
 *
 * 持久化策略：
 *   - 用 zustand persist → localStorage（与 progressStore / insightsStore 一致）
 *   - 仅 persist `messages`（含 timestamps + citations），不 persist `open`（UI 临时态）
 *   - 上限 50 条，超出按 FIFO 截断（保留最近 50 条；最老的滚出去）
 *   - 用户可主动 `clearMessages()` 一键清空
 *
 * 隐私：所有数据不离开本地，符合"纯前端 / 不调外部 LLM"的设计约束。
 */

export interface AssistantMessage {
  /** 消息唯一 id（用作 React key；非 UUID，单调时间戳 + 短随机即可）*/
  id: string;
  role: 'user' | 'assistant';
  /** 文本内容（assistant 消息可能含 [1][2] 引用记号）*/
  content: string;
  /** assistant 消息可附带引用列表，每条引用是 ragIndex 里的 chunk id */
  citations?: AssistantCitation[];
  /** 时间戳 ms */
  ts: number;
}

export interface AssistantCitation {
  /** 在 ragIndex.chunks 数组里的下标（id），用作跳转锚点 */
  chunkId: number;
  /** chunk 标题快照，避免 persist 后 chunk 序号变了拿不到原题 */
  title: string;
  /** chunk 内容前缀，给 UI hover / tooltip 展示 */
  preview: string;
  /** 可点击跳转的目标 moduleId（null 则不跳，例如 glossary / formula） */
  moduleId?: string | null;
  /** walkthrough 内的 step id，跳转时一并 setWalkthroughStep */
  walkthroughStepId?: string;
}

interface AssistantState {
  /** 浮窗是否打开 */
  open: boolean;
  /** 是否暂时聚焦输入框（外部触发，比如 ConceptNotes 点了"问助手"） */
  pendingDraft: string;
  messages: AssistantMessage[];

  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setPendingDraft: (draft: string) => void;
  consumePendingDraft: () => string;

  pushUser: (content: string) => string;
  pushAssistant: (content: string, citations?: AssistantCitation[]) => string;
  clearMessages: () => void;
}

/** 历史上限；超过按 FIFO 截断 */
export const MESSAGE_LIMIT = 50;

const STORAGE_KEY = 'compressor-bench-assistant';
const SCHEMA_VERSION = 1;

let _seq = 0;
function makeId(): string {
  _seq = (_seq + 1) & 0xffff;
  // 时间戳 36 进制 + 短计数器；不需要密码学随机
  return `${Date.now().toString(36)}-${_seq.toString(36)}`;
}

/** 测试可见：清空 in-memory 状态（不动 localStorage） */
export function _resetAssistantStoreForTests(): void {
  useAssistantStore.setState({
    open: false,
    pendingDraft: '',
    messages: [],
  });
}

export const useAssistantStore = create<AssistantState>()(
  persist(
    (set, get) => ({
      open: false,
      pendingDraft: '',
      messages: [],

      setOpen: (open) => set({ open }),
      toggleOpen: () => set((s) => ({ open: !s.open })),
      setPendingDraft: (draft) => set({ pendingDraft: draft }),
      consumePendingDraft: () => {
        const draft = get().pendingDraft;
        if (draft) set({ pendingDraft: '' });
        return draft;
      },

      pushUser: (content) => {
        const id = makeId();
        const msg: AssistantMessage = { id, role: 'user', content, ts: Date.now() };
        set((s) => ({ messages: capFifo([...s.messages, msg]) }));
        return id;
      },
      pushAssistant: (content, citations) => {
        const id = makeId();
        const msg: AssistantMessage = { id, role: 'assistant', content, citations, ts: Date.now() };
        set((s) => ({ messages: capFifo([...s.messages, msg]) }));
        return id;
      },
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      // 仅持久化历史；open / pendingDraft 是 UI 临时态
      partialize: (state) => ({ messages: state.messages }),
    },
  ),
);

function capFifo(list: AssistantMessage[]): AssistantMessage[] {
  if (list.length <= MESSAGE_LIMIT) return list;
  return list.slice(list.length - MESSAGE_LIMIT);
}
